/**
 * Traditional IRA owner RMD calculator (account owner, not a beneficiary).
 * Uniform Lifetime Table: Treas. Reg. §1.401(a)(9)-9, Table III in IRS
 * Publication 590-B, for distribution calendar years beginning in 2022.
 * Applicable age under SECURE 2.0 as used here: 72 if born in 1950 or earlier,
 * 73 if born 1951–1959, and 75 if born in 1960 or later.
 * Age is the age attained on December 31 of the distribution year.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.OwnerRmd = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  // Age 72 through 120. Age 120 and older uses 2.0.
  const UNIFORM_LIFETIME = {
    72: 27.4,
    73: 26.5,
    74: 25.5,
    75: 24.6,
    76: 23.7,
    77: 22.9,
    78: 22.0,
    79: 21.1,
    80: 20.2,
    81: 19.4,
    82: 18.5,
    83: 17.7,
    84: 16.8,
    85: 16.0,
    86: 15.2,
    87: 14.4,
    88: 13.7,
    89: 12.9,
    90: 12.2,
    91: 11.5,
    92: 10.8,
    93: 10.1,
    94: 9.5,
    95: 8.9,
    96: 8.4,
    97: 7.8,
    98: 7.3,
    99: 6.8,
    100: 6.4,
    101: 6.0,
    102: 5.6,
    103: 5.2,
    104: 4.9,
    105: 4.6,
    106: 4.3,
    107: 4.1,
    108: 3.9,
    109: 3.7,
    110: 3.5,
    111: 3.4,
    112: 3.3,
    113: 3.1,
    114: 3.0,
    115: 2.9,
    116: 2.8,
    117: 2.7,
    118: 2.5,
    119: 2.3,
    120: 2.0,
  };

  const NOTE =
    "Uses the IRS Uniform Lifetime Table. If the sole beneficiary is a spouse more than 10 years younger, the Joint and Last Survivor Table applies and the RMD will be lower.";

  function roundCents(value) {
    return Math.round(value * 100 + 1e-8) / 100;
  }

  function isIsoDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }

  function yearOf(iso) {
    return Number(iso.slice(0, 4));
  }

  function uniformLifetimeFactor(age) {
    if (!Number.isFinite(age)) return null;
    const whole = Math.floor(age);
    if (whole < 72) return null;
    if (whole >= 120) return UNIFORM_LIFETIME[120];
    return UNIFORM_LIFETIME[whole];
  }

  function rmdStartAge(dob) {
    if (!isIsoDate(dob)) return null;
    const birthYear = yearOf(dob);
    if (birthYear <= 1950) return 72;
    if (birthYear <= 1959) return 73;
    return 75;
  }

  function calculateOwnerRmd(input) {
    const errors = [];
    if (!input || typeof input !== "object") {
      return { ok: false, errors: ["Enter the owner's date of birth, balance, and distribution year."] };
    }
    if (!isIsoDate(input.ownerDob)) errors.push("Enter the owner's date of birth.");
    const year = input.distributionYear;
    if (!Number.isInteger(year) || year < 1900 || year > 2300) {
      errors.push("Enter a distribution year from 1900 through 2300.");
    }
    if (!Number.isFinite(input.priorYearEndBalance) || input.priorYearEndBalance < 0) {
      errors.push("Enter the prior December 31 balance as a zero or positive amount.");
    }
    if (errors.length) return { ok: false, errors };

    const birthYear = yearOf(input.ownerDob);
    if (year < birthYear) {
      return { ok: false, errors: ["Distribution year is before the owner's year of birth."] };
    }

    const age = year - birthYear;
    const startAge = rmdStartAge(input.ownerDob);
    const firstRmdYear = birthYear + startAge;
    const april1Deadline = `${firstRmdYear + 1}-04-01`;
    const balance = roundCents(input.priorYearEndBalance);
    const base = {
      ok: true,
      age,
      rmdStartAge: startAge,
      firstRmdYear,
      april1Deadline,
      distributionYear: year,
      balance,
      balanceDate: `${year - 1}-12-31`,
      note: NOTE,
      table: "Uniform Lifetime",
    };

    if (year < firstRmdYear) {
      return {
        ...base,
        rmdRequired: false,
        message: `RMDs start in ${firstRmdYear}`,
        factor: null,
        rmd: null,
        deadline: april1Deadline,
        delayAvailable: false,
        delayFirst: false,
        warning: null,
      };
    }

    const factor = uniformLifetimeFactor(age);
    const isFirst = year === firstRmdYear;
    const delayFirst = isFirst && input.delayFirst === true;
    const deadline = delayFirst ? april1Deadline : `${year}-12-31`;
    let warning = null;
    if (isFirst && delayFirst) {
      warning =
        `Deadline is April 1, ${year + 1}. Two RMDs will land in the ${year + 1} tax year: ` +
        `this delayed first RMD, and the ${year + 1} RMD due December 31, ${year + 1}.`;
    } else if (isFirst) {
      warning =
        `This is the first RMD year. It may be delayed to April 1, ${year + 1}. ` +
        `Delaying means two RMDs will land in the ${year + 1} tax year.`;
    }

    return {
      ...base,
      rmdRequired: true,
      message: null,
      factor,
      rmd: roundCents(balance / factor),
      deadline,
      delayAvailable: isFirst,
      delayFirst,
      warning,
    };
  }

  return {
    UNIFORM_LIFETIME,
    NOTE,
    uniformLifetimeFactor,
    rmdStartAge,
    calculateOwnerRmd,
    roundCents,
  };
});
