import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function reinstall() {
  execSync('rm -rf node_modules && npm ci --omit=dev', { stdio: 'inherit' });
}

try {
  require('better-sqlite3');
} catch {
  reinstall();
}
