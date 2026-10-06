# Checklist Alug

Mobile-first SvelteKit PWA for vehicle inspections. It supports offline drafts and history, owner-isolated IndexedDB storage, resumable media uploads, and authenticated Firebase APIs.

## Local setup

1. Install the locked dependencies with `npm install`.
2. Copy `.env.example` to `.env` and supply the Firebase web configuration.
3. Set `FIREBASE_SERVICE_ACCOUNT` only in trusted server environments. Never expose it through a `PUBLIC_` variable.
4. Run `npm run dev`.

The public Firebase and VAPID values use SvelteKit's `PUBLIC_*` convention because they are embedded in the browser bundle. Authorization is enforced with Firebase ID tokens, server-side permission checks, Firestore rules, and Storage rules—not by hiding those public identifiers.

## Verification

- `npm run check` validates Svelte and JavaScript usage.
- `npm run test:unit` runs local database, schema, media, serialization, and inspection form tests.
- `npm run test:ui` exercises the UI against a running local dev server with synthetic data and mocked Firebase. See [UI refresh and screenshots](docs/UI_REFRESH.md) for setup and coverage.
- `npm run test:rules` runs the authoritative Firebase emulator suite from the sibling `crm-alug` checkout. Set `CRM_ALUG_PATH` when it is elsewhere.
- `npm test` runs unit tests, checks, and the production build.
- `npm run verify` adds the shared rules tests and production dependency audit.

The authoritative `firestore.rules`, `storage.rules`, `firestore.indexes.json`, and emulator tests live in `crm-alug`. Do not create a divergent Checklist copy.

## Data model

- `checklists/{id}` stores validated full reports with immutable `ownerUid`.
- `checklist_summaries/{id}` stores list-card data only.
- Media is stored at `checklists/{ownerUid}/{inspectionId}/...` in Cloud Storage.
- Local IndexedDB v2 keys all reports and Blobs by owner UID and inspection ID.

New inspections use `schemaVersion: 3` and require a registered contact. `contactId` stores the
`contacts` document ID, `clientUid` stores its authoritative `uid` (falling back to the document ID),
and `clientSignatureName` stores the independent name of the signer. Version 2 completed reports
remain readable and syncable; resumed drafts adopt version 3. No IndexedDB version upgrade is needed.

`GET /api/contacts/search?q=...` searches the CRM's existing `searchTokens` after three normalized
characters and returns up to ten name matches, with minimal identifying fields. It scans at most
300 token matches per request; refine the query if a very broad term does not return the desired contact.
`GET /api/contacts/{id}` validates a delivery's contact before reusing it. Both routes require
operations or administrator read permission. Checklist sync resolves the UID inside the write
transaction and rejects missing contacts. New contact searches require connectivity; an already
linked draft can be completed offline and validated when it synchronizes.

The shared Firestore rules continue to deny browser writes to checklists; these additions use the
existing Admin SDK API authorization and contact search index, without deploying rules or indexes.

Browser clients may read data allowed by the shared rules, but all checklist Firestore mutations go through authenticated SvelteKit APIs. Inspectors can access only their own reports; administrators can access all reports.

## Deployment

The application uses `@sveltejs/adapter-vercel`. Configure every variable in `.env.example` in the Vercel `checklist-alug` project, including the server-only service account. Follow [docs/FIREBASE_ROLLOUT.md](docs/FIREBASE_ROLLOUT.md) for the atomic rollout and rollback procedure.
