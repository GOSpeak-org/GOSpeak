<div align="center">
  <img src=".github/assets/logo.png" alt="GOSpeak" width="128" height="128" />

  <h1>GOSpeak</h1>

  <p>
    <a href="https://go.dev" target="_blank"><img src="https://img.shields.io/badge/Go-1.27+-00ADD8?logo=go&logoColor=white" alt="Go" /></a>
    <a href="https://react.dev" target="_blank"><img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" alt="React 19" /></a>
    <a href="https://www.livekit.io" target="_blank"><img src="https://img.shields.io/badge/SFU-LiveKit-0fa5ab?logo=livekit" alt="LiveKit" /></a>
    <a href="https://www.apache.org/licenses/LICENSE-2.0" target="_blank"><img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="License" /></a>
    <br />
    <a href="https://awesomemygo.dev/apps/gospeak" target="_blank"><img src="https://awesomemygo.dev/badge.svg" alt="Listed on Awesome MyGo" /></a>
  </p>
</div>

GOSpeak 是一个自托管的游戏语音平台，基于 LiveKit 提供音视频能力。单个二进制即可运行，前端内嵌，提供语音房间、发言检测、逐人音量控制、房间权限与原生桌面客户端。

> **仓库结构**：本仓库是**聚合壳**，只用 submodule 把三个子仓锚定在一起，方便一次 `git clone --recursive` 拿全部。开发请直接 clone 对应子仓，不要在壳里的 `server/` `client/` `docs/` 目录改代码（它们是 submodule，默认处于游离 HEAD，提交会丢）。
>
> | 目录 | 仓库 | 说明 |
> |---|---|---|
> | `server/` | GOSpeak-Server | Go 后端、部署、文档 |
> | `client/` | GOSpeak-Client | Web / 桌面 / 移动 / 共享规则 |
> | `docs/` | GOSpeak-Docs | VitePress 文档站 |

## 界面预览

<div align="center">
  <img src=".github/assets/screenshots/room.jpg" alt="语音房间" width="100%" />
  <p><em><strong>语音房间</strong> — 频道树与人数上限、发言检测光圈、成员面板、屏幕共享与分辨率切换</em></p>
</div>

<table>
  <tr>
    <td width="50%" valign="top">
      <img src=".github/assets/screenshots/login.jpg" alt="登录页" />
      <p><em><strong>登录页</strong> — 自托管实例，无第三方鉴权依赖</em></p>
    </td>
    <td width="50%" valign="top">
      <img src=".github/assets/screenshots/domains.jpg" alt="发现域" />
      <p><em><strong>发现域</strong> — 公开域检索、邀请码加入、已加入域快捷入口</em></p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src=".github/assets/screenshots/invite.jpg" alt="邀请码" />
      <p><em><strong>邀请码</strong> — 按域生成、可停用、附使用记录</em></p>
    </td>
    <td width="50%" valign="top">
      <img src=".github/assets/screenshots/chat.jpg" alt="文字消息" />
      <p><em><strong>文字消息</strong> — 频道与私聊会话列表，右侧显示在线成员</em></p>
    </td>
  </tr>
</table>

### 设置

<table>
  <tr>
    <td width="50%" valign="top">
      <img src=".github/assets/screenshots/settings-audio.jpg" alt="音频设置" />
      <p><em><strong>音频</strong> — 设备热切换、麦克风电平测试、语音通话 / 音乐双模式、码率与采样率</em></p>
    </td>
    <td width="50%" valign="top">
      <img src=".github/assets/screenshots/settings-voice.jpg" alt="语音设置" />
      <p><em><strong>语音</strong> — 进房默认静音、进出房提示音、本机输入输出音量</em></p>
    </td>
  </tr>
  <tr>
    <td colspan="2" valign="top">
      <img src=".github/assets/screenshots/settings-appearance.jpg" alt="外观设置" />
      <p><em><strong>外观</strong> — 浅色与深色主题分别保存，多套配色可选</em></p>
    </td>
  </tr>
</table>

## 特性

**语音**

- 语音房间：创建与加入，支持密码保护与人数上限。
- 发言检测：实时语音活动指示，显示当前正在说话的成员。
- 逐人音量：为每位成员单独调节输出音量，设置持久保存。
- 麦克风与静音：一键闭麦、一键静音所有声音。
- 屏幕共享：按需订阅，支持分辨率切换。
- 同源 LiveKit：内置 `/livekit` 反向代理，信令走应用域名，媒体走 WebRTC UDP 直连。

**文字**

- 文字消息：频道与私聊会话，支持提及与表情回应。

**域与权限**

- 发现域：公开域检索、邀请码加入、已加入域快捷入口。
- 邀请码：按域生成、可停用、附使用记录。
- 角色权限：完整的角色权限体系。
- 房间管理：创建者与管理员可强制静音、踢出成员、全员静音。
- 用户禁言：管理员可全局禁言/解禁用户（定时或永久），含媒体层强制状态与实时事件通知。

