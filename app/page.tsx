'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import mobileStyles from './mobile-game.module.css';
import { MilestonePopups } from '@/components/milestone-popups';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowRight, ArrowDown, Delete, Trophy, RotateCcw, WifiOff, Palette, Sun, Moon, Trees, Rocket, Users, Globe, Copy, Check, Bot, Compass } from 'lucide-react';

type Clue = { number: number; text: string; cells: number[] };
type Puzzle = { title: string; blocks: boolean[]; numbers: Record<number, number>; across: Clue[]; down: Clue[]; total: number };
type Game = { now: number; player: { name: string }; room: { id: string; mode: 'public' | 'friends' | 'robot'; robotDifficulty: 'novice' | 'intermediate' | null; invite: string | null; ready: boolean; opponentReady: boolean; status: string; start: number | null; ended: number | null; won: boolean; solved: boolean; opponent: { name: string; connected: boolean } | null; progress: boolean[]; answers: string[]; revision: number; puzzle: Puzzle | null }; incorrect: boolean; leaderboard: { name: string; wins: number; best: number | null }[] };
const time = (ms: number) => `${Math.floor(Math.max(0, ms) / 60000)}:${String(Math.floor(Math.max(0, ms) / 1000) % 60).padStart(2, '0')}`;
type Theme = 'classic' | 'dark' | 'jungle' | 'space' | 'western';
const themes = [{id:'classic', name:'Classic', icon:Sun}, {id:'dark', name:'Dark', icon:Moon}, {id:'jungle', name:'Jungle', icon:Trees}, {id:'space', name:'Space', icon:Rocket}, {id:'western', name:'Western', icon:Compass}] as const;
const empty = () => Array<string>(25).fill('');

