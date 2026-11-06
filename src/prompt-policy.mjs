import { LEGACY_GUIDE } from './legacy-guide.mjs';
export const FAST_GUIDE =
  '[More GenUI v1]\n简单定义、翻译、只要结果与短改写保持文字。对变换和对照优先 compare，有限条件切换用 switch，表格证据与冲突用 matrix，关系与状态用 state-diagram，过程用 stepper。适合观察时优先紧凑图解，避免整页应用。常见 UI 输出 genui-json 围栏，严格 JSON，公共字段 version:1,id:稳定英文ID,title,stateVersion:1。compare:{before:{label,lines:字符串数组},after:{label,lines:字符串数组},note可选}；matrix:{rows:行名数组,columns:列名数组,cells:[{row,column,text,explanation可选,conflict可选}]}；state-diagram:{nodes:[{id,label,explanation可选}],edges:[{id,from,to,label可选}],highlight:ID数组}；switch:{options:[{id,label,view:上述视图}]}。stepper:{steps:[{title,text,frame:上述视图}]}。grammar:{grammar:{start,productions:[{id,lhs,rhs:符号数组}]},input:终结符数组}，ε用空数组，由宿主计算 FIRST/FOLLOW/SELECT 与 LL(1)，不要硬编码结论。quiz:{questions:[{id,prompt,options:[{id,text,hint}],correct:正确选项ID,explanation}]}。多选指定type:multiple与正确ID数组；排序type:order；数值type:number与correct数值、tolerance、unit。lesson:{grammar可选,sections:[{title,view:上述视图}]}，子grammar省略grammar时共享课程文法。。嵌套不超过八层。所有字符串为纯文字，不含脚本、HTML或表达式。复杂计算模拟继续输出 genui-html，首行 <!-- more-genui: {"version":1,"id":"stable-id","title":"标题","stateVersion":1} --> 后接完整 <html>…</html>，使用离线 HTML/CSS/经典JS与 genui.getState()/setState()，禁止外部脚本和网络请求。只使用有助于当前任务的 UI，不强制普通回答生成 UI。\n[/More GenUI]';
export function promptPolicy(strategy = 'A') {
  if (strategy === 'A') return LEGACY_GUIDE;
  if (strategy === 'B') return FAST_GUIDE;
  if (strategy === 'C')
    return FAST_GUIDE.replace(
      '适合观察时优先紧凑图解',
      '对教学中的变换、条件影响、关系与冲突积极提供一块最简适合的图解',
    );
  throw Error('未知策略');
}
export function composePolicy(prompt, strategy = 'A', kind = '') {
  if (prompt.includes('[More GenUI v1]')) return prompt;
  return (
    prompt +
    '\n\n' +
    promptPolicy(strategy).replace(
      '[/More GenUI]',
      ({
        diagram: '当前请求明确要求图解。',
        quiz: '当前请求明确要求预测题，可使用兼容 genui-html 的 genui.quiz.mount。',
        steps: '当前请求明确要求分步观察。',
      }[kind] ?? '') + '[/More GenUI]',
    )
  );
}
