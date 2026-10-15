// ============================================================================
// lib/password.ts —— 强密码哈希与校验（Node 内置 crypto.scrypt，零依赖）
// ----------------------------------------------------------------------------
// 流程：刷脸注册成功后 → 用户设置强密码（username + password）→ 此后
//       「账号 + 密码」即可登录，不再需要人脸识别。
// 安全：
//   - 随机盐 + scrypt 拉伸（KEYLEN 64B），存储格式 scrypt$salt$hash（base64）
//   - 校验用 timingSafeEqual（防时序攻击）
//   - 密码策略：8-128 位，须含 大写/小写/数字/符号 四类中至少三类
//   - 账号规则：字母开头、仅字母数字下划线、4-24 位；存储统一小写
// ============================================================================

import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

const KEY_LEN = 64;
const USERNAME_RE = /^[A-Za-z][A-Za-z0-9_]{3,23}$/;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEY_LEN);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const parts = stored.split('$');
    if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
    const saltPart = parts[1];
    const hashPart = parts[2];
    if (!saltPart || !hashPart) return false;
    const salt = Buffer.from(saltPart, 'base64');
    const expected = Buffer.from(hashPart, 'base64');
    if (expected.length === 0) return false;
    const actual = scryptSync(password, salt, expected.length);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/**
 * 强密码策略校验：8-128 位；大写/小写/数字/符号 至少三类。
 * 通过返回 null，否则返回中文提示。
 */
export function validateStrongPassword(password: string): string | null {
  if (password.length < 8) return '密码至少 8 位';
  if (password.length > 128) return '密码不能超过 128 位';
  let classes = 0;
  if (/[A-Z]/.test(password)) classes += 1;
  if (/[a-z]/.test(password)) classes += 1;
  if (/[0-9]/.test(password)) classes += 1;
  if (/[^A-Za-z0-9]/.test(password)) classes += 1;
  if (classes < 3) return '强密码需包含 大写字母 / 小写字母 / 数字 / 符号 中的至少三类';
  return null;
}

/** 账号名校验：字母开头，4-24 位字母数字下划线。返回规范化小写或错误提示。 */
export function normalizeUsername(raw: string): { ok: true; username: string } | { ok: false; error: string } {
  const username = raw.trim().toLowerCase();
  if (!USERNAME_RE.test(username)) {
    return { ok: false, error: '账号需以字母开头，仅含字母/数字/下划线，长度 4-24 位' };
  }
  return { ok: true, username };
}
