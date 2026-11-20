const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const GameManager = require("./game-manager.js");

function defense(map) {
  return Object.assign(GameManager.emptyDefense(), map);
}

function sampleGame() {
  return {
    id: "game-eagles",
    name: "vs. Eagles - May 3",
    battingOrder: ["mia", "ava", "lina"],
    defensivePositions: defense({ P: "mia", C: "ava", SS: "lina" }),
    inningDefenses: [
      defense({ P: "mia", C: "ava", SS: "lina" }),
      defense({ P: "jo", C: "ava", SS: "lina" }),
    ],
    unavailableIds: ["out-girl"],
    lastUpdated: 10,
  };
}

function players() {
  return [
    { id: "mia", name: "Mia Hill", number: "4" },
    { id: "ava", name: "Ava Cole", number: "12" },
    { id: "lina", name: "Lina Ortiz", number: "7" },
    { id: "jo", name: "Jo Park", number: "2" },
    { id: "out-girl", name: "Sam Reed", number: "9" },
    { id: "sub", firstName: "Nia", lastName: "Brooks", number: "15", assignedTeamId: "team-16u-fransen" },
  ];
}

function start(side, game, innings) {
  return GameManager.createLiveGame(
    {
      side: side,
      game: game || sampleGame(),
      players: players(),
      teamName: "16U Fransen",
      scheduledInnings: innings,
    },
    1000,
  );
}

describe("game manager lineup read", () => {
  it("reads the team lineup record and skips removed games", () => {
    const record = {
      version: 2,
      removedGameIds: ["gone"],
      games: [sampleGame(), { id: "gone", name: "Deleted", battingOrder: [] }, { name: "No id" }],
    };
    const games = GameManager.gamesFromLineupRecord(record);
    assert.equal(games.length, 1);
    assert.equal(games[0].id, "game-eagles");
    assert.equal(games[0].battingOrder[0], "mia");
    assert.equal(games[0].inningDefenses[1].P, "jo");
  });

  it("uses the all-teams lineup only when this team has no games", () => {
    const lineups = {
      "team-16u-fransen": { version: 2, games: [] },
      all: { version: 2, games: [{ id: "shared", name: "vs. Hawks", battingOrder: ["mia"] }] },
    };
    assert.equal(GameManager.gamesFromLineupRecord(GameManager.selectLineupRecord(lineups, "team-16u-fransen"))[0].id, "shared");
    lineups["team-16u-fransen"] = { version: 2, games: [sampleGame()] };
    assert.equal(
      GameManager.gamesFromLineupRecord(GameManager.selectLineupRecord(lineups, "team-16u-fransen"))[0].id,
      "game-eagles",
    );
  });

  it("reads a legacy single lineup", () => {
    const games = GameManager.gamesFromLineupRecord({
      gameInfo: "vs. Lions",
      battingOrder: ["mia"],
      defensivePositions: { P: "mia" },
    });
    assert.equal(games.length, 1);
    assert.equal(games[0].name, "vs. Lions");
    assert.equal(games[0].defensivePositions.P, "mia");
  });

  it("builds the batting order, inning-1 defense, and subs", () => {
    const view = GameManager.lineupView(GameManager.slimGame(sampleGame()), players());
    assert.deepEqual(view.batting.map((row) => row.label), ["#4 Mia Hill", "#12 Ava Cole", "#7 Lina Ortiz"]);
    assert.equal(view.defense.find((row) => row.pos === "P").label, "#4 Mia Hill");
    assert.equal(view.defense.find((row) => row.pos === "1B").label, "Empty");
    assert.deepEqual(view.subs.map((row) => row.id), ["sub", "jo"]);
    assert.deepEqual(view.out.map((row) => row.id), ["out-girl"]);
  });
});

