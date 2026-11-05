# More GenUI Harness 插件

官网扩展负责给 DeepSeek 网页加交互，Harness 这边怎么接？我们直接提供一个 `render_app` 工具：模型写源码，工具验证并记录结果，客户端把它显示出来。没有第二个模型在后台接力生成。

## 先确认版本，再安装

当前锁定 **Harness `0.2.1-rc.5`、Cordis `4.0.5`**。插件自己的版本号与宿主版本号不同，别看到数字差不多就当作兼容保证。

先在项目根目录执行 `pnpm build`。构建会生成 `lib/index.js`（宿主工具）和 `lib/client.js`（客户端模块），`cordis.patch.yml` 负责注册插件。

对已经配置好模型的 Web profile 执行下面的命令。示例路径来自开发机，换位置时请替换：

```powershell
dsh plugin --profile web add E:\my_code\more-genui\packages\harness
```

然后重启 `dsh web`，硬刷新页面。如果源码改了但界面没变，先检查是否重新构建、重启并刷新，别急着怀疑模型突然有了反骨。

## 工具收到的是什么？

`render_app` 的 `source` 参数包含元数据注释和完整 HTML，**不包含 Markdown 代码围栏**。这与官网聊天中使用 `genui-html` 围栏的形式不同。

工具只验证并保存结果。客户端从持久化 metadata 恢复应用，支持直接工具结果和嵌套 PTC 结果，不尝试执行尚未完成的程序输出。

## 为什么按调用 ID 建节点？

因为两个应用可以同名，而一个应用也可能被修改。拿标题当身份，容易把不该合并的内容合并掉。

客户端按工具调用 ID 创建节点，使用 `groupTree: 'turn'` 保持展示位置，避免在回合结束时把同一个应用搬到另一个渲染组件。直接结果读取 `tool/result.data.message.toolCallId`，嵌套结果读取 `tool/ptc-dispatch.data.subCallId`。

参数保存在本机浏览器的 localStorage，按宿主、会话、工具调用 ID、应用 ID 和状态版本隔离。界面与官网扩展共用 `src/surface.ts` 和沙箱运行时。继续询问通过宿主的 `captureInsertion/insertText` 填入草稿；修复由用户触发，输入框已有草稿时不会覆盖。

## 测试证明了什么？

项目已有类型契约、真实工具服务调用、直接/嵌套结果回放和共享渲染器测试。

早期还在隔离 profile 中启动了官方 Harness Web，用无网络的测试模型适配器跑通了真实 agent loop、工具执行、客户端渲染、回合结束保留同一 iframe，以及刷新恢复参数。证据在项目的 `docs/evidence/harness-e2e.json`，复现脚本是 `tests/browser/harness-e2e.mjs`。

注意这个边界：测试适配器提供的是确定性工具调用，验证的是宿主集成，不是某个模型的生成质量；也不代表后续每个版本都重跑了完整宿主验收。它不读取你的模型凭据。

0.3 的修复会截取参数快照，通过本次请求的一次性注释标识确认返回结果，再检查应用 ID 与 stateVersion。模型没有回显标识时不自动继承；刷新页面会丢弃尚未完成的交接。普通新工具调用不会借用同名应用的状态。此轮只重跑快速服务/回放和共享界面回归，未重跑真实 Harness Web 全链路。
