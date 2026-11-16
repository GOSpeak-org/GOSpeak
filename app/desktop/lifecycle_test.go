package main

import "testing"

func TestNativeQuitPermission(t *testing.T) {
	p := newQuitPermission()

	if !p.hidesWindowClose() {
		t.Fatal("ordinary window close must hide to tray")
	}

	p.beginQuit()
	if p.hidesWindowClose() {
		t.Fatal("native quit must close every window and terminate the app")
	}
}
