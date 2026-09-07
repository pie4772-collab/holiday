import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const session = JSON.parse(fs.readFileSync(path.join(rootDir, 'deploy-session-active.json'), 'utf8'));
const uploadMap = Object.fromEntries(session.uploads.map((u) => [u.filename, u]));

for (const { filename, full_url: url } of session.uploads) {
  const filePath = path.join(rootDir, filename);
  const result = spawnSync('curl', ['-sfS', '-X', 'POST', '-F', `file=@${filePath}`, url], {
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    console.error(`Upload failed: ${filename}`);
    process.exit(result.status ?? 1);
  }
  console.log(`Uploaded ${filename}`);
}
