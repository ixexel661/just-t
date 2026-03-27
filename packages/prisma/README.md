# @just-t/prisma

Optional Prisma plugin for [`just-t`](../just-t).

It loads translation messages from your database (either as a JSON blob per locale, per-key rows, or both),
applies a simple version-based in-memory cache, and then returns a normal `just-t` instance.

## Install

```bash
pnpm add @just-t/prisma
pnpm add @prisma/client
```

## Prisma schema (example)

You can model translations in either (or both) of these ways:

### 1) One JSON blob per locale

```prisma
model LocaleMessages {
  locale    String  @id
  json      Json
  updatedAt DateTime @updatedAt
}
```

### 2) One row per key

```prisma
model Translation {
  id        String  @id @default(cuid())
  locale    String
  key       String
  value     Json
  updatedAt DateTime @updatedAt

  @@unique([locale, key])
}
```

## Usage

```ts
import { PrismaClient } from "@prisma/client";
import { createJustTPrisma } from "@just-t/prisma";

const prisma = new PrismaClient();

const i18n = await createJustTPrisma({
  prisma,
  locale: "en",
  fallbackLocale: "de",
  source: "both", // "json" | "rows" | "both"
  cache: { key: "default" } // optional (e.g. per-tenant)
});

i18n.t("welcome");
```

## Caching

The cache is in-memory and version-based: it checks the max `updatedAt` in the relevant tables and reloads
only when the version changes.

