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
    assert.equal(board.label, "Top 1st");
    assert.equal(board.role, "offense");
  });

  it("puts the home team on defense in the top and offense in the bottom", () => {
    assert.equal(GameManager.roleFor("home", "top"), "defense");
    assert.equal(GameManager.roleFor("home", "bottom"), "offense");
    assert.equal(GameManager.battingSide("bottom"), "home");
    const state = start("home");
    assert.equal(GameManager.scoreboard(state).role, "defense");
    assert.equal(GameManager.halfLabel(0, "top"), "Top 1st");
  });

  it("records our top-inning runs, then flips to defense", () => {
    let state = start("away");
    state = GameManager.recordRuns(state, 2, 1100);
    const board = GameManager.scoreboard(state);
    assert.equal(board.label, "Bot 1st");
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
    assert.equal(board.label, "Bot 1st");
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
    assert.equal(next.label, "Top 2nd");
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
    assert.equal(board.label, "Bot 2nd");
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
    assert.deepEqual(GameManager.thirdOutPrompt(state), { title: "End Top 1st?", label: "Top 1st" });
    const cancelled = GameManager.undoOut(state, 4);
    assert.equal(cancelled.outs, 2);
    assert.equal(GameManager.thirdOutPrompt(cancelled), null);
    assert.equal(cancelled.half, "top");
    let bottom = GameManager.recordRuns(start("away"), 0, 5);
    bottom = GameManager.addOut(bottom, 6);
    bottom = GameManager.addOut(bottom, 7);
    bottom = GameManager.addOut(bottom, 8);
    assert.equal(GameManager.thirdOutPrompt(bottom).title, "End Bot 1st?");
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
    assert.equal(GameManager.scoreboard(state).label, "Bot 2nd");
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
    assert.equal(board.innings.length, 7);
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
    assert.equal(board.innings.length, 7);
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
    assert.equal(GameManager.opponentLabel("New Game - Nov 20"), "");
    assert.equal(GameManager.opponentLabel("@ Blaine Bandits"), "Blaine Bandits");
    assert.equal(GameManager.opponentLabel("at Rogers"), "Rogers");
  });
});

