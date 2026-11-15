// Package buildinfo 承载构建时注入的版本信息。
//
// Dockerfile 与 .github/workflows/release.yml 通过 ldflags 注入：
//
//	-X 'GOSpeak/internal/buildinfo.Version=<ver>' -X 'GOSpeak/internal/buildinfo.Commit=<sha>'
//
// 未注入时（dev 热重载、go run、本地 go build）以仓库根 VERSION 文件为准：
// cmd 启动时调用 ResolveVersion 读取该文件，VERSION 是版本的权威来源。
// cmd（cobra version 命令）与 internal/service（系统更新检查）均从此处读取，
// 避免 internal 反向依赖入口包。
package buildinfo

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

var (
	// Version 默认 dev，构建时注入或由 ResolveVersion 从 VERSION 文件读取。
	Version = "dev"
	// Commit 默认 unknown，构建时注入。
	Commit = "unknown"
)

const versionFileName = "VERSION"

// semverPattern 只接受形如 1.2.3 / 1.2.3-rc.1 的内容，
// 防止误把占位文本（如 dev）当成可比较的版本号。
var semverPattern = regexp.MustCompile(`^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$`)

// ResolveVersion 在 ldflags 未注入版本（仍为 dev）时，从仓库根 VERSION 文件补全版本。
// 查找顺序覆盖：当前目录、上两级目录（app/server 运行）、可执行文件同级与上三级目录
// （air 的 app/server/tmp/main）。找不到或内容非法时保持 dev。
func ResolveVersion() {
	if Version != "dev" {
		return
	}
	if v := readVersionFile(); v != "" {
		Version = v
	}
}

func readVersionFile() string {
	candidates := []string{
		versionFileName,
		filepath.Join("..", "..", versionFileName),
	}
	if exe, err := os.Executable(); err == nil {
		dir := filepath.Dir(exe)
		candidates = append(candidates,
			filepath.Join(dir, versionFileName),
			filepath.Join(dir, "..", "..", versionFileName),
			filepath.Join(dir, "..", "..", "..", versionFileName),
		)
	}
	for _, path := range candidates {
		raw, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		version := strings.TrimSpace(string(raw))
		if semverPattern.MatchString(version) {
			return version
		}
	}
	return ""
}
