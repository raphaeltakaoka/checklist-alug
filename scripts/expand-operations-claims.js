import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
	EXPECTED_PROJECT_ID,
	initializeGuardedAdmin,
	listAllUsers,
	parseArgs,
	redactUid
} from './firebase-admin-cli.js';

const args = parseArgs();
const snapshotPath = resolve(
	args.value('--snapshot') || 'artifacts/private/operations-claims-before.json'
);
const { auth } = initializeGuardedAdmin();
const users = (await listAllUsers(auth)).filter(
	(user) => user.customClaims?.mainRole === 'operations'
);

if (users.length === 0) {
	throw new Error('No account with mainRole=operations was found.');
}

const changes = users.map((user) => ({
	uidHash: redactUid(user.uid),
	before: user.customClaims?.roles?.operations || [],
	after: [...new Set([...(user.customClaims?.roles?.operations || []), 'read', 'write', 'delete'])]
}));

console.log(
	JSON.stringify(
		{
			mode: args.execute ? 'execute' : 'dry-run',
			projectId: EXPECTED_PROJECT_ID,
			matchingAccounts: users.length,
			changes,
			snapshotPath: args.execute ? snapshotPath : 'created only with --execute'
		},
		null,
		2
	)
);

if (!args.execute) {
	console.log('Dry run only. Re-run with --execute after reviewing the redacted claim changes.');
	process.exit(0);
}

await mkdir(dirname(snapshotPath), { recursive: true, mode: 0o700 });
await writeFile(
	snapshotPath,
	JSON.stringify(
		{
			projectId: EXPECTED_PROJECT_ID,
			createdAt: new Date().toISOString(),
			users: users.map((user) => ({ uid: user.uid, customClaims: user.customClaims || {} }))
		},
		null,
		2
	),
	{ mode: 0o600, flag: 'wx' }
);

for (const user of users) {
	const claims = user.customClaims || {};
	await auth.setCustomUserClaims(user.uid, {
		...claims,
		roles: {
			...(claims.roles || {}),
			operations: [...new Set([...(claims.roles?.operations || []), 'read', 'write', 'delete'])]
		}
	});
}

console.log('Operations claims expanded. Existing claims were preserved and the private rollback snapshot was written.');
