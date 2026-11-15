# 桌面端 Supervisor 自愈 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `app/desktop` 宿主在页面渲染进程崩溃、回环代理失活、配置损坏、启动失败时自动恢复，恢复不了则进原生崩溃窗并留下可诊断记录。

**Architecture:** 一个进程内 Supervisor 协程持有页面/代理两个组件的重启预算与退避；决策是纯函数（可表驱动单测），动作经 pageOps/proxyOps/hostOps 三个窄接口执行。代理新增本机 `/healthz`，看门狗按 15s 探测；配置损坏备份后回落；启动期错误统一交给现有崩溃窗。

**Tech Stack:** Go 1.27（`app/desktop` 独立 module）· MyGo v0.8.3（`OnRenderProcessGone`、`OnDidFailLoad`、`RunOnMain`、`NewNotification`）· 标准库 `net/http`、`testing`

## Global Constraints

- 只改 `app/desktop` 与一处前端提示（`app/web/src/api/apiClient.ts`、`app/web/src/utils/apiError.ts`），不动服务器与协议。
- 代码注释沿用现有风格：Go 宿主用英文短注释解释「为什么」，不写废话注释。
- 不引入新 Go 依赖。
- 提交信息使用 Conventional Commits；每个任务单独提交。
- 测试命令统一：`cd app/desktop && go test ./...`（全量）或 `go test -run <Name> ./...`。
- 不修改 `crashwindow.go` 的行为；Supervisor 只是它新的调用方。

---

### Task 1: 代理 `/healthz` 与上游错误分类

**Files:**
- Modify: `app/desktop/proxyserver.go`
- Modify: `app/desktop/proxyserver_test.go:40-53`（`newTestReverseProxy`）
- Modify: `app/desktop/proxyserver_security_test.go:45-55`（同样换 handler）
- Test: `app/desktop/proxyserver_test.go`

**Interfaces:**
- Produces:
  - `type proxyServer` 新增字段 `port int`、`errMu sync.Mutex`、`lastUpstreamError string`
  - `func (s *proxyServer) handleHealthz(w http.ResponseWriter, r *http.Request)`
  - `func (s *proxyServer) proxyErrorHandler(w http.ResponseWriter, r *http.Request, err error)`
  - `func (s *proxyServer) UpstreamError() string`
  - `func classifyProxyError(err error) string`（返回值：`"" | "dns" | "tls" | "timeout" | "refused" | "other"`）

- [ ] **Step 1: 写失败测试（分类函数 + healthz）**

在 `app/desktop/proxyserver_test.go` 末尾追加：

```go
func TestClassifyProxyError(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want string
	}{
		{"nil", nil, ""},
		{"dns", &net.DNSError{Err: "no such host", Name: "x"}, "dns"},
		{"timeout", context.DeadlineExceeded, "timeout"},
		{"refused", errors.New("dial tcp 127.0.0.1:8998: connect: connection refused"), "refused"},
		{"other", errors.New("boom"), "other"},
	}
	for _, tc := range cases {
		if got := classifyProxyError(tc.err); got != tc.want {
			t.Errorf("%s: got %q, want %q", tc.name, got, tc.want)
		}
	}
}

func TestHealthzReportsLivenessWithoutTarget(t *testing.T) {
	s := &proxyServer{assets: newAssetCache(), transport: newProxyRoundTripper(), port: 47000}
	rec := httptest.NewRecorder()
	s.handleHealthz(rec, httptest.NewRequest(http.MethodGet, "/healthz", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var body struct {
		OK     bool   `json:"ok"`
		Port   int    `json:"port"`
		Target string `json:"target"`
		Last   string `json:"last_upstream_error"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if !body.OK || body.Port != 47000 || body.Target != "" || body.Last != "" {
		t.Fatalf("unexpected body: %+v", body)
	}
}

func TestProxyErrorHandlerRecordsUpstreamError(t *testing.T) {
	s := &proxyServer{assets: newAssetCache(), transport: newProxyRoundTripper()}
	rec := httptest.NewRecorder()
	s.proxyErrorHandler(rec, httptest.NewRequest(http.MethodGet, "/api/v1/x", nil), errors.New("dial tcp: connect: connection refused"))

	if got := s.UpstreamError(); got != "refused" {
		t.Fatalf("UpstreamError() = %q, want refused", got)
	}
	if rec.Code != http.StatusBadGateway {
		t.Fatalf("status = %d, want 502", rec.Code)
	}
}
```

并在文件顶部 import 块补 `"context"`、`"errors"`、`"net"`。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd app/desktop && go test -run 'TestClassifyProxyError|TestHealthzReportsLivenessWithoutTarget|TestProxyErrorHandlerRecordsUpstreamError' ./...`
Expected: FAIL（`undefined: classifyProxyError`、`s.handleHealthz undefined` 等）

