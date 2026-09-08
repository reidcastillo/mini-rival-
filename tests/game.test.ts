import test from 'node:test';
import assert from 'node:assert/strict';
import variants from '../data/clue-variants.json' with { type: 'json' };
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

test('generated library has 500 unique, connected, fully checked grids with original clues', () => {
  assert.ok(puzzles.length === 501);
  const seen = new Set<string>();
  for (let i = 1; i < puzzles.length; i++) {
    const { solution, public: p } = puzzleDetails(i);
    const signature = solution.join(''); assert.ok(!seen.has(signature)); seen.add(signature);
    assert.ok(p.total >= 17 && p.total <= 25);
    const words = new Set<string>();
    for (const clue of [...p.across, ...p.down]) {
      assert.ok(clue.cells.length >= 3);
      const answer = clue.cells.map(c => solution[c]).join('');
      assert.ok(!words.has(answer)); words.add(answer);
      assert.ok([dictionary[answer as keyof typeof dictionary], ...(variants[answer as keyof typeof variants] ?? [])].includes(clue.text));
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
  assert.deepEqual(endA.leaderboard, []);
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

test('friend links isolate pairs and rematches require both players every round', { skip: !base }, async () => {
  assert.ok(/^http:\/\/(localhost|127\.0\.0\.1):/.test(base!));
  const tokens = Array.from({length: 4}, () => crypto.randomUUID() + crypto.randomUUID());
  const [a,b,outsider,publicRival] = tokens;
  async function call(token: string, body: object, status = 200) {
    const response = await fetch(`${base}/api/game`, {method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify(body)});
    assert.equal(response.status,status,await response.clone().text());
    return response.json() as Promise<any>;
  }
  const created = await call(a,{action:'friends'});
  assert.equal(created.room.mode,'friends'); assert.equal(created.room.status,'waiting');
  assert.match(created.room.invite,/^[a-f0-9]{32}$/);
  const repeatedCreate = await call(a,{action:'friends'});
  assert.equal(repeatedCreate.room.id,created.room.id);
  const stranger = await call(outsider,{action:'join'});
  assert.notEqual(stranger.room.id,created.room.id); assert.equal(stranger.room.mode,'public');
  assert.equal(stranger.room.invite,null);
  const strangerPair = await call(publicRival,{action:'join'});
  assert.equal(strangerPair.room.id,stranger.room.id);
  const joined = await call(b,{action:'join',invite:created.room.invite});
  assert.equal(joined.room.id,created.room.id);
  await call(outsider,{action:'join',invite:created.room.invite},409);
  await call(outsider,{action:'join',invite:'bad'},400);
  const randomGuest = crypto.randomUUID()+crypto.randomUUID();
  await call(randomGuest,{action:'join',invite:'a'.repeat(32)},404);
  let current = joined;
  const puzzleTitles = new Set();
  for (let round=0;round<3;round++) {
    await new Promise(resolve=>setTimeout(resolve,Math.max(0,current.room.start-Date.now()+100)));
    const started = await call(a,{action:'sync'});
    const index = puzzles.findIndex((_,i)=>JSON.stringify(puzzleDetails(i).public)===JSON.stringify(started.room.puzzle));
    assert.ok(index>0); assert.ok(!puzzleTitles.has(index)); puzzleTitles.add(index);
    const correct = puzzleDetails(index).solution.map(x=>x==='#'?'':x);
    const finished = await call(a,{action:'sync',roomId:current.room.id,answers:correct,revision:1});
    assert.equal(finished.room.status,'finished');
    assert.equal(finished.leaderboard.reduce((sum:number,p:any)=>sum+p.wins,0),round+1);
    const waiting = await call(a,{action:'replay',roomId:current.room.id});
    assert.equal(waiting.room.id,current.room.id); assert.equal(waiting.room.ready,true);
    const other = await call(b,{action:'sync'});
    assert.equal(other.room.opponentReady,true); assert.equal(other.room.ready,false);
    const duplicate = await call(a,{action:'replay',roomId:current.room.id});
    assert.equal(duplicate.room.id,current.room.id);
    const nexts = await Promise.all([call(b,{action:'replay',roomId:current.room.id}),call(b,{action:'replay',roomId:current.room.id})]);
    assert.equal(nexts[0].room.id,nexts[1].room.id);
    assert.notEqual(nexts[0].room.id,current.room.id);
    const resumed = await call(a,{action:'join',invite:created.room.invite});
    assert.equal(resumed.room.id,nexts[0].room.id);
    assert.equal(resumed.room.invite,created.room.invite);
    assert.equal(resumed.room.puzzle,null); assert.equal(resumed.room.ready,false);
    assert.ok(resumed.room.answers.every((x:string)=>!x));
    const stale = await call(a,{action:'replay',roomId:current.room.id});
    assert.equal(stale.room.id,resumed.room.id); assert.equal(stale.room.ready,false);
    current=resumed;
  }
  await call(a,{action:'public'});
  const abandoned = await call(b,{action:'sync'});
  assert.equal(abandoned.room.status,'cancelled');
  await call(b,{action:'replay',roomId:abandoned.room.id},409);
});

test('robot progresses on server time, supports both difficulties, waits for selection, and can be beaten', {skip:!base}, async () => {
  assert.ok(/^http:\/\/(localhost|127\.0\.0\.1):/.test(base!));
  const url = new URL(process.env.DATABASE_URL!);
  assert.ok(['localhost','127.0.0.1'].includes(url.hostname));
  const {Pool} = await import('pg');
  const db = new Pool({connectionString:url.toString(),max:1});
  const token = crypto.randomUUID()+crypto.randomUUID();
  async function call(body: object) {
    const response = await fetch(`${base}/api/game`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify(body)});
    assert.equal(response.status,200,await response.clone().text());
    return response.json() as Promise<any>;
  }
  try {
    const setup = await call({action:'robot-setup'});
    assert.equal(setup.room.status,'waiting');assert.equal(setup.room.start,null);
    const stillWaiting = await call({action:'sync'});assert.equal(stillWaiting.room.status,'waiting');
    const outsider = await fetch(`${base}/api/game`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${crypto.randomUUID()+crypto.randomUUID()}`},body:JSON.stringify({action:'join'})});
    assert.notEqual((await outsider.json()).room.id,setup.room.id);
    const invalid = await fetch(`${base}/api/game`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify({action:'robot',difficulty:'invalid'})});assert.equal(invalid.status,400);
    const created = await call({action:'robot',difficulty:'intermediate'});
    assert.equal(created.room.robotDifficulty,'intermediate');
    assert.equal(created.room.mode,'robot');assert.equal(created.room.opponent.name,'Robot');
    assert.match(created.player.name,/^[A-Za-z ]+$/);
    assert.equal(created.room.puzzle,null);assert.deepEqual(created.leaderboard,[]);
    const initial = (await db.query('SELECT * FROM rooms WHERE id=$1',[created.room.id])).rows[0];
    assert.ok(initial.robot_ms>=30000 && initial.robot_ms<=45000);
    await db.query('UPDATE rooms SET start=$1 WHERE id=$2',[Date.now()-Math.floor(initial.robot_ms/2),created.room.id]);
    const half = await call({action:'sync'});
    assert.equal(half.room.status,'playing');
    assert.ok(half.room.progress.filter(Boolean).length>0);
    assert.ok(half.room.progress.filter(Boolean).length<half.room.puzzle.total);
    assert.ok(half.room.answers.every((x:string)=>!x));
    await db.query('UPDATE rooms SET start=$1 WHERE id=$2',[Date.now()-initial.robot_ms-100,created.room.id]);
    const ended = await call({action:'sync'});
    assert.equal(ended.room.status,'finished');assert.equal(ended.room.won,false);
    assert.equal(ended.room.ended-ended.room.start,initial.robot_ms);
    assert.equal(ended.room.progress.filter(Boolean).length,ended.room.puzzle.total);
    const replaySetup = await call({action:'replay',roomId:ended.room.id});
    assert.equal(replaySetup.room.status,'waiting');
    const next = await call({action:'robot',difficulty:'novice'});
    assert.equal(next.room.robotDifficulty,'novice');
    const novice = (await db.query('SELECT * FROM rooms WHERE id=$1',[next.room.id])).rows[0];
    assert.ok(novice.robot_ms>=45000 && novice.robot_ms<=60000);
    assert.notEqual(novice.puzzle,initial.puzzle);
    assert.equal(next.room.mode,'robot');assert.notEqual(next.room.id,ended.room.id);
    await db.query('UPDATE rooms SET start=$1 WHERE id=$2',[Date.now()-1000,next.room.id]);
    const started = await call({action:'sync'});
    const index = puzzles.findIndex((_,i)=>JSON.stringify(puzzleDetails(i).public)===JSON.stringify(started.room.puzzle));
    const correct = puzzleDetails(index).solution.map(x=>x==='#'?'':x);
    const won = await call({action:'sync',roomId:next.room.id,answers:correct,revision:1});
    assert.equal(won.room.won,true);assert.equal(won.room.status,'finished');
    await db.query('UPDATE rooms SET start=$1 WHERE id=$2',[Date.now()-61000,next.room.id]);
    const stable = await call({action:'sync'});
    assert.equal(stable.room.won,true);
  } finally {await db.end();}
});
