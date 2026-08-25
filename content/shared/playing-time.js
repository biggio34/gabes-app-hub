/**
 * Playing-time ledger for Lineup Builder.
 * Uses the shared Elks roster (ElksData) — does not invent a second player list.
 * Innings/positions persist on the existing softball state payload.
 *
 * GameChanger: they show innings-by-position in-app, but there is no official
 * public API and the official CSV export is season totals, not a safe
 * innings-by-position feed. We do not scrape. Coaches enter a grid or paste
 * a CSV / copied Innings Played table.
 */
(function (global) {
  'use strict';

  const POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];
  const EXTRA_POS = ['DP', 'AP', 'AP1', 'AP2'];
  const ALL_POS = POSITIONS.concat(EXTRA_POS);
  const SIT = 'SIT';
  const DEFAULT_INNINGS = 7;
  const SIT_STREAK_WARN = 2;
  const STARVE_GAMES = 3;
  const VIEW_KEY = 'hub-lineup-viewer-v1';
  const GROUPS = {
    battery: ['P', 'C'],
    infield: ['1B', '2B', '3B', 'SS'],
    outfield: ['LF', 'CF', 'RF'],
  };

  function uid(prefix) {
    const id = (global.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : (Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
    return (prefix || 'pt') + '_' + id;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]);
    });
  }

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function emptyPlayingTime() {
    return { version: 1, games: [], lockReasons: [] };
  }

  function ensurePlayingTime(state) {
    if (!state || typeof state !== 'object') state = {};
    if (!state.playingTime || typeof state.playingTime !== 'object') {
      state.playingTime = emptyPlayingTime();
    }
    if (!Array.isArray(state.playingTime.games)) state.playingTime.games = [];
    if (!Array.isArray(state.playingTime.lockReasons)) state.playingTime.lockReasons = [];
    if (!state.playingTime.version) state.playingTime.version = 1;
    return state.playingTime;
  }

  function displayName(player) {
    if (global.ElksData && ElksData.displayName) return ElksData.displayName(player);
    if (!player) return 'Unnamed';
    const joined = [player.firstName, player.lastName].filter(Boolean).join(' ').trim();
    return joined || (player.name && String(player.name).trim()) || 'Unnamed';
  }

  function normalizePos(raw) {
    const value = String(raw || '').trim().toUpperCase();
    if (!value || value === '—' || value === '-' || value === 'BENCH' || value === 'SIT' || value === 'OUT') {
      return SIT;
    }
    if (value === 'PITCHER' || value === 'PIT') return 'P';
    if (value === 'CATCHER' || value === 'CA') return 'C';
    if (value === 'FIRST' || value === '1') return '1B';
    if (value === 'SECOND' || value === '2') return '2B';
    if (value === 'THIRD' || value === '3') return '3B';
    if (value === 'SHORT' || value === 'SHORTSTOP') return 'SS';
    if (value === 'LEFT') return 'LF';
    if (value === 'CENTER') return 'CF';
    if (value === 'RIGHT') return 'RF';
    if (ALL_POS.indexOf(value) >= 0) return value;
    if (value === 'DH' || value === 'FLEX') return 'DP';
    return '';
  }

  function groupFor(pos) {
    const key = normalizePos(pos);
    if (GROUPS.battery.indexOf(key) >= 0) return 'battery';
    if (GROUPS.infield.indexOf(key) >= 0) return 'infield';
    if (GROUPS.outfield.indexOf(key) >= 0) return 'outfield';
    return '';
  }

  function preferredPosition(player) {
    const primary = normalizePos(player && player.position);
    if (primary && primary !== SIT) return primary;
    const secondary = normalizePos(player && player.position2);
    if (secondary && secondary !== SIT) return secondary;
    return '';
  }

  function sortGames(games) {
    return (games || []).slice().sort(function (a, b) {
      const da = String(a.date || '');
      const db = String(b.date || '');
      if (da !== db) return da.localeCompare(db);
      return Number(a.lockedAt || a.updatedAt || 0) - Number(b.lockedAt || b.updatedAt || 0);
    });
  }

  function gamesForTeam(ledger, teamId) {
    const games = (ledger && ledger.games) || [];
    if (!teamId || teamId === 'all') return sortGames(games);
    return sortGames(games.filter(function (game) { return game.teamId === teamId; }));
  }

  function lockedGames(ledger, teamId) {
    return gamesForTeam(ledger, teamId).filter(function (game) { return !!game.locked; });
  }

  function playerSatGame(game, playerId) {
    const rows = ((game && game.assignments) || []).filter(function (row) {
      return row.playerId === playerId;
    });
    if (!rows.length) return true;
    return rows.every(function (row) { return normalizePos(row.position) === SIT; });
  }

  function positionsInGame(game, playerId) {
    const seen = [];
    ((game && game.assignments) || []).forEach(function (row) {
      if (row.playerId !== playerId) return;
      const pos = normalizePos(row.position);
      if (!pos || pos === SIT) return;
      if (seen.indexOf(pos) < 0) seen.push(pos);
    });
    return seen;
  }

  function inningsInGame(game, playerId) {
    return ((game && game.assignments) || []).filter(function (row) {
      return row.playerId === playerId && normalizePos(row.position) !== SIT;
    }).length;
  }

  function sitStreak(games, playerId, proposed) {
    const list = sortGames(games || []).filter(function (game) { return !!game.locked; });
    if (proposed) list.push(proposed);
    let streak = 0;
    for (let i = list.length - 1; i >= 0; i--) {
      if (playerSatGame(list[i], playerId)) streak += 1;
      else break;
    }
    return streak;
  }

  function gamesWithoutPosition(games, playerId, position, proposed) {
    const list = sortGames(games || []).filter(function (game) { return !!game.locked; });
    if (proposed) list.push(proposed);
    let count = 0;
    for (let i = list.length - 1; i >= 0; i--) {
      const played = positionsInGame(list[i], playerId);
      const wanted = normalizePos(position);
      const hit = wanted
        ? played.indexOf(wanted) >= 0
        : played.length > 0;
      if (hit) break;
      count += 1;
    }
    return count;
  }

  function gamesWithoutGroup(games, playerId, group, proposed) {
    const list = sortGames(games || []).filter(function (game) { return !!game.locked; });
    if (proposed) list.push(proposed);
    let count = 0;
    for (let i = list.length - 1; i >= 0; i--) {
      const played = positionsInGame(list[i], playerId);
      const hit = played.some(function (pos) { return groupFor(pos) === group; });
      if (hit) break;
      count += 1;
    }
    return count;
  }

  function proposedGameFromLineup(input) {
    const innings = Math.max(1, Number(input.innings) || DEFAULT_INNINGS);
    const defense = input.defensivePositions || {};
    const unavailable = new Set(input.unavailableIds || []);
    const assignments = [];
    (input.players || []).forEach(function (player) {
      if (!player || !player.id) return;
      if (unavailable.has(player.id)) return;
      let pos = '';
      Object.keys(defense).forEach(function (key) {
        if (defense[key] === player.id) pos = key;
      });
      const normalized = pos && ALL_POS.indexOf(pos) >= 0 ? pos : SIT;
      for (let inning = 1; inning <= innings; inning += 1) {
        assignments.push({ playerId: player.id, inning: inning, position: normalized });
      }
    });
    return {
      id: input.id || uid('ptg'),
      teamId: input.teamId || '',
      lineupGameId: input.lineupGameId || '',
      name: input.name || 'Untitled game',
      date: input.date || todayISO(),
      innings: innings,
      assignments: assignments,
      locked: false,
      source: input.source || 'coach',
      updatedAt: Date.now(),
    };
  }

  function analyzeFairness(ledger, players, proposed, teamId) {
    const history = lockedGames(ledger, teamId).filter(function (game) {
      return !proposed || game.id !== proposed.id;
    });
    const flags = [];
    (players || []).forEach(function (player) {
      if (!player || !player.id) return;
      const streak = sitStreak(history, player.id, proposed);
      if (streak >= SIT_STREAK_WARN) {
        flags.push({
          type: 'sit_streak',
          playerId: player.id,
          playerName: displayName(player),
          games: streak,
          message: displayName(player) + ' has sat ' + streak + ' straight game' + (streak === 1 ? '' : 's'),
        });
      }
      const preferred = preferredPosition(player);
      if (preferred) {
        const without = gamesWithoutPosition(history, player.id, preferred, proposed);
        if (without >= STARVE_GAMES) {
          flags.push({
            type: 'position_starvation',
            playerId: player.id,
            playerName: displayName(player),
            position: preferred,
            gamesWithout: without,
            message: displayName(player) + ' has not played ' + preferred + ' in ' + without + ' game' + (without === 1 ? '' : 's'),
          });
        }
      } else {
        const withoutIf = gamesWithoutGroup(history, player.id, 'infield', proposed);
        const withoutOf = gamesWithoutGroup(history, player.id, 'outfield', proposed);
        if (withoutIf >= STARVE_GAMES && withoutOf >= STARVE_GAMES) {
          flags.push({
            type: 'position_starvation',
            playerId: player.id,
            playerName: displayName(player),
            position: '',
            gamesWithout: Math.min(withoutIf, withoutOf),
            message: displayName(player) + ' has not mixed infield/outfield in ' + Math.min(withoutIf, withoutOf) + ' games',
          });
        }
      }
    });
    return flags;
  }

  function flagKey(flag) {
    return [flag.type, flag.playerId, flag.position || ''].join(':');
  }

  function reasonsForGame(ledger, gameId) {
    return ((ledger && ledger.lockReasons) || []).filter(function (row) {
      return row.gameId === gameId;
    });
  }

  function lockReady(flags, reasons, gameId) {
    const covered = {};
    (reasons || []).forEach(function (row) {
      if (gameId && row.gameId && row.gameId !== gameId) return;
      const text = String(row.reason || '').trim();
      if (!text) return;
      covered[row.type + ':' + row.playerId + ':' + (row.position || '')] = true;
    });
    const missing = (flags || []).filter(function (flag) {
      return !covered[flagKey(flag)];
    });
    return { ok: missing.length === 0, missing: missing };
  }

  function applyLock(ledger, game, reasons) {
    const next = {
      version: 1,
      games: ((ledger && ledger.games) || []).slice(),
      lockReasons: ((ledger && ledger.lockReasons) || []).slice(),
    };
    const lockedGame = Object.assign({}, game, {
      locked: true,
      lockedAt: Date.now(),
      updatedAt: Date.now(),
    });
    const idx = next.games.findIndex(function (row) { return row.id === lockedGame.id; });
    if (idx >= 0) next.games[idx] = lockedGame;
    else next.games.push(lockedGame);
    next.lockReasons = next.lockReasons.filter(function (row) { return row.gameId !== lockedGame.id; });
    (reasons || []).forEach(function (row) {
      if (!String(row.reason || '').trim()) return;
      next.lockReasons.push({
        id: row.id || uid('ptr'),
        gameId: lockedGame.id,
        teamId: lockedGame.teamId || row.teamId || '',
        playerId: row.playerId,
        type: row.type,
        position: row.position || '',
        reason: String(row.reason).trim(),
        createdAt: row.createdAt || Date.now(),
      });
    });
    return { ledger: next, game: lockedGame };
  }

  function playerTotals(games, playerId) {
    const posCounts = {};
    let played = 0;
    let sat = 0;
    (games || []).forEach(function (game) {
      const rows = ((game && game.assignments) || []).filter(function (row) {
        return row.playerId === playerId;
      });
      if (!rows.length) {
        sat += Number(game.innings) || 0;
        return;
      }
      rows.forEach(function (row) {
        const pos = normalizePos(row.position);
        if (pos === SIT) sat += 1;
        else {
          played += 1;
          posCounts[pos] = (posCounts[pos] || 0) + 1;
        }
      });
    });
    return { played: played, sat: sat, positions: posCounts };
  }

  function formatPositionMix(posCounts) {
    return Object.keys(posCounts || {})
      .sort(function (a, b) { return posCounts[b] - posCounts[a]; })
      .map(function (pos) { return pos + ' ' + posCounts[pos]; })
      .join(', ') || 'no defensive innings';
  }

  function lastNSummary(ledger, players, teamId, n, opts) {
    const includeReasons = !!(opts && opts.includeReasons);
    const take = Math.max(1, Number(n) || 5);
    const games = lockedGames(ledger, teamId).slice(-take);
    const lines = [];
    lines.push('Last ' + games.length + ' game' + (games.length === 1 ? '' : 's') + (teamId && teamId !== 'all' ? '' : '') + '.');
    if (!games.length) {
      lines.push('No locked games in the ledger yet.');
      return { text: lines.join('\n'), games: games, includeReasons: includeReasons };
    }
    lines.push(games.map(function (game) {
      return (game.date || '') + ' ' + (game.name || 'Game');
    }).join(' · '));
    lines.push('');
    (players || []).forEach(function (player) {
      const totals = playerTotals(games, player.id);
      const streak = sitStreak(games, player.id, null);
      lines.push(
        displayName(player) +
        (player.number ? ' #' + player.number : '') +
        ' — ' + totals.played + ' innings, sat ' + totals.sat +
        (streak >= SIT_STREAK_WARN ? ', sit streak ' + streak : '') +
        '. ' + formatPositionMix(totals.positions) + '.'
      );
    });
    if (!includeReasons) {
      lines.push('');
      lines.push('Coach reason log is not included.');
    }
    return { text: lines.join('\n'), games: games, includeReasons: includeReasons };
  }

  function mean(values) {
    if (!values.length) return 0;
    return values.reduce(function (sum, n) { return sum + n; }, 0) / values.length;
  }

  function stdev(values) {
    if (values.length < 2) return 0;
    const avg = mean(values);
    const variance = values.reduce(function (sum, n) { return sum + Math.pow(n - avg, 2); }, 0) / values.length;
    return Math.sqrt(variance);
  }

  function teamFairness(ledger, players, team) {
    const teamId = team && team.id;
    const games = lockedGames(ledger, teamId);
    const roster = (players || []).filter(function (player) {
      if (!teamId || teamId === 'all') return true;
      return !player.assignedTeamId || player.assignedTeamId === teamId;
    });
    const rows = roster.map(function (player) {
      const totals = playerTotals(games, player.id);
      const flags = analyzeFairness(ledger, [player], null, teamId);
      return {
        player: player,
        played: totals.played,
        sat: totals.sat,
        positions: totals.positions,
        flags: flags,
      };
    });
    const playedValues = rows.map(function (row) { return row.played; });
    const avg = mean(playedValues);
    const spread = avg ? (Math.max.apply(null, playedValues.concat([0])) - Math.min.apply(null, playedValues.concat([0]))) / avg : 0;
    const inningsOutliers = rows.filter(function (row) {
      return avg >= 6 && Math.abs(row.played - avg) >= Math.max(3, avg * 0.35);
    });
    const sitMax = rows.reduce(function (max, row) {
      return Math.max(max, sitStreak(games, row.player.id, null));
    }, 0);
    const starvation = rows.filter(function (row) {
      return row.flags.some(function (flag) { return flag.type === 'position_starvation'; });
    });
    const mixSkew = rows.filter(function (row) {
      const preferred = preferredPosition(row.player);
      const prefGroup = groupFor(preferred);
      const total = row.played || 0;
      if (!prefGroup || total < 6) return false;
      const groupInnings = Object.keys(row.positions).reduce(function (sum, pos) {
        return groupFor(pos) === prefGroup ? sum + row.positions[pos] : sum;
      }, 0);
      return groupInnings / total < 0.2 && total - groupInnings >= 6;
    });
    const outlier = inningsOutliers.length >= 1 || sitMax >= SIT_STREAK_WARN || starvation.length >= 1 || mixSkew.length >= 1 || spread >= 0.4;
    return {
      teamId: teamId,
      teamName: (team && team.name) || teamId || 'Team',
      games: games.length,
      avgInnings: avg,
      spread: spread,
      stdev: stdev(playedValues),
      sitMax: sitMax,
      inningsOutliers: inningsOutliers,
      starvation: starvation,
      mixSkew: mixSkew,
      outlier: outlier && games.length > 0,
      rows: rows,
    };
  }

  function clubOutliers(ledger, players, teams) {
    const list = (teams || []).map(function (team) {
      return teamFairness(ledger, players, team);
    });
    const scored = list.filter(function (row) { return row.games > 0; });
    const spreads = scored.map(function (row) { return row.spread; });
    const clubMeanSpread = mean(spreads);
    return list.map(function (row) {
      const farOff = row.games > 0 && (row.outlier || row.spread >= clubMeanSpread + 0.15);
      return Object.assign({}, row, { farOff: farOff });
    }).filter(function (row) { return row.farOff; });
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    const input = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    for (let i = 0; i < input.length; i += 1) {
      const ch = input[i];
      if (quoted) {
        if (ch === '"') {
          if (input[i + 1] === '"') {
            cell += '"';
            i += 1;
          } else {
            quoted = false;
          }
        } else {
          cell += ch;
        }
      } else if (ch === '"') {
        quoted = true;
      } else if (ch === ',') {
        row.push(cell.trim());
        cell = '';
      } else if (ch === '\n') {
        row.push(cell.trim());
        if (row.some(Boolean)) rows.push(row);
        row = [];
        cell = '';
      } else {
        cell += ch;
      }
    }
    if (cell || row.length) {
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
    }
    return rows;
  }

  function headerIndex(headers, names) {
    const lower = headers.map(function (h) { return String(h || '').trim().toLowerCase(); });
    for (let i = 0; i < names.length; i += 1) {
      const at = lower.indexOf(names[i]);
      if (at >= 0) return at;
    }
    return -1;
  }

  function matchPlayer(players, name) {
    const needle = String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!needle) return null;
    const list = players || [];
    const exact = list.find(function (player) {
      return displayName(player).toLowerCase() === needle;
    });
    if (exact) return exact;
    const flipped = needle.indexOf(',') >= 0
      ? needle.split(',').map(function (p) { return p.trim(); }).reverse().join(' ')
      : '';
    if (flipped) {
      const hit = list.find(function (player) { return displayName(player).toLowerCase() === flipped; });
      if (hit) return hit;
    }
    const lastFirst = list.filter(function (player) {
      const last = String(player.lastName || '').trim().toLowerCase();
      const first = String(player.firstName || '').trim().toLowerCase();
      return last && first && (last + ' ' + first) === needle;
    });
    if (lastFirst.length === 1) return lastFirst[0];
    const contains = list.filter(function (player) {
      const full = displayName(player).toLowerCase();
      return full === needle || full.indexOf(needle) >= 0 || needle.indexOf(full) >= 0;
    });
    return contains.length === 1 ? contains[0] : null;
  }

  function importCsv(text, players, teamId, sourceLabel) {
    const table = parseCsv(text);
    if (!table.length) return { ok: false, error: 'Empty CSV.', games: [], unmatched: [] };
    const headers = table[0].map(function (h) { return String(h || '').trim(); });
    const nameIdx = headerIndex(headers, ['player', 'name', 'player name', 'athlete']);
    const dateIdx = headerIndex(headers, ['date', 'game date']);
    const gameIdx = headerIndex(headers, ['game', 'opponent', 'vs']);
    const inningIdx = headerIndex(headers, ['inning', 'inn']);
    const posIdx = headerIndex(headers, ['position', 'pos']);
    const posCols = {};
    headers.forEach(function (header, idx) {
      const pos = normalizePos(header);
      if (pos && pos !== SIT && ALL_POS.indexOf(pos) >= 0) posCols[pos] = idx;
    });
    const unmatched = [];
    const gamesByKey = {};

    function gameFor(date, name) {
      const key = (date || todayISO()) + '|' + (name || sourceLabel || 'Imported game');
      if (!gamesByKey[key]) {
        gamesByKey[key] = {
          id: uid('ptg'),
          teamId: teamId || '',
          lineupGameId: '',
          name: name || sourceLabel || 'Imported game',
          date: date || todayISO(),
          innings: DEFAULT_INNINGS,
          assignments: [],
          locked: true,
          lockedAt: Date.now(),
          source: 'csv',
          updatedAt: Date.now(),
        };
      }
      return gamesByKey[key];
    }

    const wide = Object.keys(posCols).length >= 3 && inningIdx < 0;
    const long = nameIdx >= 0 && inningIdx >= 0 && posIdx >= 0;

    if (!wide && !long) {
      return {
        ok: false,
        error: 'Need columns player,inning,position — or a wide innings-by-position table (P, C, 1B…). GameChanger’s official season CSV is totals only and is not a safe innings-by-position import.',
        games: [],
        unmatched: [],
      };
    }

    table.slice(1).forEach(function (cells) {
      const rawName = nameIdx >= 0 ? cells[nameIdx] : cells[0];
      const player = matchPlayer(players, rawName);
      if (!player) {
        if (rawName && unmatched.indexOf(rawName) < 0) unmatched.push(rawName);
        return;
      }
      const date = dateIdx >= 0 ? cells[dateIdx] : '';
      const gameName = gameIdx >= 0 ? cells[gameIdx] : (sourceLabel || 'Imported game');
      const game = gameFor(date, gameName);
      if (long) {
        const inning = Number(cells[inningIdx]) || 1;
        const pos = normalizePos(cells[posIdx]) || SIT;
        game.assignments.push({ playerId: player.id, inning: inning, position: pos });
        game.innings = Math.max(game.innings || 1, inning);
      } else {
        let cursor = 1;
        Object.keys(posCols).forEach(function (pos) {
          const count = Number(cells[posCols[pos]]) || 0;
          for (let i = 0; i < count; i += 1) {
            game.assignments.push({ playerId: player.id, inning: cursor, position: pos });
            cursor += 1;
          }
        });
        game.innings = Math.max(game.innings || DEFAULT_INNINGS, cursor - 1);
      }
    });

    const games = Object.keys(gamesByKey).map(function (key) { return gamesByKey[key]; });
    if (!games.length) {
      return { ok: false, error: 'No roster names matched the file.', games: [], unmatched: unmatched };
    }
    return { ok: true, games: games, unmatched: unmatched };
  }

  function mergeImportedGames(ledger, games) {
    const next = {
      version: 1,
      games: ((ledger && ledger.games) || []).slice(),
      lockReasons: ((ledger && ledger.lockReasons) || []).slice(),
    };
    (games || []).forEach(function (game) {
      next.games.push(game);
    });
    return next;
  }

  function isParentView() {
    try {
      const params = new URLSearchParams((global.location && location.search) || '');
      if (params.get('view') === 'parent') return true;
      if (params.get('view') === 'coach') return false;
      return (global.sessionStorage && sessionStorage.getItem(VIEW_KEY)) === 'parent';
    } catch (e) {
      return false;
    }
  }

  function setParentView(on) {
    try {
      if (global.sessionStorage) sessionStorage.setItem(VIEW_KEY, on ? 'parent' : 'coach');
    } catch (e) {}
    if (typeof global.dispatchEvent === 'function') {
      global.dispatchEvent(new CustomEvent('hub-lineup-view-changed', { detail: { parent: !!on } }));
    }
  }

  function canSeeClubView() {
    const hub = global.HUB_SOFTBALL || {};
    if (hub.role === 'owner') return true;
    if (hub.teamId === 'all') return true;
    return Array.isArray(hub.teams) && hub.teams.length > 1;
  }

  function currentTeam() {
    if (global.ElksData && ElksData.currentHubTeam) return ElksData.currentHubTeam();
    const hub = global.HUB_SOFTBALL || {};
    return { id: hub.teamId || '', name: hub.teamName || 'Team', clubName: hub.clubName || 'MN Elks' };
  }

  function sharedPlayers(teamId) {
    if (!global.ElksData) return [];
    const state = ElksData.load();
    const players = state.players || [];
    if (ElksData.playersOnHubTeam) return ElksData.playersOnHubTeam(players, teamId);
    return players;
  }

  function loadLedger() {
    if (!global.ElksData) return emptyPlayingTime();
    const state = ElksData.load();
    return ensurePlayingTime(state);
  }

  function saveLedger(ledger, opts) {
    if (!global.ElksData) return;
    const state = ElksData.load();
    state.playingTime = {
      version: 1,
      games: (ledger.games || []).slice(),
      lockReasons: isParentView()
        ? (state.playingTime && state.playingTime.lockReasons) || []
        : (ledger.lockReasons || []).slice(),
    };
    ElksData.save(state, opts);
  }

  function findLedgerGame(ledger, lineupGameId, teamId) {
    return gamesForTeam(ledger, teamId).filter(function (game) {
      return game.lineupGameId && game.lineupGameId === lineupGameId;
    }).pop() || null;
  }

  let hooks = {
    getLineup: function () { return null; },
    onLocked: function () {},
  };
  let editorDraft = null;

  function currentLineupContext() {
    const lineup = hooks.getLineup ? hooks.getLineup() : null;
    const team = currentTeam();
    return {
      team: team,
      players: sharedPlayers(team.id),
      lineup: lineup,
    };
  }

  function hideModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('hidden');
    el.classList.remove('flex');
    if (id === 'pt-entry-modal') editorDraft = null;
  }

  function showModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('hidden');
    el.classList.add('flex');
  }

  function setChrome() {
    const parent = isParentView();
    const lockBtn = document.getElementById('pt-lock-btn');
    const ledgerBtn = document.getElementById('pt-ledger-btn');
    const clubBtn = document.getElementById('pt-club-btn');
    const viewBtn = document.getElementById('pt-view-btn');
    const chip = document.getElementById('pt-lock-chip');
    const banner = document.getElementById('pt-fairness-banner');
    if (lockBtn) lockBtn.classList.toggle('hidden', parent);
    if (ledgerBtn) ledgerBtn.classList.toggle('hidden', parent);
    if (clubBtn) clubBtn.classList.toggle('hidden', parent || !canSeeClubView());
    if (viewBtn) {
      viewBtn.textContent = parent ? 'Coach desk' : 'Parent view';
      viewBtn.title = parent
        ? 'Switch back to coach tools'
        : 'Parent conversation view — hides the reason log';
    }
    if (parent && banner) banner.classList.add('hidden');
    if (!chip) return;
    if (parent) {
      chip.textContent = 'Parent summary';
      chip.className = 'text-[10px] font-semibold px-2 py-0.5 rounded-full bg-stone-100 text-stone-600';
      return;
    }
    const ctx = currentLineupContext();
    const lineup = ctx.lineup || {};
    const ledger = loadLedger();
    const existing = findLedgerGame(ledger, lineup.currentGameId, ctx.team.id);
    if (existing && existing.locked) {
      chip.textContent = 'Locked';
      chip.className = 'text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800';
      if (banner) banner.classList.add('hidden');
    } else {
      const proposed = proposedFromCurrent();
      const flags = proposed ? analyzeFairness(ledger, ctx.players, proposed, ctx.team.id) : [];
      if (flags.length) {
        chip.textContent = flags.length + ' fairness hold' + (flags.length === 1 ? '' : 's');
        chip.className = 'text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800';
        if (banner) {
          banner.classList.remove('hidden');
          banner.innerHTML = '<div class="font-semibold mb-1">Rotate or log a coach-only reason before lock</div>' +
            flags.map(function (flag) { return '<div>' + escapeHtml(flag.message) + '</div>'; }).join('');
        }
      } else {
        chip.textContent = 'Unlocked';
        chip.className = 'text-[10px] font-semibold px-2 py-0.5 rounded-full bg-stone-100 text-stone-600';
        if (banner) banner.classList.add('hidden');
      }
    }
  }

  function proposedFromCurrent() {
    const ctx = currentLineupContext();
    const lineup = ctx.lineup;
    if (!lineup) return null;
    const existing = findLedgerGame(loadLedger(), lineup.currentGameId, ctx.team.id);
    return proposedGameFromLineup({
      id: existing && existing.id,
      teamId: ctx.team.id,
      lineupGameId: lineup.currentGameId,
      name: (lineup.state && lineup.state.gameInfo) || (existing && existing.name) || 'Game',
      date: (existing && existing.date) || todayISO(),
      players: ctx.players,
      defensivePositions: (lineup.state && lineup.state.defensivePositions) || {},
      unavailableIds: (lineup.state && lineup.state.unavailableIds) || [],
      innings: (existing && existing.innings) || DEFAULT_INNINGS,
      source: 'lineup-lock',
    });
  }

  function renderLedgerModal() {
    const body = document.getElementById('pt-ledger-body');
    if (!body) return;
    const ctx = currentLineupContext();
    const ledger = loadLedger();
    const games = gamesForTeam(ledger, ctx.team.id).slice().reverse();
    const parent = isParentView();
    let html = '';
    html += '<p class="text-xs text-stone-500 mb-3">GameChanger shows innings by position in the app, but there is no official public API and their official CSV is season totals. We do not scrape. Enter innings here or paste a player / inning / position CSV (or a copied Innings Played table).</p>';
    if (!parent) {
      html += '<div class="flex flex-wrap gap-2 mb-3">';
      html += '<button type="button" id="pt-add-entry" class="px-3 py-1.5 rounded-2xl bg-red-700 text-white text-xs font-semibold">Log innings</button>';
      html += '<button type="button" id="pt-import-csv" class="px-3 py-1.5 rounded-2xl border border-stone-300 text-xs font-semibold">Import CSV</button>';
      html += '<input id="pt-csv-file" type="file" accept=".csv,text/csv,text/plain" class="hidden">';
      html += '</div>';
    }
    if (!games.length) {
      html += '<div class="text-sm text-stone-500">No ledger games yet for this team.</div>';
    } else {
      html += '<div class="space-y-2">';
      games.forEach(function (game) {
        html += '<button type="button" data-pt-game="' + escapeHtml(game.id) + '" class="w-full text-left px-3 py-2 rounded-2xl border ' + (game.locked ? 'border-emerald-200 bg-emerald-50' : 'border-stone-200') + '">';
        html += '<div class="flex items-center justify-between gap-2">';
        html += '<div class="font-semibold text-sm truncate">' + escapeHtml(game.name || 'Game') + '</div>';
        html += '<div class="text-[10px] font-semibold ' + (game.locked ? 'text-emerald-700' : 'text-stone-500') + '">' + (game.locked ? 'locked' : 'draft') + '</div>';
        html += '</div>';
        html += '<div class="text-[11px] text-stone-500">' + escapeHtml(game.date || '') + ' · ' + (game.innings || DEFAULT_INNINGS) + ' inn · ' + escapeHtml(game.source || 'coach') + '</div>';
        html += '</button>';
      });
      html += '</div>';
    }
    body.innerHTML = html;
    const addBtn = document.getElementById('pt-add-entry');
    if (addBtn) addBtn.onclick = function () { openEntryEditor(null); };
    const importBtn = document.getElementById('pt-import-csv');
    const file = document.getElementById('pt-csv-file');
    if (importBtn && file) {
      importBtn.onclick = function () { file.click(); };
      file.onchange = function () {
        const picked = file.files && file.files[0];
        if (!picked) return;
        const reader = new FileReader();
        reader.onload = function () {
          const result = importCsv(String(reader.result || ''), ctx.players, ctx.team.id, 'GameChanger / CSV import');
          if (!result.ok) {
            alert(result.error);
            return;
          }
          const next = mergeImportedGames(loadLedger(), result.games);
          saveLedger(next);
          const extra = result.unmatched.length ? '\nUnmatched names: ' + result.unmatched.join(', ') : '';
          alert('Imported ' + result.games.length + ' game' + (result.games.length === 1 ? '' : 's') + '.' + extra);
          renderLedgerModal();
          setChrome();
        };
        reader.readAsText(picked);
        file.value = '';
      };
    }
    body.querySelectorAll('[data-pt-game]').forEach(function (btn) {
      btn.onclick = function () { openEntryEditor(btn.getAttribute('data-pt-game')); };
    });
  }

  function assignmentMap(game) {
    const map = {};
    ((game && game.assignments) || []).forEach(function (row) {
      map[row.playerId + ':' + row.inning] = normalizePos(row.position) || SIT;
    });
    return map;
  }

  function collectGrid(gameId, teamId, name, date, innings, source, lineupGameId, locked) {
    const assignments = [];
    document.querySelectorAll('#pt-entry-grid select[data-player]').forEach(function (select) {
      assignments.push({
        playerId: select.getAttribute('data-player'),
        inning: Number(select.getAttribute('data-inning')),
        position: select.value || SIT,
      });
    });
    return {
      id: gameId,
      teamId: teamId,
      lineupGameId: lineupGameId || '',
      name: name,
      date: date,
      innings: innings,
      assignments: assignments,
      locked: !!locked,
      source: source || 'coach',
      updatedAt: Date.now(),
    };
  }

  function openEntryEditor(gameId) {
    const ctx = currentLineupContext();
    if (ctx.team.id === 'all') {
      alert('Pick a team before logging innings. The ledger stays on the shared roster, one team at a time.');
      return;
    }
    const ledger = loadLedger();
    const existing = (editorDraft && (!gameId || editorDraft.id === gameId))
      ? editorDraft
      : ((ledger.games || []).find(function (game) { return game.id === gameId; }) || proposedFromCurrent());
    editorDraft = existing;
    const innings = existing.innings || DEFAULT_INNINGS;
    const map = assignmentMap(existing);
    const parent = isParentView();
    const body = document.getElementById('pt-entry-body');
    if (!body) return;
    let html = '';
    html += '<div class="grid grid-cols-2 gap-2 mb-3">';
    html += '<label class="text-xs text-stone-500">Date<input id="pt-entry-date" type="date" value="' + escapeHtml(existing.date || todayISO()) + '" class="mt-1 w-full border border-stone-300 rounded-xl px-2 py-1.5 text-sm"' + (parent ? ' disabled' : '') + '></label>';
    html += '<label class="text-xs text-stone-500">Opponent / name<input id="pt-entry-name" value="' + escapeHtml(existing.name || '') + '" class="mt-1 w-full border border-stone-300 rounded-xl px-2 py-1.5 text-sm"' + (parent ? ' disabled' : '') + '></label>';
    html += '</div>';
    html += '<label class="text-xs text-stone-500">Innings<select id="pt-entry-innings" class="ml-2 border border-stone-300 rounded-lg px-2 py-1 text-sm"' + (parent ? ' disabled' : '') + '>';
    [5, 6, 7, 8].forEach(function (n) {
      html += '<option value="' + n + '"' + (n === innings ? ' selected' : '') + '>' + n + '</option>';
    });
    html += '</select></label>';
    html += '<div class="mt-3 overflow-auto border border-stone-200 rounded-2xl">';
    html += '<table class="min-w-full text-xs"><thead><tr class="bg-stone-50"><th class="text-left p-2 sticky left-0 bg-stone-50">Player</th>';
    for (let inn = 1; inn <= innings; inn += 1) html += '<th class="p-2">I' + inn + '</th>';
    html += '</tr></thead><tbody>';
    ctx.players.forEach(function (player) {
      html += '<tr class="border-t border-stone-100"><td class="p-2 font-semibold sticky left-0 bg-white">' + escapeHtml(displayName(player)) + '</td>';
      for (let inn = 1; inn <= innings; inn += 1) {
        const current = map[player.id + ':' + inn] || SIT;
        html += '<td class="p-1"><select data-player="' + escapeHtml(player.id) + '" data-inning="' + inn + '" class="border border-stone-200 rounded-lg px-1 py-0.5"' + (parent ? ' disabled' : '') + '>';
        [SIT].concat(POSITIONS).forEach(function (pos) {
          html += '<option value="' + pos + '"' + (pos === current ? ' selected' : '') + '>' + pos + '</option>';
        });
        html += '</select></td>';
      }
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    if (!parent) {
      html += '<div class="mt-3 flex justify-end gap-2">';
      html += '<button type="button" id="pt-entry-save" class="px-3 py-2 rounded-2xl bg-red-700 text-white text-sm font-semibold">Save innings</button>';
      html += '</div>';
    }
    body.innerHTML = html;
    document.getElementById('pt-entry-title').textContent = parent ? 'Playing time' : 'Log innings';
    const saveBtn = document.getElementById('pt-entry-save');
    if (saveBtn) {
      saveBtn.onclick = function () {
        const game = collectGrid(
          existing.id,
          ctx.team.id,
          document.getElementById('pt-entry-name').value.trim() || 'Untitled game',
          document.getElementById('pt-entry-date').value || todayISO(),
          Number(document.getElementById('pt-entry-innings').value) || DEFAULT_INNINGS,
          existing.source || 'coach',
          existing.lineupGameId || (ctx.lineup && ctx.lineup.currentGameId) || '',
          existing.locked
        );
        const next = {
          version: 1,
          games: (loadLedger().games || []).filter(function (row) { return row.id !== game.id; }).concat([game]),
          lockReasons: loadLedger().lockReasons || [],
        };
        saveLedger(next);
        editorDraft = null;
        hideModal('pt-entry-modal');
        renderLedgerModal();
        setChrome();
      };
    }
    const inningsSelect = document.getElementById('pt-entry-innings');
    if (inningsSelect && !parent) {
      inningsSelect.onchange = function () {
        editorDraft = collectGrid(
          existing.id,
          ctx.team.id,
          document.getElementById('pt-entry-name').value.trim() || existing.name,
          document.getElementById('pt-entry-date').value || existing.date,
          Number(inningsSelect.value) || DEFAULT_INNINGS,
          existing.source || 'coach',
          existing.lineupGameId || '',
          existing.locked
        );
        openEntryEditor(editorDraft.id);
      };
    }
    hideModal('pt-ledger-modal');
    showModal('pt-entry-modal');
  }

  function renderLockModal() {
    const ctx = currentLineupContext();
    const body = document.getElementById('pt-lock-body');
    if (!body) return;
    if (ctx.team.id === 'all') {
      body.innerHTML = '<p class="text-sm text-stone-600">Pick a team before locking a lineup. Club-wide view is for outliers, not a mixed lineup lock.</p>';
      showModal('pt-lock-modal');
      return;
    }
    const proposed = proposedFromCurrent();
    const ledger = loadLedger();
    const flags = analyzeFairness(ledger, ctx.players, proposed, ctx.team.id);
    const existingReasons = reasonsForGame(ledger, proposed.id);
    let html = '';
    html += '<p class="text-xs text-stone-500 mb-3">Lock records this defense across ' + (proposed.innings || DEFAULT_INNINGS) + ' innings (edit the ledger if you already rotated during the game). Sit streaks and position starvation must be rotated or given a coach-only reason.</p>';
    if (!flags.length) {
      html += '<div class="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 mb-3">No sit-streak or position-starvation holds.</div>';
    } else {
      html += '<div class="space-y-2 mb-3">';
      flags.forEach(function (flag) {
        const prior = existingReasons.find(function (row) {
          return row.type === flag.type && row.playerId === flag.playerId && (row.position || '') === (flag.position || '');
        });
        html += '<div class="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2">';
        html += '<div class="text-sm font-semibold text-amber-900">' + escapeHtml(flag.message) + '</div>';
        html += '<label class="block text-[11px] text-amber-800 mt-1">Coach reason (parents never see this)';
        html += '<input data-flag-key="' + escapeHtml(flagKey(flag)) + '" class="mt-1 w-full border border-amber-200 rounded-xl px-2 py-1.5 text-sm" placeholder="Injury, pitch count, late arrival…" value="' + escapeHtml(prior && prior.reason || '') + '">';
        html += '</label></div>';
      });
      html += '</div>';
    }
    html += '<div class="flex justify-end gap-2">';
    html += '<button type="button" id="pt-lock-cancel" class="px-3 py-2 rounded-2xl border text-sm font-semibold">Cancel</button>';
    html += '<button type="button" id="pt-lock-confirm" class="px-3 py-2 rounded-2xl bg-red-700 text-white text-sm font-semibold">Lock lineup</button>';
    html += '</div>';
    body.innerHTML = html;
    document.getElementById('pt-lock-cancel').onclick = function () { hideModal('pt-lock-modal'); };
    document.getElementById('pt-lock-confirm').onclick = function () {
      const reasons = flags.map(function (flag) {
        const input = body.querySelector('[data-flag-key="' + flagKey(flag) + '"]');
        return {
          type: flag.type,
          playerId: flag.playerId,
          position: flag.position || '',
          reason: input ? input.value : '',
          gameId: proposed.id,
          teamId: ctx.team.id,
        };
      });
      const gate = lockReady(flags, reasons, proposed.id);
      if (!gate.ok) {
        alert('Rotate the lineup or log a reason for each hold before locking. Parents will not see those reasons.');
        return;
      }
      const applied = applyLock(loadLedger(), proposed, reasons);
      saveLedger(applied.ledger);
      hideModal('pt-lock-modal');
      setChrome();
      if (hooks.onLocked) hooks.onLocked(applied.game);
      alert('Lineup locked. Innings are in the playing-time ledger.');
    };
    showModal('pt-lock-modal');
  }

  function renderParentSummary(n) {
    const ctx = currentLineupContext();
    const take = Number(n) || 5;
    const summary = lastNSummary(loadLedger(), ctx.players, ctx.team.id, take, { includeReasons: false });
    const body = document.getElementById('pt-parent-body');
    if (!body) return;
    body.innerHTML = '<pre id="pt-parent-text" class="whitespace-pre-wrap text-sm bg-stone-50 border border-stone-200 rounded-2xl p-3 max-h-[50vh] overflow-auto">' + escapeHtml(summary.text) + '</pre>' +
      '<div class="mt-3 flex justify-end"><button type="button" id="pt-parent-copy" class="px-3 py-2 rounded-2xl bg-red-700 text-white text-sm font-semibold">Copy</button></div>';
    const copyBtn = document.getElementById('pt-parent-copy');
    if (copyBtn) {
      copyBtn.onclick = function () {
        const text = summary.text;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () {
            copyBtn.textContent = 'Copied';
          }).catch(function () {
            window.prompt('Copy this parent summary', text);
          });
        } else {
          window.prompt('Copy this parent summary', text);
        }
      };
    }
  }

  function openParentSummary() {
    const n = document.getElementById('pt-parent-n');
    if (n && !n.onchange) {
      n.onchange = function () { renderParentSummary(n.value); };
    }
    renderParentSummary(n ? n.value : 5);
    showModal('pt-parent-modal');
  }

  function renderClubModal() {
    const body = document.getElementById('pt-club-body');
    if (!body) return;
    const hub = global.HUB_SOFTBALL || {};
    const teams = (hub.teams || []).map(function (team) {
      return { id: team.id, name: team.name };
    });
    const players = global.ElksData ? (ElksData.load().players || []) : [];
    const outliers = clubOutliers(loadLedger(), players, teams);
    let html = '<p class="text-xs text-stone-500 mb-3">Teams far off fair innings or position mix. Coach reason logs stay off this view.</p>';
    if (!outliers.length) {
      html += '<div class="text-sm text-stone-600">No outlier teams yet. Lock a few games on more than one team to compare.</div>';
    } else {
      html += '<div class="space-y-2">';
      outliers.forEach(function (row) {
        html += '<div class="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2">';
        html += '<div class="font-semibold text-sm">' + escapeHtml(row.teamName) + '</div>';
        html += '<div class="text-[11px] text-amber-900">' + row.games + ' locked games · innings spread ' + (row.spread * 100).toFixed(0) + '% · sit streak max ' + row.sitMax + '</div>';
        if (row.inningsOutliers.length) {
          html += '<div class="text-[11px] mt-1">Innings outliers: ' + row.inningsOutliers.map(function (item) { return escapeHtml(displayName(item.player)); }).join(', ') + '</div>';
        }
        if (row.starvation.length) {
          html += '<div class="text-[11px]">Position starvation: ' + row.starvation.map(function (item) { return escapeHtml(displayName(item.player)); }).join(', ') + '</div>';
        }
        html += '</div>';
      });
      html += '</div>';
    }
    body.innerHTML = html;
    showModal('pt-club-modal');
  }

  function bindChrome() {
    const ledgerBtn = document.getElementById('pt-ledger-btn');
    const lockBtn = document.getElementById('pt-lock-btn');
    const parentBtn = document.getElementById('pt-parent-btn');
    const clubBtn = document.getElementById('pt-club-btn');
    const viewBtn = document.getElementById('pt-view-btn');
    if (ledgerBtn) ledgerBtn.onclick = function () { renderLedgerModal(); showModal('pt-ledger-modal'); };
    if (lockBtn) lockBtn.onclick = function () { renderLockModal(); };
    if (parentBtn) parentBtn.onclick = function () { openParentSummary(); };
    if (clubBtn) clubBtn.onclick = function () { renderClubModal(); };
    if (viewBtn) {
      viewBtn.onclick = function () {
        setParentView(!isParentView());
        setChrome();
      };
    }
    ['pt-ledger-modal', 'pt-entry-modal', 'pt-lock-modal', 'pt-parent-modal', 'pt-club-modal'].forEach(function (id) {
      const modal = document.getElementById(id);
      if (!modal) return;
      modal.addEventListener('click', function (e) {
        if (e.target === modal) hideModal(id);
      });
    });
    setChrome();
  }

  function mountLineupLedger(options) {
    hooks = options || hooks;
    bindChrome();
    if (typeof global.addEventListener === 'function') {
      global.addEventListener('hub-lineup-view-changed', setChrome);
      global.addEventListener('hub-team-changed', setChrome);
      global.addEventListener('elks-data-updated', setChrome);
    }
  }

  const api = {
    POSITIONS: POSITIONS,
    SIT: SIT,
    DEFAULT_INNINGS: DEFAULT_INNINGS,
    SIT_STREAK_WARN: SIT_STREAK_WARN,
    STARVE_GAMES: STARVE_GAMES,
    emptyPlayingTime: emptyPlayingTime,
    ensurePlayingTime: ensurePlayingTime,
    normalizePos: normalizePos,
    preferredPosition: preferredPosition,
    proposedGameFromLineup: proposedGameFromLineup,
    analyzeFairness: analyzeFairness,
    lockReady: lockReady,
    applyLock: applyLock,
    lastNSummary: lastNSummary,
    clubOutliers: clubOutliers,
    teamFairness: teamFairness,
    importCsv: importCsv,
    parseCsv: parseCsv,
    sitStreak: sitStreak,
    playerTotals: playerTotals,
    isParentView: isParentView,
    setParentView: setParentView,
    mountLineupLedger: mountLineupLedger,
    refreshChrome: setChrome,
    loadLedger: loadLedger,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  global.PlayingTime = api;
})(typeof window !== 'undefined' ? window : globalThis);
