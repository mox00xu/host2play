import { chromium, Browser, Page, BrowserContext } from "playwright";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const EMAIL = process.env.HOST2PLAY_EMAIL;
const PASSWORD = process.env.HOST2PLAY_PASSWORD;
const RENEW_URL = "https://host2play.gratis/panel/minecraft";

// 检查环境变量
if (!EMAIL || !PASSWORD) {
  console.error("❌ 缺少必要的环境变量:");
  console.error("   HOST2PLAY_EMAIL: " + (EMAIL ? "已设置" : "未设置"));
  console.error("   HOST2PLAY_PASSWORD: " + (PASSWORD ? "已设置" : "未设置"));
  console.error("\n使用方法:");
  console.error("   HOST2PLAY_EMAIL=your@email.com HOST2PLAY_PASSWORD=yourpassword bun run renew.ts");
  process.exit(1);
}

// ─── 日志模块（脱敏）──────────────────────────────────────
type LogLevel = "INFO" | "WARN" | "SUCCESS" | "ERROR" | "DEBUG";

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

function maskToken(token: string): string {
  if (!token || token.length < 10) return "***";
  return `${token.slice(0, 4)}***${token.slice(-4)}`;
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
      } else if (keyLower.includes("token")) {
        result[k] = maskToken(String(v));
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
  const icon = level === "SUCCESS" ? "✅" : level === "WARN" ? "⚠️" : level === "ERROR" ? "❌" : level === "DEBUG" ? "🔍" : "ℹ️";
  const dataStr = data ? ` ${JSON.stringify(sanitize(data))}` : "";
  console.log(`${icon} [${level}] ${message}${dataStr}`);
}
// ─────────────────────────────────────────────────────────────

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay(min: number, max: number) {
  return delay(Math.floor(Math.random() * (max - min) + min));
}

// 创建临时用户数据目录
function createTempUserDataDir(): string {
  const tmpDir = path.join(os.tmpdir(), `playwright-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  return tmpDir;
}

// 反指纹注入脚本（增强版）
const ANTI_FINGERPRINT_JS = `
// 伪造 WebGL 指纹
const getParameter = WebGLRenderingContext.prototype.getParameter;
WebGLRenderingContext.prototype.getParameter = function(parameter) {
  if (parameter === 37445) return 'Intel Inc.';
  if (parameter === 37446) return 'Intel(R) UHD Graphics 630';
  return getParameter.apply(this, [parameter]);
};

// 隐藏 webdriver 特征
Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

// 伪造语言列表
Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });

// 伪造插件列表
Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });

// 伪造平台
Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });

// 隐藏自动化特征
window.chrome = { runtime: {} };

// 伪造权限 API
const originalQuery = window.navigator.permissions.query;
window.navigator.permissions.query = (parameters) => (
  parameters.name === 'notifications' ?
    Promise.resolve({ state: Notification.permission }) :
    originalQuery(parameters)
);

