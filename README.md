# Reclo

A two-sided outdoor advertising (OOH) marketplace for Uzbekistan. Clients browse billboards and LED
screens on a map and send inquiries to vendors; admins moderate.

## Prerequisites

| Tool           | Version                     | Check                    |
| -------------- | --------------------------- | ------------------------ |
| Node.js        | 24 LTS (see `.nvmrc`)       | `node --version`         |
| pnpm           | 12                          | `pnpm --version`         |
| Docker Desktop | any recent, must be running | `docker compose version` |

Install pnpm with `npm install -g pnpm@latest` if you do not have it.

## Setup from a fresh clone

```bash
# 1. Install dependencies (this also generates the Prisma client)
pnpm install

# 2. Create your local env files
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# 3. Start PostgreSQL in Docker
pnpm db:up

# 4. Apply database migrations
pnpm db:migrate

# 5. Start the web app and the API together
pnpm dev
```

On Windows PowerShell, use `Copy-Item` instead of `cp` in step 2.

Then open:

- Web: http://localhost:5173
- API health check: http://localhost:4000/health (returns `{"status":"ok"}` when the database is reachable)

The defaults in the `.env.example` files work as they are for local development.

Sign-up only creates client accounts, and vendor accounts are created by an admin (Vendors in the
header). The first admin comes from `pnpm db:seed-admin`; see "Admin account" below.

## Ports

| Service    | Port | Notes                                                           |
| ---------- | ---- | --------------------------------------------------------------- |
| Web (Vite) | 5173 |                                                                 |
| API        | 4000 | Change with `PORT` in `apps/api/.env`                           |
| PostgreSQL | 5435 | Host port. Chosen so it does not clash with a Postgres on 5432. |

The database runs in the `reclo-cs363-postgres` container with user, password, and database all set
to `reclo`. These are local development credentials only.

## Scripts

Run these from the repository root.

| Command              | What it does                                               |
| -------------------- | ---------------------------------------------------------- |
| `pnpm dev`           | Runs the web app and the API together, with reload         |
| `pnpm build`         | Builds every package                                       |
| `pnpm lint`          | Runs ESLint and checks formatting with Prettier            |
| `pnpm format`        | Formats all files with Prettier                            |
| `pnpm typecheck`     | Type-checks every package                                  |
| `pnpm test`          | Runs the Vitest suites in web and api                      |
| `pnpm db:up`         | Starts the Docker PostgreSQL and waits until it is healthy |
| `pnpm db:down`       | Stops the Docker PostgreSQL (data is kept)                 |
| `pnpm db:migrate`    | Creates and applies Prisma migrations                      |
| `pnpm db:generate`   | Regenerates the Prisma client                              |
| `pnpm db:studio`     | Opens Prisma Studio                                        |
| `pnpm db:seed-admin` | Creates the first admin account (see below)                |

## Admin account

Nobody can become an admin through the app, so the first one is created from the command line. The
credentials come from the environment and are never stored in the repository:

```bash
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a long secret' pnpm db:seed-admin
```

The password must be 8 to 128 characters. The command is safe to run again: if the email already has
an account it is made an admin and its password is left alone. Sign in with these credentials, then
open `/admin/moderation` to review listings, or `/admin/vendors` to create vendor accounts.

## Project structure

```
apps/
  web/        Vite + React + React Router + Tailwind CSS + shadcn/ui
  api/        Express + Prisma + PostgreSQL
packages/
  shared/     Zod schemas and types used by both web and api
```

## Team conventions

- **UI**: all UI uses shadcn/ui components. Add new ones with the CLI from `apps/web`
  (`pnpm dlx shadcn@latest add <name>`); do not copy or hand-edit them.
- **Validation**: Zod schemas live in `packages/shared` and are reused by web and api.
- **Branches**: one Jira subtask = one branch named `KAN-<number>-short-description`.
- **Commits**: start the message with the issue key, e.g. `KAN-66: add user model`.
- **Before calling a task done**: `pnpm lint`, `pnpm typecheck`, and `pnpm test` must all pass.

## Troubleshooting

- **`pnpm install` fails with `ERR_PNPM_IGNORED_BUILDS`**: a new dependency has an install script.
  Review it, then allow it under `allowBuilds` in `pnpm-workspace.yaml`.
- **`/health` returns 503**: the API cannot reach the database. Run `pnpm db:up` and check that
  `DATABASE_URL` in `apps/api/.env` matches `apps/api/.env.example`.
- **Port already in use**: something else is using 5173, 4000, or 5435. Stop it, or change the port
  (`PORT` in `apps/api/.env`, `server.port` in `apps/web/vite.config.ts`, `ports` in
  `docker-compose.yml` together with `DATABASE_URL`).
- **TypeScript cannot find `./generated/prisma/client`**: run `pnpm db:generate`.
