# 桌面端健壮度：Supervisor 自愈设计

- 日期：2026-11-15
- 范围：`app/desktop` 宿主（回环代理、WebView 页面、启动与配置），含一处前端错误分类小改
- 前置现状：崩溃窗（`crashwindow.go`）、崩溃判定（`crash_fatal.go`）、客户端日志（`clientlog.go`）、启动时间线（`startup.go`）已存在；本设计不重写它们，只把「谁在什么时候重启什么」收敛到一个守护协程

## 目标

1. 页面或代理在运行中失效时，宿主自动恢复；连续失败才交给用户。
2. 本地代理本身的故障与后端不可达能被区分，并留下可诊断记录。
3. 启动期与配置文件的异常不再静默：要么恢复，要么用现有崩溃窗说明原因。
4. 上述行为可以在 CI 里单测，不依赖真的杀 WebView2 进程或断网。

## 非目标

- 不做进程外守护（launchd/systemd 级别的重启）。
- 不做会话跨 origin 迁移：端口变化必然丢 cookie/localStorage，只提示重新登录。
- 不引入新的更新器/安装器逻辑（更新链路不在本轮范围）。
- 不替换 MyGo 或引入 WebView2 私有接口。

## §1 结构与边界

新增 `app/desktop/supervisor.go`。Supervisor 是一个进程内守护协程，只做「判断 + 调度」，动作经三个窄接口执行：

```go
type pageOps interface {
    Reload() error
}

type proxyOps interface {
    Probe() error                    // 本机回环 /healthz
    Restart() (oldPort, newPort int, err error)
    LastUpstreamError() string
}

type hostOps interface {
    Report(reason, detail string)    // 复用 crashwindow.reportFatal
    Notify(title, body string)       // 原生通知，去重
}
```

- 事件来源：`Page.OnRenderProcessGone`、`Page.OnDidFailLoad`、前端 `reportFatal`（已有）、看门狗探针、启动期错误。
- 事件进入 `chan supervisorEvent`；`Supervisor.Run(ctx)` 串行决策，避免并发重启。
- 所有窗口/页面方法经 `mygo.RunOnMain` 调用，Supervisor 自身不直接碰原生 API。
- `crashwindow.go` 不改：Supervisor 是它唯一的新增调用方。

组件与职责：

| 组件 | 负责 | 依赖 |
|------|------|------|
| `Supervisor` | 重启预算、退避、终态判定 | pageOps / proxyOps / hostOps |
| `pageOps` 适配器 | 页面重载 | `mygo.Window.Page()` |
| `proxyOps` 适配器 | 探针、重启监听、记录上游错误 | `proxyServer` |
| `hostOps` 适配器 | 崩溃窗与原生通知 | 现有 `reportFatal`、`mygo.Notification` |

## §2 事件与重启策略

每个组件独立滑动窗口预算：**3 次 / 10 分钟**；退避 0.5s → 1s → 2s，成功后预算清空。

| 事件 | 动作 | 终态 |
|------|------|------|
| `PageRenderGone` | 等待退避 → 确认代理健康 → `Reload` | 预算耗尽 → 崩溃窗，文案注明「已自动重试 3 次」 |
| `PageLoadFailed`（仅应用外壳 URL） | 同上；先修代理再重载 | 同上 |
| `ProxyProbeFailed`（连续 2 次） | `Restart`；端口未变 → 重载页面；端口变化 → 通知 + 重载到新 URL | 预算耗尽 → 崩溃窗 |
| `ConfigCorrupt` | 备份 + 回落默认，通知一次 | 不重启 |
| 启动期错误（监听/窗口/资源） | 直接 `Report` | 崩溃窗 |

- 崩溃窗是终态：不自动退出进程，用户可选重启 / 导出日志 / 退出（现有行为）。
- `PageLoadFailed` 只统计应用外壳 URL，避免把偶发的上传/外链失败当成崩溃。
- 看门狗 15s 一次；连续 2 次失败才判定，避免单次抖动触发重启。

## §3 连接韧性

- 回环代理新增 `GET /healthz`（仅 `127.0.0.1` 监听，天然只对本机可见）：
  ```json
  {"ok": true, "port": 47000, "target": "https://voice.example.com", "last_upstream_error": ""}
  ```
  存活与上游是两件事：无 target 时仍回 200。
- 重启优先复用当前端口；端口变化时：原生通知「本地代理端口已变更，需要重新登录」，然后 `LoadURL` 到新 URL。旧 origin 的 cookie/localStorage 不迁移，这是浏览器模型的边界。
- `proxyErrorHandler` 把错误分类后写入 `lastUpstreamError`（DNS / TLS / 连接拒绝 / 超时 / 其他），并记入宿主日志；页面仍收到现有 6002 信封。
- 前端小改：`apiClient` 对 6002 单独提示「无法连接到服务器（地址或网络）」，不再混在「服务器错误」里。
- 端口文件损坏继续按现有逻辑回落（视为未保存），补测试固化。

## §4 启动与配置

- `loadServerConfig`：文件损坏 / JSON 非法 / URL 校验失败时，把原文件重命名为 `server-config.json.corrupt-<unix>`，内存回落 `""`，宿主日志 + 一次性原生通知。登录页因此显示空服务器地址而不是崩溃。
- 启动期失败统一走 Supervisor：
  - `ensureProxyStarted` 失败 → `Report`（原为仅日志）；
  - 主窗口创建失败 / 嵌入资源缺失 → `Report`；
  - `mygo.App.Run` 返回错误 → 保持现有 `reportFatal`，同时补日志。
- 单实例：拿不到锁时记录日志后退出（不抢已有实例焦点），行为不变。

## §5 可观测与测试

- 所有 Supervisor 动作写入现有客户端日志 ring（scope `supervisor`），崩溃窗与导出日志可见。
- 状态机为纯函数 `decide(state, event, now) → action`，表驱动单测：
  - 预算内重启、预算耗尽进终态；
  - 退避序列与成功清零；
  - 探针单次失败不触发、连续两次才触发；
  - 端口变化产生「通知 + 重载到新 URL」而不是普通重载。
- 适配器测试用假 pageOps/proxyOps/hostOps：重载次数、通知去重、Restart 端口返回。
- `/healthz` handler 单测：无 target 仍 200、响应不含敏感信息（不返回 cookie/密钥）。
- 渲染进程崩溃用事件注入测试；CI 不真的杀 WebView2 renderer。
- 既有 proxyserver / crash / config 测试保持通过。

## 交付顺序

1. `/healthz` + 上游错误分类 + `proxyOps` 适配器（可独立上线）。
2. Supervisor 状态机与页面自愈（`OnRenderProcessGone` / 外壳加载失败）。
3. 代理看门狗与端口变化通知。
4. 配置损坏备份与启动期失败接入崩溃窗。
5. 前端 6002 提示文案。