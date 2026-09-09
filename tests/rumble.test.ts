import test from 'node:test';
import assert from 'node:assert/strict';
import {readPowers,earnPowers,powerBits} from '../lib/rumble.ts';

test('random rewards can start with each power and persist without rerolling', () => {
  const solution = ['A','B','C','D'];
  const starts = new Set<string>();
  for (const draws of [[0,0],[0.5,0],[0.99,0.99]]) {
    let n = 0;
    const first = earnPowers(readPowers('{}'),['A','','',''],solution,()=>draws[n++]);
    starts.add(first.order![0]);
    assert.equal(first.earned,powerBits[first.order![0]]);
    assert.equal(new Set(first.order).size,3);
    const half = earnPowers({...first,used:first.earned},['A','B','',''],solution,()=>{throw new Error('Rerolled');});
    assert.equal(half.earned,powerBits[first.order![0]]|powerBits[first.order![1]]);
    const full = earnPowers(half,['A','B','C',''],solution);
    assert.equal(full.earned,7);
    assert.equal(full.used,first.earned);
    assert.deepEqual(earnPowers(full,[],solution),full);
  }
  assert.equal(starts.size,3);
});

test('legacy earned powers remain earned without granting an extra early reward', () => {
  const old = readPowers('{"earned":1,"used":1}');
  const state = earnPowers(old,['A','','',''],['A','B','C','D'],()=>0);
  assert.equal(state.earned,1);
  assert.equal(state.used,1);
  assert.equal(state.order![0],'freeze');
  assert.equal(earnPowers(state,['A','B','C',''],['A','B','C','D']).earned,7);
});

test('wrong answers and empty grids grant no powers', () => {
  assert.equal(earnPowers(readPowers('{}'),['X','X','X','X'],['A','B','C','D']).earned,0);
  assert.equal(earnPowers(readPowers('{}'),[],[]).earned,0);
});
