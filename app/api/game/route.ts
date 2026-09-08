import { withDatabase, type Database } from '@/db/database';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
import { puzzleDetails, puzzles } from '@/lib/puzzles';

type Player = { id: string; name: string; room: string | null; seen: number };
type Room = { id: string; p1: string; p2: string | null; status: string; puzzle: number; created: number; start: number | null; ended: number | null; winner: string | null; a1: string; a2: string; rev1: number; rev2: number; friend_code: string | null; ready1: boolean; ready2: boolean; next_room: string | null; robot_ms: number | null };
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const first = <T,>(db: Database, sql: string, ...args: (string | number | null)[]) => db.prepare(sql).bind(...args).first<T>();

async function choosePuzzle(db: Database, id: string) {
  const recent = await db.prepare("SELECT puzzle FROM rooms WHERE p1=? OR p2=? ORDER BY created DESC LIMIT 20").bind(id, id).all<{ puzzle: number }>();
  const excluded = new Set(recent.results.map(r => r.puzzle));
  const available = puzzles.map((_, i) => i).filter(i => i > 0 && !excluded.has(i));
  const choices = available.length ? available : puzzles.map((_, i) => i).filter(i => i > 0);
  return choices[crypto.getRandomValues(new Uint32Array(1))[0] % choices.length];
}

async function join(db: Database, id: string, now: number) {
  const room = crypto.randomUUID();
  const puzzle = await choosePuzzle(db, id);
  await db.batch([
    db.prepare("UPDATE rooms SET status='cancelled', ended=? WHERE status='waiting' AND friend_code IS NULL AND p1 IN (SELECT id FROM players WHERE seen < ?)").bind(now, now - 45000),
    db.prepare("UPDATE players SET room=NULL WHERE id=? AND room IN (SELECT id FROM rooms WHERE status='cancelled')").bind(id),
    db.prepare("UPDATE rooms SET p2=?, status='playing', start=? WHERE id=(SELECT r.id FROM rooms r JOIN players p ON p.id=r.p1 WHERE r.status='waiting' AND r.friend_code IS NULL AND r.p1<>? AND p.seen>=? ORDER BY r.created, r.id LIMIT 1) AND (SELECT room FROM players WHERE id=?) IS NULL").bind(id, now + 4000, id, now - 45000, id),
    db.prepare("INSERT INTO rooms(id,p1,status,puzzle,created) SELECT ?,?,'waiting',?,? WHERE (SELECT room FROM players WHERE id=?) IS NULL AND NOT EXISTS(SELECT 1 FROM rooms WHERE p2=? AND status='playing')").bind(room, id, puzzle, now, id, id),
    db.prepare("UPDATE players SET room=(SELECT id FROM rooms WHERE (p1=? OR p2=?) AND status IN ('waiting','playing') ORDER BY created DESC LIMIT 1) WHERE id=? AND room IS NULL").bind(id, id, id),
  ]);
}

async function leave(db: Database, id: string, room: Room | null, now: number) {
  if (room) await db.prepare("UPDATE rooms SET status='cancelled', ended=? WHERE id=? AND status IN ('waiting','playing')").bind(now, room.id).run();
  await db.prepare('UPDATE players SET room=NULL WHERE id=?').bind(id).run();
}