// 额外的 stealth 特征
Object.defineProperty(navigator, 'plugins', {
  get: () => {
    const plugins = [
      { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
      { name: 'Chrome PDF Viewer', filename: 'internal-pdf-viewer' },
      { name: 'Native Client', filename: 'internal-nacl-plugin' }
    ];
    plugins.item = (i) => plugins[i] || null;
    plugins.namedItem = (name) => plugins.find(p => p.name === name) || null;
    plugins.refresh = () => {};
    return plugins;
  }
});

// 隐藏 automation 相关属性
delete window.__nightmare;
delete window._phantom;
delete window.__phantomas;
delete window.callPhantom;
delete window.Buffer;
`;

// 人类行为模拟
async function simulateHumanBehavior(page: Page): Promise<void> {
  log("INFO", "🎭 模拟人类行为...");
  
  // 随机滚动
  for (let i = 0; i < 3; i++) {
    const scrollY = Math.floor(Math.random() * 400) + 200;
    await page.evaluate((y) => window.scrollBy(0, y), scrollY);
    await randomDelay(500, 1500);
    
    // 随机鼠标移动
    const x = Math.floor(Math.random() * 700) + 100;
    const y = Math.floor(Math.random() * 400) + 100;
    await page.mouse.move(x, y);
    await randomDelay(300, 800);
  }
  
  await randomDelay(1000, 2000);
}

// 处理 Consent 弹窗
async function handleConsent(page: Page): Promise<boolean> {
  const consentSelectors = [
    'button:has-text("Consent")',
    'button:has-text("Accept")',
    'button:has-text("Accept All")',
    'button:has-text("I agree")',
    'button:has-text("Agree")',
    '[class*="consent"] button',
    '[id*="consent"] button',
    '.cc-btn',
    '#onetrust-accept-btn-handler',
  ];

  for (const selector of consentSelectors) {
    try {
      const btn = page.locator(selector).first();
      if (await btn.isVisible({ timeout: 2000 })) {
        await btn.click();
        log("INFO", "✅ 已处理 Consent 弹窗");
        await delay(2000);
        return true;
      }
    } catch {}
  }
  return false;
}

// 检测 reCAPTCHA 是否已解决
async function isRecaptchaSolved(page: Page): Promise<boolean> {
  try {
    const frames = page.frames();
    for (const frame of frames) {
      const token = await frame.evaluate(() => {
        const textarea = document.querySelector("textarea[name='g-recaptcha-response']") as HTMLTextAreaElement;
        return textarea?.value || "";
      }).catch(() => "");
      if (token && token.length > 30) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

// 检测 IP 是否被封锁（增强版）
async function isBlocked(page: Page): Promise<boolean> {
  try {
    const frames = page.frames();
    for (const frame of frames) {
      if (frame.url().includes("recaptcha")) {
        const blocked = await frame.evaluate(() => {
          // 检测多种 IP 封锁标志
          const header = document.querySelector(".rc-doscaptcha-header-text");
          if (header && header.textContent?.toLowerCase().includes("try again later")) {
            return true;
          }
          
          // 检测错误消息
          const errorMsg = document.querySelector(".rc-audiochallenge-error-message");
          if (errorMsg && (errorMsg as HTMLElement).offsetParent !== null) {
            const text = errorMsg.textContent?.toLowerCase() || "";
            if (text.includes("try again later") || text.includes("multiple") || text.includes("blocked")) {
              return true;
            }
          }
          
          // 检测图片验证码（通常意味着音频被封锁）
          const imageChallenge = document.querySelector(".rc-imageselect");
          if (imageChallenge && (imageChallenge as HTMLElement).offsetParent !== null) {
            // 图片验证码本身不算 IP 封锁，但可能意味着音频不可用
            return false;
          }
          
          return false;
        }).catch(() => false);
        if (blocked) return true;
      }
    }
    
    // 检测页面级别的封锁
    const pageContent = await page.content();
    if (pageContent.includes("Your IP has been blocked") || 
        pageContent.includes("Access denied") ||
        pageContent.includes("Too many requests")) {
      return true;
    }
    
    return false;
  } catch {
    return false;
  }
}

// 查找 reCAPTCHA frame
function findRecaptchaFrame(page: Page, kind: "anchor" | "bframe"): import("playwright").Frame | null {
  for (const frame of page.frames()) {
    const url = frame.url();
    if (url.includes("recaptcha") && url.includes(kind)) {
      return frame;
    }
  }
  return null;
}

// 点击 reCAPTCHA checkbox
async function clickRecaptchaCheckbox(page: Page): Promise<boolean> {
  try {
    const anchorFrame = findRecaptchaFrame(page, "anchor");
    if (!anchorFrame) return false;

    const checkbox = anchorFrame.locator("#recaptcha-anchor, .recaptcha-checkbox");
    if (await checkbox.count() === 0) return false;

    // 模拟人类移动
    const box = await checkbox.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
        steps: Math.floor(Math.random() * 10) + 5,
      });
      await randomDelay(200, 500);
    }

    await checkbox.click({ force: true });
    log("INFO", "✅ 已点击 reCAPTCHA checkbox");
    await delay(3000);

    // 检查是否被封锁
    if (await isBlocked(page)) {
      log("ERROR", "❌ IP 被 Google 封锁");
      return false;
    }

    return true;
  } catch (e) {
    log("WARN", "点击 checkbox 失败", { error: String(e) });
    return false;
  }
}

// 切换到音频模式
async function switchToAudio(page: Page): Promise<boolean> {
  try {
    const bframe = findRecaptchaFrame(page, "bframe");
    if (!bframe) return false;

    // 检查是否已在音频模式
    const audioInput = bframe.locator("#audio-response");
    if (await audioInput.isVisible({ timeout: 1000 })) {
      return true;
    }

    // 点击音频按钮
    const audioBtn = bframe.locator("#recaptcha-audio-button, button[aria-label*='audio']");
    if (await audioBtn.count() > 0) {
      await audioBtn.click({ force: true });
      log("INFO", "✅ 已切换到音频模式");
      await delay(3000);

      if (await isBlocked(page)) {
        log("ERROR", "❌ IP 被封锁");
        return false;
      }

      return true;
    }
    return false;
  } catch (e) {
    log("WARN", "切换音频模式失败", { error: String(e) });
    return false;
  }
}

// 获取音频 URL
async function getAudioUrl(page: Page): Promise<string | null> {
  try {
    const bframe = findRecaptchaFrame(page, "bframe");
    if (!bframe) return null;

    const selectors = [
      ".rc-audiochallenge-tdownload-link",
      ".rc-audiochallenge-ndownload-link",
      "#audio-source",
    ];

    for (const selector of selectors) {
      const ele = bframe.locator(selector).first();
      if (await ele.count() > 0) {
        const url = await ele.getAttribute("href").catch(() => null) || 
                    await ele.getAttribute("src").catch(() => null);
        if (url && url.length > 10) {
          // 解码 HTML 实体
          const decoded = url.replace(/&amp;/g, "&");
          return decoded;
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

// 下载音频文件
async function downloadAudio(url: string): Promise<string | null> {
  try {
    // 备用 URL
    const urls = [url];
    if (url.includes("recaptcha.net")) {
      urls.push(url.replace("recaptcha.net", "www.google.com"));
    } else if (url.includes("google.com")) {
      urls.push(url.replace("www.google.com", "recaptcha.net"));
    }

    for (const audioUrl of urls) {
      try {
        const response = await fetch(audioUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://www.google.com/",
          },
        });

        if (!response.ok) continue;

        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length < 1000) continue;

        const tmpPath = path.join(os.tmpdir(), `captcha-${Date.now()}.mp3`);
        fs.writeFileSync(tmpPath, buffer);
        log("DEBUG", "音频下载成功", { size: buffer.length });
        return tmpPath;
      } catch {
        continue;
      }
    }
    return null;
  } catch (e) {
    log("WARN", "音频下载失败", { error: String(e) });
    return null;
  }
}

// 使用语音识别 API 识别音频
async function recognizeAudio(mp3Path: string): Promise<string | null> {
  try {
    // 使用免费的语音识别 API
    // 注意：在生产环境中应该使用更可靠的服务
    log("INFO", "🔊 正在识别音频验证码...");
    
    // 这里我们使用一个简单的模拟
    // 实际应用中需要集成 Google Speech Recognition 或其他服务
    // 由于环境限制，我们暂时返回 null，让用户手动处理
    
    fs.unlinkSync(mp3Path);
    return null;
  } catch (e) {
    log("WARN", "音频识别失败", { error: String(e) });
    if (fs.existsSync(mp3Path)) fs.unlinkSync(mp3Path);
    return null;
  }
}

// 填写验证码答案
async function fillAudioAnswer(page: Page, text: string): Promise<boolean> {
  try {
    const bframe = findRecaptchaFrame(page, "bframe");
    if (!bframe) return false;

    const input = bframe.locator("#audio-response");
    if (await input.count() === 0) return false;

    await input.click();
    await input.fill(text);
    await randomDelay(500, 1500);

    const verifyBtn = bframe.locator("#recaptcha-verify-button");
    if (await verifyBtn.count() > 0) {
      await verifyBtn.click({ force: true });
    }

    log("INFO", "✅ 已填写音频答案");
    return true;
  } catch {
    return false;
  }
}

// 重载挑战
async function reloadChallenge(page: Page): Promise<void> {
  try {
    const bframe = findRecaptchaFrame(page, "bframe");
    if (!bframe) return;

    const reloadBtn = bframe.locator("#recaptcha-reload-button");
    if (await reloadBtn.count() > 0) {
      await reloadBtn.click({ force: true });
      await delay(3000);
    }
  } catch {}
}

// 完整的 reCAPTCHA 解决流程
async function solveRecaptcha(page: Page, maxAttempts = 3): Promise<boolean> {
  log("INFO", "🔐 开始处理 reCAPTCHA...");

  // 等待 reCAPTCHA 加载
  for (let i = 0; i < 15; i++) {
    if (findRecaptchaFrame(page, "anchor")) break;
    await delay(1000);
  }

  if (!findRecaptchaFrame(page, "anchor")) {
    log("WARN", "未检测到 reCAPTCHA");
    return true; // 可能没有验证码
  }

  let downloadFails = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    log("INFO", `reCAPTCHA 尝试 ${attempt + 1}/${maxAttempts}`);

    // 已解决？
    if (await isRecaptchaSolved(page)) {
      log("SUCCESS", "✅ reCAPTCHA 已解决");
      return true;
    }

    // IP 被封锁？
    if (await isBlocked(page)) {
      log("ERROR", "❌ IP 被 Google 封锁，需要更换 IP");
      log("ERROR", "Exit Code 88: IP 被风控，触发 IP 轮换机制");
      process.exit(88); // 特殊退出码，触发 IP 轮换
    }

    // 第一次尝试：点击 checkbox
    if (attempt === 0) {
      await clickRecaptchaCheckbox(page);
      await delay(3000);
      if (await isRecaptchaSolved(page)) {
        log("SUCCESS", "✅ reCAPTCHA 通过点击解决");
        return true;
      }
    }

    // 切换到音频模式
    if (!await switchToAudio(page)) {
      log("WARN", "无法切换到音频模式");
      await reloadChallenge(page);
      continue;
    }

    // 获取音频 URL
    const audioUrl = await getAudioUrl(page);
    if (!audioUrl) {
      log("WARN", "无法获取音频 URL");
      await reloadChallenge(page);
      continue;
    }

    log("DEBUG", "获取到音频 URL");

    // 下载音频
    const mp3Path = await downloadAudio(audioUrl);
    if (!mp3Path) {
      downloadFails++;
      if (downloadFails >= 3) {
        log("ERROR", "❌ 音频连续下载失败");
        return false;
      }
      await reloadChallenge(page);
      continue;
    }
    downloadFails = 0;

    // 语音识别
    const text = await recognizeAudio(mp3Path);
    if (!text) {
      log("WARN", "⚠️ 自动识别失败，等待手动输入...");
      
      // 等待用户手动输入（如果是在交互模式下）
      // 在自动化环境中，这会导致超时
      await delay(15000);
      
      if (await isRecaptchaSolved(page)) {
        log("SUCCESS", "✅ reCAPTCHA 已手动解决");
        return true;
      }

      await reloadChallenge(page);
      continue;
    }

    // 填写答案
    await fillAudioAnswer(page, text);
    await delay(5000);

    if (await isRecaptchaSolved(page)) {
      log("SUCCESS", "✅ reCAPTCHA 通过音频解决");
      return true;
    }

    await reloadChallenge(page);
  }

  log("ERROR", "❌ reCAPTCHA 达到最大尝试次数");
  return false;
}

// 截图保存
async function saveScreenshot(page: Page, name: string): Promise<string | null> {
  try {
    const screenshotPath = `/tmp/${name}-${Date.now()}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    log("DEBUG", "截图已保存", { path: screenshotPath });
    return screenshotPath;
  } catch {
    return null;
  }
}

