import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ELKS_SEASON_TEAMS,
  emptySoftballState,
  mergeSoftballStates,
  playerIdentityKey,
  seedOfficialRosters,
  syncStateTeams,
  type HubTeamRef,
  type SoftballPlayer,
} from "./elks-roster-seed.ts";

const hubTeams: HubTeamRef[] = [
  { id: "team-12u-uttke", name: "12U Uttke - 2026-2027", clubId: "club-mn-elks" },
  { id: "team-14u-churchich", name: "14U Churchich - 2026-2027", clubId: "club-mn-elks" },
  { id: "team-14u-hermes", name: "14U Hermes - 2026-2027", clubId: "club-mn-elks" },
  { id: "team-16u-fransen", name: "16U Fransen", clubId: "club-mn-elks" },
  { id: "team-16u-stephany", name: "16U Stephany - 2026-2027", clubId: "club-mn-elks" },
];

function player(
  name: string,
  number: string,
  assignedTeamId: string | null,
  id = `p-${name}`,
): SoftballPlayer {
  const [firstName, ...rest] = name.split(" ");
  return {
    id,
    firstName,
    lastName: rest.join(" "),
    name,
    number,
    position: "",
    assignedTeamId,
  };
}

describe("seedOfficialRosters", () => {
  it("adds all 60 assigned 2026-2027 players", () => {
    const { state, added } = seedOfficialRosters(emptySoftballState(), hubTeams);
    assert.equal(added, 60);
    assert.equal(state.players?.length, 60);
    assert.ok(state.players?.every((item) => item.assignedTeamId));
    assert.ok(state.players?.every((item) => item.position === ""));
    for (const spec of ELKS_SEASON_TEAMS) {
      const team = hubTeams.find((item) => item.id === spec.stableId);
      const onTeam = state.players?.filter((item) => item.assignedTeamId === spec.stableId);
      assert.equal(onTeam?.length, spec.players.length, spec.key);
      assert.equal(team?.name.includes(spec.coach) || team?.name.includes(spec.age), true);
    }
  });

  it("skips a player that already has that name and number on the team", () => {
    const existing = emptySoftballState();
    existing.players = [
      player("Emily Artmann", "4", "team-16u-fransen", "keep-emily"),
    ];
    const first = seedOfficialRosters(existing, hubTeams);
    const second = seedOfficialRosters(first.state, hubTeams);
    const emilys = second.state.players?.filter(
      (item) => playerIdentityKey(item.name, item.number) === "emily artmann|4",
    );
    assert.equal(emilys?.length, 1);
    assert.equal(emilys?.[0].id, "keep-emily");
    assert.equal(second.added, 0);
    assert.equal(second.state.players?.length, 60);
  });

  it("assigns an existing unassigned name+number instead of duplicating", () => {
    const existing = emptySoftballState();
    existing.players = [
      player("Emily Artmann", "4", null, "unassigned-emily"),
      player("Tenley Fransen", "10", null, "unassigned-tenley"),
    ];
    existing.tryouts = [{ id: "tryout-keep", name: "Keep me" }];
    existing.drills = [{ id: "drill-keep" }];
    const { state, added, assigned } = seedOfficialRosters(existing, hubTeams);
    assert.equal(added, 58);
    assert.equal(assigned, 2);
    assert.equal(
      state.players?.find((item) => item.id === "unassigned-emily")?.assignedTeamId,
      "team-16u-fransen",
    );
    assert.equal(state.tryouts?.[0]?.id, "tryout-keep");
    assert.equal(state.drills?.[0]?.id, "drill-keep");
  });
});

describe("mergeSoftballStates", () => {
  it("keeps local assignments when the server copy is unassigned", () => {
    const remote = emptySoftballState();
    remote.players = [player("Emily Artmann", "4", null, "emily")];
    remote.tryouts = [{ id: "server-tryout" }];
    const local = emptySoftballState();
    local.players = [
      player("Emily Artmann", "4", "team-16u-fransen", "emily"),
      player("Willow Uttke", "10", "team-12u-uttke", "willow"),
    ];
    const merged = mergeSoftballStates(remote, local);
    assert.equal(merged.players?.length, 2);
    assert.equal(
      merged.players?.find((item) => item.name === "Emily Artmann")?.assignedTeamId,
      "team-16u-fransen",
    );
    assert.equal(merged.tryouts?.[0]?.id, "server-tryout");
  });
});

describe("syncStateTeams", () => {
  it("remaps duplicate team ids onto People team ids without wiping others", () => {
    const state = emptySoftballState();
    state.teams = [{ id: "old-fransen", name: "16U Fransen", ageGroup: "16U" }];
    state.players = [player("Emily Artmann", "4", "old-fransen", "emily")];
    const synced = syncStateTeams(state, hubTeams);
    assert.equal(
      synced.players?.find((item) => item.id === "emily")?.assignedTeamId,
      "team-16u-fransen",
    );
  });
});