describe("game manager half innings", () => {
  it("puts the away team on offense in the top and defense in the bottom", () => {
    assert.equal(GameManager.roleFor("away", "top"), "offense");
    assert.equal(GameManager.roleFor("away", "bottom"), "defense");
    assert.equal(GameManager.battingSide("top"), "away");
    const state = start("away");
    const board = GameManager.scoreboard(state);
    assert.equal(board.label, "Top 1");
    assert.equal(board.role, "offense");
  });

  it("puts the home team on defense in the top and offense in the bottom", () => {
    assert.equal(GameManager.roleFor("home", "top"), "defense");
    assert.equal(GameManager.roleFor("home", "bottom"), "offense");
    assert.equal(GameManager.battingSide("bottom"), "home");
    const state = start("home");
    assert.equal(GameManager.scoreboard(state).role, "defense");
    assert.equal(GameManager.halfLabel(0, "top"), "Top 1");
  });

  it("records our top-inning runs, then flips to defense", () => {
    let state = start("away");
    state = GameManager.recordRuns(state, 2, 1100);
    const board = GameManager.scoreboard(state);
    assert.equal(board.label, "Bottom 1");
    assert.equal(board.role, "defense");
    assert.equal(board.innings[0].us, 2);
    assert.equal(board.innings[0].opp, null);
    assert.equal(board.usTotal, 2);
    assert.equal(board.oppTotal, 0);
    assert.deepEqual(state.defensiveOuts, {});
  });

  it("gives opponent runs and defensive outs to the home team in the top", () => {
    let state = start("home");
    state = GameManager.addOut(state, 1);
    state = GameManager.addOut(state, 2);
    state = GameManager.addOut(state, 3);
    state = GameManager.recordRuns(state, 3, 1100);
    const board = GameManager.scoreboard(state);
    assert.equal(board.role, "offense");
    assert.equal(board.label, "Bottom 1");
    assert.equal(board.innings[0].opp, 3);
    assert.equal(board.oppTotal, 3);
    assert.equal(board.usTotal, 0);
    assert.equal(state.defensiveOuts.mia, 3);
    assert.equal(state.defensiveOuts.ava, 3);
    assert.equal(state.defensiveOuts.lina, 3);
    assert.equal(GameManager.formatInnings(state.defensiveOuts.mia), "1.0");
    state = GameManager.recordRuns(state, 4, 1200);
    const next = GameManager.scoreboard(state);
    assert.equal(next.usTotal, 4);
    assert.equal(next.oppTotal, 3);
    assert.equal(next.label, "Top 2");
    assert.equal(next.role, "defense");
    assert.equal(state.defensiveOuts.mia, 3);
  });

  it("accepts zero runs and rejects blank, negative, and partial numbers", () => {
    const state = start("away");
    const zero = GameManager.recordRuns(state, 0, 1100);
    assert.equal(GameManager.scoreboard(zero).usTotal, 0);
    assert.equal(GameManager.recordRuns(state, "0", 1100).innings[0].top, 0);
    assert.throws(() => GameManager.recordRuns(state, "", 1100), /whole number/);
    assert.throws(() => GameManager.recordRuns(state, -1, 1100), /whole number/);
    assert.throws(() => GameManager.recordRuns(state, 1.5, 1100), /whole number/);
    assert.equal(GameManager.parseRuns("nope"), null);
  });

  it("opens the next inning after the bottom and loads that inning's defense", () => {
    let state = start("away");
    state = GameManager.recordRuns(state, 1, 1100);
    state = GameManager.recordRuns(state, 0, 1200);
    assert.equal(state.inningIndex, 1);
    assert.equal(state.half, "top");
    assert.equal(GameManager.scoreboard(state).role, "offense");
    assert.equal(state.defense.P, "jo");
    assert.equal(state.defensiveOuts.mia || 0, 0);
    assert.equal(state.defensiveOuts.jo || 0, 0);
  });

  it("keeps the current defense when the next planned inning is empty", () => {
    const game = sampleGame();
    game.inningDefenses[1] = GameManager.emptyDefense();
    let state = start("away", game);
    state = GameManager.setDefense(state, "SS", "sub", 1050);
    state = GameManager.recordRuns(state, 1, 1100);
    state = GameManager.recordRuns(state, 1, 1200);
    assert.equal(state.defense.SS, "sub");
    assert.equal(state.defense.P, "mia");
  });
});

describe("game manager defensive innings", () => {
  it("credits each defensive out, and a mid-inning swap gets only the outs after it", () => {
    let state = start("away");
    state = GameManager.recordRuns(state, 0, 1000);
    assert.equal(state.half, "bottom");
    state = GameManager.addOut(state, 1);
    state = GameManager.addOut(state, 2);
    state = GameManager.setDefense(state, "P", "sub", 3);
    state = GameManager.addOut(state, 4);
    assert.equal(state.outs, 3);
    assert.equal(state.defensiveOuts.mia, 2);
    assert.equal(state.defensiveOuts.sub, 1);
    assert.equal(state.defensiveOuts.ava, 3);
    assert.equal(GameManager.formatInnings(state.defensiveOuts.mia), "0.2");
    assert.equal(GameManager.formatInnings(state.defensiveOuts.sub), "0.1");
    assert.equal(GameManager.formatInnings(state.defensiveOuts.ava), "1.0");
    const rows = GameManager.defensiveInningRows(state);
    assert.equal(rows.find((row) => row.id === "mia").innings, "0.2");
    assert.equal(rows.find((row) => row.id === "sub").innings, "0.1");
    state = GameManager.undoOut(state, 5);
    assert.equal(state.outs, 2);
    assert.equal(state.defensiveOuts.sub || 0, 0);
    assert.equal(state.defensiveOuts.mia, 2);
    assert.equal(state.defensiveOuts.ava, 2);
  });

  it("uses a lineup change made before the defensive half starts", () => {
    let state = start("away");
    state = GameManager.setDefense(state, "P", "sub", 1050);
    state = GameManager.recordRuns(state, 0, 1100);
    state = GameManager.addOut(state, 1);
    state = GameManager.addOut(state, 2);
    state = GameManager.addOut(state, 3);
    state = GameManager.recordRuns(state, 0, 1200);
    assert.equal(state.defensiveOuts.sub, 3);
    assert.equal(state.defensiveOuts.mia || 0, 0);
    assert.equal(state.defensiveOuts.ava, 3);
    assert.equal(GameManager.formatInnings(state.defensiveOuts.sub), "1.0");
  });

  it("credits only the outs recorded when a defensive half ends early", () => {
    let state = start("home");
    state = GameManager.addOut(state, 1);
    state = GameManager.recordRuns(state, 0, 2);
    assert.equal(state.half, "bottom");
    assert.equal(state.outs, 0);
    assert.equal(state.defensiveOuts.mia, 1);
    assert.equal(GameManager.formatInnings(state.defensiveOuts.mia), "0.1");
    state = GameManager.recordRuns(state, 0, 3);
    assert.equal(state.half, "top");
    state = GameManager.addOut(state, 4);
    state = GameManager.addOut(state, 5);
    state = GameManager.endGame(state, 6);
    assert.equal(state.status, "played");
    assert.equal(state.defensiveOuts.jo, 2);
    assert.equal(GameManager.formatInnings(state.defensiveOuts.jo), "0.2");
    assert.equal(state.defensiveOuts.mia, 1);
    assert.equal(GameManager.formatInnings(0), "0.0");
    assert.equal(GameManager.formatInnings(14), "4.2");
    assert.equal(GameManager.formatInnings(10), "3.1");
    assert.equal(GameManager.formatInnings(15), "5.0");
  });

  it("swaps two fielders and benches a replaced player", () => {
    let state = start("away");
    state = GameManager.setDefense(state, "P", "ava", 1050);
    assert.equal(state.defense.P, "ava");
    assert.equal(state.defense.C, "mia");
    state = GameManager.setDefense(state, "SS", "sub", 1060);
    assert.equal(state.defense.SS, "sub");
    assert.equal(state.defense.P, "ava");
    state = GameManager.setDefense(state, "1B", null, 1070);
    assert.equal(state.defense["1B"], null);
  });

  it("does not count a defensive half that has not been entered", () => {
    let state = start("home");
    assert.equal(GameManager.scoreboard(state).role, "defense");
    state = GameManager.endGame(state, 2000);
    assert.equal(state.status, "played");
    assert.deepEqual(state.defensiveOuts, {});
    assert.equal(state.finalUs, 0);
    assert.equal(state.finalOpp, 0);
    assert.throws(() => GameManager.recordRuns(state, 1, 2100), /not in progress/);
  });

  it("adds another inning only to the players on the field for that half", () => {
    let state = start("home");
    state = GameManager.addOut(state, 1);
    state = GameManager.addOut(state, 2);
    state = GameManager.addOut(state, 3);
    state = GameManager.recordRuns(state, 0, 1100);
    state = GameManager.recordRuns(state, 1, 1200);
    assert.equal(state.half, "top");
    assert.equal(state.inningIndex, 1);
    assert.equal(state.defense.P, "jo");
    state = GameManager.addOut(state, 4);
    state = GameManager.addOut(state, 5);
    state = GameManager.addOut(state, 6);
    state = GameManager.recordRuns(state, 2, 1300);
    assert.equal(state.defensiveOuts.mia, 3);
    assert.equal(state.defensiveOuts.jo, 3);
    assert.equal(state.defensiveOuts.ava, 6);
    assert.equal(state.defensiveOuts.lina, 6);
    assert.equal(GameManager.formatInnings(state.defensiveOuts.ava), "2.0");
    const board = GameManager.scoreboard(state);
    assert.equal(board.oppTotal, 2);
    assert.equal(board.usTotal, 1);
    assert.equal(board.label, "Bottom 2");
    assert.equal(board.role, "offense");
  });
});

