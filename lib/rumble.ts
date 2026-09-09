export type Power = 'freeze' | 'mirror' | 'check';
export type PowerState = {earned: number; used: number; frozenUntil: number; mirroredUntil: number; checked: string[]; order?: Power[]; robotDelay?: number};
export const powerBits: Record<Power,number> = {freeze:1,mirror:2,check:4};
export function readPowers(value: string): PowerState {
  return {earned:0,used:0,frozenUntil:0,mirroredUntil:0,checked:[],...JSON.parse(value)};
}
export function earnPowers(state: PowerState, answers: string[], solution: string[], random: () => number = Math.random): PowerState {
  const total = solution.filter(letter => letter !== '#').length;
  const correct = solution.filter((letter,i) => letter !== '#' && answers[i] === letter).length;
  const all: Power[] = ['freeze','mirror','check'];
  let order = state.order;
  if (!order) {
    const previous = all.filter(power => (state.earned | state.used) & powerBits[power]);
    const remaining = all.filter(power => !previous.includes(power));
    for (let i = remaining.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [remaining[i],remaining[j]] = [remaining[j],remaining[i]];
    }
    order = [...previous,...remaining];
  }
  let earned = state.earned;
  for (const [i,threshold] of [25,50,75].entries()) if (total > 0 && correct * 100 >= total * threshold) earned |= powerBits[order[i]];
  return {...state,earned,order};
}
export function checkedLetters(answers: string[], solution: string[]) {
  return solution.map((letter,i) => letter !== '#' && answers[i] && answers[i] !== letter ? answers[i] : '');
}

export function entryCells(cells: number[], mirrored: boolean) {
  return [...cells].sort((a,b) => mirrored ? b-a : a-b);
}
export function robotElapsed(start: number, now: number, powers: PowerState) {
  return Math.max(0,now-start-(powers.robotDelay ?? 0)+Math.max(0,powers.frozenUntil-now)+Math.max(0,powers.mirroredUntil-now)/2);
}

// #checked 9/9/2025
