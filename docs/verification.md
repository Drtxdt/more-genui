# 验收记录

验收日期：2026-11-05。环境：Windows、Node 24.18、pnpm 10.33；Harness 固定 0.2.1-rc.5，Cordis 4.0.5。交付为个人加载的 MV3 扩展和本地 Harness 插件，未发布商店或 npm。

最终结果：类型检查、生产构建通过；10/10 单元与工具服务测试通过；100/100 Chromium/Edge 浏览器测试通过，无跳过、失败或重试。冻结提示词后的真实生成首次可用为 20/20，普通文本对照为 5/5。完整 Harness 宿主离线集成通过。官网登录浏览器中安装扩展的组合验收仍未完成，详见下文。

## 真实 DeepSeek 生成

用户在内置浏览器登录后，通过官方网页发送测试请求。最终提示词冻结后，10 个题目各执行两次，共 20 条单独请求；第二轮使用新会话。同轮各题共用一个会话，并非 20 个互不相关会话。每条请求指定应用 ID，明确要求交互实验，附加实际扩展使用的 GUIDE。没有修改生成 HTML，也没有对最终样本修复或重新生成。

题目：正弦波、弹簧、冒泡排序、二次函数、一次函数、抛体运动、欧姆定律、RGB 混色、矩形几何、公平硬币概率。任务和完整提示在 `tests/live/independent/tasks.json`；逐条原始回答、源码、协议检查结果位于同目录。可执行原始 HTML 位于 `tests/live/apps/final-*.html`。

首次可用的操作定义：严格协议通过；在 Chromium 和 Edge 中启动无运行时错误；至少一个控件操作改变 SDK 状态；重新创建应用后参数保持一致。它不代表全部数学逻辑或视觉设计都经过专家审核。另有电流、功率与排序结果的确定性检查，以及自带弹簧示例的数值检查。

机器可读最终计数见 [acceptance.json](evidence/acceptance.json)。标准为至少 18/20 首次可用。另有 5 条普通文本请求（翻译、改写、定义、关键词、问候），原始记录 `tests/live/plain-*.json`，均未生成代码块。

此前探索性批量请求使用过旧提示词，第二轮一次回答缺少协议元数据且合并了题目。该失败保留在 `tests/live/capture-2-0.json`，不纳入冻结最终提示词后的独立请求指标，也不把修正提示词后的成功冒充原提示词首次成功。探索样本另外保留、另外测试。

## 扩展与浏览器

完整测试使用真实加载的扩展构建物，网络响应来自本地固定数据。覆盖 fetch 与官网当前使用的 XHR、请求只附加一次、开关、完整围栏门控、取消/不完整输出、BATCH 与继承增量操作、非 prompt 请求保持原样、现有 DOM 渲染、参数保存、修复提交。

共享运行时检查包括同 iframe 放大、本地参数与刷新恢复、版本隔离、状态大小限制、错误反馈、停止/重跑/重置、外部脚本与连接限制、父页面隔离、私有端口校验、主题更新和控件计算。完整运行结果保存于 [browser-results.json](evidence/browser-results.json)。

官网真实 DOM 已检查：代码块为 `.md-code-block pre`。公开前端脚本 [main.25acfd57a4.js](https://fe-static.deepseek.com/chat/static/main.25acfd57a4.js) 显示 `/api/v0/chat/completion` 的 `prompt` 字段、XHR 累积 responseText、路径/操作继承及 BATCH 规则；实现按该版本核对。

**尚未验证的组合：在用户登录的真实 Edge/Chrome 官网中安装扩展，并完成一次实际生成到自动注入的全链路。** 内置浏览器用于真实模型请求，不能安装本地 MV3 扩展；浏览器扩展测试使用隔离配置与模拟网络。因此不把二者拼称为“官网全链路通过”。安装后仍需用户在实际日用浏览器确认一次；未来官网 DOM/API 变化也需要重新验收。

## Harness 完整宿主

实际运行官方 `@deepseek-ai/dsh@0.2.1-rc.5 web`，在隔离 `DSH_HOME` 中通过官方 plugin add 装载本项目。使用 `tests/harness-provider.mjs` 无网络模型适配器提供确定性工具调用；真实 agent loop 执行 `render_app`，真实客户端模块注册并显示应用。改变振幅后，在回合结束前后检查 iframe 内标记不变、数值不变；刷新后仍恢复该值。通过且浏览器错误列表为空，见 [harness-e2e.json](evidence/harness-e2e.json) 和 [截图](evidence/harness-e2e.png)。

该测试验证宿主集成，不验证任何付费模型的生成质量。没有读取用户模型凭据。直接和嵌套 PTC 结果回放另有单元测试；完整 Web 测试使用直接工具调用。

复现：设置隔离 `DSH_HOME`，按 README 安装插件；运行 `node scripts/prepare-harness-fixture.mjs` 生成临时 patch，启动 `dsh web --patch .cache/harness-fixture.patch.yml --host 127.0.0.1 --port 4174 --no-open`。将启动输出的临时本地 URL 放入 `DSH_TEST_URL` 环境变量，运行 `node tests/browser/harness-e2e.mjs`。临时鉴权 URL 不写入报告或安装包。

## 重跑与交付

```powershell
pnpm verify
node scripts/score-independent.mjs
node scripts/acceptance-report.mjs
```

`score-independent` 从保存的原始回答校验/导出应用，应该在新增样本后、运行浏览器测试前执行；重跑现有样本时 `pnpm verify` 已覆盖全部已导出应用。`acceptance-report` 读取最后一次完整浏览器结果，要求两种浏览器均为一次运行通过。

扩展：`dist/more-genui-extension-0.1.0.zip`，解压后加载包含 manifest.json 的目录，或直接加载 `.output/chrome-mv3`。Harness：`dist/more-genui-harness-0.1.0.tgz`，本地已构建目录 `packages/harness` 可按 README 直接安装。

范围边界：当前仅适配 DeepSeek；Claude 等平台尚未实现。没有云同步、A2UI 兼容层、外部 CDN、第二次模型调用或商店发布。沙箱不提供 CPU 配额，也不保证程序化自导航绝不产生网络请求。详细改进及代价见 [上游分析](upstream-analysis.md)。

## 0.3 本轮记录

当前验证范围与限制请看 [0.3.0 发布说明](releases/v0.3.0.md)。本轮保留轻量本地门槛，不新增 CI，不使用历史 0.1 的大规模结果替代当前提交验证。真实官网生成与 Edge 体验由用户按 [手测清单](test-prompts.md) 检查。