- [ ] **Step 3: 实现**

`proxyserver.go` 结构体加字段：

```go
type proxyServer struct {
	mu     sync.RWMutex
	target *url.URL

	port int // loopback port, for /healthz and the watchdog

	errMu             sync.Mutex
	lastUpstreamError string

	// ... 其余字段不变
}
```

`handler()` 里在 `/` 之前注册：

```go
	// Liveness only: answer from this process without touching the backend.
	mux.HandleFunc("/healthz", s.handleHealthz)
```

新函数（放在 `handleProxied` 附近）：

```go
func (s *proxyServer) handleHealthz(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	s.mu.RLock()
	target := ""
	if s.target != nil {
		target = s.target.String()
	}
	s.mu.RUnlock()
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"ok":                  true,
		"port":                s.port,
		"target":              target,
		"last_upstream_error": s.UpstreamError(),
	})
}

func (s *proxyServer) UpstreamError() string {
	s.errMu.Lock()
	defer s.errMu.Unlock()
	return s.lastUpstreamError
}

func (s *proxyServer) recordUpstreamError(err error) {
	kind := classifyProxyError(err)
	if kind == "" {
		return
	}
	s.errMu.Lock()
	s.lastUpstreamError = kind
	s.errMu.Unlock()
}

func classifyProxyError(err error) string {
	if err == nil {
		return ""
	}
	var dnsErr *net.DNSError
	if errors.As(err, &dnsErr) {
		return "dns"
	}
	var verifyErr *tls.CertificateVerificationError
	if errors.As(err, &verifyErr) {
		return "tls"
	}
	if errors.Is(err, context.DeadlineExceeded) || os.IsTimeout(err) {
		return "timeout"
	}
	if strings.Contains(err.Error(), "connection refused") {
		return "refused"
	}
	return "other"
}
```

把 `proxyErrorHandler` 改成方法（原函数体保留，前面加记录与日志）：

```go
func (s *proxyServer) proxyErrorHandler(w http.ResponseWriter, r *http.Request, err error) {
	s.recordUpstreamError(err)
	log.Printf("[GOSpeak] loopback proxy: %s %s -> %v (%s)", r.Method, r.URL.Path, err, s.UpstreamError())
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusBadGateway)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"code": 6002,
		"msg":  "backend unreachable",
		"data": nil,
	})
}
```

把三处 `ErrorHandler: proxyErrorHandler` 改为 `ErrorHandler: s.proxyErrorHandler`（`startProxyServer`、`workerFor`、测试 helper `newTestReverseProxy`、安全测试里的 helper）。

`startProxyServer` 里创建 `s` 之后补 `s.port = port`（在 `listenLoopback` 返回后赋值）。

新增 import：`"context"`、`"crypto/tls"`、`"errors"`、`"os"`（其余已在）。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd app/desktop && go test ./...`
Expected: PASS（全部）

- [ ] **Step 5: 提交**

```bash
git add app/desktop/proxyserver.go app/desktop/proxyserver_test.go app/desktop/proxyserver_security_test.go
git commit -m "feat(desktop): 回环代理新增 /healthz 并分类记录上游错误"
```

---

### Task 2: 本机探针与代理重启

**Files:**
- Modify: `app/desktop/proxyserver.go`
- Test: `app/desktop/proxyserver_test.go`

**Interfaces:**
- Consumes: `listenLoopback(dir string) (net.Listener, int, error)`（`proxyport.go`）、`proxyPortDir()`
- Produces:
  - `type proxyServer` 新增 `listener net.Listener`、`srv *http.Server`
  - `func probeLoopback(port int) error`
  - `func (s *proxyServer) restart() (oldPort, newPort int, err error)`
  - `func proxyPort() int`（`loopbackProxy` 为 nil 时返回 0）

- [ ] **Step 1: 写失败测试**

`app/desktop/proxyserver_test.go` 追加：

```go
// 测试文件顶部 import 需补 "net/url" 与 "strconv"（若尚未存在）。
func TestProbeLoopbackHealthyServer(t *testing.T) {
	s := &proxyServer{dist: testDist(), assets: newAssetCache(), transport: newProxyRoundTripper()}
	s.port = 1
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", s.handleHealthz)
	srv := httptest.NewServer(mux)
	defer srv.Close()

	u, _ := url.Parse(srv.URL)
	port, _ := strconv.Atoi(u.Port())
	if err := probeLoopback(port); err != nil {
		t.Fatalf("probe healthy server: %v", err)
	}
}

func TestProbeLoopbackClosedPort(t *testing.T) {
	if err := probeLoopback(1); err == nil {
		t.Fatal("expected an error probing a closed port")
	}
}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd app/desktop && go test -run 'TestProbeLoopback' ./...`
Expected: FAIL（`undefined: probeLoopback`）

- [ ] **Step 3: 实现**

结构体字段：

```go
	listener net.Listener
	srv      *http.Server
