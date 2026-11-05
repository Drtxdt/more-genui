# 上游分析与改进映射

分析基线：[`valuz-ai/dsh-valuz-genui` 的 7c5f28f 提交](https://github.com/valuz-ai/dsh-valuz-genui/tree/7c5f28f5c4610ef0d61d27798c0118a46e433bef)，包版本 0.2.2。本项目目标是交互解释与参数模拟，采用完整 HTML/JS；这不是上游 A2UI 的兼容分支。

## 值得保留的设计

上游由当前模型直接编写 A2UI，工具只做验证，不嵌套请求第二个模型。这避免额外生成延迟和第二次计费。本项目保留同一原则：网页扩展附加普通用户级指令，Harness 提供纯验证 `render_app` 工具；附加指令不是隐藏系统权限。

上游把规范文档保存到标准工具事件的 metadata，与模型可见回执分开。这让回放有可靠来源，也不需要第三方自定义事件。本项目仍使用这些标准事件，并把 `source` 作为可回放的规范内容。

A2UI 的固定组件目录、按组件容错、边生成边组合 UI，是上游的实际优势。它对表格、表单和业务仪表盘很合适，组件级错误也可以只丢弃局部。本项目等待完整 HTML 后执行，牺牲了这种渐进预览，换来原生 JS 模拟、Canvas/SVG 和本地事件处理的表达能力。不能据此宣称全面胜过 A2UI。

依据：[上游 README](https://github.com/valuz-ai/dsh-valuz-genui/blob/7c5f28f5c4610ef0d61d27798c0118a46e433bef/README.md)。

## 问题、改进与代价

| 方面 | 上游行为及影响 | 本项目实现 | 验证或边界 |
|---|---|---|---|
| 回合结束的组件生命周期 | 成功应用从 process 展示切换为 turn-tail 中的新 `SurfaceView`，运行时组件会重新建立 | 从结果创建稳定调用 ID 节点，使用 Harness `groupTree: 'turn'`；放大采用同一个 iframe 的 Popover | 官方 Web profile 集成验收通过：回合结束 iframe 标记不变、参数不变，刷新恢复参数 |
| 应用身份 | `latestRevisions` 以相同标题判定后续修订，可能吞掉同名但不同用途应用 | 使用会话 + app.id + stateVersion；工具节点仍按 call ID 区分 | 不按标题去重；模型仍须给不同应用不同 ID |
| 交互成本 | renderer 的 onAction 被包装为普通用户消息，显式 action 都回到模型 | 控件计算在隔离 iframe 本地完成；继续询问填草稿，用户点击修复才提交一次 | 不把局部动作自动发送模型，不承诺生成逻辑天然正确 |
| 本地状态 | 上游主要持久化声明式文档，临时 UI 状态未独立持久化 | 精确源码修订状态 + 同 ID/版本的兼容继承；串行写入、重置、失败提示 | 本机存储；跨设备与任意状态迁移未实现 |
| 源码输出时机 | A2UI 支持完整消息片段逐步更新 | SSE 分块解码后以完整代码围栏为边界，HTML 文档也需闭合 | 不运行半个脚本；历史页面缺少原始围栏时只接受完整元数据文档 |
| PTC 结果 | 旧版 README 描述嵌套结果缺少 metadata，无法展示 | 针对 0.2.1-rc.5 的 `tool/ptc-dispatch.meta` 接口恢复应用 | 已对照安装包类型；不将旧宿主限制当作当前事实 |
| 执行安全 | A2UI 固定组件目录限制了表达能力，也减少任意脚本风险 | opaque-origin iframe + 私有 MessageChannel + CSP；仅向应用提供 JSON 状态接口 | HTML/JS 风险更大；无 CPU 配额，不能承诺所有导航网络外发都被阻断 |
| 故障恢复 | 上游有 React error boundary，但恢复与持久化状态有限 | 展示异常、源码、重新运行、停止、重置和一次修复 | 不能自动诊断所有视觉或数学错误 |
| 包体及提示成本 | README 报告约 3.5 MB 客户端包，组件目录提示词较长 | 不引入图表引擎；用原生 SVG/Canvas，提示词明确协议与状态接口 | 本项目实际包体见构建结果；没有同环境加载耗时或 token 使用量的对照实验 |
| 主机契约 | 上游 README 明确列出人工维护平台模块列表和兼容版本风险 | 锁定 0.2.1-rc.5，类型检查覆盖 host/client；真实发布版工具服务执行测试 | 不保证未来 Harness RC 兼容 |
| 网页宿主 | 上游面向 Harness | 新增 DeepSeek 官方网页适配，核心运行时与 Harness 共用 | 观察到的当前 DOM 为 `.md-code-block pre`；网页私有 API 可能变动 |

生命周期和标题判定依据：[GenuiSurface.tsx](https://github.com/valuz-ai/dsh-valuz-genui/blob/7c5f28f5c4610ef0d61d27798c0118a46e433bef/src/client/GenuiSurface.tsx)。兼容与包体描述依据：[README](https://github.com/valuz-ai/dsh-valuz-genui/blob/7c5f28f5c4610ef0d61d27798c0118a46e433bef/README.md)、[package.json](https://github.com/valuz-ai/dsh-valuz-genui/blob/7c5f28f5c4610ef0d61d27798c0118a46e433bef/package.json)。当前接口依据：安装锁定版本的 `dsh-tools/lib/types/types.d.ts`、`dsh-client-ui-chat/lib/types/client/contract/chat-nodes.d.ts`。

## 对“全面改进”的判断

已落实的重点是交互在本地执行、参数持久化、稳定身份、同实例放大、显式修复、共享运行时和网页适配。没有把 A2UI 全目录重新实现，也没有把模型生成成功率、数学正确率或实际站点全链路可靠性假定为已经领先。第一轮真实生成可运行；第二轮发生一次协议失败，说明提示约束并不等于可靠契约。具体计数、修正和验收缺口见 [验证记录](verification.md)。
