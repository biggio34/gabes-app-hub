'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const PT = require('./playing-time.js');

function player(id, name, position, teamId) {
  const parts = name.split(' ');
  return {
    id: id,
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
    name: name,
    number: id.replace(/\D/g, '') || '',
    position: position || '',
    assignedTeamId: teamId || 'team-a',
  };
}

const roster = [
  player('p1', 'Ada Fransen', 'SS', 'team-a'),
  player('p2', 'Bea Churchich', 'P', 'team-a'),
  player('p3', 'Cora Uttke', 'CF', 'team-a'),
  player('p4', 'Della Hermes', '1B', 'team-b'),
];

function sitGame(id, sitIds, date) {
  const assignments = roster.filter((p) => p.assignedTeamId === 'team-a').flatMap((p) => {
    const pos = sitIds.includes(p.id) ? 'SIT' : (p.position || 'LF');
    return [1, 2, 3, 4, 5, 6, 7].map((inning) => ({
      playerId: p.id,
      inning: inning,
      position: pos,
    }));
  });
  return {
    id: id,
    teamId: 'team-a',
    name: id,
    date: date,
    innings: 7,
    assignments: assignments,
    locked: true,
    lockedAt: Date.parse(date),
  };
}

test('empty ledger shape', () => {
  const empty = PT.emptyPlayingTime();
  assert.deepEqual(empty.games, []);
  assert.deepEqual(empty.lockReasons, []);
  const state = {};
  PT.ensurePlayingTime(state);
  assert.ok(state.playingTime.games);
});

test('proposed lineup marks bench as sit and skips players marked out', () => {
  const game = PT.proposedGameFromLineup({
    teamId: 'team-a',
    lineupGameId: 'g1',
    name: 'vs Eagles',
    players: roster.filter((p) => p.assignedTeamId === 'team-a'),
    defensivePositions: { SS: 'p1', P: 'p2' },
    unavailableIds: ['p3'],
    innings: 7,
  });
  const ada = game.assignments.filter((row) => row.playerId === 'p1');
  const cora = game.assignments.filter((row) => row.playerId === 'p3');
  assert.equal(ada.length, 7);
  assert.ok(ada.every((row) => row.position === 'SS'));
  assert.equal(cora.length, 0);
});

test('sit streak of two flags a lock hold', () => {
  const ledger = {
    games: [sitGame('g1', ['p3'], '2026-04-01'), sitGame('g2', ['p3'], '2026-04-08')],
    lockReasons: [],
  };
  const proposed = PT.proposedGameFromLineup({
    teamId: 'team-a',
    players: roster.filter((p) => p.assignedTeamId === 'team-a'),
    defensivePositions: { SS: 'p1', P: 'p2' },
    unavailableIds: [],
    innings: 7,
    date: '2026-04-15',
  });
  const flags = PT.analyzeFairness(ledger, roster.filter((p) => p.assignedTeamId === 'team-a'), proposed, 'team-a');
  assert.ok(flags.some((flag) => flag.playerId === 'p3' && flag.type === 'sit_streak' && flag.games === 3));
});

test('a single sit does not flag', () => {
  const ledger = { games: [sitGame('g1', ['p3'], '2026-04-01')], lockReasons: [] };
  const proposed = PT.proposedGameFromLineup({
    teamId: 'team-a',
    players: roster.filter((p) => p.assignedTeamId === 'team-a'),
    defensivePositions: { SS: 'p1', P: 'p2', CF: 'p3' },
    innings: 7,
  });
  const flags = PT.analyzeFairness(ledger, roster.filter((p) => p.assignedTeamId === 'team-a'), proposed, 'team-a');
  assert.equal(flags.filter((flag) => flag.type === 'sit_streak').length, 0);
});

test('position starvation after three games without preferred spot', () => {
  const games = [
    sitGame('g1', [], '2026-04-01'),
    sitGame('g2', [], '2026-04-08'),
    sitGame('g3', [], '2026-04-15'),
  ];
  games.forEach((game) => {
    game.assignments = game.assignments.map((row) => (
      row.playerId === 'p1' ? Object.assign({}, row, { position: 'LF' }) : row
    ));
  });
  const flags = PT.analyzeFairness({ games: games, lockReasons: [] }, [roster[0]], null, 'team-a');
  assert.ok(flags.some((flag) => flag.type === 'position_starvation' && flag.playerId === 'p1' && flag.position === 'SS'));
});

