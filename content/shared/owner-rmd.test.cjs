const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const OwnerRmd = require("./owner-rmd.js");

/**
 * IRS Uniform Lifetime Table text for distribution years beginning in 2022.
 * Treas. Reg. §1.401(a)(9)-9 and IRS Publication 590-B, Appendix B, Table III
 * (Uniform Lifetime). Age 120 and over uses 2.0.
 */
const IRS_UNIFORM_LIFETIME_TEXT = `
Table III (Uniform Lifetime)
For use by unmarried owners, married owners whose spouses are not more than 10 years younger, and married owners whose spouses are not the sole beneficiaries.
Distribution calendar years beginning on or after January 1, 2022.

Age | Distribution Period
72 | 27.4
73 | 26.5
74 | 25.5
75 | 24.6
76 | 23.7
77 | 22.9
78 | 22.0
79 | 21.1
80 | 20.2
81 | 19.4
82 | 18.5
83 | 17.7
84 | 16.8
85 | 16.0
86 | 15.2
87 | 14.4
88 | 13.7
89 | 12.9
90 | 12.2
91 | 11.5
92 | 10.8
93 | 10.1
94 | 9.5
95 | 8.9
96 | 8.4
97 | 7.8
98 | 7.3
99 | 6.8
100 | 6.4
101 | 6.0
102 | 5.6
103 | 5.2
104 | 4.9
105 | 4.6
106 | 4.3
107 | 4.1
108 | 3.9
109 | 3.7
110 | 3.5
111 | 3.4
112 | 3.3
113 | 3.1
114 | 3.0
115 | 2.9
116 | 2.8
117 | 2.7
118 | 2.5
119 | 2.3
120 and over | 2.0
`;

function calc(overrides) {
  return OwnerRmd.calculateOwnerRmd({
    ownerDob: "1952-06-15",
    priorYearEndBalance: 500000,
    distributionYear: 2026,
    delayFirst: false,
    ...overrides,
  });
}

describe("Uniform Lifetime Table", () => {
  it("matches the IRS Uniform Lifetime Table text for ages 72 through 120 and over", () => {
    const rows = [];
    for (const line of IRS_UNIFORM_LIFETIME_TEXT.split("\n")) {
      const match = line.match(/^\s*(\d+)(?: and over)?\s*\|\s*(\d+\.\d+)\s*$/);
      if (match) rows.push({ age: Number(match[1]), factor: Number(match[2]) });
    }

    assert.equal(rows.length, 49);
    assert.equal(rows[0].age, 72);
    assert.equal(rows[rows.length - 1].age, 120);
    assert.equal(Object.keys(OwnerRmd.UNIFORM_LIFETIME).length, 49);

    for (const row of rows) {
      assert.equal(
        OwnerRmd.uniformLifetimeFactor(row.age),
        row.factor,
        `age ${row.age}`,
      );
    }

    assert.equal(OwnerRmd.uniformLifetimeFactor(85), 16.0);
    assert.equal(OwnerRmd.uniformLifetimeFactor(120), 2.0);
    assert.equal(OwnerRmd.uniformLifetimeFactor(130), 2.0);
    assert.equal(OwnerRmd.uniformLifetimeFactor(71), null);
  });
});

