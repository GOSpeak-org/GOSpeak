package main

import (
	"context"
	_ "embed"

	"github.com/egoist/mygo"
)

//go:embed preload_clipboard.js
var clipboardPreloadScript string

// Clipboard backs the page's navigator.clipboard with the OS clipboard.
type Clipboard struct{}

func (Clipboard) ReadText(context.Context) string {
	return mygo.Clipboard.ReadText()
}

func (Clipboard) WriteText(_ context.Context, text string) {
	mygo.Clipboard.WriteText(text)
}