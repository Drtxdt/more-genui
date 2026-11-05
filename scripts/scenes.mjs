import { writeFile } from 'node:fs/promises';
export const scenes = [
  {
    id: 'data-exploration',
    title: '数据筛选与汇总',
    body: '<p class="muted">样本值：10、20、30、40；筛选后重新计算。</p><label>最低值<input id="value" type="number" value="0"></label><output id="result" aria-live="polite"></output><svg id="plot" viewBox="0 0 400 100" role="img" aria-label="筛选后的数值"></svg>',
    js: `function update(){const v=Number(input.value),a=[10,20,30,40].filter(x=>x>=v);result.textContent=a.length?'数量 '+a.length+'，均值 '+a.reduce((s,x)=>s+x,0)/a.length:'没有符合条件的数据';document.getElementById('plot').innerHTML=a.map((x,i)=>'<rect x="'+i*95+'" y="'+(100-x*2)+'" width="60" height="'+x*2+'" fill="var(--chart-1)"/>').join('');genui.setState({value:input.value})}`,
    checks: [
      ['0', '数量 4，均值 25'],
      ['25', '数量 2，均值 35'],
      ['41', '没有符合条件的数据'],
    ],
  },
  {
    id: 'decision-comparison',
    title: '通勤方案比较',
    body: '<p class="muted">公交：省钱 90 / 省时 40；地铁：省钱 60 / 省时 80。分值为演示假设。</p><label>省钱权重（%，其余为省时）<input id="value" type="range" min="0" max="100" value="50"></label><output id="result" aria-live="polite"></output>',
    js: `function update(){const w=Math.max(0,Math.min(100,Number(input.value)))/100,a=90*w+40*(1-w),b=60*w+80*(1-w);result.textContent='公交 '+a.toFixed(1)+' / 地铁 '+b.toFixed(1)+'；'+(Math.abs(a-b)<1e-9?'并列':a>b?'公交领先':'地铁领先');genui.setState({value:input.value})}`,
    checks: [
      ['50', '公交 65.0 / 地铁 70.0；地铁领先'],
      ['100', '公交 90.0 / 地铁 60.0；公交领先'],
      ['0', '公交 40.0 / 地铁 80.0；地铁领先'],
    ],
  },
  {
    id: 'algorithm-steps',
    title: '二分查找',
    body: '<p class="muted">有序数组：[1, 3, 5, 7, 9]。修改目标后从第一步开始。</p><label>查找目标<input id="value" type="number" value="7"></label><button id="next">下一步</button><output id="result" aria-live="polite"></output>',
    js: `const a=[1,3,5,7,9];let lo=0,hi=4,done=false;function draw(){result.textContent=done?result.textContent:'候选下标 ['+lo+', '+hi+']';genui.setState({value:input.value})}function update(){lo=0;hi=4;done=false;document.getElementById('next').disabled=false;draw()}document.getElementById('next').onclick=()=>{if(done)return;const mid=Math.floor((lo+hi)/2),v=Number(input.value);if(a[mid]===v){result.textContent='找到：下标 '+mid;done=true}else{if(a[mid]<v)lo=mid+1;else hi=mid-1;if(lo>hi){result.textContent='未找到';done=true}}document.getElementById('next').disabled=done;draw()}`,
    checks: [
      ['7', '找到：下标 3'],
      ['0', '未找到'],
      ['9', '找到：下标 4'],
    ],
    steps: 4,
  },
  {
    id: 'knowledge-map',
    title: 'HTTP 缓存关系',
    body: '<svg viewBox="0 0 620 150" role="img" aria-label="缓存新鲜则直接使用；过期后验证，未修改返回304，已修改返回200"><g fill="none" stroke="var(--border)" stroke-width="2"><path d="M140 65H240M350 65H450M350 65V125H450"/></g><g fill="var(--fg)" font-size="15"><text x="10" y="70">检查缓存新鲜度</text><text x="240" y="40">新鲜 → 直接使用</text><text x="240" y="70">过期 → 验证</text><text x="450" y="70">未修改 → 304</text><text x="450" y="130">已修改 → 200</text></g></svg><p class="muted">简化模型：假设允许存储，且服务器支持条件请求。no-store 等限制需另外判断。</p>',
    js: '',
    checks: [],
  },
  {
    id: 'time-planning',
    title: '学习时间安排',
    body: '<p class="muted">从 08:00 开始，连续安排 3 个学习块，每块后休息 10 分钟（末块除外）。不跨日。</p><label>每块学习分钟<input id="value" type="number" min="1" max="300" value="25"></label><output id="result" aria-live="polite"></output>',
    js: `function update(){const v=Number(input.value);if(!Number.isInteger(v)||v<1||v>300){result.textContent='请输入 1–300 的整数';return}const end=480+v*3+20;result.textContent='结束时间 '+String(Math.floor(end/60)).padStart(2,'0')+':'+String(end%60).padStart(2,'0')+'；学习 '+v*3+' 分钟';genui.setState({value:input.value})}`,
    checks: [
      ['25', '结束时间 09:35；学习 75 分钟'],
      ['1', '结束时间 08:23；学习 3 分钟'],
      ['0', '请输入 1–300 的整数'],
    ],
  },
  {
    id: 'practical-calculator',
    title: '墙面涂料估算',
    body: '<p class="muted">墙面 30 m²，门窗 6 m²，刷 2 遍。忽略损耗，整升向上取整。</p><label>每升每遍覆盖面积（m²/L）<input id="value" type="number" min="0.1" step="0.1" value="10"></label><output id="result" aria-live="polite"></output>',
    js: `function update(){const v=Number(input.value);result.textContent=Number.isFinite(v)&&v>0?'理论用量 '+(48/v).toFixed(2)+' L；需购买 '+Math.ceil(48/v)+' L':'覆盖面积必须大于 0';if(v>0)genui.setState({value:input.value})}`,
    checks: [
      ['10', '理论用量 4.80 L；需购买 5 L'],
      ['12', '理论用量 4.00 L；需购买 4 L'],
      ['0', '覆盖面积必须大于 0'],
    ],
  },
];
export function sceneHTML(scene) {
  const js = scene.js
    ? `const input=document.getElementById('value'),result=document.getElementById('result');input.value=genui.getState().value??input.value;${scene.js};input.oninput=update;update();`
    : '';
  return `<!-- more-genui: ${JSON.stringify({ version: 1, id: scene.id, title: scene.title, stateVersion: 1 })} -->\n<html><body><div class="stack">${scene.body}</div>${js ? '<script>' + js + '</script>' : ''}</body></html>\n`;
}
if (process.argv[1]?.endsWith('scenes.mjs'))
  for (const scene of scenes) await writeFile('examples/' + scene.id + '.html', sceneHTML(scene));