```

`startProxyServer` 中保存：

```go
	s.listener = listener
	s.port = port
	s.srv = srv
```

新函数：

```go
// probeLoopback checks the local proxy from the host side. It never goes to the
// backend: /healthz is answered by this process.
func probeLoopback(port int) error {
	if port == 0 {
		return errors.New("proxy: not listening")
	}
	client := &http.Client{
		Transport: &http.Transport{Proxy: nil},
		Timeout:   2 * time.Second,
	}
	resp, err := client.Get(fmt.Sprintf("http://127.0.0.1:%d/healthz", port))
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("healthz: status %d", resp.StatusCode)
	}
	return nil
}

func (s *proxyServer) restart() (oldPort, newPort int, err error) {
	oldPort = s.port
	if s.srv != nil {
		_ = s.srv.Close()
	}
	if s.listener != nil {
		_ = s.listener.Close()
	}
	ln, port, lerr := listenLoopback(proxyPortDir())
	if lerr != nil {
		return oldPort, 0, lerr
	}
	s.listener = ln
	s.port = port
	s.srv = &http.Server{
		Handler:           s.handler(),
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       120 * time.Second,
	}
	go func(srv *http.Server) { _ = srv.Serve(ln) }(s.srv)
	proxyLoopbackURL = fmt.Sprintf("http://127.0.0.1:%d", port)
	return oldPort, port, nil
}

func proxyPort() int {
	if loopbackProxy == nil {
		return 0
	}
	return loopbackProxy.port
}
```

import 补 `"strconv"` 仅在测试用；实现需要 `"fmt"`、`"time"` 已有。

- [ ] **Step 4: 跑测试**

Run: `cd app/desktop && go test ./...`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add app/desktop/proxyserver.go app/desktop/proxyserver_test.go
git commit -m "feat(desktop): 回环代理可探测、可在原端口重启"
```

---

### Task 3: Supervisor 纯决策函数

**Files:**
- Create: `app/desktop/supervisor.go`
- Create: `app/desktop/supervisor_test.go`

**Interfaces:**
- Produces:
  - `type component int`，常量 `componentPage`、`componentProxy`
  - `type supervisorEventKind int`，常量 `eventPageRenderGone`、`eventPageLoadFailed`、`eventProxyProbeFailed`、`eventProxyProbeOK`、`eventProxyRestarted`
  - `type supervisorEvent struct { kind supervisorEventKind; reason, detail string; oldPort, newPort int }`
  - `type supervisorAction struct { Wait time.Duration; RestartProxy, ReloadPage, Report bool; Notify, ReportReason, ReportDetail string }`
  - `type supervision struct{ attempts map[component][]time.Time; probeFails int }`
  - `func newSupervision() *supervision`
  - `func (s *supervision) decide(ev supervisorEvent, now time.Time) supervisorAction`
  - 常量 `maxRestarts = 3`、`restartWindow = 10 * time.Minute`、`probeFailLimit = 2`

- [ ] **Step 1: 写失败测试**

`app/desktop/supervisor_test.go`：

```go
package main

import (
	"testing"
	"time"
)

func TestDecideRestartsWithinBudget(t *testing.T) {
	s := newSupervision()
	now := time.Unix(1000, 0)

	first := s.decide(supervisorEvent{kind: eventPageRenderGone, reason: "renderer gone"}, now)
	if !first.ReloadPage || first.Wait != 500*time.Millisecond || first.Report {
		t.Fatalf("first: %+v", first)
	}
	second := s.decide(supervisorEvent{kind: eventPageRenderGone}, now.Add(time.Second))
	if second.Wait != time.Second {
		t.Fatalf("second backoff = %v, want 1s", second.Wait)
	}
	third := s.decide(supervisorEvent{kind: eventPageRenderGone}, now.Add(2*time.Second))
	if third.Wait != 2*time.Second {
		t.Fatalf("third backoff = %v, want 2s", third.Wait)
	}
	fourth := s.decide(supervisorEvent{kind: eventPageRenderGone}, now.Add(3*time.Second))
	if !fourth.Report || fourth.ReloadPage {
		t.Fatalf("fourth must report instead of reloading: %+v", fourth)
	}
}

func TestDecideBudgetExpiresAfterWindow(t *testing.T) {
	s := newSupervision()
	now := time.Unix(2000, 0)
	for i := 0; i < maxRestarts; i++ {
		s.decide(supervisorEvent{kind: eventPageLoadFailed}, now.Add(time.Duration(i)*time.Second))
	}
	act := s.decide(supervisorEvent{kind: eventPageLoadFailed}, now.Add(restartWindow+time.Minute))
	if act.Report || act.Wait == 0 {
		t.Fatalf("after the window the budget must reset: %+v", act)
	}
}

func TestDecideProxyProbeNeedsTwoFailures(t *testing.T) {
	s := newSupervision()
	now := time.Unix(3000, 0)

	if act := s.decide(supervisorEvent{kind: eventProxyProbeFailed}, now); act.RestartProxy {
		t.Fatalf("one probe failure must not restart: %+v", act)
	}
	act := s.decide(supervisorEvent{kind: eventProxyProbeFailed}, now.Add(probeInterval))
	if !act.RestartProxy {
		t.Fatalf("second consecutive failure must restart: %+v", act)
	}
	s.decide(supervisorEvent{kind: eventProxyProbeOK}, now.Add(2*probeInterval))
	if act := s.decide(supervisorEvent{kind: eventProxyProbeFailed}, now.Add(3*probeInterval)); act.RestartProxy {
		t.Fatalf("a healthy probe must reset the failure streak: %+v", act)
	}
}

func TestDecidePortChangeNotifiesAndReloads(t *testing.T) {
	s := newSupervision()
	now := time.Unix(4000, 0)
	act := s.decide(supervisorEvent{kind: eventProxyRestarted, oldPort: 47000, newPort: 47001}, now)
	if !act.ReloadPage || act.Notify == "" {
		t.Fatalf("port change must notify and reload: %+v", act)
	}
	act = s.decide(supervisorEvent{kind: eventProxyRestarted, oldPort: 47000, newPort: 47000}, now)
	if !act.ReloadPage || act.Notify != "" {
		t.Fatalf("same port must only reload: %+v", act)
	}
}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd app/desktop && go test -run 'TestDecide' ./...`
Expected: FAIL（`undefined: newSupervision`）

