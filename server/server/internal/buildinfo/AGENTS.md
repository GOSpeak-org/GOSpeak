# buildinfo 模块

版本信息来源。

## API

- `ResolveVersion()`：启动时确定版本号。
- `readInfoFile(name)`：读版本文件（`VERSION` / `COMMIT`）。查找顺序为当前目录 → 上一级 → 上两级，再加上可执行文件同目录与其上两/三级，覆盖 `server/server` 运行目录与 air 的 `tmp/main`。
- `semverPattern`：校验 `X.Y.Z[-pre]` 形态。

## 版本文件位置

- 版本文件是 **`server/VERSION`**（不是仓库根）。Go 模块在 `server/server`，从模块目录运行 `go run main.go` 时按 `VERSION`、`../VERSION` 顺序命中它。
- `COMMIT` 同理由镜像/发布流水线写入，本地开发通常不存在，此时 `Commit` 保持 `unknown`。

## 优先级

链接期 `ldflags` 注入 > `VERSION` 文件 > 兜底默认值。发布时由 `.github/workflows/` 的发版编排用 `-ldflags` 覆盖，本地开发走文件。

## 约束

- 版本号必须与 `.github/versions/*.yaml` 的声明一致，由根 `scripts/release/check-version.mjs` 在 CI 校验（`server` 组件比对 `server/VERSION` 与 `server/server/package.json`）。
- 不要在多处硬编码版本字符串；改完版本跑 `node scripts/release/check-version.mjs . '' server` 可发现不一致。
- `go run main.go version` 是用户可见输出，改格式要考虑脚本解析。
