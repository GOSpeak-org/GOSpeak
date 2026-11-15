// Backs navigator.clipboard with the desktop host (Clipboard.ReadText /
// Clipboard.WriteText). WebView2 otherwise answers clipboard reads with its own
// permission prompt, which makes the app look like a browser.
(() => {
	const clipboard = navigator.clipboard;
	const runtime = window.mygo;
	if (!clipboard || !runtime) return;

	const override = (name, fn) => {
		try {
			Object.defineProperty(clipboard, name, {
				value: fn,
				configurable: true,
				writable: true,
			});
		} catch {
			// Leave the browser implementation when the property is locked.
		}
	};

	if (typeof clipboard.readText === "function") {
		override("readText", () => runtime.call("Clipboard.ReadText"));
	}
	if (typeof clipboard.writeText === "function") {
		override("writeText", (text) => runtime.call("Clipboard.WriteText", text));
	}
})();