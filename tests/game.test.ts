import test from 'node:test';
import assert from 'node:assert/strict';
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
  const correct = puzzleDetails(0).solution.map(x => x === '#' ? '' : x);
  const premature = await call(a, { action: 'sync', roomId: match.room.id, answers: correct, revision: 1 });
  assert.equal(premature.room.status, 'playing'); assert.equal(premature.room.revision, 0);
  await new Promise(resolve => setTimeout(resolve, Math.max(0, match.room.start - Date.now() + 150)));
  const partial = Array(25).fill(''); partial[0] = 'H';
  await call(a, { action: 'sync', roomId: match.room.id, answers: partial, revision: 2 });
  const opponent = await call(b, { action: 'sync' });
  assert.equal(opponent.room.progress[0], true); assert.equal(opponent.room.answers[0], '');
  assert.ok(!JSON.stringify(opponent).includes('HEART'));
  const stale = await call(a, { action: 'sync', roomId: match.room.id, answers: Array(25).fill(''), revision: 1 });
  assert.equal(stale.room.answers[0], 'H');
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
  const invalid = await fetch(`${base}/api/game`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${a}` }, body: JSON.stringify({ action: 'sync', roomId: replay.room.id, answers: ['BAD'], revision: 1 }) });
  assert.equal(invalid.status, 400);
  const crossOrigin = await fetch(`${base}/api/game`, { method: 'POST', headers: { origin: 'https://untrusted.example', authorization: `Bearer ${a}` }, body: JSON.stringify({ action: 'sync' }) });
  assert.equal(crossOrigin.status, 403);
});
