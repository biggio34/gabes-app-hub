const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const BeneRmd = require("./bene-rmd.js");

function calc(overrides) {
  return BeneRmd.calculateBeneficiaryRmd({
    ownerStartedRmds: false,
    beneficiaryType: "other",
    beneficiaryDisabled: false,
    priorYearEndBalance: 10000,
    calculationYear: 2026,
    ...overrides,
  });
}

describe("Single Life Table and RMD age", () => {
  it("embeds the 2022 Single Life Table, including the Schwab age-68 factor", () => {
    assert.equal(BeneRmd.SINGLE_LIFE.length, 121);
    assert.equal(BeneRmd.singleLifeFactor(0), 84.6);
    assert.equal(BeneRmd.singleLifeFactor(10), 74.9);
    assert.equal(BeneRmd.singleLifeFactor(45), 41.0);
    assert.equal(BeneRmd.singleLifeFactor(60), 27.1);
    assert.equal(BeneRmd.singleLifeFactor(68), 20.4);
    assert.equal(BeneRmd.singleLifeFactor(74), 15.6);
    assert.equal(BeneRmd.singleLifeFactor(76), 14.1);
    assert.equal(BeneRmd.singleLifeFactor(85), 8.1);
    assert.equal(BeneRmd.singleLifeFactor(99), 3.0);
    assert.equal(BeneRmd.singleLifeFactor(120), 1.0);
    assert.equal(BeneRmd.singleLifeFactor(130), 1.0);
  });

  it("derives SECURE 2.0 RMD age and the April 1 required beginning date", () => {
    assert.equal(BeneRmd.rmdAgeForDob("1949-06-30").label, "70½");
    assert.equal(BeneRmd.rmdAgeForDob("1949-07-01").label, "72");
    assert.equal(BeneRmd.rmdAgeForDob("1950-12-31").label, "72");
    assert.equal(BeneRmd.rmdAgeForDob("1951-01-01").label, "73");
    assert.equal(BeneRmd.rmdAgeForDob("1959-12-31").label, "73");
    assert.equal(BeneRmd.rmdAgeForDob("1960-01-01").label, "75");

    const early = BeneRmd.requiredBeginningDate("1925-01-15");
    assert.equal(early.rmdAgeLabel, "70½");
    assert.equal(early.attainmentYear, 1995);
    assert.equal(early.rbd, "1996-04-01");

    const crossesYear = BeneRmd.requiredBeginningDate("1948-08-01");
    assert.equal(crossesYear.halfBirthday, "2019-02-01");
    assert.equal(crossesYear.attainmentYear, 2019);
    assert.equal(crossesYear.rbd, "2020-04-01");

    const age73 = BeneRmd.requiredBeginningDate("1957-01-01");
    assert.equal(age73.attainmentYear, 2030);
    assert.equal(age73.rbd, "2031-04-01");

    const started = BeneRmd.deriveOwnerRmdStatus("1925-01-15", "2024-11-08");
    assert.equal(started.suggestedStarted, true);
    assert.match(started.hint, /April 1, 1996/);
    assert.match(started.hint, /derived answer is Yes/);

    const notStarted = BeneRmd.deriveOwnerRmdStatus("1965-04-02", "2030-05-01");
    assert.equal(notStarted.rmdAgeLabel, "75");
    assert.equal(notStarted.rbd, "2041-04-01");
    assert.equal(notStarted.suggestedStarted, false);
  });
});

