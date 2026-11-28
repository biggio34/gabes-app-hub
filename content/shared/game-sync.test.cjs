const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const GameManager = require("./game-manager.js");
const GameSync = require("./game-sync.js");

function defense(map) {
  return Object.assign(GameManager.emptyDefense(), map);
}

function sampleGame() {
  return {
    id: "game-eagles",
    name: "vs. Eagles - May 3",
    battingOrder: ["mia", "ava", "lina"],
    defensivePositions: defense({ P: "mia", C: "ava", SS: "lina", "1B": "jo" }),
    inningDefenses: [defense({ P: "mia", C: "ava", SS: "lina", "1B": "jo" })],
  };
}

function players() {
  return [
    { id: "mia", name: "Mia Hill", number: "4" },
    { id: "ava", name: "Ava Cole", number: "12" },
    { id: "lina", name: "Lina Ortiz", number: "7" },
    { id: "jo", name: "Jo Park", number: "2" },
  ];
}

function startInput(side) {
  return {
    side: side || "home",
    game: sampleGame(),
    players: players(),
    teamName: "16U Fransen",
    scheduledInnings: 7,
  };
}

function outsOf(doc) {
  const session = doc.teams["team-16u"].sessions["game-eagles"];
  return session ? session.outs : null;
}

function started(outs, revision) {
  let doc = GameManager.applyGameOp(GameManager.emptyDocument(), {
    type: "start",
    teamId: "team-16u",
    teamName: "16U Fransen",
    input: startInput("home"),
  }, 1000);
  for (let i = 0; i < outs; i += 1) {
    doc = GameManager.applyGameOp(doc, {
      type: "add-out",
      teamId: "team-16u",
      gameId: "game-eagles",
    }, 1000 + i);
  }
  return GameManager.stampDocument(doc, revision, "seed", 1000);
}

function memoryServer(initial) {
  let doc = GameManager.normalizeDocument(initial);
  return {
    snapshot: function () { return doc; },
    load: async function () { return { document: doc }; },
    save: async function (expected, incoming) {
      if (expected !== doc.revision) return { conflict: true, document: doc };
      doc = GameManager.normalizeDocument(incoming);
      doc.revision = expected + 1;
      return { document: doc };
    },
  };
}

afterEach(() => {
  GameSync.setConflictRule("latest-tap-wins");
});

