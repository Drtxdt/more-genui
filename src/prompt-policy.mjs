import { LEGACY_GUIDE } from './legacy-guide.mjs';
export const FAST_GUIDE =
  '[More GenUI v1]\n简单定义、翻译、只要结果与短改写保持文字。对变换和对照优先 compare，有限条件切换用 switch，表格证据与冲突用 matrix，关系与状态用 state-diagram，过程用 stepper。适合观察时优先紧凑图解，避免整页应用。常见 UI 输出 Markdown 代码块：起始一行是三个反引号紧接 genui-json（或 genui-html），结束一行只有三个反引号；不能裸写、转义或改用普通 json/html。用户要改数值、分账或运行模拟，控件必须实际更新结果；静态对照不能代替输入。声明式卡片用严格 JSON，根对象须有 version:1,id:稳定英文ID,title,stateVersion:1 和 kind，与视图字段同级。例如 {"version":1,"id":"delta","title":"变化","stateVersion":1,"kind":"compare","before":{"label":"前","lines":["A"]},"after":{"label":"后","lines":["B"]}}。同一回答的文法卡可声明相同 group 共同更新。compare:{before:{label,lines:字符串数组},after:{label,lines:字符串数组},note可选}；matrix:{rows:行名数组,columns:列名数组,cells:[{row,column,text,explanation可选,conflict可选}]}；state-diagram:{nodes:[{id,label,explanation可选}],edges:[{id,from,to,label可选}],highlight:ID数组}；switch:{options:[{id,label,view:上述视图}]}。stepper:{steps:[{title,text,frame:上述视图}]}。grammar:{grammar:{start,productions:[{id,lhs,rhs:符号数组}]},input:终结符数组}，ε用空数组，由宿主计算 FIRST/FOLLOW/SELECT 与 LL(1)，不要硬编码结论。quiz:{questions:[{id,prompt,options:[{id,text,hint}],correct:正确选项ID,explanation}]}。多选指定type:multiple与正确ID数组；排序type:order；数值type:number与correct数值、tolerance、unit。lesson:{grammar可选,sections:[{title,view:上述视图}]}，子grammar省略grammar时共享课程文法。automaton 使用 states、start、accepting、edges:[{from,to,symbol}]，空边用 ε。顶层及各嵌套视图的 kind 和字段同级。嵌套不超过八层。所有字符串为纯文字，不含脚本、HTML或表达式。部件图 parts 的 parts:[{id,label,detail,x,y,outline:[[x,y]]}] 坐标 0–100；清单 checklist 的 items:[{id,label,detail}]；离线路线 route 的 stops:[{id,label,detail,coordinate可选:{lat,lon,source:HTTPS出处}}]，无依据就省略坐标。复杂计算模拟继续输出 genui-html，首行 <!-- more-genui: {"version":1,"id":"stable-id","title":"标题","stateVersion":1} --> 后接完整 <html>…</html>，使用离线 HTML/CSS/经典JS与 genui.getState()/setState()，禁止外部脚本和网络请求。只使用有助于当前任务的 UI，不强制普通回答生成 UI。\n[/More GenUI]';
const choice =
  '从读者的问题出发，自行决定用文字、静态关系、过程、实验或预测。三句话能讲清楚时直接回答。';
function taskGuide(question) {
  if (/一句话|一句話|简短定义/.test(question)) return '按所要求的长度直接作答。';
  let schema = '';
  if (/文法|FIRST|FOLLOW|产生式/i.test(question))
    schema = 'grammar:{grammar:{start,productions:[{id,lhs,rhs:符号数组}]},input:终结符数组}。ε 的 rhs 是 []。lesson 可放同一 grammar 和 sections:[{title,view}]，让读者预测、编辑、核对。';
  else if (/自动机|NFA|闭包/i.test(question))
    schema = 'automaton:{states:状态名数组,start,accepting:状态名数组,edges:[{from,to,symbol}]}，ε 边的 symbol 为 ε。';
  else if (/人数|采购|食材|人份|分账|小费|复利|储蓄|欧姆|用量/.test(question))
    schema = 'model:{inputs:[{id,label,kind:"slider"或"number-input",unit,min,max,step,value}],outputs:[{id,label,kind:"computed-value",unit,op,args:引用ID数组}],checklist:可复制的输出ID数组(可省略)}。单位 1、%、g、kg、CNY 等；op 用 add/sub/mul/div/convert/annuity 或 share。share 的 args 为总金额、各人权重，position 从 0 开始。公式不能内嵌；每人基准用量可作为有范围、有默认值的输入。';
  else if (/图表|分布|散点|直方图/.test(question))
    schema = 'chart:{style:"line"或"bar"或"scatter"或"histogram",xLabel,yLabel,points:[{x,y,group可选,low和high可选}]}。';
  else return '按解释需要选择纯文字或完整离线 genui-html 小实验，若选 HTML，请使用独立的具名 Markdown 围栏并将元数据注释放在内部。';
  return '只在有助于回答时输出顶层 genui-json 围栏，结束围栏独占一行。严格 JSON 根对象包含 version:1,id,title,stateVersion:1,kind 和对应字段。' + schema;
}
export function promptPolicy(strategy = 'A', question = '') {
  if (strategy === 'A') return LEGACY_GUIDE;
  const prefix = '[More GenUI v1]\n';
  if (strategy === 'D') return prefix + choice + '\n' + taskGuide(question) + '\n[/More GenUI]';
  if (strategy === 'B') return prefix + choice + '\n' + LEGACY_GUIDE.slice(LEGACY_GUIDE.indexOf('每个独立应用'));
  const formats = FAST_GUIDE.slice(FAST_GUIDE.indexOf('常见 UI 输出'));
  if (strategy === 'C') return prefix + choice + '\n' + formats;
  if (strategy === 'visual') return prefix + choice + '读者偏好可视化。\n' + formats;
  throw Error('未知策略');
}
export function composePolicy(prompt, strategy = 'A', kind = '') {
  if (prompt.includes('[More GenUI v1]')) return prompt;
  return (
    prompt +
    '\n\n' +
    promptPolicy(strategy, prompt).replace(
      '[/More GenUI]',
      ({
        diagram: '当前请求明确要求图解。',
        quiz: '当前请求明确要求预测题，可使用兼容 genui-html 的 genui.quiz.mount。',
        steps: '当前请求明确要求分步观察。',
      }[kind] ?? '') + '[/More GenUI]',
    )
  );
}
