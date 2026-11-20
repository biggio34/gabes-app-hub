/**
 * Dugout game state for Game Manager.
 * Pure helpers: half innings, home/away offense and defense, runs, and
 * defensive innings. The page stores the result on the phone.
 * This file does not read or write Lineup Builder data.
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
        detail: "Everyone bats, in order. Nine play defense at a time. Defensive subs are free.",
      },
      nine: {
        label: "Bat 9",
        detail: "Nine bat. The rest are subs. A starter may re-enter once, in the original spot.",
      },
      "dp-flex": {
        label: "DP / Flex",
        detail: "Nine bat, including the DP. The Flex plays defense and does not bat unless they swap.",
      },
      "one-ap": {
        label: "Extra hitter",
        detail: "Ten bat, including one extra hitter. Nine play defense. A starter may re-enter once.",
      },
      "two-ap": {
        label: "Two extra hitters",
        detail: "Eleven bat, including two extra hitters. Nine play defense. A starter may re-enter once.",
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

  function playerMayField(state, playerId) {
    const mode = normalizeMode(state && state.battingMode);
    if (mode === "roster" || !state || !state.spots || !state.spots.length) return true;
    const id = String(playerId || "");
    if (!id) return false;
    if (mode === "dp-flex") {
      const dpId = String(state.dpId || "");
      const flexId = String(state.flexId || "");
      if (!state.flexBatting) {
        if (id === dpId) return false;
        if (id === flexId) return true;
        return inLineup(state, id);
      }
      if (id === flexId) return false;
      if (id === dpId) return true;
      return inLineup(state, id);
    }
    return inLineup(state, id);
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
    if (state.battingMode === "dp-flex" && (incoming === state.flexId || incoming === state.dpId)) {
      return { ok: false, illegal: false, reason: "Use the DP / Flex swap for those two." };
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
    const departed = (state.departed || []).map(String);
    if (leaving && leaving !== spot.starterId && departed.indexOf(leaving) < 0) departed.push(leaving);
    if (incoming === spot.starterId) spot.starterReturned = true;
    spot.currentId = incoming;
    const defense = cloneDefense(state.defense);
    FIELD_POSITIONS.forEach(function (pos) {
      if (defense[pos] === leaving) defense[pos] = incoming;
    });
    return Object.assign({}, state, {
      spots: spots,
      departed: departed,
      defense: defense,
      updatedAt: now || Date.now(),
    });
  }

  function swapDpFlex(state, now) {
    if (!state || state.battingMode !== "dp-flex") throw new Error("This lineup is not DP / Flex.");
    const spots = state.spots.map(function (spot) { return Object.assign({}, spot); });
    const spot = spots[state.dpSpot];
    if (!spot) throw new Error("The DP spot is missing.");
    const defense = cloneDefense(state.defense);
    const flexId = String(state.flexId || "");
    const dpId = String(state.dpId || "");
    if (!state.flexBatting) {
      const flexPos = currentPosition(defense, flexId);
      spot.currentId = flexId;
      if (flexPos) {
        FIELD_POSITIONS.forEach(function (pos) {
          if (defense[pos] === dpId) defense[pos] = null;
        });
        defense[flexPos] = dpId;
      }
      return Object.assign({}, state, { spots: spots, defense: defense, flexBatting: true, updatedAt: now || Date.now() });
    }
    spot.currentId = dpId;
    FIELD_POSITIONS.forEach(function (pos) {
      if (defense[pos] === dpId) defense[pos] = flexId;
    });
    return Object.assign({}, state, { spots: spots, defense: defense, flexBatting: false, updatedAt: now || Date.now() });
  }

  function liveBatters(state) {
    const players = (state && state.players) || [];
    const byId = new Map(players.map(function (player) { return [player.id, player]; }));
    function label(id) { return playerLabel(byId.get(id) || { id: id, name: "Unknown" }); }
    if (!state || !state.spots || normalizeMode(state.battingMode) === "roster") {
      const view = lineupView(state && state.lineupSnapshot, players);
      return view.batting;
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
    if (nextId && state.spots && state.spots.length && !playerMayField(state, nextId)) {
      if (state.battingMode === "dp-flex" && nextId === String(state.dpId || "") && !state.flexBatting) {
        throw new Error("The DP plays defense only after swapping with the Flex.");
      }
      if (state.battingMode === "dp-flex" && nextId === String(state.flexId || "") && state.flexBatting) {
        throw new Error("The Flex is batting and stays off defense until they swap back.");
      }
      throw new Error("That player is not in the game. Sub them into the batting order first.");
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
          position: currentPosition(state.defense, id),
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
    setTiebreaker: setTiebreaker,
    clampOuts: clampOuts,
    addOut: addOut,
    undoOut: undoOut,
    thirdOutPrompt: thirdOutPrompt,
    formatInnings: formatInnings,
    scoreboard: scoreboard,
    endGame: endGame,
    unplayedGames: unplayedGames,
    playedEntries: playedEntries,
    defenseRows: defenseRows,
    lineupView: lineupView,
    formatInfo: formatInfo,
    normalizeMode: normalizeMode,
    liveBatters: liveBatters,
    subChoice: subChoice,
    applySub: applySub,
    swapDpFlex: swapDpFlex,
    playerMayField: playerMayField,
    defensiveInningRows: defensiveInningRows,
    normalizeSession: normalizeSession,
    emptyStore: emptyStore,
    normalizeStore: normalizeStore,
  };
});
