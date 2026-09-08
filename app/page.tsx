'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowRight, ArrowDown, Delete, Trophy, RotateCcw, WifiOff, Palette, Sun, Moon, Trees, Rocket, Users, Globe, Copy, Check, Bot } from 'lucide-react';

type Clue = { number: number; text: string; cells: number[] };
type Puzzle = { title: string; blocks: boolean[]; numbers: Record<number, number>; across: Clue[]; down: Clue[]; total: number };
type Game = { now: number; player: { name: string }; room: { id: string; mode: 'public' | 'friends' | 'robot'; invite: string | null; ready: boolean; opponentReady: boolean; status: string; start: number | null; ended: number | null; won: boolean; opponent: { name: string; connected: boolean } | null; progress: boolean[]; answers: string[]; revision: number; puzzle: Puzzle | null }; incorrect: boolean; leaderboard: { name: string; wins: number; best: number | null }[] };
const time = (ms: number) => `${Math.floor(Math.max(0, ms) / 60000)}:${String(Math.floor(Math.max(0, ms) / 1000) % 60).padStart(2, '0')}`;
type Theme = 'classic' | 'dark' | 'jungle' | 'space';
const themes = [{id:'classic', name:'Classic', icon:Sun}, {id:'dark', name:'Dark', icon:Moon}, {id:'jungle', name:'Jungle', icon:Trees}, {id:'space', name:'Space', icon:Rocket}] as const;
const empty = () => Array<string>(25).fill('');

