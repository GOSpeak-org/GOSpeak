# deploy — 部署编排

`deploy/` 是部署的唯一入口。**权威文档是 [DEPLOY.md](DEPLOY.md)**，本文件只写约定。

## 文件

| 文件 | 用途 |
|------|------|
| `docker-compose.yml` | 全档位编排（app/livekit/edge/postgres/rustfs/observability） |
| `docker-compose.simple.yml` | 精简档位 |
| `.env.example` | 统一配置模板（生成 `deploy/.env`） |
| `init.sh` | 生成 `.env`（含随机密钥）、归一 `livekit.yaml`、一致性校验 |
| `install-binary.sh` | curl 直跑的单二进制安装脚本：下载当前平台最新的 GOSpeak + LiveKit 发行包、校验、生成配置与 systemd 单元 |
| `Caddyfile` | 内置边缘（profile `edge`）：自动 HTTPS |
| `livekit/*.yaml` | LiveKit 配置（docker / local 两种形态） |
| `observability/` | prometheus / alertmanager / grafana / loki / promtail |

## 档位（`COMPOSE_PROFILES`）

`app`（默认）、`livekit`（默认）、`edge`（内置 Caddy）、`postgres`、`rustfs`、`observability`。改档位就是改 `.env` 里的 `COMPOSE_PROFILES`。

## 关键约定

- **`deploy/.env` 是唯一配置文件**，compose 插值与应用环境变量共用同一份；应用加载优先级见 `app/server/internal/config/config.go`。**不要提交 `.env`**。
- **只需要一个域名、一个上游**：Caddy 反代只面对 `gospeak:8998`，`/api` `/ws` `/uploads` `/livekit` 全在同一上游；LiveKit 不需要独立域名/证书，媒体走 UDP 直连。
- **密钥不进 `livekit.yaml`**：由 `init.sh` 归一后只留在 `.env`。
- `init.sh --check` 只做一致性校验、不写文件，CI 会跑；改 `.env.example` / `livekit.yaml` / `Caddyfile` 任一处都要保证校验通过。
- 改编排要同步 `DEPLOY.md` 与 `app/docs/deploy/*`。

## 常用

```bash
cd deploy && ./init.sh --domain voice.example.com && docker compose up -d
./init.sh --check      # 只校验
```
