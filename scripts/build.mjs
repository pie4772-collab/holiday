import { spawnSync } from 'node:child_process';

const result = spawnSync('npx', ['vite', 'build'], { stdio: 'inherit', shell: true });
process.exit(result.status ?? 1);
