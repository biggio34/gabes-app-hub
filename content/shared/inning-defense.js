/**
 * Inning-by-inning defensive plans for Lineup Builder.
 * Pure helpers so games can store a defense map per inning.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.InningDefense = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const FIELD_POSITIONS = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"];
  const DEFAULT_INNING_COUNT = 7;
  const MIN_INNINGS = 5;
  const MAX_INNINGS = 12;

  // Same geometry as the Lineup Builder diamond (viewBox 0 0 2400 620).
  const MINI_FIELD_POSITIONS = [
    { key: "P", x: 1085, y: 360, w: 230, h: 68 },
    { key: "C", x: 1080, y: 475, w: 240, h: 72 },
    { key: "1B", x: 1405, y: 358, w: 185, h: 62 },
    { key: "2B", x: 1300, y: 238, w: 175, h: 78 },
    { key: "3B", x: 810, y: 358, w: 185, h: 62 },
    { key: "SS", x: 895, y: 238, w: 175, h: 78 },
    { key: "LF", x: 340, y: 140, w: 195, h: 62 },
    { key: "CF", x: 1085, y: 92, w: 230, h: 62 },
    { key: "RF", x: 1865, y: 140, w: 195, h: 62 },
  ];
  const SPECIAL_BOX_X = 50;
  const SPECIAL_BOX_WIDTH = 240;
  const SPECIAL_STACK_BOTTOM = 600;
  const SPECIAL_STACK_STEP = 80;

  function clampInningCount(value) {
    const n = parseInt(value, 10);
    if (!Number.isFinite(n)) return DEFAULT_INNING_COUNT;
    return Math.max(MIN_INNINGS, Math.min(MAX_INNINGS, n));
  }

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
      defense[key] = src[key] || null;
    });
    return defense;
  }

  function defenseHasAssignments(defense) {
    if (!defense || typeof defense !== "object") return false;
    return Object.keys(defense).some(function (key) {
      return Boolean(defense[key]);
    });
  }

  function filledFieldCount(defense) {
    if (!defense) return 0;
    return FIELD_POSITIONS.reduce(function (count, pos) {
      return count + (defense[pos] ? 1 : 0);
    }, 0);
  }

  function playerPosition(defense, playerId) {
    if (!defense || !playerId) return "";
    const keys = Object.keys(defense);
    for (let i = 0; i < keys.length; i++) {
      if (defense[keys[i]] === playerId) return keys[i];
    }
    return "";
  }

  function isBenchRequest(requested) {
    return !requested || requested === "BENCH" || requested === "Bn" || requested === "—";
  }

  function assignInDefense(defense, playerId, requested) {
    if (!defense || !playerId) return defense;

    if (isBenchRequest(requested)) {
      Object.keys(defense).forEach(function (key) {
        if (defense[key] === playerId) delete defense[key];
      });
      return defense;
    }

    let targetKey = requested;
    if (requested === "AP") {
      const alreadyOnAP = Object.keys(defense).find(function (key) {
        return key.startsWith("AP") && defense[key] === playerId;
      });
      if (alreadyOnAP) {
        targetKey = alreadyOnAP;
      } else {
        let n = 1;
        while (defense["AP" + n]) n += 1;
        targetKey = "AP" + n;
      }
    }

    let prevKey = null;
    Object.keys(defense).forEach(function (key) {
      if (defense[key] === playerId) prevKey = key;
    });

    if (prevKey === targetKey) return defense;

    const currentOccupant = defense[targetKey];
    let performingSwap = false;
    if (currentOccupant && currentOccupant !== playerId) {
      if (prevKey) {
        defense[prevKey] = currentOccupant;
        performingSwap = true;
      } else {
        delete defense[targetKey];
      }
    }

    if (prevKey && prevKey !== targetKey && !performingSwap) {
      delete defense[prevKey];
    }

    defense[targetKey] = playerId;
    return defense;
  }

  function stripInvalidFromDefense(defense, validIds, unavailableIds) {
    if (!defense) return defense;
    const valid = validIds instanceof Set ? validIds : new Set(validIds || []);
    const unavailable = unavailableIds instanceof Set ? unavailableIds : new Set(unavailableIds || []);
    Object.keys(defense).forEach(function (key) {
      const id = defense[key];
      if (!id) return;
      if (!valid.has(id) || unavailable.has(id)) delete defense[key];
    });
    return defense;
  }

  function stripPlayersNotInSet(defense, allowedIds) {
    if (!defense) return defense;
    const allowed = allowedIds instanceof Set ? allowedIds : new Set(allowedIds || []);
    Object.keys(defense).forEach(function (key) {
      const id = defense[key];
      if (id && !allowed.has(id)) delete defense[key];
    });
    return defense;
  }

  function ensureInningDefenses(list, count, seed) {
    const n = clampInningCount(count);
    const source = Array.isArray(list) ? list : [];
    const next = [];
    for (let i = 0; i < n; i++) {
      if (source[i]) {
        next.push(cloneDefense(source[i]));
      } else if (i === 0 && seed) {
        next.push(cloneDefense(seed));
      } else {
        next.push(emptyDefense());
      }
    }
    return next;
  }

  function copyInningToRange(innings, fromIndex, startInclusive, endInclusive) {
    if (!Array.isArray(innings) || !innings[fromIndex]) return innings;
    const src = cloneDefense(innings[fromIndex]);
    const start = Math.max(0, startInclusive);
    const end = Math.min(innings.length - 1, endInclusive);
    for (let i = start; i <= end; i++) {
      innings[i] = cloneDefense(src);
    }
    return innings;
  }

  function planHasLaterInnings(innings) {
    if (!Array.isArray(innings)) return false;
    for (let i = 1; i < innings.length; i++) {
      if (defenseHasAssignments(innings[i])) return true;
    }
    return false;
  }

  function playerById(players, id) {
    if (!players) return null;
    for (let i = 0; i < players.length; i++) {
      if (players[i] && players[i].id === id) return players[i];
    }
    return null;
  }

  function tableRows(players, battingOrder, innings) {
    const order = Array.isArray(battingOrder) ? battingOrder : [];
    const maps = Array.isArray(innings) ? innings : [];
    return order
      .map(function (id) {
        const player = playerById(players, id);
        if (!player) return null;
        return {
          player: player,
          positions: maps.map(function (defense) {
            return playerPosition(defense, id) || "";
          }),
        };
      })
      .filter(Boolean);
  }

  function benchForDefense(battingOrder, defense, players) {
    const onDefense = new Set(
      Object.keys(defense || {})
        .map(function (key) {
          return defense[key];
        })
        .filter(Boolean),
    );
    return (battingOrder || [])
      .map(function (id) {
        return playerById(players, id);
      })
      .filter(Boolean)
      .filter(function (player) {
        return !onDefense.has(player.id);
      });
  }

  function escapeXml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function playerLabel(player, fallback) {
    if (!player) return fallback;
    if (player.number != null && String(player.number).trim() !== "") return String(player.number);
    return "•";
  }

  function specialBoxSvg(key, map, players, y, boxHeight) {
    const pid = map[key];
    const player = pid ? playerById(players, pid) : null;
    const isEmpty = !player;
    const label = isEmpty ? key : playerLabel(player, key);
    const cx = SPECIAL_BOX_X + SPECIAL_BOX_WIDTH / 2;
    const cy = y + boxHeight / 2;
    return (
      '<g data-pos="' +
      escapeXml(key) +
      '">' +
      '<rect x="' +
      SPECIAL_BOX_X +
      '" y="' +
      y +
      '" width="' +
      SPECIAL_BOX_WIDTH +
      '" height="' +
      boxHeight +
      '" rx="8" fill="#9f1239" stroke="#f1f5f9" stroke-width="2"/>' +
      '<text x="' +
      cx +
      '" y="' +
      cy +
      '" font-family="Inter, system-ui, sans-serif" font-size="' +
      (isEmpty ? "50" : "56") +
      '" font-weight="700" fill="' +
      (isEmpty ? "#ef4444" : "#f1f5f9") +
      '" text-anchor="middle" dominant-baseline="middle">' +
      escapeXml(label) +
      "</text></g>"
    );
  }

  function miniFieldSvg(defense, players, opts) {
    const options = opts || {};
    const width = options.width || "100%";
    const height = options.height || "100%";
    const isDpFlex = Boolean(options.dpFlex);
    const apCount = Math.max(0, parseInt(options.apCount, 10) || 0);
    const map = defense || {};

    let svg =
      '<svg width="' +
      width +
      '" height="' +
      height +
      '" viewBox="0 0 2400 620" preserveAspectRatio="none" style="display:block; width:100%; height:100%; border:1px solid #854d0e; border-radius:8px; background:#15803d;">' +
      '<rect x="0" y="0" width="2400" height="620" fill="#15803d"/>' +
      '<polygon points="780,385 1200,255 1620,385 1200,510" fill="#b45309" stroke="#78350f" stroke-width="4"/>' +
      '<line x1="1200" y1="510" x2="2400" y2="153" stroke="#f5f5f4" stroke-width="4"/>' +
      '<line x1="1200" y1="510" x2="0" y2="153" stroke="#f5f5f4" stroke-width="4"/>' +
      '<ellipse cx="1200" cy="395" rx="95" ry="20" fill="#854d0e" stroke="#451a03" stroke-width="2"/>' +
      '<rect x="1135" y="387" width="130" height="11" fill="#e7e5e4" rx="2"/>';

    MINI_FIELD_POSITIONS.forEach(function (pos) {
      const pid = map[pos.key];
      const player = pid ? playerById(players, pid) : null;
      const isEmpty = !player;
      const label = isEmpty ? pos.key : playerLabel(player, pos.key);
      svg +=
        '<g>' +
        '<rect x="' +
        pos.x +
        '" y="' +
        pos.y +
        '" width="' +
        pos.w +
        '" height="' +
        pos.h +
        '" rx="10" fill="#166534" stroke="#f1f5f9" stroke-width="4"/>' +
        '<text x="' +
        (pos.x + pos.w / 2) +
        '" y="' +
        (pos.y + pos.h / 2) +
        '" font-family="Inter, system-ui, sans-serif" font-size="' +
        (isEmpty ? "50" : "70") +
        '" font-weight="700" fill="' +
        (isEmpty ? "#ef4444" : "#f1f5f9") +
        '" text-anchor="middle" dominant-baseline="middle">' +
        escapeXml(label) +
        "</text>" +
        "</g>";
    });

    // DP and APs stack in the lower left, same as the starting-lineup diamond.
    let specialSlot = 0;
    function nextSpecialY() {
      specialSlot += 1;
      return SPECIAL_STACK_BOTTOM - specialSlot * SPECIAL_STACK_STEP;
    }
    if (isDpFlex) {
      svg += specialBoxSvg("DP", map, players, nextSpecialY(), 80);
    }
    for (let i = 1; i <= apCount; i++) {
      svg += specialBoxSvg("AP" + i, map, players, nextSpecialY(), 72);
    }

    svg += "</svg>";
    return svg;
  }

  function benchSummary(battingOrder, defense, players) {
    const bench = benchForDefense(battingOrder, defense, players);
    if (!bench.length) return "All batters on the field";
    return bench
      .map(function (player) {
        return player.number ? "#" + player.number + " " + (player.name || "") : player.name || "Player";
      })
      .join(", ");
  }

  return {
    FIELD_POSITIONS: FIELD_POSITIONS,
    DEFAULT_INNING_COUNT: DEFAULT_INNING_COUNT,
    MIN_INNINGS: MIN_INNINGS,
    MAX_INNINGS: MAX_INNINGS,
    clampInningCount: clampInningCount,
    emptyDefense: emptyDefense,
    cloneDefense: cloneDefense,
    defenseHasAssignments: defenseHasAssignments,
    filledFieldCount: filledFieldCount,
    playerPosition: playerPosition,
    assignInDefense: assignInDefense,
    stripInvalidFromDefense: stripInvalidFromDefense,
    stripPlayersNotInSet: stripPlayersNotInSet,
    ensureInningDefenses: ensureInningDefenses,
    copyInningToRange: copyInningToRange,
    planHasLaterInnings: planHasLaterInnings,
    tableRows: tableRows,
    benchForDefense: benchForDefense,
    benchSummary: benchSummary,
    miniFieldSvg: miniFieldSvg,
    escapeXml: escapeXml,
  };
});
