import assert from "node:assert/strict";
import { test } from "node:test";
import {
	checkMethods,
	extractJavaMethods,
	extractKotlinMethods,
	extractSwiftMethods,
	extractTsMethods,
} from "./check-mobile-bridge.mjs";

test("extractTsMethods collects pluginMethod calls", () => {
	const source = 'pluginMethod("AudioSession", "activate");';
	assert.deepEqual(
		[...extractTsMethods([{ source }])],
		["AudioSession.activate"],
	);
});

test("extractTsMethods collects getPlugin method calls", () => {
	const source = [
		'const plugin = await getPlugin<AudioRoutePlugin>("AudioSession");',
		"await plugin.list();",
		"await plugin.set({ kind: 'speaker' });",
	].join("\n");
	assert.deepEqual([...extractTsMethods([{ source }])].sort(), [
		"AudioSession.list",
		"AudioSession.set",
	]);
});

test("extractSwiftMethods collects jsName + CAPPluginMethod pairs", () => {
	const source = [
		'public let jsName = "AudioSession"',
		'CAPPluginMethod(name: "activate", returnType: CAPPluginReturnPromise),',
	].join("\n");
	assert.deepEqual(
		[...extractSwiftMethods([{ source }])],
		["AudioSession.activate"],
	);
});

test("extractKotlinMethods collects plugin name + @PluginMethod fun", () => {
	const source = [
		'@CapacitorPlugin(name = "MediaControl")',
		"@PluginMethod",
		"fun setMetadata(call: PluginCall) {}",
	].join("\n");
	assert.deepEqual(
		[...extractKotlinMethods([{ source }])],
		["MediaControl.setMetadata"],
	);
});

test("extractJavaMethods collects plugin name + @PluginMethod void", () => {
	const source = [
		'@CapacitorPlugin(name = "AudioSession")',
		"@PluginMethod",
		"public void activate(PluginCall call) {}",
	].join("\n");
	assert.deepEqual(
		[...extractJavaMethods([{ source }])],
		["AudioSession.activate"],
	);
});

test("checkMethods reports methods missing on the native side", () => {
	const result = checkMethods({
		ts: new Set(["AudioSession.activate", "AudioSession.deactivate"]),
		native: new Set(["AudioSession.activate"]),
	});
	assert.deepEqual(result.missing, ["AudioSession.deactivate"]);
	assert.equal(result.ok, false);
});

test("checkMethods passes when native is a superset", () => {
	const result = checkMethods({
		ts: new Set(["AudioSession.activate"]),
		native: new Set(["AudioSession.activate", "AudioSession.list"]),
	});
	assert.equal(result.ok, true);
});
