'use client';

import { useEffect, useRef, useState } from 'react';

type Milestone = { room: string; side: 'you' | 'opponent'; percent: number };
type Props = { roomId: string; active: boolean; total: number; yours: number; theirs: number };
const thresholds = [25, 50, 75];

export function MilestonePopups({roomId, active, total, yours, theirs}: Props) {
  const seen = useRef({room: '', you: 0, opponent: 0});
  const [queue, setQueue] = useState<Milestone[]>([]);

  useEffect(() => {
    if (seen.current.room !== roomId) {
      seen.current = {room: roomId, you: 0, opponent: 0};
      setQueue([]);
    }
    if (!active || total <= 0) {
      setQueue(current => current.length ? [] : current);
      return;
    }
    const additions: Milestone[] = [];
    for (const [side, filled] of [['you', yours], ['opponent', theirs]] as const) {
      const percent = filled / total * 100;
      for (const threshold of thresholds) {
        if (percent >= threshold && seen.current[side] < threshold) {
          additions.push({room: roomId, side, percent: threshold});
          seen.current[side] = threshold;
        }
      }
    }
    if (additions.length) setQueue(current => [...current, ...additions]);
  }, [roomId, active, total, yours, theirs]);

  const current = queue[0];
  useEffect(() => {
    if (!current) return;
    const timeout = setTimeout(() => setQueue(items => items.slice(1)), 2400);
    return () => clearTimeout(timeout);
  }, [current]);

  return <div className="milestone-region" role="status" aria-live="polite" aria-atomic="true">
    {active && current?.room === roomId && <div key={`${current.room}-${current.side}-${current.percent}`} className={`milestone-popup ${current.side}`}>
      <span className="milestone-percent" aria-hidden="true">{current.percent}%</span>
      <div><strong>{current.side === 'you' ? `You’ve filled ${current.percent}%!` : `Your opponent has filled ${current.percent}%!`}</strong><span>{current.side === 'you' ? current.percent === 75 ? 'The finish is in sight.' : current.percent === 50 ? 'Halfway there. Keep going!' : 'You’re off to a great start.' : current.percent === 75 ? 'They’re closing in on the finish.' : current.percent === 50 ? 'They’re halfway through their grid.' : 'The race is on.'}</span></div>
    </div>}
  </div>;
}
