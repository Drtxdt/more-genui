import test from 'node:test';
import assert from 'node:assert/strict';
import {graphLayout,graphPath} from '../src/graph-walk.mjs';
test('layout separates cyclic and detached nodes; deleting a bridge changes reachability',()=>{
 const nodes=['end','b','a','alone'].map(id=>({id}));
 const edges=[{from:'a',to:'b'},{from:'b',to:'a'},{from:'b',to:'end'}];
 const p=graphLayout(nodes,edges);
 assert.equal(new Set([...p.positions.values()].map(String)).size,4);
 assert.deepEqual(graphPath(edges,'a','end'),['a','b','end']);
 assert.deepEqual(graphPath(edges.slice(0,2),'a','end'),[]);
});
