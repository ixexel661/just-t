export type Locale = string;

export type PluralMessage = {
  one: string;
  other: string;
};

export type MessageValue = string | PluralMessage | { [k: string]: MessageValue };
export type MessagesByLocale<L extends Locale = Locale> = Record<L, Record<string, MessageValue>>;

type Primitive = string | number | boolean | null | undefined;

type Join<K extends string, P extends string> = P extends "" ? K : `${K}.${P}`;

type KeysOfMessages<T> = T extends string
  ? ""
  : T extends PluralMessage
    ? ""
    : T extends Record<string, any>
      ? {
          [K in Extract<keyof T, string>]: T[K] extends string | PluralMessage
            ? K
            : T[K] extends Record<string, any>
              ? Join<K, KeysOfMessages<T[K]>>
              : never;
        }[Extract<keyof T, string>]
      : never;

type ValueAtPath<T, P extends string> = P extends `${infer K}.${infer Rest}`
  ? K extends keyof T
    ? ValueAtPath<T[K], Rest>
    : never
  : P extends keyof T
    ? T[P]
    : never;

type ExtractParamsFromString<S extends string> =
  S extends `${string}{${infer P}}${infer Rest}`
    ? P | ExtractParamsFromString<Rest>
    : never;

type ParamsForValue<V> = V extends string
  ? ExtractParamsFromString<V> extends never
    ? {}
    : { [K in ExtractParamsFromString<V>]: Primitive }
  : V extends PluralMessage
    ? ({ count: number } & (ExtractParamsFromString<V["one"] | V["other"]> extends never
        ? {}
        : { [K in Exclude<ExtractParamsFromString<V["one"] | V["other"]>, "count">]: Primitive }))
    : {};

export type CreateJustTOptions<
  L extends Locale,
  M extends MessagesByLocale<L>
> = {
  locale: L;
  messages: M;
  fallbackLocale?: L;
  /**
   * dev: throw on missing key / missing interpolation params
   * prod: return the key (silent + fast)
   *
   * Default: NODE_ENV !== "production"
   */
  dev?: boolean;
};

export type JustT<
  L extends Locale,
  M extends MessagesByLocale<L>
> = {
  locale: L;
  setLocale: (next: L) => void;
  t: <K extends KeysOfMessages<M[L]>>(
    key: K,
    ...args: keyof ParamsForValue<ValueAtPath<M[L], K>> extends never
      ? []
      : [params: ParamsForValue<ValueAtPath<M[L], K>>]
  ) => string;
};

function isPluralMessage(x: unknown): x is PluralMessage {
  return !!x && typeof x === "object" && "one" in (x as any) && "other" in (x as any);
}

function getByDotPath(obj: unknown, path: string): unknown {
  let cur: any = obj;
  for (const part of path.split(".")) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = cur[part];
  }
  return cur;
}

const PARAM_RE = /\{(\w+)\}/g;

function interpolate(template: string, params: Record<string, Primitive> | undefined, dev: boolean, keyForErrors: string): string {
  const missing: string[] = [];
  const out = template.replace(PARAM_RE, (_m, name: string) => {
    const v = params?.[name];
    if (v === undefined) {
      missing.push(name);
      return `{${name}}`;
    }
    return String(v);
  });

  if (dev && missing.length) {
    throw new Error(`[just-t] Missing interpolation params for "${keyForErrors}": ${missing.join(", ")}`);
  }
  return out;
}

function detectDevDefault(): boolean {
  const p = (globalThis as any)?.process;
  const env = p?.env;
  const nodeEnv = typeof env?.NODE_ENV === "string" ? env.NODE_ENV : undefined;
  return nodeEnv !== "production";
}

export function createJustT<
  const L extends Locale,
  const M extends MessagesByLocale<L>
>(opts: CreateJustTOptions<L, M>): JustT<L, M> {
  const dev = opts.dev ?? detectDevDefault();
  let currentLocale: L = opts.locale;

  function resolveRaw(locale: L, key: string): unknown {
    return getByDotPath(opts.messages[locale], key);
  }

  function resolveWithFallback(key: string): unknown {
    const primary = resolveRaw(currentLocale, key);
    if (primary !== undefined) return primary;
    if (opts.fallbackLocale && opts.fallbackLocale !== currentLocale) {
      return resolveRaw(opts.fallbackLocale, key);
    }
    return undefined;
  }

  function failOrKey(key: string, message: string): string {
    if (dev) throw new Error(message);
    return key;
  }

  const api: JustT<L, M> = {
    get locale() {
      return currentLocale;
    },
    setLocale(next: L) {
      currentLocale = next;
    },
    t(key: any, params?: any) {
      const raw = resolveWithFallback(String(key));
      if (raw === undefined) {
        return failOrKey(String(key), `[just-t] Missing key: "${String(key)}" (locale "${currentLocale}")`);
      }

      if (typeof raw === "string") {
        return interpolate(raw, params, dev, String(key));
      }

      if (isPluralMessage(raw)) {
        const count = params?.count;
        if (typeof count !== "number") {
          return failOrKey(String(key), `[just-t] Missing "count" for plural key: "${String(key)}"`);
        }
        const tpl = count === 1 ? raw.one : raw.other;
        return interpolate(tpl, { ...params, count }, dev, String(key));
      }

      return failOrKey(
        String(key),
        `[just-t] Key "${String(key)}" did not resolve to a string or plural message`
      );
    }
  };

  return api;
}

