package main

import (
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"time"

	"github.com/egoist/mygo"
)

// devWindowURL is used only when developing with `mygo dev` plus
// GOSPEAK_DESKTOP_DEV=1: the window loads the Vite dev server directly (HMR),
// whose built-in proxy keeps /api and /ws same-origin. Keep in sync with
// devUrl in mygo.config.ts.
const devWindowURL = "http://localhost:3000"

func isDevMode() bool {
	return os.Getenv("GOSPEAK_DESKTOP_DEV") == "1"
}

// appPageBase returns where the web frontend is loaded from:
//   - dev:  the Vite dev server (same-origin API via its proxy);
//   - release: the loopback proxy (embedded dist + API/WS reverse proxy),
//     so the page never issues a cross-origin request.
func appPageBase() string {
	if isDevMode() {
		return devWindowURL
	}
	return proxyLoopbackURL
}

var mainWindow *mygo.Window

// originOf returns "scheme://host" origins for PageOptions.TrustedOrigins so a
// page loaded from an http URL may call the bound Go services.
func originOf(baseURL string) []string {
	if baseURL == "" {
		return nil
	}
	u, err := url.Parse(baseURL)
	if err != nil || u.Host == "" {
		return nil
	}
	return []string{u.Scheme + "://" + u.Host}
}

// titleBarHeight is the height of the title bar the page draws under the
// window controls: the same 28px as the web build's Header (px-2 py-0.5 with
// a py-1 text-xs button), so both builds look alike. Keep in sync with the
// fallback in app/web/src/components/titleBar/appTitleBar.tsx.
const titleBarHeight = 28

// appTitle is the native window title: the taskbar, Mission Control and the
// window switcher show the app name only, whatever route the page is on.
const appTitle = "GOSpeak"

func openMainWindow() {
	base := appPageBase()
	mainWindow = mygo.NewWindow(mygo.WindowOptions{
		Title: appTitle,
		URL:   base + "/",
		// Hides the title bar but keeps the window controls (traffic lights on
		// macOS, the Windows 11 buttons, GTK's title buttons on Linux) over the
		// page, which draws the rest of the bar. The page keeps clear of them
		// with the --mygo-titlebar-* CSS variables and drags the window by
		// --app-region: drag.
		TitleBarStyle:  mygo.TitleBarHidden,
		TitleBarHeight: titleBarHeight,
		// macOS: centers the traffic lights in the title bar
		// (button height 14 + 2*7 = 28).
		TrafficLightPosition: &mygo.Point{X: 20, Y: 7},
		// Fills the window until the page paints, in the page's --background,
		// so loading does not flash another color.
		BackgroundColor: "light-dark(#f8f8f8, #17181b)",
		// Lets the loopback page call bound Go methods (server config, overlay,
		// capabilities). PreloadScript routes navigator.clipboard through the host
		// so WebView2 never shows its own clipboard permission prompt.
		Page: mygo.PageOptions{
			TrustedOrigins: originOf(base),
			PreloadScript:  pagePreloadScript,
		},
		// First-launch size; StateKey's remembered bounds (position, size,
		// maximized, full screen) override it and fall back to a visible
		// position when the saved display is gone.
		Width:     1200,
		Height:    800,
		MinWidth:  960,
		MinHeight: 640,
		StateKey:  "main",
	})
	// The page's <title> no longer renames the native window.
	if p := mainWindow.Page(); p != nil {
		p.OnPageTitleUpdated(func(e *mygo.TitleEvent) { e.PreventDefault() })
	}
}

// watchDownloads records where the page's downloads land and reports the
// outcome. The page exports its log through a Blob download on both platforms
// (see app/web utils/exportLog); MyGo already saves it to the Downloads
// directory under the page's suggested name, numbering a duplicate, so this
// only tells the user where it went.
func watchDownloads(p *mygo.Page) {
	p.OnDownloadDone(func(d *mygo.Download) {
		if d.Err != nil {
			logHostError("download", d.Err)
			return
		}
		appendHostEntry(ClientLogEntry{
			ID:      fmt.Sprintf("download-%d", time.Now().UnixNano()),
			TS:      time.Now().UnixMilli(),
			Level:   "info",
			Scope:   "download",
			Message: "saved " + d.Path,
		})
		n := mygo.NewNotification(mygo.NotificationOptions{
			Title: "GOSpeak",
			Body:  "日志已保存到 " + filepath.Base(d.Path),
		})
		_ = n.Show()
	})
}

// watchMainWindowFailures turns a failed load of the app shell into a native
// crash window. A base-URL switch or a manual reload that fails lands here too,
// which is intended: without the page the client has no UI left.
func watchMainWindowFailures() {
	if mainWindow == nil {
		return
	}
	p := mainWindow.Page()
	if p == nil {
		return
	}
	p.OnDidFailLoad(func(err *mygo.LoadError) {
		if !isFatalLoadFailure(err.URL, appPageBase(), err.Code) {
			return
		}
		logHostError("page.load", err)
		reportFatal(fatalLoadReason(err.URL, err.Code, err.Description), err.Error())
	})
}

// reloadAllWindows reloads the pages in place after a base-URL switch. The
// page origin is the loopback proxy both before and after, so a reload — not a
// window rebuild — is all that is needed. The overlay draws native UI rather
// than a page, so it has nothing to reload.
func reloadAllWindows() {
	if mainWindow != nil {
		if p := mainWindow.Page(); p != nil {
			_ = p.LoadURL(appPageBase() + "/")
		}
	}
}
