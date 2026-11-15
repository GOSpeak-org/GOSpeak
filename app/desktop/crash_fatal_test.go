package main

import (
	"strings"
	"testing"
)

func TestIsFatalLoadFailure(t *testing.T) {
	const base = "http://127.0.0.1:51789"

	cases := []struct {
		name  string
		url   string
		code  int
		fatal bool
	}{
		{"app root", base + "/", 0, true},
		{"index document", base + "/index.html", 0, true},
		{"root with query", base + "/?tab=home", 0, true},
		{"sub route is not the shell", base + "/rooms/123", 0, false},
		{"asset", base + "/assets/index-abc.js", 0, false},
		{"other host", "https://example.com/", 0, false},
		{"cancelled load", base + "/", -3, false},
		{"connection refused", base + "/", 102, true},
		{"unparsable", "://", 0, false},
		{"empty base", base + "/", 0, true},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			appBase := base
			if c.name == "empty base" {
				appBase = ""
			}
			got := isFatalLoadFailure(c.url, appBase, c.code)
			if c.name == "empty base" {
				if got {
					t.Fatal("empty app base must never be fatal")
				}
				return
			}
			if got != c.fatal {
				t.Fatalf("isFatalLoadFailure(%q, code %d) = %v, want %v", c.url, c.code, got, c.fatal)
			}
		})
	}
}

func TestFatalLoadReasonMentionsCode(t *testing.T) {
	reason := fatalLoadReason("http://127.0.0.1:1/", 102, "connection refused")
	if !strings.Contains(reason, "102") {
		t.Fatalf("reason should name the error code, got %q", reason)
	}
	if !strings.Contains(reason, "connection refused") {
		t.Fatalf("reason should carry the description, got %q", reason)
	}
}

func TestPanicReasonAndDetail(t *testing.T) {
	reason := panicReason("boom")
	if !strings.Contains(reason, "boom") {
		t.Fatalf("reason should carry the panic value, got %q", reason)
	}
	detail := panicDetail("boom")
	if !strings.Contains(detail, "boom") || !strings.Contains(detail, "goroutine") {
		t.Fatalf("detail should carry the value and a stack, got %q", detail)
	}
}
