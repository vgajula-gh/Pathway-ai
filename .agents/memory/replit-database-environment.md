---
name: Replit database environment
description: A workspace environment label did not match the managed database used by Prisma.
---

In this workspace, `REPLIT_ENVIRONMENT` reported `production` while the Prisma connection used for schema sync matched the Replit development database. Confirm database targets explicitly before any schema change; do not use that label alone to select a database.

**Why:** The label caused a safe development-schema sync to be blocked, while explicit development-database introspection confirmed the connection target.

**How to apply:** Prefer database operations with an explicit `environment: "development"` target when using Replit's database tools. Before using a shell command that relies on `DATABASE_URL`, verify it is the intended development connection without displaying the URL.

The shell's `DATABASE_URL` and individual `PG*` connection settings can disagree; a PostgreSQL-looking URL is not proof that its database exists or is the managed development target.

**Why:** The URL once referenced a nonexistent database while the existing `PG*` settings matched independently queried development data.

**How to apply:** Confirm the connection against an explicit development query before migrations. If settings disagree, do not change persistent Secrets or select production to work around it.
