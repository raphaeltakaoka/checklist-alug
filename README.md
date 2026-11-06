# Checklist Alug

Mobile-first SvelteKit PWA for vehicle inspections. It supports offline drafts and history, owner-isolated IndexedDB storage, resumable media uploads, and authenticated Firebase APIs.

## Local setup

Requires Node.js 24.12 or newer within the 24.x release line. The upper bound keeps
Vercel builds on the runtime supported by the SvelteKit adapter. SvelteKit configuration lives in `vite.config.js`;
the `$lib` alias is declared explicitly there and in `jsconfig.json`.
TypeScript stays on 6.x to satisfy SvelteKit 3 and `svelte-check` peer dependencies.

1. Install the locked dependencies with `npm install`.
2. Copy `.env.example` to `.env` and supply the Firebase web configuration.
3. Set `FIREBASE_SERVICE_ACCOUNT` only in trusted server environments. Never expose it through a `PUBLIC_` variable.
4. Run `npm run dev`.

The public Firebase and VAPID values are declared with `public: true` and `static: true`
in `src/env.js`, preserving their `PUBLIC_*` names and embedding them in the browser
bundle. Server credentials remain private runtime variables. Authorization is enforced with Firebase ID tokens, server-side permission checks, Firestore rules, and Storage rules—not by hiding those public identifiers.

## Verification

- `npm run check` validates Svelte and JavaScript usage.
- `npm run test:unit` runs local database, schema, media, serialization, and inspection form tests.
- `npm run test:ui` exercises the UI against a running local dev server with synthetic data and mocked Firebase. See [UI refresh and screenshots](docs/UI_REFRESH.md) for setup and coverage.
- `npm run test:rules` runs the authoritative Firebase emulator suite from the sibling `crm-alug` checkout. Set `CRM_ALUG_PATH` when it is elsewhere.
- `npm test` runs unit tests, checks, and the production build.
- `npm run verify` adds the shared rules tests and production dependency audit.

The authoritative `firestore.rules`, `storage.rules`, `firestore.indexes.json`, and emulator tests live in `crm-alug`. Do not create a divergent Checklist copy.

Tasks query the `cards` collection group with `boardType == operations`, the signed-in
user's `assignedUserId`, `state == active`, and ascending `dueDateKey`, in pages of 50.
Migrated access profiles require `operations.read` in addition to Checklist access.
The matching collection-group index (`boardType`, `assignedUserId`, `state`,
`dueDateKey`, all ascending) is maintained in `crm-alug` and must be ready before
publishing this query. Permission failures are reported separately from connection failures.

## Data model

- `checklists/{id}` stores validated full reports with immutable `ownerUid`.
- `checklist_summaries/{id}` stores list-card data only.
- Media is stored at `checklists/{ownerUid}/{inspectionId}/...` in Cloud Storage.
- Local IndexedDB v2 keys all reports and Blobs by owner UID and inspection ID.

Local storage keeps drafts and completed inspections awaiting synchronization. After
the cloud confirms a successful sync, the local report and its media are deleted.
Failed uploads stay on the device for retry. Previously retained synced copies are
removed when the owner reads local history or opens a local report. Synced reports
remain available through the cloud history; photo edits do not recreate local copies.

History reuses the inspection vehicle picker: plate suggestions start after three
characters. Selecting a vehicle queries its plate across all checklist summaries,
preserves the inspector's owner filter, and sorts the matching reports newest first.
The plate query uses equality filters without a date ordering clause, so it does
not require a new composite index. Clearing the plate restores the paginated history.

New inspections use `schemaVersion: 4` and require a registered contact and vehicle.
`carId` stores the `cars` document ID. `contactId` stores the
`contacts` document ID, `clientUid` stores its authoritative `uid` (falling back to the document ID),
and `clientSignatureName` stores the independent name of the signer. Only version 4 is supported;
other schema versions are rejected without conversion. No IndexedDB version upgrade is needed.

Completed reports require `location: { latitude, longitude, accuracy, capturedAt }`.
Coordinates and accuracy (meters) are finite numbers; `capturedAt` is the device's capture
time in UTC ISO format. Drafts may have no location. Every entry into the final step requests
a new high-accuracy device position (`maximumAge: 0`, timeout 15 seconds), including after
resuming a draft. Permission denial or acquisition failure blocks completion, with a retry
control; drafts can still be saved. Each return inspection captures its own location.
An acquired location works offline, and synchronization preserves it without recapturing.
Once synchronized, the API rejects location changes or removal. Coordinates are stored only
in the full report, not in list summaries. This does not change shared Firebase rules or indexes.

