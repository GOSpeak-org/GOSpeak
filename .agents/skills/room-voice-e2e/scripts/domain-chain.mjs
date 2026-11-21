import { chromium } from "playwright";
const BASE = "http://localhost:3000";
const UUID = process.env.DOMAIN_UUID || "li7s8xpn4zgalmpsolb0q62pz";
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
await page.waitForTimeout(600);
// 模拟用户已开启自定义背景图：html.bg-custom + --bg-* + body 背景
const BG = "data:image/svg+xml;base64," + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#d94f8c"/><circle cx="300" cy="250" r="180" fill="#4fd0d0"/></svg>').toString("base64");
await page.evaluate((bg) => {
  const h = document.documentElement;
  h.classList.add("bg-custom");
  h.style.setProperty("--bg-card-alpha", "68%");
  h.style.setProperty("--bg-muted-alpha", "75%");
  h.style.setProperty("--bg-blur", "14px");
  h.style.setProperty("--bg-saturate", "1");
  document.body.style.backgroundImage = `url(${bg})`;
  document.body.style.backgroundSize = "cover";
}, BG);
await page.waitForTimeout(400);

const data = await page.evaluate(() => {
  function chain(el) {
    const arr = [];
    let e = el;
    while (e && e !== document.documentElement) {
      const cs = getComputedStyle(e);
      const cls = (e.className||"").toString().split(" ").filter(c=>/^(bg-|surface-glass)/.test(c)).join(" ");
      const bg = cs.backgroundColor;
      if (bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
        arr.push({ tag: e.tagName.toLowerCase(), cls, bg, blur: cs.backdropFilter || "none", html: (e.outerHTML||"").slice(0, 260) });
      }
      e = e.parentElement;
    }
    return arr;
  }
  const find = (txt) => [...document.querySelectorAll("#app *")].find(e => e.textContent?.trim() === txt && e.getBoundingClientRect().height < 60);
  const out = {};
  const leftRoom = find("挂机房") || find("上分队") || [...document.querySelectorAll("#app *")].find(e=>e.children.length===0 && e.textContent?.includes("暂无房间"));
  const rightEmpty = find("选择一个房间");
  if (leftRoom) out.leftRoomChain = chain(leftRoom); else out.leftRoomChain = [];
  if (rightEmpty) out.rightChain = chain(rightEmpty);
  // 几何采样：取左右两块的背景祖先链
  return out;
});
console.log(JSON.stringify(data, null, 2));
await page.screenshot({ path: "/tmp/domain-bg-custom.png" });
await browser.close();
