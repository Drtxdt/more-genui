# More GenUI Harness 插件

基于 Harness 0.2.1-rc.5、Cordis 4.0.5。构建输出为 `lib/index.js`（宿主工具）与 `lib/client.js`（浏览器模块加载器格式）；`cordis.patch.yml` 注册插件。

在本项目根目录运行 `pnpm build` 后，在已有模型配置的 Harness profile 执行：

```powershell
dsh plugin --profile web add E:\my_code\more-genui\packages\harness
```

重启 `dsh web` 并硬刷新。模型调用 `render_app`，参数 `source` 是元数据注释与完整 HTML，不包含 Markdown 围栏。工具只验证并记录结果，不生成第二次模型请求。

客户端按工具调用 ID 建立稳定节点，使用 `groupTree: 'turn'` 保留展示位置；不按标题合并，不在回合结束时把同一个应用搬到另一个渲染组件。支持 `tool/result.data.message.toolCallId` 和 `tool/ptc-dispatch.data.subCallId` 的结果 metadata。PTC 中不尝试运行尚未完成的程序输出。

状态保存到本机浏览器 localStorage，按会话、应用 ID、状态版本隔离。界面与扩展共用 `src/surface.ts` 和沙箱运行时。继续询问使用宿主的 `captureInsertion/insertText`；修复使用输入动作，已有草稿时不覆盖。

已覆盖公开类型契约、真实工具服务调用、直接/嵌套结果的回放逻辑和共享渲染器浏览器测试。另在隔离 profile 中启动官方 Harness 0.2.1-rc.5 Web，装载本插件，使用无网络的测试模型适配器完成真实 agent loop → render_app → 客户端渲染 → 回合结束保留同一 iframe → 刷新恢复参数的集成验收。测试适配器只提供确定性工具调用，不证明任何付费模型的生成质量，也不读取你的模型凭据。证据见项目 `docs/evidence/harness-e2e.json`；复现脚本为 `tests/browser/harness-e2e.mjs`。