describe("game sync conflict rule", () => {
  it("applies a stale out on top of the newer server game", () => {
    const server = started(2, 5);
    const tap = { opId: "a-out", type: "add-out", teamId: "team-16u", gameId: "game-eagles", baseRevision: 4 };
    const plan = GameSync.planWrite(server, tap, GameManager.applyGameOp, 2000);
    assert.equal(plan.kind, "write");
    assert.equal(plan.rebased, true);
    assert.equal(plan.notice, true);
    assert.equal(plan.expectedRevision, 5);
    assert.equal(outsOf(plan.doc), 3);
    assert.equal(plan.doc.revision, 6);
    assert.ok(plan.doc.appliedOpIds.includes("a-out"));
  });

  it("does not apply the same tap twice when its id is already on the server", () => {
    let server = started(2, 5);
    server = GameManager.stampDocument(server, 5, "a-out", 1500);
    const tap = { opId: "a-out", type: "add-out", teamId: "team-16u", gameId: "game-eagles", baseRevision: 4 };
    const plan = GameSync.planWrite(server, tap, GameManager.applyGameOp, 2000);
    assert.equal(plan.kind, "skip");
    assert.equal(outsOf(plan.doc), 2);
  });

  it("switches to refresh-only without applying the stale tap", () => {
    const server = started(2, 5);
    const tap = { opId: "a-out", type: "add-out", teamId: "team-16u", gameId: "game-eagles", baseRevision: 4 };
    const plan = GameSync.planWrite(server, tap, GameManager.applyGameOp, 2000, { rule: "refresh-only" });
    assert.equal(plan.kind, "drop");
    assert.equal(plan.notice, true);
    assert.equal(outsOf(server), 2);
    GameSync.setConflictRule("refresh-only");
    const active = GameSync.resolveConflict(server, tap, GameManager.applyGameOp, 2000);
    assert.equal(active.applied, false);
    assert.equal(outsOf(active.doc), 2);
  });

  it("keeps the default rule as latest tap wins", () => {
    const server = started(1, 2);
    const tap = { opId: "late", type: "add-out", teamId: "team-16u", gameId: "game-eagles", baseRevision: 1 };
    const resolved = GameSync.resolveConflict(server, tap, GameManager.applyGameOp, 3000);
    assert.equal(resolved.applied, true);
    assert.equal(outsOf(resolved.doc), 2);
  });

  it("counts one run and one batter when two phones tap together", () => {
    const server = started(0, 1);
    const atHalf = { inningIndex: 0, half: "top", outs: 0, liveRuns: 0, battingIndex: 0 };
    const once = GameManager.applyGameOp(server, {
      type: "add-run", teamId: "team-16u", gameId: "game-eagles", atHalf: atHalf,
    }, 2);
    const twice = GameManager.applyGameOp(once, {
      type: "add-run", teamId: "team-16u", gameId: "game-eagles", atHalf: atHalf,
    }, 3);
    assert.equal(outsOf(twice) === 0 && twice.teams["team-16u"].sessions["game-eagles"].liveRuns, 1);
    const stepped = GameManager.applyGameOp(twice, {
      type: "next-batter", teamId: "team-16u", gameId: "game-eagles", atHalf: atHalf,
    }, 4);
    const steppedAgain = GameManager.applyGameOp(stepped, {
      type: "next-batter", teamId: "team-16u", gameId: "game-eagles", atHalf: atHalf,
    }, 5);
    assert.equal(steppedAgain.teams["team-16u"].sessions["game-eagles"].battingIndex, stepped.teams["team-16u"].sessions["game-eagles"].battingIndex);
    const undone = GameManager.applyGameOp(steppedAgain, { type: "undo", teamId: "team-16u", gameId: "game-eagles" }, 6);
    const undoneAgain = GameManager.applyGameOp(undone, { type: "undo", teamId: "team-16u", gameId: "game-eagles" }, 7);
    assert.equal(undoneAgain.teams["team-16u"].sessions["game-eagles"].battingIndex, undone.teams["team-16u"].sessions["game-eagles"].battingIndex);
  });

  it("drops a second out aimed at the same count", async () => {
    const server = memoryServer(started(1, 3));
    const atHalf = { inningIndex: 0, half: "top", outs: 1 };
    function client() {
      return GameSync.connect({
        storage: GameSync.memoryStorage(),
        storageKey: "gm",
        normalize: GameManager.normalizeDocument,
        applyOp: GameManager.applyGameOp,
        load: server.load,
        save: server.save,
        bindWindow: false,
        online: function () { return true; },
      });
    }
    const a = client();
    const b = client();
    a.run({ type: "add-out", teamId: "team-16u", gameId: "game-eagles", opId: "tap-a", atHalf: atHalf });
    b.run({ type: "add-out", teamId: "team-16u", gameId: "game-eagles", opId: "tap-b", atHalf: atHalf });
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(outsOf(server.snapshot()), 2);
    assert.equal(a.queue().length, 0);
    assert.equal(b.queue().length, 0);
  });

  it("lands both near-simultaneous outs on the shared server", async () => {
    const server = memoryServer(started(1, 3));
    function client() {
      return GameSync.connect({
        storage: GameSync.memoryStorage(),
        storageKey: "gm",
        normalize: GameManager.normalizeDocument,
        applyOp: GameManager.applyGameOp,
        load: server.load,
        save: server.save,
        bindWindow: false,
        online: function () { return true; },
      });
    }
    const a = client();
    const b = client();
    a.run({ type: "add-out", teamId: "team-16u", gameId: "game-eagles", opId: "tap-a" });
    b.run({ type: "add-out", teamId: "team-16u", gameId: "game-eagles", opId: "tap-b" });
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(outsOf(server.snapshot()), 3);
    assert.equal(server.snapshot().appliedOpIds.includes("tap-a"), true);
    assert.equal(server.snapshot().appliedOpIds.includes("tap-b"), true);
    assert.equal(a.queue().length, 0);
    assert.equal(b.queue().length, 0);
    const notices = [a.notice(), b.notice()].filter(Boolean);
    assert.ok(notices.includes(GameSync.NOTICE));
  });
});

