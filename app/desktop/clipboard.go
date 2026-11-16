package main

import (
	"context"
	_ "embed"

	"github.com/egoist/mygo"
)

//go:embed preload_clipboard.js
var clipboardPreloadScript string

//go:embed preload_clientlog.js
var clientLogPreloadScript string

// pagePreloadScript is injected into every page: clipboard routing plus the
// client-log bridge (the host's copy of the page's log, readable after a
// WebView crash).
var pagePreloadScript = clipboardPreloadScript + "\n" + clientLogPreloadScript

// Clipboard backs the page's navigator.clipboard with the OS clipboard.
type Clipboard struct{}

func (Clipboard) ReadText(context.Context) string {
	return mygo.Clipboard.ReadText()
}

func (Clipboard) WriteText(_ context.Context, text string) {
	mygo.Clipboard.WriteText(text)
}
