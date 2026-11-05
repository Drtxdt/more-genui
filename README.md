# More GenUI

**让 DeepSeek 的回答，不止能看，还能动手试。** 当前版本：`0.2.1`。

“振幅决定波有多高，频率决定振得有多快。”道理我都懂，但如果旁边就有一条波形，拖一下滑块就能看到区别，是不是直观多了？

More GenUI 做的就是这件事：让模型在回答里按需穿插静态图解、参数实验和分步演示。文字负责解释，界面负责把关系摆给你看。能一句话讲清的问题，当然也可以只回答一句话。~~没必要给“你好”配一个驾驶舱~~

目前有两个入口：**DeepSeek 官网浏览器扩展**，以及 **DeepSeek Harness 插件**。两者共用协议、沙箱和界面运行时。官网扩展只适配 `chat.deepseek.com`，Claude 等平台还没接上。

## 先装起来，拖个滑块看看

如果你拿到的是扩展压缩包，先解压。我们要加载的是**包含 `manifest.json` 的目录**，不是 ZIP 文件本身。

1. Edge 打开 `edge://extensions`；Chrome 打开 `chrome://extensions`。
2. 开启“开发人员模式”，选择“加载解压缩的扩展”，选中刚才的目录。
3. 回到已经登录的 DeepSeek 页面，刷新。右下角会出现电源图标，悬停可以看到当前开关状态。
4. 发一句试试：

> 我总把正弦波的振幅和频率搞混。请直观地解释它们的区别，让我能分别调节并观察变化。

如果你是在本地构建的项目，加载 `.output/chrome-mv3` 即可。这台开发机上的完整路径是 `E:\my_code\more-genui\.output\chrome-mv3`；你换了项目位置，就用自己的路径。

**更新时别只点扩展的“重新加载”，还要刷新 DeepSeek 页面。** 旧页面里已经插进去的内容，不会因为磁盘上的代码变了就自动消失。

想换几个场景？这里有一份 [12 个场景的测试提示词清单](docs/test-prompts.md)，数学、算法、电路、计划安排都有，挑你感兴趣的就行。

## 它到底往回答里加了什么？

扩展会在请求里附加一段生成规范，告诉模型如何输出 `genui-html`。模型返回符合协议的 HTML/CSS/JavaScript 后，扩展在隔离的 iframe 中运行它。

这里的“附加指令”仍然是普通用户级指令，不是什么隐藏的系统权限。在能确认归属的用户消息正文里，它会折叠展示，你可以展开检查。扩展不会为了生成界面再偷偷调用另一个模型，也不需要额外填写 API Key。

模型可以一边解释，一边插入几块小 UI。每块代码围栏完整后就能启动，不必等整段回答结束；但半截脚本不会拿来执行。这个地方还是别着急，少一个括号都够 JavaScript 喝一壶。

滑块、按钮和动画在本地运行，调整参数不会自动再问模型。参数按会话、应用 ID 和状态版本保存在本机；刷新可以恢复，跨设备同步目前没有。

## 那排图标怎么用？

`0.2.1` 把操作排成了一行 Lucide 图标。悬停看说明，也可以用键盘聚焦。旧版那个一展开就把页面撑高的更多菜单，已经收拾掉了。

| 操作 | 会发生什么 |
| --- | --- |
| 放大 | 放大同一个 iframe，收回来时不重新创建应用 |
| 继续询问 | 把当前参数填入输入框，**由你决定是否发送** |
| 修复 | 请求模型修复当前应用；已有草稿时不覆盖，站点不接受自动发送时保留草稿并提示 |
| 查看源码 | 在应用下方展开源码，不把工具栏拉成长条 |
| 重置 | 清空这个应用保存的参数，并重新启动 |
| 重新运行 | 保留当前参数，重新启动应用 |
| 停止 | 停掉当前应用，保留参数 |

右下角是扩展总开关，状态会保存。关闭后恢复原始代码显示，后续请求也不再附加生成规范。

## 装了，但哪里不太对？

**看不到右下角开关？** 先确认扩展已启用，当前网址是 `https://chat.deepseek.com/`，然后刷新页面。不要在其他 AI 网站上等它出现，目前还没有跨平台适配。

**回答里只有代码，没有界面？** 先等代码块输出完整。扩展要求正确的围栏、元数据和完整 HTML，模型没遵守协议时不会直接执行普通 HTML。可以明确要求它重新输出符合 More GenUI 协议的内容。

