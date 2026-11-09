export function localGrammar(text) {
  if (text.length>8192) return;
  const productions=[];
  for(const line of text.trim().split(/\r?\n/)) {
    const m=/^\s*([A-Za-z][A-Za-z0-9_']*)\s*(?:→|->)\s*([^→]+?)\s*$/.exec(line);
    if(!m)return;
    for(const alt of m[2].split('|')){
      const rhs=alt.trim().split(/\s+/);
      if(!rhs.every(t=>/^(?:[A-Za-z][A-Za-z0-9_']*|ε|[()+*/-])$/.test(t))||
        (rhs.includes('ε')&&rhs.length!==1)||productions.length>=128)return;
      productions.push({id:'p'+productions.length,lhs:m[1],rhs:rhs[0]==='ε'?[]:rhs});
    }
  }
  if(productions.length) return {version:1,id:'local-grammar',title:'这段文法的推导',stateVersion:1,kind:'grammar',grammar:{start:productions[0].lhs,productions},input:[]};
}
export function fieldFailure(error) {
  const issue=error?.issues?.[0];
  return String(issue ? (issue.path.join('.')||'根对象')+'：'+issue.message : error?.message||error).slice(0,360);
}
