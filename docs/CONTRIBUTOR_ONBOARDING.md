# Contributor Onboarding

Welcome to **MikroTik Magic**, a TanStack Start web application for managing MikroTik-connected sites, routers, hotspot operations, vouchers, portals, telemetry, and related operational workflows.

This guide is intended to help a new contributor get from a fresh checkout to a productive local development loop. It describes the repository as it exists today; when a command or convention changes, update this document with the corresponding code change.

## 1. Before you begin

You will need **Node.js** and **npm** available on your machine. The repository is a TypeScript application using React, TanStack Start, Vite, and Vitest. A local Supabase-backed development environment is also useful for flows that require authentication, persistence, or server-side integrations.

Do not commit credentials. Copy `.env.example` to a local environment file or configure the variables through your development platform, and keep secret values out of source files, screenshots, test fixtures, and commit messages.

## 2. Local setup

Clone the private repository and enter the project directory:

```sh
git clone https://github.com/TeamMagic/mikromagic.git
cd mikromagic
```

Install dependencies and start the development server:

```sh
npm install
npm run dev
```

Vite will print the local development URL. Open that URL in a browser and use the application’s normal sign-in flow. If a task requires server functions, Supabase data, email, Telegram, router access, or other integrations, confirm that the relevant environment variables are configured before debugging application behavior.

The repository includes `.env.example` as the starting point for local configuration. Important variable groups include Supabase connection values, public application URL settings, router or VPS secrets, and optional integration credentials. The exact set of required values depends on the feature being exercised; inspect the relevant `.server.ts` or `*.functions.ts` module rather than copying production credentials into local files.

## 3. Daily development commands

| Purpose | Command | Notes |
|---|---|---|
| Start local development | `npm run dev` | Runs the Vite development server. |
| Build for production | `npm run build` | Builds the client and server application. |
| Development-mode build | `npm run build:dev` | Produces a development-mode build. |
| Preview a build | `npm run preview` | Serves a previously built application locally. |
| Run all tests | `npm test` | Executes the Vitest suite once. |
| Run one test file | `npx vitest run tests/<file>.test.ts` | Useful for focused iteration. |
| Lint | `npm run lint` | Runs ESLint across the repository. |
| Format files | `npm run format` | Runs Prettier; review the resulting diff before committing. |
| Audit translations | `npm run i18n:audit` | Checks translation source coverage and writes the generated report. |
| Check translation policy | `npm run i18n:ci` | CI-oriented i18n check, including report freshness and full coverage. |
| Scaffold translation entries | `npm run i18n:sync` | Adds missing locale entries for translator review. |

A practical pre-commit check is:

```sh
npm run lint
npm test
npm run i18n:ci
npm run build
```

The full suite is intentionally broad and may exercise code paths that need configured services. When a check cannot run because local infrastructure is missing, report the exact command, error, and environment limitation in the pull request rather than silently skipping it.

## 4. Repository structure

The project follows TanStack Start’s file-based routing model. The top-level areas are:

| Path | Responsibility |
|---|---|
| `src/routes/` | File-based routes, layouts, API endpoints, and route-specific UI. |
| `src/routes/__root.tsx` | Application shell, document head, providers, global error/not-found handling, and the route outlet. |
| `src/routes/_authenticated/` | Authenticated application screens and feature routes. |
| `src/routes/api/` | HTTP/API route handlers, including public connector endpoints. |
| `src/components/` | Reusable visual components and UI primitives. |
| `src/components/ui/` | Shared UI building blocks, largely based on Radix-style primitives and Tailwind classes. |
| `src/lib/` | Shared client utilities, server functions, domain logic, integrations, validation, and service modules. |
| `src/lib/*.functions.ts` | Server functions invoked from the client through TanStack Start. |
| `src/lib/*.server.ts` | Server-only implementations and credential-bearing integrations. |
| `src/lib/i18n/` | Language context, persistence, translators, locale dictionaries, and the generated i18n report. |
| `src/lib/theme/` | Theme state and the early theme bootstrap script. |
| `src/styles.css` | Global styles, design tokens, typography, and Tailwind-related styling. |
| `tests/` | Vitest tests covering UI, domain workflows, security contracts, integrations, and regression cases. |
| `scripts/` | Repository maintenance and static-analysis scripts, including translation tooling. |
| `public/` | Static assets served without bundling. |
| `vite.config.ts` / `vitest.config.ts` | Build and test configuration. |
| `.env.example` | Documented environment-variable starting point. |

