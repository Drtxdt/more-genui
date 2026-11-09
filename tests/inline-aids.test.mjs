import test from 'node:test';
import assert from 'node:assert/strict';
import {localGrammar,fieldFailure} from '../src/inline-aids.mjs';
test('local analysis requires only productions, not a paragraph that mentions grammar',()=>{
 assert.equal(localGrammar('A → B C\nB → a | ε\nC → c').grammar.productions.length,4);
 assert.equal(localGrammar('例子：A → B。'),undefined);
 assert.equal(localGrammar('B → a ε'),undefined);
 assert.match(fieldFailure({issues:[{path:['inputs',1,'unit'],message:'invalid'}]}),/inputs.1.unit/);
});
