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

  const MINI_FIELD_POSITIONS = [
    { key: "P", x: 260, y: 242 },
    { key: "C", x: 260, y: 295 },
    { key: "1B", x: 365, y: 248 },
    { key: "2B", x: 320, y: 175 },
    { key: "3B", x: 155, y: 248 },
    { key: "SS", x: 200, y: 175 },
    { key: "LF", x: 130, y: 105 },
    { key: "CF", x: 260, y: 85 },
    { key: "RF", x: 390, y: 105 },
  ];

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

  function miniFieldSvg(defense, players, opts) {
    const options = opts || {};
    const width = options.width || 620;
    const height = options.height || 360;
    const isDpFlex = Boolean(options.dpFlex);
    const apCount = Math.max(0, parseInt(options.apCount, 10) || 0);
    const map = defense || {};

    let svg =
      '<svg width="' +
      width +
      '" height="' +
      height +
      '" viewBox="0 0 620 360" preserveAspectRatio="xMidYMid meet" style="display:block; width:100%; height:auto; border:1px solid #854d0e; border-radius:8px; background:#15803d;">' +
      '<rect x="0" y="0" width="620" height="360" fill="#15803d"/>' +
      '<polygon points="260,310 365,248 260,180 155,248" fill="#b45309" stroke="#78350f" stroke-width="3"/>' +
      '<line x1="260" y1="310" x2="620" y2="70" stroke="#f5f5f4" stroke-width="2"/>' +
      '<line x1="260" y1="310" x2="0" y2="70" stroke="#f5f5f4" stroke-width="2"/>' +
      '<ellipse cx="260" cy="248" rx="22" ry="8" fill="#854d0e" stroke="#451a03" stroke-width="1"/>';

    MINI_FIELD_POSITIONS.forEach(function (pos) {
      const pid = map[pos.key];
      const player = pid ? playerById(players, pid) : null;
      const isEmpty = !player;
      const label = isEmpty ? pos.key : playerLabel(player, pos.key);
      const textColor = isEmpty ? "#ef4444" : "#ffffff";
      const fontSize = isEmpty ? "11" : "18";
      svg +=
        '<g>' +
        '<rect x="' +
        (pos.x - 22) +
        '" y="' +
        (pos.y - 13) +
        '" width="44" height="26" rx="6" fill="#166534" stroke="#f1f5f9" stroke-width="2"/>' +
        '<text x="' +
        pos.x +
        '" y="' +
        (pos.y + 5) +
        '" font-family="Inter, system-ui, sans-serif" font-size="' +
        fontSize +
        '" font-weight="800" fill="' +
        textColor +
        '" text-anchor="middle" dominant-baseline="middle">' +
        escapeXml(label) +
        "</text>" +
        "</g>";
    });

    let rightX = 510;
    let rightY = 70;
    if (isDpFlex) {
      const pid = map.DP;
      const player = pid ? playerById(players, pid) : null;
      const isEmpty = !player;
      const label = isEmpty ? "DP" : playerLabel(player, "DP");
      svg +=
        '<g><rect x="' +
        rightX +
        '" y="' +
        rightY +
        '" width="52" height="24" rx="5" fill="#9f1239" stroke="#f1f5f9" stroke-width="1.5"/>' +
        '<text x="' +
        (rightX + 26) +
        '" y="' +
        (rightY + 13) +
        '" font-family="Inter, system-ui, sans-serif" font-size="' +
        (isEmpty ? "10" : "15") +
        '" font-weight="800" fill="' +
        (isEmpty ? "#ef4444" : "#ffffff") +
        '" text-anchor="middle" dominant-baseline="middle">' +
        escapeXml(label) +
        "</text></g>";
      rightY += 30;
    }
    for (let i = 1; i <= apCount; i++) {
      const key = "AP" + i;
      const pid = map[key];
      const player = pid ? playerById(players, pid) : null;
      const isEmpty = !player;
      const label = isEmpty ? key : playerLabel(player, key);
      svg +=
        '<g><rect x="' +
        rightX +
        '" y="' +
        rightY +
        '" width="52" height="22" rx="5" fill="#9f1239" stroke="#f1f5f9" stroke-width="1.5"/>' +
        '<text x="' +
        (rightX + 26) +
        '" y="' +
        (rightY + 12) +
        '" font-family="Inter, system-ui, sans-serif" font-size="' +
        (isEmpty ? "9" : "13") +
        '" font-weight="800" fill="' +
        (isEmpty ? "#ef4444" : "#ffffff") +
        '" text-anchor="middle" dominant-baseline="middle">' +
        escapeXml(label) +
        "</text></g>";
      rightY += 26;
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
