import {
	type CreateJustTOptions,
	createJustT,
	type Locale,
	type MessagesByLocale,
	type MessageValue,
} from "just-t";

type JsonValue =
	| null
	| boolean
	| number
	| string
	| JsonValue[]
	| { [k: string]: JsonValue };

export type TranslationRow = {
	locale: string;
	key: string;
	value: JsonValue;
	updatedAt: Date;
};

export type LocaleMessagesRow = {
	locale: string;
	json: JsonValue;
	updatedAt: Date;
};

export type PrismaTranslationDelegate = {
	findMany(args?: unknown): Promise<TranslationRow[]>;
	aggregate(args?: unknown): Promise<{ _max: { updatedAt: Date | null } }>;
};

export type PrismaLocaleMessagesDelegate = {
	findMany(args?: unknown): Promise<LocaleMessagesRow[]>;
	aggregate(args?: unknown): Promise<{ _max: { updatedAt: Date | null } }>;
};

export type PrismaClientLike = {
	translation?: PrismaTranslationDelegate;
	localeMessages?: PrismaLocaleMessagesDelegate;
};

export type PrismaSource =
	| { mode: "rows"; translation: PrismaTranslationDelegate }
	| { mode: "json"; localeMessages: PrismaLocaleMessagesDelegate }
	| {
			mode: "both";
			translation: PrismaTranslationDelegate;
			localeMessages: PrismaLocaleMessagesDelegate;
	  };

export type PrismaCacheOptions = {
	/**
	 * Cache key used to isolate caches (e.g. per-tenant).
	 */
	key?: string;
};

export type CreateJustTPrismaOptions<
	L extends Locale,
	M extends MessagesByLocale<L>,
> = Omit<
	CreateJustTOptions<L, M>,
	"messages" | "file" | "folder" | "json" | "jsonLocale"
> & {
	/**
	 * Prisma client instance. This package treats it as an optional peer dependency.
	 */
	prisma: PrismaClientLike;
	/**
	 * Optional inline messages that override DB-loaded messages.
	 */
	messages?: M;
	/**
	 * Which DB storage to use (rows/json/both). Defaults to \"both\" when available.
	 */
	source?: PrismaSource["mode"];
	/**
	 * Optional cache settings.
	 */
	cache?: PrismaCacheOptions;
};

type CacheEntry = {
	versionMs: number;
	messages: MessagesByLocale;
};

const CACHE = new Map<string, CacheEntry>();

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

function setByDotPath(
	obj: Record<string, unknown>,
	path: string,
	value: unknown,
): void {
	const parts = path.split(".");
	if (parts.length === 0) return;
	let cur: Record<string, unknown> = obj;
	for (let i = 0; i < parts.length - 1; i++) {
		const p = parts[i];
		if (!p) continue;
		const next = cur[p];
		if (!isRecord(next)) cur[p] = {};
		cur = cur[p] as Record<string, unknown>;
	}
	const last = parts[parts.length - 1];
	if (!last) return;
	cur[last] = value;
}

function toMessageValue(v: JsonValue): MessageValue {
	// Runtime validation is intentionally light; just-t will error if shapes mismatch at usage time.
	return v as unknown as MessageValue;
}

function buildMessagesFromRows(rows: TranslationRow[]): MessagesByLocale {
	const out: Record<string, Record<string, MessageValue>> = {};
	for (const row of rows) {
		const loc = row.locale;
		if (!out[loc]) out[loc] = {};
		const root = out[loc] as Record<string, unknown>;
		setByDotPath(root, row.key, toMessageValue(row.value));
	}
	return out as MessagesByLocale;
}

function buildMessagesFromLocaleJson(
	rows: LocaleMessagesRow[],
): MessagesByLocale {
	const out: Record<string, Record<string, MessageValue>> = {};
	for (const row of rows) {
		out[row.locale] = row.json as unknown as Record<string, MessageValue>;
	}
	return out as MessagesByLocale;
}

function pickSource(
	prisma: PrismaClientLike,
	requested?: PrismaSource["mode"],
): PrismaSource {
	const hasRows = !!prisma.translation;
	const hasJson = !!prisma.localeMessages;

	const mode: PrismaSource["mode"] =
		requested ?? (hasRows && hasJson ? "both" : hasJson ? "json" : "rows");

	if (mode === "rows") {
		if (!prisma.translation)
			throw new Error("[just-t/prisma] prisma.translation delegate is missing");
		return { mode: "rows", translation: prisma.translation };
	}
	if (mode === "json") {
		if (!prisma.localeMessages)
			throw new Error(
				"[just-t/prisma] prisma.localeMessages delegate is missing",
			);
		return { mode: "json", localeMessages: prisma.localeMessages };
	}

	if (!prisma.translation)
		throw new Error("[just-t/prisma] prisma.translation delegate is missing");
	if (!prisma.localeMessages)
		throw new Error(
			"[just-t/prisma] prisma.localeMessages delegate is missing",
		);
	return {
		mode: "both",
		translation: prisma.translation,
		localeMessages: prisma.localeMessages,
	};
}

async function loadVersionMs(source: PrismaSource): Promise<number> {
	const dates: Array<Date | null> = [];
	if (source.mode === "rows" || source.mode === "both") {
		const agg = await source.translation.aggregate({
			_max: { updatedAt: true },
		} as unknown);
		dates.push(agg?._max?.updatedAt ?? null);
	}
	if (source.mode === "json" || source.mode === "both") {
		const agg = await source.localeMessages.aggregate({
			_max: { updatedAt: true },
		} as unknown);
		dates.push(agg?._max?.updatedAt ?? null);
	}
	const max = dates.reduce<number>(
		(acc, d) => (d ? Math.max(acc, d.getTime()) : acc),
		0,
	);
	return max;
}

async function loadDbMessages(source: PrismaSource): Promise<MessagesByLocale> {
	let base: MessagesByLocale = {};
	if (source.mode === "json" || source.mode === "both") {
		const rows = await source.localeMessages.findMany();
		base = deepMerge(
			base,
			buildMessagesFromLocaleJson(rows),
		) as MessagesByLocale;
	}
	if (source.mode === "rows" || source.mode === "both") {
		const rows = await source.translation.findMany();
		base = deepMerge(base, buildMessagesFromRows(rows)) as MessagesByLocale;
	}
	return base;
}

export async function createJustTPrisma<
	const L extends Locale,
	const M extends MessagesByLocale<L>,
>(opts: CreateJustTPrismaOptions<L, M>) {
	const source = pickSource(opts.prisma, opts.source);
	const cacheKey = `${opts.cache?.key ?? "default"}:${source.mode}`;
	const versionMs = await loadVersionMs(source);

	const cached = CACHE.get(cacheKey);
	let loadedMessages: MessagesByLocale;
	if (cached && cached.versionMs === versionMs) {
		loadedMessages = cached.messages;
	} else {
		loadedMessages = await loadDbMessages(source);
		CACHE.set(cacheKey, { versionMs, messages: loadedMessages });
	}

	const merged = deepMerge(
		loadedMessages,
		(opts.messages ?? {}) as unknown,
	) as M;

	return createJustT({
		locale: opts.locale,
		messages: merged,
		...(opts.fallbackLocale ? { fallbackLocale: opts.fallbackLocale } : {}),
		...(opts.dev !== undefined ? { dev: opts.dev } : {}),
	});
}
