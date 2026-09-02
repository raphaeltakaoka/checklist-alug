import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const crmPath = resolve(process.env.CRM_ALUG_PATH || '../crm-alug');
if (!existsSync(resolve(crmPath, 'firestore.rules'))) {
	console.error(`CRM rules repository not found at ${crmPath}. Set CRM_ALUG_PATH to its checkout.`);
	process.exit(1);
}

const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(command, ['run', 'test:rules'], {
	cwd: crmPath,
	stdio: 'inherit',
	env: process.env
});
process.exit(result.status ?? 1);
