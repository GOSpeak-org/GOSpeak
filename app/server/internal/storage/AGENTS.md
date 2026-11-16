# storage 模块

对象存储抽象：local 与 S3 兼容后端，外加密钥加解密工具。

## 文件

| 文件 | 职责 |
|------|------|
| `provider.go` | `Provider` 接口 + `PresignedResult` |
| `local.go` | `LocalProvider`：落盘 + `/uploads` 同源访问 |
| `s3.go` | `S3Provider`：预签名直传 |
| `crypto.go` | `Cipher`：`Encrypt`/`Decrypt`、`EncryptSecret`/`DecryptSecret`、`InitCipher` |

## Provider 接口

`PresignUpload(key, contentType, size)`、`UploadFromReader`、`GetPublicURL`、`Delete`、`TestConnection`、`HeadObjectSize`。

## 易错点

- **S3 预签名的 `size` 会写进 `ContentLength` 签名**：客户端实际字节数必须与之一致，否则上传失败。前端必须先取真实 size。
- 本地上传目录与 `/uploads` 静态服务共用 `STORAGE_LOCAL_DIR`（默认 `./uploads`）；`STORAGE_PATH_PREFIX` 只影响 S3 对象键，本地忽略，避免 `/uploads/uploads/...`。
- 生产必须配置 `STORAGE_ENCRYPT_KEY`（64 位 hex）；dev 有全零兜底键，**不要在生产依赖兜底**。
- 上传完成后用 `HeadObjectSize` 复核大小，不要信任客户端声明。
- 对象键必须经过安全校验（拒绝路径穿越），local provider 的 `resolvePath` 负责。