describe("owner traditional IRA RMDs", () => {
  it("uses age 72, 73, or 75 from the year of birth", () => {
    assert.equal(OwnerRmd.rmdStartAge("1950-12-31"), 72);
    assert.equal(OwnerRmd.rmdStartAge("1940-01-01"), 72);
    assert.equal(OwnerRmd.rmdStartAge("1951-01-01"), 73);
    assert.equal(OwnerRmd.rmdStartAge("1959-12-31"), 73);
    assert.equal(OwnerRmd.rmdStartAge("1960-01-01"), 75);
  });

  it("born 1952, balance $500,000, year 2026 is age 74, factor 25.5, RMD $19,607.84", () => {
    const result = calc();
    assert.equal(result.ok, true);
    assert.equal(result.rmdRequired, true);
    assert.equal(result.age, 74);
    assert.equal(result.rmdStartAge, 73);
    assert.equal(result.firstRmdYear, 2025);
    assert.equal(result.factor, 25.5);
    assert.equal(result.table, "Uniform Lifetime");
    assert.equal(result.rmd, 19607.84);
    assert.equal(result.deadline, "2026-12-31");
    assert.equal(result.delayAvailable, false);
    assert.equal(result.note, OwnerRmd.NOTE);
  });

  it("born 1960 in 2026 is not yet required and the first RMD year is 2035", () => {
    const result = calc({
      ownerDob: "1960-04-02",
      priorYearEndBalance: 100000,
      distributionYear: 2026,
    });
    assert.equal(result.ok, true);
    assert.equal(result.rmdRequired, false);
    assert.equal(result.age, 66);
    assert.equal(result.rmdStartAge, 75);
    assert.equal(result.firstRmdYear, 2035);
    assert.equal(result.message, "RMDs start in 2035");
    assert.equal(result.april1Deadline, "2036-04-01");
    assert.equal(result.deadline, "2036-04-01");
    assert.equal(result.factor, null);
    assert.equal(result.rmd, null);
    assert.equal(result.delayAvailable, false);
  });

  it("born 1953 with a $100,000 balance in 2026 is the first RMD year", () => {
    const result = calc({
      ownerDob: "1953-08-20",
      priorYearEndBalance: 100000,
      distributionYear: 2026,
      delayFirst: false,
    });
    assert.equal(result.ok, true);
    assert.equal(result.age, 73);
    assert.equal(result.factor, 26.5);
    assert.equal(result.rmd, 3773.58);
    assert.equal(result.firstRmdYear, 2026);
    assert.equal(result.delayAvailable, true);
    assert.equal(result.april1Deadline, "2027-04-01");
    assert.equal(result.deadline, "2026-12-31");
    assert.match(result.warning, /April 1, 2027/);
    assert.match(result.warning, /two RMDs will land in the 2027 tax year/i);

    const delayed = calc({
      ownerDob: "1953-08-20",
      priorYearEndBalance: 100000,
      distributionYear: 2026,
      delayFirst: true,
    });
    assert.equal(delayed.delayFirst, true);
    assert.equal(delayed.deadline, "2027-04-01");
    assert.equal(delayed.rmd, 3773.58);
    assert.match(delayed.warning, /April 1, 2027/);
    assert.match(delayed.warning, /Two RMDs will land in the 2027 tax year/);
  });

  it("age 80 in 2026 (born 1946) uses factor 20.2 and is due December 31, 2026", () => {
    const result = calc({
      ownerDob: "1946-03-01",
      priorYearEndBalance: 100000,
      distributionYear: 2026,
      delayFirst: true,
    });
    assert.equal(result.ok, true);
    assert.equal(result.age, 80);
    assert.equal(result.rmdStartAge, 72);
    assert.equal(result.factor, 20.2);
    assert.equal(result.rmd, 4950.5);
    assert.equal(result.deadline, "2026-12-31");
    assert.equal(result.delayAvailable, false);
    assert.equal(result.delayFirst, false);
    assert.equal(result.warning, null);
  });

  it("age 85 uses Uniform Lifetime factor 16.0", () => {
    const result = calc({
      ownerDob: "1941-11-30",
      priorYearEndBalance: 160000,
      distributionYear: 2026,
    });
    assert.equal(result.ok, true);
    assert.equal(result.age, 85);
    assert.equal(result.factor, 16.0);
    assert.equal(result.table, "Uniform Lifetime");
    assert.equal(result.rmd, 10000);
    assert.equal(result.deadline, "2026-12-31");
  });
});

describe("financial calcs owner RMD tab", () => {
  const html = fs.readFileSync(
    path.join(__dirname, "../apps/financial-calcs.html"),
    "utf8",
  );

  it("adds the Traditional IRA RMD tab, inputs, note, and disclosure", () => {
    assert.match(html, /Traditional IRA RMD/);
    assert.match(html, /id="rmd-owner-dob"/);
    assert.match(html, /id="rmd-balance"/);
    assert.match(html, /id="rmd-year"/);
    assert.match(html, /id="rmd-delay-first"/);
    assert.equal(html.includes('id="rmd-spouse-sole"'), false);
    assert.equal(html.includes('id="rmd-spouse-dob"'), false);
    assert.match(html, /\.\.\/shared\/owner-rmd\.js/);
    assert.match(html, new RegExp(OwnerRmd.NOTE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
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