- [ ] **Step 3: 实现**

`app/desktop/supervisor.go`（先只放决策部分）：

```go
package main

import "time"

const (
	maxRestarts   = 3
	restartWindow = 10 * time.Minute
	probeFailLimit = 2
	probeInterval  = 15 * time.Second
)

type component int

const (
	componentPage component = iota
	componentProxy
)

type supervisorEventKind int

const (
	eventPageRenderGone supervisorEventKind = iota
	eventPageLoadFailed
	eventProxyProbeFailed
	eventProxyProbeOK
	eventProxyRestarted
)

type supervisorEvent struct {
	kind     supervisorEventKind
	reason   string
	detail   string
	oldPort  int
	newPort  int
}

type supervisorAction struct {
	Wait         time.Duration
	RestartProxy bool
	ReloadPage   bool
	Report       bool
	Notify       string
	ReportReason string
	ReportDetail string
}

type supervision struct {
	attempts   map[component][]time.Time
	probeFails int
}

func newSupervision() *supervision {
	return &supervision{attempts: map[component][]time.Time{}}
}

var restartBackoff = []time.Duration{500 * time.Millisecond, time.Second, 2 * time.Second}

func (s *supervision) decide(ev supervisorEvent, now time.Time) supervisorAction {
	switch ev.kind {
	case eventProxyProbeOK:
		s.probeFails = 0
		delete(s.attempts, componentProxy)
		return supervisorAction{}
	case eventProxyProbeFailed:
		s.probeFails++
		if s.probeFails < probeFailLimit {
			return supervisorAction{}
		}
		s.probeFails = 0
		return s.restart(componentProxy, ev, now)
	case eventProxyRestarted:
		delete(s.attempts, componentProxy)
		act := supervisorAction{ReloadPage: true}
		if ev.oldPort != ev.newPort {
			act.Notify = "本地代理端口已变更，页面已重新加载，需要重新登录。"
		}
		return act
	case eventPageRenderGone, eventPageLoadFailed:
		return s.restart(componentPage, ev, now)
	default:
		return supervisorAction{}
	}
}

func (s *supervision) restart(comp component, ev supervisorEvent, now time.Time) supervisorAction {
	kept := s.attempts[comp][:0]
	for _, at := range s.attempts[comp] {
		if now.Sub(at) <= restartWindow {
			kept = append(kept, at)
		}
	}
	s.attempts[comp] = kept

	if len(kept) >= maxRestarts {
		detail := ev.detail
		if detail == "" {
			detail = ev.reason
		}
		if detail == "" {
			detail = "no detail"
		}
		return supervisorAction{
			Report:       true,
			ReportReason: "页面或本地代理反复失效，已自动重启 3 次仍未恢复。",
			ReportDetail: detail,
		}
	}

	act := supervisorAction{Wait: restartBackoff[len(kept)]}
	s.attempts[comp] = append(s.attempts[comp], now)
	if comp == componentProxy {
		act.RestartProxy = true
	} else {
		act.ReloadPage = true
	}
	return act
}
```

- [ ] **Step 4: 跑测试**