async function followRoom(db: Database, id: string): Promise<Room | null> {
  const player = await first<Player>(db, 'SELECT * FROM players WHERE id=?', id);
  let room = player?.room ? await first<Room>(db, 'SELECT * FROM rooms WHERE id=?', player.room) : null;
  if (room?.next_room) {
    room = await first<Room>(db, 'SELECT * FROM rooms WHERE id=?', room.next_room);
    if (room && (room.p1 === id || room.p2 === id)) await db.prepare('UPDATE players SET room=? WHERE id=?').bind(room.id, id).run();
    else throw new Error('Invalid rematch membership');
  }
  return room;
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return json({ error: 'Origin not allowed' }, 403);
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
  if (!/^[a-f0-9-]{72}$/.test(token)) return json({ error: 'Invalid player session' }, 401);
  if (Number(request.headers.get('content-length') || 0) > 4096) return json({ error: 'Request too large' }, 413);
  try {
    const raw = await request.text();
    if (raw.length > 4096) return json({ error: 'Request too large' }, 413);
    const body = JSON.parse(raw);
    if (!body || typeof body !== 'object' || !['join', 'sync', 'replay', 'friends', 'public', 'robot'].includes(body.action)) return json({ error: 'Unknown action' }, 400);
    if (body.invite !== undefined && (typeof body.invite !== 'string' || !/^[a-f0-9]{32}$/.test(body.invite))) return json({ error: 'This friend link is invalid.' }, 400);
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
    const id = Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
    return await withDatabase(async db => {
    if (body.action !== 'sync') await db.prepare('SELECT pg_advisory_xact_lock(170421, 2)').run();
    const now = Date.now();
    let player = await first<Player>(db, 'SELECT * FROM players WHERE id=? FOR UPDATE', id);
    if (!player) {
      if (!['join', 'friends', 'public', 'robot'].includes(body.action)) return json({ error: 'Join a game first' }, 401);
      const names = ['Quick Fox', 'Sharp Owl', 'Clever Cat', 'Swift Finch', 'Bright Bear', 'Nimble Newt'];
      const name = names[parseInt(id.slice(0, 2), 16) % names.length];
      await db.prepare('INSERT INTO players(id,name,seen) VALUES(?,?,?) ON CONFLICT(id) DO NOTHING').bind(id, name, now).run();
    }
    await db.prepare('UPDATE players SET seen=? WHERE id=?').bind(now, id).run();
    let room = await followRoom(db, id);
    if (body.action === 'robot' || (body.action === 'replay' && room?.robot_ms)) {
      if (!room || room.status !== 'playing') {
        await leave(db, id, room, now);
        const next = crypto.randomUUID();
        const duration = 30000 + crypto.getRandomValues(new Uint32Array(1))[0] % 15001;
        await db.prepare("INSERT INTO players(id,name,seen) VALUES('mini-duel-robot','Robot',?) ON CONFLICT(id) DO NOTHING").bind(now).run();
        await db.prepare("INSERT INTO rooms(id,p1,p2,status,puzzle,created,start,robot_ms) VALUES(?,?,'mini-duel-robot','playing',?,?,?,?)").bind(next,id,await choosePuzzle(db,id),now,now+4000,duration).run();
        await db.prepare('UPDATE players SET room=? WHERE id=?').bind(next,id).run();
      }
    } else if (body.action === 'friends') {
      if (!room?.friend_code || room.status !== 'waiting') {
        if (room?.status === 'playing') return json({ error: 'Finish this race before creating a friend room.' }, 409);
        await leave(db, id, room, now);
        const roomId = crypto.randomUUID();
        const code = crypto.randomUUID().replaceAll('-', '');
        await db.prepare("INSERT INTO rooms(id,p1,status,puzzle,created,friend_code) VALUES(?,?,'waiting',?,?,?)").bind(roomId, id, await choosePuzzle(db, id), now, code).run();
        await db.prepare('UPDATE players SET room=? WHERE id=?').bind(roomId, id).run();
      }
    } else if (body.action === 'public') {
      await leave(db, id, room, now);
      await join(db, id, now);
    } else if (body.action === 'join' && body.invite) {
      const invited = await first<Room>(db, 'SELECT * FROM rooms WHERE friend_code=? ORDER BY created DESC, id DESC LIMIT 1', body.invite);
      if (!invited) return json({ error: 'This friend room was not found. Ask your friend for a new link.' }, 404);
      if (invited.p1 !== id && invited.p2 !== id) {
        if (invited.p2 || invited.status !== 'waiting') return json({ error: 'This friend room is full or closed.' }, 409);
        const host = await first<Player>(db, 'SELECT * FROM players WHERE id=?', invited.p1);
        if (!host || host.seen < now - 45000 || host.room !== invited.id) return json({ error: 'Your friend is offline. Ask them to reopen the waiting room.' }, 409);
        if (room?.status === 'playing') return json({ error: 'Finish your current race before joining your friend.' }, 409);
        await leave(db, id, room, now);
        await db.prepare("UPDATE rooms SET p2=?, status='playing', start=? WHERE id=? AND p2 IS NULL").bind(id, now + 4000, invited.id).run();
      }
      await db.prepare('UPDATE players SET room=? WHERE id=?').bind(invited.id, id).run();
    } else if (body.action === 'replay' && room?.friend_code) {
      if (body.roomId === room.id && ['finished', 'cancelled'].includes(room.status)) {
        if (!room.p2) return json({ error: 'Create a new friend room to invite someone.' }, 409);
        const otherId = room.p1 === id ? room.p2 : room.p1;
        const other = await first<Player>(db, 'SELECT * FROM players WHERE id=?', otherId);
        if (other?.room !== room.id) return json({ error: 'Your friend left this room. Create a new friend room to play again.' }, 409);
        const seat = room.p1 === id ? 1 : 2;
        await db.prepare(`UPDATE rooms SET ready${seat}=TRUE WHERE id=?`).bind(room.id).run();
        room = (await first<Room>(db, 'SELECT * FROM rooms WHERE id=?', room.id))!;
        if (room.ready1 && room.ready2 && !room.next_room) {
          const next = crypto.randomUUID();
          await db.prepare("INSERT INTO rooms(id,p1,p2,status,puzzle,created,start,friend_code) VALUES(?,?,?,'playing',?,?,?,?)").bind(next, room.p1, room.p2, await choosePuzzle(db, id), now, now + 4000, room.friend_code).run();
          await db.prepare('UPDATE rooms SET next_room=? WHERE id=?').bind(next, room.id).run();
        }
      }
    } else if (body.action === 'join' || body.action === 'replay') {
      if (body.action === 'replay') await db.prepare("UPDATE players SET room=NULL WHERE id=? AND room IN (SELECT id FROM rooms WHERE status IN ('finished','cancelled'))").bind(id).run();
      await join(db, id, now);
    }
    room = await followRoom(db, id);
    player = (await first<Player>(db, 'SELECT * FROM players WHERE id=?', id))!;
    if (!room) return json({ error: 'No match found. Please reconnect.' }, 409);
    const seat = room.p1 === id ? 1 : room.p2 === id ? 2 : 0;
    if (!seat) return json({ error: 'Not your match' }, 403);
    const otherId = seat === 1 ? room.p2 : room.p1;
    const opponent = otherId ? await first<Player>(db, 'SELECT * FROM players WHERE id=?', otherId) : null;
    if (!room.robot_ms && room.status === 'playing' && ((opponent && opponent.seen < now - 45000 && (room.start ?? now) < now - 45000) || (room.start ?? now) < now - 900000)) {
      await db.prepare("UPDATE rooms SET status='cancelled', ended=? WHERE id=? AND status='playing'").bind(now, room.id).run();
    }
    if (room.robot_ms && room.status === 'playing' && room.start !== null) {
      const {solution} = puzzleDetails(room.puzzle);
      const duration = room.robot_ms;
      const elapsed = Math.max(0, now - room.start);
      const total = solution.filter(x => x !== '#').length;
      let remaining = Math.min(total, Math.floor(elapsed / duration * total));
      const robotAnswers = solution.map(x => x === '#' ? '' : remaining-- > 0 ? x : '');
      const done = elapsed >= duration;
      await db.prepare("UPDATE rooms SET a2=?, status=CASE WHEN ?=1 THEN 'finished' ELSE status END, winner=CASE WHEN ?=1 THEN p2 ELSE winner END, ended=CASE WHEN ?=1 THEN ? ELSE ended END WHERE id=? AND status='playing'").bind(JSON.stringify(robotAnswers),done?1:0,done?1:0,done?1:0,room.start+duration,room.id).run();
    }
    let incorrect = false;
    if (body.answers !== undefined) {
      if (body.roomId !== room.id) return json({ error: 'This submission belongs to a different match' }, 409);
      if (!Array.isArray(body.answers) || body.answers.length !== 25 || body.answers.some((x: unknown) => typeof x !== 'string' || !/^[A-Z]?$/.test(x)) || !Number.isSafeInteger(body.revision) || body.revision < 1 || body.revision > 2147483647) return json({ error: 'Invalid grid' }, 400);
      const { solution } = puzzleDetails(room.puzzle);
      const answers = body.answers.map((x: string, i: number) => solution[i] === '#' ? '' : x);
      const correct = solution.every((x, i) => x === '#' || answers[i] === x);
      incorrect = !correct && solution.every((x, i) => x === '#' || answers[i]);
      await db.prepare(`UPDATE rooms SET a${seat}=?, rev${seat}=?, status=CASE WHEN ? = 1 THEN 'finished' ELSE status END, winner=CASE WHEN ? = 1 THEN ? ELSE winner END, ended=CASE WHEN ? = 1 THEN ? ELSE ended END WHERE id=? AND status='playing' AND start<=? AND rev${seat}<?`).bind(JSON.stringify(answers), body.revision, correct ? 1 : 0, correct ? 1 : 0, id, correct ? 1 : 0, now, room.id, now, body.revision).run();
    }
    room = (await first<Room>(db, 'SELECT * FROM rooms WHERE id=?', room.id))!;
    const details = puzzleDetails(room.puzzle);
    const ownAnswers = JSON.parse(seat === 1 ? room.a1 : room.a2);
    const otherAnswers: string[] = JSON.parse(seat === 1 ? room.a2 : room.a1);
    const leaderboard = room.friend_code ? await db.prepare("SELECT p.name, COUNT(r.id) AS wins, MIN(r.ended-r.start) AS best FROM players p LEFT JOIN rooms r ON r.winner=p.id AND r.status='finished' AND r.friend_code=? WHERE p.id=? OR p.id=? GROUP BY p.id ORDER BY wins DESC, best ASC NULLS LAST, p.name").bind(room.friend_code,room.p1,room.p2).all() : {results:[]};
    return json({ now: Date.now(), player: { name: player.name }, room: { id: room.id, mode: room.robot_ms ? 'robot' : room.friend_code ? 'friends' : 'public', invite: room.friend_code, ready: seat === 1 ? room.ready1 : room.ready2, opponentReady: seat === 1 ? room.ready2 : room.ready1, status: room.status, start: room.start, ended: room.ended, won: room.winner === id, opponent: opponent ? { name: opponent.name, connected: !!room.robot_ms || opponent.seen >= now - 10000 } : null, progress: Array.from({ length: 25 }, (_, i) => !!otherAnswers[i]), answers: ownAnswers.length ? ownAnswers : Array(25).fill(''), revision: seat === 1 ? room.rev1 : room.rev2, puzzle: room.status === 'waiting' || (room.start ?? Infinity) > now ? null : details.public }, incorrect, leaderboard: leaderboard.results });
    });
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: 'Invalid request' }, 400);
    console.error('Game request failed');
    return json({ error: 'The arena is temporarily unavailable. Reconnecting…' }, 503);
  }
}
