import { chromium } from "playwright";

const EMAIL = process.env.HOST2PLAY_EMAIL!;
const PASSWORD = process.env.HOST2PLAY_PASSWORD!;
const RENEW_URL = "https://host2play.gratis/panel/minecraft";

// ─── 日志模块（内联，无依赖）──────────────────────────────
type LogLevel = "INFO" | "WARN" | "SUCCESS" | "ERROR" | "SKIP";

function maskEmail(email: string): string {
  if (!email || !email.includes("@")) return "***";
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  const domainParts = domain.split(".");
  const tld = domainParts.pop() ?? "";
  const domainMain = domainParts.join(".");
  const localMasked = local.length > 1 ? `${local[0]}${"*".repeat(local.length - 1)}` : "*".repeat(local.length);
  const domainMasked = domainMain.length > 1 ? `${"*".repeat(domainMain.length - 1)}${domainMain[domainMain.length - 1]}` : "*".repeat(domainMain.length);
  return `${localMasked}@${domainMasked}.${tld}`;
}

function sanitize(obj: unknown): unknown {
  if (obj === null || obj === undefined) return null;
  if (typeof obj !== "object") return obj;
  const sensitiveKeys = ["email", "mail", "user", "username", "account", "token", "secret", "key", "password", "pin", "balance", "amount", "price", "cost", "fee", "card", "cvv", "expiry", "expires"];
  if (Array.isArray(obj)) return obj.map(sanitize);
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const keyLower = k.toLowerCase();
    if (sensitiveKeys.some((sk) => keyLower.includes(sk))) {
      if (keyLower.includes("email") || keyLower.includes("mail")) {
        result[k] = maskEmail(String(v));
      } else {
        const s = String(v);
        result[k] = s.length > 2 ? `${s[0]}${"*".repeat(s.length - 2)}${s[s.length - 1]}` : "*".repeat(s.length);
      }
    } else if (typeof v === "object" && v !== null) {
      result[k] = sanitize(v);
    } else {
      result[k] = v;
    }
  }
  return result;
}

function log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
  const icon = level === "SUCCESS" ? "✅" : level === "WARN" ? "⚠️" : level === "ERROR" ? "❌" : level === "SKIP" ? "⏭️" : "ℹ️";
  const dataStr = data ? ` ${JSON.stringify(sanitize(data))}` : "";
  console.log(`${icon} [${level}] ${message}${dataStr}`);
}
// ─────────────────────────────────────────────────────────

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
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();

  try {
    log("INFO", "🔐 正在登录...", { email: maskEmail(EMAIL) });
    await gotoWithRetry(page, "https://host2play.gratis/sign-in");
    await delay(3000);

    log("INFO", "🔍 等待登录表单加载...");
    try {
      await page.waitForSelector('input[type="email"]', { state: "visible", timeout: 60000 });
    } catch (e) {
      const title = await page.title();
      log("ERROR", "❌ 表单未找到", { title, url: page.url() });
      throw e;
    }

    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    log("INFO", "✅ 登录请求已发送");

    await page.waitForURL("**/panel/**", { timeout: 30000 });
    log("SUCCESS", "✅ 登录成功");

    await gotoWithRetry(page, RENEW_URL);
    await delay(3000);

    log("INFO", "🔄 尝试续期...");
    const renewBtn = page.locator('button:has-text("Renew"), a:has-text("Renew")').first();
    await renewBtn.click();
    log("INFO", "✅ 已点击 Renew");

    await delay(8000);

    const content = await page.content();
    if (content.includes("success") || content.includes("Successfully") || content.includes("renewed")) {
      log("SUCCESS", "✅ 续期成功！");
    } else {
      log("WARN", "⚠️ 续期结果未知，请检查页面");
    }

    const expires = await page.locator("text=Removes on").textContent().catch(() => null);
    if (expires) log("INFO", "📅 有效期", { expires: expires.trim() });

  } finally {
    await browser.close();
  }
}

main().catch((e) => { log("ERROR", "❌ 错误", { error: e.message }); process.exit(1); });
