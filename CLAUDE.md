# Reclo

Two-sided outdoor advertising (OOH) marketplace for Uzbekistan. Clients browse billboards and LED
screens on a map and send inquiries to vendors; admins moderate.

## Stack

pnpm workspaces monorepo, TypeScript in strict mode everywhere.

| Path              | What                  | Stack                                                                                                   |
| ----------------- | --------------------- | ------------------------------------------------------------------------------------------------------- |
| `apps/web`        | Frontend (port 5173)  | Vite, React, React Router, Tailwind CSS, shadcn/ui, React Hook Form + Zod, TanStack Query for API calls |
| `apps/api`        | Backend (port 4000)   | Node LTS, Express, Prisma, PostgreSQL                                                                   |
| `packages/shared` | Zod schemas and types | Imported by web and api as `@reclo/shared`                                                              |
| root              | Shared config         | ESLint, Prettier, `tsconfig.base.json`, `docker-compose.yml` (Postgres on host port 5435)               |

Tests use Vitest in web and api, with Supertest for API routes. Root scripts are in `package.json`;
setup steps are in `README.md`.

## Rules

- **UI**: build every UI element from shadcn/ui components in `apps/web/src/components/ui`. Add a
  missing one with the CLI, run from `apps/web`: `pnpm dlx shadcn@latest add <name>`. The CLI owns
  those files: leave them as generated. shadcn/ui is the only UI library.
- **Validation**: define each Zod schema once in `packages/shared` and import it in both web (forms)
  and api (request validation). Derive types with `z.infer`.
- **Branches and commits**: one Jira subtask = one branch named `KAN-<number>-short-description`.
  Start every commit message with the issue key, e.g. `KAN-66: add user model`. Reference the
  mirrored GitHub issue in the PR description with `Closes #<number>` so merging closes it.
- **Done means verified**: before calling a task done, run `pnpm lint`, `pnpm typecheck`, and
  `pnpm test`, and show their output.

## Gotchas

- **Forms**: the shadcn `form` component is an empty stub in the current registry. Build forms with
  the `field` components (`Field`, `FieldLabel`, `FieldError`) plus React Hook Form's `Controller`
  and `zodResolver`.
- **Prisma 7**: the database URL lives in `apps/api/prisma7.config.ts`, and `schema.prisma` has no
  `url`. The client is generated into `apps/api/src/generated/prisma` (gitignored); import it from
  `./generated/prisma/client`. After editing the schema run `pnpm db:migrate`.
- **Shared package ships source**: `@reclo/shared` exports `src/index.ts` directly, so changes are
  live with no build step. The api build bundles it (`tsup.config.ts`).
- **API tests**: `createApp` in `apps/api/src/app.ts` takes its dependencies as arguments, so route
  tests pass stubs and run without a database.
- **Pinned versions**: TypeScript stays on 6.0.x (typescript-eslint does not support 7 yet) and
  Prisma on 7.x (8 is a release candidate).
- **New dependencies with install scripts** must be approved under `allowBuilds` in
  `pnpm-workspace.yaml`, or `pnpm install` fails.

## Jira

Project key: `KAN`.

Current task: **KAN-16 "Users authenticate by email and password"**. Do its subtasks in this order:

1. KAN-66 Design
2. KAN-67 Backend
3. KAN-68 Frontend
4. KAN-69 Testing
