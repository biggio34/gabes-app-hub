import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addPriorSeason,
  applyIdentityOnWrite,
  canSeeCoachNotes,
  mergePlayerIdentity,
  personIdentityKey,
  preserveCoachOnlyNotes,
  publishTryoutToRoster,
  stripCoachOnlyNotes,
  touchCurrentSeason,
  type JsonPlayer,
} from "./player-identity.ts";

function player(partial: Record<string, unknown> = {}): JsonPlayer {
  return {
    id: "p_same",
    firstName: "Ava",
    lastName: "Johnson",
    name: "Ava Johnson",
    birthdate: "2010-03-12",
    number: "",
    position: "SS",
    position2: "2B",
    assignedTeamId: null,
    card: {},
    seasons: [],
    ...partial,
  };
}

describe("durable People/player id", () => {
  it("does not use jersey number as the person key", () => {
    const ten = player({ number: "10" });
    const four = player({ number: "4" });
    assert.equal(personIdentityKey(ten), personIdentityKey(four));
    assert.equal(personIdentityKey(ten), "ava johnson|2010-03-12");
    assert.equal(ten.id, four.id);
  });

  it("keeps one id across 2025 #10 and 2026 #4", () => {
    let ava = player({ number: "10", assignedTeamId: "team-16u-fransen" });
    ava = addPriorSeason(ava, {
      year: 2025,
      teamId: "team-16u-fransen",
      teamName: "16U Fransen",
      number: "10",
      position: "SS",
      position2: "2B",
    }, 2026);
    ava = { ...ava, number: "4" };
    ava = touchCurrentSeason(ava, { year: 2026, teamName: "16U Fransen" });

    assert.equal(ava.id, "p_same");
    const y25 = (ava.seasons as { year: number; number: string }[]).find((s) => s.year === 2025);
    const y26 = (ava.seasons as { year: number; number: string }[]).find((s) => s.year === 2026);
    assert.equal(y25?.number, "10");
    assert.equal(y26?.number, "4");
    assert.equal(ava.number, "4");
  });

  it("does not rewrite a past chapter number when this year’s number changes", () => {
    let ava = addPriorSeason(player({ number: "10" }), {
      year: 2025,
      number: "10",
      teamName: "16U Fransen",
    }, 2026);
    ava = { ...ava, number: "4" };
    ava = touchCurrentSeason(ava, { year: 2026, teamName: "16U Fransen" });
    const y25 = (ava.seasons as { year: number; number: string }[]).find((s) => s.year === 2025);
    assert.equal(y25?.number, "10");
    assert.equal(ava.id, "p_same");
  });
});

describe("tryout publish", () => {
  it("writes Offer onto the same People id and sets this season’s number only", () => {
    const state = {
      players: [
        player({
          number: "10",
          seasons: [
            {
              year: 2025,
              seasonKey: "2025",
              number: "10",
              teamName: "16U Fransen",
              position: "SS",
              position2: "2B",
            },
          ],
        }),
      ],
      teams: [{ id: "team-16u-fransen", name: "16U Fransen" }],
      tryouts: [
        {
          id: "tryout_2026",
          name: "2026 Fransen",
          date: "2026-08-20",
          evaluations: {
            p_same: { recommendation: "offer", scores: { hitting: 4 }, notes: "plus range" },
          },
        },
      ],
    };

    const result = publishTryoutToRoster(state, {
      tryoutId: "tryout_2026",
      teamId: "team-16u-fransen",
      teamName: "16U Fransen",
      jerseys: { p_same: "4" },
      publishedBy: "gabe",
    });

    const ava = result.state.players?.[0];
    assert.equal(ava?.id, "p_same");
    assert.equal(ava?.number, "4");
    assert.equal(ava?.assignedTeamId, "team-16u-fransen");
    const seasons = ava?.seasons as { year: number; number: string; recommendation: string }[];
    assert.equal(seasons.find((s) => s.year === 2025)?.number, "10");
    assert.equal(seasons.find((s) => s.year === 2026)?.number, "4");
    assert.equal(seasons.find((s) => s.year === 2026)?.recommendation, "offer");
    const afterWrite = applyIdentityOnWrite(result.state, result.state, {
      canEditCoachNotes: true,
      year: 2026,
    });
    const written = afterWrite.players?.[0];
    const writtenSeasons = written?.seasons as { year: number; teamName: string; number: string }[];
    assert.equal(writtenSeasons.find((s) => s.year === 2026)?.teamName, "16U Fransen");
    assert.equal(writtenSeasons.find((s) => s.year === 2025)?.number, "10");
    assert.deepEqual(result.assignedPlayerIds, ["p_same"]);
    assert.equal(state.tryouts[0].evaluations.p_same.recommendation, "offer");
    assert.equal((result.state.tryouts?.[0] as { evaluations?: { p_same?: { recommendation?: string } } }).evaluations?.p_same?.recommendation, "offer");
  });

  it("keeps Waitlist/Pass as a paper trail without assigning them", () => {
    const state = {
      players: [
        player({ id: "p_wait", firstName: "Emma", lastName: "Brooks", name: "Emma Brooks" }),
        player({ id: "p_pass", firstName: "Harper", lastName: "Lee", name: "Harper Lee" }),
      ],
      tryouts: [
        {
          id: "tryout_1",
          name: "Tryouts",
          date: "2026-08-20",
          evaluations: {
            p_wait: { recommendation: "waitlist", notes: "cannon arm" },
            p_pass: { recommendation: "pass", notes: "behind" },
          },
        },
      ],
    };

    const result = publishTryoutToRoster(state, {
      tryoutId: "tryout_1",
      teamId: "team-16u-fransen",
      teamName: "16U Fransen",
      jerseys: { p_wait: "21", p_pass: "15" },
    });

    const wait = result.state.players?.find((p) => p.id === "p_wait");
    const pass = result.state.players?.find((p) => p.id === "p_pass");
    assert.equal(wait?.assignedTeamId, null);
    assert.equal(pass?.assignedTeamId, null);
    assert.equal(result.assignedPlayerIds.length, 0);
    assert.equal(result.decisionCounts.waitlist, 1);
    assert.equal(result.decisionCounts.pass, 1);
    const waitSeason = (wait?.seasons as { recommendation: string }[])[0];
    const passSeason = (pass?.seasons as { recommendation: string }[])[0];
    assert.equal(waitSeason.recommendation, "waitlist");
    assert.equal(passSeason.recommendation, "pass");
  });
});