describe("game length, skip bottom, and extras", () => {
  it("defaults to 7 innings and lets the coach pick another length", () => {
    assert.equal(start("home").scheduledInnings, 7);
    assert.equal(start("away", null, 5).scheduledInnings, 5);
    assert.equal(GameManager.clampScheduledInnings(undefined), 7);
    assert.equal(GameManager.clampScheduledInnings(0), 1);
    assert.equal(GameManager.clampScheduledInnings(40), 12);
  });

  it("skips the bottom and ends when the home team leads after the top of the last inning", () => {
    let state = start("home", null, 2);
    state = GameManager.recordRuns(state, 0, 1100);
    state = GameManager.recordRuns(state, 2, 1200);
    assert.equal(state.status, "live");
    assert.equal(state.half, "top");
    assert.equal(state.inningIndex, 1);
    state = GameManager.recordRuns(state, 0, 1300);
    assert.equal(state.status, "played");
    assert.equal(state.endedReason, "home-lead");
    assert.equal(state.finalUs, 2);
    assert.equal(state.finalOpp, 0);
    assert.equal(state.innings[1].bottom, "X");
    assert.equal(GameManager.endNote(state), "Home led after the top of the 2nd. Bottom skipped.");
    const board = GameManager.scoreboard(state);
    assert.equal(board.label, "Final");
    assert.equal(board.innings[1].us, "X");
    assert.equal(board.innings[1].opp, 0);
    assert.equal(board.usTotal, 2);
    const games = [sampleGame(), { id: "later", name: "vs. Hawks", battingOrder: ["mia"] }];
    assert.deepEqual(
      GameManager.unplayedGames(games.map(GameManager.slimGame), { "game-eagles": state }).map((game) => game.id),
      ["later"],
    );
  });

  it("still plays the bottom when that inning is not the last one", () => {
    let state = start("away", null, 3);
    state = GameManager.recordRuns(state, 0, 1);
    state = GameManager.recordRuns(state, 3, 2);
    state = GameManager.recordRuns(state, 0, 3);
    assert.equal(state.status, "live");
    assert.equal(state.inningIndex, 1);
    assert.equal(state.half, "bottom");
    assert.equal(GameManager.scoreboard(state).oppTotal, 3);
  });

  it("plays the bottom of the last inning when the road team is ahead or tied", () => {
    let ahead = start("away", null, 1);
    ahead = GameManager.recordRuns(ahead, 2, 1);
    assert.equal(ahead.status, "live");
    assert.equal(ahead.half, "bottom");
    let tied = start("home", null, 1);
    tied = GameManager.recordRuns(tied, 0, 1);
    assert.equal(tied.status, "live");
    assert.equal(tied.half, "bottom");
  });

  it("ends after the last inning when the game is not tied, and goes to extras when it is", () => {
    let done = start("away", null, 1);
    done = GameManager.recordRuns(done, 1, 1);
    done = GameManager.recordRuns(done, 0, 2);
    assert.equal(done.status, "played");
    assert.equal(done.endedReason, "final");
    assert.equal(done.finalUs, 1);
    assert.equal(done.finalOpp, 0);
    assert.equal(GameManager.endNote(done), "");

    let extra = start("home", null, 1);
    extra = GameManager.recordRuns(extra, 1, 1);
    extra = GameManager.recordRuns(extra, 1, 2);
    assert.equal(extra.status, "live");
    assert.equal(extra.inningIndex, 1);
    assert.equal(extra.half, "top");
    assert.equal(GameManager.isExtraHalf(extra), true);
    assert.equal(GameManager.scoreboard(extra).extra, true);
    assert.equal(GameManager.scoreboard(extra).usTotal, 1);
    assert.equal(GameManager.scoreboard(extra).oppTotal, 1);
  });

  it("shows a tiebreaker runner in an extra half without changing the score", () => {
    let state = start("away", null, 1);
    state = GameManager.recordRuns(state, 0, 1);
    state = GameManager.recordRuns(state, 0, 2);
    assert.equal(GameManager.isExtraHalf(state), true);
    assert.throws(() => GameManager.setTiebreaker(start("away", null, 7), true), /extra innings/);
    const marked = GameManager.setTiebreaker(state, true, 3);
    assert.equal(marked.tiebreaker, true);
    assert.equal(GameManager.scoreboard(marked).usTotal, 0);
    assert.equal(GameManager.scoreboard(marked).oppTotal, 0);
    state = GameManager.recordRuns(marked, 1, 4);
    assert.equal(state.innings[1].top, 1);
    assert.equal(state.innings[1].topTiebreaker, true);
    assert.equal(state.tiebreaker, false);
    assert.equal(state.half, "bottom");
    assert.equal(GameManager.isExtraHalf(state), true);
    state = GameManager.setTiebreaker(state, true, 5);
    assert.equal(state.tiebreaker, true);
    state = GameManager.recordRuns(state, 0, 6);
    assert.equal(state.status, "played");
    assert.equal(state.finalUs, 1);
    assert.equal(state.finalOpp, 0);
    assert.equal(state.innings[1].bottomTiebreaker, true);
  });
});

