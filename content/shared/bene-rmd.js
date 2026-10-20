/**
 * Beneficiary IRA RMD calculator for deaths in 2020 and later (SECURE Act).
 * Single Life Table: Treas. Reg. §1.401(a)(9)-9 as updated for distribution
 * years beginning in 2022. Factors are the life expectancy at each age.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.BeneRmd = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  // Age 0 through 120+. Index is the age attained on the birthday in the year.
  const SINGLE_LIFE = [
    84.6, 83.7, 82.8, 81.8, 80.8, 79.8, 78.8, 77.9, 76.9, 75.9,
    74.9, 73.9, 72.9, 71.9, 70.9, 69.9, 69.0, 68.0, 67.0, 66.0,
    65.0, 64.1, 63.1, 62.1, 61.1, 60.2, 59.2, 58.2, 57.3, 56.3,
    55.3, 54.4, 53.4, 52.5, 51.5, 50.5, 49.6, 48.6, 47.7, 46.7,
    45.7, 44.8, 43.8, 42.9, 41.9, 41.0, 40.0, 39.0, 38.1, 37.1,
    36.2, 35.3, 34.3, 33.4, 32.5, 31.6, 30.6, 29.8, 28.9, 28.0,
    27.1, 26.2, 25.4, 24.5, 23.7, 22.9, 22.0, 21.2, 20.4, 19.6,
    18.8, 18.0, 17.2, 16.4, 15.6, 14.8, 14.1, 13.3, 12.6, 11.9,
    11.2, 10.5, 9.9, 9.3, 8.7, 8.1, 7.6, 7.1, 6.6, 6.1,
    5.7, 5.3, 4.9, 4.6, 4.3, 4.0, 3.7, 3.4, 3.2, 3.0,
    2.8, 2.6, 2.5, 2.3, 2.2, 2.1, 2.1, 2.1, 2.0, 2.0,
    2.0, 2.0, 2.0, 1.9, 1.9, 1.8, 1.8, 1.6, 1.4, 1.1,
    1.0,
  ];

  const TYPES = { spouse: true, child: true, other: true };

  function round1(value) {
    return Math.round(value * 10 + 1e-8) / 10;
  }

  function roundCents(value) {
    return Math.round(value * 100 + 1e-8) / 100;
  }

  function shownFactor(value) {
    if (!Number.isFinite(value)) return "—";
    return (value > 0 ? value : 0).toFixed(1);
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

  function dateParts(iso) {
    const [year, month, day] = iso.split("-").map(Number);
    return { year, month, day };
  }

  function formatIso(year, month, day) {
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCMonth() !== month - 1) {
      const last = new Date(Date.UTC(year, month, 0));
      return formatIso(last.getUTCFullYear(), last.getUTCMonth() + 1, last.getUTCDate());
    }
    const monthText = String(date.getUTCMonth() + 1).padStart(2, "0");
    const dayText = String(date.getUTCDate()).padStart(2, "0");
    return `${date.getUTCFullYear()}-${monthText}-${dayText}`;
  }

  function addYears(iso, years) {
    const parts = dateParts(iso);
    return formatIso(parts.year + years, parts.month, parts.day);
  }

  function addMonths(iso, months) {
    const parts = dateParts(iso);
    const date = new Date(Date.UTC(parts.year, parts.month - 1 + months, parts.day));
    if (date.getUTCDate() !== parts.day) {
      const last = new Date(Date.UTC(parts.year, parts.month + months, 0));
      return formatIso(last.getUTCFullYear(), last.getUTCMonth() + 1, last.getUTCDate());
    }
    return formatIso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }

  function yearOf(iso) {
    return dateParts(iso).year;
  }

  function ageInYear(dob, year) {
    return year - yearOf(dob);
  }

  function singleLifeFactor(age) {
    if (!Number.isFinite(age)) return null;
    const whole = Math.floor(age);
    if (whole < 0) return null;
    if (whole >= 120) return SINGLE_LIFE[120];
    return SINGLE_LIFE[whole];
  }

  function rmdAgeForDob(dob) {
    if (!isIsoDate(dob)) return null;
    if (dob <= "1949-06-30") {
      return { age: 70.5, label: "70½" };
    }
    if (dob <= "1950-12-31") {
      return { age: 72, label: "72" };
    }
    if (dob <= "1959-12-31") {
      return { age: 73, label: "73" };
    }
    return { age: 75, label: "75" };
  }

  function requiredBeginningDate(dob) {
    const rmdAge = rmdAgeForDob(dob);
    if (!rmdAge) return null;
    let attainmentYear;
    let halfBirthday = null;
    if (rmdAge.age === 70.5) {
      halfBirthday = addMonths(addYears(dob, 70), 6);
      attainmentYear = yearOf(halfBirthday);
    } else {
      attainmentYear = yearOf(dob) + rmdAge.age;
    }
    const rbdYear = attainmentYear + 1;
    return {
      rmdAge: rmdAge.age,
      rmdAgeLabel: rmdAge.label,
      attainmentYear,
      halfBirthday,
      rbdYear,
      rbd: `${rbdYear}-04-01`,
    };
  }

  function deriveOwnerRmdStatus(ownerDob, ownerDeath) {
    if (!isIsoDate(ownerDob) || !isIsoDate(ownerDeath)) {
      return {
        ok: false,
        hint: "Enter the owner's date of birth and date of death to derive whether RMDs had started.",
      };
    }
    if (ownerDeath < ownerDob) {
      return { ok: false, hint: "Date of death is before the owner's date of birth." };
    }
    const beginning = requiredBeginningDate(ownerDob);
    const diedOnOrAfterRbd = ownerDeath >= beginning.rbd;
    const deathYear = yearOf(ownerDeath);
    const when = diedOnOrAfterRbd ? "on or after" : "before";
    const answer = diedOnOrAfterRbd ? "Yes" : "No";
    let hint =
      `RMD age ${beginning.rmdAgeLabel} under SECURE 2.0. ` +
      `Required beginning date is April 1, ${beginning.rbdYear}, ` +
      `the year after the owner reaches that age in ${beginning.attainmentYear}. ` +
      `Date of death is ${when} that date, so the derived answer is ${answer}.`;
    if (!diedOnOrAfterRbd && deathYear >= beginning.attainmentYear) {
      hint +=
        " The owner died in or after the first RMD year but before the required beginning date, so an RMD was not yet required.";
    }
    return {
      ok: true,
      rmdAge: beginning.rmdAge,
      rmdAgeLabel: beginning.rmdAgeLabel,
      attainmentYear: beginning.attainmentYear,
      rbdYear: beginning.rbdYear,
      rbd: beginning.rbd,
      deathYear,
      diedOnOrAfterRbd,
      suggestedStarted: diedOnOrAfterRbd,
      hint,
    };
  }

  function isNotMoreThan10YearsYounger(ownerDob, beneficiaryDob) {
    return beneficiaryDob <= addYears(ownerDob, 10);
  }

  function isMinorChildOn(beneficiaryDob, onDate) {
    return onDate < addYears(beneficiaryDob, 21);
  }

  function validate(input) {
    const errors = [];
    if (!input || typeof input !== "object") {
      return ["Enter the owner, beneficiary, balance, and calculation year."];
    }
    if (!isIsoDate(input.ownerDob)) errors.push("Enter the owner's date of birth.");
    if (!isIsoDate(input.ownerDeath)) errors.push("Enter the owner's date of death.");
    if (isIsoDate(input.ownerDob) && isIsoDate(input.ownerDeath) && input.ownerDeath < input.ownerDob) {
      errors.push("Date of death is before the owner's date of birth.");
    }
    if (isIsoDate(input.ownerDeath) && yearOf(input.ownerDeath) < 2020) {
      errors.push(
        "This calculator covers deaths in 2020 and later (SECURE Act). It does not apply the pre-2020 stretch rules.",
      );
    }
    if (!TYPES[input.beneficiaryType]) {
      errors.push("Choose a beneficiary type: spouse, child, or other.");
    }
    if (!isIsoDate(input.beneficiaryDob)) errors.push("Enter the beneficiary's date of birth.");
    if (typeof input.beneficiaryDisabled !== "boolean") {
      errors.push("Say whether the beneficiary is disabled or chronically ill.");
    }
    if (typeof input.ownerStartedRmds !== "boolean") {
      errors.push("Say whether the owner had started RMDs.");
    }
    const year = input.calculationYear;
    if (!Number.isInteger(year) || year < 2020 || year > 2200) {
      errors.push("Enter a calculation year from 2020 through 2200.");
    }
    if (!Number.isFinite(input.priorYearEndBalance) || input.priorYearEndBalance < 0) {
      errors.push("Enter the prior December 31 balance as a zero or positive amount.");
    }
    if (
      isIsoDate(input.ownerDeath) &&
      Number.isInteger(year) &&
      year < yearOf(input.ownerDeath)
    ) {
      errors.push("Calculation year is before the year of death.");
    }
    if (
      isIsoDate(input.beneficiaryDob) &&
      isIsoDate(input.ownerDeath) &&
      Number.isInteger(year) &&
      year > yearOf(input.ownerDeath) &&
      ageInYear(input.beneficiaryDob, yearOf(input.ownerDeath) + 1) < 0
    ) {
      errors.push(
        "The beneficiary was not yet born in the year after death, so a life-expectancy factor cannot be determined.",
      );
    }
    return errors;
  }

  function edbProfile(input) {
    const reasons = [];
    if (input.beneficiaryType === "spouse") reasons.push("spouse");
    if (input.beneficiaryDisabled) reasons.push("disabled");
    if (isNotMoreThan10YearsYounger(input.ownerDob, input.beneficiaryDob)) {
      reasons.push("within-10-years");
    }
    if (input.beneficiaryType === "child" && isMinorChildOn(input.beneficiaryDob, input.ownerDeath)) {
      reasons.push("minor-child");
    }
    return {
      reasons,
      isSpouse: reasons.includes("spouse"),
      isDisabled: reasons.includes("disabled"),
      within10: reasons.includes("within-10-years"),
      isMinor: reasons.includes("minor-child"),
      isEdb: reasons.length > 0,
    };
  }

  function lifeExpectancyAt(input, year, useOwner) {
    const deathYear = yearOf(input.ownerDeath);
    const elapsed = year - (deathYear + 1);
    const beneficiaryAge = ageInYear(input.beneficiaryDob, deathYear + 1);
    const beneficiaryInitial = singleLifeFactor(beneficiaryAge);
    const beneficiaryFactor = round1(beneficiaryInitial - elapsed);
    const ownerAge = ageInYear(input.ownerDob, deathYear);
    const ownerInitial = singleLifeFactor(ownerAge);
    const ownerFactor = round1(ownerInitial - 1 - elapsed);
    let factor = beneficiaryFactor;
    let source = "beneficiary";
    if (useOwner && ownerFactor > beneficiaryFactor) {
      factor = ownerFactor;
      source = "owner";
    }
    return {
      elapsed,
      beneficiaryAge,
      beneficiaryInitial,
      beneficiaryFactor,
      ownerAge,
      ownerInitial,
      ownerFactor,
      factor,
      source,
    };
  }

  function spouseFactorAt(input, year) {
    const age = ageInYear(input.beneficiaryDob, year);
    return { age, factor: singleLifeFactor(age), source: "spouse" };
  }

  function rowForAmounts(year, calculationYear, balance, factor, source, distribution, basis) {
    const isCalculationYear = year === calculationYear;
    let rmd = null;
    if (isCalculationYear) {
      if (distribution === "rmd") rmd = roundCents(balance / factor);
      else if (distribution === "full") rmd = roundCents(balance);
      else rmd = 0;
    }
    return {
      year,
      factor: distribution === "none" || distribution === "delayed" ? null : factor,
      beneficiaryFactor: null,
      ownerFactor: null,
      source,
      distribution,
      basis,
      isCalculationYear,
      rmd,
    };
  }

  function scheduleLife(input, options) {
    const deathYear = yearOf(input.ownerDeath);
    const start = deathYear + 1;
    const hardEnd = options.emptyYear || start + 100;
    const rows = [];
    for (let year = start; year <= hardEnd; year += 1) {
      const current = lifeExpectancyAt(input, year, options.useLongerOf);
      const isFinal = options.emptyYear != null && year === options.emptyYear;
      let distribution = "rmd";
      let basis;
      if (current.source === "owner") {
        basis = `Owner's remaining life expectancy (longer): ${shownFactor(current.ownerFactor)} vs beneficiary ${shownFactor(current.beneficiaryFactor)}`;
      } else if (options.useLongerOf) {
        basis = `Beneficiary's life expectancy (longer): ${shownFactor(current.beneficiaryFactor)} vs owner ${shownFactor(current.ownerFactor)}`;
      } else {
        basis = `Beneficiary's life expectancy, age ${current.beneficiaryAge} in ${deathYear + 1}, reduced by 1 each year`;
      }
      if (isFinal || current.factor <= 1) {
        distribution = "full";
        basis = isFinal
          ? `Entire balance is due this year. Life-expectancy factor would be ${shownFactor(current.factor)}.`
          : "Life expectancy divisor is 1.0 or less, so the entire balance is due.";
      }
      const row = rowForAmounts(
        year,
        input.calculationYear,
        input.priorYearEndBalance,
        current.factor,
        current.source,
        distribution,
        basis,
      );
      row.beneficiaryFactor = current.beneficiaryFactor;
      row.ownerFactor = current.ownerFactor;
      row.factor = current.factor;
      rows.push(row);
      if (distribution === "full") break;
    }
    return rows;
  }

  function scheduleTenYearOnly(input, emptyYear) {
    const deathYear = yearOf(input.ownerDeath);
    const rows = [];
    for (let year = deathYear + 1; year <= emptyYear; year += 1) {
      const isFinal = year === emptyYear;
      rows.push(
        rowForAmounts(
          year,
          input.calculationYear,
          input.priorYearEndBalance,
          null,
          null,
          isFinal ? "full" : "none",
          isFinal
            ? "10th year: the entire remaining balance is due. No annual RMD before this year."
            : "No annual RMD. The 10-year rule only requires the account to be empty by the final year.",
        ),
      );
    }
    return rows;
  }

  function scheduleSpouse(input, firstYear, lastYear) {
    const deathYear = yearOf(input.ownerDeath);
    const rows = [];
    const end = Math.max(lastYear, input.calculationYear, firstYear);
    const cap = Math.min(end, yearOf(input.beneficiaryDob) + 120);
    for (let year = deathYear + 1; year <= cap; year += 1) {
      if (year < firstYear) {
        rows.push(
          rowForAmounts(
            year,
            input.calculationYear,
            input.priorYearEndBalance,
            null,
            "spouse",
            "delayed",
            "Delayed. Spouse inherited RMDs have not started.",
          ),
        );
        continue;
      }
      const current = spouseFactorAt(input, year);
      let distribution = current.factor <= 1 ? "full" : "rmd";
      const basis =
        distribution === "full"
          ? "Single Life divisor is 1.0 or less, so the entire balance is due. Recalculated from the spouse's age."
          : `Spouse age ${current.age} in ${year}. Single Life factor recalculated (not reduced by 1).`;
      const row = rowForAmounts(
        year,
        input.calculationYear,
        input.priorYearEndBalance,
        current.factor,
        "spouse",
        distribution,
        basis,
      );
      row.factor = current.factor;
      rows.push(row);
      if (distribution === "full") break;
    }
    return rows;
  }

  function treatAsOwnNote(input) {
    const beginning = requiredBeginningDate(input.beneficiaryDob);
    const spouseAgeThisYear = ageInYear(input.beneficiaryDob, input.calculationYear);
    return {
      note:
        "Treat as the spouse's own IRA: RMDs use the IRS Uniform Lifetime Table starting at the spouse's own required beginning date. " +
        `The spouse reaches RMD age ${beginning.rmdAgeLabel} in ${beginning.attainmentYear}. ` +
        `Their own required beginning date is April 1, ${beginning.rbdYear}. ` +
        `In ${input.calculationYear} the spouse's age is ${spouseAgeThisYear}. ` +
        "This calculator does not compute Uniform Lifetime amounts.",
      rmdAgeLabel: beginning.rmdAgeLabel,
      attainmentYear: beginning.attainmentYear,
      rbd: beginning.rbd,
      rbdYear: beginning.rbdYear,
      ageInCalculationYear: spouseAgeThisYear,
      alreadyPastRbd: input.calculationYear > beginning.rbdYear,
    };
  }

  function yearOfDeathNote(input, started) {
    if (!started) return null;
    const deathYear = yearOf(input.ownerDeath);
    const relief =
      deathYear >= 2020 && deathYear <= 2024
        ? " IRS Notices 2022-53, 2023-54, and 2024-35 waived the excise tax for certain missed beneficiary RMDs in specified years; confirm with a tax advisor whether any relief still applies."
        : "";
    const computed =
      " That amount is the owner's own RMD and is not computed here.";
    if (input.calculationYear < deathYear) return null;
    return (
      `The owner's year-of-death RMD may not have been taken. The beneficiary must take it by December 31, ${deathYear}.` +
      computed +
      relief
    );
  }

  function pickThisYear(rows, input, kindOverride) {
    const deathYear = yearOf(input.ownerDeath);
    if (input.calculationYear === deathYear) {
      return {
        year: input.calculationYear,
        factor: null,
        factorSource: null,
        rmd: null,
        rmdKind: "year-of-death",
        deadline: `${deathYear}-12-31`,
      };
    }
    const row = rows.find((item) => item.year === input.calculationYear);
    if (!row) {
      return {
        year: input.calculationYear,
        factor: null,
        factorSource: null,
        rmd: roundCents(input.priorYearEndBalance),
        rmdKind: "overdue",
        deadline: `${input.calculationYear}-12-31`,
      };
    }
    let rmdKind = row.distribution === "rmd" ? "amount" : row.distribution;
    if (kindOverride) rmdKind = kindOverride;
    return {
      year: input.calculationYear,
      factor: row.factor,
      factorSource: row.source,
      rmd: row.rmd,
      rmdKind,
      deadline: `${input.calculationYear}-12-31`,
      basis: row.basis,
      beneficiaryFactor: row.beneficiaryFactor,
      ownerFactor: row.ownerFactor,
    };
  }

  function calculateBeneficiaryRmd(input) {
    const errors = validate(input);
    if (errors.length) return { ok: false, errors };

    const derived = deriveOwnerRmdStatus(input.ownerDob, input.ownerDeath);
    const started = input.ownerStartedRmds;
    const profile = edbProfile(input);
    const deathYear = yearOf(input.ownerDeath);
    const balance = input.priorYearEndBalance;
    const notes = [];
    if (started !== derived.diedOnOrAfterRbd) {
      notes.push(
        "The Yes/No answer for whether the owner had started RMDs does not match the date-based required beginning date. This result follows the Yes/No answer.",
      );
    }
    const deathNote = yearOfDeathNote(input, started);
    if (deathNote) notes.push(deathNote);

    const lifetimeEdb = !profile.isSpouse && (profile.isDisabled || profile.within10);
    const minorOnly = !profile.isSpouse && !lifetimeEdb && profile.isMinor;
    let appliedRule;
    let schedule;
    let emptyByYear = null;
    let rule;
    let useLongerOf = false;

    if (profile.isSpouse) {
      appliedRule = "spouse";
      const ownerBeginning = requiredBeginningDate(input.ownerDob);
      const firstYear = started
        ? deathYear + 1
        : Math.max(deathYear + 1, ownerBeginning.attainmentYear);
      const lastYear = yearOf(input.beneficiaryDob) + 120;
      schedule = scheduleSpouse(input, firstYear, Math.min(lastYear, Math.max(firstYear + 40, input.calculationYear + 5)));
      // Spouse recalculation can run past the 40-year display window. Extend
      // through the calculation year and through divisor exhaustion up to age 120.
      if (input.calculationYear > schedule[schedule.length - 1].year) {
        schedule = scheduleSpouse(input, firstYear, input.calculationYear);
      }
      const delayText = started
        ? `The owner died on or after the required beginning date, so inherited RMDs start in ${deathYear + 1}.`
        : `The owner died before the required beginning date (April 1, ${ownerBeginning.rbdYear}). Inherited RMDs may be delayed until December 31, ${ownerBeginning.attainmentYear}, the year the owner would have reached RMD age ${ownerBeginning.rmdAgeLabel}.`;
      rule =
        "Eligible designated beneficiary: surviving spouse. Two choices are shown. " +
        "Inherited IRA: recalculate the Single Life factor each year from the spouse's age that year. " +
        delayText +
        " Treat as own: RMDs would use the Uniform Lifetime Table from the spouse's own required beginning date, which is noted separately and not calculated here.";
      if (!started && input.calculationYear < firstYear && input.calculationYear > deathYear) {
        notes.push(
          `No inherited RMD is due for ${input.calculationYear}. The first inherited distribution year is ${firstYear}, due December 31, ${firstYear}.`,
        );
      }
      notes.push(
        "Most IRA documents pay an eligible designated beneficiary under the life-expectancy method unless the 10-year rule is elected. An election may be available when the owner died before the required beginning date. This result shows the life-expectancy method.",
      );
    } else if (lifetimeEdb || minorOnly) {
      useLongerOf = started;
      if (minorOnly) {
        appliedRule = "edb-minor";
        const majorityYear = yearOf(input.beneficiaryDob) + 21;
        emptyByYear = majorityYear + 10;
        schedule = scheduleLife(input, { useLongerOf, emptyYear: emptyByYear });
        const anchor = lifeExpectancyAt(input, deathYear + 1, false);
        rule =
          `Eligible designated beneficiary: minor child of the owner (under 21 on the date of death). ` +
          `Life expectancy uses the child's Single Life factor at age ${anchor.beneficiaryAge} in ${deathYear + 1} ` +
          `(${anchor.beneficiaryInitial.toFixed(1)}), reduced by 1 each year. ` +
          `Stretch payments run through the year the child turns 21 (${majorityYear}). ` +
          `The 10-year rule then applies, and the account must be emptied by December 31, ${emptyByYear}. ` +
          `Annual life-expectancy RMDs continue during that 10-year period. The final year requires the entire remaining balance.`;
        notes.push(
          `Minor child: the 10-year clock starts in ${majorityYear}, the year the child turns 21, rather than in the year of death. Empty the account by December 31, ${emptyByYear}.`,
        );
      } else {
        appliedRule = "edb-life";
        schedule = scheduleLife(input, { useLongerOf, emptyYear: null });
        const reasonText = [];
        if (profile.isDisabled) reasonText.push("disabled or chronically ill");
        if (profile.within10) reasonText.push("not more than 10 years younger than the owner");
        const anchor = lifeExpectancyAt(input, deathYear + 1, useLongerOf);
        const method = useLongerOf
          ? "Because the owner died on or after the required beginning date, the divisor each year is the longer of the beneficiary's life expectancy and the owner's remaining life expectancy."
          : "The owner died before the required beginning date, so the divisor is the beneficiary's life expectancy only.";
        rule =
          `Eligible designated beneficiary: ${reasonText.join(" and ")}. ` +
          `The beneficiary's Single Life factor is ${anchor.beneficiaryInitial.toFixed(1)} at age ${anchor.beneficiaryAge} in ${deathYear + 1}, reduced by 1 each year. ` +
          method +
          " There is no 10-year deadline.";
        if (profile.isMinor && profile.isDisabled) {
          notes.push(
            "This child was also under 21 at the owner's death. Disability status continues the life-expectancy stretch after age 21, so the minor-child 10-year clock does not apply.",
          );
        } else if (profile.isMinor && profile.within10) {
          notes.push(
            "This child was also under 21 at the owner's death. Because the child is not more than 10 years younger than the owner, the life-expectancy stretch continues after age 21.",
          );
        }
        notes.push(
          "Most IRA documents pay an eligible designated beneficiary under the life-expectancy method unless the 10-year rule is elected. An election may be available when the owner died before the required beginning date. This result shows the life-expectancy method.",
        );
      }
      if (useLongerOf) {
        const current = lifeExpectancyAt(input, Math.max(input.calculationYear, deathYear + 1), true);
        if (input.calculationYear > deathYear) {
          if (current.source === "owner") {
            notes.push(
              `For ${input.calculationYear}, the owner's remaining life expectancy (${shownFactor(current.ownerFactor)}) is longer than the beneficiary's (${shownFactor(current.beneficiaryFactor)}), so the owner's factor is used.`,
            );
          } else {
            notes.push(
              `For ${input.calculationYear}, the beneficiary's life expectancy (${shownFactor(current.beneficiaryFactor)}) is longer than or equal to the owner's remaining life expectancy (${shownFactor(current.ownerFactor)}).`,
            );
          }
        }
      }
    } else {
      appliedRule = "non-edb-10-year";
      emptyByYear = deathYear + 10;
      if (started) {
        useLongerOf = true;
        schedule = scheduleLife(input, { useLongerOf: true, emptyYear: emptyByYear });
        const anchor = lifeExpectancyAt(input, deathYear + 1, true);
        rule =
          `Not an eligible designated beneficiary. The owner died on or after the required beginning date, so annual RMDs are required in years 1 through 9 after death, and the account must be fully distributed by December 31, ${emptyByYear}. ` +
          `Each year's divisor is the longer of the beneficiary's life expectancy (Single Life factor ${anchor.beneficiaryInitial.toFixed(1)} at age ${anchor.beneficiaryAge} in ${deathYear + 1}, reduced by 1 each year) ` +
          `and the owner's remaining life expectancy (Single Life factor ${anchor.ownerInitial.toFixed(1)} at age ${anchor.ownerAge} in ${deathYear}, reduced by 1 starting in ${deathYear + 1}).`;
      } else {
        schedule = scheduleTenYearOnly(input, emptyByYear);
        rule =
          `Not an eligible designated beneficiary. The owner died before the required beginning date (April 1, ${derived.rbdYear}), so no annual RMDs are required. ` +
          `The account must be fully distributed by December 31, ${emptyByYear}, the 10th year after death.`;
      }
    }

    const thisYear = pickThisYear(schedule, input);
    if (thisYear.rmdKind === "overdue" && emptyByYear) {
      notes.push(
        `The account was required to be empty by December 31, ${emptyByYear}. Any balance still left in ${input.calculationYear} is overdue. The figure shown is the entire prior December 31 balance.`,
      );
    } else if (thisYear.rmdKind === "overdue") {
      notes.push(
        `The life-expectancy divisor reached 1.0 or less before ${input.calculationYear}. Any balance still left is overdue. The figure shown is the entire prior December 31 balance.`,
      );
    }

    const calcRow = schedule.find((item) => item.year === input.calculationYear) || null;

    return {
      ok: true,
      appliedRule,
      edb: profile.isEdb,
      edbReasons: profile.reasons,
      ownerStartedRmds: started,
      diedOnOrAfterRbd: derived.diedOnOrAfterRbd,
      derived,
      useLongerOf,
      deathYear,
      yearAfterDeath: deathYear + 1,
      calculationYear: input.calculationYear,
      balance: roundCents(balance),
      balanceDate: `${input.calculationYear - 1}-12-31`,
      rule,
      notes,
      emptyByYear,
      emptyByDate: emptyByYear ? `${emptyByYear}-12-31` : null,
      thisYear,
      factor: thisYear.factor,
      factorSource: thisYear.factorSource,
      rmd: thisYear.rmd,
      rmdKind: thisYear.rmdKind,
      deadline: thisYear.deadline,
      schedule,
      calculationRow: calcRow,
      spouseTreatAsOwn: profile.isSpouse ? treatAsOwnNote(input) : null,
    };
  }

  return {
    SINGLE_LIFE,
    singleLifeFactor,
    rmdAgeForDob,
    requiredBeginningDate,
    deriveOwnerRmdStatus,
    isNotMoreThan10YearsYounger,
    isMinorChildOn,
    calculateBeneficiaryRmd,
    roundCents,
  };
});
