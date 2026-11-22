import { chromium } from "playwright";
const BASE = "http://localhost:3000";
const UUID = process.env.DOMAIN_UUID || "layyxxj9xugkhnqobapggol8";
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
await page.goto(BASE + "/domain/" + UUID, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(700);
// 注入强对比背景图，便于观察透出差异
const BG = "data:image/svg+xml;base64," + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#d94f8c"/><circle cx="250" cy="200" r="160" fill="#4fd0d0"/><rect x="750" y="450" width="350" height="300" fill="#f5c542"/></svg>').toString("base64");
await page.evaluate((bg) => {
  const h = document.documentElement;
  h.classList.add("bg-custom");
  h.style.setProperty("--bg-card-alpha","68%");
  h.style.setProperty("--bg-muted-alpha","75%");
  h.style.setProperty("--bg-blur","14px");
  document.body.style.backgroundImage = `url(${bg})`;
  document.body.style.backgroundSize = "cover";
}, BG);
await page.waitForTimeout(400);
const buf = await page.screenshot();
const b64 = buf.toString("base64");
// 在浏览器内解码截图并采样指定矩形区域的平均颜色
const samples = await page.evaluate(async (data) => {
  const img = new Image();
  await new Promise(r => { img.onload = r; img.src = "data:image/png;base64," + data; });
  const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
  const cx = c.getContext("2d"); cx.drawImage(img, 0, 0);
  const avg = (x,y,w,h) => {
    const d = cx.getImageData(x,y,w,h).data; let r=0,g=0,b=0,n=0;
    for (let i=0;i<d.length;i+=16){ r+=d[i];g+=d[i+1];b+=d[i+2];n++; }
    return [Math.round(r/n),Math.round(g/n),Math.round(b/n)];
  };
  return {
    leftRoomTop: avg(120,260,180,80),
    leftRoomBottom: avg(120,500,180,150),
    rightMainTop: avg(420,180,300,80),
    rightMainMid: avg(1050,300,300,200),
    rightMainBottom: avg(1050,700,300,120),
  };
}, b64);
console.log(JSON.stringify(samples, null, 2));
await browser.close();
