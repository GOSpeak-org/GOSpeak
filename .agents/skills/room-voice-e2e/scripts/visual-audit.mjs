import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const USER = process.env.E2E_USER || "admin";
const PASS = process.env.E2E_PASS || "admin123";
const OUT = join(process.cwd(), "artifacts", "visual-audit-" + Date.now());
mkdirSync(OUT, { recursive: true });

const ROUTES = [
  ["/", "home"],
  ["/discover", "discover"],
  ["/chat", "chat"],
  ["/profile", "profile"],
  ["/settings", "settings"],
  ["/manage/announcements", "manage-announcements"],
  ["/manage/ban", "manage-ban"],
  ["/manage/domains", "manage-domains"],
  ["/manage/email", "manage-email"],
  ["/manage/monitor", "manage-monitor"],
  ["/manage/mute", "manage-mute"],
  ["/manage/oauth", "manage-oauth"],
  ["/manage/roles", "manage-roles"],
  ["/manage/sfu", "manage-sfu"],
  ["/manage/storage", "manage-storage"],
  ["/manage/users", "manage-users"],
];

function rgb(str) {
  if (!str) return str;
  const m = String(str).match(/rgba?\(([^)]+)\)/);
  if (!m) return str;
  const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
  return `rgb(${p[0]},${p[1]},${p[2]}) a=${p.length>3?p[3]:1}`;
}

async function setTheme(page, mode) {
  await page.evaluate((m) => {
    // themeStore 在 <html> 上写 data-theme；acid=亮，dark=暗
    document.documentElement.setAttribute("data-theme", m === "dark" ? "dark" : "acid");
    document.documentElement.classList.toggle("dark", m === "dark");
  }, mode);
  await page.waitForTimeout(250);
}

async function sample(page) {
  return page.evaluate(() => {
    const out = {};
    const pick = (sel, label) => {
      const el = document.querySelector(sel);
      if (!el) return;
      const cs = getComputedStyle(el);
      out[label] = {
        bg: cs.backgroundColor,
        text: cs.color,
        backdrop: cs.backdropFilter || cs.webkitBackdropFilter || "none",
      };
    };
    pick("html", "html");
    pick("body", "body");
    pick("#app", "app");
    // 主内容区常见容器
    pick("#app > div", "app>div");
    pick("main", "main");
    pick("[class*='bg-muted']", "first-bg-muted");
    pick("[class*='bg-card']", "first-bg-card");
    return out;
  });
}

let browser;
try {
  browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
} catch {
  browser = await chromium.launch({ headless: true, executablePath: "/Users/noelorin/Library/Caches/ms-playwright/chromium-1248/chrome-mac/Chromium.app/Contents/MacOS/Chromium", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
}
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

try {
  await page.goto(BASE + "/login", { waitUntil: "domcontentloaded", timeout: 30000 });
  const loggedIn = await page.evaluate(() => !!localStorage.getItem("accessToken"));
  if (!loggedIn) {
    await page.getByPlaceholder("请输入用户名").fill(USER);
    await page.getByPlaceholder("请输入密码").fill(PASS);
    await page.getByRole("button", { name: "登录" }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 }).catch(() => {});
  }
  await page.waitForTimeout(800);
} catch (e) {
  console.log("LOGIN ERROR", e.message);
}

const results = [];
for (const [path, name] of ROUTES) {
  for (const mode of ["light", "dark"]) {
    try {
      await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 20000 });
      await page.waitForTimeout(500);
      await setTheme(page, mode);
      const s = await sample(page);
      await page.screenshot({ path: join(OUT, `${name}-${mode}.png`), fullPage: false });
      results.push({ path, mode, sample: s });
      console.log(`${path} [${mode}] html=${rgb(s.html?.bg)} body=${rgb(s.body?.bg)} app=${rgb(s.app?.bg)} muted=${rgb(s['first-bg-muted']?.bg)} card=${rgb(s['first-bg-card']?.bg)}`);
    } catch (e) {
      console.log(`${path} [${mode}] ERROR ${e.message}`);
      results.push({ path, mode, error: e.message });
    }
  }
}
writeFileSync(join(OUT, "report.json"), JSON.stringify({ results, errors }, null, 2));
console.log("OUT=" + OUT);
await browser.close();
