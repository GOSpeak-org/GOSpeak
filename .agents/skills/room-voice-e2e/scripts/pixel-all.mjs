import { chromium } from "playwright";
const BASE = "http://localhost:3000";
const ROUTES = [
  "/", "/discover", "/chat", "/profile", "/settings",
  "/manage/announcements", "/manage/ban", "/manage/domains", "/manage/email",
  "/manage/monitor", "/manage/mute", "/manage/oauth", "/manage/roles",
  "/manage/sfu", "/manage/storage", "/manage/users",
];
const BG = "data:image/svg+xml;base64," + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#d94f8c"/><circle cx="250" cy="200" r="160" fill="#4fd0d0"/></svg>').toString("base64");
let browser;
try { browser = await chromium.launch({ channel: "msedge", headless: true }); }
catch { browser = await chromium.launch({ headless: true, executablePath: "/Users/noelorin/Library/Caches/ms-playwright/chromium-1248/chrome-mac/Chromium.app/Contents/MacOS/Chromium" }); }
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
if (!await page.evaluate(() => !!localStorage.getItem("accessToken"))) {
  await page.getByPlaceholder("请输入用户名").fill("admin");
  await page.getByPlaceholder("请输入密码").fill("admin123");
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForURL(u => !u.pathname.startsWith("/login"), { timeout: 20000 }).catch(()=>{});
}
await page.waitForTimeout(400);
for (const path of ROUTES) {
  await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(350);
  await page.evaluate((bg) => {
    const h = document.documentElement;
    h.classList.add("bg-custom");
    h.style.setProperty("--bg-card-alpha","68%"); h.style.setProperty("--bg-muted-alpha","75%"); h.style.setProperty("--bg-blur","14px");
    document.body.style.backgroundImage = `url(${bg})`; document.body.style.backgroundSize = "cover";
  }, BG);
  await page.waitForTimeout(250);
  const b64 = (await page.screenshot()).toString("base64");
  const s = await page.evaluate(async (data) => {
    const img = new Image(); await new Promise(r=>{img.onload=r;img.src="data:image/png;base64,"+data;});
    const c = document.createElement("canvas"); c.width=img.width;c.height=img.height;
    const cx=c.getContext("2d");cx.drawImage(img,0,0);
    const avg=(x,y,w,h)=>{const d=cx.getImageData(x,y,w,h).data;let r=0,g=0,b=0,n=0;for(let i=0;i<d.length;i+=16){r+=d[i];g+=d[i+1];b+=d[i+2];n++;}return [Math.round(r/n),Math.round(g/n),Math.round(b/n)];};
    return { sidebar: avg(70,400,120,200), main: avg(600,700,200,120), mainCorner: avg(1400,820,30,30) };
  }, b64);
  const dist = Math.abs(s.sidebar[0]-s.main[0])+Math.abs(s.sidebar[1]-s.main[1])+Math.abs(s.sidebar[2]-s.main[2]);
  console.log(`${path.padEnd(26)} sidebar=${s.sidebar.join(',')} main=${s.main.join(',')} diff=${dist}`);
}
await browser.close();
