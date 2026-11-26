# GOSpeak

> **仓库结构说明**：本仓库目前是**聚合壳**，只通过 submodule 锚定三个子仓。开发请直接 clone 对应子仓，不要在壳里的 `server/` `client/` `docs/` 目录改代码（它们处于游离 HEAD，提交会丢）。

| 目录 | 仓库 | 说明 |
|---|---|---|
| `server/` | GOSpeak-Server | Go 后端、集成测试、部署与工程文档 |
| `client/` | GOSpeak-Client | Web / 桌面 / 移动 / 共享规则 |
| `docs/` | GOSpeak-Docs | VitePress 文档站 |

一次拉取全部：`git clone --recursive https://github.com/GOSpeak-org/GOSpeak.git`

以下为 GOSpeak 项目介绍与原有快速开始说明；其中的路径与命令以各子仓 `release` 分支为准。

<p>
    <a href="https://go.dev" target="_blank"><img src="https://img.shields.io/badge/Go-1.27+-00ADD8?logo=go&logoColor=white" alt="Go" /></a>
    <a href="https://react.dev" target="_blank"><img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" alt="React 19" /></a>
    <a href="https://www.livekit.io" target="_blank"><img src="https://img.shields.io/badge/SFU-LiveKit-0fa5ab?logo=livekit" alt="LiveKit" /></a>
    <a href="https://www.apache.org/licenses/LICENSE-2.0" target="_blank"><img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="License" /></a>
    <br />
    <a href="https://awesomemygo.dev/apps/gospeak" target="_blank"><img src="https://awesomemygo.dev/badge.svg" alt="Listed on Awesome MyGo" /></a>
</p>

GOSpeak 是一个自托管的游戏语音平台，基于 LiveKit 提供音视频能力。单个二进制即可运行，前端内嵌，提供语音房间、发言检测、逐人音量控制、房间权限与原生桌面客户端。

## 特性

- 文字消息：频道与私聊会话，支持提及与表情回应。
- 语音房间：创建与加入，支持密码保护与人数上限。
- 发言检测：实时语音活动指示，显示当前正在说话的成员。
- 逐人音量：为每位成员单独调节输出音量，设置持久保存。
- 麦克风与静音：一键闭麦、一键静音所有声音。
- 房间管理：创建者与管理员可强制静音、踢出成员、全员静音。
- 用户禁言：管理员可全局禁言/解禁用户（定时或永久），含媒体层强制状态与实时事件通知。
- 角色权限：完整的角色权限体系。
- 单二进制部署：前端通过 `go:embed` 内嵌，下载即用。
- 同源 LiveKit：内置 `/livekit` 反向代理，信令走应用域名，媒体走 WebRTC UDP 直连。
- 内置 Caddy：传入域名即可自动申请 HTTPS 证书并处理 WebSocket 升级。
- 渐进式数据库：SQLite、PostgreSQL、MySQL、Turso（libSQL），由 GORM 自动迁移。
- 多种认证方式：JWT 与 OAuth2（GitHub、Google、QQ）。
- 可选组件：对象存储（RustFS、R2）与可观测性（Prometheus、Grafana、Loki）。
- 原生桌面客户端：关窗进托盘、开机自启、全局快捷键、系统通知、游戏内覆盖层，与网页版共用同一套前端。
- 前端错误边界：组件、页面、路由三层兜底与全局错误上报。

## 快速开始

### 单二进制

一条命令装好应用与 LiveKit（自动识别平台、取最新发行包、校验 SHA256）：

```bash
curl -fsSL https://raw.githubusercontent.com/GOSpeak-org/GOSpeak-Server/release/deploy/install-binary.sh | bash
```

