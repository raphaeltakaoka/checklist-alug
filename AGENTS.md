# Repository Guidelines

## Project Structure & Module Organization

This is a SvelteKit 5 JavaScript application. Routes and server endpoints live under `src/routes/`; dashboard features are in `src/routes/dashboard/`, and APIs use `+server.js` files in `src/routes/api/`. Reusable UI belongs in `src/lib/components/`, browser services in `src/lib/`, and privileged Firebase code in `src/lib/server/`. Imported images live in `src/lib/assets/`; public PWA assets live in `static/`. Keep feature-specific code near its route and move it to `$lib` only when reused.

## Build, Test, and Development Commands

- `npm install` installs the locked dependencies from `package-lock.json`.
- `npm run dev` starts the Vite development server; add `-- --open` to launch a browser.
- `npm run build` creates the production bundle and catches Svelte compilation errors.
- `npm run preview` serves the production build locally for final smoke testing.
- `npm run prepare` refreshes generated SvelteKit configuration.

There is no lint or automated test script. Run `npm run build` before submitting, then manually exercise the affected authentication, checklist, upload, notification, or offline/PWA flow.

## Coding Style & Naming Conventions

Follow existing Svelte 5 runes patterns (`$props`, `$state`, `$derived`). Match surrounding indentation, use single quotes for JavaScript imports, and retain semicolons. Name components in PascalCase (`DamageModal.svelte`), utilities in camelCase (`imageCompressor.js`), and routes with SvelteKit conventions (`+page.svelte`, `+layout.js`, `+server.js`). Prefer the `$lib` alias to long relative imports. Keep browser Firebase access in `src/lib/firebase.js` and server credentials in `src/lib/server/`.

## Testing Guidelines

When adding tests, use `*.test.js` beside the module or under a future `tests/` directory, and add an `npm test` script in the same change. Prioritize checklist persistence, synchronization, image compression, authorization, and notification APIs. Use mocks or a Firebase emulator, never production data.

## Commit & Pull Request Guidelines

Recent commits use short, lowercase, action-led summaries such as `added tasks` and `fixed camera upload`. Keep that concise style with a clear scope, for example `fix checklist photo upload`. Pull requests should explain the change, list verification, link the issue, and include screenshots or recordings for UI work. Explicitly call out Firebase configuration, environment-variable, schema, or PWA changes.

## Security & Configuration

Never commit `.env` files or service-account JSON. `FIREBASE_SERVICE_ACCOUNT` is private server configuration; do not expose it through client code or logs. Treat Firebase rules and API authorization checks as part of every data-access change.