describe("game sync document", () => {
  it("replays a defensive swap and a queued out onto the latest server document", () => {
    const server = started(1, 4);
    const queue = [
      { opId: "swap", type: "set-defense", teamId: "team-16u", gameId: "game-eagles", position: "P", playerId: "jo" },
      { opId: "out", type: "add-out", teamId: "team-16u", gameId: "game-eagles" },
    ];
    const played = GameSync.replay(server, queue, GameManager.applyGameOp, 4000);
    const session = played.doc.teams["team-16u"].sessions["game-eagles"];
    assert.equal(session.defense.P, "jo");
    assert.equal(session.outs, 2);
    assert.equal(session.defense["1B"], "mia");
  });

  it("syncs active game selection as its own change", () => {
    const doc = GameManager.applyGameOp(GameManager.emptyDocument(), {
      type: "set-active",
      teamId: "team-16u",
      gameId: "game-eagles",
    }, 1);
    assert.deepEqual(doc.active, { teamId: "team-16u", gameId: "game-eagles" });
    const cleared = GameManager.applyGameOp(doc, { type: "set-active", teamId: "team-16u", gameId: "" }, 2);
    assert.equal(cleared.active, null);
  });

  it("uploads local sessions the server does not have and leaves the ones it does", () => {
    const local = started(1, 0);
    const server = GameManager.emptyDocument();
    const missing = GameSync.missingSnapshot(server, local);
    assert.ok(missing.teams["team-16u"].sessions["game-eagles"]);
    const adopted = GameManager.applyGameOp(server, { type: "adopt", snapshot: missing }, 9);
    assert.equal(outsOf(adopted), 1);
    const again = GameSync.missingSnapshot(adopted, local);
    assert.equal(again, null);
  });

  it("takes a newer remote document and drops taps that already landed", () => {
    const local = started(1, 3);
    const remote = GameManager.stampDocument(started(2, 4), 4, "tap-b", 50);
    const merged = GameSync.mergeRemote(local, remote, [
      { opId: "tap-b", type: "add-out" },
      { opId: "tap-a", type: "add-out" },
    ], ["tap-a"]);
    assert.equal(merged.acked.revision, 4);
    assert.equal(merged.queue.map((op) => op.opId).join(","), "tap-a");
    assert.equal(merged.notice, true);
  });

  it("keeps an offline queue and replays it in order when the server is reachable", async () => {
    const storage = GameSync.memoryStorage();
    const initial = started(0, 1);
    storage.setItem(GameManager.STORAGE_KEY, JSON.stringify({
      version: 2,
      acked: initial,
      queue: [],
      localOpIds: [],
      cache: { teams: {} },
    }));
    const online = { value: false };
    const server = memoryServer(initial);
    const client = GameSync.connect({
      storage: storage,
      storageKey: GameManager.STORAGE_KEY,
      normalize: GameManager.normalizeDocument,
      applyOp: GameManager.applyGameOp,
      legacyEnvelope: GameManager.envelopeFromLegacy,
      load: server.load,
      save: server.save,
      bindWindow: false,
      online: function () { return online.value; },
    });
    client.run({ type: "add-out", teamId: "team-16u", gameId: "game-eagles", opId: "off-1" });
    client.run({ type: "set-defense", teamId: "team-16u", gameId: "game-eagles", position: "C", playerId: "jo", opId: "off-2" });
    assert.equal(client.status(), "offline");
    assert.equal(client.statusLabel(), "Offline, will sync");
    assert.equal(client.queue().length, 2);
    assert.equal(outsOf(client.display()), 1);
    online.value = true;
    await client.pull();
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(outsOf(server.snapshot()), 1);
    assert.equal(server.snapshot().teams["team-16u"].sessions["game-eagles"].defense.C, "jo");
    assert.equal(client.queue().length, 0);
    assert.equal(client.statusLabel(), "Saved");
    const saved = JSON.parse(storage.getItem(GameManager.STORAGE_KEY));
    assert.equal(saved.version, 2);
    assert.equal(saved.queue.length, 0);
  });

  it("reads a phone-only store and queues the sessions the server lacks", () => {
    const legacy = {
      version: 1,
      updatedAt: 10,
      active: { teamId: "team-16u", gameId: "game-eagles" },
      teams: {
        "team-16u": {
          teamName: "16U",
          games: [{ id: "game-eagles", name: "vs. Eagles" }],
          players: [],
          sessions: started(1, 0).teams["team-16u"].sessions,
        },
      },
    };
    const envelope = GameManager.envelopeFromLegacy(legacy);
    assert.equal(envelope.acked.teams["team-16u"].sessions["game-eagles"].outs, 1);
    assert.equal(envelope.cache.teams["team-16u"].games[0].id, "game-eagles");
    assert.equal(GameSync.missingSnapshot(GameManager.emptyDocument(), envelope.acked).active.gameId, "game-eagles");
  });
});

