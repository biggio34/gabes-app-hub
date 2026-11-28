/**
 * Dugout game state for Game Manager.
 * Pure helpers: half innings, home/away offense and defense, runs, and
 * defensive innings. Live state is synced by GameSync; this file does not
 * read or write Lineup Builder data.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.GameManager = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const STORAGE_KEY = "mn-elks-game-manager-v1";
  const FIELD_POSITIONS = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"];

  function emptyDefense() {
    const defense = {};
    FIELD_POSITIONS.forEach(function (pos) {
      defense[pos] = null;
    });
    return defense;
  }

  function cloneDefense(src) {
    const defense = emptyDefense();
    if (!src || typeof src !== "object" || Array.isArray(src)) return defense;
    Object.keys(src).forEach(function (key) {
      const id = src[key];
      defense[key] = id ? String(id) : null;
    });
    return defense;
  }

  function defenseHasAssignments(defense) {
    if (!defense || typeof defense !== "object") return false;
    return FIELD_POSITIONS.some(function (pos) {
      return Boolean(defense[pos]);
    });
  }

  function parseRuns(value) {
    if (typeof value === "number") {
      if (!Number.isInteger(value) || value < 0 || value > 99) return null;
      return value;
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!/^\d{1,2}$/.test(trimmed)) return null;
      return parseInt(trimmed, 10);
    }
    return null;
  }

  function slimPlayer(player) {
    if (!player || player.id == null || String(player.id).trim() === "") return null;
    const first = String(player.firstName || "").trim();
    const last = String(player.lastName || "").trim();
    const joined = [first, last].filter(Boolean).join(" ");
    const name = joined || String(player.name || "").trim() || "Unnamed";
    const rawNumber = player.number == null ? "" : String(player.number).trim();
    const number = rawNumber && rawNumber !== "undefined" ? rawNumber : "";
    return { id: String(player.id), name: name, number: number };
  }

  function playerLabel(player) {
    if (!player) return "Unknown";
    const name = String(player.name || "").trim() || "Unnamed";
    const number = player.number != null ? String(player.number).trim() : "";
    return number ? "#" + number + " " + name : name;
  }

  function slimGame(game) {
    if (!game || game.id == null || String(game.id).trim() === "") return null;
    const defenses = Array.isArray(game.inningDefenses) ? game.inningDefenses.map(cloneDefense) : [];
    return {
      id: String(game.id),
      name: String(game.name || game.gameInfo || "Untitled Game").trim() || "Untitled Game",
      battingMode: normalizeMode(game.battingMode),
      battingOrder: Array.isArray(game.battingOrder) ? game.battingOrder.map(String) : [],
      defensivePositions: cloneDefense(game.defensivePositions),
      inningDefenses: defenses,
      unavailableIds: Array.isArray(game.unavailableIds) ? game.unavailableIds.map(String) : [],
      lastUpdated: Number(game.lastUpdated) || Number(game.contentUpdatedAt) || 0,
    };
  }

  function normalizeMode(mode) {
    const key = String(mode || "roster");
    if (key === "nine" || key === "dp-flex" || key === "one-ap" || key === "two-ap" || key === "roster") return key;
    return "roster";
  }

  function formatInfo(mode) {
    const key = normalizeMode(mode);
    const table = {
        roster: {
        label: "Continuous order",
        detail: "Everyone bats. An injury skips her spot. Anyone else who leaves is an out each time that spot comes up.",
      },
      nine: {
        label: "Bat 9",
        detail: "Nine bat. Any player may re-enter once, in her same batting spot.",
      },
      "dp-flex": {
        label: "DP / FLEX",
        detail: "Ten on the card, nine bat. The FLEX is defense only. If the FLEX bats for the DP, the DP leaves the game.",
      },
      "one-ap": {
        label: "Bat 10 (EP)",
        detail: "Ten bat. The EP is fixed in her spot and may play defense. She may re-enter once.",
      },
      "two-ap": {
        label: "Bat 11 (2 EP)",
        detail: "Eleven bat. Each EP is fixed in her spot and may play defense. Each may re-enter once.",
      },
    };
    return Object.assign({ key: key }, table[key]);
  }

  function usesReentry(mode) {
    const key = normalizeMode(mode);
    return key === "nine" || key === "one-ap" || key === "two-ap" || key === "dp-flex";
  }

  function batterIdsForMode(game) {
    const mode = normalizeMode(game && game.battingMode);
    const order = (game && game.battingOrder ? game.battingOrder : []).map(String).filter(Boolean);
    const unavailable = new Set((game && game.unavailableIds ? game.unavailableIds : []).map(String));
    const available = order.filter(function (id) { return !unavailable.has(id); });
    if (mode === "dp-flex") return available.slice(0, Math.max(0, available.length - (available.length >= 10 ? 1 : 0)));
    if (mode === "nine") return available.slice(0, 9);
    if (mode === "one-ap") return available.slice(0, 10);
    if (mode === "two-ap") return available.slice(0, 11);
    return available;
  }

  function flexIdFor(game) {
    if (normalizeMode(game && game.battingMode) !== "dp-flex") return "";
    const order = (game.battingOrder || []).map(String).filter(Boolean);
    return order.length >= 10 ? order[order.length - 1] : "";
  }

  function dpIdFor(game) {
    if (normalizeMode(game && game.battingMode) !== "dp-flex") return "";
    const dp = game.defensivePositions && game.defensivePositions.DP;
    return dp ? String(dp) : "";
  }

  function remember(state, next, label) {
    if (!state || !next) return next;
    const prior = JSON.parse(JSON.stringify(state));
    delete prior.history;
    const history = (Array.isArray(state.history) ? state.history : []).concat([prior]).slice(-20);
    next.history = history;
    next.lastAction = label || "";
    next.undoNote = "";
    next.actionSeq = (Number(state.actionSeq) || 0) + 1;
    return next;
  }

  function undo(state, now) {
    if (!state || !Array.isArray(state.history) || !state.history.length) {
      throw new Error("Nothing to undo.");
    }
    const history = state.history.slice();
    const prev = history.pop();
    const note = "Undid: " + (state.lastAction || "last play");
    return Object.assign({}, prev, {
      history: history,
      undoNote: note,
      updatedAt: now || Date.now(),
    });
  }

  function ensureEntries(state) {
    const entries = {};
    const raw = state && state.entries && typeof state.entries === "object" ? state.entries : {};
    Object.keys(raw).forEach(function (id) {
      const entry = raw[id] || {};
      const spot = Number(entry.spot);
      entries[String(id)] = {
        spot: Number.isFinite(spot) ? spot : -1,
        reentered: !!entry.reentered,
      };
    });
    if (Object.keys(entries).length) return entries;
    ((state && state.spots) || []).forEach(function (spot, index) {
      if (!spot || !spot.starterId) return;
      entries[String(spot.starterId)] = { spot: index, reentered: !!spot.starterReturned };
    });
    return entries;
  }

  function starterEntries(ids) {
    const entries = {};
    ids.forEach(function (id, index) {
      entries[String(id)] = { spot: index, reentered: false };
    });
    return entries;
  }

  function buildSpots(ids) {
    return ids.map(function (id) {
      return { starterId: String(id), currentId: String(id), starterReturned: false };
    });
  }

  function dueSlots(length, dueIndex) {
    const n = Math.max(0, Math.floor(Number(length) || 0));
    if (!n) return [];
    let start = Math.floor(Number(dueIndex) || 0) % n;
    if (start < 0) start += n;
    const slots = [];
    const shown = Math.min(3, n);
    for (let i = 0; i < shown; i += 1) slots.push((start + i) % n);
    return slots;
  }

  function isEhSpot(state, index) {
    const mode = normalizeMode(state && state.battingMode);
    return (mode === "one-ap" || mode === "two-ap") && index >= 9;
  }

  function spotIndexOf(state, playerId) {
    const id = String(playerId || "");
    if (!id || !state || !state.spots) return -1;
    return state.spots.findIndex(function (spot) { return slotCurrent(spot) === id; });
  }

  function flexStillOnCard(state) {
    return !!(state && state.battingMode === "dp-flex" && !state.flexLeft && !state.flexBatting);
  }

  function playerMayField(state, playerId) {
    const mode = normalizeMode(state && state.battingMode);
    if (mode === "roster" || !state || !state.spots || !state.spots.length) return true;
    const id = String(playerId || "");
    if (!id) return false;
    if (mode === "one-ap" || mode === "two-ap") return spotIndexOf(state, id) >= 0;
    if (mode === "dp-flex") {
      const dpId = String(state.dpId || "");
      const flexId = String(state.flexId || "");
      const flexNow = String(state.flexCurrentId || flexId);
      if (id === flexId) return !state.flexLeft;
      if (id === flexNow && flexNow !== flexId) return true;
      if (id === dpId) return !state.flexBatting;
      return inLineup(state, id);
    }
    return inLineup(state, id);
  }

  function fieldBlockReason(state, playerId) {
    const mode = normalizeMode(state && state.battingMode);
    const id = String(playerId || "");
    if (mode === "dp-flex" && id === String(state.dpId || "") && state.flexBatting) {
      return "The DP has left the offense. She can play defense again after she re-enters.";
    }
    if (mode === "dp-flex" && id === String(state.flexId || "") && state.flexLeft) {
      return "The Flex has left the game. She may re-enter once on defense.";
    }
    return "That player is not in the game. Sub them into the batting order first.";
  }

  function inLineup(state, playerId) {
    if (!playerId || !state || !state.spots) return false;
    return state.spots.some(function (spot) { return spot.currentId === String(playerId); });
  }

  function subChoice(state, spotIndex, playerId) {
    if (!state || !usesReentry(state.battingMode)) return { ok: false, illegal: false, reason: "This lineup does not use re-entry." };
    const spot = state.spots && state.spots[spotIndex];
    const incoming = String(playerId || "");
    if (!spot || !incoming) return { ok: false, illegal: false, reason: "Pick a player and a batting spot." };
    if (state.battingMode === "dp-flex" && incoming === String(state.flexId || "")) {
      return { ok: false, illegal: false, reason: "A sub for the Flex is defense only." };
    }
    if (incoming === slotCurrent(spot)) return { ok: false, illegal: false, reason: "That player is already in this spot." };
    if (inLineup(state, incoming)) return { ok: false, illegal: false, reason: "That player is already in the batting order." };
    const entry = ensureEntries(state)[incoming];
    if (entry) {
      if (entry.spot !== spotIndex) {
        return { ok: false, illegal: true, reason: "Must re-enter in her original batting spot #" + (entry.spot + 1) + " (USA 4-5)." };
      }
      if (entry.reentered) {
        return { ok: false, illegal: true, reason: "Already used her one re-entry (USA 4-5)." };
      }
      return { ok: true, illegal: false, kind: "reenter", reason: "" };
    }
    return { ok: true, illegal: false, kind: "sub", reason: "" };
  }

  function slotCurrent(spot) {
    return spot && spot.currentId ? String(spot.currentId) : "";
  }

  function applySub(state, spotIndex, playerId, force, now) {
    const choice = subChoice(state, spotIndex, playerId);
    if (!choice.ok && !(force && choice.illegal)) throw new Error(choice.reason || "That substitution is not allowed.");
    const spots = state.spots.map(function (spot) { return Object.assign({}, spot); });
    const spot = spots[spotIndex];
    const incoming = String(playerId);
    const leaving = slotCurrent(spot);
    const flexId = String(state.flexId || "");
    const departed = (state.departed || []).map(String);
    if (leaving && departed.indexOf(leaving) < 0) departed.push(leaving);
    if (incoming === spot.starterId) spot.starterReturned = true;
    spot.currentId = incoming;
    const defense = cloneDefense(state.defense);
    FIELD_POSITIONS.forEach(function (pos) {
      if (defense[pos] === incoming) defense[pos] = null;
    });
    FIELD_POSITIONS.forEach(function (pos) {
      if (defense[pos] === leaving) defense[pos] = incoming;
    });
    const entries = ensureEntries(state);
    const prior = entries[incoming];
    entries[incoming] = {
      spot: prior && prior.spot >= 0 ? prior.spot : spotIndex,
      reentered: !!(prior && prior.spot === spotIndex),
    };
    let flexBatting = !!state.flexBatting;
    if (normalizeMode(state.battingMode) === "dp-flex" && spotIndex === state.dpSpot && incoming !== flexId) {
      flexBatting = false;
    }
    return remember(state, Object.assign({}, state, {
      spots: spots,
      departed: departed,
      entries: entries,
      defense: defense,
      lastFieldPos: rememberFieldPositions(state, defense),
      flexBatting: flexBatting,
      updatedAt: now || Date.now(),
    }));
  }

  function liveDpIndex(state) {
    const spots = (state && state.spots) || [];
    const dpId = String((state && state.dpId) || "");
    const byStarter = spots.findIndex(function (spot) { return spot && spot.starterId === dpId; });
    if (byStarter >= 0) return byStarter;
    const stored = Number(state && state.dpSpot);
    if (Number.isFinite(stored) && stored >= 0 && spots[stored]) return stored;
    return 0;
  }

  function sanitizeLastFieldPos(raw) {
    const last = {};
    if (!raw || typeof raw !== "object") return last;
    Object.keys(raw).forEach(function (id) {
      const pos = raw[id];
      if (FIELD_POSITIONS.indexOf(pos) >= 0) last[String(id)] = pos;
    });
    return last;
  }

  function rememberFieldPositions(state, defense) {
    const last = Object.assign({}, state && state.lastFieldPos);
    const source = defense || (state && state.defense) || {};
    FIELD_POSITIONS.forEach(function (pos) {
      const id = source[pos] ? String(source[pos]) : "";
      if (id) last[id] = pos;
    });
    return last;
  }

  function swapDpFlex(state, now, force) {
    if (!state || state.battingMode !== "dp-flex") throw new Error("This lineup is not DP / Flex.");
    const spots = state.spots.map(function (spot) { return Object.assign({}, spot); });
    const spot = spots[liveDpIndex(state)];
    if (!spot) throw new Error("The DP spot is missing.");
    const flexId = String(state.flexId || "");
    const dpId = String(state.dpId || "");
    const current = slotCurrent(spot);
    if (current && current !== dpId && current !== flexId) {
      throw new Error("A sub is in the DP spot. Re-enter the DP in that spot.");
    }
    if (!state.flexBatting) {
      spot.currentId = flexId;
      const defense = cloneDefense(state.defense);
      FIELD_POSITIONS.forEach(function (pos) {
        if (defense[pos] === dpId) defense[pos] = null;
      });
      return remember(state, Object.assign({}, state, {
        spots: spots,
        defense: defense,
        lastFieldPos: rememberFieldPositions(state, defense),
        flexBatting: true,
        dpSpot: liveDpIndex({ spots: spots, dpId: dpId, dpSpot: state.dpSpot }),
        updatedAt: now || Date.now(),
      }), "FLEX bats for DP");
    }
    if (spot.starterReturned && !force) throw new Error("The DP may re-enter only once.");
    spot.currentId = dpId;
    spot.starterReturned = true;
    return remember(state, Object.assign({}, state, {
      spots: spots,
      flexBatting: false,
      dpReentered: true,
      updatedAt: now || Date.now(),
    }), "DP re-enters");
  }

  function possessive(name) {
    if (/s$/i.test(name)) return name + "'";
    return name + "'s";
  }

  function givenName(state, playerId) {
    const id = String(playerId || "");
    const player = ((state && state.players) || []).find(function (item) { return item && item.id === id; });
    const label = playerLabel(player || { id: id, name: id || "Player" }).replace(/^#\d+\s+/, "");
    const parts = label.split(/\s+/).filter(Boolean);
    return parts.length ? parts[0] : "She";
  }

  function lastName(state, playerId) {
    const id = String(playerId || "");
    const player = ((state && state.players) || []).find(function (item) { return item && item.id === id; });
    const label = playerLabel(player || { id: id, name: id || "Player" }).replace(/^#\d+\s+/, "");
    const parts = label.split(/\s+/).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : "Player";
  }

  function describeChange(state, change) {
    if (!state || !change) return { ok: false, illegal: false, reason: "Nothing to change.", text: "" };
    if (change.type === "flex") return describeFlex(state);
    if (change.type === "field") return describeField(state, change.position, change.playerId);
    if (change.type === "bat") return describeBat(state, change.spot, change.playerId);
    if (change.type === "leave") return describeLeave(state, change.playerId, change.reason);
    if (change.type === "courtesy") return describeCourtesy(state, change.forId, change.runnerId);
    if (change.type === "flex-sub") return describeFlexSub(state, change.playerId);
    if (change.type === "flex-return") return describeFlexReturn(state);
    return { ok: false, illegal: false, reason: "Unknown change.", text: "" };
  }

  function describeBat(state, spotIndex, playerId) {
    const choice = subChoice(state, spotIndex, playerId);
    const spot = state.spots && state.spots[spotIndex];
    const leaving = spot ? slotCurrent(spot) : "";
    const pos = leaving ? currentPosition(state.defense, leaving) : "";
    const incomingName = lastName(state, playerId);
    const leavingName = possessive(lastName(state, leaving));
    const leavingIndex = (state.spots || []).findIndex(function (item) { return slotCurrent(item) === leaving; });
    const spotNo = leavingIndex >= 0 ? leavingIndex + 1 : spotIndex + 1;
    let text;
    if (state.battingMode === "dp-flex" && spotIndex === state.dpSpot) {
      text = incomingName + " for " + leavingName.replace(/'s$|'$/, "") + " · #" + spotNo + (pos ? " · " + pos : "") + ".";
    } else if (pos) {
      text = incomingName + " for " + leavingName.replace(/'s$|'$/, "") + " · #" + spotNo + " · " + pos + ".";
    } else {
      text = incomingName + " for " + leavingName.replace(/'s$|'$/, "") + " · #" + spotNo + ".";
    }
    return { ok: choice.ok, illegal: !!choice.illegal, reason: choice.reason || "", text: text };
  }

  function describeField(state, position, playerId) {
    const nextId = playerId ? String(playerId) : "";
    const current = state.defense && state.defense[position] ? String(state.defense[position]) : "";
    if (nextId && nextId === current) return { ok: false, illegal: false, reason: "That player is already here.", text: "" };
    if (nextId && !playerMayField(state, nextId)) {
      return { ok: false, illegal: false, reason: fieldBlockReason(state, nextId), text: "" };
    }
    if (FIELD_POSITIONS.indexOf(position) < 0) return { ok: false, illegal: false, reason: "Unknown position.", text: "" };
    const incomingName = nextId ? lastName(state, nextId) : "";
    const leavingName = current ? lastName(state, current) : "";
    const from = nextId ? currentPosition(state.defense, nextId) : "";
    let detail;
    if (!nextId) detail = leavingName + " leaves " + position + ".";
    else if (from && from !== position && leavingName) detail = incomingName + " moves from " + from + " to " + position + ". " + leavingName + " moves to " + from + ".";
    else if (from && from !== position) detail = incomingName + " moves from " + from + " to " + position + ".";
    else if (leavingName) detail = incomingName + " enters at " + position + " for " + leavingName + ".";
    else detail = incomingName + " enters at " + position + ".";
    const mode = normalizeMode(state.battingMode);
    const dpId = String(state.dpId || "");
    const flexId = String(state.flexId || "");
    let text;
    if (mode === "roster") {
      text = "Defense-only swap, batting order unchanged (bat the roster). " + detail + " No one is subbed out of the order.";
    } else if (mode === "dp-flex" && nextId === dpId && current === flexId && flexStillOnCard(state)) {
      text = incomingName + " plays " + position + " for the Flex. " + leavingName + " leaves the game. Lineup drops to 9. Batting order unchanged.";
    } else if (mode === "dp-flex" && nextId === dpId && current && current !== flexId) {
      const flexPos = currentPosition(state.defense, flexId);
      text = incomingName + " plays " + position + " for " + leavingName + ". " + leavingName + " hits only. Batting order unchanged.";
      text += flexPos ? " Flex stays at " + flexPos + "." : " Flex stays on defense.";
    } else if (mode === "one-ap" || mode === "two-ap") {
      const count = mode === "one-ap" ? "10" : "11";
      text = detail + (leavingName ? " " + leavingName + " hits only." : "") + " Batting order unchanged. All " + count + " still bat.";
    } else text = "Defense-only swap, batting order unchanged. " + detail;
    return { ok: true, illegal: false, reason: "", text: text };
  }

  function describeFlex(state) {
    if (!state || state.battingMode !== "dp-flex") {
      return { ok: false, illegal: false, reason: "This lineup is not DP / Flex.", text: "" };
    }
    const dpIndex = liveDpIndex(state);
    const spot = state.spots && state.spots[dpIndex];
    const current = spot ? slotCurrent(spot) : "";
    const flexId = String(state.flexId || "");
    const dpId = String(state.dpId || "");
    if (current && current !== dpId && current !== flexId) {
      return { ok: false, illegal: false, reason: "A sub is in the DP spot. Re-enter the DP in that spot.", text: "" };
    }
    const spotNo = dpIndex + 1;
    if (!state.flexBatting) {
      const dpPos = currentPosition(state.defense, dpId);
      const flexPos = currentPosition(state.defense, flexId);
      let text = "FLEX bats for DP in #" + spotNo + ". DP leaves the game (1 re-entry left). Lineup is 9.";
      if (dpPos) text += " DP leaves " + dpPos + ".";
      else if (flexPos) text += " " + lastName(state, flexId) + " stays at " + flexPos + ".";
      else text += " Defense unchanged.";
      return { ok: true, illegal: false, reason: "", text: text };
    }
    const illegal = !!(spot && spot.starterReturned);
    return {
      ok: !illegal,
      illegal: illegal,
      reason: illegal ? "The DP may re-enter only once." : "",
      text: "DP re-enters in #" + spotNo + ", her one re-entry. FLEX returns to defense only. Lineup is 10.",
    };
  }

  function describeLeave(state, playerId, reason) {
    if (!state || state.battingMode !== "roster") {
      return { ok: false, illegal: false, reason: "Only the continuous order uses this.", text: "" };
    }
    const id = String(playerId || "");
    const order = ((state.lineupSnapshot && state.lineupSnapshot.battingOrder) || []).map(String);
    const found = order.indexOf(id);
    const spotNo = found >= 0 ? found + 1 : 1;
    const name = lastName(state, id);
    const why = reason === "skip" || reason === "auto-out" || reason === "ejected" ? reason : "";
    if (!why) return { ok: false, illegal: false, reason: "Pick why she is leaving.", text: "" };
    const pos = currentPosition(state.defense, id);
    let text = name + " leaves · #" + spotNo + ". ";
    if (why === "skip") text += "Injured. Skip her spot, no out.";
    else if (why === "ejected") text += "Ejected. Replace her, or the game is a forfeit.";
    else text += "Left early. An out each time her spot comes up.";
    if (pos) text += " Leaves " + pos + ".";
    const active = activeBatterCount(Object.assign({}, state, { rosterLeft: Object.assign({}, state.rosterLeft, { [id]: why }) }));
    if (active < 8) text += " Fewer than 8 can bat.";
    return { ok: true, illegal: false, reason: "", text: text };
  }

  function describeCourtesy(state, forId, runnerId) {
    const check = courtesyChoice(state, forId, runnerId);
    const text = check.ok
      ? "CR " + lastName(state, runnerId) + " for " + (check.pos || "P/C") + " " + lastName(state, forId) + "."
      : "";
    return { ok: check.ok, illegal: !!check.illegal, reason: check.reason || "", text: text };
  }

  function describeFlexSub(state, playerId) {
    if (!state || state.battingMode !== "dp-flex") {
      return { ok: false, illegal: false, reason: "This lineup is not DP / FLEX.", text: "" };
    }
    const flexNow = String(state.flexCurrentId || state.flexId || "");
    const pos = currentPosition(state.defense, flexNow);
    if (!pos || state.flexLeft) return { ok: false, illegal: false, reason: "The FLEX is not on defense.", text: "" };
    const incoming = String(playerId || "");
    const held = currentPosition(state.defense, incoming);
    if (held) {
      return { ok: false, illegal: false, reason: givenName(state, incoming) + " is already playing " + held + ".", text: "" };
    }
    if (inLineup(state, incoming) || spotIndexOf(state, incoming) >= 0) {
      return { ok: false, illegal: false, reason: "She's already in the batting order.", text: "" };
    }
    const entry = ensureEntries(state)[incoming];
    if (entry && entry.reentered) {
      return {
        ok: false,
        illegal: true,
        reason: "Already used her one re-entry (USA 4-5).",
        text: lastName(state, incoming) + " cannot return for the FLEX.",
      };
    }
    if (entry && entry.spot >= 0) {
      return { ok: false, illegal: true, reason: "Must re-enter in her original batting spot #" + (entry.spot + 1) + " (USA 4-5).", text: "" };
    }
    return {
      ok: true,
      illegal: false,
      reason: "",
      text: lastName(state, incoming) + " for FLEX at " + pos + ". Defense only.",
    };
  }

  function describeFlexReturn(state) {
    if (!state || !state.flexLeft) {
      return { ok: false, illegal: false, reason: "The Flex is already in the game.", text: "" };
    }
    const pos = state.flexPos || "P";
    const illegal = !!state.flexReentered;
    return {
      ok: !illegal,
      illegal: illegal,
      reason: illegal ? "The Flex may re-enter only once." : "",
      text: lastName(state, state.flexId) + " re-enters on defense at " + pos + ", her one re-entry. Lineup is 10 again. Batting order unchanged.",
    };
  }

  function liveBatters(state) {
    const players = (state && state.players) || [];
    const byId = new Map(players.map(function (player) { return [player.id, player]; }));
    function label(id) { return playerLabel(byId.get(id) || { id: id, name: "Unknown" }); }
    if (!state || !state.spots || normalizeMode(state.battingMode) === "roster") {
      const view = lineupView(state && state.lineupSnapshot, players);
      const left = (state && state.rosterLeft) || {};
      return view.batting.map(function (row) {
        if (left[row.id] === "auto-out") return Object.assign({}, row, { role: "Auto out" });
        if (left[row.id] === "ejected") return Object.assign({}, row, { role: "Ejected" });
        if (left[row.id] === "skip" || left[row.id] === "stay") return Object.assign({}, row, { role: "Skipped" });
        return row;
      });
    }
    return state.spots.map(function (spot, index) {
      const id = slotCurrent(spot);
      let role = "";
      if (state.battingMode === "dp-flex" && (id === state.dpId || id === state.flexId || spot.starterId === state.dpId)) {
        role = state.flexBatting && id === state.flexId ? "Flex" : "DP";
      }
      if ((state.battingMode === "one-ap" || state.battingMode === "two-ap") && index >= 9) role = "EP";
      return { order: index + 1, id: id, starterId: spot.starterId, role: role, label: label(id) };
    });
  }

  function gamesFromLineupRecord(record) {
    if (!record || typeof record !== "object") return [];
    if (Array.isArray(record.games)) {
      const removed = new Set(
        (Array.isArray(record.removedGameIds) ? record.removedGameIds : []).map(String),
      );
      return record.games
        .filter(function (game) {
          return game && game.id != null && !removed.has(String(game.id));
        })
        .map(slimGame)
        .filter(Boolean);
    }
    if (Array.isArray(record.battingOrder) || record.defensivePositions || record.gameInfo) {
      const game = slimGame({
        id: record.id || "legacy-lineup",
        name: record.gameInfo || record.name || "Migrated Lineup",
        battingOrder: record.battingOrder,
        defensivePositions: record.defensivePositions,
        inningDefenses: record.inningDefenses,
        unavailableIds: record.unavailableIds,
        lastUpdated: record.lastUpdated,
      });
      return game ? [game] : [];
    }
    return [];
  }

  function selectLineupRecord(lineups, teamId) {
    const map = lineups && typeof lineups === "object" && !Array.isArray(lineups) ? lineups : {};
    const key = teamId != null ? String(teamId) : "";
    const mine = key && map[key] ? map[key] : null;
    if (gamesFromLineupRecord(mine).length) return mine;
    if (gamesFromLineupRecord(map.all).length) return map.all;
    return mine;
  }

  function playersOnTeam(players, teamId) {
    const list = Array.isArray(players) ? players : [];
    const key = teamId != null ? String(teamId) : "";
    return list
      .filter(function (player) {
        if (!player) return false;
        if (!key || key === "all") return true;
        return String(player.assignedTeamId || "") === key;
      })
      .map(slimPlayer)
      .filter(Boolean);
  }

  function battingSide(half) {
    return half === "bottom" ? "home" : "away";
  }

  function roleFor(side, half) {
    return side === battingSide(half) ? "offense" : "defense";
  }

  function halfLabel(inningIndex, half) {
    const n = (Number(inningIndex) || 0) + 1;
    return (half === "bottom" ? "Bot" : "Top") + " " + ordinal(n);
  }

  function opponentLabel(gameName) {
    const name = String(gameName || "").trim();
    const match = name.match(/^(?:vs\.?|v\.?|versus|@|at)\s+(.+)$/i);
    if (!match) return "";
    const trimmed = match[1].replace(/\s+[-–—].*$/, "").trim();
    return trimmed || "";
  }

  function teamWords(name) {
    const colors = { gold: 1, black: 1, blue: 1, white: 1, red: 1, navy: 1, silver: 1, green: 1, orange: 1, purple: 1 };
    return String(name || "").trim().split(/\s+/).filter(function (word) {
      if (!word || /^\d+U$/i.test(word) || /^(mn|vs|at)$/i.test(word)) return false;
      return true;
    }).filter(function (word, index, list) {
      return !(colors[word.toLowerCase()] && list.length > 1 && index === list.length - 1);
    });
  }

  function readableTeam(name, fallback) {
    const raw = String(name || "").trim();
    if (!raw || raw === "Us" || raw === "Team" || raw === "Opponent" || raw === "Opp") return fallback;
    const parts = teamWords(raw);
    const short = parts.find(function (word) { return word.length >= 3 && word.length <= 5; });
    return short || (parts.length ? parts[parts.length - 1] : fallback);
  }

  function abbrOf(name, fallback) {
    if (!name || name === "Opponent" || name === "Opp" || name === "Us") return fallback;
    const parts = teamWords(name);
    if (!parts.length) return fallback;
    const compact = parts.find(function (word) {
      const letters = word.replace(/[^A-Za-z]/g, "");
      return letters.length >= 3 && letters.length <= 4;
    });
    const source = (compact || parts[parts.length - 1] || "").replace(/[^A-Za-z]/g, "");
    if (!source) return fallback;
    return source.slice(0, 4).toUpperCase();
  }

  function defenseForInning(plan, index, fallback) {
    const planned = plan && plan[index];
    if (defenseHasAssignments(planned)) return cloneDefense(planned);
    return cloneDefense(fallback);
  }

  function clampScheduledInnings(value) {
    const n = parseInt(value, 10);
    if (!Number.isFinite(n)) return 7;
    return Math.max(1, Math.min(12, n));
  }

  function scheduledInningsOf(state) {
    return clampScheduledInnings(state && state.scheduledInnings);
  }

  function isExtraHalf(state) {
    if (!state || state.status !== "live") return false;
    return state.inningIndex + 1 > scheduledInningsOf(state);
  }

  function totalsFromInnings(innings) {
    let away = 0;
    let home = 0;
    (innings || []).forEach(function (inn) {
      if (inn && typeof inn.top === "number") away += inn.top;
      if (inn && typeof inn.bottom === "number") home += inn.bottom;
    });
    return { away: away, home: home };
  }

  function ordinal(n) {
    const mod100 = n % 100;
    const mod10 = n % 10;
    let suffix = "th";
    if (mod100 < 11 || mod100 > 13) {
      if (mod10 === 1) suffix = "st";
      else if (mod10 === 2) suffix = "nd";
      else if (mod10 === 3) suffix = "rd";
    }
    return String(n) + suffix;
  }

  function createLiveGame(input, now) {
    const side = input && (input.side === "home" || input.side === "away") ? input.side : "";
    if (!side) throw new Error("Pick home or away.");
    const snapshot = slimGame(
      (input && (input.game || input.lineupSnapshot)) || {
        id: input && input.lineupGameId,
        name: input && input.gameName,
      },
    );
    if (!snapshot) throw new Error("Missing game.");
    const plan = snapshot.inningDefenses.length
      ? snapshot.inningDefenses.map(cloneDefense)
      : [cloneDefense(snapshot.defensivePositions)];
    const defense = defenseForInning(plan, 0, snapshot.defensivePositions);
    const mode = normalizeMode(snapshot.battingMode);
    const batterIds = batterIdsForMode(snapshot);
    const flexId = input && input.flexId ? String(input.flexId) : flexIdFor(snapshot);
    const dpId = input && input.dpId ? String(input.dpId) : dpIdFor(snapshot);
    const stamp = now || Date.now();
    return {
      lineupGameId: snapshot.id,
      side: side,
      status: "live",
      innings: [{ top: null, bottom: null }],
      inningIndex: 0,
      half: "top",
      defense: defense,
      lastFieldPos: rememberFieldPositions(null, defense),
      openingDefense: side === "home" ? cloneDefense(defense) : null,
      defensePlan: plan,
      defensiveOuts: {},
      outLog: [],
      scheduledInnings: clampScheduledInnings(input && input.scheduledInnings),
      tiebreaker: false,
      endedReason: "",
      outs: 0,
      battingMode: mode,
      spots: mode === "roster" ? [] : buildSpots(batterIds),
      flexId: flexId,
      dpId: dpId,
      dpSpot: mode === "dp-flex" ? batterIds.indexOf(dpId) : -1,
      flexBatting: false,
      flexOnCard: mode === "dp-flex",
      flexLeft: false,
      flexReentered: false,
      dpReentered: false,
      flexPos: "",
      flexCurrentId: flexId,
      injuryOut: false,
      rosterLeft: {},
      courtesy: [],
      courtesyUsed: {},
      courtesyPool: input && input.courtesyPool === "jo" ? "jo" : "standard",
      battingIndex: 0,
      entries: starterEntries(batterIds),
      liveRuns: 0,
      usHits: 0,
      oppHits: 0,
      usErrors: 0,
      oppErrors: 0,
      teamAbbr: input && input.teamAbbr ? String(input.teamAbbr).replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase() : "",
      oppAbbr: input && input.oppAbbr ? String(input.oppAbbr).replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase() : "",
      oppName: input && input.oppName ? String(input.oppName) : "",
      itbFrom: input && input.itbFrom ? clampScheduledInnings(input.itbFrom) : 0,
      timeLimit: false,
      runRule: null,
      prompt: "",
      overrides: [],
      history: [],
      defensiveByPos: {},
      departed: [],
      players: Array.isArray(input.players) ? input.players.map(slimPlayer).filter(Boolean) : [],
      lineupSnapshot: snapshot,
      gameName: input && input.oppName ? withOpponent(snapshot.name, input.oppName) : snapshot.name,
      teamName: String((input && input.teamName) || "Elks"),
      startedAt: stamp,
      updatedAt: stamp,
    };
  }

  function addDefensiveInning(counts, defense) {
    const next = Object.assign({}, counts || {});
    const seen = new Set();
    FIELD_POSITIONS.forEach(function (pos) {
      const id = defense && defense[pos] ? String(defense[pos]) : "";
      if (!id || seen.has(id)) return;
      seen.add(id);
      next[id] = (next[id] || 0) + 1;
    });
    return next;
  }

  function copyInning(inn) {
    const src = inn || {};
    return {
      top: src.top == null ? null : src.top,
      bottom: src.bottom == null ? null : src.bottom,
      topTiebreaker: !!src.topTiebreaker,
      bottomTiebreaker: !!src.bottomTiebreaker,
    };
  }

  function finishPlayed(state, patch, now) {
    const stamp = now || Date.now();
    const next = Object.assign({}, state, patch, { status: "played", updatedAt: stamp, endedAt: stamp });
    const board = scoreboard(next);
    next.finalUs = board.usTotal;
    next.finalOpp = board.oppTotal;
    next.tiebreaker = false;
    next.outs = 0;
    return next;
  }

  function clampOuts(value) {
    const n = parseInt(value, 10);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(3, n);
  }

  function fieldersNow(defense) {
    const ids = [];
    const seen = new Set();
    FIELD_POSITIONS.forEach(function (pos) {
      const id = defense && defense[pos] ? String(defense[pos]) : "";
      if (!id || seen.has(id)) return;
      seen.add(id);
      ids.push(id);
    });
    return ids;
  }

  function addCredit(counts, ids) {
    const next = Object.assign({}, counts || {});
    (ids || []).forEach(function (id) {
      next[id] = (next[id] || 0) + 1;
    });
    return next;
  }

  function removeCredit(counts, ids) {
    const next = Object.assign({}, counts || {});
    (ids || []).forEach(function (id) {
      const left = (next[id] || 0) - 1;
      if (left > 0) next[id] = left;
      else delete next[id];
    });
    return next;
  }

  function formatInnings(outs) {
    const n = Math.max(0, Math.floor(Number(outs) || 0));
    return Math.floor(n / 3) + "." + (n % 3);
  }

  function addOut(state, now) {
    if (!state || state.status !== "live") throw new Error("This game is not in progress.");
    const current = clampOuts(state.outs);
    if (current >= 3) return Object.assign({}, state, { outs: 3, updatedAt: now || Date.now() });
    const batting = roleFor(state.side, state.half) === "offense";
    const ids = batting ? [] : fieldersNow(state.defense);
    const next = Object.assign({}, state, {
      outs: current + 1,
      defensiveOuts: addCredit(state.defensiveOuts, ids),
      outLog: (state.outLog || []).concat([ids]),
      lastFieldPos: rememberFieldPositions(state, state.defense),
      updatedAt: now || Date.now(),
    });
    if (batting) {
      next.battingIndex = stepBatter(state);
      next.balls = 0;
      next.strikes = 0;
    }
    return remember(state, next, "Out #" + (current + 1));
  }

  function thirdOutPrompt(state) {
    if (!state || state.status !== "live" || clampOuts(state.outs) !== 3) return null;
    const label = halfLabel(state.inningIndex, state.half);
    return { title: "End " + label + "?", label: label };
  }

  function undoOut(state, now) {
    if (!state || state.status !== "live") throw new Error("This game is not in progress.");
    const current = clampOuts(state.outs);
    if (current === 0) return Object.assign({}, state, { outs: 0, updatedAt: now || Date.now() });
    const outLog = (state.outLog || []).slice();
    const last = outLog.length ? outLog.pop() : [];
    return Object.assign({}, state, {
      outs: current - 1,
      defensiveOuts: removeCredit(state.defensiveOuts, last),
      outLog: outLog,
      updatedAt: now || Date.now(),
    });
  }

  function recordRuns(state, runs, now) {
    if (!state || state.status !== "live") throw new Error("This game is not in progress.");
    const scored = parseRuns(runs);
    if (scored == null) throw new Error("Enter a whole number of runs, 0 or more.");
    const innings = state.innings.map(copyInning);
    const completedHalf = state.half;
    const completedIndex = state.inningIndex;
    const current = copyInning(innings[completedIndex]);
    current[completedHalf] = scored;
    if (state.tiebreaker) current[completedHalf + "Tiebreaker"] = true;
    innings[completedIndex] = current;

    const scheduled = scheduledInningsOf(state);
    const inningNumber = completedIndex + 1;
    const scores = totalsFromInnings(innings);
    const stamp = now || Date.now();
    const shared = {
      innings: innings,
      defensiveOuts: Object.assign({}, state.defensiveOuts),
      outLog: [],
      defensePlan: (state.defensePlan || []).map(cloneDefense),
      scheduledInnings: scheduled,
      courtesy: [],
      liveRuns: 0,
      prompt: "",
      updatedAt: stamp,
    };

    if (runRuleHit(state, completedHalf, inningNumber, scores)) {
      if (completedHalf === "top" && scores.home > scores.away && current.bottom == null) current.bottom = "X";
      innings[completedIndex] = current;
      shared.innings = innings;
      return remember(state, finishPlayed(state, Object.assign({}, shared, {
        inningIndex: completedIndex,
        half: completedHalf,
        endedReason: "run-rule",
      }), stamp));
    }

    if (completedHalf === "top" && inningNumber >= scheduled && scores.home > scores.away) {
      current.bottom = "X";
      innings[completedIndex] = current;
      shared.innings = innings;
      return remember(state, finishPlayed(state, Object.assign({}, shared, {
        inningIndex: completedIndex,
        half: "top",
        endedReason: "home-lead",
      }), stamp));
    }

    if (completedHalf === "bottom" && inningNumber >= scheduled && scores.home !== scores.away) {
      return remember(state, finishPlayed(state, Object.assign({}, shared, {
        inningIndex: completedIndex,
        half: "bottom",
        endedReason: "final",
      }), stamp));
    }

    let inningIndex = completedIndex;
    let half = completedHalf;
    let defense = cloneDefense(state.defense);
    if (half === "top") {
      half = "bottom";
    } else {
      half = "top";
      inningIndex += 1;
      innings.push({ top: null, bottom: null, topTiebreaker: false, bottomTiebreaker: false });
      defense = defenseForInning(state.defensePlan, inningIndex, state.defense);
    }
    const onDefense = roleFor(state.side, half) === "defense";
    const advanced = Object.assign({}, state, shared, {
      status: "live",
      inningIndex: inningIndex,
      half: half,
      defense: defense,
      openingDefense: onDefense ? cloneDefense(defense) : null,
      tiebreaker: false,
      endedReason: "",
      outs: 0,
    });
    advanced.tiebreaker = tiebreakerActive(advanced);
    advanced.itbRunnerId = advanced.tiebreaker ? runnerBeforeLeadoff(advanced) : "";
    advanced.balls = 0;
    advanced.strikes = 0;
    advanced.bases = [false, false, false];
    return remember(state, advanced, "End half");
  }

  function setTiebreaker(state, on, now) {
    if (!state || state.status !== "live") throw new Error("This game is not in progress.");
    if (!isExtraHalf(state) && !tiebreakerActive(state)) throw new Error("The tiebreaker is for extra innings.");
    return remember(state, Object.assign({}, state, {
      tiebreaker: !!on,
      updatedAt: now || Date.now(),
    }));
  }

  function setDefense(state, position, playerId, now) {
    if (!state || state.status !== "live") throw new Error("This game is not in progress.");
    if (FIELD_POSITIONS.indexOf(position) < 0) throw new Error("Unknown position.");
    const defense = cloneDefense(state.defense);
    const nextId = playerId ? String(playerId) : "";
    const occupant = defense[position] ? String(defense[position]) : "";
    const flexId = String(state.flexId || "");
    if (
      state.battingMode === "dp-flex" &&
      nextId &&
      nextId === String(state.dpId || "") &&
      occupant === flexId &&
      flexStillOnCard(state)
    ) {
      FIELD_POSITIONS.forEach(function (pos) {
        if (defense[pos] === nextId) defense[pos] = null;
      });
      defense[position] = nextId;
      return remember(state, Object.assign({}, state, {
        defense: defense,
        lastFieldPos: rememberFieldPositions(state, defense),
        flexOnCard: false,
        flexLeft: true,
        flexPos: position,
        flexCurrentId: "",
        updatedAt: now || Date.now(),
      }), "Defense");
    }
    if (nextId && state.spots && state.spots.length && !playerMayField(state, nextId)) {
      throw new Error(fieldBlockReason(state, nextId));
    }
    if (!nextId) {
      defense[position] = null;
    } else {
      let previous = "";
      FIELD_POSITIONS.forEach(function (pos) {
        if (defense[pos] === nextId) previous = pos;
      });
      const occupant = defense[position] || null;
      if (previous && previous !== position && occupant) {
        defense[previous] = occupant;
      } else if (previous && previous !== position) {
        defense[previous] = null;
      }
      defense[position] = nextId;
    }
    return remember(state, Object.assign({}, state, {
      defense: defense,
      lastFieldPos: rememberFieldPositions(state, defense),
      updatedAt: now || Date.now(),
    }), "Defense");
  }

  function setInjuryOut(state, on, now) {
    if (!state || state.battingMode !== "roster") throw new Error("Only bat the roster uses this setting.");
    return Object.assign({}, state, { injuryOut: !!on, updatedAt: now || Date.now() });
  }

  function leaveRosterPlayer(state, playerId, reasonOrNow, now) {
    if (!state || state.battingMode !== "roster") throw new Error("Only the continuous order uses this.");
    let reason = "auto-out";
    let stamp = now || Date.now();
    if (typeof reasonOrNow === "number") stamp = reasonOrNow;
    else if (reasonOrNow) {
      reason = String(reasonOrNow);
      if (typeof now === "number") stamp = now;
    }
    if (reason !== "skip" && reason !== "auto-out" && reason !== "ejected") {
      throw new Error("Pick why she is leaving.");
    }
    const id = String(playerId || "");
    const defense = cloneDefense(state.defense);
    FIELD_POSITIONS.forEach(function (pos) {
      if (defense[pos] === id) defense[pos] = null;
    });
    const left = Object.assign({}, state.rosterLeft);
    left[id] = reason;
    const next = Object.assign({}, state, {
      defense: defense,
      lastFieldPos: rememberFieldPositions(state, defense),
      rosterLeft: left,
      updatedAt: stamp,
    });
    if (reason === "ejected") next.prompt = "Ejection. Replace her, or the game is a forfeit.";
    if (activeBatterCount(next) < 8) next.prompt = (next.prompt ? next.prompt + " " : "") + "Fewer than 8 can bat.";
    return remember(state, next, reason === "skip" ? "Injury" : reason === "ejected" ? "Ejection" : "Left early");
  }

  function setCourtesy(state, forId, runnerId, now) {
    if (!forId || !runnerId) {
      return remember(state, Object.assign({}, state, { courtesy: [], updatedAt: now || Date.now() }));
    }
    const choice = courtesyChoice(state, forId, runnerId);
    if (!choice.ok) throw new Error(choice.reason || "That courtesy runner is not allowed.");
    const list = courtesyList(state).concat([{ forId: String(forId), runnerId: String(runnerId) }]);
    const used = Object.assign({}, state.courtesyUsed || {});
    if (choice.pos) used[choice.pos] = String(runnerId);
    return remember(state, Object.assign({}, state, {
      courtesy: list,
      courtesyUsed: used,
      updatedAt: now || Date.now(),
    }));
  }

  function subForFlex(state, playerId, force, now) {
    const effect = describeFlexSub(state, playerId);
    if (!effect.ok && !(force && effect.illegal)) throw new Error(effect.reason || "That Flex sub is not allowed.");
    const incoming = String(playerId);
    const flexNow = String(state.flexCurrentId || state.flexId || "");
    const pos = currentPosition(state.defense, flexNow);
    const defense = cloneDefense(state.defense);
    const leaving = defense[pos];
    FIELD_POSITIONS.forEach(function (spot) {
      if (defense[spot] === incoming) defense[spot] = null;
    });
    defense[pos] = incoming;
    const departed = (state.departed || []).map(String);
    if (leaving && leaving !== String(state.flexId || "") && departed.indexOf(leaving) < 0) departed.push(leaving);
    const entries = ensureEntries(state);
    const prior = entries[incoming];
    entries[incoming] = { spot: prior ? prior.spot : -1, reentered: !!(prior && prior.reentered) };
    return remember(state, Object.assign({}, state, {
      defense: defense,
      departed: departed,
      entries: entries,
      flexLeft: true,
      flexOnCard: false,
      flexPos: pos,
      flexCurrentId: incoming,
      updatedAt: now || Date.now(),
    }));
  }

  function reenterFlex(state, force, now) {
    const effect = describeFlexReturn(state);
    if (!effect.ok && !(force && effect.illegal)) throw new Error(effect.reason || "The Flex cannot re-enter.");
    const defense = cloneDefense(state.defense);
    const pos = state.flexPos && FIELD_POSITIONS.indexOf(state.flexPos) >= 0 ? state.flexPos : "P";
    const occupant = defense[pos] ? String(defense[pos]) : "";
    const flexNow = String(state.flexCurrentId || "");
    const departed = (state.departed || []).map(String);
    if (occupant && flexNow && occupant === flexNow && occupant !== String(state.flexId || "") && departed.indexOf(occupant) < 0) {
      departed.push(occupant);
    }
    defense[pos] = String(state.flexId || "");
    return remember(state, Object.assign({}, state, {
      defense: defense,
      departed: departed,
      flexLeft: false,
      flexOnCard: true,
      flexReentered: true,
      flexCurrentId: String(state.flexId || ""),
      updatedAt: now || Date.now(),
    }), "FLEX re-enters");
  }

  function inningCells(side, inn) {
    const away = inn ? inn.top : null;
    const home = inn ? inn.bottom : null;
    if (side === "home") return { us: home, opp: away };
    return { us: away, opp: home };
  }

  function scoreboard(state) {
    const innings = (state && state.innings) || [];
    let last = state ? state.inningIndex : 0;
    if (!Number.isFinite(last) || last < 0) last = 0;
    if (state && state.status === "played") {
      while (
        last > 0 &&
        innings[last] &&
        innings[last].top == null &&
        innings[last].bottom == null
      ) {
        last -= 1;
      }
    }
    const rows = [];
    let usTotal = 0;
    let oppTotal = 0;
    const scheduled = scheduledInningsOf(state);
    const count = Math.max(scheduled, last + 1, 1);
    for (let i = 0; i < count; i += 1) {
      const cells = inningCells(state.side, innings[i]);
      const current = Boolean(state.status === "live" && i === state.inningIndex);
      if (current && state.liveRuns) {
        if (roleFor(state.side, state.half) === "offense" && cells.us == null) cells.us = state.liveRuns;
        if (roleFor(state.side, state.half) === "defense" && cells.opp == null) cells.opp = state.liveRuns;
      }
      if (typeof cells.us === "number") usTotal += cells.us;
      if (typeof cells.opp === "number") oppTotal += cells.opp;
      const inn = innings[i] || {};
      rows.push({
        inning: i + 1,
        us: cells.us,
        opp: cells.opp,
        current: current,
        topTiebreaker: !!inn.topTiebreaker,
        bottomTiebreaker: !!inn.bottomTiebreaker,
      });
    }
    if (state && state.endedReason === "forfeit") {
      const usWins = state.forfeitWinner !== "opp";
      usTotal = usWins ? 7 : 0;
      oppTotal = usWins ? 0 : 7;
    }
    return {
      innings: rows,
      usTotal: usTotal,
      oppTotal: oppTotal,
      usHits: Number(state && state.usHits) || 0,
      oppHits: Number(state && state.oppHits) || 0,
      usErrors: Number(state && state.usErrors) || 0,
      oppErrors: Number(state && state.oppErrors) || 0,
      role: state && state.status === "live" ? roleFor(state.side, state.half) : "",
      label: state && state.status === "live" ? halfLabel(state.inningIndex, state.half) : finalBanner(state),
      side: state ? state.side : "",
      extra: Boolean(state && state.status === "live" && state.inningIndex + 1 > scheduled),
      scheduledInnings: scheduled,
    };
  }

  function displayOpponent(gameName) {
    return opponentLabel(gameName) || "Opponent";
  }

  function scoreboardRows(state) {
    const board = scoreboard(state);
    const home = Boolean(state && state.side === "home");
    const usName = readableTeam(state && state.teamName, "Elks");
    const oppName = opponentLabel(state && state.gameName) || "Opponent";
    const us = {
      team: "us",
      side: home ? "home" : "away",
      label: state && state.teamAbbr ? String(state.teamAbbr).replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase() : abbrOf(usName, "ELKS"),
      name: usName,
      cells: board.innings.map(function (inn) { return inn.us; }),
      total: board.usTotal,
      hits: board.usHits,
      errors: board.usErrors,
    };
    const opp = {
      team: "opp",
      side: home ? "away" : "home",
      label: state && state.oppAbbr ? String(state.oppAbbr).replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase() : abbrOf(oppName, "OPP"),
      name: oppName,
      cells: board.innings.map(function (inn) { return inn.opp; }),
      total: board.oppTotal,
      hits: board.oppHits,
      errors: board.oppErrors,
    };
    return home ? [opp, us] : [us, opp];
  }

  function scoreLine(state) {
    const rows = scoreboardRows(state);
    return rows[0].name + " " + rows[0].total + ", " + rows[1].name + " " + rows[1].total;
  }

  function liveScoreMeta(state) {
    const board = scoreboard(state);
    const role = board.role === "defense" ? "Defense" : "Offense";
    return "In progress · " + board.label + " · " + role + " · " + scoreLine(state);
  }

  function finalScoreMeta(state) {
    return finalBanner(state) + " " + scoreLine(state);
  }

  function endGame(state, nowOrOptions, maybeNow) {
    if (!state || state.status !== "live") throw new Error("This game is not in progress.");
    const options = nowOrOptions && typeof nowOrOptions === "object" ? nowOrOptions : {};
    const stamp = typeof nowOrOptions === "number" ? nowOrOptions : (typeof maybeNow === "number" ? maybeNow : Date.now());
    const reason = options.reason || state.endedReason || "manual";
    let working = state;
    if (options.runsThisHalf != null && options.runsThisHalf !== "") {
      const scored = parseRuns(options.runsThisHalf);
      if (scored == null) throw new Error("Enter a whole number of runs, 0 or more.");
      const innings = working.innings.map(copyInning);
      const cell = copyInning(innings[working.inningIndex]);
      const unplayedBottom = working.half === "bottom" && scored === 0 && clampOuts(working.outs) === 0 && !(Number(working.liveRuns) > 0);
      if (unplayedBottom) {
        const soFar = totalsFromInnings(innings.map(function (inn, index) {
          if (index !== working.inningIndex) return inn;
          return Object.assign({}, inn, { bottom: null });
        }));
        cell.bottom = soFar.home > soFar.away ? "X" : 0;
      } else {
        cell[working.half] = scored;
      }
      innings[working.inningIndex] = cell;
      working = Object.assign({}, working, { innings: innings, liveRuns: 0 });
    }
    if (reason === "forfeit") {
      const winner = options.forfeitWinner === "opp" ? "opp" : "us";
      const ended = finishPlayed(working, {
        endedReason: "forfeit",
        inningIndex: working.inningIndex,
        half: working.half,
        forfeitWinner: winner,
      }, stamp);
      ended.finalUs = winner === "us" ? 7 : 0;
      ended.finalOpp = winner === "us" ? 0 : 7;
      return remember(state, ended);
    }
    if (reason === "called") working = calledGame(working);
    else working = skipBottomIfHomeLeads(working);
    return remember(state, finishPlayed(working, {
      endedReason: reason,
      inningIndex: working.inningIndex,
      half: working.half,
    }, stamp));
  }

  function unplayedGames(games, sessions) {
    const live = [];
    const waiting = [];
    (games || []).forEach(function (game) {
      if (!game || !game.id) return;
      const session = sessions && sessions[game.id];
      if (session && session.status === "played") return;
      if (session && session.status === "live") live.push(game);
      else waiting.push(game);
    });
    return live.concat(waiting);
  }

  function playedEntries(games, sessions) {
    const byId = new Map();
    (games || []).forEach(function (game) {
      if (game && game.id) byId.set(String(game.id), game);
    });
    const rows = [];
    Object.keys(sessions || {}).forEach(function (id) {
      const session = sessions[id];
      if (!session || session.status !== "played") return;
      const game = byId.get(String(id)) || session.lineupSnapshot || {
        id: id,
        name: session.gameName || "Game",
      };
      rows.push({ game: game, session: session });
    });
    rows.sort(function (a, b) {
      return (b.session.endedAt || 0) - (a.session.endedAt || 0);
    });
    return rows;
  }

  function defenseRows(defense, players) {
    const byId = new Map((players || []).map(function (player) {
      return [player.id, player];
    }));
    function label(id) {
      if (!id) return "Empty";
      return playerLabel(byId.get(id) || { id: id, name: "Unknown" });
    }
    const source = defense || {};
    const rows = FIELD_POSITIONS.map(function (pos) {
      const id = source[pos] ? String(source[pos]) : "";
      return { pos: pos, id: id, label: label(id) };
    });
    Object.keys(source).forEach(function (pos) {
      if (FIELD_POSITIONS.indexOf(pos) >= 0) return;
      if (!source[pos]) return;
      rows.push({ pos: pos, id: String(source[pos]), label: label(String(source[pos])) });
    });
    return rows;
  }

  function lineupView(game, players) {
    const list = (Array.isArray(players) ? players : []).map(slimPlayer).filter(Boolean);
    const byId = new Map(list.map(function (player) {
      return [player.id, player];
    }));
    function label(id) {
      return playerLabel(byId.get(id) || { id: id, name: "Unknown" });
    }
    const unavailable = new Set((game && game.unavailableIds ? game.unavailableIds : []).map(String));
    const mode = normalizeMode(game && game.battingMode);
    const info = formatInfo(mode);
    let order = (game && game.battingOrder ? game.battingOrder : [])
      .map(String)
      .filter(function (id) {
        return !unavailable.has(id);
      });
    let flexId = "";
    if (mode === "dp-flex" && order.length >= 10) {
      flexId = order[order.length - 1];
      order = order.slice(0, order.length - 1);
    } else if (mode === "nine") {
      order = order.slice(0, 9);
    } else if (mode === "one-ap") {
      order = order.slice(0, 10);
    } else if (mode === "two-ap") {
      order = order.slice(0, 11);
    }
    const dpId = mode === "dp-flex" ? dpIdFor(game) : "";
    const batting = order.map(function (id, index) {
      let role = "";
      if (mode === "dp-flex" && id === dpId) role = "DP";
      if ((mode === "one-ap" || mode === "two-ap") && index >= 9) role = "EP";
      return { order: index + 1, id: id, role: role, label: label(id) };
    });
    const firstPlan = game && game.inningDefenses && game.inningDefenses[0];
    const source = defenseHasAssignments(firstPlan) ? firstPlan : (game && game.defensivePositions) || {};
    const battingSet = new Set((game && game.battingOrder ? game.battingOrder : []).map(String));
    const out = list
      .filter(function (player) {
        return unavailable.has(player.id);
      })
      .map(function (player) {
        return { id: player.id, label: playerLabel(player) };
      });
    const subs = list
      .filter(function (player) {
        if (player.id === flexId) return false;
        return !battingSet.has(player.id) && !unavailable.has(player.id);
      })
      .map(function (player) {
        return { id: player.id, label: playerLabel(player) };
      })
      .sort(function (a, b) {
        return a.label.localeCompare(b.label);
      });
    return {
      name: (game && game.name) || "Untitled Game",
      battingMode: mode,
      formatLabel: info.label,
      formatDetail: info.detail,
      flexId: flexId,
      flexLabel: flexId ? label(flexId) : "",
      batting: batting,
      defense: defenseRows(source, list),
      subs: subs,
      out: out,
    };
  }

  function currentPosition(defense, playerId) {
    const keys = FIELD_POSITIONS;
    for (let i = 0; i < keys.length; i += 1) {
      if (defense && defense[keys[i]] === playerId) return keys[i];
    }
    return "";
  }

  function defensiveInningRows(state) {
    const players = (state && state.players) || [];
    const byId = new Map();
    players.forEach(function (player) {
      const slim = slimPlayer(player);
      if (slim) byId.set(slim.id, slim);
    });
    const ids = new Set(byId.keys());
    Object.keys((state && state.defensiveOuts) || {}).forEach(function (id) {
      ids.add(String(id));
    });
    return Array.from(ids)
      .map(function (id) {
        const outs = state.defensiveOuts && state.defensiveOuts[id] ? state.defensiveOuts[id] : 0;
        return {
          id: id,
          label: playerLabel(byId.get(id) || { id: id, name: "Unknown" }),
          outs: outs,
          innings: formatInnings(outs),
          position: currentPosition(state.defense, id) || ((state.lastFieldPos && state.lastFieldPos[id]) || ""),
        };
      })
      .sort(function (a, b) {
        return b.outs - a.outs || a.label.localeCompare(b.label);
      });
  }

  function normalizeHalf(value) {
    if (value === "X") return "X";
    return parseRuns(value);
  }

  function normalizeInning(raw) {
    const inn = raw && typeof raw === "object" ? raw : {};
    return {
      top: normalizeHalf(inn.top),
      bottom: normalizeHalf(inn.bottom),
      topTiebreaker: !!inn.topTiebreaker,
      bottomTiebreaker: !!inn.bottomTiebreaker,
    };
  }

  function normalizeSession(raw) {
    if (!raw || typeof raw !== "object") return null;
    if (raw.status !== "live" && raw.status !== "played") return null;
    if (raw.side !== "home" && raw.side !== "away") return null;
    if (raw.lineupGameId == null || String(raw.lineupGameId).trim() === "") return null;
    const half = raw.half === "bottom" ? "bottom" : "top";
    let inningIndex = parseInt(raw.inningIndex, 10);
    if (!Number.isFinite(inningIndex) || inningIndex < 0) inningIndex = 0;
    if (inningIndex > 30) inningIndex = 30;
    const innings = Array.isArray(raw.innings) ? raw.innings.map(normalizeInning) : [];
    while (innings.length <= inningIndex) innings.push({ top: null, bottom: null });
    const defensiveOuts = {};
    const counts = raw.defensiveOuts && typeof raw.defensiveOuts === "object" ? raw.defensiveOuts : {};
    Object.keys(counts).forEach(function (id) {
      const n = Math.floor(Number(counts[id]));
      if (Number.isFinite(n) && n > 0) defensiveOuts[String(id)] = n;
    });
    const outLog = Array.isArray(raw.outLog)
      ? raw.outLog.map(function (ids) {
        return Array.isArray(ids) ? ids.map(String).filter(Boolean) : [];
      })
      : [];
    const snapshot = slimGame(raw.lineupSnapshot || { id: raw.lineupGameId, name: raw.gameName });
    const finalUs = parseRuns(raw.finalUs);
    const finalOpp = parseRuns(raw.finalOpp);
    return {
      lineupGameId: String(raw.lineupGameId),
      side: raw.side,
      status: raw.status,
      innings: innings,
      inningIndex: inningIndex,
      half: half,
      defense: cloneDefense(raw.defense),
      openingDefense: raw.openingDefense ? cloneDefense(raw.openingDefense) : null,
      defensePlan: Array.isArray(raw.defensePlan) ? raw.defensePlan.map(cloneDefense) : [],
      defensiveOuts: defensiveOuts,
      lastFieldPos: sanitizeLastFieldPos(raw.lastFieldPos),
      outLog: outLog,
      scheduledInnings: clampScheduledInnings(raw.scheduledInnings),
      tiebreaker: !!raw.tiebreaker,
      endedReason: ["home-lead", "final", "manual", "run-rule", "time", "called", "forfeit", "other"].indexOf(raw.endedReason) >= 0
        ? raw.endedReason
        : "",
      outs: clampOuts(raw.outs),
      battingMode: normalizeMode(raw.battingMode || (snapshot && snapshot.battingMode)),
      spots: Array.isArray(raw.spots) ? raw.spots.map(function (spot) {
        return {
          starterId: String(spot.starterId || ""),
          currentId: String(spot.currentId || spot.starterId || ""),
          starterReturned: !!spot.starterReturned,
        };
      }).filter(function (spot) { return spot.starterId; }) : [],
      flexId: String(raw.flexId || ""),
      dpId: String(raw.dpId || ""),
      dpSpot: Number.isFinite(Number(raw.dpSpot)) ? Number(raw.dpSpot) : -1,
      flexBatting: !!raw.flexBatting,
      flexOnCard: raw.flexOnCard !== false,
      flexLeft: !!raw.flexLeft,
      flexReentered: !!raw.flexReentered,
      dpReentered: !!raw.dpReentered,
      flexPos: typeof raw.flexPos === "string" ? raw.flexPos : "",
      flexCurrentId: String(raw.flexCurrentId || raw.flexId || ""),
      injuryOut: !!raw.injuryOut,
      rosterLeft: migrateRosterLeft(raw.rosterLeft),
      courtesy: courtesyList(raw),
      courtesyUsed: raw.courtesyUsed && typeof raw.courtesyUsed === "object" ? {
        P: raw.courtesyUsed.P ? String(raw.courtesyUsed.P) : "",
        C: raw.courtesyUsed.C ? String(raw.courtesyUsed.C) : "",
      } : {},
      courtesyPool: raw.courtesyPool === "jo" ? "jo" : "standard",
      battingIndex: clampIndex(raw.battingIndex),
      entries: ensureEntries(raw),
      liveRuns: Math.max(0, Math.floor(Number(raw.liveRuns) || 0)),
      usHits: Math.max(0, Math.floor(Number(raw.usHits) || 0)),
      oppHits: Math.max(0, Math.floor(Number(raw.oppHits) || 0)),
      usErrors: Math.max(0, Math.floor(Number(raw.usErrors) || 0)),
      oppErrors: Math.max(0, Math.floor(Number(raw.oppErrors) || 0)),
      teamAbbr: raw.teamAbbr ? String(raw.teamAbbr).replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase() : "",
      oppAbbr: raw.oppAbbr ? String(raw.oppAbbr).replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase() : "",
      oppName: raw.oppName ? String(raw.oppName) : "",
      itbFrom: Math.max(0, Math.floor(Number(raw.itbFrom) || 0)),
      timeLimit: !!raw.timeLimit,
      prompt: raw.prompt ? String(raw.prompt) : "",
      forfeitWinner: raw.forfeitWinner === "opp" ? "opp" : (raw.forfeitWinner === "us" ? "us" : ""),
      overrides: Array.isArray(raw.overrides) ? raw.overrides.map(String).slice(-40) : [],
      history: Array.isArray(raw.history) ? raw.history.slice(-20) : [],
      seenOpKeys: Array.isArray(raw.seenOpKeys) ? raw.seenOpKeys.map(String).slice(-40) : [],
      actionSeq: Math.max(0, Math.floor(Number(raw.actionSeq) || 0)),
      lastAction: raw.lastAction ? String(raw.lastAction) : "",
      undoNote: raw.undoNote ? String(raw.undoNote) : "",
      itbRunnerId: raw.itbRunnerId ? String(raw.itbRunnerId) : "",
      balls: Math.max(0, Math.min(3, Math.floor(Number(raw.balls) || 0))),
      strikes: Math.max(0, Math.min(2, Math.floor(Number(raw.strikes) || 0))),
      bases: Array.isArray(raw.bases) ? [!!raw.bases[0], !!raw.bases[1], !!raw.bases[2]] : [false, false, false],
      defensiveByPos: raw.defensiveByPos && typeof raw.defensiveByPos === "object" ? raw.defensiveByPos : {},
      departed: Array.isArray(raw.departed) ? raw.departed.map(String) : [],
      players: Array.isArray(raw.players) ? raw.players.map(slimPlayer).filter(Boolean) : [],
      lineupSnapshot: snapshot,
      gameName: String(raw.gameName || (snapshot && snapshot.name) || "Game"),
      teamName: String(raw.teamName || "Elks"),
      finalUs: raw.status === "played" ? (finalUs == null ? 0 : finalUs) : undefined,
      finalOpp: raw.status === "played" ? (finalOpp == null ? 0 : finalOpp) : undefined,
      startedAt: Number(raw.startedAt) || 0,
      endedAt: raw.status === "played" ? Number(raw.endedAt) || 0 : undefined,
      updatedAt: Number(raw.updatedAt) || 0,
    };
  }

  function emptyDocument() {
    return { revision: 0, updatedAt: 0, appliedOpIds: [], active: null, teams: {} };
  }

  function documentRevision(doc) {
    const n = Number(doc && doc.revision);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.floor(n);
  }

  function cloneDocument(doc) {
    return normalizeDocument(JSON.parse(JSON.stringify(doc || emptyDocument())));
  }

  function normalizeDocument(raw) {
    const doc = emptyDocument();
    if (!raw || typeof raw !== "object") return doc;
    doc.revision = documentRevision(raw);
    doc.updatedAt = Number(raw.updatedAt) || 0;
    doc.appliedOpIds = Array.isArray(raw.appliedOpIds)
      ? raw.appliedOpIds.map(String).filter(Boolean).slice(-200)
      : [];
    if (raw.active && raw.active.teamId && raw.active.gameId) {
      doc.active = { teamId: String(raw.active.teamId), gameId: String(raw.active.gameId) };
    }
    const teams = raw.teams && typeof raw.teams === "object" ? raw.teams : {};
    Object.keys(teams).forEach(function (teamId) {
      const bundle = teams[teamId] || {};
      const sessions = {};
      const rawSessions = bundle.sessions && typeof bundle.sessions === "object" ? bundle.sessions : {};
      Object.keys(rawSessions).forEach(function (id) {
        const session = normalizeSession(rawSessions[id]);
        if (session) sessions[session.lineupGameId] = session;
      });
      doc.teams[String(teamId)] = {
        teamName: String(bundle.teamName || ""),
        sessions: sessions,
      };
    });
    return doc;
  }

  function stampDocument(doc, revision, opId, now) {
    const next = cloneDocument(doc);
    const rev = Number(revision);
    next.revision = Number.isFinite(rev) && rev > 0 ? Math.floor(rev) : 0;
    next.updatedAt = now || Date.now();
    if (opId && next.appliedOpIds.indexOf(String(opId)) < 0) next.appliedOpIds.push(String(opId));
    next.appliedOpIds = next.appliedOpIds.slice(-200);
    return next;
  }

  function ensureTeam(doc, teamId, teamName) {
    const id = String(teamId || "");
    if (!id) throw new Error("Missing team.");
    if (!doc.teams[id]) doc.teams[id] = { teamName: "", sessions: {} };
    if (teamName) doc.teams[id].teamName = String(teamName);
    return doc.teams[id];
  }

  function documentFromStore(store) {
    const doc = emptyDocument();
    const source = store || emptyStore();
    doc.updatedAt = Number(source.updatedAt) || 0;
    doc.active = source.active || null;
    Object.keys(source.teams || {}).forEach(function (teamId) {
      const bundle = source.teams[teamId] || {};
      doc.teams[teamId] = {
        teamName: bundle.teamName || "",
        sessions: bundle.sessions || {},
      };
    });
    return normalizeDocument(doc);
  }

  function cacheFromStore(store) {
    const teams = {};
    Object.keys((store && store.teams) || {}).forEach(function (teamId) {
      const bundle = store.teams[teamId] || {};
      teams[teamId] = {
        teamName: bundle.teamName || "",
        games: bundle.games || [],
        players: bundle.players || [],
      };
    });
    return { teams: teams };
  }

  function envelopeFromLegacy(raw) {
    if (!raw || typeof raw !== "object" || raw.acked || raw.version === 2) return null;
    if (!raw.teams && !raw.active) return null;
    const store = normalizeStore(raw);
    return {
      acked: documentFromStore(store),
      queue: [],
      localOpIds: [],
      cache: cacheFromStore(store),
    };
  }

  function applyGameOp(doc, op, now) {
    if (!op || typeof op !== "object" || !op.type) throw new Error("Missing change.");
    const next = cloneDocument(doc);
    const stamp = now || Date.now();
    if (op.type === "set-active") {
      const gameId = op.gameId ? String(op.gameId) : "";
      next.active = gameId && op.teamId ? { teamId: String(op.teamId), gameId: gameId } : null;
      next.updatedAt = stamp;
      return next;
    }
    if (op.type === "adopt") {
      const incoming = normalizeDocument(op.snapshot || {});
      Object.keys(incoming.teams).forEach(function (teamId) {
        const src = incoming.teams[teamId];
        const dst = ensureTeam(next, teamId, src.teamName);
        Object.keys(src.sessions).forEach(function (gid) {
          if (!dst.sessions[gid]) dst.sessions[gid] = src.sessions[gid];
        });
      });
      if (!next.active && incoming.active) next.active = incoming.active;
      next.updatedAt = stamp;
      return next;
    }
    const team = ensureTeam(next, op.teamId, op.teamName);
    function put(session) {
      if (session && (op.atHalf || op.type === "undo" || op.type === "add-run" || op.type === "next-batter" || op.type === "add-tally" || op.type === "add-out" || op.type === "reach-base")) {
        const keys = (current && current.seenOpKeys ? current.seenOpKeys : []).concat(session.seenOpKeys || []).concat([opKey(op)]);
        const uniq = [];
        keys.forEach(function (key) {
          if (uniq.indexOf(key) < 0) uniq.push(key);
        });
        session.seenOpKeys = uniq.slice(-40);
      }
      team.sessions[session.lineupGameId] = session;
      next.updatedAt = session.updatedAt || stamp;
    }
    if (op.type === "start") {
      const session = createLiveGame(op.input, stamp);
      put(session);
      next.active = { teamId: String(op.teamId), gameId: session.lineupGameId };
      return next;
    }
    const gameId = String(op.gameId || "");
    const current = team.sessions[gameId];
    if (current && (op.atHalf || op.type === "undo" || op.type === "add-run" || op.type === "next-batter" || op.type === "add-tally")) {
      const gate = staleGate(current, op);
      if (gate === "drop") {
        const err = new Error("Another phone already recorded that.");
        err.code = "stale";
        if (op.type === "add-out" || op.type === "record-runs" || op.type === "set-half-runs") throw err;
        return next;
      }
      if (gate === "same") {
        put(current);
        return next;
      }
    }
    if (op.type === "add-out") put(addOut(current, stamp));
    else if (op.type === "undo-out") put(undoOut(current, stamp));
    else if (op.type === "undo") put(undo(current, stamp));
    else if (op.type === "record-runs" || op.type === "set-half-runs") put(recordRuns(current, op.runs, stamp));
    else if (op.type === "add-run") put(addRun(current, stamp));
    else if (op.type === "reach-base") put(reachBase(current, stamp));
    else if (op.type === "count") put(setCount(current, op, stamp));
    else if (op.type === "set-pool") put(remember(current, Object.assign({}, current, { courtesyPool: op.pool === "jo" ? "jo" : "standard" }), "Courtesy pool"));
    else if (op.type === "set-rule") put(remember(current, Object.assign({}, current, { runRule: op.runRule || null }), "Run rule"));
    else if (op.type === "add-tally") put(addTally(current, op.kind, op.side, stamp));
    else if (op.type === "edit-half") put(editHalfRuns(current, op.inningIndex, op.half, op.runs, stamp));
    else if (op.type === "set-batter") put(setBatter(current, op.index, stamp));
    else if (op.type === "next-batter") put(advanceBatter(current, stamp));
    else if (op.type === "set-innings") put(setScheduledInnings(current, op.innings, stamp, op));
    else if (op.type === "resume") put(resumeGame(current, stamp));
    else if (op.type === "confirm-final") put(current);
    else if (op.type === "set-defense") put(setDefense(current, op.position, op.playerId || "", stamp));
    else if (op.type === "injury") put(setInjuryOut(current, !!op.on, stamp));
    else if (op.type === "leave") put(leaveRosterPlayer(current, op.playerId, op.reason || stamp, op.reason ? stamp : undefined));
    else if (op.type === "courtesy") put(setCourtesy(current, op.forId, op.runnerId, stamp));
    else if (op.type === "flex-sub") put(subForFlex(current, op.playerId, !!op.force, stamp));
    else if (op.type === "flex-return") put(reenterFlex(current, !!op.force, stamp));
    else if (op.type === "tiebreaker") put(setTiebreaker(current, !!op.on, stamp));
    else if (op.type === "set-runner") put(setItbRunner(current, op.playerId, stamp));
    else if (op.type === "sub") put(applySub(current, op.spot, op.playerId, !!op.force, stamp));
    else if (op.type === "swap-dp-flex") put(swapDpFlex(current, stamp, !!op.force));
    else if (op.type === "end") {
      const ended = endGame(current, op.reason ? {
        reason: op.reason,
        runsThisHalf: op.runsThisHalf,
        forfeitWinner: op.forfeitWinner,
      } : stamp, stamp);
      put(ended);
      if (next.active && next.active.gameId === ended.lineupGameId && next.active.teamId === String(op.teamId)) {
        next.active = null;
      }
    } else {
      throw new Error("Unknown Game Manager change.");
    }
    return next;
  }

  function emptyStore() {
    return { version: 1, updatedAt: 0, active: null, teams: {} };
  }

  function normalizeStore(raw) {
    const store = emptyStore();
    if (!raw || typeof raw !== "object") return store;
    store.updatedAt = Number(raw.updatedAt) || 0;
    if (raw.active && raw.active.teamId && raw.active.gameId) {
      store.active = { teamId: String(raw.active.teamId), gameId: String(raw.active.gameId) };
    }
    const teams = raw.teams && typeof raw.teams === "object" ? raw.teams : {};
    Object.keys(teams).forEach(function (teamId) {
      const bundle = teams[teamId] || {};
      const sessions = {};
      const rawSessions = bundle.sessions && typeof bundle.sessions === "object" ? bundle.sessions : {};
      Object.keys(rawSessions).forEach(function (id) {
        const session = normalizeSession(rawSessions[id]);
        if (session) sessions[session.lineupGameId] = session;
      });
      store.teams[String(teamId)] = {
        teamName: String(bundle.teamName || ""),
        games: Array.isArray(bundle.games) ? bundle.games.map(slimGame).filter(Boolean) : [],
        players: Array.isArray(bundle.players) ? bundle.players.map(slimPlayer).filter(Boolean) : [],
        sessions: sessions,
      };
    });
    return store;
  }

  function withOpponent(gameName, oppName) {
    if (!oppName || opponentLabel(gameName)) return gameName;
    return "vs. " + String(oppName).trim();
  }

  function clampIndex(value) {
    const n = Math.floor(Number(value) || 0);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(40, n);
  }

  function migrateRosterLeft(raw) {
    const left = {};
    if (!raw || typeof raw !== "object") return left;
    Object.keys(raw).forEach(function (id) {
      const value = raw[id];
      if (value === "stay") left[String(id)] = "skip";
      else if (value === "skip" || value === "auto-out" || value === "ejected") left[String(id)] = value;
    });
    return left;
  }

  function courtesyList(state) {
    const raw = state && state.courtesy;
    if (Array.isArray(raw)) {
      return raw.filter(function (item) { return item && item.forId && item.runnerId; }).map(function (item) {
        return { forId: String(item.forId), runnerId: String(item.runnerId) };
      });
    }
    if (raw && raw.forId && raw.runnerId) return [{ forId: String(raw.forId), runnerId: String(raw.runnerId) }];
    return [];
  }

  function activeBatterCount(state) {
    return liveBatters(state).filter(function (row) {
      const left = (state.rosterLeft || {})[row.id];
      return left !== "skip" && left !== "ejected" && left !== "auto-out";
    }).length;
  }

  function skippedSpot(state, id) {
    const left = (state.rosterLeft || {})[id];
    return left === "skip" || left === "ejected";
  }

  function effectiveBatterIndex(state) {
    const rows = liveBatters(state);
    if (!rows.length) return 0;
    let idx = clampIndex(state && state.battingIndex) % rows.length;
    for (let n = 0; n < rows.length; n += 1) {
      if (!skippedSpot(state, rows[idx].id)) return idx;
      idx = (idx + 1) % rows.length;
    }
    return 0;
  }

  function stepBatter(state) {
    const rows = liveBatters(state);
    if (!rows.length) return 0;
    let idx = effectiveBatterIndex(state);
    for (let n = 0; n < rows.length; n += 1) {
      idx = (idx + 1) % rows.length;
      if (!skippedSpot(state, rows[idx].id) && (state.rosterLeft || {})[rows[idx].id] !== "ejected") break;
    }
    return idx;
  }

  function runnerBeforeLeadoff(state) {
    const rows = liveBatters(state);
    if (!rows.length) return "";
    let idx = effectiveBatterIndex(state) - 1;
    for (let n = 0; n < rows.length; n += 1) {
      if (idx < 0) idx = rows.length - 1;
      const id = rows[idx].id;
      if (!skippedSpot(state, id) && (state.rosterLeft || {})[id] !== "ejected") return id;
      idx -= 1;
    }
    return rows[0].id;
  }

  function advanceBatter(state, now) {
    if (!state || state.status !== "live") throw new Error("This game is not in progress.");
    const rows = liveBatters(state);
    if (!rows.length) return state;
    return remember(state, Object.assign({}, state, {
      battingIndex: stepBatter(state),
      balls: 0,
      strikes: 0,
      updatedAt: now || Date.now(),
    }), "Next batter");
  }

  function setCount(state, patch, now) {
    if (!state || state.status !== "live") throw new Error("This game is not in progress.");
    var nextBalls = patch.balls != null ? patch.balls : (state.balls || 0);
    var nextStrikes = patch.strikes != null ? patch.strikes : (state.strikes || 0);
    if (nextBalls > 3) nextBalls = 0;
    if (nextStrikes > 2) nextStrikes = 2;
    return remember(state, Object.assign({}, state, {
      balls: nextBalls,
      strikes: nextStrikes,
      bases: patch.bases || state.bases || [false, false, false],
      updatedAt: now || Date.now(),
    }), "Count");
  }

  function reachBase(state, now) {
    if (!state || state.status !== "live") throw new Error("This game is not in progress.");
    return remember(state, Object.assign({}, state, {
      battingIndex: stepBatter(state),
      balls: 0,
      strikes: 0,
      updatedAt: now || Date.now(),
    }), "Reached base");
  }

  function setBatter(state, index, now) {
    if (!state || state.status !== "live") throw new Error("This game is not in progress.");
    const rows = liveBatters(state);
    let idx = clampIndex(index);
    if (rows.length) idx = idx % rows.length;
    return remember(state, Object.assign({}, state, { battingIndex: idx, updatedAt: now || Date.now() }));
  }

  function tiebreakerActive(state) {
    if (!state || state.status !== "live") return false;
    const scheduled = scheduledInningsOf(state);
    const start = state.itbFrom || (state.timeLimit ? scheduled + 1 : Math.max(8, scheduled + 1));
    return state.inningIndex + 1 >= start;
  }

  function setItbRunner(state, playerId, now) {
    if (!state || state.status !== "live") throw new Error("This game is not in progress.");
    if (!tiebreakerActive(state) && !state.tiebreaker) throw new Error("The tiebreaker runner is not on yet.");
    const id = String(playerId || "");
    if (!id) throw new Error("Pick the runner.");
    return remember(state, Object.assign({}, state, {
      itbRunnerId: id,
      updatedAt: now || Date.now(),
    }), "Tiebreaker runner");
  }

  function itbRunner(state) {
    if (!state) return { id: "", label: "ITB runner on 2nd", order: 0 };
    const rows = liveBatters(state);
    if (state.itbRunnerId) {
      const found = rows.find(function (row) { return row.id === state.itbRunnerId; });
      if (found) return found;
    }
    if (roleFor(state.side, state.half) !== "offense") {
      return { id: "", label: "ITB runner on 2nd", order: 0 };
    }
    const id = runnerBeforeLeadoff(state);
    return rows.find(function (row) { return row.id === id; }) || { id: id, label: "ITB runner on 2nd", order: 0 };
  }

  function runRuleHit(state, half, inningNumber, scores) {
    const rules = Array.isArray(state && state.runRule) && state.runRule.length
      ? state.runRule
      : [{ after: 3, lead: 15 }, { after: 4, lead: 12 }, { after: 5, lead: 8 }];
    const homeLead = scores.home - scores.away;
    const gap = Math.abs(homeLead);
    return rules.some(function (rule) {
      const after = Number(rule.after);
      const lead = Number(rule.lead != null ? rule.lead : rule.margin);
      if (!(inningNumber >= after) || !(lead > 0)) return false;
      if (half === "top") return homeLead >= lead;
      return gap >= lead;
    });
  }

  function completedInnings(innings, half, index) {
    let n = index;
    if (half === "bottom") n += 1;
    return n;
  }

  function runRuleMargin(state, complete) {
    const rules = Array.isArray(state && state.runRule) && state.runRule.length
      ? state.runRule
      : [{ after: 3, lead: 15 }, { after: 4, lead: 12 }, { after: 5, lead: 8 }];
    let lead = 0;
    rules.forEach(function (rule) {
      const after = Number(rule.after);
      const margin = Number(rule.lead != null ? rule.lead : rule.margin);
      if (complete >= after && margin > lead) lead = margin;
    });
    return lead;
  }

  function finalBanner(state) {
    if (!state || state.status !== "played") return "Final";
    const scheduled = scheduledInningsOf(state);
    const played = (state.innings || []).filter(function (inn) {
      return inn && (typeof inn.top === "number" || inn.bottom === "X" || typeof inn.bottom === "number");
    }).length;
    const scores = totalsFromInnings(state.innings);
    const tied = state.endedReason === "forfeit" ? false : scores.home === scores.away;
    if (state.endedReason === "run-rule" || state.endedReason === "time" || state.endedReason === "called" || state.endedReason === "forfeit" || state.endedReason === "walk-off" || state.endedReason === "other") {
      return "Final/" + Math.max(1, played || state.inningIndex + 1) + (tied ? " · Tie" : "");
    }
    if (state.inningIndex + 1 > scheduled) return "Final/" + (state.inningIndex + 1);
    return "Final";
  }

  function endNote(state) {
    if (!state) return "";
    if (state.endedReason === "home-lead") {
      const n = (state.inningIndex || 0) + 1;
      return "Home led after the top of the " + ordinal(n) + ". Bottom skipped.";
    }
    if (state.endedReason === "run-rule") return "Run rule";
    if (state.endedReason === "time") return "Time limit";
    if (state.endedReason === "called") {
      const scores = totalsFromInnings(state.innings);
      return scores.home === scores.away ? "Called (weather) · Tie" : "Called (weather)";
    }
    if (state.endedReason === "forfeit") return "Forfeit";
    if (state.endedReason === "other") return "Other";
    if (state.endedReason === "walk-off") return "Walk-off";
    return "";
  }

  function skipBottomIfHomeLeads(state) {
    const innings = (state.innings || []).map(copyInning);
    const idx = state.inningIndex || 0;
    const inn = copyInning(innings[idx]);
    const scores = totalsFromInnings(innings);
    if (state.half === "top" && typeof inn.top === "number" && inn.bottom == null && scores.home > scores.away) {
      inn.bottom = "X";
      innings[idx] = inn;
    }
    return Object.assign({}, state, { innings: innings });
  }

  function calledGame(state) {
    const innings = (state.innings || []).map(copyInning);
    const idx = state.inningIndex || 0;
    const inn = copyInning(innings[idx]);
    const top = typeof inn.top === "number" ? inn.top : null;
    const bottom = typeof inn.bottom === "number" ? inn.bottom : null;
    if (state.half === "bottom" && top != null && (bottom == null ? 0 : bottom) >= top) {
      inn.bottom = bottom == null ? 0 : bottom;
      innings[idx] = inn;
      return Object.assign({}, state, { innings: innings });
    }
    if (idx > 0) {
      return Object.assign({}, state, {
        innings: innings.slice(0, idx),
        inningIndex: idx - 1,
        half: "bottom",
      });
    }
    return state;
  }

  function addRun(state, now) {
    if (!state || state.status !== "live") throw new Error("This game is not in progress.");
    const live = (Number(state.liveRuns) || 0) + 1;
    const next = Object.assign({}, state, { liveRuns: live, prompt: "", updatedAt: now || Date.now() });
    const board = scoreboard(next);
    const home = next.side === "home" ? board.usTotal : board.oppTotal;
    const away = next.side === "home" ? board.oppTotal : board.usTotal;
    const complete = next.half === "bottom" ? next.inningIndex + 1 : next.inningIndex;
    const margin = runRuleMargin(next, Math.max(complete, next.half === "bottom" ? next.inningIndex + 1 : 0));
    const inningNumber = next.inningIndex + 1;
    const lastOrExtra = inningNumber >= scheduledInningsOf(next) || (next.timeLimit && inningNumber > scheduledInningsOf(next));
    if (next.half === "bottom" && runRuleHit(next, "bottom", inningNumber, { home: home, away: away })) {
      next.prompt = "run-rule";
    } else if (next.half === "bottom" && home > away && (inningNumber >= scheduledInningsOf(next) || tiebreakerActive(next))) {
      next.prompt = "walk-off";
    }
    return remember(state, next, "+ Run");
  }

  function addTally(state, kind, side, now) {
    if (!state || state.status !== "live") throw new Error("This game is not in progress.");
    const key = (side === "opp" ? "opp" : "us") + (kind === "error" ? "Errors" : "Hits");
    const next = Object.assign({}, state, { updatedAt: now || Date.now() });
    next[key] = (Number(state[key]) || 0) + 1;
    return remember(state, next, kind === "error" ? "Error" : "Hit");
  }

  function editHalfRuns(state, inningIndex, half, runs, now) {
    if (!state) throw new Error("This game is not in progress.");
    const scored = parseRuns(runs);
    if (scored == null) throw new Error("Enter a whole number of runs, 0 or more.");
    if (half !== "top" && half !== "bottom") throw new Error("Pick a half inning.");
    const idx = Math.floor(Number(inningIndex));
    if (!Number.isFinite(idx) || idx < 0 || idx >= (state.innings || []).length) throw new Error("That inning is not on the card.");
    const innings = state.innings.map(copyInning);
    const cell = copyInning(innings[idx]);
    if (cell[half] == null && !(state.status === "live" && idx === state.inningIndex && half === state.half)) {
      throw new Error("That half has not been played.");
    }
    cell[half] = scored;
    innings[idx] = cell;
    const next = Object.assign({}, state, { innings: innings, updatedAt: now || Date.now() });
    const scores = totalsFromInnings(innings);
    if (next.status === "played" && next.endedReason !== "forfeit" && scores.home === scores.away) {
      next.status = "live";
      next.endedReason = "";
      next.finalUs = undefined;
      next.finalOpp = undefined;
      next.prompt = "Resume (now tied)";
    } else if (next.status === "played") {
      const board = scoreboard(next);
      next.finalUs = board.usTotal;
      next.finalOpp = board.oppTotal;
    } else if (runRuleHit(next, next.half, (next.inningIndex || 0) + 1, scores) || (next.half === "bottom" && scores.home > scores.away && (next.inningIndex || 0) + 1 >= scheduledInningsOf(next))) {
      next.prompt = scores.home - scores.away >= 8 ? "run-rule" : "walk-off";
    }
    return remember(state, next, "Edit half");
  }

  function setScheduledInnings(state, n, now, opts) {
    if (!state || state.status !== "live") throw new Error("This game is not in progress.");
    const options = opts || {};
    return remember(state, Object.assign({}, state, {
      scheduledInnings: clampScheduledInnings(n),
      timeLimit: options.timeLimit ? true : !!state.timeLimit && clampScheduledInnings(n) === scheduledInningsOf(state),
      itbFrom: options.itbFrom ? clampScheduledInnings(options.itbFrom) : (state.itbFrom || 0),
      updatedAt: now || Date.now(),
    }));
  }

  function resumeGame(state, now) {
    if (!state || state.status !== "played") throw new Error("This game is not final.");
    return remember(state, Object.assign({}, state, {
      status: "live",
      endedReason: "",
      endedAt: undefined,
      prompt: "",
      updatedAt: now || Date.now(),
    }));
  }

  function ofRecord(state) {
    const card = (state.lineupSnapshot && state.lineupSnapshot.defensivePositions) || {};
    if ((state.inningIndex || 0) === 0 && state.half === "top") {
      return { P: card.P ? String(card.P) : "", C: card.C ? String(card.C) : "" };
    }
    return {
      P: state.defense && state.defense.P ? String(state.defense.P) : "",
      C: state.defense && state.defense.C ? String(state.defense.C) : "",
    };
  }

  function courtesyChoice(state, forId, runnerId) {
    if (!state || !forId || !runnerId) return { ok: false, reason: "Pick a runner and who she runs for." };
    const forPlayer = String(forId);
    const runner = String(runnerId);
    if (forPlayer === runner) return { ok: false, reason: "She cannot run for herself." };
    const record = ofRecord(state);
    let pos = "";
    if (record.P === forPlayer) pos = "P";
    else if (record.C === forPlayer) pos = "C";
    if (!pos) return { ok: false, illegal: false, reason: "A courtesy runner is only for the pitcher or catcher." };
    const used = state.courtesyUsed || {};
    const other = pos === "P" ? "C" : "P";
    if (used[other] && String(used[other]) === runner) {
      return { ok: false, illegal: true, reason: "The same courtesy runner cannot run for both the pitcher and the catcher." };
    }
    if (state.courtesyPool !== "jo") {
      if (inLineup(state, runner) || spotIndexOf(state, runner) >= 0) {
        return { ok: false, reason: "She is already in the game." };
      }
      if (currentPosition(state.defense, runner)) return { ok: false, reason: "She is already in the game." };
      const entry = ensureEntries(state)[runner];
      if (entry) return { ok: false, reason: "She has already played in this game." };
    }
    return { ok: true, pos: pos, reason: "" };
  }

  function opKey(op) {
    const at = op.atHalf || {};
    return [
      op.type,
      at.inningIndex,
      at.half,
      at.outs,
      at.liveRuns,
      at.battingIndex,
      at.actionId,
      at.tally,
    ].join(":");
  }

  function staleGate(state, op) {
    const guarded = op.type === "add-out" || op.type === "add-run" || op.type === "next-batter" || op.type === "add-tally" || op.type === "undo" || op.type === "reach-base";
    if (guarded && (op.atHalf || op.type === "undo")) {
      const seen = state.seenOpKeys || [];
      if (seen.indexOf(opKey(op)) >= 0) return "drop";
    }
    const at = op.atHalf || {};
    if (op.type === "add-run" && at.liveRuns != null && Number(at.liveRuns) !== (Number(state.liveRuns) || 0)) return "drop";
    if ((op.type === "next-batter" || op.type === "reach-base") && at.battingIndex != null && Number(at.battingIndex) !== (Number(state.battingIndex) || 0)) return "drop";
    if (op.type === "undo" && at.actionId != null && Number(at.actionId) !== (Number(state.actionSeq) || 0)) return "drop";
    if (op.type === "add-tally" && at.tally != null && Number(at.tally) !== ((Number(state.usHits) || 0) + (Number(state.oppHits) || 0) + (Number(state.usErrors) || 0) + (Number(state.oppErrors) || 0))) return "drop";
    const sameInning = at.inningIndex == null || Number(at.inningIndex) === state.inningIndex;
    const sameHalf = !at.half || at.half === state.half;
    if (!op.atHalf) return "ok";
    if (!sameInning || !sameHalf) {
      if (op.type === "record-runs" || op.type === "set-half-runs") {
        const inn = state.innings[Number(at.inningIndex)];
        const have = inn && inn[at.half];
        if (have != null && have !== "X" && Number(have) === parseRuns(op.runs)) return "same";
      }
      return "drop";
    }
    if (op.type === "add-out" && at.outs != null && Number(at.outs) !== clampOuts(state.outs)) return "drop";
    return "ok";
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    FIELD_POSITIONS: FIELD_POSITIONS,
    emptyDefense: emptyDefense,
    cloneDefense: cloneDefense,
    defenseHasAssignments: defenseHasAssignments,
    parseRuns: parseRuns,
    slimPlayer: slimPlayer,
    playerLabel: playerLabel,
    slimGame: slimGame,
    gamesFromLineupRecord: gamesFromLineupRecord,
    selectLineupRecord: selectLineupRecord,
    playersOnTeam: playersOnTeam,
    battingSide: battingSide,
    roleFor: roleFor,
    halfLabel: halfLabel,
    opponentLabel: opponentLabel,
    defenseForInning: defenseForInning,
    clampScheduledInnings: clampScheduledInnings,
    isExtraHalf: isExtraHalf,
    endNote: endNote,
    createLiveGame: createLiveGame,
    recordRuns: recordRuns,
    setDefense: setDefense,
    setInjuryOut: setInjuryOut,
    leaveRosterPlayer: leaveRosterPlayer,
    setCourtesy: setCourtesy,
    subForFlex: subForFlex,
    reenterFlex: reenterFlex,
    setTiebreaker: setTiebreaker,
    clampOuts: clampOuts,
    addOut: addOut,
    undoOut: undoOut,
    thirdOutPrompt: thirdOutPrompt,
    formatInnings: formatInnings,
    scoreboard: scoreboard,
    scoreboardRows: scoreboardRows,
    scoreLine: scoreLine,
    liveScoreMeta: liveScoreMeta,
    finalScoreMeta: finalScoreMeta,
    endGame: endGame,
    unplayedGames: unplayedGames,
    playedEntries: playedEntries,
    defenseRows: defenseRows,
    lineupView: lineupView,
    formatInfo: formatInfo,
    normalizeMode: normalizeMode,
    liveBatters: liveBatters,
    dueSlots: dueSlots,
    subChoice: subChoice,
    applySub: applySub,
    swapDpFlex: swapDpFlex,
    playerMayField: playerMayField,
    describeChange: describeChange,
    defensiveInningRows: defensiveInningRows,
    normalizeSession: normalizeSession,
    emptyStore: emptyStore,
    normalizeStore: normalizeStore,
    emptyDocument: emptyDocument,
    normalizeDocument: normalizeDocument,
    stampDocument: stampDocument,
    documentFromStore: documentFromStore,
    envelopeFromLegacy: envelopeFromLegacy,
    applyGameOp: applyGameOp,
    undo: undo,
    reachBase: reachBase,
    advanceBatter: advanceBatter,
    setBatter: setBatter,
    effectiveBatterIndex: effectiveBatterIndex,
    addRun: addRun,
    addTally: addTally,
    editHalfRuns: editHalfRuns,
    setScheduledInnings: setScheduledInnings,
    resumeGame: resumeGame,
    tiebreakerActive: tiebreakerActive,
    setItbRunner: setItbRunner,
    itbRunner: itbRunner,
    courtesyChoice: courtesyChoice,
    finalBanner: finalBanner,
    abbrOf: abbrOf,
    readableTeam: readableTeam,
  };
});