export default function Home() {
  const [game, setGame] = useState<Game | null>(null);
  const [answers, setAnswers] = useState<string[]>(empty);
  const [cell, setCell] = useState(0);
  const [direction, setDirection] = useState<'across' | 'down'>('across');
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [theme, setTheme] = useState<Theme>('classic');
  const [inviteUrl, setInviteUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const live = useRef({ token: '', room: '', revision: 0, answers: empty(), dirty: false, offset: 0, pending: false, joined: false });
  const gameRef = useRef<Game | null>(null);
  const board = useRef<HTMLDivElement>(null);

  const sync = useCallback(async (action: 'join' | 'sync' | 'replay' | 'friends' | 'public' | 'robot' = 'sync') => {
    const state = live.current;
    if (action !== 'sync') while (state.pending) await new Promise(resolve => setTimeout(resolve, 50));
    if (state.pending || !state.token) return;
    state.pending = true;
    const revision = state.revision;
    const shouldSend = action === 'sync' && state.dirty && gameRef.current?.room.status === 'playing';
    const sent = Date.now();
    try {
      const response = await fetch('/api/game', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${state.token}` },
        body: JSON.stringify({ action, ...(action === 'join' && new URL(location.href).searchParams.has('friend') ? { invite: new URL(location.href).searchParams.get('friend') } : {}), ...(action === 'replay' ? {roomId: state.room} : {}), ...(shouldSend ? { roomId: state.room, answers: state.answers, revision } : {}) }),
        signal: AbortSignal.timeout(12000),
      });
      const result = await response.json() as Game & { error?: string };
      if (!response.ok) throw new Error(result.error || 'Connection interrupted. Reconnecting…');
      const data = result as Game;
      state.joined = true;
      const url = new URL(location.href);
      if (data.room.invite) url.searchParams.set('friend', data.room.invite); else url.searchParams.delete('friend');
      window.history.replaceState(null, '', url);
      setInviteUrl(data.room.invite ? url.toString() : '');
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
    try {
      const stored = localStorage.getItem('mini-duel-theme');
      if (themes.some(t => t.id === stored)) {
        setTheme(stored as Theme);
        document.documentElement.dataset.theme = stored!;
      }
    } catch {}
  }, []);

  function changeTheme(next: Theme) {
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('mini-duel-theme', next); } catch {}
  }
  async function enter(action: 'replay' | 'friends' | 'public' | 'robot') {
    setBusy(true); await sync(action); setBusy(false);
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(inviteUrl); setCopied(true); setTimeout(() => setCopied(false), 2500); }
    catch { setError('Select and copy the friend link below.'); }
  }

  return <main>
    <div className="theme-scenery" aria-hidden="true">
      <svg className="jungle-scenery" viewBox="0 0 1200 220" preserveAspectRatio="none"><path fill="#246c36" d="M0 220V95l25 80 14-125 22 119 28-65 15 78 25-135 20 134 36-93 5 84 30-133 22 135 30-61 25 79 38-119 20 107 29-68 21 90 37-137 18 135 28-80 27 91 34-130 28 124 34-85 18 91 35-110 25 100 32-64 28 68 33-133 18 120 31-74 29 94 25-125 34 124 29-76 26 70 40-115 17 118 29-69 34 75 38-115 16 111 33-81 20 88 38-131 16 120 36-75 28 84 22-108 30 100 32-55 34 83v80Z"/><path fill="#60ad45" d="M0 220v-35l32-59-8 73 55-52-20 58 51-24 25-77 13 83 60-29-29 51 71-54-17 52 58-11 29-97 9 98 70-39-17 48 69-68-24 72 57-37 29-75 12 83 59-17 40-69-8 90 66-46 30-60-4 92 65-50 30-35-5 69 70-44 37-37-12 77 68-59 39-41-13 90 70-43 43-79-6 95 65-58 35-40-6 90 69-34v80Z"/></svg>
      <svg className="space-planet planet-one" viewBox="0 0 140 100"><circle cx="70" cy="50" r="32" fill="#d09aff" stroke="#302356" strokeWidth="4"/><path d="M45 34q23 12 47 5M40 51q28 14 58 6M49 71q18 7 34 4" fill="none" stroke="#a570dd" strokeWidth="7"/><ellipse cx="70" cy="54" rx="62" ry="14" fill="none" stroke="#ffc875" strokeWidth="8" transform="rotate(-20 70 54)"/></svg>
      <svg className="space-planet planet-two" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#78cbd4" stroke="#244364" strokeWidth="4"/><path d="m26 18 20 9-5 18 21 8 13-8 12 17-17 19-23-8-6-19-17 4-11-17Z" fill="#45a697"/><circle cx="70" cy="27" r="7" fill="#c8f5df"/></svg>
      <svg className="space-rocket" viewBox="0 0 100 150"><path d="m39 104 11 38 12-38" fill="#ffbd65"/><path d="m36 71-22 31 20-3m31-28 21 31-21-3" fill="#e989b5" stroke="#493164" strokeWidth="3"/><path d="M34 107Q22 50 50 9q29 41 16 98Z" fill="#f6f0ff" stroke="#493164" strokeWidth="4"/><path d="M36 35Q42 18 50 9q10 14 15 26Z" fill="#e989b5"/><circle cx="50" cy="57" r="12" fill="#7bcfee" stroke="#493164" strokeWidth="4"/></svg>
    </div>
    <header className="masthead"><a className="brand" href="/">Mini Duel<span className="brand-square">M</span></a><span className="edition">THE HEAD-TO-HEAD CROSSWORD</span><details className="theme-picker"><summary><Palette size={17}/> Themes</summary><div className="theme-options" role="group" aria-label="Site theme">{themes.map(t => <button key={t.id} aria-pressed={theme === t.id} onClick={event => { changeTheme(t.id); event.currentTarget.closest('details')?.removeAttribute('open'); }}><t.icon size={18}/>{t.name}{theme === t.id && <Check size={15}/>}</button>)}</div></details></header>
    <section className="title-row"><div><div className="eyebrow">QUICK PUZZLE. REAL COMPETITION.</div><h1>The Mini, with a rival.</h1></div><span className="mode-pill">1 VS 1 · CLASSIC</span></section>
    <nav className="mode-switch" aria-label="Match mode"><button aria-pressed={!room || room.mode === 'public'} disabled={busy || playing || countdown} onClick={() => void enter('public')}><Globe size={16}/> Public match</button><button aria-pressed={room?.mode === 'friends'} disabled={busy || playing || countdown} onClick={() => void enter('friends')}><Users size={16}/> Play with a friend</button><button aria-pressed={room?.mode === 'robot'} disabled={busy || playing || countdown} onClick={() => void enter('robot')}><Bot size={16}/> Robot</button><span>{room?.mode === 'friends' ? 'Private room · just the two of you' : room?.mode === 'robot' ? 'Beat the robot · solves in 30–45 seconds' : 'Match with the next player online'}</span></nav>
    {error && <div className="connection-error" role="alert"><WifiOff size={17}/><span>{error}</span></div>}
    <div className="arena"><section className="play-panel" aria-label="Crossword duel">
      <div className="score-strip"><div className="player-label"><b><span className="player-dot"/>You</b><small>{game?.player.name ?? 'Joining the arena…'}</small></div><div className="timer-block"><span className="clock" aria-label="Elapsed time">{time(room?.start ? (room.ended ?? now) - room.start : 0)}</span><small>{finished ? 'FINAL TIME' : playing ? 'RACE CLOCK' : 'READY WHEN YOU ARE'}</small></div><div className="player-label opponent-label"><b>{room?.opponent ? 'Opponent' : 'Opponent'}<span className="player-dot rival"/></b><small>{room?.opponent?.name ?? 'Finding a rival…'}</small></div></div>
      {!puzzle && !finished && !cancelled ? <div className="waiting-surface">
        <div className="mini-mark" aria-hidden="true">{Array.from({length:25},(_,i)=><span key={i} className={[0,4,20,24].includes(i)?'black':''}/>)}</div>
        <div className="eyebrow">{countdown ? 'MATCH FOUND' : room?.mode === 'friends' ? 'FRIENDS ROOM' : 'MATCHMAKING'}</div>
        <h2>{countdown ? 'Your rival is here.' : room?.mode === 'friends' ? 'Save a seat for your friend.' : 'Finding your next rival…'}</h2>
        <p>{countdown ? <>Get ready. Your puzzle opens together.</> : room?.mode === 'friends' ? <>Send this link to your friend.<br/>Your race starts when they join.</> : <>You’re in the waiting room.<br/>The next player to arrive joins your game.</>}</p>
        <div className="waiting-status" role="status">{countdown ? <b className="countdown">{Math.max(1, Math.ceil(((room?.start ?? now) - now) / 1000))}</b> : <><i/>{game ? room?.mode === 'friends' ? 'Waiting for your friend' : 'Waiting for one more player' : 'Connecting to the arena'}</>}</div>
        {!countdown && (room?.mode === 'friends' ? <div className="friend-invite"><label htmlFor="friend-link">Your private invite link</label><div><input id="friend-link" readOnly value={inviteUrl} onFocus={e => e.currentTarget.select()}/><button className="primary-button" onClick={copyLink}>{copied ? <Check size={16}/> : <Copy size={16}/>} {copied ? 'Copied!' : 'Copy link'}</button></div><p>Only two seats. Keep this link for your rematches.</p></div> : <button className="text-button invite" disabled={busy} onClick={() => void enter('friends')}>Play with a friend<ArrowRight size={15}/></button>)}
      </div> : <>
        {(finished || cancelled) && <div className={`result-banner ${room?.won ? 'win' : ''}`} role="status">
          {finished && <Trophy size={27}/>}<div><h2>{cancelled ? 'This duel was interrupted.' : room?.won ? 'You won the duel!' : 'Your rival got there first.'}</h2><p>{cancelled ? 'A player disconnected or the 15-minute limit was reached. No win was awarded.' : room?.won ? `Every letter correct. Solved in ${time((room.ended ?? now) - (room.start ?? now))}.` : `${room?.opponent?.name} solved the crossword in ${time((room?.ended ?? now) - (room?.start ?? now))}.`}</p></div>
          <button className="primary-button" onClick={() => void enter('replay')} disabled={busy || (room?.mode === 'friends' && room.ready)}><RotateCcw size={15}/>{busy ? 'Joining…' : room?.mode === 'friends' ? room.ready ? 'Waiting for your friend…' : 'OK, rematch' : 'Race again'}</button>
          {room?.mode === 'friends' && <p className="rematch-status">{room.ready ? 'You’re ready. The next race starts when your friend presses OK.' : room.opponentReady ? 'Your friend is ready. Press OK to race again.' : 'Another round? Both players must press OK to rematch.'}</p>}
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
      {puzzle && room?.opponent ? <section className="side-section opponent-section"><div className="eyebrow">ACROSS THE TABLE</div><h2>{room.opponent.name}</h2><div className="opponent-grid" aria-label={`${opponentFilled} of ${puzzle.total} opponent squares filled`}>{puzzle.blocks.map((block,i)=><span key={i} className={block?'block':room.progress[i]?'filled':''}/>)}</div><p className="muted">{opponentFilled} of {puzzle.total} squares filled.<br/>Their letters stay secret.</p></section> : <section className="side-section"><div className="eyebrow">HOW TO DUEL</div><h2>A little puzzle.<br/>A proper showdown.</h2><ol className="rules"><li><b>Meet your match</b><p>{room?.mode === 'friends' ? 'Share your private link with a friend.' : 'We pair you with the next player.'}</p></li><li><b>Race the same grid</b><p>Watch their progress as you solve.</p></li><li><b>Finish first</b><p>Every letter must be right to win.</p></li></ol></section>}
      {room?.mode === 'friends' && <section className="side-section leaderboard"><div className="eyebrow">THE LEADERBOARD</div><h2>Fast minds. Bragging rights.</h2>{game?.leaderboard.length ? <Table><TableHeader><TableRow><TableHead>Player</TableHead><TableHead>Wins</TableHead><TableHead>Best</TableHead></TableRow></TableHeader><TableBody>{game.leaderboard.map((p,i)=><TableRow key={i}><TableCell><span className="rank">{i+1}</span>{p.name}</TableCell><TableCell>{p.wins}</TableCell><TableCell>{p.best === null ? '—' : time(p.best)}</TableCell></TableRow>)}</TableBody></Table> : <p className="muted">{game ? 'The first duel starts the rankings. It could be yours.' : 'Rankings load when you connect.'}</p>}<p className="leaderboard-note">Ranked by wins in this friend room, then fastest solve.</p></section>}
    </aside></div>
  </main>;
}
