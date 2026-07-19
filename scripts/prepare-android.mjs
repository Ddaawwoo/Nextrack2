import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

if (!existsSync('android')) {
  const executable = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const result = spawnSync(executable, ['cap', 'add', 'android'], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