describe("coach-only card notes", () => {
  it("strips raw card notes for non-coaches and keeps them for owners on write", () => {
    const state = {
      players: [
        player({
          card: { strengths: "range", developmentFocus: "backhand", notes: "parent should not see this" },
          seasons: [{ year: 2025, number: "10", card: { notes: "2025 private" } }],
        }),
      ],
    };
    const stripped = stripCoachOnlyNotes(state);
    assert.equal((stripped.players?.[0].card as { notes: string }).notes, "");
    assert.equal((stripped.players?.[0].seasons as { card: { notes: string } }[])[0].card.notes, "");
    assert.equal((stripped.players?.[0].card as { strengths: string }).strengths, "range");
    assert.equal(canSeeCoachNotes("owner"), true);
    assert.equal(canSeeCoachNotes("member"), false);

    const incoming = {
      players: [
        player({
          card: { strengths: "range", notes: "" },
          seasons: [{ year: 2025, number: "10", card: { notes: "" } }],
        }),
      ],
    };
    const kept = preserveCoachOnlyNotes(state, incoming, { canEditCoachNotes: false });
    assert.equal((kept.players?.[0].card as { notes: string }).notes, "parent should not see this");
    assert.equal((kept.players?.[0].seasons as { card: { notes: string } }[])[0].card.notes, "2025 private");
  });
});

describe("merge + write", () => {
  it("merges by durable id and does not create a second person", () => {
    const left = player({ number: "4", card: { strengths: "arm" } });
    const right = player({
      number: "10",
      seasons: [{ year: 2025, number: "10", teamName: "16U Fransen" }],
    });
    const merged = mergePlayerIdentity(left, right);
    assert.equal(merged.id, "p_same");
    assert.equal(merged.number, "4");
    assert.equal((merged.seasons as { year: number; number: string }[]).find((s) => s.year === 2025)?.number, "10");
  });

  it("seeds this year’s chapter on write without dropping history", () => {
    const current = {
      players: [
        player({
          number: "10",
          seasons: [{ year: 2025, number: "10", teamName: "16U Fransen" }],
          card: { notes: "keep" },
        }),
      ],
    };
    const incoming = {
      players: [player({ number: "4", assignedTeamId: "team-16u-fransen", card: { strengths: "speed" } })],
      teams: [{ id: "team-16u-fransen", name: "16U Fransen" }],
    };
    const written = applyIdentityOnWrite(current, incoming, { canEditCoachNotes: false, year: 2026 });
    const ava = written.players?.[0];
    assert.equal(ava?.id, "p_same");
    assert.equal(ava?.number, "4");
    const seasons = ava?.seasons as { year: number; number: string }[];
    assert.equal(seasons.find((s) => s.year === 2025)?.number, "10");
    assert.equal(seasons.find((s) => s.year === 2026)?.number, "4");
    assert.equal((ava?.card as { notes: string }).notes, "keep");
  });
});