describe("outs", () => {
  it("counts outs up to 3 and undoes one at a time", () => {
    let state = start("away");
    assert.equal(state.outs, 0);
    state = GameManager.addOut(state, 1);
    state = GameManager.addOut(state, 2);
    assert.equal(state.outs, 2);
    state = GameManager.undoOut(state, 3);
    assert.equal(state.outs, 1);
    state = GameManager.undoOut(state, 4);
    state = GameManager.undoOut(state, 5);
    assert.equal(state.outs, 0);
    state = GameManager.addOut(state, 6);
    state = GameManager.addOut(state, 7);
    state = GameManager.addOut(state, 8);
    state = GameManager.addOut(state, 9);
    assert.equal(state.outs, 3);
  });

  it("resets outs on the next half and still ends a half before 3 outs", () => {
    let state = start("away");
    state = GameManager.addOut(state, 1);
    state = GameManager.addOut(state, 2);
    state = GameManager.recordRuns(state, 1, 3);
    assert.equal(state.outs, 0);
    assert.equal(state.half, "bottom");
    assert.equal(GameManager.scoreboard(state).usTotal, 1);
    state = GameManager.addOut(state, 4);
    state = GameManager.recordRuns(state, 0, 5);
    assert.equal(state.status, "live");
    assert.equal(state.outs, 0);
    assert.equal(state.half, "top");
  });

  it("asks to confirm the half on the third out, and cancel takes that out back", () => {
    let state = start("away");
    state = GameManager.addOut(state, 1);
    state = GameManager.addOut(state, 2);
    assert.equal(GameManager.thirdOutPrompt(state), null);
    state = GameManager.addOut(state, 3);
    assert.deepEqual(GameManager.thirdOutPrompt(state), { title: "End Top 1?", label: "Top 1" });
    const cancelled = GameManager.undoOut(state, 4);
    assert.equal(cancelled.outs, 2);
    assert.equal(GameManager.thirdOutPrompt(cancelled), null);
    assert.equal(cancelled.half, "top");
    let bottom = GameManager.recordRuns(start("away"), 0, 5);
    bottom = GameManager.addOut(bottom, 6);
    bottom = GameManager.addOut(bottom, 7);
    bottom = GameManager.addOut(bottom, 8);
    assert.equal(GameManager.thirdOutPrompt(bottom).title, "End Bottom 1?");
    const confirmed = bottom;
    assert.equal(confirmed.outs, 3);
    const advanced = GameManager.recordRuns(confirmed, 1, 9);
    assert.equal(advanced.half, "top");
    assert.equal(advanced.inningIndex, 1);
    assert.equal(advanced.outs, 0);
  });

  it("keeps the out count on the phone after a refresh", () => {
    let state = start("away");
    state = GameManager.addOut(state, 2);
    state = GameManager.addOut(state, 3);
    const store = GameManager.normalizeStore({
      version: 1,
      teams: {
        "team-16u-fransen": {
          games: [sampleGame()],
          players: players(),
          sessions: { "game-eagles": state },
        },
      },
    });
    const restored = store.teams["team-16u-fransen"].sessions["game-eagles"];
    assert.equal(restored.outs, 2);
    assert.equal(restored.status, "live");
    assert.equal(restored.half, "top");
  });
});

