/**
 * Reusable sync layer for Game Manager.
 *
 * Future features plug in by enqueueing an op. This module loads the shared
 * document, subscribes to push updates, writes with a revision check, and
 * keeps an offline queue. It does not know about softball lineups.
 *
 * Conflict rule: change the body of resolveConflict to switch the product.
 *   latest-tap-wins — apply the tap on the newest server document.
 *   refresh-only — keep the server document and do not apply the stale tap.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.GameSync = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const NOTICE = "Updated from another device";
  const FALLBACK_POLL_MS = 25000;

  function shouldFetchRevision(localRevision, pingRevision) {
    const local = Number(localRevision);
    const ping = Number(pingRevision);
    if (!Number.isFinite(ping)) return false;
    if (!Number.isFinite(local)) return true;
    return ping > local;
  }

  function broadcastSocketUrl(baseUrl, anonKey) {
    const base = String(baseUrl || "").replace(/\/$/, "").replace(/^http/i, "ws");
    const root = /\/realtime\/v1/i.test(base) ? base : base + "/realtime/v1";
    return root + "/websocket?apikey=" + encodeURIComponent(anonKey || "") + "&vsn=1.0.0";
  }

  function revisionFromFrame(frame) {
    if (!Array.isArray(frame) || frame.length < 5) return null;
    const eventName = frame[3];
    const payload = frame[4] || {};
    if (eventName === "broadcast" && payload && payload.event === "revision") {
      const revision = payload.payload && payload.payload.revision;
      return typeof revision === "number" ? revision : null;
    }
    if (eventName === "revision" && typeof payload.revision === "number") return payload.revision;
    return null;
  }

  /**
   * Browser subscription to a public Supabase Realtime Broadcast channel.
   * The only message handled is a revision number. The caller then loads the
   * document from the hub API.
   */
  function openBroadcast(options) {
    const settings = options || {};
    const topicName = "realtime:" + String(settings.topic || "").replace(/^realtime:/, "");
    const Socket = settings.Socket || (typeof WebSocket !== "undefined" ? WebSocket : null);
    const onRevision = typeof settings.onRevision === "function" ? settings.onRevision : function () {};
    const onState = typeof settings.onState === "function" ? settings.onState : function () {};
    if (!Socket) {
      onState(false);
      return function () {};
    }
    let closed = false;
    let ref = 0;
    const ws = new Socket(broadcastSocketUrl(settings.url, settings.anonKey));
    function send(joinRef, event, topic, payload) {
      ref += 1;
      if (!ws || ws.readyState !== 1) return;
      ws.send(JSON.stringify([joinRef, String(ref), topic, event, payload || {}]));
    }
    ws.onopen = function () {
      send("1", "phx_join", topicName, {
        config: {
          broadcast: { ack: false, self: false },
          presence: { enabled: false },
          postgres_changes: [],
          private: false,
        },
        access_token: settings.anonKey || "",
      });
    };
    const heart = setInterval(function () {
      if (closed) return;
      send(null, "heartbeat", "phoenix", {});
    }, 20000);
    if (heart.unref) heart.unref();
    ws.onmessage = function (event) {
      if (!event || typeof event.data !== "string") return;
      let frame;
      try {
        frame = JSON.parse(event.data);
      } catch (e) {
        return;
      }
      if (!Array.isArray(frame) || frame.length < 5) return;
      const eventName = frame[3];
      const payload = frame[4] || {};
      if (eventName === "phx_reply" && payload.status === "ok" && frame[2] === topicName) {
        onState(true);
        return;
      }
      const revision = revisionFromFrame(frame);
      if (revision != null) onRevision(revision);
    };
    ws.onerror = function () { onState(false); };
    ws.onclose = function () { onState(false); };
    return function () {
      closed = true;
      clearInterval(heart);
      try { ws.close(); } catch (e) {}
    };
  }

  function revisionOf(doc) {
    const n = Number(doc && doc.revision);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.floor(n);
  }

  function appliedIds(doc) {
    const ids = doc && Array.isArray(doc.appliedOpIds) ? doc.appliedOpIds : [];
    return ids.map(String).filter(Boolean);
  }

  function hasOp(doc, opId) {
    if (!opId) return false;
    return appliedIds(doc).indexOf(String(opId)) >= 0;
  }

  function stamp(doc, revision, opId, now) {
    const next = Object.assign({}, doc || {});
    next.revision = revision;
    next.updatedAt = now || Date.now();
    const ids = appliedIds(doc);
    if (opId && ids.indexOf(String(opId)) < 0) ids.push(String(opId));
    next.appliedOpIds = ids.slice(-200);
    return next;
  }

  function latestTapWins(serverDoc, op, applyOp, now) {
    return { applied: true, doc: applyOp(serverDoc, op, now) };
  }

  function refreshOnly(serverDoc) {
    return { applied: false, doc: serverDoc };
  }

  let conflictRule = latestTapWins;

  function setConflictRule(rule) {
    if (rule === "refresh-only") conflictRule = refreshOnly;
    else if (rule === "latest-tap-wins") conflictRule = latestTapWins;
    else if (typeof rule === "function") conflictRule = rule;
    else throw new Error("Unknown conflict rule.");
    return rule;
  }

  function resolveConflict(serverDoc, op, applyOp, now) {
    return conflictRule(serverDoc, op, applyOp, now);
  }

  function ruleFrom(options) {
    if (!options || !options.rule) return resolveConflict;
    if (options.rule === "refresh-only") return refreshOnly;
    if (options.rule === "latest-tap-wins") return latestTapWins;
    if (typeof options.rule === "function") return options.rule;
    return resolveConflict;
  }

  function planWrite(serverDoc, op, applyOp, now, options) {
    const current = serverDoc || { revision: 0, appliedOpIds: [] };
    if (!op || !op.opId) return { kind: "stop", doc: current, error: "Missing change.", rebased: false, notice: false };
    if (hasOp(current, op.opId)) {
      return {
        kind: "skip",
        doc: current,
        expectedRevision: revisionOf(current),
        rebased: false,
        notice: false,
      };
    }
    const sawConflict = !!(options && options.conflict);
    const baseRevision = op.baseRevision == null || op.baseRevision === "" ? null : Number(op.baseRevision);
    const stale = sawConflict || (baseRevision != null && baseRevision !== revisionOf(current));
    let resolved;
    try {
      resolved = stale
        ? ruleFrom(options)(current, op, applyOp, now)
        : { applied: true, doc: applyOp(current, op, now) };
    } catch (error) {
      return {
        kind: "stop",
        doc: current,
        error: error && error.message ? error.message : String(error),
        rebased: stale,
        notice: false,
        expectedRevision: revisionOf(current),
      };
    }
    if (!resolved || !resolved.applied) {
      return {
        kind: "drop",
        doc: current,
        expectedRevision: revisionOf(current),
        rebased: true,
        notice: true,
      };
    }
    return {
      kind: "write",
      doc: stamp(resolved.doc, revisionOf(current) + 1, op.opId, now),
      expectedRevision: revisionOf(current),
      rebased: stale,
      notice: stale,
    };
  }

  function replay(doc, queue, applyOp, now) {
    let current = doc;
    let error = "";
    (queue || []).forEach(function (op) {
      if (!op || hasOp(current, op.opId)) return;
      try {
        current = applyOp(current, op, now || op.at || Date.now());
      } catch (err) {
        error = err && err.message ? err.message : String(err);
      }
    });
    return { doc: current, error: error };
  }

  function mergeRemote(acked, serverDoc, queue, localOpIds) {
    const serverRev = revisionOf(serverDoc);
    const localRev = revisionOf(acked);
    if (serverRev < localRev) {
      return { acked: acked, queue: queue || [], notice: false, ignored: true };
    }
    if (serverRev === localRev) {
      const nextQueue = (queue || []).filter(function (op) {
        return !hasOp(serverDoc, op.opId);
      });
      return { acked: acked, queue: nextQueue, notice: false, ignored: false };
    }
    const known = {};
    (localOpIds || []).forEach(function (id) { known[String(id)] = true; });
    appliedIds(acked).forEach(function (id) { known[id] = true; });
    const foreign = appliedIds(serverDoc).some(function (id) { return !known[id]; });
    const nextQueue = (queue || []).filter(function (op) {
      return !hasOp(serverDoc, op.opId);
    });
    return { acked: serverDoc, queue: nextQueue, notice: foreign, ignored: false };
  }

  function missingSnapshot(serverDoc, localDoc) {
    const server = serverDoc || { teams: {}, active: null };
    const local = localDoc || { teams: {}, active: null };
    const snapshot = { active: null, teams: {} };
    let found = false;
    Object.keys(local.teams || {}).forEach(function (teamId) {
      const src = local.teams[teamId] || {};
      const dst = (server.teams && server.teams[teamId]) || { sessions: {} };
      const sessions = {};
      Object.keys(src.sessions || {}).forEach(function (gid) {
        if (!dst.sessions || !dst.sessions[gid]) {
          sessions[gid] = src.sessions[gid];
          found = true;
        }
      });
      if (Object.keys(sessions).length) {
        snapshot.teams[teamId] = { teamName: src.teamName || "", sessions: sessions };
      }
    });
    if (!server.active && local.active) {
      snapshot.active = local.active;
      found = true;
    }
    return found ? snapshot : null;
  }

  function memoryStorage() {
    const data = {};
    return {
      getItem: function (key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
      setItem: function (key, value) { data[key] = String(value); },
    };
  }

  function connect(opts) {
    const options = opts || {};
    const normalize = options.normalize || function (doc) { return doc || { revision: 0, appliedOpIds: [], teams: {}, active: null }; };
    const applyOp = options.applyOp;
    if (typeof applyOp !== "function") throw new Error("GameSync needs applyOp.");
    let acked = normalize(null);
    let queue = [];
    let localOpIds = [];
    let cache = { teams: {} };
    let status = "saved";
    let notice = "";
    let flushing = false;
    let blocked = false;
    let started = false;
    let socketOpen = false;
    let stopSocket = function () {};
    let pollTimer = null;
    let reconnectTimer = null;
    let opCounter = 0;
    let migrating = false;
    const listeners = [];

    function online() {
      if (typeof options.online === "function") return options.online() !== false;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
      return true;
    }

    function visible() {
      if (typeof options.visible === "function") return options.visible() !== false;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return false;
      return true;
    }

    function persist() {
      if (!options.storage || !options.storageKey) return;
      try {
        options.storage.setItem(options.storageKey, JSON.stringify({
          version: 2,
          acked: acked,
          queue: queue,
          localOpIds: localOpIds.slice(-200),
          cache: cache,
        }));
      } catch (e) {}
    }

    function restore(raw) {
      let envelope = null;
      if (raw && raw.version === 2 && raw.acked) {
        envelope = {
          acked: raw.acked,
          queue: Array.isArray(raw.queue) ? raw.queue : [],
          localOpIds: Array.isArray(raw.localOpIds) ? raw.localOpIds.map(String) : [],
          cache: raw.cache && typeof raw.cache === "object" ? raw.cache : { teams: {} },
        };
      } else if (typeof options.legacyEnvelope === "function") {
        envelope = options.legacyEnvelope(raw);
      }
      if (!envelope) return;
      acked = normalize(envelope.acked);
      queue = envelope.queue || [];
      localOpIds = envelope.localOpIds || [];
      cache = envelope.cache || { teams: {} };
      if (!cache.teams) cache.teams = {};
    }

    if (options.storage && options.storageKey) {
      try {
        restore(JSON.parse(options.storage.getItem(options.storageKey) || "null"));
      } catch (e) {
        restore(null);
      }
    }

    function emit(reason) {
      listeners.slice().forEach(function (fn) {
        try { fn(reason); } catch (e) {}
      });
    }

    function display(now) {
      return replay(acked, queue, applyOp, now).doc;
    }

    function acceptRemote(serverDoc) {
      const normalized = normalize(serverDoc);
      const merged = mergeRemote(acked, normalized, queue, localOpIds);
      if (merged.ignored) return false;
      const changed = revisionOf(normalized) !== revisionOf(acked) || merged.queue.length !== queue.length;
      acked = normalize(merged.acked);
      queue = merged.queue;
      if (merged.notice) notice = NOTICE;
      if (!queue.length && status !== "offline") status = "saved";
      persist();
      if (changed || merged.notice) emit("remote");
      return changed;
    }

    function queueAdopt(serverDoc, localDoc) {
      if (migrating) return;
      if (queue.some(function (op) { return op.type === "adopt"; })) return;
      const snap = missingSnapshot(serverDoc, localDoc);
      if (!snap) return;
      migrating = true;
      try {
        run({ type: "adopt", snapshot: snap });
      } finally {
        migrating = false;
      }
    }

    async function flush() {
      if (flushing) return;
      flushing = true;
      blocked = false;
      let paused = false;
      let sawConflict = false;
      let attempts = 0;
      try {
        while (queue.length && !blocked) {
          attempts += 1;
          if (attempts > 8) {
            paused = true;
            status = "saving";
            persist();
            emit("status");
            return;
          }
          if (!online()) {
            status = "offline";
            persist();
            emit("status");
            return;
          }
          status = "saving";
          const op = queue[0];
          let remote;
          try {
            remote = await options.load();
          } catch (e) {
            status = "offline";
            persist();
            emit("status");
            return;
          }
          const localBefore = acked;
          if (remote && remote.document) acceptRemote(remote.document);
          queueAdopt(normalize(remote && remote.document), localBefore);
          if (!queue.length) break;
          if (!queue[0] || queue[0].opId !== op.opId) {
            sawConflict = false;
            continue;
          }
          const serverDoc = revisionOf(acked) >= revisionOf(remote && remote.document) ? acked : normalize(remote.document);
          const plan = planWrite(serverDoc, queue[0], applyOp, queue[0].at, { conflict: sawConflict });
          if (plan.kind === "skip" || plan.kind === "drop") {
            queue.shift();
            if (plan.notice) notice = NOTICE;
            sawConflict = false;
            persist();
            emit("local");
            continue;
          }
          if (plan.kind === "stop") {
            blocked = true;
            status = queue.length ? "saving" : "saved";
            persist();
            emit("status");
            return;
          }
          let saved;
          try {
            saved = await options.save(plan.expectedRevision, plan.doc);
          } catch (e) {
            status = "offline";
            persist();
            emit("status");
            return;
          }
          if (saved && saved.conflict) {
            sawConflict = true;
            notice = NOTICE;
            if (saved.document) acceptRemote(saved.document);
            emit("status");
            continue;
          }
          sawConflict = false;
          if (plan.notice) notice = NOTICE;
          if (saved && saved.document) acceptRemote(saved.document);
          else if (queue[0] && queue[0].opId === op.opId) queue.shift();
          persist();
        }
        status = "saved";
        persist();
        emit("status");
      } finally {
        flushing = false;
        if (!paused && !blocked && queue.length && status !== "offline") flush();
      }
    }

    function run(op, now) {
      const next = Object.assign({}, op || {});
      opCounter += 1;
      if (!next.opId) {
        const rand = Math.random().toString(36).slice(2, 8);
        next.opId = "op-" + Date.now().toString(36) + "-" + opCounter + "-" + rand;
      }
      next.baseRevision = queue.length ? null : revisionOf(acked);
      next.at = now || Date.now();
      queue.push(next);
      localOpIds.push(next.opId);
      if (localOpIds.length > 200) localOpIds = localOpIds.slice(-200);
      blocked = false;
      notice = "";
      status = online() ? "saving" : "offline";
      persist();
      emit("local");
      if (online()) flush();
      return next;
    }

    async function pull() {
      if (!online()) {
        status = "offline";
        emit("status");
        return;
      }
      let remote;
      try {
        remote = await options.load();
      } catch (e) {
        status = "offline";
        emit("status");
        return;
      }
      const localBefore = acked;
      if (remote && remote.document) acceptRemote(remote.document);
      queueAdopt(normalize(remote && remote.document), localBefore);
      if (queue.length) flush();
      else if (status !== "saved") {
        status = "saved";
        persist();
        emit("status");
      }
    }

    function connectSocket() {
      if (typeof options.subscribe !== "function") return;
      stopSocket();
      stopSocket = options.subscribe(function (revision) {
        if (shouldFetchRevision(revisionOf(acked), revision) && online()) pull();
      }, function (open) {
        socketOpen = !!open;
      }) || function () {};
    }

    function start() {
      if (started) return;
      started = true;
      pull();
      connectSocket();
      if (typeof window !== "undefined" && options.bindWindow !== false) {
        window.addEventListener("focus", pull);
        window.addEventListener("online", function () {
          status = "saving";
          flush();
          pull();
        });
        window.addEventListener("offline", function () {
          status = "offline";
          emit("status");
        });
        if (typeof document !== "undefined") {
          document.addEventListener("visibilitychange", function () {
            if (document.visibilityState === "visible") pull();
          });
        }
      }
      pollTimer = setInterval(function () {
        if (!started || !visible() || socketOpen) return;
        pull();
      }, FALLBACK_POLL_MS);
      reconnectTimer = setInterval(function () {
        if (started && !socketOpen) connectSocket();
      }, 3000);
    }

    function stop() {
      started = false;
      if (pollTimer) clearInterval(pollTimer);
      if (reconnectTimer) clearInterval(reconnectTimer);
      stopSocket();
      stopSocket = function () {};
    }

    function statusLabel() {
      if (status === "offline") return "Offline, will sync";
      if (status === "saving" || queue.length) return "Saving";
      return "Saved";
    }

    return {
      start: start,
      stop: stop,
      run: run,
      pull: pull,
      persist: persist,
      display: display,
      status: function () { return status; },
      statusLabel: statusLabel,
      notice: function () { return notice; },
      queue: function () { return queue.slice(); },
      acked: function () { return acked; },
      getCache: function () { return cache; },
      setCache: function (next) {
        cache = next || { teams: {} };
        persist();
      },
      onChange: function (fn) { listeners.push(fn); },
    };
  }

  return {
    NOTICE: NOTICE,
    FALLBACK_POLL_MS: FALLBACK_POLL_MS,
    shouldFetchRevision: shouldFetchRevision,
    broadcastSocketUrl: broadcastSocketUrl,
    revisionFromFrame: revisionFromFrame,
    openBroadcast: openBroadcast,
    revisionOf: revisionOf,
    hasOp: hasOp,
    latestTapWins: latestTapWins,
    refreshOnly: refreshOnly,
    setConflictRule: setConflictRule,
    resolveConflict: resolveConflict,
    planWrite: planWrite,
    replay: replay,
    mergeRemote: mergeRemote,
    missingSnapshot: missingSnapshot,
    memoryStorage: memoryStorage,
    connect: connect,
  };
});