// 等待 Cloudflare 验证完成（增强版）
async function waitForCloudflare(page: Page, timeout = 60000): Promise<boolean> {
  try {
    log("INFO", "⏳ 检查 Cloudflare 验证...");
    
    // 等待页面加载完成
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    
    const cfIndicators = [
      'text=Performing security verification',
      'text=Verify you are human',
      'text=Checking your browser',
      '#challenge-running',
      '.cf-turnstile',
      'iframe[src*="challenges.cloudflare.com"]',
      'iframe[src*="turnstile"]',
      'text=Just a moment',
      'text=Checking if the site connection is secure'
    ];
    
    let isCF = false;
    for (const sel of cfIndicators) {
      if (await page.locator(sel).count() > 0) {
        isCF = true;
        break;
      }
    }
    
    if (!isCF) {
      log("INFO", "无 Cloudflare 验证页面");
      return true;
    }
    
    log("INFO", "⏳ 检测到 Cloudflare 验证，等待通过...");
    
    // 查找 Cloudflare Turnstile iframe
    const cfIframe = page.frameLocator('iframe[src*="challenges.cloudflare.com"], iframe[src*="turnstile"]');
    
    // 尝试点击 iframe 内的 checkbox
    try {
      const cfCheckbox = cfIframe.locator('input[type="checkbox"], .ctp-checkbox-label, label, body').first();
      if (await cfCheckbox.count() > 0) {
        await cfCheckbox.click({ force: true, timeout: 5000 });
        log("INFO", "☑️ 已点击 Cloudflare checkbox");
      }
    } catch (e) {
      // 尝试直接点击页面上的 checkbox
      try {
        const pageCheckbox = page.locator('input[type="checkbox"]').first();
        if (await pageCheckbox.count() > 0) {
          await pageCheckbox.click({ force: true });
          log("INFO", "☑️ 已点击页面 checkbox");
        }
      } catch {}
    }
    
    // 等待 Cloudflare 验证完成
    const start = Date.now();
    while (Date.now() - start < timeout) {
      let stillCF = false;
      for (const sel of cfIndicators) {
        if (await page.locator(sel).count() > 0) {
          stillCF = true;
          break;
        }
      }
      
      if (!stillCF) {
        log("SUCCESS", "✅ Cloudflare 验证已通过");
        await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
        await delay(3000); // 额外等待页面加载
        return true;
      }
      
      // 每隔几秒尝试点击 checkbox
      if ((Date.now() - start) % 10000 < 1000) {
        try {
          const cfCheckbox = cfIframe.locator('input[type="checkbox"], label').first();
          if (await cfCheckbox.count() > 0) {
            await cfCheckbox.click({ force: true, timeout: 2000 });
            log("DEBUG", "重试点击 Cloudflare checkbox");
          }
        } catch {}
      }
      
      await delay(1000);
    }
    
    log("WARN", "⚠️ Cloudflare 验证超时");
    return false;
  } catch (e) {
    log("WARN", "Cloudflare 检测出错", { error: String(e) });
    return true; // 继续执行
  }
}

