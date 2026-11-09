import assert from 'node:assert/strict';
import test from 'node:test';
import {analyzeGrammar} from '../src/grammar.mjs';
test('nullable propagation provides finite rule evidence, invalidated after deletion',()=>{
 const productions=[['A',['B','C']],['B',['a']],['B',[]],['C',['c']]].map(([lhs,rhs],i)=>({id:'p'+i,lhs,rhs}));
 const analyze=ps=>analyzeGrammar({start:'A',productions:ps});
 const e=analyze(productions).evidence, key=(...v)=>JSON.stringify(v);
 assert.deepEqual(e[key('FIRST','A','c')],{rule:'p0',via:[key('FIRST','B','ε'),key('FIRST','C','c')]});
 assert.equal(e[key('FIRST','B','ε')].rule,'p2');
 assert.equal(e[key('FOLLOW','B','c')].rule,'p0');
 assert.equal(analyze(productions.filter(p=>p.id!=='p2')).evidence[key('FIRST','A','c')],undefined);
});
