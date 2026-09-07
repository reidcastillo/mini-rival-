import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const dictionary = JSON.parse(readFileSync(new URL('../data/pop-culture-words.json', import.meta.url), 'utf8'));
const destination = new URL('../data/pop-culture-puzzles.json', import.meta.url);
const requested = Number(process.argv[2] ?? 100);
if (!Number.isInteger(requested) || requested < 1 || requested > 500) throw new Error('Choose 1–500 puzzles.');
const byLength = new Map();
for (const [answer, clue] of Object.entries(dictionary)) {
  if (!/^[A-Z]{3,5}$/.test(answer) || typeof clue !== 'string' || !clue.trim()) throw new Error(`Invalid entry: ${answer}`);
  const list = byLength.get(answer.length) ?? []; list.push(answer); byLength.set(answer.length, list);
}
let state = 832719;
const random = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296; };
const shuffled = list => [...list].sort(() => random() - .5);
const masks = [ ['##...','##...','.....','...##','...##'], ['...##','...##','.....','##...','##...'] ];
function slotsFor(mask) {
  const grid = mask.join('').split(''); const slots = []; let number = 0;
  for (let i = 0; i < 25; i++) {
    if (grid[i] === '#') continue;
    const a = i % 5 === 0 || grid[i - 1] === '#'; const d = i < 5 || grid[i - 5] === '#';
    if (!a && !d) continue;
    number++;
    for (const [starts, step, direction] of [[a,1,'across'],[d,5,'down']]) {
      if (!starts) continue;
      const cells = [i];
      for (let n = i + step; n < 25 && grid[n] !== '#' && (step === 5 || n % 5 !== 0); n += step) cells.push(n);
      slots.push({cells, number, direction});
    }
  }
  return slots;
}
const existing = (() => { try { return JSON.parse(readFileSync(destination, 'utf8')); } catch { return []; } })();
const results = [...existing]; const seen = new Set(results.map(p => p.rows.join('')));
let attempts = 0;
while (results.length < requested && attempts++ < 10000) {
  const mask = masks[attempts % masks.length], slots = slotsFor(mask), grid = mask.join('').split('');
  const used = new Set(), assigned = new Map(); let nodes = 0;
  function solve() {
    if (++nodes > 12000) return false;
    if (assigned.size === slots.length) return !seen.has(grid.join(''));
    let selected, candidates;
    for (const slot of slots) {
      if (assigned.has(slot)) continue;
      const options = (byLength.get(slot.cells.length) ?? []).filter(word => !used.has(word) && slot.cells.every((c,i) => grid[c] === '.' || grid[c] === word[i]));
      if (!options.length) return false;
      if (!candidates || options.length < candidates.length) { selected = slot; candidates = options; }
    }
    for (const word of shuffled(candidates)) {
      const previous = selected.cells.map(c => grid[c]);
      selected.cells.forEach((c,i) => grid[c] = word[i]); used.add(word); assigned.set(selected,word);
      if (solve()) return true;
      selected.cells.forEach((c,i) => grid[c] = previous[i]); used.delete(word); assigned.delete(selected);
    }
    return false;
  }
  if (!solve()) continue;
  const rows = Array.from({length:5},(_,r) => grid.slice(r*5,r*5+5).join(''));
  const sort = dir => slots.filter(s => s.direction === dir).sort((a,b) => a.number-b.number).map(s => dictionary[assigned.get(s)]);
  const id = createHash('sha256').update(rows.join('')).digest('hex').slice(0,12);
  results.push({ id: `pop-${id}`, title: 'Pop Culture Mix', rows, across: sort('across'), down: sort('down') });
  seen.add(rows.join(''));
}
if (results.length < requested) throw new Error(`Only ${results.length} valid grids found; expand the word library. No output changed.`);
writeFileSync(destination, JSON.stringify(results,null,2)+'\n');
console.log(`Saved ${results.length} unique puzzles to ${fileURLToPath(destination)}. Existing puzzle order preserved.`);
