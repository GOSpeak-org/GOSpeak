import assert from "node:assert/strict";
import test from "node:test";

import {
	artifactTarget,
	checksum,
	parse,
	prefix,
	tag,
} from "./release-naming.mjs";

test("tag / prefix", () => {
	assert.equal(prefix("server"), "gospeak-server-v");
	assert.equal(tag("web", "1.4.0-rc.1"), "gospeak-web-v1.4.0-rc.1");
	assert.throws(() => prefix("nope"));
});

test("parse", () => {
	assert.deepEqual(parse("gospeak-desktop-v1.4.0-rc.1"), {
		component: "desktop",
		version: "1.4.0-rc.1",
	});
	assert.throws(() => parse("v1.0.0"));
});

test("artifact naming", () => {
	assert.equal(
		artifactTarget("server", "1.3.0", "linux-amd64", "tar.gz"),
		"gospeak-server-v1.3.0-linux-amd64.tar.gz",
	);
	assert.equal(
		checksum("mobile", "1.4.0-rc.1"),
		"SHA256SUMS-gospeak-mobile-v1.4.0-rc.1.txt",
	);
});