Run: `cd app/desktop && go test -run 'TestDecide' ./...`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add app/desktop/supervisor.go app/desktop/supervisor_test.go
git commit -m "feat(desktop): Supervisor 重启预算与退避决策"
```

---

### Task 4: Supervisor 运行循环与适配器

**Files:**
- Modify: `app/desktop/supervisor.go`
- Modify: `app/desktop/supervisor_test.go`

**Interfaces:**
- Consumes: Task 3 的决策类型；Task 2 的 `probeLoopback`、`proxyPort`、`(*proxyServer).restart`；`reloadAllWindows()`（`windows.go`）、`reportFatal`（`crashwindow.go`）、`appendHostEntry`（`clientlog.go`）
- Produces:
  - `type pageOps interface { Reload() }`
  - `type proxyOps interface { Probe() error; Restart() (oldPort, newPort int, err error) }`
  - `type hostOps interface { Report(reason, detail string); Notify(title, body string) }`
  - `func newSupervisor(p pageOps, x proxyOps, h hostOps) *supervisor`
  - `func (s *supervisor) Run(ctx context.Context)`
  - `func (s *supervisor) post(ev supervisorEvent)`
  - `var appSupervisor *supervisor`

- [ ] **Step 1: 写失败测试**

`app/desktop/supervisor_test.go` 追加：

```go
type fakePage struct{ reloads int }

func (f *fakePage) Reload() { f.reloads++ }

type fakeProxy struct {
	probeErr   error
	restarts   int
	oldPort    int
	newPort    int
}

func (f *fakeProxy) Probe() error { return f.probeErr }
func (f *fakeProxy) Restart() (int, int, error) {
	f.restarts++
	return f.oldPort, f.newPort, nil
}

type fakeHost struct {
	reports int
	notes   []string
}

func (f *fakeHost) Report(string, string)        { f.reports++ }
func (f *fakeHost) Notify(_ string, body string) { f.notes = append(f.notes, body) }

func TestSupervisorRestartsProxyOnTwoProbeFailures(t *testing.T) {
	page := &fakePage{}
	proxy := &fakeProxy{probeErr: errors.New("down"), oldPort: 47000, newPort: 47001}
	host := &fakeHost{}
	sup := newSupervisor(page, proxy, host)

	sup.handle(supervisorEvent{kind: eventProxyProbeFailed})
	sup.handle(supervisorEvent{kind: eventProxyProbeFailed})
	sup.waitPending()

	if proxy.restarts != 1 {
		t.Fatalf("restarts = %d, want 1", proxy.restarts)
	}
	if page.reloads != 1 {
		t.Fatalf("reloads = %d, want 1", page.reloads)
	}
	if len(host.notes) != 1 {
		t.Fatalf("notes = %v, want one port-change notice", host.notes)
	}
}

func TestSupervisorReportsAfterBudget(t *testing.T) {
	page := &fakePage{}
	host := &fakeHost{}
	sup := newSupervisor(page, &fakeProxy{}, host)

	for i := 0; i < maxRestarts+1; i++ {
		sup.handle(supervisorEvent{kind: eventPageRenderGone, reason: "gone"})
		sup.waitPending()
	}
	if host.reports != 1 {
		t.Fatalf("reports = %d, want 1", host.reports)
	}
	if page.reloads != maxRestarts {
		t.Fatalf("reloads = %d, want %d", page.reloads, maxRestarts)
	}
}
```

import 补 `"context"`、`"errors"`。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd app/desktop && go test -run 'TestSupervisor' ./...`
Expected: FAIL（`undefined: newSupervisor`）

- [ ] **Step 3: 实现**

在 `supervisor.go` 追加以下内容，并把 `context`、`fmt`、`log`、`sync`、`github.com/egoist/mygo` 合并进文件顶部已有的 import 块（Task 3 里只有 `time`）：

