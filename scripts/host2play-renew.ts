import { chromium } from "playwright";
import { log, maskEmail } from "./lib/logger.js";

const EMAIL = process.env.HOST2PLAY_EMAIL!;
const PASSWORD = process.env.HOST2PLAY_PASSWORD!;
const RENEW_URL = "https://host2play.gratis/panel/minecraft";

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function gotoWithRetry(page: any, url: string, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      await page.goto(url, { waitUntil: "load", timeout: 60000 });
      return;
    } catch (e: any) {
      if (i === retries - 1) throw e;
      log("WARN", `⚠️ 第 ${i + 1} 次加载失败，重试...`, { error: e.message.split("\n")[0] });
      await delay(3000);
    }
  }
}

async function main() {
  log("INFO", "🚀 启动浏览器...");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    // 1. 登录
    log("INFO", "🔐 正在登录...", { email: maskEmail(EMAIL) });
    await gotoWithRetry(page, "https://host2play.gratis/sign-in");
    await delay(2000);

    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    log("INFO", "✅ 登录请求已发送");

    // 2. 等待登录完成
    await page.waitForURL("**/panel/**", { timeout: 30000 });
    log("SUCCESS", "✅ 登录成功");

    // 3. 前往 Minecraft 页面
    await gotoWithRetry(page, RENEW_URL);
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