describe("game sync local fallback", () => {
  it("keeps scoring on this phone when the server says sync is off", async () => {
    const storage = GameSync.memoryStorage();
    const seeded = started(0, 1);
    storage.setItem(GameManager.STORAGE_KEY, JSON.stringify({
      version: 2,
      acked: seeded,
      queue: [],
      localOpIds: [],
      cache: { teams: {} },
    }));
    let loads = 0;
    let saves = 0;
    let sockets = 0;
    let mode = "off";
    const server = memoryServer(started(0, 1));
    const client = GameSync.connect({
      storage: storage,
      storageKey: GameManager.STORAGE_KEY,
      normalize: GameManager.normalizeDocument,
      applyOp: GameManager.applyGameOp,
      legacyEnvelope: GameManager.envelopeFromLegacy,
      bindWindow: false,
      load: async function () {
        loads += 1;
        if (mode === "off") return { sync: "off", document: GameManager.emptyDocument() };
        return server.load();
      },
      save: async function (expected, incoming) {
        saves += 1;
        return server.save(expected, incoming);
      },
      subscribe: function () {
        sockets += 1;
        return function () {};
      },
    });
    client.start();
    try {
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(client.status(), "local");
    assert.equal(client.statusLabel(), "Sync off");
    assert.equal(sockets, 0);
    client.run({ type: "add-out", teamId: "team-16u", gameId: "game-eagles", opId: "local-out" });
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(saves, 0);
    assert.equal(loads, 1);
    assert.equal(client.queue().length, 0);
    assert.equal(outsOf(client.display()), 1);
    mode = "on";
    await client.pull();
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(client.statusLabel(), "Saved");
    assert.equal(sockets, 1);
    assert.equal(client.queue().length, 0);
    assert.equal(outsOf(client.display()), 1);
    } finally {
      client.stop();
    }
  });
});

