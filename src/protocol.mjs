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
  if (!/^(?:<!doctype html>\s*)?<html[\s>]/i.test(html) || !/<\/html>\s*$/i.test(html))
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
export const GUIDE =
  '[More GenUI v1]\n你正在为 More GenUI 宿主生成回答。普通文字问题直接用文字回答；适合视觉表达时使用静态图解或交互模块。先组织解释，再让多个紧凑 UI 按需穿插在对应段落中；不要强制数量，也不要把整个回答塞进一个大应用。正文讲背景和结论，UI 表达关系和操作反馈，不重复标题和长说明。宿主提供统一明暗主题、字体、按钮、输入控件，以及 row、stack、columns、muted、panel 类。使用 --bg、--fg、--muted、--surface、--border、--accent、--chart-1/2/3 变量，不重定义基础配色和字体，不默认深色大面板、渐变装饰、emoji 标题或层层卡片。布局和专用图形仍可自由编写 CSS。场景范例：结构关系用紧凑 SVG 静态示意；参数探索只放关键滑块和实时结果；算法过程用当前步骤和上一步/下一步。能用静态图讲清就不添加无意义控件。以下是运行协议，不是可省略的风格建议：\n1. 每个应用单独放在语言名严格为 genui-html 的 Markdown 代码围栏中，不能使用 html 围栏或原生预览/Artifact。多个独立题目必须各有一个完整应用，不能合并或漏掉。\n2. 围栏内第一行必须是元数据注释，随后才是完整 HTML。例如：\n```genui-html\n<!-- more-genui: {"version":1,"id":"unique-short-id","title":"应用标题","stateVersion":1} -->\n<html><body><label>参数 <input id="x" type="range" min="0" max="10"></label><output id="value"></output><script>const x=document.getElementById("x");x.value=genui.getState().x??5;function update(){document.getElementById("value").textContent=x.value;genui.setState({x:Number(x.value)})}x.oninput=update;update();</script></body></html>\n```\n3. 只能使用原生 HTML/CSS/经典 JavaScript、SVG、canvas。离线运行：禁止外部库、import、fetch、网络图片、链接跳转、表单提交与弹窗。脚本会在 HTML 挂载后执行，不需要等待 load。\n4. 用 genui.getState() 加默认值恢复参数，每次用户操作后用 genui.setState(JSON对象) 保存。不要保存动画帧。更新同一应用时保留 id，状态兼容时保留 stateVersion，不兼容时递增。源码不超过256 KiB，状态不超过64 KiB。\n5. 控件要有可访问标签、响应式布局和实时可见反馈；用 --bg、--fg、--accent 配色，写清数学假设。\n输出前逐块检查：元数据第一行、正确的 genui-html 围栏、完整 </html> 与结束围栏、控件事件已经绑定。不要在正文重复附加指令。\n[/More GenUI]';
export function augment(prompt, enabled = true) {
  return enabled && !prompt.includes('[More GenUI v1]') ? `${prompt}\n\n${GUIDE}` : prompt;
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
