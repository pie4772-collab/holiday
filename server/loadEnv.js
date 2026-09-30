import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** server/.env 로드 (--env-file 없이도 동작, AI Space 등 PaaS 호환) */
export function loadEnvFile() {
  loadFile(path.join(__dirname, '.env'));
  // Cafe24 AI Space는 콘솔 환경변수·DB 접속 정보를 프로젝트 루트 .env로 주입할 수 있습니다.
  loadFile(path.join(__dirname, '..', '.env'));
}

function loadFile(envPath) {
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
