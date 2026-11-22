import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const USER = process.env.E2E_USER || "admin";
const PASS = process.env.E2E_PASS || "admin123";
const OUT = join(process.cwd(), "artifacts", "visual-audit2-" + Date.now());
mkdirSync(OUT, { recursive: true });

const ROUTES = [
  ["/discover", "discover"],
  ["/chat", "chat"],
  ["/", "home"],
  ["/profile", "profile"],
  ["/settings", "settings"],
  ["/manage/ban", "manage-ban"],
  ["/manage/users", "manage-users"],
  ["/manage/sfu", "manage-sfu"],
  ["/manage/domains", "manage-domains"],
];

// 用 data URL 造一张有明显色块的背景图，便于看透出/模糊差异
const BG = "data:image/svg+xml;base64," + Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#d94f8c"/><circle cx="300" cy="250" r="180" fill="#4fd0d0"/><rect x="700" y="400" width="350" height="300" fill="#f5c542"/></svg>'
).toString("base64");

function rgb(s) {
  if (!s) return s;
  const m = String(s).match(/rgba?\(([^)]+)\)/);
  if (m) { const p=m[1].split(/[,\s/]+/).filter(Boolean).map(Number); return `rgb(${p[0]},${p[1]},${p[2]}) a=${p.length>3?p[3]:1}`; }
  return s;
}

async function setup(page, bg) {
  await page.evaluate(({bg}) => {
    const h = document.documentElement;
    h.setAttribute("data-theme", "acid");
    h.classList.remove("dark");
    if (bg) { h.classList.add("bg-custom"); document.body.style.backgroundImage = `url(${bg})`; document.body.style.backgroundSize="cover"; }
    else { h.classList.remove("bg-custom"); document.body.style.backgroundImage="none"; }
  }, {bg});
  await page.waitForTimeout(300);
}

async function probe(page) {
  return page.evaluate(() => {
    const res = [];
    // 找所有大面积可见区块：宽>200 且 高>200
    const els = [...document.querySelectorAll("#app *")].filter(e => {
      const r = e.getBoundingClientRect();
      return r.width > 220 && r.height > 220 && r.top < innerHeight && r.left < innerWidth;
    });
    for (const e of els.slice(0, 24)) {
      const cs = getComputedStyle(e);
      const r = e.getBoundingClientRect();
      const cls = (e.className || "").toString().split(" ").filter(c=>/^(bg-|surface-glass)/.test(c)).join(" ");
      res.push({
        tag: e.tagName.toLowerCase(),
        cls,
        x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
        bg: cs.backgroundColor,
        backdrop: cs.backdropFilter || cs.webkitBackdropFilter || "none",
      });
    }
    return res;
  });
}

let browser;
try { browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--no-sandbox"] }); }
catch { browser = await chromium.launch({ headless: true, executablePath: "/Users/noelorin/Library/Caches/ms-playwright/chromium-1248/chrome-mac/Chromium.app/Contents/MacOS/Chromium", args: ["--no-sandbox"] }); }
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
try {
  await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
  if (!await page.evaluate(() => !!localStorage.getItem("accessToken"))) {
    await page.getByPlaceholder("请输入用户名").fill(USER);
    await page.getByPlaceholder("请输入密码").fill(PASS);
    await page.getByRole("button", { name: "登录" }).click();
    await page.waitForURL(u => !u.pathname.startsWith("/login"), { timeout: 20000 }).catch(()=>{});
  }
  await page.waitForTimeout(600);
} catch(e) { console.log("LOGIN", e.message); }

const report = [];
for (const [path, name] of ROUTES) {
  for (const bg of [false, true]) {
    await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(400);
    await setup(page, bg);
    const tag = bg ? bg : "plain";
    await page.screenshot({ path: join(OUT, `${name}-${tag}.png`) });
    const p = await probe(page);
    report.push({ path, bg, panels: p });
    console.log(`
### ${path} [${bg ? "bg-custom" : "plain"}] ###`);
    for (const x of p) console.log(`  ${x.tag} ${x.w}x${x.h} @${x.x},${x.y} [${x.cls}] bg=${rgb(x.bg)} blur=${x.backdrop}`);
  }
}
writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2));
console.log("OUT=" + OUT);
await browser.close();
