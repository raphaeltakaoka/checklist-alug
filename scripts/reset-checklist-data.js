import { initializeGuardedAdmin, parseArgs } from './firebase-admin-cli.js';

const COLLECTIONS = ['checklists', 'checklist_summaries', 'checklist_rate_limits'];
const STORAGE_PREFIX = 'checklists/';

async function countStorageObjects(bucket) {
	let pageToken;
	let count = 0;
	do {
		const [files, , response] = await bucket.getFiles({
			autoPaginate: false,
			pageToken,
			prefix: STORAGE_PREFIX
		});
		count += files.length;
		pageToken = response?.nextPageToken;
	} while (pageToken);
	return count;
}

const args = parseArgs();
const { db, bucket } = initializeGuardedAdmin();
const counts = {};

for (const collectionName of COLLECTIONS) {
	const snapshot = await db.collection(collectionName).count().get();
	counts[collectionName] = snapshot.data().count;
}
counts.storageObjects = await countStorageObjects(bucket);

console.log(
	JSON.stringify(
		{
			mode: args.execute ? 'execute' : 'dry-run',
			projectId: 'cadastro-alug---dev',
			collections: COLLECTIONS,
			storagePrefix: STORAGE_PREFIX,
			counts,
			preserved: ['Authentication accounts', 'all other Firestore collections', 'all other Storage prefixes']
		},
		null,
		2
	)
);

if (!args.execute) {
	console.log('Dry run only. Re-run with --execute after verifying the exact counts and prefix.');
	process.exit(0);
}

for (const collectionName of COLLECTIONS) {
	await db.recursiveDelete(db.collection(collectionName));
}
await bucket.deleteFiles({ force: true, prefix: STORAGE_PREFIX });

console.log('Checklist-only reset completed. The operation is idempotent; re-run dry mode to verify zero counts.');
