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

  function tapName(op) {
    if (!op) return "tap";
    if (op.type === "count") {
      if (op.foul) return "Foul";
      if (op.strikes != null && op.balls == null) return "Strike";
      if (op.balls != null) return "Ball";
      return "Count";
    }
    if (op.type === "add-out") return op.runner ? "Runner out" : "Out";
    if (op.type === "add-run") return "Run";
    if (op.type === "record-runs" || op.type === "set-half-runs") return "run total";
    if (op.type === "edit-half") return "half-runs edit";
    if (op.type === "safe") return "Safe";
    if (op.type === "undo") return "Undo";
    if (op.type === "start") return "Start";
    if (op.type === "end") return "End";
    return "tap";
  }

  function unsavedNotice(op, error) {
    if (error && error.dropNotice) return String(error.dropNotice);
    const name = tapName(op);
    const raw = error && error.message ? String(error.message) : "";
    if (/not in progress|already ended/i.test(raw)) {
      return "This " + name + " wasn't saved: the game had already ended on another phone.";
    }
    if (error && (error.code === "stale" || /already recorded|already counted/i.test(raw))) {
      if (op && op.type === "add-run") return "Another phone already counted that run. This Run was not applied.";
      return "Another phone already recorded that " + name + ". This " + name + " was not applied.";
    }
    if (raw) return "This " + name + " wasn't saved: " + raw;
    return "This " + name + " wasn't saved.";
  }

  function planWrite(serverDoc, op, applyOp, now, options) {
    const current = serverDoc || { revision: 0, appliedOpIds: [] };
    if (!op || !op.opId) {
      return {
        kind: "drop",
        doc: current,
        expectedRevision: revisionOf(current),
        rebased: false,
        notice: true,
        message: "This tap wasn't saved: it had no id.",
      };
    }
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
        kind: "drop",
        doc: current,
        expectedRevision: revisionOf(current),
        rebased: true,
        notice: true,
        message: unsavedNotice(op, error),
      };
    }
    if (resolved && resolved.doc && resolved.doc.dropNotice) {
      return {
        kind: "drop",
        doc: current,
        expectedRevision: revisionOf(current),
        rebased: true,
        notice: true,
        message: String(resolved.doc.dropNotice),
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
    let localOnly = false;
    let armed = false;
    let retryMs = 30000;
    let viewGen = 0;
    let viewCache = null;
    let viewGenSeen = -1;
    let replayAcked = null;
    let replayIds = [];
    let replayDoc = null;
    const FLUSH_CHUNK = 200;
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

    function bumpView() {
      viewGen += 1;
      viewCache = null;
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
      bumpView();
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

    function replayOnto(base, ops) {
      let doc = base;
      (ops || []).forEach(function (op) {
        if (!op || hasOp(doc, op.opId)) return;
        try {
          doc = applyOp(doc, op, op.at || Date.now());
        } catch (err) {}
      });
      return doc;
    }

    function display(now) {
      if (now) return replay(acked, queue, applyOp, now).doc;
      if (viewCache && viewGenSeen === viewGen) return viewCache;
      const ids = [];
      for (let i = 0; i < queue.length; i += 1) ids.push(queue[i] && queue[i].opId);
      let doc = acked;
      let start = 0;
      if (replayDoc && replayAcked === acked) {
        let matched = 0;
        const limit = Math.min(replayIds.length, ids.length);
        while (matched < limit && replayIds[matched] === ids[matched]) matched += 1;
        if (matched === replayIds.length) {
          doc = replayDoc;
          start = matched;
        }
      }
      if (start < queue.length) doc = replayOnto(start === 0 ? acked : doc, queue.slice(start));
      replayAcked = acked;
      replayIds = ids;
      replayDoc = doc;
      viewCache = doc;
      viewGenSeen = viewGen;
      return doc;
    }

    function acceptRemote(serverDoc) {
      const normalized = normalize(serverDoc);
      const merged = mergeRemote(acked, normalized, queue, localOpIds);
      if (merged.ignored) return false;
      const changed = revisionOf(normalized) !== revisionOf(acked) || merged.queue.length !== queue.length;
      acked = normalize(merged.acked);
      queue = merged.queue;
      bumpView();
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

    function syncOff(remote) {
      return !!(remote && remote.sync === "off");
    }

    function applyLocal(op) {
      try {
        acked = normalize(applyOp(acked, op, op.at));
      } catch (e) {
        notice = e && e.message ? e.message : "";
      }
    }

    function foldQueue() {
      const pending = queue.slice();
      queue = [];
      pending.forEach(function (op) { applyLocal(op); });
      bumpView();
    }

    function enterLocal() {
      localOnly = true;
      foldQueue();
      status = "local";
      if (pollTimer) clearInterval(pollTimer);
      if (reconnectTimer) {
        clearInterval(reconnectTimer);
        clearTimeout(reconnectTimer);
      }
      pollTimer = null;
      reconnectTimer = null;
      armed = false;
      retryMs = 30000;
      stopSocket();
      stopSocket = function () {};
      socketOpen = false;
      persist();
      emit("status");
    }

    function armLiveSync() {
      if (armed || localOnly || !started) return;
      armed = true;
      connectSocket();
      pollTimer = setInterval(function () {
        if (!started || localOnly || !visible() || socketOpen) return;
        pull();
      }, FALLBACK_POLL_MS);
      function reconnectLater() {
        if (!started || localOnly) return;
        if (!socketOpen) connectSocket();
        retryMs = Math.min(120000, retryMs * 2);
        reconnectTimer = setTimeout(reconnectLater, retryMs);
      }
      reconnectTimer = setTimeout(reconnectLater, retryMs);
    }

    async function flush() {
      if (flushing || localOnly) return;
      flushing = true;
      blocked = false;
      try {
        while (queue.length && !blocked) {
          if (!online()) {
            status = "offline";
            persist();
            emit("status");
            return;
          }
          status = "saving";
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
          const serverDoc = revisionOf(acked) >= revisionOf(remote && remote.document) ? acked : normalize(remote.document);
          const chunk = queue.slice(0, FLUSH_CHUNK);
          let working = serverDoc;
          let dropMessage = "";
          let rebased = false;
          const finished = [];
          chunk.forEach(function (op) {
            if (!op || !queue.some(function (item) { return item && item.opId === op.opId; })) return;
            const plan = planWrite(working, op, applyOp, op.at, {});
            finished.push(op.opId);
            if (plan.kind === "write") {
              working = plan.doc;
              if (plan.notice) rebased = true;
            } else if (plan.message) {
              dropMessage = plan.message;
            } else if (plan.notice) {
              dropMessage = dropMessage || NOTICE;
            }
          });
          if (!finished.length) break;
          const wrote = working !== serverDoc;
          if (!wrote) {
            queue = queue.filter(function (op) { return finished.indexOf(op.opId) < 0; });
            if (dropMessage) notice = dropMessage;
            bumpView();
            persist();
            emit("local");
            continue;
          }
          let saved;
          try {
            saved = await options.save(revisionOf(serverDoc), working);
          } catch (e) {
            status = "offline";
            persist();
            emit("status");
            return;
          }
          if (saved && saved.sync === "off") {
            enterLocal();
            return;
          }
          if (saved && saved.conflict) {
            notice = NOTICE;
            if (saved.document) acceptRemote(saved.document);
            emit("status");
            continue;
          }
          queue = queue.filter(function (op) { return finished.indexOf(op.opId) < 0; });
          if (saved && saved.document) acceptRemote(saved.document);
          else {
            acked = normalize(working);
            bumpView();
          }
          if (dropMessage) notice = dropMessage;
          else if (rebased) notice = NOTICE;
          persist();
          emit("local");
        }
        if (!queue.length && status !== "offline") status = "saved";
        persist();
        emit("status");
      } finally {
        flushing = false;
        if (!blocked && queue.length && status !== "offline") flush();
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
      localOpIds.push(next.opId);
      if (localOpIds.length > 200) localOpIds = localOpIds.slice(-200);
      blocked = false;
      notice = "";
      if (localOnly) {
        applyLocal(next);
        bumpView();
        status = "local";
        persist();
        emit("local");
        return next;
      }
      queue.push(next);
      bumpView();
      status = online() ? "saving" : "offline";
      persist();
      emit("local");
      if (online()) flush();
      return next;
    }

    async function pull() {
      if (!online()) {
        if (localOnly) return;
        status = "offline";
        emit("status");
        return;
      }
      let remote;
      try {
        remote = await options.load();
      } catch (e) {
        if (localOnly) return;
        status = "offline";
        emit("status");
        return;
      }
      if (syncOff(remote)) {
        enterLocal();
        return;
      }
      const wasLocal = localOnly;
      if (wasLocal) {
        localOnly = false;
        armed = false;
      }
      const localBefore = acked;
      if (remote && remote.document) acceptRemote(remote.document);
      queueAdopt(normalize(remote && remote.document), localBefore);
      if (queue.length) await flush();
      else if (status !== "saved") {
        status = "saved";
        persist();
        emit("status");
      }
      if (wasLocal) armLiveSync();
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
      if (typeof window !== "undefined" && options.bindWindow !== false) {
        window.addEventListener("focus", pull);
        window.addEventListener("online", function () {
          if (localOnly) {
            pull();
            return;
          }
          status = "saving";
          flush();
          pull();
        });
        window.addEventListener("offline", function () {
          if (localOnly) return;
          status = "offline";
          emit("status");
        });
        if (typeof document !== "undefined") {
          document.addEventListener("visibilitychange", function () {
            if (document.visibilityState === "visible") pull();
          });
        }
      }
      pull().then(function () {
        if (!started || localOnly) return;
        armLiveSync();
      });
    }

    function stop() {
      started = false;
      if (pollTimer) clearInterval(pollTimer);
      if (reconnectTimer) {
        clearInterval(reconnectTimer);
        clearTimeout(reconnectTimer);
      }
      stopSocket();
      stopSocket = function () {};
    }

    function statusLabel() {
      if (localOnly || status === "local") return "Sync off";
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
