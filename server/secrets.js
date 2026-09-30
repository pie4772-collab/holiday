import fs from 'node:fs';
import path from 'node:path';
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { USER_DATA_DIR } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KEY_FILE = process.env.SECRET_KEY_FILE
  || path.join(USER_DATA_DIR || path.join(__dirname, '../database'), 'secret.key');
const ENCRYPTED_PREFIX = 'enc:v1:';

/**
 * 비밀 키 원본(32바이트). APP_SECRET_KEY(hex 64자) → 키 파일 순으로 찾고, 없으면 키 파일을 새로 만듭니다.
 * 키 파일은 DB 밖(운영: /app/user_data/secret.key)에 두므로 DB 백업만으로는 암호문을 풀 수 없습니다.
 */
function loadMasterKey() {
  const fromEnv = String(process.env.APP_SECRET_KEY || '').trim();
  if (fromEnv) {
    if (!/^[0-9a-f]{64}$/i.test(fromEnv)) throw new Error('APP_SECRET_KEY는 16진수 64자(32바이트)여야 합니다.');
    return Buffer.from(fromEnv, 'hex');
  }
  if (!fs.existsSync(KEY_FILE)) {
    fs.mkdirSync(path.dirname(KEY_FILE), { recursive: true });
    try {
      fs.writeFileSync(KEY_FILE, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 });
      console.error(`[secrets] 새 비밀 키 파일을 만들었습니다: ${KEY_FILE}`);
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
  }
  const text = fs.readFileSync(KEY_FILE, 'utf8').trim();
  if (!/^[0-9a-f]{64}$/i.test(text)) throw new Error(`비밀 키 파일 형식이 올바르지 않습니다: ${KEY_FILE}`);
  return Buffer.from(text, 'hex');
}

const MASTER_KEY = loadMasterKey();

function deriveKey(purpose) {
  return Buffer.from(hkdfSync('sha256', MASTER_KEY, Buffer.alloc(0), `holiday:${purpose}`, 32));
}

const FIELD_KEY = deriveKey('field-encryption');

/** SESSION_SECRET이 있으면 그 값을, 없으면 비밀 키에서 파생한 값을 세션 서명에 씁니다. */
export const SESSION_SECRET = (() => {
  const fromEnv = String(process.env.SESSION_SECRET || '').trim();
  if (fromEnv) {
    if (fromEnv.length < 32) throw new Error('SESSION_SECRET은 32자 이상이어야 합니다.');
    return fromEnv;
  }
  return deriveKey('session-signing');
})();

export function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(ENCRYPTED_PREFIX);
}

export function encryptField(plain) {
  if (plain == null || plain === '') return plain;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', FIELD_KEY, iv);
  const body = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return ENCRYPTED_PREFIX + Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
}

/** 암호문이 아니면(이전 평문 데이터) 그대로 돌려줍니다. 키가 달라 풀 수 없으면 null입니다. */
export function decryptField(value) {
  if (!isEncrypted(value)) return value;
  try {
    const raw = Buffer.from(value.slice(ENCRYPTED_PREFIX.length), 'base64');
    const decipher = createDecipheriv('aes-256-gcm', FIELD_KEY, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
