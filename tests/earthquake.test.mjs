import assert from 'node:assert/strict';
import test from 'node:test';
import {parseEarthquakes} from '../src/earthquake.mjs';
test('offline earthquake snapshot retains data time, rejects invalid geometry and drops untrusted links',()=>{
 const f={id:'us01',properties:{place:'test',mag:5,url:'https://example.org'},geometry:{type:'Point',coordinates:[140,38,20]}};
 const feed={type:'FeatureCollection',metadata:{generated:12345},features:[f]};
 assert.deepEqual(parseEarthquakes(feed),{at:12345,events:[{id:'us01',place:'test',mag:5,lon:140,lat:38}]});
 f.geometry.coordinates[1]=100;
 assert.throws(()=>parseEarthquakes(feed));
});
