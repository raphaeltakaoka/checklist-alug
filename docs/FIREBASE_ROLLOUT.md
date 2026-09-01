# Firebase and Vercel rollout

This runbook is intentionally specific to the development Firebase project `cadastro-alug---dev`. The maintenance scripts refuse any other service-account project.

## Scope and authority

The companion `crm-alug` branch is the authoritative source for Firestore rules, Storage rules, indexes, and emulator tests. The Checklist branch contains the app and guarded maintenance scripts.

The authorized reset deletes only:

- top-level documents and descendants in `checklists`, `checklist_summaries`, and `checklist_rate_limits`;
- Storage objects whose exact prefix is `checklists/`.

It preserves Authentication accounts, users, projects, cards, CRM data, other Storage prefixes, and custom claims. Claims are changed only by the separate expansion script.

## Preflight

1. Run `npm run verify` in Checklist and `npm test && npm run test:rules` in CRM.
2. Record the current Vercel production deployment ID and URL.
3. Record the current deployed Firestore and Storage rules revisions.
4. Run `npm run ops:expand-claims` without `--execute`; this prints only UID hashes and permission changes.
5. Run `npm run ops:reset` without `--execute`; verify every collection count and the exact `checklists/` Storage prefix.
6. Deploy the CRM indexes early and wait for every required index to become ready.
7. Deploy a Vercel preview from the tested commit and complete the mobile/offline/API smoke tests.

## Atomic cutover

Run from a secure local shell with `.env` containing the server service account:

```sh
npm run ops:reset -- --execute
npm run ops:reset
npm run ops:expand-claims -- --execute
```

The claims command creates `artifacts/private/operations-claims-before.json` with mode `0600` and refuses to overwrite an existing snapshot. Keep it private. Existing claims are merged rather than replaced.

Immediately deploy the tested Firestore and Storage rules from the CRM companion branch, then promote the exact verified Vercel preview artifact without rebuilding. Users whose claims changed must refresh their Firebase ID token (sign out/in is sufficient).

Smoke-test authentication, owner and administrator access, create/upload/list/detail/photo delete/report delete, assigned cards, notification controls, offline reload, reconnect/sync, and shared-device account switching. Inspect Vercel function errors and Firebase usage.

## Rollback

1. Roll Vercel back to the recorded production deployment.
2. Redeploy the recorded prior Firestore and Storage rules.
3. Preview the claims restore with `npm run ops:rollback-claims`, then run `npm run ops:rollback-claims -- --execute`.
4. Verify claims and force a fresh ID token.

The authorized checklist data reset is intentionally not restored. Unrelated CRM, Authentication, and Storage data remain intact.

## Dependency audit

The production dependency audit must report zero critical/high advisories before deployment. Development-only advisories may be accepted only when their vulnerable path is not shipped or reachable in the production output and the reason is recorded in the deployment notes. Do not use a breaking Firebase Admin downgrade to silence an audit.
