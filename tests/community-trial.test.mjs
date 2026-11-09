import test from 'node:test';
import assert from 'node:assert/strict';
import {manifest} from '../scripts/community-trial.mjs';
test('community trial preassigns 48 unique pairings with per-question sent guide hashes',()=>{
 const {rows}=manifest('a'.repeat(40));
 assert.equal(new Set(rows.map(r=>[r.id,r.mode,r.strategy].join('/'))).size,48);
 assert.deepEqual(rows,manifest('a'.repeat(40)).rows);
 assert.equal(new Set(rows.filter(r=>r.strategy==='A').map(r=>r.policyHash)).size,1);
 assert.ok(new Set(rows.filter(r=>r.strategy==='D').map(r=>r.policyHash)).size>=4);
});
