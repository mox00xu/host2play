
export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return '***';
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***';
  const domainParts = domain.split('.');
  const tld = domainParts.pop() ?? '';
  const domainMain = domainParts.join('.');
  const localMasked = local.length > 1 ? `${local[0]}${'*'.repeat(local.length - 1)}` : '*'.repeat(local.length);
  const domainMasked = domainMain.length > 1 ? `${'*'.repeat(domainMain.length - 1)}${domainMain[domainMain.length - 1]}` : '*'.repeat(domainMain.length);
  return `${localMasked}@${domainMasked}.${tld}`;
}

/**
 * 脱敏字符串: 前1后1中间全* (保留格式)
 * abcdefg → a*****g
 */
export function maskString(str: string | number | undefined | null): string {
  if (str === undefined || str === null) return 'N/A';
  const s = String(str);
  if (s.length <= 2) return '*'.repeat(s.length);
  return `${s[0]}${'*'.repeat(s.length - 2)}${s[s.length - 1]}`;
}

/**
 * 脱敏金额: 保留小数位，不暴露真实值
 * 9.99 → $*.**
 */
export function maskAmount(amount: number | undefined | null): string {
  if (amount === undefined || amount === null) return '$*.**';
  return '$*.**';
}

/**
 * 脱敏日期: 只显示月份和年份
 * 2026-06-13 → ****-06-**
 */
export function maskDate(date: string | undefined | null): string {
  if (!date) return '****-**-**';
  const matched = date.match(/^(\d{4}-\d{2})/);
  return matched ? `${matched[1]}-**` : '****-**-**';
}

/**
 * 递归脱敏对象中的敏感字段
 */
export function sanitize(obj: unknown): unknown {
  if (obj === null || obj === undefined) return null;
  if (typeof obj !== 'object') return obj;

  const sensitiveKeys = [
    'email', 'mail', 'user', 'username', 'account',
    'token', 'secret', 'key', 'password', 'pin',
    'balance', 'amount', 'price', 'cost', 'fee',
    'card', 'cvv', 'expiry', 'expires',
  ];

  if (Array.isArray(obj)) {
    return obj.map(sanitize);
  }

  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const keyLower = k.toLowerCase();
    if (sensitiveKeys.some(sk => keyLower.includes(sk))) {
      if (keyLower.includes('email') || keyLower.includes('mail')) {
        result[k] = maskEmail(String(v));
      } else if (['balance', 'amount', 'price', 'cost', 'fee'].some(sk => keyLower.includes(sk))) {
        result[k] = maskAmount(v as number);
      } else if (keyLower.includes('date') || keyLower.includes('expir')) {
        result[k] = maskDate(String(v));
      } else {
        result[k] = maskString(v);
      }
    } else if (typeof v === 'object' && v !== null) {
      result[k] = sanitize(v);
    } else {
      result[k] = v;
    }
  }
  return result;
}

export type LogLevel = 'INFO' | 'WARN' | 'SUCCESS' | 'ERROR' | 'SKIP';

export interface LogEntry {
  level: LogLevel;
  message: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

const LOGS: LogEntry[] = [];

export function log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
  const entry: LogEntry = {
    level,
    message,
    data: data ? (sanitize(data) as Record<string, unknown>) : undefined,
    timestamp: new Date().toISOString(),
  };
  LOGS.push(entry);

  const icon = level === 'SUCCESS' ? '✅' : level === 'WARN' ? '⚠️' : level === 'ERROR' ? '❌' : level === 'SKIP' ? '⏭️' : 'ℹ️';
  const dataStr = entry.data ? ` ${JSON.stringify(entry.data)}` : '';
  console.log(`${icon} [${level}] ${message}${dataStr}`);
}

export function getLogs(): LogEntry[] {
  return [...LOGS];
}

export function clearLogs(): void {
  LOGS.length = 0;
}
