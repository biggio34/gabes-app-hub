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

function start(side, game) {
  return GameManager.createLiveGame(
    {
      side: side,
      game: game || sampleGame(),
      players: players(),
      teamName: "16U Fransen",
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
    assert.deepEqual(state.defensiveInnings, {});
  });

  it("gives opponent runs and defensive innings to the home team in the top", () => {
    let state = start("home");
    state = GameManager.recordRuns(state, 3, 1100);
    const board = GameManager.scoreboard(state);
    assert.equal(board.role, "offense");
    assert.equal(board.label, "Bottom 1");
    assert.equal(board.innings[0].opp, 3);
    assert.equal(board.oppTotal, 3);
    assert.equal(board.usTotal, 0);
    assert.equal(state.defensiveInnings.mia, 1);
    assert.equal(state.defensiveInnings.ava, 1);
    assert.equal(state.defensiveInnings.lina, 1);
    state = GameManager.recordRuns(state, 4, 1200);
    const next = GameManager.scoreboard(state);
    assert.equal(next.usTotal, 4);
    assert.equal(next.oppTotal, 3);
    assert.equal(next.label, "Top 2");
    assert.equal(next.role, "defense");
    assert.equal(state.defensiveInnings.mia, 1);
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
    assert.equal(state.defensiveInnings.mia, 1);
    assert.equal(state.defensiveInnings.jo || 0, 0);
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
  it("counts the defensive lineup used when that half ends, once per player", () => {
    let state = start("away");
    state = GameManager.recordRuns(state, 2, 1100);
    state = GameManager.setDefense(state, "P", "sub", 1150);
    assert.equal(state.defense.P, "sub");
    assert.equal(state.defense.C, "ava");
    state = GameManager.recordRuns(state, 1, 1200);
    assert.equal(state.defensiveInnings.sub, 1);
    assert.equal(state.defensiveInnings.mia || 0, 0);
    assert.equal(state.defensiveInnings.ava, 1);
    assert.equal(state.defensiveInnings.lina, 1);
    const rows = GameManager.defensiveInningRows(state);
    assert.equal(rows.find((row) => row.id === "sub").innings, 1);
    assert.equal(rows.find((row) => row.id === "mia").innings, 0);
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
    assert.deepEqual(state.defensiveInnings, {});
    assert.equal(state.finalUs, 0);
    assert.equal(state.finalOpp, 0);
    assert.throws(() => GameManager.recordRuns(state, 1, 2100), /not in progress/);
  });

  it("adds another inning only to the players on the field for that half", () => {
    let state = start("home");
    state = GameManager.recordRuns(state, 0, 1100);
    state = GameManager.recordRuns(state, 1, 1200);
    assert.equal(state.half, "top");
    assert.equal(state.inningIndex, 1);
    assert.equal(state.defense.P, "jo");
    state = GameManager.recordRuns(state, 2, 1300);
    assert.equal(state.defensiveInnings.mia, 1);
    assert.equal(state.defensiveInnings.jo, 1);
    assert.equal(state.defensiveInnings.ava, 2);
    assert.equal(state.defensiveInnings.lina, 2);
    const board = GameManager.scoreboard(state);
    assert.equal(board.oppTotal, 2);
    assert.equal(board.usTotal, 1);
    assert.equal(board.label, "Bottom 2");
    assert.equal(board.role, "offense");
  });
});

describe("game manager saved games", () => {
  it("ends at any point and locks the score and defensive innings so far", () => {
    const games = [sampleGame(), { id: "later", name: "vs. Hawks", battingOrder: ["mia"] }];
    let state = start("away");
    state = GameManager.recordRuns(state, 4, 1100);
    state = GameManager.recordRuns(state, 1, 1200);
    state = GameManager.recordRuns(state, 2, 1300);
    assert.equal(GameManager.scoreboard(state).role, "defense");
    assert.equal(GameManager.scoreboard(state).label, "Bottom 2");
    const inningsSoFar = Object.assign({}, state.defensiveInnings);
    state = GameManager.endGame(state, 1400);
    assert.equal(state.status, "played");
    assert.equal(state.finalUs, 6);
    assert.equal(state.finalOpp, 1);
    assert.deepEqual(state.defensiveInnings, inningsSoFar);
    assert.equal(state.defensiveInnings.mia, 1);
    assert.equal(state.defensiveInnings.jo || 0, 0);
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
  });
});
