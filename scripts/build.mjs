import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

if (existsSync('dist/index.html')) {
  console.log('Using prebuilt dist/');
  process.exit(0);
}

const result = spawnSync('npx', ['vite', 'build'], { stdio: 'inherit', shell: true });
process.exit(result.status ?? 1);
