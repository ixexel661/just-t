# just-t

Die kleinste i18n-Library für den Alltag: **JSON rein → String raus**.

## Features

- **Zero config**: `createJustT({ locale, messages })`
- **Interpolation**: `"Hello {name}"`
- **Optionale, super simple Plurals**: `one/other` via `count === 1`
- **Fail loudly**: in `dev` wird bei fehlenden Keys/Params **geworfen**, in `prod` kommt der **Key zurück**
- **Type Safety**:
  - Keys werden aus `messages` abgeleitet
  - Params werden (bei `as const`) aus `{placeholders}` abgeleitet (bei Plurals inkl. `count: number`)

## Install

```bash
pnpm add just-t
```

## Usage

```ts
import { createJustT } from "just-t";

const i18n = createJustT({
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

i18n.t("welcome");
i18n.t("hello_user", { name: "Max" });
i18n.t("items", { count: 3 });
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
pnpm dev
pnpm build
pnpm typecheck
```

## Release (npm)

```bash
# optional: login
npm login

# Version bump (oder manuell in package.json)
pnpm version patch

# prüfen, was ins Paket kommt
pnpm pack

# publish (baut automatisch via prepack)
npm publish
```