describe("game sync local speed", () => {
  it("keeps the queue empty and each tap flat while sync is off", async () => {
    const storage = GameSync.memoryStorage();
    const client = GameSync.connect({
      storage: storage,
      storageKey: "gm-speed",
      normalize: GameManager.normalizeDocument,
      applyOp: GameManager.applyGameOp,
      bindWindow: false,
      load: async function () { return { sync: "off", document: null }; },
      save: async function () { return { sync: "off" }; },
      subscribe: function () { return function () {}; },
    });
    client.start();
    try {
      await new Promise((resolve) => setTimeout(resolve, 20));
      const game = {
        id: "g",
        name: "vs Eagles",
        battingMode: "nine",
        battingOrder: ["mia", "ava", "lina", "jo", "out-girl", "sub", "mia", "ava", "lina"],
        defensivePositions: defense({ P: "mia", C: "ava", SS: "lina" }),
        inningDefenses: [],
        unavailableIds: [],
      };
      client.run({
        type: "start",
        teamId: "t",
        gameId: "g",
        input: { side: "away", game: game, players: players(), teamName: "16U Fransen", scheduledInnings: 1 },
      });
      for (let n = 0; n < 40; n += 1) {
        const session = client.display().teams.t.sessions.g;
        if (!session || session.status !== "live") break;
        client.run({
          type: n % 2 ? "add-out" : "safe",
          kind: "hit",
          teamId: "t",
          gameId: "g",
        });
      }
      assert.equal(client.queue().length, 0);
      const startedAt = Date.now();
      for (let n = 0; n < 20; n += 1) client.display();
      assert.ok((Date.now() - startedAt) / 20 < 5, "display got slow");
    } finally {
      client.stop();
    }
  });
});

describe("game sync long outage", () => {
  it("keeps every out and run from a 1000-tap outage and syncs them to a second phone", async () => {
    let server = GameManager.normalizeDocument(null);
    let offline = true;
    function connect(storage) {
      return GameSync.connect({
        storage: storage,
        storageKey: "gm-outage",
        normalize: GameManager.normalizeDocument,
        applyOp: GameManager.applyGameOp,
        bindWindow: false,
        load: async function () {
          if (offline) throw new Error("offline");
          return { document: server };
        },
        save: async function (expected, incoming) {
          if (offline) throw new Error("offline");
          if (expected !== (server.revision || 0)) return { conflict: true, document: server };
          server = GameManager.normalizeDocument(incoming);
          server.revision = expected + 1;
          return { document: server };
        },
        subscribe: function () { return function () {}; },
      });
    }
    const phoneA = connect(GameSync.memoryStorage());
    phoneA.start();
    try {
      await new Promise((resolve) => setTimeout(resolve, 15));
      const game = {
        id: "g",
        name: "vs Eagles",
        battingMode: "nine",
        battingOrder: ["mia", "ava", "lina"],
        defensivePositions: defense({ P: "mia", C: "ava", SS: "lina" }),
        inningDefenses: [],
        unavailableIds: [],
      };
      phoneA.run({
        type: "start",
        teamId: "t",
        gameId: "g",
        input: { side: "away", game: game, players: players(), teamName: "16U Fransen", scheduledInnings: 200 },
      });
      phoneA.run({ type: "set-rule", teamId: "t", gameId: "g", runRule: [] });
      let taps = 0;
      while (taps < 1000) {
        const session = phoneA.display().teams.t.sessions.g;
        if (!session || session.status !== "live") break;
        if (GameManager.clampOuts(session.outs) >= 3) {
          phoneA.run({ type: "record-runs", teamId: "t", gameId: "g", runs: "1" });
        } else {
          phoneA.run({ type: "add-out", teamId: "t", gameId: "g" });
        }
        taps += 1;
      }
      const mid = phoneA.display().teams.t && phoneA.display().teams.t.sessions.g;
      assert.ok(taps >= 1000, "stopped at " + taps + " " + (mid ? mid.status + " " + mid.endedReason : "no session"));
      assert.equal(phoneA.queue().length, taps + 2);
      const before = phoneA.display().teams.t.sessions.g;
      const score = GameManager.scoreLine(before);
      const outs = before.outs;
      const runs = before.liveRuns;
      offline = false;
      await phoneA.pull();
      assert.equal(phoneA.queue().length, 0);
      const phoneB = connect(GameSync.memoryStorage());
      phoneB.start();
      await new Promise((resolve) => setTimeout(resolve, 20));
      await phoneB.pull();
      const seen = phoneB.display().teams.t.sessions.g;
      assert.equal(GameManager.scoreLine(seen), score);
      assert.equal(seen.outs, outs);
      assert.equal(seen.liveRuns, runs);
      assert.equal(seen.status, before.status);
      phoneB.stop();
    } finally {
      phoneA.stop();
    }
  });
});

