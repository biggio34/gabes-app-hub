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
        label: "Bat the roster",
        detail: "Everyone bats. Due up wraps after the last hitter. Defensive swaps are free. Nobody is subbed out of the order.",
      },
      nine: {
        label: "Bat 9",
        detail: "Nine bat. A starter may leave and re-enter once, only in her original batting spot.",
      },
      "dp-flex": {
        label: "DP / Flex",
        detail: "Ten names, nine bat. The Flex plays defense only. The DP hits only unless she takes a position. Either starter may re-enter once.",
      },
      "one-ap": {
        label: "Extra hitter",
        detail: "Ten bat, like Bat 9. The extra hitter and any fielder may trade defense and hitting-only. All 10 still bat.",
      },
      "two-ap": {
        label: "Two extra hitters",
        detail: "Eleven bat, like Bat 9. Extra hitters and fielders may trade defense and hitting-only. All 11 still bat.",
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
    if (dp) return String(dp);
    const batters = batterIdsForMode(game);
    const field = new Set(FIELD_POSITIONS.map(function (pos) {
      return game.defensivePositions && game.defensivePositions[pos] ? String(game.defensivePositions[pos]) : "";
    }));
    const sitting = batters.find(function (id) { return !field.has(id); });
    return sitting || batters[0] || "";
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
    const departed = new Set((state.departed || []).map(String));
    const starterSpot = (state.spots || []).findIndex(function (item) { return item.starterId === incoming; });
    if (starterSpot >= 0 && starterSpot !== spotIndex) {
      return { ok: false, illegal: true, reason: "A starter may re-enter only once, in the original batting spot." };
    }
    if (incoming === spot.starterId) {
      if (spot.starterReturned) {
        return { ok: false, illegal: true, reason: "A starter may re-enter only once, in the original batting spot." };
      }
      return { ok: true, illegal: false, kind: "reenter", reason: "" };
    }
    if (inLineup(state, incoming)) return { ok: false, illegal: false, reason: "That player is already in the batting order." };
    if (departed.has(incoming)) {
      return { ok: false, illegal: true, reason: "A player who has left the game cannot re-enter." };
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
    if (leaving && leaving !== spot.starterId && leaving !== flexId && departed.indexOf(leaving) < 0) departed.push(leaving);
    if (incoming === spot.starterId) spot.starterReturned = true;
    spot.currentId = incoming;
    const defense = cloneDefense(state.defense);
    FIELD_POSITIONS.forEach(function (pos) {
      if (defense[pos] === leaving) defense[pos] = incoming;
    });
    let flexBatting = !!state.flexBatting;
    if (normalizeMode(state.battingMode) === "dp-flex" && spotIndex === state.dpSpot && incoming !== flexId) {
      flexBatting = false;
    }
    return Object.assign({}, state, {
      spots: spots,
      departed: departed,
      defense: defense,
      lastFieldPos: rememberFieldPositions(state, defense),
      flexBatting: flexBatting,
      updatedAt: now || Date.now(),
    });
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
      return Object.assign({}, state, {
        spots: spots,
        defense: defense,
        lastFieldPos: rememberFieldPositions(state, defense),
        flexBatting: true,
        dpSpot: liveDpIndex({ spots: spots, dpId: dpId, dpSpot: state.dpSpot }),
        updatedAt: now || Date.now(),
      });
    }
    if (spot.starterReturned && !force) throw new Error("The DP may re-enter only once.");
    spot.currentId = dpId;
    spot.starterReturned = true;
    return Object.assign({}, state, {
      spots: spots,
      flexBatting: false,
      dpReentered: true,
      updatedAt: now || Date.now(),
    });
  }

  function possessive(name) {
    if (/s$/i.test(name)) return name + "'";
    return name + "'s";
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
    if (change.type === "leave") return describeLeave(state, change.playerId);
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
    const counts = " Pinch hitters and pinch runners count as this sub.";
    let text;
    if (state.battingMode === "dp-flex" && spotIndex === state.dpSpot) {
      text = incomingName + " takes the DP's #" + spotNo + " batting spot for " + leavingName.replace(/'s$|'$/, "") + ".";
      text += pos ? " She enters at " + pos + "." : " Defense unchanged.";
      text += counts;
    } else if (pos) {
      text = incomingName + " enters at " + pos + " and takes " + leavingName + " #" + spotNo + " batting spot." + counts;
    } else {
      text = incomingName + " takes " + leavingName + " #" + spotNo + " batting spot. Defense unchanged." + counts;
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
      let text = "Flex bats for DP in spot " + spotNo + "; DP leaves offense. Lineup drops to 9.";
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
      text: "DP re-enters in spot " + spotNo + ", her one re-entry. Flex returns to defense only. Lineup is 10.",
    };
  }

  function describeLeave(state, playerId) {
    if (!state || state.battingMode !== "roster") {
      return { ok: false, illegal: false, reason: "Only bat the roster uses this.", text: "" };
    }
    const id = String(playerId || "");
    const order = ((state.lineupSnapshot && state.lineupSnapshot.battingOrder) || []).map(String);
    const found = order.indexOf(id);
    const spotNo = found >= 0 ? found + 1 : 1;
    const name = lastName(state, id);
    const pos = currentPosition(state.defense, id);
    let text = name + " leaves the game. ";
    if (state.injuryOut) text += "Her #" + spotNo + " batting spot is an automatic out. ";
    else text += "She stays in the batting order. Not an automatic out. ";
    text += pos ? name + " leaves " + pos + "." : "Defense unchanged.";
    return { ok: true, illegal: false, reason: "", text: text };
  }

  function describeCourtesy(state, forId, runnerId) {
    const text = lastName(state, runnerId) + " is the courtesy runner for " + lastName(state, forId)
      + ". Not a sub. Batting order unchanged. Defense unchanged. Re-entry unchanged.";
    return { ok: !!(forId && runnerId), illegal: false, reason: forId && runnerId ? "" : "Pick a runner and who she runs for.", text: text };
  }

  function describeFlexSub(state, playerId) {
    if (!state || state.battingMode !== "dp-flex") {
      return { ok: false, illegal: false, reason: "This lineup is not DP / Flex.", text: "" };
    }
    const flexNow = String(state.flexCurrentId || state.flexId || "");
    const pos = currentPosition(state.defense, flexNow);
    if (!pos || state.flexLeft) return { ok: false, illegal: false, reason: "The Flex is not on defense.", text: "" };
    const incoming = String(playerId || "");
    if ((state.departed || []).map(String).indexOf(incoming) >= 0) {
      return {
        ok: false,
        illegal: true,
        reason: "A removed substitute cannot re-enter.",
        text: lastName(state, incoming) + " cannot return on defense for the Flex.",
      };
    }
    return {
      ok: true,
      illegal: false,
      reason: "",
      text: lastName(state, incoming) + " subs for the Flex at " + pos + ". Defense only. Batting order unchanged. "
        + lastName(state, state.flexId) + " may re-enter once.",
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
        if (left[row.id] === "stay") return Object.assign({}, row, { role: "Left game" });
        return row;
      });
    }
    return state.spots.map(function (spot, index) {
      const id = slotCurrent(spot);
      let role = "";
      if (state.battingMode === "dp-flex" && (id === state.dpId || id === state.flexId || spot.starterId === state.dpId)) {
        role = state.flexBatting && id === state.flexId ? "Flex" : "DP";
      }
      if ((state.battingMode === "one-ap" || state.battingMode === "two-ap") && index >= 9) role = "EH";
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
    return (half === "bottom" ? "Bottom" : "Top") + " " + n;
  }

  function opponentLabel(gameName) {
    const name = String(gameName || "").trim();
    const match = name.match(/^(?:vs\.?|versus)\s+(.+)$/i);
    if (!match) return "Opponent";
    const trimmed = match[1].replace(/\s+[-–—].*$/, "").trim();
    return trimmed || "Opponent";
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

  function endNote(state) {
    if (!state || state.endedReason !== "home-lead") return "";
    const n = (state.inningIndex || 0) + 1;
    return "Home led after the top of the " + ordinal(n) + ". Bottom skipped.";
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
    const flexId = flexIdFor(snapshot);
    const dpId = dpIdFor(snapshot);
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
      courtesy: null,
      departed: [],
      players: Array.isArray(input.players) ? input.players.map(slimPlayer).filter(Boolean) : [],
      lineupSnapshot: snapshot,
      gameName: snapshot.name,
      teamName: String((input && input.teamName) || "Us"),
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
    const ids = roleFor(state.side, state.half) === "defense" ? fieldersNow(state.defense) : [];
    return Object.assign({}, state, {
      outs: current + 1,
      defensiveOuts: addCredit(state.defensiveOuts, ids),
      outLog: (state.outLog || []).concat([ids]),
      lastFieldPos: rememberFieldPositions(state, state.defense),
      updatedAt: now || Date.now(),
    });
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
      updatedAt: stamp,
    };

    if (completedHalf === "top" && inningNumber >= scheduled && scores.home > scores.away) {
      current.bottom = "X";
      innings[completedIndex] = current;
      return finishPlayed(state, Object.assign({}, shared, {
        inningIndex: completedIndex,
        half: "top",
        endedReason: "home-lead",
      }), stamp);
    }

    if (completedHalf === "bottom" && inningNumber >= scheduled && scores.home !== scores.away) {
      return finishPlayed(state, Object.assign({}, shared, {
        inningIndex: completedIndex,
        half: "bottom",
        endedReason: "final",
      }), stamp);
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
    return Object.assign({}, state, shared, {
      status: "live",
      inningIndex: inningIndex,
      half: half,
      defense: defense,
      openingDefense: onDefense ? cloneDefense(defense) : null,
      tiebreaker: false,
      endedReason: "",
      outs: 0,
    });
  }

  function setTiebreaker(state, on, now) {
    if (!state || state.status !== "live") throw new Error("This game is not in progress.");
    if (!isExtraHalf(state)) throw new Error("The tiebreaker is for extra innings.");
    return Object.assign({}, state, {
      tiebreaker: !!on,
      updatedAt: now || Date.now(),
    });
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
      return Object.assign({}, state, {
        defense: defense,
        lastFieldPos: rememberFieldPositions(state, defense),
        flexOnCard: false,
        flexLeft: true,
        flexPos: position,
        flexCurrentId: "",
        updatedAt: now || Date.now(),
      });
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
    return Object.assign({}, state, {
      defense: defense,
      lastFieldPos: rememberFieldPositions(state, defense),
      updatedAt: now || Date.now(),
    });
  }

  function setInjuryOut(state, on, now) {
    if (!state || state.battingMode !== "roster") throw new Error("Only bat the roster uses this setting.");
    return Object.assign({}, state, { injuryOut: !!on, updatedAt: now || Date.now() });
  }

  function leaveRosterPlayer(state, playerId, now) {
    if (!state || state.battingMode !== "roster") throw new Error("Only bat the roster uses this.");
    const id = String(playerId || "");
    const defense = cloneDefense(state.defense);
    FIELD_POSITIONS.forEach(function (pos) {
      if (defense[pos] === id) defense[pos] = null;
    });
    const left = Object.assign({}, state.rosterLeft);
    left[id] = state.injuryOut ? "auto-out" : "stay";
    return Object.assign({}, state, {
      defense: defense,
      lastFieldPos: rememberFieldPositions(state, defense),
      rosterLeft: left,
      updatedAt: now || Date.now(),
    });
  }

  function setCourtesy(state, forId, runnerId, now) {
    const courtesy = forId && runnerId ? { forId: String(forId), runnerId: String(runnerId) } : null;
    return Object.assign({}, state, { courtesy: courtesy, updatedAt: now || Date.now() });
  }

  function subForFlex(state, playerId, force, now) {
    const effect = describeFlexSub(state, playerId);
    if (!effect.ok && !(force && effect.illegal)) throw new Error(effect.reason || "That Flex sub is not allowed.");
    const incoming = String(playerId);
    const flexNow = String(state.flexCurrentId || state.flexId || "");
    const pos = currentPosition(state.defense, flexNow);
    const defense = cloneDefense(state.defense);
    const leaving = defense[pos];
    defense[pos] = incoming;
    const departed = (state.departed || []).map(String);
    if (leaving && leaving !== String(state.flexId || "") && departed.indexOf(leaving) < 0) departed.push(leaving);
    return Object.assign({}, state, {
      defense: defense,
      departed: departed,
      flexLeft: true,
      flexOnCard: false,
      flexPos: pos,
      flexCurrentId: incoming,
      updatedAt: now || Date.now(),
    });
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
    return Object.assign({}, state, {
      defense: defense,
      departed: departed,
      flexLeft: false,
      flexOnCard: true,
      flexReentered: true,
      flexCurrentId: String(state.flexId || ""),
      updatedAt: now || Date.now(),
    });
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
    const end = Math.min(last, innings.length - 1);
    for (let i = 0; i <= end; i += 1) {
      const cells = inningCells(state.side, innings[i]);
      if (typeof cells.us === "number") usTotal += cells.us;
      if (typeof cells.opp === "number") oppTotal += cells.opp;
      rows.push({
        inning: i + 1,
        us: cells.us,
        opp: cells.opp,
        current: Boolean(state.status === "live" && i === state.inningIndex),
      });
    }
    const scheduled = scheduledInningsOf(state);
    return {
      innings: rows,
      usTotal: usTotal,
      oppTotal: oppTotal,
      role: state && state.status === "live" ? roleFor(state.side, state.half) : "",
      label: state && state.status === "live" ? halfLabel(state.inningIndex, state.half) : "Final",
      side: state ? state.side : "",
      extra: Boolean(state && state.status === "live" && state.inningIndex + 1 > scheduled),
      scheduledInnings: scheduled,
    };
  }

  function displayOpponent(gameName) {
    const name = opponentLabel(gameName);
    return name === "Opponent" ? "Opp" : name;
  }

  function scoreboardRows(state) {
    const board = scoreboard(state);
    const home = Boolean(state && state.side === "home");
    const us = {
      team: "us",
      side: home ? "home" : "away",
      label: "Us",
      cells: board.innings.map(function (inn) { return inn.us; }),
      total: board.usTotal,
    };
    const opp = {
      team: "opp",
      side: home ? "away" : "home",
      label: displayOpponent(state && state.gameName),
      cells: board.innings.map(function (inn) { return inn.opp; }),
      total: board.oppTotal,
    };
    return home ? [opp, us] : [us, opp];
  }

  function scoreLine(state) {
    const rows = scoreboardRows(state);
    return rows[0].label + " " + rows[0].total + ", " + rows[1].label + " " + rows[1].total;
  }

  function liveScoreMeta(state) {
    const board = scoreboard(state);
    const role = board.role === "defense" ? "Defense" : "Offense";
    return "In progress · " + board.label + " · " + role + " · " + scoreLine(state);
  }

  function finalScoreMeta(state) {
    return "Final " + scoreLine(state);
  }

  function endGame(state, now) {
    if (!state || state.status !== "live") throw new Error("This game is not in progress.");
    const board = scoreboard(Object.assign({}, state, { status: "played" }));
    const stamp = now || Date.now();
    return Object.assign({}, state, {
      status: "played",
      finalUs: board.usTotal,
      finalOpp: board.oppTotal,
      endedReason: state.endedReason || "manual",
      outLog: [],
      outs: 0,
      endedAt: stamp,
      updatedAt: stamp,
    });
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
      if ((mode === "one-ap" || mode === "two-ap") && index >= 9) role = "EH";
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
      endedReason: raw.endedReason === "home-lead" || raw.endedReason === "final" || raw.endedReason === "manual"
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
      rosterLeft: raw.rosterLeft && typeof raw.rosterLeft === "object" ? raw.rosterLeft : {},
      courtesy: raw.courtesy && raw.courtesy.forId && raw.courtesy.runnerId
        ? { forId: String(raw.courtesy.forId), runnerId: String(raw.courtesy.runnerId) }
        : null,
      departed: Array.isArray(raw.departed) ? raw.departed.map(String) : [],
      players: Array.isArray(raw.players) ? raw.players.map(slimPlayer).filter(Boolean) : [],
      lineupSnapshot: snapshot,
      gameName: String(raw.gameName || (snapshot && snapshot.name) || "Untitled Game"),
      teamName: String(raw.teamName || "Us"),
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
    if (op.type === "add-out") put(addOut(current, stamp));
    else if (op.type === "undo-out") put(undoOut(current, stamp));
    else if (op.type === "record-runs") put(recordRuns(current, op.runs, stamp));
    else if (op.type === "set-defense") put(setDefense(current, op.position, op.playerId || "", stamp));
    else if (op.type === "injury") put(setInjuryOut(current, !!op.on, stamp));
    else if (op.type === "leave") put(leaveRosterPlayer(current, op.playerId, stamp));
    else if (op.type === "courtesy") put(setCourtesy(current, op.forId, op.runnerId, stamp));
    else if (op.type === "flex-sub") put(subForFlex(current, op.playerId, !!op.force, stamp));
    else if (op.type === "flex-return") put(reenterFlex(current, !!op.force, stamp));
    else if (op.type === "tiebreaker") put(setTiebreaker(current, !!op.on, stamp));
    else if (op.type === "sub") put(applySub(current, op.spot, op.playerId, !!op.force, stamp));
    else if (op.type === "swap-dp-flex") put(swapDpFlex(current, stamp, !!op.force));
    else if (op.type === "end") {
      const ended = endGame(current, stamp);
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
  };
});
