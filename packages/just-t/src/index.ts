export type Locale = string;

export type PluralMessage = {
	one: string;
	other: string;
};

export type MessageValue =
	| string
	| PluralMessage
	| { [k: string]: MessageValue };
export type MessagesByLocale<L extends Locale = Locale> = Record<
	L,
	Record<string, MessageValue>
>;

type Primitive = string | number | boolean | null | undefined;

type Join<K extends string, P extends string> = P extends "" ? K : `${K}.${P}`;

type KeysOfMessages<T> = T extends string
	? ""
	: T extends PluralMessage
		? ""
		: T extends Record<string, MessageValue>
			? {
					[K in Extract<keyof T, string>]: T[K] extends string | PluralMessage
						? K
						: T[K] extends Record<string, MessageValue>
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
		? object
		: { [K in ExtractParamsFromString<V>]: Primitive }
	: V extends PluralMessage
		? { count: number } & (ExtractParamsFromString<
				V["one"] | V["other"]
			> extends never
				? object
				: {
						[K in Exclude<
							ExtractParamsFromString<V["one"] | V["other"]>,
							"count"
						>]: Primitive;
					})
		: object;

export type CreateJustTOptions<
	L extends Locale,
	M extends MessagesByLocale<L>,
> = {
	locale: L;
	/**
	 * Inline messages (type-safe). Optional if you load from JSON or files.
	 */
	messages?: M;
	/**
	 * Messages as JSON string or object. Browser-safe.
	 *
	 * Supports either:
	 * - `{ "en": {...}, "de": {...} }` (all locales in one object)
	 * - `{ ... }` (single locale message tree) — in this case you must also set `jsonLocale`.
	 */
	json?: string | unknown;
	/**
	 * Used when `json` is a single-locale message tree.
	 */
	jsonLocale?: L;
	/**
	 * Node-only: path to a JSON file.
	 * - If file contains `{ "en": {...}, "de": {...} }`, it is treated as multi-locale.
	 * - Otherwise it is treated as single-locale and locale is derived from filename (e.g. `en.json` → `en`).
	 */
	file?: string;
	/**
	 * Node-only: path to a folder containing JSON files.
	 * Each `*.json` file is treated as single-locale, locale derived from filename.
	 */
	folder?: string;
	fallbackLocale?: L;
	// dev=true: throw (missing key/params). dev=false: return key. Default: NODE_ENV !== "production"
	dev?: boolean;
};

export type JustT<L extends Locale, M extends MessagesByLocale<L>> = {
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
	if (!x || typeof x !== "object") return false;
	const maybePlural = x as { one?: unknown; other?: unknown };
	return (
		typeof maybePlural.one === "string" && typeof maybePlural.other === "string"
	);
}

function getByDotPath(obj: unknown, path: string): unknown {
	let cur: unknown = obj;
	for (const part of path.split(".")) {
		if (!cur || typeof cur !== "object") return undefined;
		cur = (cur as Record<string, unknown>)[part];
	}
	return cur;
}

const PARAM_RE = /\{(\w+)\}/g;

function interpolate(
	template: string,
	params: Record<string, Primitive> | undefined,
	dev: boolean,
	keyForErrors: string,
): string {
	if (!template.includes("{")) return template;

	const missing = dev ? ([] as string[]) : null;
	const out = template.replace(PARAM_RE, (_m, name: string) => {
		const v = params?.[name];
		if (v === undefined) {
			missing?.push(name);
			return `{${name}}`;
		}
		return String(v);
	});

	if (missing?.length) {
		throw new Error(
			`[just-t] Missing interpolation params for "${keyForErrors}": ${missing.join(", ")}`,
		);
	}
	return out;
}

function detectDevDefault(): boolean {
	const maybeGlobal = globalThis as {
		process?: { env?: { NODE_ENV?: unknown } };
	};
	const p = maybeGlobal.process;
	const env = p?.env;
	const nodeEnv = typeof env?.NODE_ENV === "string" ? env.NODE_ENV : undefined;
	return nodeEnv !== "production";
}

function isRecord(x: unknown): x is Record<string, unknown> {
	return !!x && typeof x === "object" && !Array.isArray(x);
}

function deepMerge(a: unknown, b: unknown): unknown {
	if (isRecord(a) && isRecord(b)) {
		const out: Record<string, unknown> = { ...a };
		for (const [k, v] of Object.entries(b)) {
			out[k] = deepMerge(out[k], v);
		}
		return out;
	}
	return b === undefined ? a : b;
}

function normalizeMessagesFromJson(
	input: unknown,
	opts: {
		jsonLocale?: string;
		filenameLocale?: string;
		preferMultiLocaleIfHas?: string;
	},
): MessagesByLocale {
	const obj =
		typeof input === "string" ? (JSON.parse(input) as unknown) : input;
	if (!isRecord(obj)) {
		throw new Error("[just-t] Invalid JSON: expected an object");
	}

	// Heuristic: treat as multi-locale if it contains the preferred locale key.
	const prefer = opts.preferMultiLocaleIfHas;
	if (prefer && prefer in obj && isRecord(obj[prefer])) {
		return obj as MessagesByLocale;
	}

	// If caller explicitly provided jsonLocale, treat as single-locale tree.
	if (opts.jsonLocale) {
		return { [opts.jsonLocale]: obj } as MessagesByLocale;
	}

	// If loaded from a file like `en.json`, treat as single-locale tree.
	if (opts.filenameLocale) {
		return { [opts.filenameLocale]: obj } as MessagesByLocale;
	}

	// Otherwise, default to multi-locale object.
	return obj as MessagesByLocale;
}

function isNodeLike(): boolean {
	return (
		typeof (globalThis as Record<string, unknown>)?.process === "object" &&
		typeof (globalThis as Record<string, unknown>)?.process !== "undefined"
	);
}

function extractLocaleFromFilename(filePath: string): string {
	const base = filePath.split(/[/\\\\]/).pop() ?? filePath;
	return base.replace(/\.json$/i, "");
}

async function loadNodeMessages(
	localeForHeuristics: string,
	input: { file?: string; folder?: string },
): Promise<MessagesByLocale> {
	if (!input.file && !input.folder) return {};
	if (!isNodeLike()) {
		throw new Error(
			"[just-t] file/folder options are only supported in Node.js. In the browser, pass `json` instead.",
		);
	}

	// Dynamic imports so browser bundles don't break.
	const fs = await import("node:fs/promises");
	const path = await import("node:path");

	let out: MessagesByLocale = {};

	if (input.file) {
		const jsonStr = await fs.readFile(input.file, "utf8");
		const filenameLocale = extractLocaleFromFilename(input.file);
		out = deepMerge(
			out,
			normalizeMessagesFromJson(jsonStr, {
				filenameLocale,
				preferMultiLocaleIfHas: localeForHeuristics,
			}),
		) as MessagesByLocale;
	}

	if (input.folder) {
		for (const entry of await fs.readdir(input.folder, {
			withFileTypes: true,
		})) {
			if (!entry.isFile()) continue;
			if (!entry.name.toLowerCase().endsWith(".json")) continue;
			const full = path.join(input.folder, entry.name);
			const jsonStr = await fs.readFile(full, "utf8");
			const filenameLocale = extractLocaleFromFilename(entry.name);
			out = deepMerge(
				out,
				normalizeMessagesFromJson(jsonStr, {
					filenameLocale,
					preferMultiLocaleIfHas: localeForHeuristics,
				}),
			) as MessagesByLocale;
		}
	}

	return out;
}

export function createJustT<
	const L extends Locale,
	const M extends MessagesByLocale<L>,
>(
	opts: CreateJustTOptions<L, M> & { file?: undefined; folder?: undefined },
): JustT<L, M>;
export function createJustT<
	const L extends Locale,
	const M extends MessagesByLocale<L>,
>(opts: CreateJustTOptions<L, M> & { file: string }): Promise<JustT<L, M>>;
export function createJustT<
	const L extends Locale,
	const M extends MessagesByLocale<L>,
>(opts: CreateJustTOptions<L, M> & { folder: string }): Promise<JustT<L, M>>;
export function createJustT<
	const L extends Locale,
	const M extends MessagesByLocale<L>,
>(opts: CreateJustTOptions<L, M>): JustT<L, M> | Promise<JustT<L, M>> {
	if (opts.file || opts.folder) {
		return (async () => {
			const loaded = await loadNodeMessages(opts.locale, {
				...(opts.file ? { file: opts.file } : {}),
				...(opts.folder ? { folder: opts.folder } : {}),
			});
			const nextOpts: CreateJustTOptions<L, M> & {
				file?: undefined;
				folder?: undefined;
			} = {
				locale: opts.locale,
				...(opts.fallbackLocale ? { fallbackLocale: opts.fallbackLocale } : {}),
				...(opts.dev !== undefined ? { dev: opts.dev } : {}),
				...(opts.json !== undefined ? { json: opts.json } : {}),
				...(opts.jsonLocale ? { jsonLocale: opts.jsonLocale } : {}),
				messages: deepMerge(loaded, opts.messages ?? {}) as M,
			};
			return createJustT(nextOpts);
		})();
	}

	const dev = opts.dev ?? detectDevDefault();
	let currentLocale: L = opts.locale;

	const fromJson: MessagesByLocale =
		opts.json === undefined
			? {}
			: normalizeMessagesFromJson(opts.json, {
					...(opts.jsonLocale ? { jsonLocale: opts.jsonLocale } : {}),
					preferMultiLocaleIfHas: opts.locale,
				});

	const mergedMessages = deepMerge(
		deepMerge({}, fromJson),
		(opts.messages ?? {}) as unknown,
	) as M;

	function resolveRaw(locale: L, key: string): unknown {
		return getByDotPath(mergedMessages[locale], key);
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

	const tImpl = (key: string, params?: Record<string, Primitive>): string => {
		const k = String(key);
		const raw = resolveWithFallback(k);
		if (raw === undefined) {
			return failOrKey(
				k,
				`[just-t] Missing key: "${k}" (locale "${currentLocale}")`,
			);
		}

		if (typeof raw === "string") {
			return interpolate(raw, params, dev, k);
		}

		if (isPluralMessage(raw)) {
			const count = params?.count;
			if (typeof count !== "number") {
				return failOrKey(k, `[just-t] Missing "count" for plural key: "${k}"`);
			}
			const tpl = count === 1 ? raw.one : raw.other;
			// Avoid copying params in the hot path. We only require that `count` is present.
			return interpolate(tpl, params, dev, k);
		}

		return failOrKey(
			k,
			`[just-t] Key "${k}" did not resolve to a string or plural message`,
		);
	};

	const api: JustT<L, M> = {
		get locale() {
			return currentLocale;
		},
		setLocale(next: L) {
			currentLocale = next;
		},
		t: tImpl as JustT<L, M>["t"],
	};

	return api;
}
