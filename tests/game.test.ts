import test from 'node:test';
import assert from 'node:assert/strict';
import dictionary from '../data/pop-culture-words.json' with { type: 'json' };
import { puzzleDetails, puzzles } from '../lib/puzzles.ts';

const base = process.env.MINI_TEST_URL;

test('every puzzle is a complete, consistently numbered 5×5 crossword', () => {
  for (let i = 0; i < puzzles.length; i++) {
    const { solution, public: p } = puzzleDetails(i);
    assert.equal(solution.length, 25);
    assert.equal(p.across.length, puzzles[i].across.length);
    assert.equal(p.down.length, puzzles[i].down.length);
    for (const list of [p.across, p.down]) {
      const cells = list.flatMap(c => c.cells);
      assert.equal(new Set(cells).size, p.total);
      for (const clue of list) { assert.ok(clue.text); assert.equal(p.numbers[clue.cells[0]], clue.number); }
    }
    assert.ok(!('solution' in p));
  }
});

test('generated library has 100 unique, connected, fully checked grids with original clues', () => {
  assert.ok(puzzles.length >= 101);
  const seen = new Set<string>();
  for (let i = 1; i < puzzles.length; i++) {
    const { solution, public: p } = puzzleDetails(i);
    const signature = solution.join(''); assert.ok(!seen.has(signature)); seen.add(signature);
    assert.equal(p.total, 17);
    const words = new Set<string>();
    for (const clue of [...p.across, ...p.down]) {
      assert.ok(clue.cells.length >= 3);
      const answer = clue.cells.map(c => solution[c]).join('');
      assert.ok(!words.has(answer)); words.add(answer);
      assert.equal(clue.text, dictionary[answer as keyof typeof dictionary]);
    }
    const visited = new Set<number>(), queue = [solution.findIndex(x => x !== '#')];
    while (queue.length) {
      const c = queue.pop()!; if (visited.has(c)) continue; visited.add(c);
      for (const n of [c-5,c+5,...(c%5 ? [c-1] : []),...(c%5<4 ? [c+1] : [])])
        if (n>=0 && n<25 && solution[n] !== '#' && !visited.has(n)) queue.push(n);
    }
    assert.equal(visited.size,p.total);
  }
});

