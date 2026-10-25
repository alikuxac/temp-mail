# Development

## Local development

```bash
npm run dev
```

`npm run dev` runs `wrangler dev --remote --var ENVIRONMENT:development`, so local code talks to
your **real** D1/R2 resources while behaving as non-production. Point it at safer resources when
you do not want to touch live data.

Mini App:

```bash
cd apps/telegram-mini-app && npm run dev
```

## Build

```bash
npm run build          # turbo: shared-types, worker (tsc), mini app (tsc + vite build)
```

## Deployment

```bash
# Worker
cd apps/workers
npm run deploy

# Mini App
cd apps/telegram-mini-app
npm run build
npm run deploy
```

Apply database migrations before or immediately after deploying a release that needs them; see
[Database](database.md).

## Continuous integration

`.github/workflows/ci.yml` publishes on `v*` tags (or via manual dispatch) and requires these
repository secrets:

| Secret | Used by |
|---|---|
| `CF_ACCOUNT_ID` | Both deploys |
| `CF_API_TOKEN` | Both deploys |
| `VITE_API_BASE_URL` | Mini App build |
| `VITE_DISCORD_CLIENT_ID` | Mini App build — required for the Discord Activity |
| `VITE_TELEGRAM_BOT_URL` | Mini App build |

CI does **not** run migrations. Run them yourself with the commands in
[Database](database.md).

## Release

The version lives in the **root** `package.json` only. Workspace manifests
(`apps/workers`, `apps/telegram-mini-app`, `packages/shared-types`) mirror that same version, and
`package-lock.json` is updated to match, so there is a single version to bump.

```bash
# 1. Bump the version everywhere (root + workspaces + lockfile)
npm version 0.3.0 --no-git-tag-version --workspaces --include-workspace-root

# 2. Verify
npm run build

# 3. Commit, then tag the root version
git commit -am "chore: release v0.3.0"
git tag v0.3.0
git push origin main --tags
```

Pushing a `v*` tag triggers the `Publish` workflow, which builds the monorepo and deploys both the
Worker and the Mini App.

Migrate the database **before** the deploy finishes if the release changes the schema; see
[Database](database.md#order).

## Repository scripts

| Script | Purpose |
|---|---|
| `scripts/sync-env.ps1` | Merge `.env.example` into `.env` without overwriting existing values (see [Setup](setup.md#project-setup)) |

## Scripts (apps/workers)

| Script | Purpose |
|---|---|
| `npm run dev` | Local development server against remote resources |
| `npm run deploy` | Deploy to Cloudflare Workers |
| `npm run tail` | Live logs from the deployed worker |
| `npm run db:create` | Create the D1 database |
| `npm run db:tables` | Apply the database schema |
| `npm run db:indexes` | Apply database indexes |
| `npm run db:migrate` | Apply migration `0002` |
| `npm run db:migrate:discord` | Apply migration `0003` (Discord links) |
| `npm run kv:create` | Create the KV namespace |
| `npm run check` | Lint + format checks |
| `npm run lint` | Biome lint |
| `npm run format` | Format with Biome |
| `npm run build` | Typecheck (`tsc --noEmit`) |
| `npm run cf-typegen` | Generate types for Cloudflare bindings |

## Scripts (apps/telegram-mini-app)

| Script | Purpose |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck + production build |
| `npm run preview` | Preview the production build |
| `npm run deploy` | Deploy to Cloudflare Pages |

## Related documents

- [Cloudflare](cloudflare.md) — resources the scripts operate on
- [Database](database.md) — schema and migrations
- [API](api.md) — endpoints available after deploying