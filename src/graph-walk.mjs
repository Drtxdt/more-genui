// Each vertex is discovered once, even in a cycle. Detached components
// start a new band. Sorting is unnecessary: authored order breaks ties.
export function graphLayout(nodes, edges) {
  const outgoing=new Map(nodes.map(n=>[n.id,[]])), incoming=new Set();
  for(const {from,to} of edges) {outgoing.get(from).push(to);incoming.add(to);}
  const positions=new Map();
  let base=0,width=1;
  const ids=nodes.map(n=>n.id);
  for(const start of [...ids.filter(n=>!incoming.has(n)),...ids]) {
    if(positions.has(start)) continue;
    const queue=[[start,0]], queued=new Set([start]), counts=[];
    for(let i=0;i<queue.length;i++) {
      const [id,d]=queue[i],row=counts[d]??0;
      positions.set(id,[90+180*d,60+100*(base+row)]);
      counts[d]=row+1;width=Math.max(width,d+1);
      for(const next of outgoing.get(id))
        if(!queued.has(next)&&!positions.has(next)){queued.add(next);queue.push([next,d+1]);}
    }
    base+=Math.max(...counts);
  }
  return {positions,width:width*180,height:base*100+40};
}
export function graphPath(edges, from, to) {
  const seen=new Map([[from,null]]),queue=[from];
  for(let i=0;i<queue.length;i++){
    const n=queue[i];
    if(n===to){const path=[];for(let v=n;v!==null;v=seen.get(v))path.unshift(v);return path;}
    for(const edge of edges)if(edge.from===n&&!seen.has(edge.to)){seen.set(edge.to,n);queue.push(edge.to);}
  }
  return [];
}
