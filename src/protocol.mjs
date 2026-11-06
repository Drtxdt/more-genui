import { z } from 'zod';
export const MAX_SOURCE = 256 * 1024,
  MAX_STATE = 64 * 1024;
export const bytes = (value) =>
  new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value)).length;
export const metadataSchema = z
  .object({
    version: z.literal(1),
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
    title: z.string().min(1).max(160),
    stateVersion: z.number().int().positive(),
  })
  .strict();
export function parseApp(source) {
  if (typeof source !== 'string' || bytes(source) > MAX_SOURCE)
    throw Error('应用源码超过 256 KiB 或类型无效');
  const match = /^\s*<!--\s*more-genui:\s*(\{[^\n]*\})\s*-->/.exec(source);
  if (!match) throw Error('缺少 More GenUI 元数据');
  const meta = metadataSchema.parse(JSON.parse(match[1])),
    html = source.slice(match[0].length).trim();
  const documentStart = html.replace(/^(?:<!--[^]*?-->\s*)+/, '');
  if (!/^(?:<!doctype html>\s*)?<html[\s>]/i.test(documentStart) || !/<\/html>\s*$/i.test(html))
    throw Error('HTML 文档未完成');
  return { ...meta, html };
}
export function fencedSources(raw) {
  const results = [];
  let fence = '',
    lines = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!fence) {
      const m = /^\s{0,3}(`{3,}|~{3,})genui-html\s*$/.exec(line);
      if (m) {
        fence = m[1];
        lines = [];
      }
    } else if (new RegExp('^\\s{0,3}' + fence[0] + '{' + fence.length + ',}\\s*$').test(line)) {
      results.push(lines.join('\n'));
      fence = '';
    } else lines.push(line);
  }
  return results;
}
export function completeApps(raw) {
  return fencedSources(raw).map(parseApp);
}
export function safeState(value) {
  const json = JSON.stringify(value);
  if (json === undefined || bytes(json) > MAX_STATE) throw Error('状态超过 64 KiB');
  const parsed = JSON.parse(json);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object')
    throw Error('状态必须是 JSON 对象');
  return parsed;
}
export const GUIDE = '[More GenUI v1]\n普通事实直接回答。值得观察、预测或操作时，在相关段落插入紧凑图解或交互。每个独立应用使用完整 genui-html 围栏，首行 <!-- more-genui: {"version":1,"id":"stable-id","title":"应用标题","stateVersion":1} -->，随后是完整 <html>…</html> 和结束围栏。使用原生离线 HTML/CSS/经典 JS、SVG 或 canvas。使用宿主字体、--bg、--fg、--accent 和 .row/.stack。用 genui.getState()/setState(JSON对象) 保存参数。单选预测调用 genui.quiz.mount(el,{id,questions:[{id,prompt,options:[{id,text,hint}],correct,explanation}]})，错误项有提示。分步调用 genui.stepper.mount(el,{id,steps:[{title,text}]})。计算结果可通过 genui.experiment.publish({metrics:[{name,value,unit}]}) 登记。保持键盘可操作、窄屏可读。独立模块分块生成。\n[/More GenUI]';
export function augment(prompt, enabled=true, kind='') {
  if(!enabled||prompt.includes('[More GenUI v1]'))return prompt;
  const extra={quiz:'练习先预测再揭晓，提示解释误判。',steps:'每一步说明当前状态、变化和原因。',diagram:'先展示关系，只给能改变结果的控件。'}[kind]??'';
  return prompt+'\n\n'+GUIDE.replace('[/More GenUI]',extra+'[/More GenUI]');
}
export function splitGuidance(text) {
  const start = text.indexOf('[More GenUI v1]'),
    end = text.indexOf('[/More GenUI]', start);
  return start >= 0 && end >= start
    ? {
        before: text.slice(0, start),
        guide: text.slice(start, end + 13),
        after: text.slice(end + 13),
      }
    : null;
}