export default function Home() {
  const [mobile, setMobile] = useState(false);
  const [game, setGame] = useState<Game | null>(null);
  const [answers, setAnswers] = useState<string[]>(empty);
  const [cell, setCell] = useState(0);
  const [direction, setDirection] = useState<'across' | 'down'>('across');
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState('');
  const [difficulty, setDifficulty] = useState<'novice' | 'intermediate'>('intermediate');
  const [busy, setBusy] = useState(false);
  const [theme, setTheme] = useState<Theme>('classic');
  const [inviteUrl, setInviteUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const live = useRef({ token: '', room: '', revision: 0, answers: empty(), dirty: false, offset: 0, pending: false, joined: false });
  const gameRef = useRef<Game | null>(null);
  const board = useRef<HTMLDivElement>(null);

  const sync = useCallback(async (action: 'join' | 'sync' | 'replay' | 'friends' | 'public' | 'robot' | 'robot-setup' = 'sync', difficulty?: 'novice' | 'intermediate') => {
    const state = live.current;
    if (action !== 'sync') while (state.pending) await new Promise(resolve => setTimeout(resolve, 50));
    if (state.pending || !state.token) return;
    state.pending = true;
    const revision = state.revision;
    const shouldSend = action === 'sync' && state.dirty && ['playing', 'finished'].includes(gameRef.current?.room.status ?? '');
    const sent = Date.now();
    try {
      const response = await fetch('/api/game', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${state.token}` },
        body: JSON.stringify({ action, ...(difficulty ? {difficulty} : {}), ...(action === 'join' && new URL(location.href).searchParams.has('friend') ? { invite: new URL(location.href).searchParams.get('friend') } : {}), ...(action === 'replay' ? {roomId: state.room} : {}), ...(shouldSend ? { roomId: state.room, answers: state.answers, revision } : {}) }),
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

  useEffect(() => {
    const query = window.matchMedia('(max-width: 700px)');
    const update = () => {
      setMobile(query.matches);
    };
    update();
    query.addEventListener('change', update);
    return () => {
      query.removeEventListener('change', update);
    };
  }, []);

  const focusGrid = useCallback(() => {
    board.current?.focus({preventScroll:true});
  }, []);

  const room = game?.room;
  const puzzle = room?.puzzle;
  const playing = room?.status === 'playing' && !!puzzle && now >= (room.start ?? Infinity);
  const canEdit = playing || (room?.status === 'finished' && !!puzzle && !room.won && !room.solved && !room.ready);
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
    focusGrid();
  }, [focusGrid]);
  function cycleClue(step: number) {
    if (!puzzle || !clue) return;
    const ordered = [...puzzle.across.map(clue => ({clue, dir:'across' as const})), ...puzzle.down.map(clue => ({clue, dir:'down' as const}))];
    const index = ordered.findIndex(item => item.dir === direction && item.clue.number === clue.number);
    const next = ordered[(index + step + ordered.length) % ordered.length];
    chooseClue(next.clue, next.dir);
  }

  const key = useCallback((value: string) => {
    if (!canEdit || !puzzle || !clue) return;
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
  }, [canEdit, puzzle, clue, cell, clues, direction, chooseClue, sync]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || !canEdit) return;
      const target = event.target as HTMLElement;
      if (['INPUT', 'TEXTAREA'].includes(target.tagName)) return;
      if (/^[a-z]$/i.test(event.key) || ['Backspace', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) || (board.current?.contains(target) && ['Enter', ' ', 'Tab'].includes(event.key))) {
        event.preventDefault(); key(event.key === 'Tab' && event.shiftKey ? 'BackTab' : event.key);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [key, canEdit]);

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
  async function enter(action: 'replay' | 'friends' | 'public' | 'robot' | 'robot-setup') {
    setBusy(true); await sync(action, action === 'robot' ? difficulty : undefined); setBusy(false);
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(inviteUrl); setCopied(true); setTimeout(() => setCopied(false), 2500); }
    catch { setError('Select and copy the friend link below.'); }
  }

  return <main className={playing || finished ? 'live-race' : undefined}>

    <div className="theme-scenery" aria-hidden="true">
      <div className="space-sky"/>
      <div className="jungle-scenery"/>
      <div className="western-scenery"/>
    </div>
    <header className="masthead"><a className="brand" href="/">Mini Duel<img className="brand-icon" src="/crossword-icon.svg" width="40" height="40" alt="" aria-hidden="true"/></a><span className="edition">THE HEAD-TO-HEAD CROSSWORD</span><details className="theme-picker"><summary><Palette size={17}/> Themes</summary><div className="theme-options" role="group" aria-label="Site theme">{themes.map(t => <button key={t.id} aria-pressed={theme === t.id} onClick={event => { changeTheme(t.id); event.currentTarget.closest('details')?.removeAttribute('open'); }}><t.icon size={18}/>{t.name}{theme === t.id && <Check size={15}/>}</button>)}</div></details></header>
    <section className="title-row"><div><div className="eyebrow">QUICK PUZZLE. REAL COMPETITION.</div><h1>The Mini, with a rival.</h1></div><span className="mode-pill">1 VS 1 · CLASSIC</span></section>
    <nav className="mode-switch" aria-label="Match mode"><button aria-pressed={!room || room.mode === 'public'} disabled={busy || playing || countdown} onClick={() => void enter('public')}><Globe size={16}/> Public match</button><button aria-pressed={room?.mode === 'friends'} disabled={busy || playing || countdown} onClick={() => void enter('friends')}><Users size={16}/> Play with a friend</button><button aria-pressed={room?.mode === 'robot'} disabled={busy || playing || countdown} onClick={() => void enter('robot-setup')}><Bot size={16}/> Robot</button><span>{room?.mode === 'friends' ? 'Private room · just the two of you' : room?.mode === 'robot' ? 'Practice against the robot' : 'Match with the next player online'}</span></nav>
    {error && <div className="connection-error" role="alert"><WifiOff size={17}/><span>{error}</span></div>}
    <div className="arena"><section className="play-panel" aria-label="Crossword duel">
      <div className="score-strip"><div className="player-label"><b><span className="player-dot"/>You</b><small>{game?.player.name ?? 'Joining the arena…'}</small></div><div className="timer-block"><span className="clock" aria-label="Elapsed time">{time(room?.start ? (room.ended ?? now) - room.start : 0)}</span><small>{finished ? 'FINAL TIME' : playing ? 'RACE CLOCK' : 'READY WHEN YOU ARE'}</small></div><div className="player-label opponent-label"><b>{room?.opponent ? 'Opponent' : 'Opponent'}<span className="player-dot rival"/></b><small>{room?.opponent?.name ?? 'Finding a rival…'}</small></div></div>
      {room?.mode === 'robot' && room.status === 'waiting' ? <div className="waiting-surface robot-setup"><div className="robot-setup-content">
        <Bot size={38} aria-hidden="true"/>
        <div className="eyebrow">ROBOT PRACTICE</div><h2>Choose your challenge.</h2>
        <p>Pick a pace, then start your race.</p>
        <fieldset className="difficulty-options"><legend>Robot difficulty</legend><div className="difficulty-cards">
          {([{id:'novice',name:'Novice',description:'A little more breathing room'}, {id:'intermediate',name:'Intermediate',description:'A quicker challenger'}] as const).map(level => <label key={level.id} className={difficulty === level.id ? 'chosen' : ''}><input type="radio" name="difficulty" value={level.id} checked={difficulty === level.id} onChange={() => setDifficulty(level.id)}/><span><b>{level.name}</b><small>{level.description}</small></span></label>)}
        </div></fieldset>
        <button className="primary-button" disabled={busy} onClick={() => void enter('robot')}>Start race<ArrowRight size={16}/></button>
      </div></div> : !puzzle && !finished && !cancelled ? <div className="waiting-surface">
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
          {finished && !room?.won && <p className="continue-note">{room?.solved ? 'Puzzle complete. Nicely done!' : 'Keep solving at your own pace, or choose another race.'}</p>}
          <button className="text-button" disabled={busy} onClick={() => void enter('public')}>Back to lobby</button>
          {room?.mode === 'friends' && <p className="rematch-status">{room.ready ? 'You’re ready. The next race starts when your friend presses OK.' : room.opponentReady ? 'Your friend is ready. Press OK to race again.' : 'Another round? Both players must press OK to rematch.'}</p>}
        </div>}
        {puzzle && <><div className="puzzle-edition">{puzzle.title}<span>Original Mini Duel puzzle</span></div><div className="race-progress"><div><div className="progress-label"><b>Your grid</b><span>{filled}/{puzzle.total}</span></div><Progress value={filled / puzzle.total * 100} aria-label="Your filled squares"/></div><div className="rival-progress"><div className="progress-label"><b>Their grid</b><span>{opponentFilled}/{puzzle.total}</span></div><Progress value={opponentFilled / puzzle.total * 100} aria-label="Opponent filled squares"/></div></div>
        <div className="puzzle-area"><div className="grid-column"><div className="active-clue"><b>{clue?.number}{direction === 'across' ? 'A' : 'D'}</b><span>{clue?.text}</span><button aria-label="Switch direction" onClick={() => setDirection(d => d === 'across' ? 'down' : 'across')}>{direction === 'across' ? <ArrowRight size={20}/> : <ArrowDown size={20}/>}</button></div>
          <div className="board-wrap">
    {!mobile && <MilestonePopups roomId={room?.id ?? ''} active={playing} total={puzzle?.total ?? 0} yours={filled} theirs={opponentFilled}/>}
          <div ref={board} className="crossword" role="group" aria-label="Crossword grid. Type letters, use arrows to move, Enter to switch direction, and Tab to change clues." tabIndex={0}>
            {puzzle.blocks.map((blocked, i) => blocked ? <div className="square block" key={i}/> : <button key={i} tabIndex={-1} disabled={!canEdit} aria-label={`Row ${Math.floor(i / 5) + 1}, column ${i % 5 + 1}${puzzle.numbers[i] ? `, clue ${puzzle.numbers[i]}` : ''}, ${answers[i] || 'empty'}`} aria-pressed={cell === i} className={`square ${clue?.cells.includes(i) ? 'word-selected' : ''} ${cell === i ? 'selected' : ''}`} onClick={() => { if (cell === i) setDirection(d => d === 'across' ? 'down' : 'across'); setCell(i); focusGrid(); }}><small>{puzzle.numbers[i]}</small><span>{answers[i]}</span></button>)}
          </div>
          </div>
          {mobile && <div className={mobileStyles.clueBar} aria-label="Clue navigation">
            <button className={mobileStyles.clueText} aria-label="Current clue. Tap for next clue" onMouseDown={event => event.preventDefault()} onClick={() => cycleClue(1)}><b>{clue?.number} {direction === 'across' ? 'Across' : 'Down'}</b><span>{clue?.text}</span></button>
          </div>}
          <div className="grid-message" role="status">{game?.incorrect && filled === puzzle.total && canEdit ? 'The grid is full, but something’s not right. Keep going!' : playing ? 'Fill every square correctly to win.' : room?.solved && !room.won ? 'Puzzle complete. Nicely done!' : ''}</div>
          <div className="keyboard" aria-label="Letter keyboard">{['QWERTYUIOP','ASDFGHJKL','ZXCVBNM'].map((row,i)=><div className="key-row" key={row}>{i === 2 && <button disabled={!canEdit} aria-label="Switch across and down" onClick={()=>key('Enter')}><ArrowRight size={17}/></button>}{row.split('').map(letter=><button disabled={!canEdit} key={letter} onClick={()=>key(letter)}>{letter}</button>)}{i === 2 && <button disabled={!canEdit} aria-label="Backspace" onClick={()=>key('Backspace')}><Delete size={18}/></button>}</div>)}</div>
        </div><div className="clue-lists">{(['across','down'] as const).map(dir=><section key={dir}><h3>{dir}</h3>{puzzle[dir].map(c=><button className={direction === dir && clue?.number === c.number ? 'clue-active' : ''} key={c.number} onClick={()=>chooseClue(c, dir)}><b>{c.number}</b><span>{c.text}</span></button>)}</section>)}</div></div></>}
      </>}
    </section><aside className="sidebar">
      {puzzle && room?.opponent ? <section className="side-section opponent-section"><div className="eyebrow">ACROSS THE TABLE</div><h2>{room.opponent.name}</h2><div className="opponent-grid" aria-label={`${opponentFilled} of ${puzzle.total} opponent squares filled`}>{puzzle.blocks.map((block,i)=><span key={i} className={block?'block':room.progress[i]?'filled':''}/>)}</div><p className="muted">{opponentFilled} of {puzzle.total} squares filled.<br/>Their letters stay secret.</p></section> : <section className="side-section"><div className="eyebrow">HOW TO DUEL</div><h2>A little puzzle.<br/>A proper showdown.</h2><ol className="rules"><li><b>Meet your match</b><p>{room?.mode === 'friends' ? 'Share your private link with a friend.' : room?.mode === 'robot' ? 'Choose a difficulty and start your race.' : 'We pair you with the next player.'}</p></li><li><b>Race the same grid</b><p>Watch their progress as you solve.</p></li><li><b>Finish first</b><p>Every letter must be right to win.</p></li></ol></section>}
      {room?.mode === 'friends' && <section className="side-section leaderboard"><div className="eyebrow">THE LEADERBOARD</div><h2>Fast minds. Bragging rights.</h2>{game?.leaderboard.length ? <Table><TableHeader><TableRow><TableHead>Player</TableHead><TableHead>Wins</TableHead><TableHead>Best</TableHead></TableRow></TableHeader><TableBody>{game.leaderboard.map((p,i)=><TableRow key={i}><TableCell><span className="rank">{i+1}</span>{p.name}</TableCell><TableCell>{p.wins}</TableCell><TableCell>{p.best === null ? '—' : time(p.best)}</TableCell></TableRow>)}</TableBody></Table> : <p className="muted">{game ? 'The first duel starts the rankings. It could be yours.' : 'Rankings load when you connect.'}</p>}<p className="leaderboard-note">Ranked by wins in this friend room, then fastest solve.</p></section>}
    </aside></div>
  </main>;
}