describe("game manager saved games", () => {
  it("ends at any point and locks the score and defensive innings so far", () => {
    const games = [sampleGame(), { id: "later", name: "vs. Hawks", battingOrder: ["mia"] }];
    let state = start("away");
    state = GameManager.recordRuns(state, 4, 1100);
    state = GameManager.addOut(state, 1);
    state = GameManager.addOut(state, 2);
    state = GameManager.addOut(state, 3);
    state = GameManager.recordRuns(state, 1, 1200);
    state = GameManager.recordRuns(state, 2, 1300);
    state = GameManager.addOut(state, 4);
    assert.equal(GameManager.scoreboard(state).role, "defense");
    assert.equal(GameManager.scoreboard(state).label, "Bottom 2");
    const outsSoFar = Object.assign({}, state.defensiveOuts);
    state = GameManager.endGame(state, 1400);
    assert.equal(state.status, "played");
    assert.equal(state.finalUs, 6);
    assert.equal(state.finalOpp, 1);
    assert.deepEqual(state.defensiveOuts, outsSoFar);
    assert.equal(state.defensiveOuts.mia, 3);
    assert.equal(state.defensiveOuts.jo, 1);
    assert.equal(GameManager.formatInnings(state.defensiveOuts.jo), "0.1");
    const board = GameManager.scoreboard(state);
    assert.equal(board.label, "Final");
    assert.equal(board.usTotal, 6);
    assert.equal(board.oppTotal, 1);
    assert.equal(board.innings.length, 2);
    assert.equal(board.innings[1].us, 2);
    assert.equal(board.innings[1].opp, null);
    assert.deepEqual(
      GameManager.unplayedGames(games.map(GameManager.slimGame), { "game-eagles": state }).map((game) => game.id),
      ["later"],
    );
    assert.throws(() => GameManager.recordRuns(state, 1, 1500), /not in progress/);
    assert.throws(() => GameManager.setDefense(state, "P", "sub", 1500), /not in progress/);
  });

  it("drops a played game from the not-yet-played list and keeps the final score", () => {
    const games = [sampleGame(), { id: "later", name: "vs. Hawks", battingOrder: ["mia"] }];
    let state = start("away");
    state = GameManager.recordRuns(state, 2, 1100);
    state = GameManager.recordRuns(state, 1, 1200);
    state = GameManager.endGame(state, 1300);
    const sessions = { "game-eagles": state };
    const waiting = GameManager.unplayedGames(games.map(GameManager.slimGame), sessions);
    assert.deepEqual(waiting.map((game) => game.id), ["later"]);
    assert.equal(state.finalUs, 2);
    assert.equal(state.finalOpp, 1);
    const board = GameManager.scoreboard(state);
    assert.equal(board.label, "Final");
    assert.equal(board.innings.length, 1);
    assert.equal(board.usTotal, 2);
    const played = GameManager.playedEntries(games, sessions);
    assert.equal(played.length, 1);
    assert.equal(played[0].session.finalUs, 2);
  });

  it("keeps an in-progress game on the list and restores it from the phone store", () => {
    const live = GameManager.recordRuns(start("away"), 2, 1100);
    const games = [sampleGame()];
    assert.equal(GameManager.unplayedGames(games, { "game-eagles": live }).length, 1);
    const store = GameManager.normalizeStore({
      version: 1,
      updatedAt: 1100,
      active: { teamId: "team-16u-fransen", gameId: "game-eagles" },
      teams: {
        "team-16u-fransen": {
          teamName: "16U Fransen",
          games: games,
          players: players(),
          sessions: { "game-eagles": live },
        },
      },
    });
    const restored = store.teams["team-16u-fransen"].sessions["game-eagles"];
    assert.equal(restored.status, "live");
    assert.equal(restored.half, "bottom");
    assert.equal(restored.side, "away");
    assert.equal(GameManager.scoreboard(restored).usTotal, 2);
    assert.equal(GameManager.roleFor(restored.side, restored.half), "defense");
    assert.equal(store.active.gameId, "game-eagles");
  });

  it("names the opponent from the lineup game title", () => {
    assert.equal(GameManager.opponentLabel("vs. Eagles - May 3"), "Eagles");
    assert.equal(GameManager.opponentLabel("New Game - Nov 20"), "Opponent");
  });
});