```go
import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/egoist/mygo"
)

type pageOps interface{ Reload() }

type proxyOps interface {
	Probe() error
	Restart() (oldPort, newPort int, err error)
}

type hostOps interface {
	Report(reason, detail string)
	Notify(title, body string)
}

type supervisor struct {
	page  pageOps
	proxy proxyOps
	host  hostOps

	state   *supervision
	events  chan supervisorEvent
	pending map[component]bool
	mu      sync.Mutex
}

func newSupervisor(page pageOps, proxy proxyOps, host hostOps) *supervisor {
	return &supervisor{
		page:    page,
		proxy:   proxy,
		host:    host,
		state:   newSupervision(),
		events:  make(chan supervisorEvent, 8),
		pending: map[component]bool{},
	}
}

func (s *supervisor) post(ev supervisorEvent) {
	select {
	case s.events <- ev:
	default:
		log.Printf("[GOSpeak] supervisor: event dropped (%d)", ev.kind)
	}
}

func (s *supervisor) Run(ctx context.Context) {
	ticker := time.NewTicker(probeInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case ev := <-s.events:
			s.handle(ev)
		case <-ticker.C:
			if err := s.proxy.Probe(); err != nil {
				s.handle(supervisorEvent{kind: eventProxyProbeFailed, detail: err.Error()})
			} else {
				s.handle(supervisorEvent{kind: eventProxyProbeOK})
			}
		}
	}
}

func (s *supervisor) handle(ev supervisorEvent) {
	comp := componentPage
	if ev.kind == eventProxyProbeFailed ||
		ev.kind == eventProxyProbeOK ||
		ev.kind == eventProxyRestarted {
		comp = componentProxy
	}

	s.mu.Lock()
	if s.pending[comp] {
		s.mu.Unlock()
		return
	}
	act := s.state.decide(ev, time.Now())
	if act.Wait > 0 {
		s.pending[comp] = true
	}
	s.mu.Unlock()

	if act.Wait > 0 {
		time.AfterFunc(act.Wait, func() {
			s.mu.Lock()
			delete(s.pending, comp)
			s.mu.Unlock()
			s.runAction(comp, act, ev)
		})
		return
	}
	s.runAction(comp, act, ev)
}

func (s *supervisor) runAction(comp component, act supervisorAction, ev supervisorEvent) {
	if act.RestartProxy {
		oldPort, newPort, err := s.proxy.Restart()
		if err != nil {
			s.host.Report("本地回环代理无法重启。", err.Error())
			return
		}
		appendHostEntry(ClientLogEntry{
			ID:      fmt.Sprintf("supervisor-%d", time.Now().UnixNano()),
			Level:   "warn",
			Scope:   "supervisor",
			Message: fmt.Sprintf("proxy restarted: %d -> %d", oldPort, newPort),
		})
		s.handle(supervisorEvent{kind: eventProxyRestarted, oldPort: oldPort, newPort: newPort})
		return
	}
	if act.ReloadPage {
		s.page.Reload()
		appendHostEntry(ClientLogEntry{
			ID:      fmt.Sprintf("supervisor-%d", time.Now().UnixNano()),
			Level:   "warn",
			Scope:   "supervisor",
			Message: "page reloaded after failure: " + ev.reason,
		})
	}
	if act.Notify != "" {
		s.host.Notify("GOSpeak", act.Notify)
	}
	if act.Report {
		s.host.Report(act.ReportReason, act.ReportDetail)
	}
}

// waitPending blocks until every deferred action has run. Tests only.
func (s *supervisor) waitPending() {
	for {
		s.mu.Lock()
		n := len(s.pending)
		s.mu.Unlock()
		if n == 0 {
			return
		}
		time.Sleep(time.Millisecond)
	}
}

var appSupervisor *supervisor

type loopbackPageOps struct{}

func (loopbackPageOps) Reload() { mygo.RunOnMain(reloadAllWindows) }

type loopbackProxyOps struct{}

func (loopbackProxyOps) Probe() error { return probeLoopback(proxyPort()) }

func (loopbackProxyOps) Restart() (int, int, error) {
	if loopbackProxy == nil {
		return 0, 0, logErr("proxy is not running")
	}
	return loopbackProxy.restart()
}

func logErr(msg string) error { return fmt.Errorf("%s", msg) }

type nativeHostOps struct {
	mu       sync.Mutex
	lastNote string
	lastAt   time.Time
}

func (h *nativeHostOps) Report(reason, detail string) {
	reportFatal(reason, detail)
}

func (h *nativeHostOps) Notify(title, body string) {
	h.mu.Lock()
	if body == h.lastNote && time.Since(h.lastAt) < time.Minute {
		h.mu.Unlock()
		return
	}
	h.lastNote = body
	h.lastAt = time.Now()
	h.mu.Unlock()
	mygo.RunOnMain(func() {
		n := mygo.NewNotification(mygo.NotificationOptions{Title: title, Body: body})
		_ = n.Show()
	})
}
```

`ClientLogEntry` 字段为 `ID string / TS int64 / Level string / Scope string / Message string / Stack string / Extra map[string]any`（`clientlog.go:22`），`appendHostEntry` 会在 `TS` 为 0 时补当前时间。

- [ ] **Step 4: 跑测试**

