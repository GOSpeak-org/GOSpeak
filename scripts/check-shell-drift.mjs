#!/usr/bin/env node
import { execSync } from "node:child_process";
const SUBS = { server: "GOSpeak-Server", client: "GOSpeak-Client", docs: "GOSpeak-Docs" };
let drift = 0;
for (const [path, repo] of Object.entries(SUBS)) {
  const pinned = execSync(`git ls-tree HEAD ${path}`).toString().split(/\s+/)[2];
  const remote = execSync(`git ls-remote https://github.com/GOSpeak-org/${repo}.git refs/heads/release`)
    .toString().split(/\s+/)[0];
  if (pinned !== remote) { console.log(`::warning::${path} 落后于 ${repo} release`); drift++; }
}
process.exit(drift ? 1 : 0);