describe("lineup formats", () => {
  const nine = ["mia", "ava", "lina", "noa", "sky", "rory", "quinn", "elle", "jules"];
  const rest = ["blake", "remy", "sage"];

  function card(mode, order, defense) {
    return {
      id: "fmt-" + mode,
      name: "vs. Format",
      battingMode: mode,
      battingOrder: order,
      defensivePositions: Object.assign(GameManager.emptyDefense(), defense || {}),
      inningDefenses: [Object.assign(GameManager.emptyDefense(), defense || {})],
      unavailableIds: [],
    };
  }

  it("bats the whole roster and allows a free defensive sub", () => {
    const order = nine.concat(rest);
    const game = card("roster", order, { P: "mia", C: "ava", SS: "lina" });
    const view = GameManager.lineupView(game, players());
    assert.equal(view.formatLabel, "Bat the roster");
    assert.equal(view.batting.length, 12);
    assert.deepEqual(GameManager.dueSlots(12, 11), [11, 0, 1]);
    assert.deepEqual(GameManager.dueSlots(12, 8), [8, 9, 10]);
    let state = GameManager.createLiveGame({ side: "home", game: game, players: players() }, 1);
    assert.equal(state.battingMode, "roster");
    const before = GameManager.liveBatters(state).map((row) => row.id).join(",");
    const effect = GameManager.describeChange(state, { type: "field", position: "P", playerId: "blake" });
    assert.match(effect.text, /Defense-only swap, batting order unchanged \(bat the roster\)/);
    assert.match(effect.text, /enters at P/);
    state = GameManager.setDefense(state, "P", "blake", 3);
    assert.equal(GameManager.liveBatters(state).map((row) => row.id).join(","), before);
    assert.equal(state.defense.P, "blake");
    state = GameManager.addOut(state, 4);
    assert.equal(state.defensiveOuts.blake, 1);
    assert.equal(state.defensiveOuts.mia || 0, 0);
    assert.equal(GameManager.liveBatters(state).some((row) => row.id === "sage"), true);
    assert.equal(state.injuryOut, false);
    const leaving = GameManager.describeChange(state, { type: "leave", playerId: "ava" });
    assert.match(leaving.text, /stays in the batting order/);
    assert.match(leaving.text, /Not an automatic out/);
    state = GameManager.leaveRosterPlayer(state, "ava", 5);
    assert.equal(GameManager.liveBatters(state).find((row) => row.id === "ava").role, "Left game");
    assert.equal(state.defense.C, null);
    const avaOuts = state.defensiveOuts.ava || 0;
    state = GameManager.addOut(state, 6);
    assert.equal(state.defensiveOuts.ava || 0, avaOuts);
    state = GameManager.setInjuryOut(state, true, 7);
    const auto = GameManager.describeChange(state, { type: "leave", playerId: "lina" });
    assert.match(auto.text, /automatic out/);
    state = GameManager.leaveRosterPlayer(state, "lina", 8);
    assert.equal(GameManager.liveBatters(state).find((row) => row.id === "lina").role, "Auto out");
    assert.equal(GameManager.liveBatters(state).some((row) => row.id === "lina"), true);
  });

  it("bats 9, puts a sub in the starter's spot, and warns on a second re-entry", () => {
    const game = card("nine", nine, { P: "mia", C: "ava" });
    const view = GameManager.lineupView(game, players());
    assert.equal(view.formatLabel, "Bat 9");
    assert.equal(view.batting.length, 9);
    assert.ok(view.subs.some((row) => row.id === "sub"));
    let state = GameManager.createLiveGame({ side: "home", game: game, players: players() }, 1);
    const effect = GameManager.describeChange(state, { type: "bat", spot: 0, playerId: "sub" });
    assert.match(effect.text, /Brooks enters at P and takes Hill's #1 batting spot/);
    assert.match(effect.text, /Pinch hitters and pinch runners count as this sub/);
    const beforeCourtesy = JSON.stringify({ spots: state.spots, defense: state.defense, departed: state.departed });
    const courtesy = GameManager.describeChange(state, { type: "courtesy", forId: "mia", runnerId: "jo" });
    assert.match(courtesy.text, /Not a sub/);
    assert.match(courtesy.text, /Re-entry unchanged/);
    state = GameManager.setCourtesy(state, "mia", "jo", 2);
    assert.equal(JSON.stringify({ spots: state.spots, defense: state.defense, departed: state.departed }), beforeCourtesy);
    state = GameManager.applySub(state, 0, "sub", false, 2);
    assert.equal(GameManager.liveBatters(state)[0].id, "sub");
    assert.equal(state.defense.P, "sub");
    state = GameManager.addOut(state, 3);
    assert.equal(state.defensiveOuts.sub, 1);
    assert.equal(state.defensiveOuts.mia || 0, 0);
    state = GameManager.applySub(state, 0, "mia", false, 4);
    assert.equal(GameManager.liveBatters(state)[0].id, "mia");
    assert.equal(state.defense.P, "mia");
    state = GameManager.applySub(state, 0, "jo", false, 5);
    const again = GameManager.subChoice(state, 0, "mia");
    assert.equal(again.illegal, true);
    assert.match(again.reason, /original batting spot/);
    const wrongSpot = GameManager.subChoice(state, 1, "mia");
    assert.equal(wrongSpot.illegal, true);
    assert.throws(() => GameManager.applySub(state, 0, "sub", false, 6), /cannot re-enter/);
  });

  it("plays DP / Flex with 9 batters, a fielding Flex, and a role swap", () => {
    const order = nine.concat(["blake"]);
    const game = card("dp-flex", order, { P: "blake", C: "ava", DP: "mia" });
    const view = GameManager.lineupView(game, players());
    assert.equal(view.formatLabel, "DP / Flex");
    assert.equal(view.batting.length, 9);
    assert.equal(view.flexId, "blake");
    assert.equal(view.batting.some((row) => row.id === "blake"), false);
    assert.equal(view.batting[0].role, "DP");
    let state = GameManager.createLiveGame({ side: "home", game: game, players: players() }, 1);
    assert.equal(state.dpSpot, 0);
    const gameForFlex = card("dp-flex", order, { P: "blake", C: "ava", SS: "lina", DP: "mia" });
    state = GameManager.createLiveGame({ side: "home", game: gameForFlex, players: players() }, 1);
    const forFielder = GameManager.describeChange(state, { type: "field", position: "SS", playerId: "mia" });
    assert.match(forFielder.text, /Hill plays SS for Ortiz/);
    assert.match(forFielder.text, /hits only/);
    assert.match(forFielder.text, /Batting order unchanged/);
    assert.match(forFielder.text, /Flex stays at P/);
    state = GameManager.setDefense(state, "SS", "mia", 2);
    assert.equal(GameManager.liveBatters(state).some((row) => row.id === "lina"), true);
    assert.equal(state.defense.P, "blake");
    state = GameManager.addOut(state, 3);
    assert.equal(state.defensiveOuts.mia, 1);
    assert.equal(state.defensiveOuts.blake, 1);
    assert.equal(state.defensiveOuts.lina || 0, 0);
    const flexEffect = GameManager.describeChange(state, { type: "flex" });
    assert.match(flexEffect.text, /Flex bats for DP in spot 1; DP leaves offense/);
    assert.match(flexEffect.text, /Lineup drops to 9/);
    assert.match(flexEffect.text, /DP leaves SS/);
    state = GameManager.swapDpFlex(state, 4);
    assert.equal(GameManager.liveBatters(state)[0].id, "blake");
    assert.equal(state.defense.SS, null);
    assert.equal(state.defense.P, "blake");
    state = GameManager.addOut(state, 5);
    assert.equal(state.defensiveOuts.blake, 2);
    assert.equal(state.defensiveOuts.mia, 1);
    state = GameManager.swapDpFlex(state, 6);
    assert.equal(state.spots[0].starterReturned, true);
    assert.equal(GameManager.liveBatters(state)[0].id, "mia");
    state = GameManager.swapDpFlex(state, 7);
    assert.throws(() => GameManager.swapDpFlex(state, 8), /only once/);
    const forFlex = GameManager.describeChange(
      GameManager.createLiveGame({ side: "home", game: gameForFlex, players: players() }, 1),
      { type: "field", position: "P", playerId: "mia" },
    );
    assert.match(forFlex.text, /plays P for the Flex/);
    assert.match(forFlex.text, /leaves the game/);
    assert.match(forFlex.text, /Lineup drops to 9/);
    assert.match(forFlex.text, /Batting order unchanged/);
    let dropped = GameManager.createLiveGame({ side: "home", game: gameForFlex, players: players() }, 1);
    dropped = GameManager.setDefense(dropped, "P", "mia", 2);
    assert.equal(dropped.flexLeft, true);
    assert.equal(dropped.defense.P, "mia");
    assert.equal(GameManager.liveBatters(dropped).some((row) => row.id === "blake"), false);
    dropped = GameManager.addOut(dropped, 3);
    assert.equal(dropped.defensiveOuts.mia, 1);
    assert.equal(dropped.defensiveOuts.blake || 0, 0);
    const flexBack = GameManager.describeChange(dropped, { type: "flex-return" });
    assert.match(flexBack.text, /one re-entry/);
    assert.match(flexBack.text, /Batting order unchanged/);
    dropped = GameManager.reenterFlex(dropped, false, 4);
    assert.equal(dropped.defense.P, "blake");
    assert.equal(dropped.flexReentered, true);
    dropped = GameManager.setDefense(dropped, "P", "mia", 5);
    assert.equal(GameManager.describeChange(dropped, { type: "flex-return" }).illegal, true);
    assert.throws(() => GameManager.reenterFlex(dropped, false, 6), /only once/);
    let pinch = GameManager.createLiveGame({ side: "home", game: gameForFlex, players: players() }, 1);
    const pinchEffect = GameManager.describeChange(pinch, { type: "bat", spot: 0, playerId: "sub" });
    assert.match(pinchEffect.text, /takes the DP's #1 batting spot/);
    assert.match(pinchEffect.text, /Pinch hitters and pinch runners count as this sub/);
    pinch = GameManager.applySub(pinch, 0, "sub", false, 2);
    assert.equal(GameManager.liveBatters(pinch)[0].id, "sub");
    const flexSub = GameManager.describeChange(pinch, { type: "flex-sub", playerId: "jo" });
    assert.match(flexSub.text, /Defense only/);
    assert.match(flexSub.text, /Batting order unchanged/);
    const orderIds = GameManager.liveBatters(pinch).map((row) => row.id).join(",");
    pinch = GameManager.subForFlex(pinch, "jo", false, 3);
    assert.equal(pinch.defense.P, "jo");
    assert.equal(GameManager.liveBatters(pinch).map((row) => row.id).join(","), orderIds);
    pinch = GameManager.addOut(pinch, 4);
    assert.equal(pinch.defensiveOuts.jo, 1);
    assert.equal(pinch.defensiveOuts.blake || 0, 0);
    const stored = GameManager.gamesFromLineupRecord({
      games: [game],
      removedGameIds: [],
    });
    assert.equal(stored[0].battingMode, "dp-flex");
  });

  it("bats an extra hitter in the 10th spot", () => {
    const order = nine.concat(["blake"]);
    const game = card("one-ap", order, { P: "mia", SS: "lina" });
    const view = GameManager.lineupView(game, players());
    assert.equal(view.formatLabel, "Extra hitter");
    assert.equal(view.batting.length, 10);
    assert.equal(view.batting[9].role, "EH");
    assert.equal(view.batting[9].id, "blake");
    let state = GameManager.createLiveGame({ side: "home", game: game, players: players() }, 1);
    assert.equal(GameManager.playerMayField(state, "blake"), true);
    const ehEffect = GameManager.describeChange(state, { type: "bat", spot: 9, playerId: "sub" });
    assert.match(ehEffect.text, /Defense unchanged/);
    assert.match(ehEffect.text, /Pinch hitters and pinch runners count as this sub/);
    const trade = GameManager.describeChange(state, { type: "field", position: "SS", playerId: "blake" });
    assert.match(trade.text, /hits only/);
    assert.match(trade.text, /Batting order unchanged/);
    assert.match(trade.text, /All 10 still bat/);
    const fieldBefore = state.defense.P;
    state = GameManager.applySub(state, 9, "sub", false, 3);
    assert.equal(GameManager.liveBatters(state)[9].id, "sub");
    assert.equal(GameManager.liveBatters(state)[9].role, "EH");
    assert.equal(state.defense.P, fieldBefore);
    const both = GameManager.describeChange(state, { type: "bat", spot: 0, playerId: "jo" });
    assert.match(both.text, /Park enters at P and takes Hill's #1 batting spot/);
    state = GameManager.applySub(state, 0, "jo", false, 4);
    assert.equal(state.defense.P, "jo");
    state = GameManager.addOut(state, 5);
    assert.equal(state.defensiveOuts.jo, 1);
    assert.equal(state.defensiveOuts.blake || 0, 0);
    assert.equal(state.defensiveOuts.sub || 0, 0);
  });

  it("bats two extra hitters and warns before an illegal re-entry", () => {
    const order = nine.concat(["blake", "remy"]);
    const game = card("two-ap", order, { P: "mia" });
    const view = GameManager.lineupView(game, players());
    assert.equal(view.formatLabel, "Two extra hitters");
    assert.equal(view.batting.length, 11);
    assert.equal(view.batting[9].role, "EH");
    assert.equal(view.batting[10].role, "EH");
    let state = GameManager.createLiveGame({ side: "home", game: game, players: players() }, 1);
    assert.equal(GameManager.playerMayField(state, "remy"), true);
    const effect = GameManager.describeChange(state, { type: "bat", spot: 10, playerId: "sage" });
    assert.match(effect.text, /Defense unchanged/);
    assert.match(effect.text, /Pinch hitters and pinch runners count as this sub/);
    const trade = GameManager.describeChange(state, { type: "field", position: "SS", playerId: "remy" });
    assert.match(trade.text, /All 11 still bat/);
    const fieldBefore = state.defense.P;
    state = GameManager.applySub(state, 10, "sage", false, 2);
    assert.equal(state.defense.P, fieldBefore);
    assert.equal(GameManager.liveBatters(state)[10].id, "sage");
    assert.equal(GameManager.liveBatters(state)[10].role, "EH");
    state = GameManager.applySub(state, 10, "remy", false, 3);
    state = GameManager.applySub(state, 10, "jo", false, 4);
    const again = GameManager.subChoice(state, 10, "remy");
    assert.equal(again.illegal, true);
    assert.match(again.reason, /only once/);
  });
});

describe("live spot and last position", () => {
  it("names the DP's live batting spot, even if the stored index is stale", () => {
    const nine = ["mia", "ava", "lina", "noa", "sky", "rory", "quinn", "elle", "jules"];
    const early = {
      id: "dp-early",
      name: "vs. Lions",
      battingMode: "dp-flex",
      battingOrder: nine.concat(["blake"]),
      defensivePositions: Object.assign(GameManager.emptyDefense(), { P: "blake", DP: "mia" }),
      inningDefenses: [],
      unavailableIds: [],
    };
    let state = GameManager.createLiveGame({ side: "away", game: early, players: players() }, 1);
    state = Object.assign({}, state, { dpSpot: 5 });
    const text = GameManager.describeChange(state, { type: "flex" }).text;
    assert.match(text, /Flex bats for DP in spot 1;/);
    state = GameManager.swapDpFlex(state, 2);
    assert.equal(GameManager.liveBatters(state)[0].id, "blake");
    assert.equal(GameManager.liveBatters(state)[5].id, "rory");
    const lateOrder = ["ava", "lina", "noa", "sky", "rory", "mia", "quinn", "elle", "jules", "blake"];
    const late = Object.assign({}, early, { id: "dp-late", battingOrder: lateOrder });
    const lateState = GameManager.createLiveGame({ side: "away", game: late, players: players() }, 1);
    assert.match(GameManager.describeChange(lateState, { type: "flex" }).text, /spot 6/);
  });

  it("names the replaced player's live batting spot", () => {
    const game = Object.assign({}, sampleGame(), { battingMode: "nine" });
    const state = GameManager.createLiveGame({ side: "away", game: game, players: players() }, 1);
    const first = GameManager.describeChange(state, { type: "bat", spot: 0, playerId: "sub" }).text;
    assert.match(first, /takes Hill's #1 batting spot/);
    const third = GameManager.describeChange(state, { type: "bat", spot: 2, playerId: "jo" }).text;
    assert.match(third, /takes Ortiz's #3 batting spot/);
  });

  it("keeps the last field position after a player leaves the field", () => {
    const game = Object.assign({}, sampleGame(), { battingMode: "nine" });
    let state = GameManager.createLiveGame({ side: "home", game: game, players: players() }, 1);
    state = GameManager.addOut(state, 2);
    state = GameManager.applySub(state, 0, "sub", false, 3);
    assert.equal(state.defense.P, "sub");
    const row = GameManager.defensiveInningRows(state).find((item) => item.id === "mia");
    assert.equal(row.innings, "0.1");
    assert.equal(row.position, "P");
  });
});

describe("game manager page", () => {
  it("reads lineup data and keeps the dugout game on the phone", () => {
    const html = fs.readFileSync(path.join(__dirname, "../apps/game-manager.html"), "utf8");
    assert.match(html, /\/api\/softball\/state/);
    assert.equal(html.includes("/api/softball/lineup"), false);
    assert.equal(html.includes("ElksData.save"), false);
    assert.equal(html.includes("connectCloud"), false);
    assert.equal(html.includes("ElksData.load"), false);
    assert.match(html, new RegExp(GameManager.STORAGE_KEY));
    assert.match(html, /game-manager\.js/);
    assert.match(html, /id="end-game"/);
    assert.match(html, />End Game</);
    assert.match(html, /data-action="ask-end"/);
    assert.match(html, /id="confirm-end-game"/);
    assert.match(html, /Keep playing/);
    assert.match(html, /id="ended-summary"/);
    assert.match(html, /id="inning-count"/);
    assert.match(html, /id="outs"/);
    assert.match(html, /Due up/);
    assert.match(html, /On deck/);
    assert.match(html, /In the hole/);
    assert.match(html, /id="batting-order"/);
    assert.match(html, /onDefense[\s\S]*defenseEditorHtml\(session\) \+ trackerHtml\(session, true\)[\s\S]*: battingOrderHtml\(session\)/);
    assert.match(html, /\+1 Out/);
    assert.match(html, /id="undo-out"/);
    assert.match(html, /id="confirm-half-sheet"/);
    assert.match(html, /data-action="confirm-half"/);
    assert.match(html, /data-action="cancel-third-out"/);
    assert.match(html, /id="tiebreaker"/);
    assert.match(html, /Tiebreaker/);
    assert.match(html, /id="lineup-format"/);
    assert.match(html, /data-action="ask-sub"/);
    assert.match(html, /data-action="swap-dp-flex"/);
    assert.match(html, /id="illegal-sheet"/);
    assert.match(html, /Illegal re-entry/);
    assert.match(html, /playerMayField/);
    assert.match(html, /id="sub-effect"/);
    assert.match(html, /id="confirm-sub"/);
    assert.match(html, /id="due-wrap"/);
  });
});
