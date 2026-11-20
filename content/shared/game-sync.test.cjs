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