test('two players race, edits stay private, and exactly one finish wins', { skip: !base }, async () => {
  assert.ok(/^http:\/\/(localhost|127\.0\.0\.1):/.test(base!), 'Use an isolated local test server');
  const a = crypto.randomUUID() + crypto.randomUUID(), b = crypto.randomUUID() + crypto.randomUUID();
  async function call(token: string, body: object) {
    const response = await fetch(`${base}/api/game`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    assert.equal(response.status, 200, await response.clone().text());
    return response.json() as Promise<any>;
  }
  const waiting = await call(a, { action: 'join' });
  assert.equal(waiting.room.status, 'waiting'); assert.equal(waiting.room.puzzle, null);
  const match = await call(b, { action: 'join' });
  assert.equal(match.room.id, waiting.room.id); assert.equal(match.room.status, 'playing');
  const resumed = await call(a, { action: 'join' });
  assert.equal(resumed.room.id, match.room.id); assert.equal(resumed.room.start, match.room.start);
  assert.equal(resumed.room.puzzle, null, 'Clues must not be revealed before the start');
  const earlyGrid = puzzleDetails(0).solution.map(x => x === '#' ? '' : x);
  const premature = await call(a, { action: 'sync', roomId: match.room.id, answers: earlyGrid, revision: 1 });
  assert.equal(premature.room.status, 'playing'); assert.equal(premature.room.revision, 0);
  await new Promise(resolve => setTimeout(resolve, Math.max(0, match.room.start - Date.now() + 150)));
  const started = await call(a, { action: 'sync' });
  const puzzleIndex = puzzles.findIndex((_,i) => JSON.stringify(puzzleDetails(i).public) === JSON.stringify(started.room.puzzle));
  assert.ok(puzzleIndex > 0, 'New races use generated puzzles');
  const correct = puzzleDetails(puzzleIndex).solution.map(x => x === '#' ? '' : x);
  const firstCell = correct.findIndex(Boolean);
  const partial = Array(25).fill(''); partial[firstCell] = correct[firstCell];
  await call(a, { action: 'sync', roomId: match.room.id, answers: partial, revision: 2 });
  const opponent = await call(b, { action: 'sync' });
  assert.equal(opponent.room.progress[firstCell], true); assert.equal(opponent.room.answers[firstCell], '');
  assert.ok(!JSON.stringify(opponent).includes('HEART'));
  const stale = await call(a, { action: 'sync', roomId: match.room.id, answers: Array(25).fill(''), revision: 1 });
  assert.equal(stale.room.answers[firstCell], correct[firstCell]);
  const wrong = await call(a, { action: 'sync', roomId: match.room.id, answers: Array(25).fill('Z'), revision: 3 });
  assert.equal(wrong.incorrect, true); assert.equal(wrong.room.status, 'playing');
  await Promise.all([call(a, { action: 'sync', roomId: match.room.id, answers: correct, revision: 4 }), call(b, { action: 'sync', roomId: match.room.id, answers: correct, revision: 1 })]);
  const [endA, endB] = await Promise.all([call(a, { action: 'sync' }), call(b, { action: 'sync' })]);
  assert.equal(endA.room.status, 'finished'); assert.equal(endB.room.status, 'finished');
  assert.notEqual(endA.room.won, endB.room.won); assert.equal(endA.room.ended, endB.room.ended);
  assert.equal(endA.leaderboard.reduce((sum: number, p: any) => sum + p.wins, 0), 1);
  const replay = await call(a, { action: 'replay' });
  assert.notEqual(replay.room.id, match.room.id); assert.equal(replay.room.status, 'waiting');
  const replayB = await call(b, { action: 'replay' }); assert.equal(replayB.room.id, replay.room.id);
  await new Promise(resolve => setTimeout(resolve, Math.max(0, replayB.room.start - Date.now() + 100)));
  const next = await call(a, { action: 'sync' });
  assert.notDeepEqual(next.room.puzzle, started.room.puzzle, 'Rematch avoids the previous grid');
  const invalid = await fetch(`${base}/api/game`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${a}` }, body: JSON.stringify({ action: 'sync', roomId: replay.room.id, answers: ['BAD'], revision: 1 }) });
  assert.equal(invalid.status, 400);
  const crossOrigin = await fetch(`${base}/api/game`, { method: 'POST', headers: { origin: 'https://untrusted.example', authorization: `Bearer ${a}` }, body: JSON.stringify({ action: 'sync' }) });
  assert.equal(crossOrigin.status, 403);
});

test('concurrent arrivals form distinct pairs and duplicate joins stay in one room', { skip: !base }, async () => {
  assert.ok(/^http:\/\/(localhost|127\.0\.0\.1):/.test(base!));
  const tokens = Array.from({ length: 8 }, () => crypto.randomUUID() + crypto.randomUUID());
  const join = async (token: string) => {
    const response = await fetch(`${base}/api/game`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ action: 'join' }) });
    assert.equal(response.status, 200, await response.clone().text());
    return response.json() as Promise<any>;
  };
  const arrivals = await Promise.all(tokens.flatMap(token => [join(token), join(token)]));
  for (let i = 0; i < tokens.length; i++) assert.equal(arrivals[i * 2].room.id, arrivals[i * 2 + 1].room.id);
  const settled = await Promise.all(tokens.map(join));
  const occupancy = new Map<string, number>();
  for (const result of settled) {
    assert.equal(result.room.status, 'playing');
    occupancy.set(result.room.id, (occupancy.get(result.room.id) ?? 0) + 1);
  }
  assert.equal(occupancy.size, 4);
  assert.deepEqual([...occupancy.values()], [2,2,2,2]);
});