**页面更新后突然不能用了？** DeepSeek 的页面结构和流式接口不是稳定公开 API，网站改版可能影响适配。遇到问题时，留下提示词、截图和复现步骤，比一句“它炸了”更方便排查。~~当然，你可以先吐槽一句~~

**图算错了？** 能运行和算得对是两回事。先检查输入、单位和数学假设，再决定是否点修复。扩展负责运行界面，不会自动替模型证明公式。

## 用的是 Harness？从这里走

插件位于 `packages/harness`，当前锁定 **Harness `0.2.1-rc.5` / Cordis `4.0.5`**。注意：项目版本 `0.2.1` 和 Harness 的版本号是两回事。

在项目根目录执行 `pnpm build`，然后对已经配置好模型的 Web profile 安装插件。下面使用这台开发机的路径，换机器时记得改：

```powershell
dsh plugin --profile web add E:\my_code\more-genui\packages\harness
```

随后重启 `dsh web` 并刷新前端。模型通过 `render_app` 工具提交源码，工具做验证和结果记录，不再请求第二个模型。具体契约见 [Harness 插件说明](packages/harness/README.md)。

## 想自己改？先把构建跑通

开发环境使用 Node 24、pnpm 10，依赖由 `pnpm-lock.yaml` 锁定。在项目根目录打开终端：

```powershell
pnpm install --frozen-lockfile
pnpm check
pnpm build
```

构建完成后，扩展在 `.output/chrome-mv3`，Harness 插件在 `packages/harness/lib`。`pnpm dev` 可以启动扩展开发流程。

测试按需要运行，日常改个文案不用把浏览器矩阵拉出来陪跑：

```powershell
# 协议、状态和 Harness 工具服务的快速测试
pnpm test

# 当前单行工具栏的 Edge 专项回归
pnpm exec playwright test tests/browser/inline.spec.mjs --project=Edge
```

需要运行 Chromium 测试时，先准备测试浏览器。下面是 PowerShell 写法：

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH="$PWD\.cache\browsers"
pnpm exec playwright install chromium
pnpm exec playwright test --project=Chromium
```

`pnpm test:e2e` 会运行配置中的 Chromium 和本机 Edge 测试，`pnpm verify` 则串联检查、构建和测试。这些是可运行的入口，**不表示每个版本都已经跑过整套测试**。

想在本地看示例，可以运行 `node tests/browser/server.mjs`，然后打开 `http://127.0.0.1:4173`。测试使用独立的浏览器配置，不读取你的个人登录数据。

## 输出协议，给想接入的人看

围栏语言必须是 `genui-html`，第一行是元数据，后面是完整 HTML。下面展示结构，省略号不是可运行示例：

````markdown
```genui-html
<!-- more-genui: {"version":1,"id":"wave","title":"波形实验","stateVersion":1} -->
<html><body>…完整界面、样式和脚本…</body></html>
```
````

应用通过 `genui.getState()` 读取参数，通过 `genui.setState(JSON对象)` 保存。源码上限 256 KiB，状态上限 64 KiB；不要把每一帧动画都存进去。

同一应用的兼容修改保留 `id` 和 `stateVersion`，状态结构不兼容时增加版本。这里有状态版本隔离，但开发阶段没有为旧应用提供通用迁移或自动换肤服务。

## 哪些已经验证，哪些还不能拍胸脯？

`0.2.1` 的类型检查、构建和 Edge 工具栏专项回归已通过。之前版本的验证范围分别记录在 [0.2.0 发布说明](docs/releases/v0.2.0.md) 和 [早期验收报告](docs/verification.md)，不要把旧版本的成绩直接算到新版本头上。

真实官网人工查看仍有未完成项：Computer Use 曾因无法可靠识别 Edge 页面 URL 而停止。我们有模拟网络回归，也有用户实际使用反馈，但这不等于每个新版本都完成了官网全链路验收。

沙箱使用 opaque origin，只授予 `allow-scripts`，CSP 限制常见的外部脚本、资源和连接。它没有 CPU 配额，也不是绝对断网保证：无限循环仍可能影响浏览器，程序化自导航可能在被停止前发出请求。不要把密码、令牌或私人资料交给生成应用。

如果你关心为什么选自由 HTML/JS、与 A2UI 相比得到了什么又放弃了什么，可以继续看 [上游分析与改进映射](docs/upstream-analysis.md)。