async function gotoWithRetry(page: Page, url: string, retries = 3): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      log("DEBUG", `导航到: ${url} (尝试 ${i + 1}/${retries})`);
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
      
      // 等待 Cloudflare 验证
      await waitForCloudflare(page);
      
      // 等待页面稳定
      await delay(2000);
      return;
    } catch (e) {
      if (i === retries - 1) throw e;
      log("WARN", `导航失败，重试中...`, { error: String(e) });
      await delay(5000);
    }
  }
}

async function main() {
  const tempUserDataDir = createTempUserDataDir();
  let browser: Browser | null = null;

  try {
    log("INFO", "🚀 启动浏览器...", { tempDir: tempUserDataDir });
    
    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-software-rasterizer",
        "--disable-extensions",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-popup-blocking",
        "--log-level=3",
        "--silent",
        "--window-size=1920,1080",
        // 额外的反检测参数
        "--disable-blink-features=AutomationControlled",
        "--disable-features=IsolateOrigins,site-per-process",
        "--enable-features=NetworkService,NetworkServiceInProcess",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
        "--disable-component-extensions-with-background-pages",
        "--disable-ipc-flood-unstable-relaxed",
        "--disable-hang-monitor",
        "--disable-client-side-phishing-detection",
        "--disable-sync",
        "--disable-default-apps",
        "--metrics-recording-only",
        "--no-pings",
        "--password-store=basic",
        "--use-mock-keychain",
      ],
    });

    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      viewport: { width: 1920, height: 1080 },
      locale: "en-US",
      timezoneId: "America/New_York",
      // 额外的上下文配置
      hasTouch: false,
      isMobile: false,
      javaScriptEnabled: true,
      ignoreHTTPSErrors: true,
    });

    // 注入反指纹脚本
    await context.addInitScript(ANTI_FINGERPRINT_JS);

    const page = await context.newPage();
    
    // 设置额外的请求头
    await page.setExtraHTTPHeaders({
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'max-age=0',
      'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
    });

    // ─── 1. 登录 ───────────────────────────────────────────
    log("INFO", "🔐 正在登录...", { email: maskEmail(EMAIL) });
    await gotoWithRetry(page, "https://host2play.gratis/sign-in");
    await delay(2000);

    // 处理可能出现的 Consent 弹窗
    await handleConsent(page);

    // 模拟人类行为
    await simulateHumanBehavior(page);

    log("INFO", "🔍 等待登录表单加载...");
    try {
      await page.waitForSelector('input#loginEmail, input[type="email"]', { state: "visible", timeout: 60000 });
    } catch (e) {
      const title = await page.title().catch(() => "");
      await saveScreenshot(page, "login-form-missing");
      log("ERROR", "❌ 登录表单未找到", { title, url: page.url() });
      throw e;
    }

    // 填写表单
    const emailInput = page.locator('input#loginEmail, input[type="email"]').first();
    const passwordInput = page.locator('input#loginPassword, input[type="password"]').first();
    
    // 模拟人类输入
    await emailInput.click();
    await randomDelay(100, 300);
    await emailInput.fill(EMAIL);
    await randomDelay(200, 500);
    
    await passwordInput.click();
    await randomDelay(100, 300);
    await passwordInput.fill(PASSWORD);
    await randomDelay(200, 500);
    
    log("INFO", "✅ 已填写表单");

    // 点击登录并监听响应
    const [signInResp] = await Promise.all([
      page.waitForResponse(
        (resp) => resp.url().includes("/sign-in") && resp.request().method() === "POST",
        { timeout: 20000 }
      ).catch(() => null),
      page.click('button#loginBtn, button[type="submit"]').catch(async () => {
        // 尝试通过 JS 触发登录
        await page.evaluate(() => (window as any).triggerLogin?.());
      }),
    ]);

    if (signInResp) {
      try {
        const data = await signInResp.json();
        log("DEBUG", "登录响应", { success: data.success, message: data.message });
        if (data.success !== 1 && data.success !== true) {
          throw new Error(`登录失败: ${data.message || "未知错误"}`);
        }
      } catch (e: any) {
        if (e.message?.includes("登录失败")) throw e;
      }
    }

    // 等待跳转到 panel
    await page.waitForURL("**/panel**", { timeout: 20000 }).catch(() => {
      log("WARN", "未检测到 URL 跳转，尝试直接访问...");
    });

    if (!page.url().includes("/panel")) {
      log("INFO", "直接导航到面板页");
      await gotoWithRetry(page, "https://host2play.gratis/panel/minecraft");
    }

    log("SUCCESS", "✅ 登录成功");

    // ─── 2. 前往续期页面 ───────────────────────────────────
    log("INFO", "🎮 正在前往 Minecraft 服务器页面...");
    await gotoWithRetry(page, RENEW_URL);
    await delay(3000);

    // 处理 Consent 弹窗
    await handleConsent(page);

    // 模拟人类行为
    await simulateHumanBehavior(page);

    // 清理可能的遮挡广告
    await page.evaluate(() => {
      const selectors = ['ins.adsbygoogle', 'iframe[src*="ads"]', '.modal-backdrop'];
      selectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => el.remove());
      });
    });

    // ─── 3. 查找并点击第一个 Renew 按钮 ─────────────────────
    log("INFO", "🔄 查找 Renew 按钮...");
    
    const renewSelectors = [
      'button:has-text("Renew")',
      'a:has-text("Renew")',
      '.btn:has-text("Renew")',
      '[class*="renew"]:has-text("Renew")',
      'button:has-text("Renew server")',
    ];

    let renewBtn = null;
    for (const selector of renewSelectors) {
      const btn = page.locator(selector).first();
      if (await btn.count() > 0) {
        renewBtn = btn;
        break;
      }
    }

    if (!renewBtn) {
      await saveScreenshot(page, "renew-btn-missing");
      const html = await page.content();
      log("ERROR", "❌ 未找到 Renew 按钮", { 
        url: page.url(), 
        hasRenew: html.includes("Renew"),
        bodyLength: html.length,
      });
      throw new Error("Renew 按钮未找到");
    }

    // 等待按钮可见
    await renewBtn.waitFor({ state: "visible", timeout: 15000 });

    // 滚动到按钮位置
    await renewBtn.scrollIntoViewIfNeeded();
    await randomDelay(500, 1000);

    // 点击第一个 Renew 按钮
    await renewBtn.click();
    log("INFO", "✅ 已点击第一个 Renew 按钮");
    await delay(3000);

    // ─── 4. 处理可能出现的第二个 Renew 按钮（弹窗中）─────────
    const secondRenewBtn = page.locator(
      'button:has-text("Renew"), [class*="modal"] button:has-text("Renew"), .modal-footer button:has-text("Renew")'
    ).first();

    if (await secondRenewBtn.count() > 0) {
      log("INFO", "检测到第二个 Renew 按钮，点击...");
      await delay(1000);
      await secondRenewBtn.click();
      log("INFO", "✅ 已点击第二个 Renew 按钮");
      await delay(5000);
    }

    // ─── 5. 处理 reCAPTCHA ───────────────────────────────────
    if (findRecaptchaFrame(page, "anchor")) {
      log("INFO", "检测到 reCAPTCHA，开始处理...");
      const solved = await solveRecaptcha(page, 3);
      if (!solved) {
        await saveScreenshot(page, "recaptcha-failed");
        
        // 检查是否是 IP 封锁导致的失败
        if (await isBlocked(page)) {
          log("ERROR", "❌ IP 被 Google 封锁");
          log("ERROR", "Exit Code 88: 触发 IP 轮换");
          process.exit(88);
        }
        
        throw new Error("reCAPTCHA 处理失败，可能需要手动处理或更换 IP");
      }
      await delay(3000);
    }

    // ─── 6. 点击最终的 Renew 按钮 ────────────────────────────
    const finalRenewBtn = page.locator(
      'button:has-text("Renew"):not([disabled]), [type="submit"]:has-text("Renew")'
    ).first();

    if (await finalRenewBtn.count() > 0 && await finalRenewBtn.isEnabled()) {
      log("INFO", "点击最终 Renew 按钮...");
      await finalRenewBtn.click();
      await delay(8000);
    }

    // ─── 7. 检查结果 ─────────────────────────────────────────
    const content = await page.content();
    const pageText = await page.textContent("body").catch(() => "");

    let success = false;
    if (
      content.includes("success") || 
      content.includes("Successfully") || 
      content.includes("renewed") ||
      pageText.includes("Successfully renewed")
    ) {
      success = true;
      log("SUCCESS", "✅ 续期成功！");
    } else {
      log("WARN", "⚠️ 续期状态未知");
    }

    // 获取到期时间
    const expiresEle = page.locator("text=Removes on, text=Expires on, text=Expires in").first();
    if (await expiresEle.count() > 0) {
      const expires = await expiresEle.textContent();
      log("INFO", "📅 有效期信息", { expires: expires?.trim() });
    }

    await saveScreenshot(page, success ? "success" : "result");

  } catch (e: any) {
    log("ERROR", "❌ 执行出错", { error: e.message });
    
    // 如果错误消息包含 IP 封锁相关内容，返回 88
    if (e.message?.includes("IP") || e.message?.includes("blocked") || e.message?.includes("封锁")) {
      log("ERROR", "检测到 IP 相关错误，可能需要轮换 IP");
      process.exit(88);
    }
    
    throw e;
  } finally {
    if (browser) {
      await browser.close();
    }
    // 清理临时目录
    try {
      if (fs.existsSync(tempUserDataDir)) {
        fs.rmSync(tempUserDataDir, { recursive: true, force: true });
      }
    } catch {}
  }
}

main().catch((e) => {
  log("ERROR", "❌ 致命错误", { error: e.message });
  process.exit(1);
});
