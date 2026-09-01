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
const outputPath = resolve(
	args.value('--output') || 'artifacts/private/rollout-baseline.json'
);
const vercelDeploymentId = args.value('--vercel-deployment');
if (!vercelDeploymentId?.startsWith('dpl_')) {
	throw new Error('--vercel-deployment must be the current production deployment ID.');
}

const { auth, credential } = initializeGuardedAdmin();
const accessToken = await credential.getAccessToken();
const headers = { authorization: `Bearer ${accessToken.access_token}` };
const apiRoot = `https://firebaserules.googleapis.com/v1/projects/${EXPECTED_PROJECT_ID}`;
const releasesResponse = await fetch(`${apiRoot}/releases?pageSize=100`, { headers });
if (!releasesResponse.ok) {
	throw new Error(`Could not read Firebase rules releases (${releasesResponse.status}).`);
}
const releasesPayload = await releasesResponse.json();
const releases = (releasesPayload.releases || []).filter(
	(release) =>
		release.name?.includes('/releases/cloud.firestore') ||
		release.name?.includes('/releases/firebase.storage/')
);
if (releases.length !== 2) {
	throw new Error('Could not identify both current Firestore and Storage rules releases.');
}

const rulesets = [];
for (const release of releases) {
	const rulesetResponse = await fetch(
		`https://firebaserules.googleapis.com/v1/${release.rulesetName}`,
		{ headers }
	);
	if (!rulesetResponse.ok) {
		throw new Error(`Could not read Firebase ruleset ${release.rulesetName}.`);
	}
	rulesets.push({
		releaseName: release.name,
		rulesetName: release.rulesetName,
		ruleset: await rulesetResponse.json()
	});
}

const users = await listAllUsers(auth);
const redactedClaims = users
	.filter((user) => user.customClaims && Object.keys(user.customClaims).length > 0)
	.map((user) => ({ uidHash: redactUid(user.uid), customClaims: user.customClaims }));

await mkdir(dirname(outputPath), { recursive: true, mode: 0o700 });
await writeFile(
	outputPath,
	JSON.stringify(
		{
			projectId: EXPECTED_PROJECT_ID,
			recordedAt: new Date().toISOString(),
			vercelProductionDeploymentId: vercelDeploymentId,
			rulesets,
			redactedClaims
		},
		null,
		2
	),
	{ mode: 0o600, flag: 'wx' }
);

console.log(
	JSON.stringify(
		{
			projectId: EXPECTED_PROJECT_ID,
			vercelProductionDeploymentId: vercelDeploymentId,
			rulesReleases: rulesets.map(({ releaseName, rulesetName }) => ({ releaseName, rulesetName })),
			redactedClaimAccounts: redactedClaims.length,
			outputPath
		},
		null,
		2
	)
);