### Static location map

The final step, report, and print layout show coordinates, approximate accuracy and capture
time. With `PUBLIC_GOOGLE_MAPS_STATIC_API_KEY`, they also display a Google Maps Static API
image with a fixed marker. This public, optional build-time key is separate from Firebase keys:

1. Enable Maps Static API and billing in the intended Google Cloud project.
2. Create a dedicated API key restricted to **Maps Static API** and HTTP referrers for the
   authorized app domains. Use a separate restricted key for localhost development if needed.
3. Set `PUBLIC_GOOGLE_MAPS_STATIC_API_KEY` in the build environment and rebuild/redeploy.
4. Set appropriate API quotas and check a map load on the authorized domain.

See [Google's setup guide](https://developers.google.com/maps/documentation/maps-static/get-api-key).
Do not commit key values. The app loads map images directly from Google and preserves their
attribution; the image is not stored in Firebase, IndexedDB, or the app's service-worker cache.
Coordinates are sent to Google when loading the map. No reverse geocoding or background
tracking is performed. A missing key, offline connection or image failure falls back to the
recorded coordinates and never blocks completion after successful geolocation. Printing always
includes textual location data and includes the map when loaded.

Geolocation requires HTTPS (localhost is supported for development), a compatible browser,
and device/browser permission. Before this release is used, the operator must delete all old
checklists from Firestore and every device, then update/reload installed PWAs. No compatibility
layer or schema migration is provided. This implementation does not perform that deletion.

`GET /api/contacts/search?q=...` searches the CRM's existing `searchTokens` after three normalized
characters and returns up to ten name matches, with minimal identifying fields. It scans at most
300 token matches per request; refine the query if a very broad term does not return the desired contact.
`GET /api/contacts/{id}` validates a delivery's contact before reusing it. Both routes require
operations or administrator read permission. Checklist sync resolves the UID inside the write
transaction and rejects missing contacts. New contact searches require connectivity; an already
linked draft can be completed offline and validated when it synchronizes.

`GET /api/cars/search?q=...` searches the existing single-field `plate` index after three
characters, returning up to ten vehicles with plate, make and model. The picker waits 300 ms,
normalizes case and hyphens, and requires selection; unlinking clears the plate and car ID.
`GET /api/cars/{id}` validates a delivery vehicle before reusing it. Both endpoints require
operations or administrator read permission. Synchronization verifies that the selected car
still exists and its registered plate matches the inspection. Saved vehicle links remain
available offline; finding a new vehicle requires connectivity. Changing the vehicle clears
the prior delivery and inherited damages. No new Firestore indexes or rules are required.

The shared Firestore rules continue to deny browser writes to checklists; these additions use the
existing Admin SDK API authorization and contact search index, without deploying rules or indexes.

Browser clients may read data allowed by the shared rules, but all checklist Firestore mutations go through authenticated SvelteKit APIs. Inspectors can access only their own reports; administrators can access all reports.

## Access profiles

Checklist resolves the CRM's shared `user_access/{uid}` assignment and
`access_profiles/{profileId}` on the server. Active assignments inherit profile
permissions unless an individual override is present. Existing inactive or malformed
assignments deny access; old token roles are used only for accounts without an
assignment when `access_control/state.allowLegacy` explicitly permits it (or no
migration state exists).

Login loads effective grants through `GET /api/auth/access`. Starting a new inspection
requires `checklists.create`, modifying a cloud report requires `checklists.update`,
and other owners' reports require the matching `checklists.all.*` grant. The API
rechecks current policy on every request. Contact and vehicle lookups also require
`contacts.read` and `fleet.vehicles.read`, respectively; notifications use
`notifications.send` independently of checklist permissions.

For offline drafts, the browser caches the last verified grants separately per UID.
An explicit access denial clears that account's cache. Reopening online refreshes
the profile; cached UI grants never authorize a server write. Existing shared
Firestore and Storage rules already resolve these same policy documents, so this
change requires no rules, indexes, environment variables, or token-claim expansion.

## Deployment

The application uses `@sveltejs/adapter-vercel`. Configure every variable in `.env.example` in the Vercel `checklist-alug` project, including the server-only service account. Follow [docs/FIREBASE_ROLLOUT.md](docs/FIREBASE_ROLLOUT.md) for the atomic rollout and rollback procedure.
