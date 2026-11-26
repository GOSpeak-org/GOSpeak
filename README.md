# GOSpeak

这是**聚合壳仓库**，只用 submodule 把三个子仓锚定在一起，方便一次 `git clone --recursive` 拿全部。

| 目录 | 仓库 | 说明 |
|---|---|---|
| `server/` | GOSpeak-Server | Go 后端、部署、文档 |
| `client/` | GOSpeak-Client | Web / 桌面 / 移动 / 共享规则 |
| `docs/` | GOSpeak-Docs | VitePress 文档站 |

## 开发请直接 clone 对应子仓

```bash
git clone https://github.com/GOSpeak-org/GOSpeak-Client.git
```

**不要在壳里改代码**：三个目录是 submodule，默认处于游离 HEAD，直接提交会丢。
