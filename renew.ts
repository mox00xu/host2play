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
    await delay(2000);

    log("INFO", "🔍 等待登录表单加载...");
    try {
      await page.waitForSelector('input#loginEmail, input[type="email"]', { state: "visible", timeout: 60000 });
    } catch (e) {
      const title = await page.title();
      log("ERROR", "❌ 表单未找到", { title, url: page.url() });
      throw e;
    }

    // 填写表单
    const emailInput = page.locator('input#loginEmail, input[type="email"]').first();
    const passwordInput = page.locator('input#loginPassword, input[type="password"]').first();
    await emailInput.fill(EMAIL);
    await passwordInput.fill(PASSWORD);
    log("INFO", "✅ 已填写表单，点击登录...");

    // 点击提交按钮并同时监听登录响应
    const [signInResp] = await Promise.all([
      page.waitForResponse(
        (resp) => resp.url().includes("/sign-in") && resp.request().method() === "POST",
        { timeout: 15000 }
      ).catch((e) => null),
      page.click('button#loginBtn, button[type="submit"]'),
    ]);

    // 检查登录响应
    if (signInResp) {
      try {
        const data = await signInResp.json();
        log("INFO", "🔍 登录响应", { success: data.success, message: data.message });
        if (data.success !== 1 && data.success !== true) {
          throw new Error(`登录失败: ${data.message || "未知错误"}`);
        }
        log("SUCCESS", "✅ 登录成功");
      } catch (e: any) {
        if (e.message?.includes("登录失败")) throw e;
        // 响应不是 JSON，继续检查 URL
      }
    }

    // 等待跳转到 panel（SPA 可能在 POST 成功后 reload）
    await page.waitForURL("**/panel**", { timeout: 20000 }).catch(() => {
      log("WARN", "⚠️ 未检测到 URL 跳转，尝试直接访问面板...");
    });

    // 确保当前在面板页
    if (!page.url().includes("/panel")) {
      log("INFO", "⚠️ 直接导航到面板页");
      await page.goto("https://host2play.gratis/panel/minecraft", { waitUntil: "domcontentloaded", timeout: 15000 });
      await delay(2000);
    }

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