Run: `cd app/desktop && go test -run 'TestSupervisor|TestDecide' ./...`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add app/desktop/supervisor.go app/desktop/supervisor_test.go
git commit -m "feat(desktop): Supervisor 运行循环与宿主适配器"
```

---

### Task 5: 页面事件接入与启动接线

**Files:**
- Modify: `app/desktop/windows.go`
- Modify: `app/desktop/main.go`
- Test: `app/desktop/supervisor_test.go`（事件映射的纯函数测试）

**Interfaces:**
- Consumes: `supervisor.post`、`isFatalLoadFailure`、`appPageBase`
- Produces:
  - `func pageEventForLoadError(loadURL, appBase string, code int) (supervisorEvent, bool)`
  - `watchMainWindowFailures` 增加 `OnRenderProcessGone` 接线

- [ ] **Step 1: 写失败测试**

```go
func TestPageEventForLoadError(t *testing.T) {
	app := "http://127.0.0.1:47000"

	// 102 = ERR_CONNECTION_REFUSED（-3 是取消，不算崩溃，见 isFatalLoadFailure）
	ev, ok := pageEventForLoadError(app+"/", app, 102)
	if !ok || ev.kind != eventPageLoadFailed {
		t.Fatalf("app shell failure must map to a page event: %+v %v", ev, ok)
	}
	if _, ok := pageEventForLoadError(app+"/uploads/x.png", app, 102); ok {
		t.Fatal("a non-shell URL must not count as a page failure")
	}
}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd app/desktop && go test -run 'TestPageEventForLoadError' ./...`
Expected: FAIL（`undefined: pageEventForLoadError`）

- [ ] **Step 3: 实现**

`windows.go` 追加：

```go
func pageEventForLoadError(loadURL, appBase string, code int) (supervisorEvent, bool) {
	if !isFatalLoadFailure(loadURL, appBase, code) {
		return supervisorEvent{}, false
	}
	return supervisorEvent{kind: eventPageLoadFailed, reason: loadURL}, true
}
```

`watchMainWindowFailures` 改为：

```go
func watchMainWindowFailures() {
	if mainWindow == nil {
		return
	}
	p := mainWindow.Page()
	if p == nil {
		return
	}
	p.OnDidFailLoad(func(err *mygo.LoadError) {
		ev, ok := pageEventForLoadError(err.URL, appPageBase(), err.Code)
		if !ok {
			return
		}
		logHostError("page.load", err)
		if appSupervisor != nil {
			appSupervisor.post(ev)
			return
		}
		reportFatal(fatalLoadReason(err.URL, err.Code, err.Description), err.Error())
	})
	p.OnRenderProcessGone(func(reason string) {
		log.Printf("[GOSpeak] renderer process gone: %s", reason)
		if appSupervisor != nil {
			appSupervisor.post(supervisorEvent{kind: eventPageRenderGone, reason: reason})
		}
	})
}
```

`main.go` 在 `openMainWindow()` 之后、`watchMainWindowFailures()` 之前接线：

```go
	openMainWindow()
	startupMark("main window created (page load started)")
	appSupervisor = newSupervisor(loopbackPageOps{}, loopbackProxyOps{}, &nativeHostOps{})
	go appSupervisor.Run(context.Background())
	startupMark("supervisor started")
	startupProbeFrontend(mainWindow)
	watchMainWindowFailures()
```

`main.go` import 补 `"context"`。

- [ ] **Step 4: 跑测试与构建**

Run: `cd app/desktop && go vet ./... && go test ./...`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add app/desktop/windows.go app/desktop/main.go app/desktop/supervisor_test.go
git commit -m "feat(desktop): 渲染进程崩溃与外壳加载失败接入 Supervisor"
```

---

### Task 6: 配置损坏备份与启动失败进崩溃窗

**Files:**
- Modify: `app/desktop/server_config.go`
- Modify: `app/desktop/main.go`
- Test: `app/desktop/server_config_validation_test.go`

**Interfaces:**
- Produces:
  - `func backupCorruptConfig(path string) (string, error)`（返回备份路径，失败时返回错误）
  - `loadServerConfig` 在 JSON 非法 / URL 非法时调用它并回落 `""`

- [ ] **Step 1: 写失败测试**

在 `app/desktop/server_config_validation_test.go` 追加：

```go
func TestLoadServerConfigBacksUpCorruptFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "server-config.json")
	if err := os.WriteFile(path, []byte("{not json"), 0o644); err != nil {
		t.Fatal(err)
	}

	backup, err := backupCorruptConfig(path)
	if err != nil {
		t.Fatalf("backup: %v", err)
	}
	if _, statErr := os.Stat(path); !os.IsNotExist(statErr) {
		t.Fatal("the corrupt file must be moved away")
	}
	if data, readErr := os.ReadFile(backup); readErr != nil || string(data) != "{not json" {
		t.Fatalf("backup content lost: %q %v", data, readErr)
	}
}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd app/desktop && go test -run 'TestLoadServerConfigBacksUpCorruptFile' ./...`
Expected: FAIL（`undefined: backupCorruptConfig`）

- [ ] **Step 3: 实现**

`server_config.go`：

```go
// backupCorruptConfig moves a damaged config aside so the next launch starts
// clean while the old file stays available for diagnosis.
func backupCorruptConfig(path string) (string, error) {
	backup := fmt.Sprintf("%s.corrupt-%d", path, time.Now().Unix())
	if err := os.Rename(path, backup); err != nil {
		return "", err
	}
	return backup, nil
}
```

