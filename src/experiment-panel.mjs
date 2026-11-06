function el(tag,text){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;}
function download(name,blob){
  const url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function csv(rows){
  return rows.map(row=>row.map(value=>{let s=String(value??'');if(typeof value==='string'&&/^\s*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}).join(',')).join('\r\n');
}
export function experimentPanel({app,repository,keysPromise,state,restore,png,status}){
  const panel=el('div'),name=el('input'),list=el('select'),tools=el('div'),comparison=el('div');
  panel.hidden=true;panel.style.cssText='padding:8px 12px';tools.style.cssText='display:flex;gap:6px;align-items:center;flex-wrap:wrap';
  name.placeholder='快照名称';name.setAttribute('aria-label','快照名称');list.setAttribute('aria-label','已存快照');
  let snapshots=[],data={},locked=null,loaded=false;
  const params=()=>Object.fromEntries(Object.entries(state()).filter(([k])=>!k.startsWith('__moreGenui')));
  const key=async()=>'mg:snapshots:'+ (await keysPromise).latest;
  const renderList=()=>{list.replaceChildren(...snapshots.map(s=>new Option(s.name,s.id)));};
  async function load(){if(!loaded){snapshots=await repository.storage.get(await key())??[];renderList();loaded=true;}}
  async function persist(next){await repository.storage.set(await key(),next);snapshots=next;renderList();}
  function button(text,fn){
    const b=el('button',text);b.type='button';b.onclick=async()=>{b.disabled=true;try{await load();await fn();}catch(e){status(String(e.message??e));}finally{b.disabled=false;}};tools.append(b);return b;
  }
  tools.append(name);
  button('保存快照',async()=>{
    const title=name.value.trim();if(!title)throw Error('请填写快照名称');
    if(snapshots.length>=24)throw Error('当前应用最多保存 24 个快照');
    const id=crypto.randomUUID();await persist([...snapshots,{id,name:title.slice(0,80),params:params(),metrics:data.metrics??[],series:data.series??[]}]);list.value=id;name.value='';
  });
  tools.append(list);
  const selected=()=>{const s=snapshots.find(s=>s.id===list.value);if(!s)throw Error('请选择快照');return s;};
  button('恢复',()=>restore(selected().params));
  button('删除',()=>persist(snapshots.filter(s=>s.id!==selected().id)));
  button('复制参数',()=>navigator.clipboard.writeText(JSON.stringify(params(),null,2)));
  button('导出 JSON',()=>download(app.id+'.json',new Blob([JSON.stringify(params(),null,2)],{type:'application/json'})));
  const rows=()=>{if(!Array.isArray(data.rows)||!data.rows.length||!data.rows.every(Array.isArray))throw Error('应用尚未登记表格');return csv(data.rows);};
  const copyCsv=button('复制 CSV',()=>navigator.clipboard.writeText(rows()));
  const csvButton=button('导出 CSV',()=>download(app.id+'.csv',new Blob(['\ufeff',rows()],{type:'text/csv;charset=utf-8'})));
  const pngButton=button('导出 PNG',async()=>download(app.id+'.png',await png()));
  const copyPng=button('复制 PNG',()=>navigator.clipboard.write([new ClipboardItem({'image/png':png()})]));
  panel.append(tools,comparison);
  function display(){copyCsv.hidden=csvButton.hidden=!data.rows?.length;copyPng.hidden=pngButton.hidden=!data.hasFigure;}
  display();
  return {panel,async toggle(){await load();panel.hidden=!panel.hidden;},update(value){data=value;display();},changed(){}, dispose(){}};
}