describe("beneficiary IRA RMDs", () => {
  it("matches the Schwab case: adult child, factor 19.4, RMD $581.59, empty by 2034", () => {
    const result = calc({
      ownerDob: "1925-01-15",
      ownerDeath: "2024-11-08",
      ownerStartedRmds: true,
      beneficiaryType: "child",
      beneficiaryDob: "1957-01-06",
      beneficiaryDisabled: false,
      priorYearEndBalance: 11282.85,
      calculationYear: 2026,
    });

    assert.equal(result.ok, true);
    assert.equal(result.edb, false);
    assert.deepEqual(result.edbReasons, []);
    assert.equal(result.appliedRule, "non-edb-10-year");
    assert.equal(result.factor, 19.4);
    assert.equal(result.factorSource, "beneficiary");
    assert.equal(result.rmd, 581.59);
    assert.equal(result.rmdKind, "amount");
    assert.equal(result.deadline, "2026-12-31");
    assert.equal(result.emptyByYear, 2034);
    assert.equal(result.emptyByDate, "2034-12-31");
    assert.match(result.rule, /Not an eligible designated beneficiary/);
    assert.match(result.rule, /December 31, 2034/);
    assert.match(result.notes.join(" "), /beneficiary must take it by December 31, 2024/);

    const year2025 = result.schedule.find((row) => row.year === 2025);
    const year2026 = result.schedule.find((row) => row.year === 2026);
    const year2034 = result.schedule.find((row) => row.year === 2034);
    assert.equal(year2025.beneficiaryFactor, 20.4);
    assert.equal(year2025.ownerFactor, 2.0);
    assert.equal(year2025.factor, 20.4);
    assert.equal(year2026.factor, 19.4);
    assert.equal(year2026.ownerFactor, 1.0);
    assert.equal(year2026.rmd, 581.59);
    assert.equal(year2026.distribution, "rmd");
    assert.equal(year2034.distribution, "full");
    assert.equal(result.schedule.length, 10);
    assert.equal(result.schedule.filter((row) => row.rmd != null).length, 1);
  });

  it("requires no annual RMD when a non-EDB inherits before the owner's RBD", () => {
    const result = calc({
      ownerDob: "1965-04-02",
      ownerDeath: "2030-05-01",
      ownerStartedRmds: false,
      beneficiaryType: "child",
      beneficiaryDob: "1990-06-15",
      priorYearEndBalance: 100000,
      calculationYear: 2031,
    });

    assert.equal(result.ok, true);
    assert.equal(result.edb, false);
    assert.equal(result.appliedRule, "non-edb-10-year");
    assert.equal(result.rmdKind, "none");
    assert.equal(result.rmd, 0);
    assert.equal(result.factor, null);
    assert.equal(result.emptyByYear, 2040);
    assert.equal(result.deadline, "2031-12-31");
    assert.match(result.rule, /no annual RMDs/i);
    assert.match(result.rule, /December 31, 2040/);
    assert.equal(result.notes.some((note) => /year-of-death RMD/.test(note)), false);

    const finalYear = result.schedule.find((row) => row.year === 2040);
    const firstYear = result.schedule.find((row) => row.year === 2031);
    assert.equal(firstYear.distribution, "none");
    assert.equal(finalYear.distribution, "full");
    assert.equal(result.schedule.filter((row) => row.distribution === "none").length, 9);
  });

  it("shows both spouse choices and delays inherited RMDs until the owner would have reached RMD age", () => {
    const delayed = calc({
      ownerDob: "1957-01-01",
      ownerDeath: "2022-06-15",
      ownerStartedRmds: false,
      beneficiaryType: "spouse",
      beneficiaryDob: "1962-04-04",
      priorYearEndBalance: 250000,
      calculationYear: 2026,
    });

    assert.equal(delayed.ok, true);
    assert.equal(delayed.appliedRule, "spouse");
    assert.equal(delayed.edb, true);
    assert.ok(delayed.edbReasons.includes("spouse"));
    assert.equal(delayed.rmdKind, "delayed");
    assert.equal(delayed.rmd, 0);
    assert.equal(delayed.emptyByYear, null);
    assert.match(delayed.rule, /surviving spouse/);
    assert.match(delayed.rule, /December 31, 2030/);
    assert.match(delayed.rule, /RMD age 73/);
    assert.match(delayed.spouseTreatAsOwn.note, /Uniform Lifetime Table/);
    assert.equal(delayed.spouseTreatAsOwn.rmdAgeLabel, "75");
    assert.equal(delayed.spouseTreatAsOwn.attainmentYear, 2037);
    assert.equal(delayed.spouseTreatAsOwn.rbd, "2038-04-01");
    assert.equal(delayed.schedule.find((row) => row.year === 2026).distribution, "delayed");
    assert.equal(delayed.schedule.find((row) => row.year === 2030).distribution, "rmd");

    const paying = calc({
      ownerDob: "1950-01-01",
      ownerDeath: "2024-08-01",
      ownerStartedRmds: true,
      beneficiaryType: "spouse",
      beneficiaryDob: "1952-05-05",
      priorYearEndBalance: 100000,
      calculationYear: 2026,
    });

    assert.equal(paying.ok, true);
    assert.equal(paying.diedOnOrAfterRbd, true);
    assert.equal(paying.factor, 15.6);
    assert.equal(paying.factorSource, "spouse");
    assert.equal(paying.rmd, 6410.26);
    assert.equal(paying.rmdKind, "amount");
    assert.equal(paying.deadline, "2026-12-31");
    assert.notEqual(paying.schedule.find((row) => row.year === 2025).factor, paying.factor);
    assert.equal(paying.schedule.find((row) => row.year === 2025).factor, 16.4);
    assert.equal(paying.schedule.find((row) => row.year === 2027).factor, 14.8);
    assert.match(paying.spouseTreatAsOwn.note, /Uniform Lifetime Table/);
    assert.match(paying.notes.join(" "), /December 31, 2024/);
  });

  it("stretches a disabled eligible designated beneficiary on the beneficiary's life expectancy", () => {
    const result = calc({
      ownerDob: "1952-02-02",
      ownerDeath: "2024-03-01",
      ownerStartedRmds: false,
      beneficiaryType: "other",
      beneficiaryDob: "1980-07-04",
      beneficiaryDisabled: true,
      priorYearEndBalance: 50000,
      calculationYear: 2026,
    });

    assert.equal(result.ok, true);
    assert.equal(result.appliedRule, "edb-life");
    assert.ok(result.edbReasons.includes("disabled"));
    assert.equal(result.edbReasons.includes("within-10-years"), false);
    assert.equal(result.factor, 40.0);
    assert.equal(result.factorSource, "beneficiary");
    assert.equal(result.rmd, 1250);
    assert.equal(result.emptyByYear, null);
    assert.match(result.rule, /disabled or chronically ill/);
    assert.match(result.rule, /no 10-year deadline/i);
    assert.equal(result.schedule[0].factor, 41.0);
    assert.equal(result.schedule[0].year, 2025);
  });

  it("treats a beneficiary not more than 10 years younger as an eligible designated beneficiary", () => {
    const within = calc({
      ownerDob: "1955-06-15",
      ownerDeath: "2024-02-01",
      ownerStartedRmds: false,
      beneficiaryType: "other",
      beneficiaryDob: "1965-06-15",
      priorYearEndBalance: 10000,
      calculationYear: 2026,
    });

    assert.equal(within.ok, true);
    assert.equal(within.appliedRule, "edb-life");
    assert.ok(within.edbReasons.includes("within-10-years"));
    assert.equal(within.factor, 26.1);
    assert.equal(within.rmd, 383.14);
    assert.equal(within.emptyByYear, null);
    assert.match(within.rule, /not more than 10 years younger/);
    assert.equal(BeneRmd.isNotMoreThan10YearsYounger("1955-06-15", "1965-06-15"), true);

    const oneDayOver = calc({
      ownerDob: "1955-06-15",
      ownerDeath: "2024-02-01",
      ownerStartedRmds: false,
      beneficiaryType: "other",
      beneficiaryDob: "1965-06-16",
      priorYearEndBalance: 10000,
      calculationYear: 2026,
    });
    assert.equal(oneDayOver.edb, false);
    assert.equal(oneDayOver.appliedRule, "non-edb-10-year");
    assert.equal(oneDayOver.rmdKind, "none");
    assert.equal(oneDayOver.emptyByYear, 2034);
    assert.equal(BeneRmd.isNotMoreThan10YearsYounger("1955-06-15", "1965-06-16"), false);
  });

  it("uses the owner's remaining life expectancy when it is longer", () => {
    const result = calc({
      ownerDob: "1948-04-10",
      ownerDeath: "2024-12-01",
      ownerStartedRmds: true,
      beneficiaryType: "other",
      beneficiaryDob: "1940-02-02",
      beneficiaryDisabled: false,
      priorYearEndBalance: 10000,
      calculationYear: 2026,
    });

    assert.equal(result.ok, true);
    assert.equal(result.diedOnOrAfterRbd, true);
    assert.equal(result.appliedRule, "edb-life");
    assert.ok(result.edbReasons.includes("within-10-years"));
    assert.equal(result.useLongerOf, true);
    assert.equal(result.calculationRow.beneficiaryFactor, 7.1);
    assert.equal(result.calculationRow.ownerFactor, 12.1);
    assert.equal(result.factor, 12.1);
    assert.equal(result.factorSource, "owner");
    assert.equal(result.rmd, 826.45);
    assert.equal(result.rmdKind, "amount");
    assert.equal(result.emptyByYear, null);
    assert.match(result.rule, /longer of the beneficiary's life expectancy and the owner's remaining life expectancy/);
    assert.match(result.notes.join(" "), /owner's remaining life expectancy \(12\.1\) is longer/);

    const following = result.schedule.find((row) => row.year === 2027);
    assert.equal(following.factor, 11.1);
    assert.equal(following.source, "owner");
  });

  it("notes the minor-child stretch and the 10-year rule that starts at age 21", () => {
    const result = calc({
      ownerDob: "1980-01-15",
      ownerDeath: "2024-06-01",
      ownerStartedRmds: false,
      beneficiaryType: "child",
      beneficiaryDob: "2015-09-01",
      priorYearEndBalance: 20000,
      calculationYear: 2026,
    });

    assert.equal(result.ok, true);
    assert.equal(result.appliedRule, "edb-minor");
    assert.ok(result.edbReasons.includes("minor-child"));
    assert.equal(result.factor, 73.9);
    assert.equal(result.rmd, 270.64);
    assert.equal(result.emptyByYear, 2046);
    assert.match(result.notes.join(" "), /turns 21/);
    assert.match(result.rule, /December 31, 2046/);
    assert.equal(result.schedule.find((row) => row.year === 2046).distribution, "full");
    assert.equal(BeneRmd.isMinorChildOn("2015-09-01", "2024-06-01"), true);
    assert.equal(BeneRmd.isMinorChildOn("2003-06-01", "2024-06-01"), false);
  });

  it("follows an explicit started-RMDs answer when it differs from the derived RBD", () => {
    const result = calc({
      ownerDob: "1965-04-02",
      ownerDeath: "2030-05-01",
      ownerStartedRmds: true,
      beneficiaryType: "child",
      beneficiaryDob: "1990-06-15",
      priorYearEndBalance: 50000,
      calculationYear: 2031,
    });

    assert.equal(result.diedOnOrAfterRbd, false);
    assert.equal(result.ownerStartedRmds, true);
    assert.equal(result.rmdKind, "amount");
    assert.notEqual(result.factor, null);
    assert.match(result.notes.join(" "), /follows the Yes\/No answer/);
  });

  it("stretches a 2014 non-spouse death on the 2022 Single Life Table", () => {
    assert.equal(BeneRmd.singleLifeFactor(57), 29.8);

    const result = calc({
      ownerDob: "1960-01-01",
      ownerDeath: "2014-08-01",
      ownerStartedRmds: true,
      beneficiaryType: "other",
      beneficiaryDob: "1958-06-01",
      beneficiaryDisabled: true,
      priorYearEndBalance: 20889.61,
      calculationYear: 2026,
    });

    assert.equal(result.ok, true);
    assert.equal(result.appliedRule, "pre-2020-stretch");
    assert.equal(result.method, "Pre-2020 stretch (Single Life, non-recalculated)");
    assert.match(result.rule, /Pre-2020 stretch \(Single Life, non-recalculated\)/);
    assert.equal(result.edb, false);
    assert.equal(result.emptyByYear, null);
    assert.equal(result.factor, 18.8);
    assert.equal(result.rmd, 1111.15);
    assert.equal(result.rmdKind, "amount");
    assert.equal(result.deadline, "2026-12-31");
    const year2015 = result.schedule.find((row) => row.year === 2015);
    assert.equal(year2015.factor, 29.8);
    assert.equal(result.schedule.find((row) => row.year === 2026).factor, 18.8);

    const asChild = calc({
      ownerDob: "1960-01-01",
      ownerDeath: "2014-08-01",
      ownerStartedRmds: false,
      beneficiaryType: "child",
      beneficiaryDob: "1958-06-01",
      beneficiaryDisabled: false,
      priorYearEndBalance: 20889.61,
      calculationYear: 2026,
    });
    assert.equal(asChild.appliedRule, "pre-2020-stretch");
    assert.equal(asChild.factor, 18.8);
    assert.equal(asChild.rmd, 1111.15);
  });

  it("recalculates a pre-2020 spouse's Single Life factor from the spouse's age each year", () => {
    const result = calc({
      ownerDob: "1940-01-15",
      ownerDeath: "2014-08-01",
      ownerStartedRmds: false,
      beneficiaryType: "spouse",
      beneficiaryDob: "1960-04-04",
      beneficiaryDisabled: true,
      priorYearEndBalance: 22000,
      calculationYear: 2026,
    });

    assert.equal(result.ok, true);
    assert.equal(result.appliedRule, "pre-2020-spouse");
    assert.equal(BeneRmd.singleLifeFactor(55), 31.6);
    assert.equal(BeneRmd.singleLifeFactor(66), 22.0);
    assert.equal(result.schedule.find((row) => row.year === 2015).factor, 31.6);
    assert.equal(result.factor, 22.0);
    assert.equal(result.factorSource, "spouse");
    assert.equal(result.rmd, 1000);
    assert.equal(result.emptyByYear, null);
    assert.match(result.rule, /looked up fresh each year/i);
    assert.doesNotMatch(result.rule, /Pre-2020 stretch \(Single Life, non-recalculated\)/);
  });

  it("does not apply the minor-child 10-year clock to a pre-2020 death", () => {
    const result = calc({
      ownerDob: "1970-01-01",
      ownerDeath: "2018-06-01",
      ownerStartedRmds: false,
      beneficiaryType: "child",
      beneficiaryDob: "2010-01-01",
      beneficiaryDisabled: false,
      priorYearEndBalance: 68900,
      calculationYear: 2026,
    });

    assert.equal(result.ok, true);
    assert.equal(result.appliedRule, "pre-2020-stretch");
    assert.equal(result.method, "Pre-2020 stretch (Single Life, non-recalculated)");
    assert.equal(BeneRmd.singleLifeFactor(9), 75.9);
    assert.equal(result.schedule.find((row) => row.year === 2019).factor, 75.9);
    assert.equal(result.factor, 68.9);
    assert.equal(result.rmd, 1000);
    assert.equal(result.emptyByYear, null);
    assert.equal(result.edb, false);
  });
});

describe("financial calcs page", () => {
  const html = fs.readFileSync(
    path.join(__dirname, "../apps/financial-calcs.html"),
    "utf8",
  );

  it("loads the calculator and prints the required disclosure", () => {
    assert.match(html, /Beneficiary IRA RMD Calculator/);
    assert.match(html, /\.\.\/shared\/bene-rmd\.js/);
    assert.match(
      html,
      /Investment Adviser Representative of and advisory services offered through Royal Fund Management, LLC, a SEC registered investment adviser\./,
    );
    assert.match(
      html,
      /This calculator provides educational estimates only and is not tax or legal advice\. Consult your tax advisor before taking a distribution\./,
    );
  });
});