Do not create a separate `src/pages/` directory or replace the root layout with a framework convention from another router. The repository’s route conventions are documented in [`src/routes/README.md`](../src/routes/README.md), and `src/routeTree.gen.ts` is generated by TanStack Router tooling, so it should not be edited by hand.

## 5. Key files and how to use them

### Application shell and providers

[`src/routes/__root.tsx`](../src/routes/__root.tsx) defines the document shell and wraps the application with the query client, theme provider, and language provider. Preserve the `<Outlet />`; removing it prevents nested routes from rendering.

### Feature routes

Feature pages live under [`src/routes/_authenticated/`](../src/routes/_authenticated/). Route filenames determine URLs. For example, `app.profile.tsx` contains the profile screen and `app.routers.tsx` contains router-management UI. Keep route-specific data loading and presentation close to the route unless logic is shared by multiple features.

### Server functions

Server functions live in files such as [`src/lib/profile.functions.ts`](../src/lib/profile.functions.ts), [`src/lib/routers.functions.ts`](../src/lib/routers.functions.ts), and [`src/lib/connectors.functions.ts`](../src/lib/connectors.functions.ts). They are the boundary for authenticated mutations, data access, external calls, and other server-side work. Validate inputs at this boundary, enforce authorization and tenant ownership there, and avoid moving secrets into browser-executed modules.

### Shared UI

Reusable controls belong in [`src/components/`](../src/components/), with generic primitives in [`src/components/ui/`](../src/components/ui/). Before creating a new button, dialog, table, toast, or form control, search the existing components and follow their established visual and accessibility patterns.

### Internationalization

The i18n entry point is [`src/lib/i18n/index.ts`](../src/lib/i18n/index.ts). Most route components use `useT()` from this module. English source strings are used as catalog keys; translated UI labels and copy are stored in [`src/lib/i18n/locales/zh.ts`](../src/lib/i18n/locales/zh.ts) and [`src/lib/i18n/locales/my.ts`](../src/lib/i18n/locales/my.ts).

Use `t.ui(...)` or `t.copy(...)` for user-facing text that should be translated. The project policy intentionally keeps action labels in English through `t.action(...)`. Run the i18n audit after adding or changing user-facing copy. The generated report at [`src/lib/i18n/report.generated.ts`](../src/lib/i18n/report.generated.ts) should be regenerated by the script rather than edited manually.

### Tests

Tests are organized by behavior rather than by one-to-one source-file mapping. Read nearby tests before adding a new case; existing files often encode important authorization, tenant-isolation, error-message, and integration contracts. UI tests use React Testing Library where needed, while many domain tests exercise pure functions and server-side logic without launching the full application.

## 6. Contribution workflow

Create a focused branch from the current `main` branch:

```sh
git checkout main
git pull --ff-only origin main
git checkout -b fix/short-description
```

Keep each change focused. When modifying a feature, update its tests in the same branch. Avoid drive-by formatting, generated-file edits, dependency upgrades, or unrelated refactors unless they are required for the change.

Before opening a pull request, review the complete diff and run the checks relevant to the affected area. At minimum, run lint and the focused tests; for changes to shared infrastructure, route wiring, i18n, authentication, server functions, or build configuration, also run the broader checks listed above.

Use a commit message that states the user-visible or engineering outcome, for example:

```text
Fix i18n hydration mismatch
```

The pull request description should explain the problem, the cause, the implementation, the validation performed, and any environment-dependent checks that could not be completed. Include screenshots for meaningful UI changes and explicitly call out schema, migration, or secret-configuration requirements.

## 7. Common pitfalls

The application uses server rendering, so browser-only APIs such as `window`, `document`, and `localStorage` must not influence the server-rendered markup or the first client render. Load browser state after hydration when it can change visible content.

Keep server-only modules separate from browser modules. Files containing credentials, `process.env`, router credentials, service-role keys, or external-service signing logic should remain on the server side.

Treat generated files as outputs. In particular, do not hand-edit `src/routeTree.gen.ts` or the generated i18n report. Change the source or generator, run the appropriate command, and review the generated diff.

When a feature touches router connectivity, hosted hubs, portals, payments, user management, or tenant data, read the nearest tests before implementation. Those tests frequently document safety constraints that are not obvious from the UI alone.

## References

[1]: https://github.com/TeamMagic/mikromagic "MikroTik Magic repository"
[2]: https://tanstack.com/start/latest/docs/framework/react/overview "TanStack Start documentation"
[3]: https://vite.dev/guide/ "Vite guide"
[4]: https://vitest.dev/guide/ "Vitest guide"
