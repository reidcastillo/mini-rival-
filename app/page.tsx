'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowRight, ArrowDown, Delete, Trophy, RotateCcw, WifiOff } from 'lucide-react';

type Clue = { number: number; text: string; cells: number[] };
type Puzzle = { title: string; blocks: boolean[]; numbers: Record<number, number>; across: Clue[]; down: Clue[]; total: number };
type Game = { now: number; player: { name: string }; room: { id: string; status: string; start: number | null; ended: number | null; won: boolean; opponent: { name: string; connected: boolean } | null; progress: boolean[]; answers: string[]; revision: number; puzzle: Puzzle | null }; incorrect: boolean; leaderboard: { name: string; wins: number; best: number }[] };
const time = (ms: number) => `${Math.floor(Math.max(0, ms) / 60000)}:${String(Math.floor(Math.max(0, ms) / 1000) % 60).padStart(2, '0')}`;
const empty = () => Array<string>(25).fill('');

export default function Home() {
  const [game, setGame] = useState<Game | null>(null);
  const [answers, setAnswers] = useState<string[]>(empty);
  const [cell, setCell] = useState(0);
  const [direction, setDirection] = useState<'across' | 'down'>('across');
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const live = useRef({ token: '', room: '', revision: 0, answers: empty(), dirty: false, offset: 0, pending: false, joined: false });
  const gameRef = useRef<Game | null>(null);
  const board = useRef<HTMLDivElement>(null);

  const sync = useCallback(async (action: 'join' | 'sync' | 'replay' = 'sync') => {
    const state = live.current;
    if (state.pending || !state.token) return;
    state.pending = true;
    const revision = state.revision;
    const shouldSend = action === 'sync' && state.dirty && gameRef.current?.room.status === 'playing';
    const sent = Date.now();
    try {
      const response = await fetch('/api/game', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${state.token}` },
        body: JSON.stringify({ action, ...(shouldSend ? { roomId: state.room, answers: state.answers, revision } : {}) }),
        signal: AbortSignal.timeout(12000),
      });
      const result = await response.json() as Game & { error?: string };
      if (!response.ok) throw new Error(result.error || 'Connection interrupted. Reconnecting…');
      const data = result as Game;
      state.joined = true;
      state.offset = data.now - (sent + Date.now()) / 2;
      if (data.room.id !== state.room) {
        state.room = data.room.id;
        state.answers = data.room.answers;
        state.revision = data.room.revision;
        state.dirty = false;
        setAnswers([...state.answers]);
        setCell(0);
        setDirection('across');
      } else if (shouldSend && state.revision === revision && data.room.revision >= revision) {
        state.dirty = false;
      }
      if (data.room.puzzle) {
        const blocks = data.room.puzzle.blocks;
        setCell(current => blocks[current] ? blocks.findIndex(blocked => !blocked) : current);
      }
      gameRef.current = data;
      setGame(data);
      setError('');
      setNow(Date.now() + state.offset);
    } catch (err) {
      setError(err instanceof Error && err.name !== 'TimeoutError' ? err.message : 'Connection interrupted. Reconnecting…');
    } finally { state.pending = false; }
  }, []);

  useEffect(() => {
    try {
      let token = sessionStorage.getItem('mini-duel-session');
      if (!token) { token = crypto.randomUUID() + crypto.randomUUID(); sessionStorage.setItem('mini-duel-session', token); }
      live.current.token = token;
    } catch { live.current.token = crypto.randomUUID() + crypto.randomUUID(); }
    void sync('join');
    const poll = setInterval(() => void sync(live.current.joined ? 'sync' : 'join'), 850);
    const clock = setInterval(() => setNow(Date.now() + live.current.offset), 100);
    return () => { clearInterval(poll); clearInterval(clock); };
  }, [sync]);

  const room = game?.room;
  const puzzle = room?.puzzle;
  const playing = room?.status === 'playing' && !!puzzle && now >= (room.start ?? Infinity);
  const finished = room?.status === 'finished';
  const cancelled = room?.status === 'cancelled';
  const countdown = room?.status === 'playing' && !puzzle;
  const clues = puzzle?.[direction] ?? [];
  const clue = clues.find(c => c.cells.includes(cell)) ?? clues[0];
  const filled = answers.filter((x, i) => x && !puzzle?.blocks[i]).length;
  const opponentFilled = room?.progress.filter(Boolean).length ?? 0;

  const chooseClue = useCallback((next: Clue, dir: 'across' | 'down') => {
    setDirection(dir);
    setCell(next.cells.find(i => !live.current.answers[i]) ?? next.cells[0]);
    board.current?.focus({ preventScroll: true });
  }, []);
  const key = useCallback((value: string) => {
    if (!playing || !puzzle || !clue) return;
    const current = live.current;
    const position = clue.cells.indexOf(cell);
    if (value === 'Enter' || value === ' ') { setDirection(d => d === 'across' ? 'down' : 'across'); return; }
    if (value === 'Tab' || value === 'BackTab') { chooseClue(clues[(clues.indexOf(clue) + (value === 'Tab' ? 1 : clues.length - 1)) % clues.length], direction); return; }
    const arrows: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -5, ArrowDown: 5 };
    if (value in arrows) {
      const delta = arrows[value], next = cell + delta;
      setDirection(Math.abs(delta) === 5 ? 'down' : 'across');
      if (next >= 0 && next < 25 && !puzzle.blocks[next] && (Math.abs(delta) === 5 || Math.floor(next / 5) === Math.floor(cell / 5))) setCell(next);
      return;
    }
    const next = [...current.answers];
    if (value === 'Backspace') {
      const previous = next[cell] ? cell : clue.cells[Math.max(0, position - 1)];
      next[previous] = ''; setCell(previous);
    } else if (/^[a-z]$/i.test(value)) {
      next[cell] = value.toUpperCase();
      const following = clue.cells.slice(position + 1).find(i => !next[i]);
      if (following !== undefined) setCell(following);
      else {
        const within = clue.cells.find(i => !next[i]);
        if (within !== undefined) setCell(within);
        else {
          const ordered = [...clues.slice(clues.indexOf(clue) + 1), ...clues.slice(0, clues.indexOf(clue))];
          const followingClue = ordered.find(c => c.cells.some(i => !next[i]));
          if (followingClue) setCell(followingClue.cells.find(i => !next[i])!);
        }
      }
    } else return;
    current.answers = next; current.revision += 1; current.dirty = true;
    setAnswers(next);
    // Send each edit promptly; the polling loop retries edits made in flight.
    void sync();
  }, [playing, puzzle, clue, cell, clues, direction, chooseClue, sync]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || !playing) return;
      const target = event.target as HTMLElement;
      if (['INPUT', 'TEXTAREA'].includes(target.tagName)) return;
      if (/^[a-z]$/i.test(event.key) || ['Backspace', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) || (board.current?.contains(target) && ['Enter', ' ', 'Tab'].includes(event.key))) {
        event.preventDefault(); key(event.key === 'Tab' && event.shiftKey ? 'BackTab' : event.key);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [key, playing]);

  useEffect(() => {
    const context = (document as unknown as { modelContext?: { registerTool: (tool: unknown, options: { signal: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context) return;
    const lifecycle = new AbortController();
    void Promise.resolve(context.registerTool({ name: 'read_duel_status', description: 'Read the current crossword race status and both players’ filled-square counts. Does not reveal answers.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true }, execute: (input: unknown) => {
      if (!input || typeof input !== 'object' || Object.keys(input).length) throw new Error('Expected an empty object');
      const current = gameRef.current;
      return { status: current?.room.status ?? 'connecting', you: live.current.answers.filter(Boolean).length, opponent: current?.room.progress.filter(Boolean).length ?? 0, won: current?.room.won ?? false };
    } }, { signal: lifecycle.signal })).catch(() => {});
    return () => lifecycle.abort();
  }, []);

  async function replay() { setBusy(true); await sync('replay'); setBusy(false); }
  async function copyLink() { try { await navigator.clipboard.writeText(location.origin); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { setError('Copy the address from your browser to invite a friend.'); } }

  return <main>
    <header className="masthead"><a className="brand" href="/">Mini Duel<span className="brand-square">M</span></a><span className="edition">THE HEAD-TO-HEAD CROSSWORD</span><span className="live-label"><i/> Live arena</span></header>
    <section className="title-row"><div><div className="eyebrow">QUICK PUZZLE. REAL COMPETITION.</div><h1>The Mini, with a rival.</h1><p>Movies, music, TV & games. Same puzzle. First to finish wins.</p></div><span className="mode-pill">1 VS 1 · POP CULTURE</span></section>
    {error && <div className="connection-error" role="alert"><WifiOff size={17}/><span>{error}</span></div>}
    <div className="arena"><section className="play-panel" aria-label="Crossword duel">
      <div className="score-strip"><div className="player-label"><b><span className="player-dot"/>You</b><small>{game?.player.name ?? 'Joining the arena…'}</small></div><div className="timer-block"><span className="clock" aria-label="Elapsed time">{time(room?.start ? (room.ended ?? now) - room.start : 0)}</span><small>{finished ? 'FINAL TIME' : playing ? 'RACE CLOCK' : 'READY WHEN YOU ARE'}</small></div><div className="player-label opponent-label"><b>{room?.opponent ? 'Opponent' : 'Opponent'}<span className="player-dot rival"/></b><small>{room?.opponent?.name ?? 'Finding a rival…'}</small></div></div>
      {!puzzle && !finished && !cancelled ? <div className="waiting-surface">
        <div className="mini-mark" aria-hidden="true">{Array.from({length:25},(_,i)=><span key={i} className={[0,4,20,24].includes(i)?'black':''}/>)}</div>
        <div className="eyebrow">{countdown ? 'MATCH FOUND' : 'MATCHMAKING'}</div>
        <h2>{countdown ? 'Your rival is here.' : 'Finding your next rival…'}</h2>
        <p>{countdown ? <>Get ready. Your puzzle opens together.</> : <>You’re in the waiting room.<br/>The next player to arrive joins your game.</>}</p>
        <div className="waiting-status" role="status">{countdown ? <b className="countdown">{Math.max(1, Math.ceil(((room?.start ?? now) - now) / 1000))}</b> : <><i/>{game ? 'Waiting for one more player' : 'Connecting to the arena'}</>}</div>
        {!countdown && <button className="text-button invite" onClick={copyLink}>{copied ? 'Link copied!' : 'Invite a friend'}<ArrowRight size={15}/></button>}
      </div> : <>
        {(finished || cancelled) && <div className={`result-banner ${room?.won ? 'win' : ''}`} role="status">
          {finished && <Trophy size={27}/>}<div><h2>{cancelled ? 'This duel was interrupted.' : room?.won ? 'You won the duel!' : 'Your rival got there first.'}</h2><p>{cancelled ? 'A player disconnected or the 15-minute limit was reached. No win was awarded.' : room?.won ? `Every letter correct. Solved in ${time((room.ended ?? now) - (room.start ?? now))}.` : `${room?.opponent?.name} solved the crossword in ${time((room?.ended ?? now) - (room?.start ?? now))}.`}</p></div>
          <button className="primary-button" onClick={replay} disabled={busy}><RotateCcw size={15}/>{busy ? 'Joining…' : 'Race again'}</button>
        </div>}
        {puzzle && <><div className="puzzle-edition">{puzzle.title}<span>Original Mini Duel puzzle</span></div><div className="race-progress"><div><div className="progress-label"><b>Your grid</b><span>{filled}/{puzzle.total}</span></div><Progress value={filled / puzzle.total * 100} aria-label="Your filled squares"/></div><div className="rival-progress"><div className="progress-label"><b>Their grid</b><span>{opponentFilled}/{puzzle.total}</span></div><Progress value={opponentFilled / puzzle.total * 100} aria-label="Opponent filled squares"/></div></div>
        <div className="puzzle-area"><div className="grid-column"><div className="active-clue"><b>{clue?.number}{direction === 'across' ? 'A' : 'D'}</b><span>{clue?.text}</span><button aria-label="Switch direction" onClick={() => setDirection(d => d === 'across' ? 'down' : 'across')}>{direction === 'across' ? <ArrowRight size={20}/> : <ArrowDown size={20}/>}</button></div>
          <div ref={board} className="crossword" role="group" aria-label="Crossword grid. Type letters, use arrows to move, Enter to switch direction, and Tab to change clues." tabIndex={0}>
            {puzzle.blocks.map((blocked, i) => blocked ? <div className="square block" key={i}/> : <button key={i} tabIndex={-1} disabled={!playing} aria-label={`Row ${Math.floor(i / 5) + 1}, column ${i % 5 + 1}${puzzle.numbers[i] ? `, clue ${puzzle.numbers[i]}` : ''}, ${answers[i] || 'empty'}`} aria-pressed={cell === i} className={`square ${clue?.cells.includes(i) ? 'word-selected' : ''} ${cell === i ? 'selected' : ''}`} onClick={() => { if (cell === i) setDirection(d => d === 'across' ? 'down' : 'across'); setCell(i); board.current?.focus({preventScroll:true}); }}><small>{puzzle.numbers[i]}</small><span>{answers[i]}</span></button>)}
          </div>
          <div className="grid-message" role="status">{game?.incorrect && filled === puzzle.total && playing ? 'The grid is full, but something’s not right. Keep going!' : playing ? 'Fill every square correctly to win.' : 'Your grid at the finish.'}</div>
          <div className="keyboard" aria-label="Letter keyboard">{['QWERTYUIOP','ASDFGHJKL','ZXCVBNM'].map((row,i)=><div className="key-row" key={row}>{i === 2 && <button disabled={!playing} aria-label="Switch across and down" onClick={()=>key('Enter')}><ArrowRight size={17}/></button>}{row.split('').map(letter=><button disabled={!playing} key={letter} onClick={()=>key(letter)}>{letter}</button>)}{i === 2 && <button disabled={!playing} aria-label="Backspace" onClick={()=>key('Backspace')}><Delete size={18}/></button>}</div>)}</div>
        </div><div className="clue-lists">{(['across','down'] as const).map(dir=><section key={dir}><h3>{dir}</h3>{puzzle[dir].map(c=><button className={direction === dir && clue?.number === c.number ? 'clue-active' : ''} key={c.number} onClick={()=>chooseClue(c, dir)}><b>{c.number}</b><span>{c.text}</span></button>)}</section>)}</div></div></>}
      </>}
      <div className="play-footer"><span>5 × 5 crossword</span><span>{playing && room?.opponent && !room.opponent.connected ? 'Opponent reconnecting…' : 'No hints. Just you and the clock.'}</span></div>
    </section><aside className="sidebar">
      {puzzle && room?.opponent ? <section className="side-section opponent-section"><div className="eyebrow">ACROSS THE TABLE</div><h2>{room.opponent.name}</h2><div className="opponent-grid" aria-label={`${opponentFilled} of ${puzzle.total} opponent squares filled`}>{puzzle.blocks.map((block,i)=><span key={i} className={block?'block':room.progress[i]?'filled':''}/>)}</div><p className="muted">{opponentFilled} of {puzzle.total} squares filled.<br/>Their letters stay secret.</p></section> : <section className="side-section"><div className="eyebrow">HOW TO DUEL</div><h2>A little puzzle.<br/>A proper showdown.</h2><ol className="rules"><li><b>Meet your match</b><p>We pair you with the next player.</p></li><li><b>Race the same grid</b><p>Watch their progress as you solve.</p></li><li><b>Finish first</b><p>Every letter must be right to win.</p></li></ol></section>}
      <section className="side-section leaderboard"><div className="eyebrow">THE LEADERBOARD</div><h2>Fast minds. Bragging rights.</h2>{game?.leaderboard.length ? <Table><TableHeader><TableRow><TableHead>Player</TableHead><TableHead>Wins</TableHead><TableHead>Best</TableHead></TableRow></TableHeader><TableBody>{game.leaderboard.map((p,i)=><TableRow key={p.name}><TableCell><span className="rank">{i+1}</span>{p.name}</TableCell><TableCell>{p.wins}</TableCell><TableCell>{time(p.best)}</TableCell></TableRow>)}</TableBody></Table> : <p className="muted">{game ? 'The first duel starts the rankings. It could be yours.' : 'Rankings load when you connect.'}</p>}<p className="leaderboard-note">Ranked by wins, then fastest solve.</p></section>
    </aside></div>
    <footer className="site-footer"><b>Mini Duel</b><span>Original puzzles. Independent game. Not affiliated with The New York Times.</span></footer>
  </main>;
}
