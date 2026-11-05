import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('examples', { recursive: true });
const app = (id, title, body, js) =>
  `<!-- more-genui: ${JSON.stringify({ version: 1, id, title, stateVersion: 1 })} -->\n<html><head><style>body{max-width:900px;margin:24px auto;padding:0 18px}h1{font-size:24px}label{display:flex;gap:12px;align-items:center;margin:14px 0}input{flex:1}svg{width:100%;height:240px;background:color-mix(in srgb,var(--accent) 5%,var(--bg));border-radius:12px}button{padding:8px 14px;margin:6px;border-radius:8px;border:1px solid #8886;background:var(--bg);color:var(--fg)}output{font-variant-numeric:tabular-nums}</style></head><body><h1>${title}</h1>${body}<script>${js}</script></body></html>`;
const wave = app(
  'sine-wave',
  '正弦波实验室',
  '<p>y = A sin(2πft)。观察振幅和频率如何改变波形。</p><label>振幅 <input id="amplitude" aria-label="振幅" type="range" min="0" max="2" step="0.1"><output id="a"></output></label><label>频率 <input id="frequency" aria-label="频率" type="range" min="0.5" max="5" step="0.5"><output id="f"></output></label><svg viewBox="0 0 800 240" role="img" aria-label="正弦波形"><path id="curve" fill="none" stroke="var(--accent)" stroke-width="3"/></svg>',
  `const s={amplitude:1,frequency:1,...genui.getState()};const amp=document.getElementById('amplitude'),freq=document.getElementById('frequency');amp.value=s.amplitude;freq.value=s.frequency;function draw(){s.amplitude=+amp.value;s.frequency=+freq.value;document.getElementById('a').textContent=s.amplitude;document.getElementById('f').textContent=s.frequency;document.getElementById('curve').setAttribute('d',Array.from({length:801},(_,x)=>(x?'L':'M')+x+','+(120-50*s.amplitude*Math.sin(x/800*2*Math.PI*s.frequency))).join(' '));genui.setState(s)}amp.addEventListener('input',draw);freq.addEventListener('input',draw);draw();`,
);
const spring = app(
  'spring',
  '弹簧振子',
  '<p>理想无阻尼系统，质量 m = 1 kg，初始位移 1 m，初速度 0。ω = √(k/m)。</p><label>刚度 k <input aria-label="刚度" id="stiffness" type="range" min="1" max="25" step="1"><output id="k"></output></label><label>时间 t <input aria-label="时间" id="time" type="range" min="0" max="10" step="0.05"><output id="t"></output></label><svg viewBox="0 0 800 240"><line x1="80" y1="120" x2="400" y2="120" stroke="var(--accent)" stroke-width="5" id="spring"/><circle id="mass" cx="400" cy="120" r="28" fill="var(--accent)"/></svg><output id="value"></output>',
  `const s={stiffness:4,time:0,...genui.getState()};const k=document.getElementById('stiffness'),t=document.getElementById('time');k.value=s.stiffness;t.value=s.time;function draw(){s.stiffness=+k.value;s.time=+t.value;const x=Math.cos(Math.sqrt(s.stiffness)*s.time),cx=450+200*x;document.getElementById('mass').setAttribute('cx',cx);document.getElementById('spring').setAttribute('x2',cx);document.getElementById('k').textContent=s.stiffness;document.getElementById('t').textContent=s.time;document.getElementById('value').textContent='位移 x = '+x.toFixed(3)+' m';genui.setState(s)}k.oninput=t.oninput=draw;draw();`,
);
const sort = app(
  'bubble-sort',
  '冒泡排序逐步演示',
  '<p>每步比较相邻两个数；逆序则交换。橙色表示当前比较位置。</p><svg viewBox="0 0 800 240" id="bars" role="img" aria-label="排序数组"></svg><button id="next">下一步</button><button id="restart">重新开始</button><output id="status"></output>',
  `const initial=[7,3,8,2,6,1,5,4];let s={values:[...initial],i:0,j:0,steps:0,...genui.getState()};function draw(){const svg=document.getElementById('bars');svg.replaceChildren();s.values.forEach((v,index)=>{const rect=document.createElementNS('http://www.w3.org/2000/svg','rect');rect.setAttribute('x',index*95+20);rect.setAttribute('y',230-v*25);rect.setAttribute('width',65);rect.setAttribute('height',v*25);rect.setAttribute('fill',index===s.j?'#d97706':'var(--accent)');svg.append(rect)});document.getElementById('status').textContent=s.i>=7?'排序完成：'+s.values.join(', '):'比较次数：'+s.steps;document.getElementById('next').disabled=s.i>=7;genui.setState(s)}document.getElementById('next').onclick=()=>{if(s.values[s.j]>s.values[s.j+1])[s.values[s.j],s.values[s.j+1]]=[s.values[s.j+1],s.values[s.j]];s.steps++;s.j++;if(s.j>=7-s.i){s.i++;s.j=0}draw()};document.getElementById('restart').onclick=()=>{s={values:[...initial],i:0,j:0,steps:0};draw()};draw();`,
);
for (const [name, source] of Object.entries({ wave, spring, sort }))
  await writeFile(`examples/${name}.html`, source);
