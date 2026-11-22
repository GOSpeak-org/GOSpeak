import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = "http://localhost:3000";
const USER = process.env.E2E_USER || "admin";
const PASS = process.env.E2E_PASS || "admin123";
const OUT = process.cwd();

const ROUTES = [
  "/", "/discover", "/chat", "/profile", "/settings",
  "/manage/announcements", "/manage/ban", "/manage/domains", "/manage/email",
  "/manage/monitor", "/manage/mute", "/manage/oauth", "/manage/roles",
  "/manage/sfu", "/manage/storage", "/manage/users",
];

const BG = "data:image/svg+xml;base64," + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#d94f8c"/></svg>').toString("base64");

let browser;
try { browser = await chromium.launch({ channel: "msedge", headless: true }); }
catch { browser = await chromium.launch({ headless: true, executablePath: "/Users/noelorin/Library/Caches/ms-playwright/chromium-1248/chrome-mac/Chromium.app/Contents/MacOS/Chromium" }); }
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
if (!await page.evaluate(() => !!localStorage.getItem("accessToken"))) {
  await page.getByPlaceholder("请输入用户名").fill(USER);
  await page.getByPlaceholder("请输入密码").fill(PASS);
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForURL(u => !u.pathname.startsWith("/login"), { timeout: 20000 }).catch(()=>{});
}
await page.waitForTimeout(500);

const all = [];
for (const path of ROUTES) {
  await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(400);
  await page.evaluate((bg) => {
    const h = document.documentElement;
    h.classList.add("bg-custom");
    h.style.setProperty("--bg-card-alpha","68%");
    h.style.setProperty("--bg-muted-alpha","75%");
    h.style.setProperty("--bg-blur","14px");
    document.body.style.backgroundImage = `url(${bg})`;
    document.body.style.backgroundSize = "cover";
  }, BG);
  await page.waitForTimeout(250);
  const panels = await page.evaluate(() => {
    const isSemi = (cs) => {
      const b = cs.backgroundColor;
      return b.includes("/") && !b.startsWith("rgba(0, 0, 0, 0)");
    };
    const out = [];
    const els = [...document.querySelectorAll("#app *")].filter(e => {
      const r = e.getBoundingClientRect();
      return r.width > 240 && r.height > 180 && r.top < innerHeight && r.left < innerWidth && r.bottom > 60;
    });
    for (const e of els) {
      const layers = [];
      let cur = e;
      while (cur && cur !== document.body) {
        const cs = getComputedStyle(cur);
        if (isSemi(cs)) layers.push({
          tag: cur.tagName.toLowerCase(),
          cls: (cur.className||"").toString().split(" ").filter(c=>/^(bg-|surface-glass)/.test(c)).join(" "),
          blur: (cs.backdropFilter||"none").startsWith("blur") ? "blur" : "none",
          src: cur.getAttribute("data-tsd-source") || "",
        });
        cur = cur.parentElement;
      }
      if (layers.length > 1) {
        const r = e.getBoundingClientRect();
        out.push({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), layers });
      }
    }
    // 去重：取每层链签名相同的
    const seen = new Set();
    return out.filter(o => { const k = o.layers.map(l=>l.src).join("|"); if (seen.has(k)) return false; seen.add(k); return true; });
  });
  all.push({ path, panels });
  const bad = panels.length;
  console.log(`${path}: ${bad} 个多重叠加面板`);
  for (const p of panels.slice(0, 8)) {
    console.log(`  ${p.w}x${p.h} @${p.x},${p.y} layers=${p.layers.length}`);
    for (const l of p.layers) console.log(`    ${l.tag} [${l.cls}] blur=${l.blur} ${l.src}`);
  }
}
writeFileSync(join(OUT, "stack-scan-report.json"), JSON.stringify(all, null, 2));
console.log("saved stack-scan-report.json");
await browser.close();
