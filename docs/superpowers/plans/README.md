# Plans 索引 — 状态总览

> 更新于 2026-11-25。仅保留仍在跟进中的计划；已交付、已取代或失效的计划一律删除，历史见 git log。
> 状态以本文标注为准；部分计划尚未补写 Status 块。

## 进行中 / 待跟进

| 计划 | 状态 | 剩余 |
|---|---|---|
| [app/mobile 移动客户端](./2026-11-16-app-mobile.md) | 主体已交付 | 真机后台音频 PoC（暂缓）、服务端推送（暂缓）、移动端测试包已改独立手动 workflow |
| [域文件夹与个人布局持久化](./2026-11-21-domain-folder-layout.md) | 部分交付 | Task 1 后端 `user_domain_layout` 模型与测试已落地；计划勾选未回填，与房间分组方案有重叠，需确认剩余范围 |
| [域内房间分组与排序](./2026-11-21-domain-room-grouping-sort.md) | 主体已交付 | 计划状态块未回填；后端布局摘要、前端侧栏分组拖拽与排序已落地 |
| [屏幕共享按需订阅](./2026-11-24-screen-share-on-demand-subscribe.md) | 进行中 | 6 个 Task / 29 个 Step 待执行；基线核对见计划正文 |
| [插件平台 01：基础协议与 JS SDK](./2026-11-24-plugin-01-protocol-sdk.md) | 待执行 | 2 个 Task；proto + SDK + 示例插件模板 |
| [插件平台 02：运行时与进程管理](./2026-11-24-plugin-02-runtime-manager.md) | 待执行 | 3 个 Task；数据表/审计 + runtime 插件 + Manager；依赖 01 |
| [插件平台 03：管理面与插件能力](./2026-11-24-plugin-03-capabilities.md) | 待执行 | 4 个 Task；管理 API/页面 + 插件 API + Hook + 页面挂载；依赖 01/02 |
| [插件平台 04：集成验证](./2026-11-24-plugin-04-integration.md) | 待执行 | 3 个 Task；指标 + E2E + 全量门禁；依赖 01/02/03 |
| [插件平台 05：文档与文档站](./2026-11-24-plugin-05-docs.md) | 待执行 | 2 个 Task；AGENTS/部署文档 + VitePress 插件指南与 API 参考；依赖 01–04 |
| [Release 产物分离与独立发版](./2026-11-25-submodule-split.md) | 待执行 | 7 个 Task；一组件一 Release（各在自己的 tag 上）+ 任一组件独立发版（删 lockstep、纳入 mobile）+ **移动端 CI 优化**（Android 迁 Linux runner、去重复 bind、去 --no-daemon、允许取消旧构建）+ release-notes 按组件渲染 + 修两个现存 bug。原「四端拆仓」方案经 review 后放弃：CI 会从并行 13 job 变成跨仓串行，慢 2-3 倍 |
| [音频输出策略抽象与 Web Audio 优先 fallback](./2026-11-25-audio-output-strategy.md) | 待执行 | 6 个 Task；Web Audio 优先，media element fallback |

> 关于页 GitHub 项目地址入口已交付并移出索引：`Browser.OpenExternal` 桥接与前端「项目地址」入口均已落地。