**部署**

- 单二进制部署：前端通过 `go:embed` 内嵌，下载即用。
- 内置 Caddy：传入域名即可自动申请 HTTPS 证书并处理 WebSocket 升级。
- 渐进式数据库：SQLite、PostgreSQL、MySQL、Turso（libSQL），由 GORM 自动迁移。
- 多种认证方式：JWT 与 OAuth2（GitHub、Google、QQ）。
- 可选组件：对象存储（RustFS、R2）与可观测性（Prometheus、Grafana、Loki）。

**客户端**

- 原生桌面客户端：关窗进托盘、开机自启、全局快捷键、系统通知、游戏内覆盖层，与网页版共用同一套前端。
- 前端错误边界：组件、页面、路由三层兜底与全局错误上报。

## 快速开始

### 单二进制

一条命令装好应用与 LiveKit（自动识别平台、取最新发行包、校验 SHA256）：

```bash
curl -fsSL https://raw.githubusercontent.com/GOSpeak-org/GOSpeak-Server/release/deploy/install-binary.sh | bash
```

默认装到 `/opt/gospeak`，生成 `.env` 与 systemd 服务；重复执行即升级。加 `--dry-run` 只看要下载什么。详见 [单二进制部署](https://github.com/GOSpeak-org/GOSpeak-Docs/blob/release/deploy/binary.md)。

也可以手动从 [Releases](https://github.com/GOSpeak-org/GOSpeak-Server/releases) 下载对应平台的 `gospeak-*` 文件，前端已内嵌，无需其他依赖。

```bash
chmod +x gospeak-server-v<VERSION>-linux-amd64
./gospeak-server-v<VERSION>-linux-amd64 server -e prod
```

浏览器打开 `http://<host>:8998`。首次启动自动创建管理员账号，用户名 `admin`，默认密码 `admin123`，生产环境请立即修改。

### 源码开发

需要 Go 1.27.4+、Node.js 22+、pnpm 10+ 与 Docker。前后端已拆到两个子仓，分别 clone：

```bash
git clone https://github.com/GOSpeak-org/GOSpeak-Server.git
git clone https://github.com/GOSpeak-org/GOSpeak-Client.git

# 后端：生成 deploy/.env（含随机 LiveKit 凭证），起依赖后跑服务
cd GOSpeak-Server
pnpm install
cd deploy && ./init.sh && cd ..
docker compose -f deploy/docker-compose.yml up -d
cd server && go run main.go server
```

`./init.sh` 生成唯一配置文件 `deploy/.env`，并随机写入 LiveKit 凭证。全档位版 `docker-compose.standard.yml` 把 7880 绑定到宿主机回环地址供本地直连调试；精简版 `docker-compose.yml` 则是 `7880:7880` 对公网发布，生产勿用。

前端在 [GOSpeak-Client](https://github.com/GOSpeak-org/GOSpeak-Client)，在该仓运行 `pnpm install` 后 `pnpm --filter @gospeak/web dev`。

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

放行 `80/443`（反向代理）、`7882/tcp+udp`（媒体）、`3478/udp`（TURN）。全档位版的 7880 仅绑定宿主机回环地址用于本地调试（精简版仍以 `7880:7880` 对公网发布），信令经同源 `/livekit` 代理。

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

桌面客户端与网页版共用同一套前端，提供浏览器不具备的能力：关窗进托盘、全局快捷键（在游戏内生效）、开机自启、系统通知、游戏内覆盖层。构建与开发说明见 [desktop/README.md](https://github.com/GOSpeak-org/GOSpeak-Client/blob/release/desktop/README.md) 与 [桌面客户端文档](https://github.com/GOSpeak-org/GOSpeak-Docs/blob/release/guide/desktop.md)。

## 文档

- [部署指南](https://github.com/GOSpeak-org/GOSpeak-Server/blob/release/docs/deployment-guide.md)
- [桌面客户端](https://github.com/GOSpeak-org/GOSpeak-Docs/blob/release/guide/desktop.md)
- [SFU 配置与成熟度](https://github.com/GOSpeak-org/GOSpeak-Server/blob/release/docs/sfu-provider-maturity.md)
- [架构设计](https://github.com/GOSpeak-org/GOSpeak-Docs/blob/release/architecture/index.md)
- [开发者指南](https://github.com/GOSpeak-org/GOSpeak-Server/blob/release/server/AGENTS.md)

## 贡献

欢迎提交 PR 与 Issue，较大的改动请先开 Issue 讨论。提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/)，前端子仓由 commitlint 与 lefthook 强制执行。

## License

Apache 2.0，见 [LICENSE](./LICENSE)。
