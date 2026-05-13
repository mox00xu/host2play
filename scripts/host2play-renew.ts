import { chromium } from "playwright";
import { log, maskEmail } from "./lib/logger.js";

const EMAIL = process.env.HOST2PLAY_EMAIL!;
const PASSWORD = process.env.HOST2PLAY_PASSWORD!;
const RENEW_URL = "https://host2play.gratis/panel/minecraft";

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  log("INFO", "🚀 启动浏览器...");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    // 1. 登录
    log("INFO", "🔐 正在登录...", { email: maskEmail(EMAIL) });
    await page.goto("https://host2play.gratis/sign-in", { waitUntil: "networkidle" });
    await delay(2000);

    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    log("INFO", "✅ 登录请求已发送");

    // 2. 等待登录完成
    await page.waitForURL("**/panel/**", { timeout: 15000 });
    log("SUCCESS", "✅ 登录成功");

    // 3. 前往 Minecraft 页面
    await page.goto(RENEW_URL, { waitUntil: "networkidle" });
    await delay(3000);

    // 4. 点击 Renew
    log("INFO", "🔄 尝试续期...");
    const renewBtn = page.locator('button:has-text("Renew"), a:has-text("Renew")').first();
    await renewBtn.click();
    log("INFO", "✅ 已点击 Renew");

    // 5. 等待处理
    await delay(8000);

    // 6. 获取结果
    const content = await page.content();
    if (content.includes("success") || content.includes("Successfully") || content.includes("renewed")) {
      log("SUCCESS", "✅ 续期成功！");
    } else {
      log("WARN", "⚠️ 续期结果未知，请检查页面");
    }

    // 输出有效期
    const expires = await page.locator("text=Removes on").textContent().catch(() => null);
    if (expires) log("INFO", "📅 有效期", { expires: expires.trim() });

  } finally {
    await browser.close();
  }
}

main().catch((e) => { log("ERROR", "❌ 错误", { error: e.message }); process.exit(1); });
