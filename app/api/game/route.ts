import { withDatabase, type Database } from '@/db/database';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
import { puzzleDetails, puzzles } from '@/lib/puzzles';

type Player = { id: string; name: string; room: string | null; seen: number };
type Room = { id: string; p1: string; p2: string | null; status: string; puzzle: number; created: number; start: number | null; ended: number | null; winner: string | null; a1: string; a2: string; rev1: number; rev2: number };
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const first = <T,>(db: Database, sql: string, ...args: (string | number | null)[]) => db.prepare(sql).bind(...args).first<T>();

async function join(db: Database, id: string, now: number) {
  const room = crypto.randomUUID();
  const recent = await db.prepare("SELECT puzzle FROM rooms WHERE p1=? OR p2=? ORDER BY created DESC LIMIT 20").bind(id, id).all<{ puzzle: number }>();
  const excluded = new Set(recent.results.map(r => r.puzzle));
  const available = puzzles.map((_, i) => i).filter(i => i > 0 && !excluded.has(i));
  const choices = available.length ? available : puzzles.map((_, i) => i).filter(i => i > 0);
  const puzzle = choices[crypto.getRandomValues(new Uint32Array(1))[0] % choices.length];
  await db.batch([
    db.prepare("UPDATE rooms SET status='cancelled', ended=? WHERE status='waiting' AND p1 IN (SELECT id FROM players WHERE seen < ?)").bind(now, now - 45000),
    db.prepare("UPDATE players SET room=NULL WHERE id=? AND room IN (SELECT id FROM rooms WHERE status='cancelled')").bind(id),
    db.prepare("UPDATE rooms SET p2=?, status='playing', start=? WHERE id=(SELECT r.id FROM rooms r JOIN players p ON p.id=r.p1 WHERE r.status='waiting' AND r.p1<>? AND p.seen>=? ORDER BY r.created, r.id LIMIT 1) AND (SELECT room FROM players WHERE id=?) IS NULL").bind(id, now + 4000, id, now - 45000, id),
    db.prepare("INSERT INTO rooms(id,p1,status,puzzle,created) SELECT ?,?,'waiting',?,? WHERE (SELECT room FROM players WHERE id=?) IS NULL AND NOT EXISTS(SELECT 1 FROM rooms WHERE p2=? AND status='playing')").bind(room, id, puzzle, now, id, id),
    db.prepare("UPDATE players SET room=(SELECT id FROM rooms WHERE (p1=? OR p2=?) AND status IN ('waiting','playing') ORDER BY created DESC LIMIT 1) WHERE id=? AND room IS NULL").bind(id, id, id),
  ]);
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
    if (!body || typeof body !== 'object' || !['join', 'sync', 'replay'].includes(body.action)) return json({ error: 'Unknown action' }, 400);
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
    const id = Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
    return await withDatabase(async db => {
    // Postgres does not serialize separate statements like D1 batches do.
    // Lock only matchmaking requests across instances; active races run in parallel.
    if (body.action !== 'sync') await db.prepare('SELECT pg_advisory_xact_lock(170421, 2)').run();
    const now = Date.now();
    let player = await first<Player>(db, 'SELECT * FROM players WHERE id=? FOR UPDATE', id);
    if (!player) {
      if (body.action !== 'join') return json({ error: 'Join a game first' }, 401);
      const names = ['Quick Fox', 'Sharp Owl', 'Clever Cat', 'Swift Finch', 'Bright Bear', 'Nimble Newt'];
      const name = `${names[parseInt(id.slice(0, 2), 16) % names.length]} ${id.slice(2, 6).toUpperCase()}`;
      await db.prepare('INSERT INTO players(id,name,seen) VALUES(?,?,?) ON CONFLICT(id) DO NOTHING').bind(id, name, now).run();
    }
    await db.prepare('UPDATE players SET seen=? WHERE id=?').bind(now, id).run();
    if (body.action === 'replay') await db.prepare("UPDATE players SET room=NULL WHERE id=? AND room IN (SELECT id FROM rooms WHERE status IN ('finished','cancelled'))").bind(id).run();
    if (body.action === 'join' || body.action === 'replay') await join(db, id, now);
    player = (await first<Player>(db, 'SELECT * FROM players WHERE id=?', id))!;
    let room = player.room ? await first<Room>(db, 'SELECT * FROM rooms WHERE id=?', player.room) : null;
    if (!room) return json({ error: 'No match found. Please reconnect.' }, 409);
    const seat = room.p1 === id ? 1 : room.p2 === id ? 2 : 0;
    if (!seat) return json({ error: 'Not your match' }, 403);
    const otherId = seat === 1 ? room.p2 : room.p1;
    const opponent = otherId ? await first<Player>(db, 'SELECT * FROM players WHERE id=?', otherId) : null;
    if (room.status === 'playing' && ((opponent && opponent.seen < now - 45000 && (room.start ?? now) < now - 45000) || (room.start ?? now) < now - 900000)) {
      await db.prepare("UPDATE rooms SET status='cancelled', ended=? WHERE id=? AND status='playing'").bind(now, room.id).run();
    }
    let incorrect = false;
    if (body.answers !== undefined) {
      if (body.roomId !== room.id) return json({ error: 'This submission belongs to a different match' }, 409);
      if (!Array.isArray(body.answers) || body.answers.length !== 25 || body.answers.some((x: unknown) => typeof x !== 'string' || !/^[A-Z]?$/.test(x)) || !Number.isSafeInteger(body.revision) || body.revision < 1 || body.revision > 2147483647) return json({ error: 'Invalid grid' }, 400);
      const { solution } = puzzleDetails(room.puzzle);
      const answers = body.answers.map((x: string, i: number) => solution[i] === '#' ? '' : x);
      const correct = solution.every((x, i) => x === '#' || answers[i] === x);
      incorrect = !correct && solution.every((x, i) => x === '#' || answers[i]);
      // A single conditional UPDATE is the winner's finish line. Postgres serializes
      // competing writes; a later request cannot replace the recorded winner.
      await db.prepare(`UPDATE rooms SET a${seat}=?, rev${seat}=?, status=CASE WHEN ? = 1 THEN 'finished' ELSE status END, winner=CASE WHEN ? = 1 THEN ? ELSE winner END, ended=CASE WHEN ? = 1 THEN ? ELSE ended END WHERE id=? AND status='playing' AND start<=? AND rev${seat}<?`).bind(JSON.stringify(answers), body.revision, correct ? 1 : 0, correct ? 1 : 0, id, correct ? 1 : 0, now, room.id, now, body.revision).run();
    }
    room = (await first<Room>(db, 'SELECT * FROM rooms WHERE id=?', room.id))!;
    const details = puzzleDetails(room.puzzle);
    const ownAnswers = JSON.parse(seat === 1 ? room.a1 : room.a2);
    const otherAnswers: string[] = JSON.parse(seat === 1 ? room.a2 : room.a1);
    const leaderboard = await db.prepare("SELECT p.name, COUNT(*) AS wins, MIN(r.ended-r.start) AS best FROM rooms r JOIN players p ON p.id=r.winner WHERE r.status='finished' GROUP BY p.id ORDER BY wins DESC, best ASC, p.name LIMIT 10").all();
    return json({ now: Date.now(), player: { name: player.name }, room: { id: room.id, status: room.status, start: room.start, ended: room.ended, won: room.winner === id, opponent: opponent ? { name: opponent.name, connected: opponent.seen >= now - 10000 } : null, progress: Array.from({ length: 25 }, (_, i) => !!otherAnswers[i]), answers: ownAnswers.length ? ownAnswers : Array(25).fill(''), revision: seat === 1 ? room.rev1 : room.rev2, puzzle: room.status === 'waiting' || (room.start ?? Infinity) > now ? null : details.public }, incorrect, leaderboard: leaderboard.results });
    });
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: 'Invalid request' }, 400);
    console.error('Game request failed');
    return json({ error: 'The arena is temporarily unavailable. Reconnecting…' }, 503);
  }
}