默认装到 `/opt/gospeak`，生成 `.env` 与 systemd 服务；重复执行即升级。加 `--dry-run` 只看要下载什么。详见 [单二进制部署](https://github.com/GOSpeak-org/GOSpeak-Server/blob/release/docs/deploy/binary.md)。

也可以手动从 [Releases](https://github.com/GOSpeak-org/GOSpeak-Server/releases) 下载对应平台的 `gospeak-*` 文件，前端已内嵌，无需其他依赖。

```bash
chmod +x gospeak-server-v<VERSION>-linux-amd64
./gospeak-server-v<VERSION>-linux-amd64 server -e prod
```

浏览器打开 `http://<host>:8998`。首次启动自动创建管理员账号，用户名 `admin`，默认密码 `admin123`，生产环境请立即修改。

### 源码开发

需要 Go 1.27.4+、Node.js 22+、pnpm 10+ 与 Docker。

```bash
git clone https://github.com/GOSpeak-org/GOSpeak-Server.git
cd GOSpeak
pnpm install

cd deploy && ./init.sh && cd ..
docker compose -f deploy/docker-compose.yml up -d
pnpm start:dev
```

`./init.sh` 生成唯一配置文件 `deploy/.env`，并随机写入 LiveKit 凭证。本地 LiveKit 容器的 7880 端口绑定到宿主机回环地址，后端直连即可。

## 部署

完整说明见 [deploy/DEPLOY.md](https://github.com/GOSpeak-org/GOSpeak-Server/blob/release/deploy/DEPLOY.md)。部署只需要一个域名与一个上游。

### 使用域名

```bash
cd deploy
./init.sh --domain voice.example.com
cd ..
docker compose -f deploy/docker-compose.standard.yml up -d --build
```

`--domain` 将 `edge` 加入 `COMPOSE_PROFILES`；只有全档位版 `docker-compose.standard.yml` 会读取该变量并启动内置 Caddy 自动申请 HTTPS 证书。浏览器打开 `https://voice.example.com`。精简版 `docker-compose.yml` 不含 Caddy，裸 `docker compose up -d` 不会启用 HTTPS。

### 使用已有反向代理

```bash
cd deploy
./init.sh
cd ..
docker compose -f deploy/docker-compose.yml up -d --build
```

不传 `--domain`，用精简版即可。将反向代理指向 `gospeak:8998` 这一个上游。`/api`、`/ws`、`/uploads`、`/livekit` 全部由应用提供，LiveKit 不需要单独的域名、证书或代理规则。

内置入口是 Caddy（`deploy/Caddyfile`）：填 `--domain` 时由 `edge` 档位自动签发证书并升级 WebSocket，留空则由你现有的 Nginx / Traefik 等反代接管。已有反代的接法与各类症状排查见 [反向代理文档](https://github.com/GOSpeak-org/GOSpeak-Docs/blob/release/deploy/reverse-proxy.md)。

### 局域网

不传 `--domain`，直接访问 `http://<IP>:8998`。浏览器麦克风需要 localhost 或 HTTPS。

### 端口

放行 `80/443`（反向代理）、`7882/tcp+udp`（媒体）、`3478/udp`（TURN）。7880 仅绑定宿主机回环地址用于本地调试，信令经同源 `/livekit` 代理。

### 可选组件

```env
DB_TYPE="SQLite"                                      # 默认，无外部依赖
DB_TYPE="PostgreSQL"  DB_HOST=postgres  DB_PORT=5432  # 或在 COMPOSE_PROFILES 追加 postgres
DB_TYPE="Turso"      TURSO_DATABASE_URL=...          # libSQL 远程数据库（可选）

# COMPOSE_PROFILES 可选档位
# rustfs         对象存储
# observability  Prometheus + Grafana + Loki
```

## 桌面客户端

桌面客户端与网页版共用同一套前端，提供浏览器不具备的能力：关窗进托盘、全局快捷键（在游戏内生效）、开机自启、系统通知、游戏内覆盖层。构建与开发说明见 [app/desktop/README.md](https://github.com/GOSpeak-org/GOSpeak-Client/blob/release/desktop/README.md) 与 [桌面客户端文档](https://github.com/GOSpeak-org/GOSpeak-Docs/blob/release/guide/desktop.md)。

## 文档

- [部署指南](https://github.com/GOSpeak-org/GOSpeak-Server/blob/release/docs/deployment-guide.md)
- [桌面客户端](https://github.com/GOSpeak-org/GOSpeak-Docs/blob/release/guide/desktop.md)
- [SFU 配置与成熟度](https://github.com/GOSpeak-org/GOSpeak-Server/blob/release/docs/sfu-provider-maturity.md)
- [架构设计](https://github.com/GOSpeak-org/GOSpeak-Server/blob/release/docs/architecture/index.md)
- [开发者指南](https://github.com/GOSpeak-org/GOSpeak-Server/blob/release/server/AGENTS.md)

## 贡献

欢迎提交 PR 与 Issue，较大的改动请先开 Issue 讨论。提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/)，由 commitlint 与 lefthook 强制执行。

## License

Apache 2.0，见 [LICENSE](./LICENSE)。
