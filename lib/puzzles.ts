import generatedPuzzles from '../data/pop-culture-puzzles.json' with { type: 'json' };
export const puzzles = [
  {
    title: 'At the center',
    rows: ['HEART', 'EMBER', 'ABUSE', 'RESIN', 'TREND'],
    across: ['It beats inside your chest', 'A glowing bit left in a campfire', 'Mistreat or misuse', 'Sticky substance from a pine tree', 'A style that catches on'],
    down: ['The suit between diamonds and spades, alphabetically (singular)', 'A coal that is still glowing', 'Use in a harmful way', 'Material that traps insects in amber', 'Go viral, on social media'],
  },
  ...generatedPuzzles,
];
export type Clue = { number: number; text: string; cells: number[] };
export function puzzleDetails(index: number) {
  if (!Number.isInteger(index) || index < 0 || index >= puzzles.length) throw new Error('Unknown puzzle');
  const puzzle = puzzles[index];
  const solution = puzzle.rows.join('').split('');
  const numbers: Record<number, number> = {};
  const across: Clue[] = [], down: Clue[] = [];
  let number = 0;
  solution.forEach((letter, cell) => {
    if (letter === '#') return;
    const a = cell % 5 === 0 || solution[cell - 1] === '#';
    const d = cell < 5 || solution[cell - 5] === '#';
    if (!a && !d) return;
    numbers[cell] = ++number;
    for (const [starts, step, list, texts] of [[a, 1, across, puzzle.across], [d, 5, down, puzzle.down]] as const) {
      if (!starts) continue;
      const cells = [cell];
      for (let next = cell + step; next < 25 && solution[next] !== '#' && (step === 5 || next % 5 !== 0); next += step) cells.push(next);
      list.push({ number, text: texts[list.length], cells });
    }
  });
  return { solution, public: { title: puzzle.title, blocks: solution.map(x => x === '#'), numbers, across, down, total: solution.filter(x => x !== '#').length } };
}
