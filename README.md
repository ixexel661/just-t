# just-t

The smallest practical i18n library: **JSON in → string out**.

## Features

- **Zero config**: `createJustT({ locale, messages })`
- **Interpolation**: `"Hello {name}"`
- **Optional, super simple plurals**: `one/other` via `count === 1`
- **Fail loudly**: in `dev` it **throws** on missing keys/params, in `prod` it returns the **key**
- **Type Safety**:
  - Keys are derived from `messages`
  - Params are derived from `{placeholders}` (with `as const`; for plurals includes `count: number`)

## Install

```bash
pnpm add just-t
```

## Usage

```ts
import { createJustT } from "just-t";

const justT = createJustT({
  locale: "en",
  fallbackLocale: "de",
  messages: {
    en: {
      welcome: "Hello",
      hello_user: "Hello {name}",
      items: { one: "{count} item", other: "{count} items" }
    },
    de: {
      welcome: "Hallo",
      hello_user: "Hallo {name}",
      items: { one: "{count} Ding", other: "{count} Dinge" }
    }
  } as const
});

justT.t("welcome");
justT.t("hello_user", { name: "Max" });
justT.t("items", { count: 3 });
```

## API (Exports)

```ts
import {
  createJustT,
  type JustT,
  type CreateJustTOptions,
  type MessagesByLocale,
  type MessageValue,
  type PluralMessage,
  type Locale
} from "just-t";
```

## Dev / Build

```bash
pnpm install
pnpm test
pnpm test:watch
pnpm test:types
pnpm build
pnpm typecheck
```

Note: `pnpm build` produces a **bundled & minified** `dist/index.js` via Rolldown and `dist/index.d.ts` via `tsc`.

## Release (npm)

```bash
# optional: login
npm login

# version bump (or edit package.json manually)
pnpm version patch

# see what gets published
pnpm pack

# publish (builds automatically via prepack)
npm publish
```

