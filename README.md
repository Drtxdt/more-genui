# More GenUI 0.2.0

把模型输出的 HTML/CSS/JavaScript 变为聊天中的交互应用。当前交付包含 DeepSeek 网页扩展、DeepSeek Harness 插件，以及两者共用的协议、沙箱、参数存储和卡片界面。

## 安装浏览器扩展

1. 在 Edge 打开 `edge://extensions`（Chrome 使用 `chrome://extensions`），开启开发人员模式。
2. 选择“加载解压缩的扩展”，目录为 `E:\my_code\more-genui\.output\chrome-mv3`。
3. 刷新已经登录的 DeepSeek 页面。右下角出现电源图标；悬停显示 GenUI 开关状态，开启时有短暂光环。
4. 可以问：“解释正弦波的振幅与频率，给我一个可调整参数的实验。”

开关会保存；关闭后恢复原始代码显示，不再添加生成指令。仅适配 `https://chat.deepseek.com/*`，尚未适配 Claude。浏览器扩展没有后台服务、API Key 或额外模型请求。

更新内容、精简验收与回退方法见 [0.2.0 发布说明](docs/releases/v0.2.0.md)。

## 使用行为

- 有助于理解时让模型生成交互；普通问题正常回答。附加指令在可识别的用户消息容器中折叠展示，可展开检查。
- 新回答必须完成代码围栏才启动应用。页面历史中的完整协议文档也可恢复；中断时在当前页面已观察到的未闭合代码不执行。
- 常驻操作仅保留放大和更多；继续询问、修复、重置、重跑、停止和源码位于更多菜单。放大使用 Popover，保留同一个 iframe 和动画实例。
- 滑块、动画、按钮计算都在本地执行。参数按会话、应用 ID、状态版本保存；兼容更新继承参数，刷新恢复。
- “继续询问”把当前参数放入草稿，不自动发送。“修复”由用户点击触发一次提交；已有草稿时拒绝覆盖。站点未接受自动发送时保留修复草稿并说明原因，不自动重试。
- 可停止、重新运行、重置应用。读取或保存失败会在卡片显示错误。

## Harness

预构建插件位于 `packages/harness`，兼容性锁定 **Harness 0.2.1-rc.5 / Cordis 4.0.5**。在已经配置模型的 Harness profile 中执行：

```powershell
dsh plugin --profile web add E:\my_code\more-genui\packages\harness
```

随后重启 `dsh web` 并刷新前端。插件提供 `render_app(source)` 工具，不再调用第二个模型；直接工具结果与嵌套 PTC 结果均从持久化 metadata 恢复。详见 [插件说明](packages/harness/README.md)。本项目不读取或配置你的模型凭据。

## 开发与验证

Node 24、pnpm 10。依赖锁定在 `pnpm-lock.yaml`。

```powershell
pnpm install --frozen-lockfile
$env:PLAYWRIGHT_BROWSERS_PATH="$PWD\.cache\browsers"
pnpm exec playwright install chromium
pnpm verify
```

`pnpm dev` 开发扩展；`pnpm build` 构建扩展和 Harness 插件；`pnpm test` 运行协议/真实 Harness 工具服务测试；`pnpm test:e2e` 在 Chromium 和本机 Edge 中运行浏览器测试。测试使用临时浏览器配置，不读取个人浏览器登录数据。没有安装 Edge 时可运行 `pnpm exec playwright test --project=Chromium`。

`node tests/browser/server.mjs` 启动本地验收台，打开 `http://127.0.0.1:4173`，可查看正弦波、弹簧和排序示例。真实 DeepSeek 生成样本及失败记录在 `tests/live`，自动化结果在 `test-results`。

## 协议

代码围栏语言是 `genui-html`；首行是严格元数据 JSON 注释，之后是完整 HTML 文档：

````markdown
```genui-html
<!-- more-genui: {"version":1,"id":"wave","title":"波形实验","stateVersion":1} -->
<html><body>…完整界面、样式和脚本…</body></html>
```
````

使用 `genui.getState()` / `genui.setState(JSON对象)`。源码上限 256 KiB，状态上限 64 KiB；同一应用兼容修改保留 `id` 与 `stateVersion`，不兼容时增加版本。状态只存浏览器本地，不自动跨设备同步。

## 验证范围与边界

已验证能力和未达成验收项分开记录在 [验收报告](docs/verification.md)。[上游分析与改进映射](docs/upstream-analysis.md) 解释设计取舍。

沙箱为 opaque origin，只授予 `allow-scripts`；CSP 拒绝通常的外部脚本、资源和连接。它**不是 CPU 配额系统或通用断网保证**：恶意无限循环仍可能影响浏览器，程序化自导航可能在宿主检测并停止前产生请求。不要把密码、令牌或私人资料交给生成应用。模型生成的数学逻辑也需要按用途核对。

DeepSeek 的 DOM、请求结构和流式协议不是稳定公开 API。未知请求会原样放行并提示；真实 DOM 已检查，网络流式适配有独立模拟回归，不能把模拟测试当作真实站点全链路证明。模型偶尔不遵循协议时不会自动执行无元数据 HTML。
