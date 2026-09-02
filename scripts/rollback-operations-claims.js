import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
	EXPECTED_PROJECT_ID,
	initializeGuardedAdmin,
	parseArgs,
	redactUid
} from './firebase-admin-cli.js';

const args = parseArgs();
const snapshotPath = resolve(
	args.value('--snapshot') || 'artifacts/private/operations-claims-before.json'
);
const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));

if (snapshot.projectId !== EXPECTED_PROJECT_ID || !Array.isArray(snapshot.users)) {
	throw new Error(`Invalid claims snapshot for ${EXPECTED_PROJECT_ID}.`);
}

console.log(
	JSON.stringify(
		{
			mode: args.execute ? 'execute' : 'dry-run',
			projectId: EXPECTED_PROJECT_ID,
			snapshotCreatedAt: snapshot.createdAt,
			accounts: snapshot.users.map((user) => ({
				uidHash: redactUid(user.uid),
				operations: user.customClaims?.roles?.operations || []
			}))
		},
		null,
		2
	)
);

if (!args.execute) {
	console.log('Dry run only. Re-run with --execute to restore the exact snapshotted custom claims.');
	process.exit(0);
}

const { auth } = initializeGuardedAdmin();
for (const user of snapshot.users) {
	await auth.setCustomUserClaims(user.uid, user.customClaims || {});
}

console.log('Operations claims restored from the private snapshot.');
