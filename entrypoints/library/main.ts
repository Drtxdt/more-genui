import { mountSurface } from '../../src/surface';
import { StateRepository } from '../../src/state.mjs';
type Meta = {id:string;title:string;route:string;tags:string[];at:number};
const list=document.querySelector('#list')!,card=document.querySelector<HTMLElement>('#card')!,
  query=document.querySelector<HTMLInputElement>('#query')!,status=document.querySelector('#status')!;
let entries: Meta[] = [], open: ReturnType<typeof mountSurface> | undefined, active='', revision=0;
function show() {
  list.replaceChildren();
  for(const m of entries.filter(m=>[m.title,...m.tags].join(' ').toLocaleLowerCase().includes(query.value.toLocaleLowerCase()))) {
    const li=document.createElement('li');
    const button=(name:string, action:()=>Promise<void>)=>{
      const b=document.createElement('button'); b.textContent=name; b.onclick=()=>action().catch(e=>status.textContent=String(e.message));li.append(b);
    };
    button(m.title,async()=>{
      const ticket=++revision;
      const key='mg:card:'+m.id, item=(await chrome.storage.local.get(key))[key] as {source:string;state:Record<string,unknown>}|undefined;
      if(ticket!==revision || !item)return;
      open?.dispose();active=m.id;
      const repo=new StateRepository({get:async()=>item.state,set:async(k:string,value:Record<string,unknown>)=>{
        if(!k.startsWith('mg:state:') || !entries.some(e=>e.id===m.id))return;
        item.state=value;await chrome.storage.local.set({[key]:item});
      }});
      open=mountSurface(card,{scope:'bookmark',instance:m.id,source:item.source,repository:repo,
        sandboxUrl:chrome.runtime.getURL('sandbox.html'),draft:text=>{status.textContent=text;},repair:text=>{status.textContent=text;}});
      status.textContent='来自 DeepSeek：'+m.route;
    });
    const tags=document.createElement('input'); tags.setAttribute('aria-label',m.title+'的标签');tags.value=m.tags.join(' ');li.append(tags);
    button('保存标签',async()=>{m.tags=tags.value.trim().split(/\s+/).filter(Boolean).slice(0,12).map(s=>s.slice(0,48));await chrome.storage.local.set({['mg:bookmark:'+m.id]:m});show();});
    button('删除收藏',async()=>{revision++;entries=entries.filter(e=>e.id!==m.id);if(active===m.id){open?.dispose();open=undefined;active='';}
      await chrome.storage.local.remove(['mg:bookmark:'+m.id,'mg:card:'+m.id]);show();});
    list.append(li);
  }
  if(!list.children.length)status.textContent='没有找到收藏。';
}
query.oninput=show;
void (async()=>{const keys=(await chrome.storage.local.getKeys()).filter(k=>k.startsWith('mg:bookmark:'));
  entries=(Object.values(await chrome.storage.local.get<Record<string,Meta>>(keys)) as Meta[]).sort((a,b)=>b.at-a.at);show();})();