`loadServerConfig` 改为：

```go
func loadServerConfig() {
	dir, err := mygo.App.Path(mygo.PathUserData)
	if err != nil {
		return
	}
	path := filepath.Join(dir, serverConfigFileName)
	data, err := os.ReadFile(path)
	if err != nil {
		return // no config yet
	}
	var cfg serverConfigFile
	if err := json.Unmarshal(data, &cfg); err != nil {
		backup, _ := backupCorruptConfig(path)
		log.Printf("[GOSpeak] server config is corrupt, backed up to %s", backup)
		return
	}
	if err := validateBaseURL(cfg.BaseURL); err != nil {
		backup, _ := backupCorruptConfig(path)
		log.Printf("[GOSpeak] server config is invalid (%v), backed up to %s", err, backup)
		return
	}
	serverConfigMu.Lock()
	serverBaseURL = strings.TrimSpace(cfg.BaseURL)
	serverConfigMu.Unlock()
}
```

`server_config.go` import 补 `"log"`、`"time"`。

`main.go` 启动期失败改为进崩溃窗：

```go
		if !isDevMode() {
			if _, err := ensureProxyStarted(); err != nil {
				log.Printf("[GOSpeak] loopback proxy failed to start: %v", err)
				reportFatal("本地回环代理启动失败。", err.Error())
			}
			startupMark("loopback proxy listening on %s", proxyLoopbackURL)
		}
```

- [ ] **Step 4: 跑测试**

Run: `cd app/desktop && go test ./...`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add app/desktop/server_config.go app/desktop/server_config_validation_test.go app/desktop/main.go
git commit -m "fix(desktop): 配置损坏备份回退，启动失败进崩溃窗"
```

---

### Task 7: 前端 6002 单独提示

**Files:**
- Modify: `app/web/src/utils/apiError.ts`
- Modify: `app/web/src/api/apiClient.ts`
- Create: `app/web/src/utils/apiError.test.ts`

**Interfaces:**
- Produces: `func unreachableMessage(error: unknown): string | null`（导出）
- Consumes: 现有 `apiErrorCode`

- [ ] **Step 1: 写失败测试**

`app/web/src/utils/apiError.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { unreachableMessage } from "./apiError";

describe("unreachableMessage", () => {
	it("recognises the proxy 6002 envelope", () => {
		const err = { response: { data: { code: 6002, msg: "backend unreachable" } } };
		expect(unreachableMessage(err)).toBe("无法连接到服务器，请检查地址或网络");
	});

	it("ignores other errors", () => {
		expect(unreachableMessage({ response: { data: { code: 5001 } } })).toBeNull();
		expect(unreachableMessage(new Error("boom"))).toBeNull();
	});
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @gospeak/web test -- apiError`
Expected: FAIL（`unreachableMessage is not a function`）

- [ ] **Step 3: 实现**

`app/web/src/utils/apiError.ts` 追加：

```ts
/** 本地代理返回 6002：后端不可达，与普通 5xx 分开提示。 */
export function unreachableMessage(error: unknown): string | null {
	return apiErrorCode(error) === 6002
		? "无法连接到服务器，请检查地址或网络"
		: null;
}
```

`app/web/src/api/apiClient.ts` 的响应错误拦截器里，在「被禁言」分支之后、token 分支之前加：

```ts
			// 本地回环代理报告后端不可达（6002）：提示网络/地址，
			// 不要和普通服务器错误混在一起，避免用户误以为要重新登录。
			const unreachable = unreachableMessage(error);
			if (unreachable) {
				if (!silent) {
					toast.error(unreachable);
					markToasted(error);
				}
				return Promise.reject(error);
			}
```

import 补 `import { unreachableMessage } from "@/utils/apiError";`

- [ ] **Step 4: 跑测试与类型检查**

Run: `pnpm --filter @gospeak/web test -- apiError && pnpm --filter @gospeak/web exec tsc --noEmit`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add app/web/src/utils/apiError.ts app/web/src/utils/apiError.test.ts app/web/src/api/apiClient.ts
git commit -m "feat(web): 后端不可达(6002)使用独立提示文案"
```

---

## Self-Review Notes

- Spec §1 Supervisor 结构 → Task 3/4/5（接口、循环、接入）。
- Spec §2 预算/退避/终态 → Task 3 纯函数 + Task 4 执行。
- Spec §3 `/healthz`、分类、端口变化通知 → Task 1/2/3（`eventProxyRestarted`）。
- Spec §4 配置损坏、启动失败 → Task 6。
- Spec §5 可观测与测试 → 每个任务的测试步骤；`appendHostEntry` 在 Task 4 落日志。
- 已知调整：`/healthz` 不在设计里单列 `port` 字段之外的敏感信息；`nativeHostOps.Notify` 60 秒去重替代单独的去重模块。