describe("scoreboard away-home row order", () => {
  it("puts Us on top when we are the away team", () => {
    let state = start("away");
    state = GameManager.recordRuns(state, 2, 1100);
    assert.equal(
      GameManager.liveScoreMeta(state),
      "In progress · Bot 1st · Defense · Fransen 2, Eagles 0",
    );
    state = GameManager.recordRuns(state, 1, 1200);
    const open = GameManager.scoreboardRows(state);
    assert.deepEqual(open.map((row) => row.side), ["away", "home"]);
    assert.deepEqual(open.map((row) => row.team), ["us", "opp"]);
    assert.deepEqual(open.map((row) => row.label), ["FRAN", "EAGL"]);
    assert.deepEqual(open[0].cells.slice(0, 2), [2, null]);
    assert.equal(open[0].cells.length, 7);
    assert.deepEqual(open[1].cells.slice(0, 2), [1, null]);
    assert.equal(open[0].total, 2);
    assert.equal(open[1].total, 1);
    assert.equal(GameManager.scoreLine(state), "Fransen 2, Eagles 1");
    assert.equal(GameManager.liveScoreMeta(state), "In progress · Top 2nd · Offense · Fransen 2, Eagles 1");
    const done = GameManager.endGame(state, 1300);
    const rows = GameManager.scoreboardRows(done);
    assert.deepEqual(rows.map((row) => row.label), ["FRAN", "EAGL"]);
    assert.equal(rows[0].cells[0], 2);
    assert.equal(rows[1].cells[0], 1);
    assert.equal(rows[0].cells.length, 7);
    assert.equal(GameManager.finalScoreMeta(done), "Final Fransen 2, Eagles 1");
  });

  it("puts the opponent on top when we are the home team", () => {
    let state = start("home");
    state = GameManager.recordRuns(state, 3, 1100);
    assert.equal(
      GameManager.liveScoreMeta(state),
      "In progress · Bot 1st · Offense · Eagles 3, Fransen 0",
    );
    state = GameManager.recordRuns(state, 5, 1200);
    const open = GameManager.scoreboardRows(state);
    assert.deepEqual(open.map((row) => row.side), ["away", "home"]);
    assert.deepEqual(open.map((row) => row.team), ["opp", "us"]);
    assert.deepEqual(open.map((row) => row.label), ["EAGL", "FRAN"]);
    assert.deepEqual(open[0].cells.slice(0, 2), [3, null]);
    assert.equal(open[0].cells.length, 7);
    assert.deepEqual(open[1].cells.slice(0, 2), [5, null]);
    assert.equal(open[0].total, 3);
    assert.equal(open[1].total, 5);
    assert.equal(GameManager.scoreLine(state), "Eagles 3, Fransen 5");
    assert.equal(GameManager.liveScoreMeta(state), "In progress · Top 2nd · Defense · Eagles 3, Fransen 5");
    const done = GameManager.endGame(state, 1300);
    const rows = GameManager.scoreboardRows(done);
    assert.deepEqual(rows.map((row) => row.side), ["away", "home"]);
    assert.equal(rows[0].cells[0], 3);
    assert.equal(rows[0].cells.length, 7);
    assert.equal(rows[1].cells[0], 5);
    assert.equal(rows[1].cells.length, 7);
    assert.equal(GameManager.finalScoreMeta(done), "Final Eagles 3, Fransen 5");
  });

  it("shortens a nameless opponent to Opp in the away-home score line", () => {
    let state = start("home");
    state = Object.assign({}, state, { gameName: "Saturday Game" });
    state = GameManager.recordRuns(state, 3, 1100);
    state = GameManager.recordRuns(state, 5, 1200);
    assert.equal(GameManager.scoreboardRows(state)[0].label, "OPP");
    assert.equal(GameManager.scoreboardRows(state)[1].label, "FRAN");
    assert.equal(GameManager.scoreLine(state), "Opponent 3, Fransen 5");
  });

  it("shows the skipped bottom X on our row at the bottom of a home game", () => {
    let state = start("home", null, 2);
    state = GameManager.recordRuns(state, 0, 1100);
    state = GameManager.recordRuns(state, 2, 1200);
    state = GameManager.recordRuns(state, 0, 1300);
    assert.equal(state.status, "played");
    assert.equal(state.endedReason, "home-lead");
    const rows = GameManager.scoreboardRows(state);
    assert.deepEqual(rows.map((row) => row.side), ["away", "home"]);
    assert.equal(rows[0].label, "EAGL");
    assert.deepEqual(rows[0].cells, [0, 0]);
    assert.equal(rows[0].total, 0);
    assert.equal(rows[1].label, "FRAN");
    assert.equal(rows[1].team, "us");
    assert.deepEqual(rows[1].cells, [2, "X"]);
    assert.equal(rows[1].total, 2);
    assert.equal(GameManager.scoreLine(state), "Eagles 0, Fransen 2");
    assert.equal(GameManager.finalScoreMeta(state), "Final Eagles 0, Fransen 2");
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
    assert.equal(view.formatLabel, "Continuous order");
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
    const leaving = GameManager.describeChange(state, { type: "leave", playerId: "ava", reason: "skip" });
    assert.match(leaving.text, /Skip her spot, no out/);
    state = GameManager.leaveRosterPlayer(state, "ava", "skip", 5);
    assert.equal(GameManager.liveBatters(state).find((row) => row.id === "ava").role, "Skipped");
    assert.equal(state.defense.C, null);
    const avaOuts = state.defensiveOuts.ava || 0;
    state = GameManager.addOut(state, 6);
    assert.equal(state.defensiveOuts.ava || 0, avaOuts);
    const auto = GameManager.describeChange(state, { type: "leave", playerId: "lina", reason: "auto-out" });
    assert.match(auto.text, /An out each time her spot comes up/);
    state = GameManager.leaveRosterPlayer(state, "lina", "auto-out", 8);
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
    assert.match(effect.text, /Brooks for Hill · #1 · P/);
    const beforeCourtesy = JSON.stringify({ spots: state.spots, defense: state.defense, departed: state.departed });
    const courtesy = GameManager.describeChange(state, { type: "courtesy", forId: "mia", runnerId: "jo" });
    assert.match(courtesy.text, /CR Park for P Hill/);
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
    assert.match(again.reason, /one re-entry/);
    const wrongSpot = GameManager.subChoice(state, 1, "mia");
    assert.equal(wrongSpot.illegal, true);
    assert.match(wrongSpot.reason, /original batting spot/);
    state = GameManager.applySub(state, 0, "sub", false, 6);
    assert.equal(GameManager.liveBatters(state)[0].id, "sub");
    state = GameManager.applySub(state, 0, "jo", false, 7);
    assert.throws(() => GameManager.applySub(state, 0, "sub", false, 8), /one re-entry/);
  });

  it("plays DP / Flex with 9 batters, a fielding Flex, and a role swap", () => {
    const order = nine.concat(["blake"]);
    const game = card("dp-flex", order, { P: "blake", C: "ava", DP: "mia" });
    const view = GameManager.lineupView(game, players());
    assert.equal(view.formatLabel, "DP / FLEX");
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
    assert.match(flexEffect.text, /FLEX bats for DP in #1/);
    assert.match(flexEffect.text, /DP leaves the game/);
    assert.match(flexEffect.text, /Lineup is 9/);
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
    assert.match(pinchEffect.text, /Brooks for Hill · #1/);
    pinch = GameManager.applySub(pinch, 0, "sub", false, 2);
    assert.equal(GameManager.liveBatters(pinch)[0].id, "sub");
    const flexSub = GameManager.describeChange(pinch, { type: "flex-sub", playerId: "jo" });
    assert.match(flexSub.text, /Defense only/);
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
    assert.equal(view.formatLabel, "Bat 10 (EP)");
    assert.equal(view.batting.length, 10);
    assert.equal(view.batting[9].role, "EP");
    assert.equal(view.batting[9].id, "blake");
    let state = GameManager.createLiveGame({ side: "home", game: game, players: players() }, 1);
    assert.equal(GameManager.playerMayField(state, "blake"), true);
    const ehEffect = GameManager.describeChange(state, { type: "bat", spot: 9, playerId: "sub" });
    assert.match(ehEffect.text, /#10/);
    const trade = GameManager.describeChange(state, { type: "field", position: "SS", playerId: "blake" });
    assert.match(trade.text, /hits only/);
    assert.match(trade.text, /Batting order unchanged/);
    assert.match(trade.text, /All 10 still bat/);
    const fieldBefore = state.defense.P;
    state = GameManager.applySub(state, 9, "sub", false, 3);
    assert.equal(GameManager.liveBatters(state)[9].id, "sub");
    assert.equal(GameManager.liveBatters(state)[9].role, "EP");
    assert.equal(state.defense.P, fieldBefore);
    const both = GameManager.describeChange(state, { type: "bat", spot: 0, playerId: "jo" });
    assert.match(both.text, /Park for Hill · #1 · P/);
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
    assert.equal(view.formatLabel, "Bat 11 (2 EP)");
    assert.equal(view.batting.length, 11);
    assert.equal(view.batting[9].role, "EP");
    assert.equal(view.batting[10].role, "EP");
    let state = GameManager.createLiveGame({ side: "home", game: game, players: players() }, 1);
    assert.equal(GameManager.playerMayField(state, "remy"), true);
    const effect = GameManager.describeChange(state, { type: "bat", spot: 10, playerId: "sage" });
    assert.match(effect.text, /#11/);
    const trade = GameManager.describeChange(state, { type: "field", position: "SS", playerId: "remy" });
    assert.match(trade.text, /All 11 still bat/);
    const fieldBefore = state.defense.P;
    state = GameManager.applySub(state, 10, "sage", false, 2);
    assert.equal(state.defense.P, fieldBefore);
    assert.equal(GameManager.liveBatters(state)[10].id, "sage");
    assert.equal(GameManager.liveBatters(state)[10].role, "EP");
    state = GameManager.applySub(state, 10, "remy", false, 3);
    state = GameManager.applySub(state, 10, "jo", false, 4);
    const again = GameManager.subChoice(state, 10, "remy");
    assert.equal(again.illegal, true);
    assert.match(again.reason, /one re-entry/);
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
    assert.match(text, /FLEX bats for DP in #1/);
    state = GameManager.swapDpFlex(state, 2);
    assert.equal(GameManager.liveBatters(state)[0].id, "blake");
    assert.equal(GameManager.liveBatters(state)[5].id, "rory");
    const lateOrder = ["ava", "lina", "noa", "sky", "rory", "mia", "quinn", "elle", "jules", "blake"];
    const late = Object.assign({}, early, { id: "dp-late", battingOrder: lateOrder });
    const lateState = GameManager.createLiveGame({ side: "away", game: late, players: players() }, 1);
    assert.match(GameManager.describeChange(lateState, { type: "flex" }).text, /#6/);
  });

  it("names the replaced player's live batting spot", () => {
    const game = Object.assign({}, sampleGame(), { battingMode: "nine" });
    const state = GameManager.createLiveGame({ side: "away", game: game, players: players() }, 1);
    const first = GameManager.describeChange(state, { type: "bat", spot: 0, playerId: "sub" }).text;
    assert.match(first, /Brooks for Hill · #1/);
    const third = GameManager.describeChange(state, { type: "bat", spot: 2, playerId: "jo" }).text;
    assert.match(third, /Park for Ortiz · #3/);
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

describe("game manager rules fixes", () => {
  const nine = ["mia", "ava", "lina", "noa", "sky", "rory", "quinn", "elle", "jules"];

  function rosterGame() {
    return {
      id: "roster-game",
      name: "vs. Eagles - May 3",
      battingMode: "roster",
      battingOrder: nine.concat(["blake", "remy", "sage"]),
      defensivePositions: defense({ P: "mia", C: "ava", "1B": "lina", "2B": "noa", "3B": "sky", SS: "rory", LF: "quinn", CF: "elle", RF: "jules" }),
      inningDefenses: [],
      unavailableIds: [],
    };
  }

  it("moves due up through the order, wraps, and skips an injured spot", () => {
    let state = GameManager.createLiveGame({ side: "away", game: rosterGame(), players: players(), teamName: "16U Fransen" }, 1);
    assert.equal(GameManager.effectiveBatterIndex(state), 0);
    assert.deepEqual(GameManager.dueSlots(12, GameManager.effectiveBatterIndex(state)), [0, 1, 2]);
    state = GameManager.advanceBatter(state, 2);
    assert.equal(GameManager.effectiveBatterIndex(state), 1);
    state = GameManager.recordRuns(state, 0, 3);
    state = GameManager.recordRuns(state, 0, 4);
    assert.equal(state.half, "top");
    assert.equal(state.inningIndex, 1);
    assert.equal(GameManager.effectiveBatterIndex(state), 1);
    state = GameManager.leaveRosterPlayer(state, "lina", "skip", 5);
    state = GameManager.setBatter(state, 2, 6);
    assert.equal(GameManager.liveBatters(state)[GameManager.effectiveBatterIndex(state)].id, "noa");
  });

  it("undoes a finished half and can resume a final game", () => {
    let state = start("away", null, 1);
    state = GameManager.recordRuns(state, 1, 2);
    assert.equal(state.half, "bottom");
    state = GameManager.undo(state, 3);
    assert.equal(state.half, "top");
    assert.equal(state.innings[0].top, null);
    state = GameManager.recordRuns(state, 2, 4);
    state = GameManager.recordRuns(state, 0, 5);
    assert.equal(state.status, "played");
    state = GameManager.resumeGame(state, 6);
    assert.equal(state.status, "live");
    state = GameManager.undo(state, 7);
    assert.equal(state.status, "played");
  });

  it("keeps the runs in progress, marks a skipped bottom, and stores the end reason", () => {
    let state = start("home", null, 7);
    state = GameManager.recordRuns(state, 2, 2);
    state = GameManager.endGame(state, { reason: "time", runsThisHalf: 4 }, 3);
    assert.equal(state.status, "played");
    assert.equal(state.endedReason, "time");
    assert.equal(state.innings[0].bottom, 4);
    assert.equal(GameManager.endNote(state), "Time limit");
    let ahead = start("home", null, 7);
    ahead = GameManager.recordRuns(ahead, 0, 1);
    ahead = GameManager.recordRuns(ahead, 3, 2);
    ahead = GameManager.recordRuns(ahead, 0, 3);
    ahead = GameManager.recordRuns(ahead, 3, 4);
    ahead = GameManager.endGame(ahead, { reason: "run-rule", runsThisHalf: 0 }, 6);
    assert.equal(ahead.endedReason, "run-rule");
    assert.equal(ahead.innings[2].bottom, "X");
    const forfeit = GameManager.endGame(start("away"), { reason: "forfeit", forfeitWinner: "us" }, 7);
    assert.equal(forfeit.finalUs, 7);
    assert.equal(forfeit.finalOpp, 0);
    assert.equal(GameManager.endNote(forfeit), "Forfeit");
  });

  it("lets a time-limit tie start the tiebreaker and names our runner", () => {
    let state = start("away", null, 7);
    for (let i = 0; i < 8; i += 1) state = GameManager.recordRuns(state, 0, i + 1);
    assert.equal(state.inningIndex, 4);
    assert.equal(state.half, "top");
    state = GameManager.setScheduledInnings(state, 4, 20, { timeLimit: true });
    state = GameManager.recordRuns(state, 0, 21);
    state = GameManager.recordRuns(state, 0, 22);
    assert.equal(state.inningIndex, 5);
    assert.equal(GameManager.tiebreakerActive(state), true);
    assert.equal(state.tiebreaker, true);
    const runner = GameManager.itbRunner(state);
    assert.equal(runner.id, "lina");
  });

  it("does not put one player at two positions for a FLEX sub", () => {
    const order = nine.concat(["blake"]);
    const game = {
      id: "flex-dup",
      name: "vs. Eagles",
      battingMode: "dp-flex",
      battingOrder: order,
      defensivePositions: defense({ P: "blake", C: "ava", DP: "mia" }),
      inningDefenses: [],
      unavailableIds: [],
    };
    const state = GameManager.createLiveGame({ side: "home", game: game, players: players() }, 1);
    const blocked = GameManager.describeChange(state, { type: "flex-sub", playerId: "ava" });
    assert.equal(blocked.ok, false);
    assert.match(blocked.reason, /already playing C/);
    assert.throws(() => GameManager.subForFlex(state, "ava", false, 2), /already playing/);
  });

  it("limits courtesy runners to the pitcher and catcher and clears them", () => {
    const game = Object.assign({}, sampleGame(), { battingMode: "nine" });
    let state = GameManager.createLiveGame({ side: "away", game: game, players: players() }, 1);
    assert.equal(GameManager.courtesyChoice(state, "lina", "jo").ok, false);
    assert.equal(GameManager.courtesyChoice(state, "mia", "jo").ok, true);
    state = GameManager.setCourtesy(state, "mia", "jo", 2);
    assert.equal(GameManager.courtesyChoice(state, "ava", "jo").ok, false);
    state = GameManager.recordRuns(state, 0, 3);
    assert.deepEqual(state.courtesy, []);
    assert.equal(state.courtesyUsed.P, "jo");
  });

  it("shows every scheduled inning and does not guess the DP", () => {
    assert.equal(GameManager.scoreboard(start("away")).innings.length, 7);
    const order = nine.concat(["blake"]);
    const game = {
      id: "no-dp",
      name: "vs. Eagles",
      battingMode: "dp-flex",
      battingOrder: order,
      defensivePositions: defense({ P: "blake" }),
      inningDefenses: [],
      unavailableIds: [],
    };
    const state = GameManager.createLiveGame({ side: "home", game: game, players: players() }, 1);
    assert.equal(state.dpId, "");
  });

  it("says why a courtesy runner or a stale tap cannot land", () => {
    const state = start("away");
    assert.match(GameManager.courtesyChoice(state, "lina", "jo").reason, /pitcher or catcher/);
    assert.throws(() => GameManager.applyGameOp(GameManager.applyGameOp(GameManager.emptyDocument(), {
      type: "start",
      teamId: "t",
      input: { side: "away", game: sampleGame(), players: players(), teamName: "16U Fransen" },
    }, 1), {
      type: "add-out",
      teamId: "t",
      gameId: "game-eagles",
      atHalf: { inningIndex: 0, half: "top", outs: 2 },
    }, 2), /already recorded/);
  });
});

describe("round 2 scoring", () => {
  it("undoes one out without erasing the half or a run", () => {
    let state = start("away");
    state = GameManager.recordRuns(state, 1, 2);
    state = GameManager.addOut(state, 3);
    state = GameManager.addOut(state, 4);
    assert.equal(state.half, "bottom");
    assert.equal(state.outs, 2);
    state = GameManager.undo(state, 5);
    assert.equal(state.half, "bottom");
    assert.equal(state.outs, 1);
    assert.equal(state.innings[0].top, 1);
    assert.match(state.undoNote, /Undid: Out #2/);
  });

  it("remembers a defensive change and a FLEX swap as their own undo steps", () => {
    let state = start("home");
    state = GameManager.setDefense(state, "P", "ava", 2);
    assert.equal(state.defense.P, "ava");
    state = GameManager.undo(state, 3);
    assert.equal(state.defense.P, "mia");
    const order = ["mia", "ava", "lina", "noa", "sky", "rory", "quinn", "elle", "jules", "blake"];
    const game = {
      id: "flex-undo",
      name: "vs. Eagles",
      battingMode: "dp-flex",
      battingOrder: order,
      defensivePositions: Object.assign(GameManager.emptyDefense(), { P: "blake", C: "ava", DP: "mia" }),
      inningDefenses: [],
      unavailableIds: [],
    };
    let flex = GameManager.createLiveGame({ side: "home", game: game, players: players() }, 1);
    flex = GameManager.swapDpFlex(flex, 2);
    assert.equal(flex.flexBatting, true);
    flex = GameManager.undo(flex, 3);
    assert.equal(flex.flexBatting, false);
  });

  it("ends on the run rule after a top half when home leads", () => {
    let state = start("home");
    for (let i = 0; i < 6; i += 1) state = GameManager.recordRuns(state, i % 2 ? 4 : 0, 10 + i);
    state = GameManager.recordRuns(state, 0, 20);
    assert.equal(state.status, "played");
    assert.equal(state.endedReason, "run-rule");
    assert.equal(state.innings[3].bottom, "X");
  });

  it("records a forfeit as 7-0 for the team that did not forfeit", () => {
    const theirs = GameManager.endGame(start("home"), { reason: "forfeit", forfeitWinner: "us", runsThisHalf: 0 }, 2);
    assert.equal(theirs.finalUs, 7);
    assert.equal(theirs.finalOpp, 0);
    assert.match(GameManager.scoreLine(theirs), /0, .*7|7$/);
    const ours = GameManager.endGame(start("home"), { reason: "forfeit", forfeitWinner: "opp", runsThisHalf: 0 }, 3);
    assert.equal(ours.finalUs, 0);
    assert.equal(ours.finalOpp, 7);
    assert.equal(GameManager.endNote(GameManager.endGame(start("away"), { reason: "other", runsThisHalf: 0 }, 4)), "Other");
  });

  it("keeps the tiebreaker runner fixed after the leadoff bats", () => {
    let state = start("away", null, 1);
    state = GameManager.setScheduledInnings(state, 1, 2, { timeLimit: true });
    state = GameManager.recordRuns(state, 0, 3);
    state = GameManager.recordRuns(state, 0, 4);
    assert.equal(state.tiebreaker, true);
    const frozen = GameManager.itbRunner(state).id;
    state = GameManager.advanceBatter(state, 4);
    state = GameManager.addOut(state, 5);
    assert.equal(GameManager.itbRunner(state).id, frozen);
    const swapped = GameManager.setItbRunner(state, "mia", 6);
    assert.equal(GameManager.itbRunner(swapped).id, "mia");
    assert.equal(GameManager.itbRunner(GameManager.advanceBatter(swapped, 7)).id, "mia");
  });

  it("prompts a walk-off when the home team takes the lead, whether or not we are home", () => {
    let away = start("away", null, 1);
    away = GameManager.recordRuns(away, 1, 2);
    away = GameManager.addRun(away, 3);
    away = GameManager.addRun(away, 4);
    assert.equal(away.prompt, "walk-off");
    let home = start("home", null, 1);
    home = GameManager.recordRuns(home, 1, 2);
    home = GameManager.addRun(home, 3);
    home = GameManager.addRun(home, 4);
    assert.equal(home.prompt, "walk-off");
  });

  it("reopens a final game when an edit makes the score a tie", () => {
    let state = start("home", null, 1);
    state = GameManager.recordRuns(state, 2, 2);
    state = GameManager.recordRuns(state, 3, 3);
    assert.equal(state.status, "played");
    state = GameManager.editHalfRuns(state, 0, "bottom", 2, 4);
    assert.equal(state.status, "live");
    assert.equal(state.endedReason, "");
    assert.equal(GameManager.scoreLine(state).includes("Final"), false);
  });

  it("does not make an ejection an automatic out", () => {
    const order = ["mia", "ava", "lina", "noa", "sky", "rory", "quinn", "elle", "jules", "blake", "remy", "sage"];
    const game = {
      id: "ej",
      name: "vs. Eagles",
      battingMode: "roster",
      battingOrder: order,
      defensivePositions: GameManager.emptyDefense(),
      inningDefenses: [],
      unavailableIds: [],
    };
    let state = GameManager.createLiveGame({ side: "away", game: game, players: players() }, 1);
    state = GameManager.leaveRosterPlayer(state, "ava", "ejected", 2);
    const row = GameManager.liveBatters(state).find((item) => item.id === "ava");
    assert.equal(row.role, "Ejected");
    assert.match(state.prompt, /forfeit|Replace/);
  });

  it("charges a hit to the batting side and an error to the fielding side", () => {
    let state = start("away");
    state = GameManager.addTally(state, "hit", "us", 2);
    state = GameManager.addTally(state, "error", "opp", 3);
    const rows = GameManager.scoreboardRows(state);
    assert.equal(rows[0].hits, 1);
    assert.equal(rows[1].errors, 1);
    assert.equal(rows[0].errors, 0);
  });

  it("advances the due batter when an out is recorded on offense", () => {
    let state = start("away");
    const before = GameManager.effectiveBatterIndex(state);
    state = GameManager.addOut(state, 2);
    assert.equal(GameManager.effectiveBatterIndex(state), before + 1);
    assert.equal(state.outs, 1);
  });

  it("uses a 3 or 4 letter team code instead of a chopped last word", () => {
    assert.equal(GameManager.abbrOf("MN Elks 16U Fransen", "ELKS"), "ELKS");
    assert.equal(GameManager.abbrOf("Blaine Bandits", "OPP"), "BAND");
    assert.equal(GameManager.abbrOf("Rogers Royals 16U Gold", "OPP"), "ROYA");
    assert.notEqual(GameManager.abbrOf("Rogers Royals 16U Gold", "OPP"), "GOLD");
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
    assert.match(html, /data-action="next-batter"/);
    assert.match(html, /GameManager\.scoreboardRows\(/);
    assert.match(html, /GameManager\.scoreLine\(/);
    assert.match(html, /GameManager\.liveScoreMeta\(/);
    assert.match(html, /GameManager\.finalScoreMeta\(/);
    assert.equal(html.includes('class="who">Us'), false);
    assert.equal(html.includes('usTotal + "–"'), false);
    assert.equal(html.includes("finalUs"), false);
  });
});