test('lock requires a reason or a rotation', () => {
  const flags = [{ type: 'sit_streak', playerId: 'p3', position: '', message: 'sat' }];
  assert.equal(PT.lockReady(flags, [], 'g9').ok, false);
  assert.equal(PT.lockReady(flags, [{ type: 'sit_streak', playerId: 'p3', reason: 'Ankle' }], 'g9').ok, true);
  assert.equal(PT.lockReady([], [], 'g9').ok, true);
});

test('applyLock stores coach reasons and last-N parent text never includes them', () => {
  const proposed = PT.proposedGameFromLineup({
    id: 'lock1',
    teamId: 'team-a',
    name: 'vs Hawks',
    date: '2026-04-22',
    players: roster.filter((p) => p.assignedTeamId === 'team-a'),
    defensivePositions: { SS: 'p1', P: 'p2' },
    innings: 7,
  });
  const applied = PT.applyLock(
    { games: [sitGame('g1', ['p3'], '2026-04-01'), sitGame('g2', ['p3'], '2026-04-08')], lockReasons: [] },
    proposed,
    [{ type: 'sit_streak', playerId: 'p3', reason: 'Family wedding — do not tell other parents' }],
  );
  assert.equal(applied.game.locked, true);
  assert.equal(applied.ledger.lockReasons[0].reason.includes('wedding'), true);
  const summary = PT.lastNSummary(
    applied.ledger,
    roster.filter((p) => p.assignedTeamId === 'team-a'),
    'team-a',
    5,
    { includeReasons: false },
  );
  assert.match(summary.text, /Ada Fransen/);
  assert.equal(summary.text.includes('wedding'), false);
  assert.equal(summary.text.includes('Coach reason log is not included'), true);
  assert.equal(summary.includeReasons, false);
});

test('club view flags a team far off fair innings', () => {
  const hog = sitGame('fair1', ['p3'], '2026-04-01');
  hog.assignments = hog.assignments.map((row) => {
    if (row.playerId === 'p1') return Object.assign({}, row, { position: 'SS' });
    if (row.playerId === 'p2') return Object.assign({}, row, { position: 'SIT' });
    return Object.assign({}, row, { position: 'SIT' });
  });
  const hog2 = JSON.parse(JSON.stringify(hog));
  hog2.id = 'fair2';
  hog2.date = '2026-04-08';
  const ledger = { games: [hog, hog2], lockReasons: [] };
  const outliers = PT.clubOutliers(ledger, roster, [
    { id: 'team-a', name: '16U Fransen' },
    { id: 'team-b', name: '14U Hermes' },
  ]);
  assert.ok(outliers.some((row) => row.teamId === 'team-a'));
  assert.equal(outliers.some((row) => row.teamId === 'team-b'), false);
});

test('CSV long and wide GameChanger-like tables import onto roster ids', () => {
  const long = [
    'player,date,inning,position',
    'Ada Fransen,2026-05-01,1,SS',
    'Ada Fransen,2026-05-01,2,SS',
    'Bea Churchich,2026-05-01,1,P',
  ].join('\n');
  const longResult = PT.importCsv(long, roster, 'team-a');
  assert.equal(longResult.ok, true);
  assert.equal(longResult.games[0].assignments.length, 3);

  const wide = [
    'Player,P,C,1B,2B,3B,SS,LF,CF,RF',
    'Ada Fransen,0,0,0,0,0,4,3,0,0',
    'Unknown Kid,1,0,0,0,0,0,0,0,0',
  ].join('\n');
  const wideResult = PT.importCsv(wide, roster, 'team-a', 'Innings Played');
  assert.equal(wideResult.ok, true);
  const adaInnings = wideResult.games[0].assignments.filter((row) => row.playerId === 'p1');
  assert.equal(adaInnings.length, 7);
  assert.ok(wideResult.unmatched.includes('Unknown Kid'));
});

test('shared Elks state still has the existing softball app fields plus a ledger', () => {
  require('./elks-data.js');
  const state = global.ElksData.emptyState();
  assert.ok(Array.isArray(state.players));
  assert.ok(Array.isArray(state.teams));
  assert.ok(Array.isArray(state.tryouts));
  assert.ok(Array.isArray(state.practices));
  assert.ok(Array.isArray(state.drills));
  assert.ok(Array.isArray(state.templates));
  assert.ok(state.playingTime);
  assert.deepEqual(state.playingTime.games, []);
});

test('official-looking season totals without position columns are rejected', () => {
  const result = PT.importCsv('Player,GP,AVG,OPS\nAda Fransen,12,.333,.900', roster, 'team-a');
  assert.equal(result.ok, false);
  assert.match(result.error, /not a safe innings-by-position import/i);
});