describe("game sync round 7", () => {
  function game(id) {
    return {
      id: id,
      name: "vs Eagles",
      battingMode: "nine",
      battingOrder: ["mia", "ava", "lina"],
      defensivePositions: defense({ P: "mia", C: "ava", SS: "lina" }),
      inningDefenses: [],
      unavailableIds: [],
    };
  }

  it("drops a tap the finished game rejects and still syncs the next game", async () => {
    let server = GameManager.normalizeDocument(null);
    let offlineA = false;
    function connect(storage) {
      return GameSync.connect({
        storage: storage,
        storageKey: "gm-jam",
        normalize: GameManager.normalizeDocument,
        applyOp: GameManager.applyGameOp,
        bindWindow: false,
        load: async function () {
          if (offlineA && storage === phoneAStorage) throw new Error("offline");
          return { document: server };
        },
        save: async function (expected, incoming) {
          if (offlineA && storage === phoneAStorage) throw new Error("offline");
          if (expected !== (server.revision || 0)) return { conflict: true, document: server };
          server = GameManager.normalizeDocument(incoming);
          server.revision = expected + 1;
          return { document: server };
        },
        subscribe: function () { return function () {}; },
      });
    }
    const phoneAStorage = GameSync.memoryStorage();
    const phoneA = connect(phoneAStorage);
    const phoneB = connect(GameSync.memoryStorage());
    phoneA.start();
    phoneB.start();
    try {
      await new Promise((resolve) => setTimeout(resolve, 15));
      phoneA.run({
        type: "start",
        teamId: "t",
        input: { side: "away", game: game("g"), players: players(), teamName: "16U Fransen" },
      });
      await phoneA.pull();
      await phoneB.pull();
      offlineA = true;
      phoneB.run({ type: "end", teamId: "t", gameId: "g", reason: "manual", runsThisHalf: 0 });
      await phoneB.pull();
      for (let n = 0; n < 5; n += 1) phoneA.run({ type: "add-out", teamId: "t", gameId: "g" });
      phoneA.run({ type: "add-run", teamId: "t", gameId: "g" });
      phoneA.run({
        type: "start",
        teamId: "t",
        input: { side: "away", game: game("g2"), players: players(), teamName: "16U Fransen" },
      });
      for (let n = 0; n < 4; n += 1) {
        phoneA.run({ type: "add-tally", kind: "hit", side: "us", teamId: "t", gameId: "g2" });
      }
      assert.ok(phoneA.queue().length >= 8);
      offlineA = false;
      await phoneA.pull();
      assert.equal(phoneA.queue().length, 0);
      assert.match(phoneA.notice(), /wasn.t saved|weren.t saved/);
      assert.match(phoneA.notice(), /already ended/);
      const sessions = server.teams.t.sessions;
      assert.equal(sessions.g.status, "played");
      assert.equal(sessions.g2.status, "live");
      assert.equal(sessions.g2.usHits, 4);
    } finally {
      phoneA.stop();
      phoneB.stop();
    }
  });

  it("sends a long offline queue in a few round trips and stays fast per tap", async () => {
    let server = GameManager.normalizeDocument(null);
    let offline = true;
    let loads = 0;
    let saves = 0;
    const phone = GameSync.connect({
      storage: GameSync.memoryStorage(),
      storageKey: "gm-batch",
      normalize: GameManager.normalizeDocument,
      applyOp: GameManager.applyGameOp,
      bindWindow: false,
      load: async function () {
        loads += 1;
        if (offline) throw new Error("offline");
        return { document: server };
      },
      save: async function (expected, incoming) {
        saves += 1;
        if (offline) throw new Error("offline");
        if (expected !== (server.revision || 0)) return { conflict: true, document: server };
        server = GameManager.normalizeDocument(incoming);
        server.revision = expected + 1;
        return { document: server };
      },
      subscribe: function () { return function () {}; },
    });
    phone.start();
    try {
      await new Promise((resolve) => setTimeout(resolve, 10));
      phone.run({
        type: "start",
        teamId: "t",
        input: { side: "away", game: game("g"), players: players(), teamName: "16U Fransen", scheduledInnings: 7 },
      });
      const began = Date.now();
      for (let n = 0; n < 250; n += 1) {
        phone.run({ type: "add-tally", kind: "hit", side: "us", teamId: "t", gameId: "g" });
        if (n === 249) phone.display();
      }
      const perTap = (Date.now() - began) / 250;
      assert.ok(perTap < 8, "a queued tap took " + perTap.toFixed(1) + " ms");
      assert.equal(phone.queue().length, 251);
      offline = false;
      loads = 0;
      saves = 0;
      await phone.pull();
      assert.equal(phone.queue().length, 0);
      assert.ok(saves <= 4, "saves " + saves);
      assert.ok(loads <= 6, "loads " + loads);
      assert.equal(server.teams.t.sessions.g.usHits, 250);
    } finally {
      phone.stop();
    }
  });

  it("names every tap an ended game rejects and backs off on conflicts", async () => {
    let server = GameManager.normalizeDocument(null);
    let offlineA = false;
    let conflict = false;
    let saves = 0;
    function connect(storage) {
      return GameSync.connect({
        storage: storage,
        storageKey: "gm-multi",
        normalize: GameManager.normalizeDocument,
        applyOp: GameManager.applyGameOp,
        bindWindow: false,
        load: async function () {
          if (offlineA && storage === phoneAStorage) throw new Error("offline");
          return { document: server };
        },
        save: async function (expected, incoming) {
          saves += 1;
          if (offlineA && storage === phoneAStorage) throw new Error("offline");
          if (conflict) return { conflict: true, document: server };
          if (expected !== (server.revision || 0)) return { conflict: true, document: server };
          server = GameManager.normalizeDocument(incoming);
          server.revision = expected + 1;
          return { document: server };
        },
        subscribe: function () { return function () {}; },
      });
    }
    const phoneAStorage = GameSync.memoryStorage();
    const phoneA = connect(phoneAStorage);
    const phoneB = connect(GameSync.memoryStorage());
    phoneA.start();
    phoneB.start();
    try {
      await new Promise((resolve) => setTimeout(resolve, 15));
      phoneA.run({
        type: "start",
        teamId: "t",
        input: { side: "away", game: game("g"), players: players(), teamName: "16U Fransen" },
      });
      await phoneA.pull();
      await phoneB.pull();
      offlineA = true;
      phoneB.run({ type: "end", teamId: "t", gameId: "g", reason: "walk-off", runsThisHalf: 1 });
      await phoneB.pull();
      for (let n = 0; n < 4; n += 1) phoneA.run({ type: "add-out", teamId: "t", gameId: "g" });
      phoneA.run({ type: "add-run", teamId: "t", gameId: "g" });
      phoneA.run({ type: "record-runs", teamId: "t", gameId: "g", runs: "1" });
      offlineA = false;
      await phoneA.pull();
      assert.equal(phoneA.queue().length, 0);
      assert.match(phoneA.notice(), /6 taps weren't saved/);
      assert.match(phoneA.notice(), /already ended/);
      conflict = true;
      saves = 0;
      phoneA.run({
        type: "start",
        teamId: "t",
        input: { side: "away", game: game("g3"), players: players(), teamName: "16U Fransen" },
      });
      await new Promise((resolve) => setTimeout(resolve, 80));
      assert.ok(saves > 0 && saves < 12, "conflict saves " + saves);
    } finally {
      phoneA.stop();
      phoneB.stop();
    }
  });

  it("names a dropped out", async () => {
    const server = memoryServer(started(1, 3));
    const atHalf = { inningIndex: 0, half: "top", outs: 1, actionId: 1, status: "live" };
    function client() {
      return GameSync.connect({
        storage: GameSync.memoryStorage(),
        storageKey: "gm-named",
        normalize: GameManager.normalizeDocument,
        applyOp: GameManager.applyGameOp,
        load: server.load,
        save: server.save,
        bindWindow: false,
        online: function () { return true; },
      });
    }
    const a = client();
    const b = client();
    a.run({ type: "add-out", teamId: "team-16u", gameId: "game-eagles", opId: "out-a", atHalf: atHalf });
    b.run({ type: "add-out", teamId: "team-16u", gameId: "game-eagles", opId: "out-b", atHalf: atHalf });
    await new Promise((resolve) => setTimeout(resolve, 40));
    const notes = [a.notice(), b.notice()].filter(Boolean).join(" ");
    assert.match(notes, /Out/);
    assert.match(notes, /not applied|already recorded/);
    a.stop();
    b.stop();
  });
});

describe("game sync run rule notice", () => {
  it("tells the phone that lost which run rule won", async () => {
    const server = memoryServer(started(0, 1));
    function client() {
      return GameSync.connect({
        storage: GameSync.memoryStorage(),
        storageKey: "gm",
        normalize: GameManager.normalizeDocument,
        applyOp: GameManager.applyGameOp,
        load: server.load,
        save: server.save,
        bindWindow: false,
        online: function () { return true; },
      });
    }
    const winner = client();
    const loser = client();
    winner.start();
    loser.start();
    try {
      await new Promise((resolve) => setTimeout(resolve, 30));
      winner.run({
        type: "set-rule",
        teamId: "team-16u",
        gameId: "game-eagles",
        runRule: [{ after: 4, lead: 8 }],
      });
      await new Promise((resolve) => setTimeout(resolve, 40));
      assert.equal(winner.queue().length, 0);
      await loser.pull();
      assert.match(loser.notice(), /Run rule changed on another phone: 8 after 4\./);
    } finally {
      winner.stop();
      loser.stop();
    }
  });
});

describe("game sync realtime ping", () => {
  it("fetches only when the ping revision is newer", () => {
    assert.equal(GameSync.shouldFetchRevision(4, 5), true);
    assert.equal(GameSync.shouldFetchRevision(5, 5), false);
    assert.equal(GameSync.shouldFetchRevision(6, 5), false);
    assert.equal(GameSync.FALLBACK_POLL_MS >= 20000, true);
    assert.equal(GameSync.FALLBACK_POLL_MS <= 30000, true);
  });

  it("subscribes for a revision number and ignores the rest of the broadcast", () => {
    const sockets = [];
    function Socket(url) {
      this.url = url;
      this.readyState = 1;
      this.sent = [];
      sockets.push(this);
    }
    Socket.prototype.send = function (raw) { this.sent.push(JSON.parse(raw)); };
    Socket.prototype.close = function () { this.readyState = 3; if (this.onclose) this.onclose(); };
    let revision = null;
    let open = false;
    const stop = GameSync.openBroadcast({
      url: "https://example.supabase.co",
      anonKey: "anon-public",
      topic: "game-manager:club-mn-elks",
      Socket: Socket,
      onRevision: function (next) { revision = next; },
      onState: function (state) { open = state; },
    });
    const sock = sockets[0];
    assert.match(sock.url, /^wss:\/\/example\.supabase\.co\/realtime\/v1\/websocket\?apikey=anon-public/);
    sock.onopen();
    assert.equal(sock.sent[0][2], "realtime:game-manager:club-mn-elks");
    assert.equal(sock.sent[0][3], "phx_join");
    assert.equal(sock.sent[0][4].config.private, false);
    sock.onmessage({
      data: JSON.stringify(["1", "1", "realtime:game-manager:club-mn-elks", "phx_reply", { status: "ok", response: {} }]),
    });
    assert.equal(open, true);
    sock.onmessage({
      data: JSON.stringify([null, null, "realtime:game-manager:club-mn-elks", "broadcast", {
        type: "broadcast",
        event: "revision",
        payload: { revision: 7, lineup: "secret" },
      }]),
    });
    assert.equal(revision, 7);
    stop();
  });
});
