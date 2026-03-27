import { describe, expect, it } from "vitest";
import { createJustTPrisma } from "../src/index";

function makeDelegate<T extends { updatedAt: Date }>(rows: T[]) {
	let findManyCalls = 0;
	let aggregateCalls = 0;
	return {
		get findManyCalls() {
			return findManyCalls;
		},
		get aggregateCalls() {
			return aggregateCalls;
		},
		async findMany() {
			findManyCalls++;
			return rows;
		},
		async aggregate() {
			aggregateCalls++;
			const max = rows.reduce<Date | null>(
				(acc, r) =>
					acc ? (r.updatedAt > acc ? r.updatedAt : acc) : r.updatedAt,
				null,
			);
			return { _max: { updatedAt: max } };
		},
	};
}

describe("@just-t/prisma", () => {
	it("loads from localeMessages (json) and returns just-t instance", async () => {
		const localeMessages = makeDelegate([
			{
				locale: "en",
				json: { welcome: "Hello DB" },
				updatedAt: new Date("2026-01-01T00:00:00Z"),
			},
		]);

		const justT = await createJustTPrisma({
			prisma: { localeMessages },
			source: "json",
			locale: "en",
			dev: true,
		});

		expect(justT.t("welcome" as never, {} as never)).toBe("Hello DB");
		expect(localeMessages.findManyCalls).toBe(1);
	});

	it("loads from translation rows (dot paths) and merges into tree", async () => {
		const translation = makeDelegate([
			{
				locale: "en",
				key: "nested.deep",
				value: "Deep",
				updatedAt: new Date("2026-01-01T00:00:00Z"),
			},
		]);

		const justT = await createJustTPrisma({
			prisma: { translation },
			source: "rows",
			locale: "en",
			dev: true,
		});

		expect(justT.t("nested.deep" as never, {} as never)).toBe("Deep");
	});

	it("when mode=both, json is base and rows override", async () => {
		const localeMessages = makeDelegate([
			{
				locale: "en",
				json: { welcome: "Hello base" },
				updatedAt: new Date("2026-01-01T00:00:00Z"),
			},
		]);
		const translation = makeDelegate([
			{
				locale: "en",
				key: "welcome",
				value: "Hello override",
				updatedAt: new Date("2026-01-02T00:00:00Z"),
			},
		]);

		const justT = await createJustTPrisma({
			prisma: { localeMessages, translation },
			source: "both",
			locale: "en",
			dev: true,
		});

		expect(justT.t("welcome" as never, {} as never)).toBe("Hello override");
	});

	it("caches by version: same version does not reload findMany", async () => {
		const cacheKey = `test-${Math.random().toString(16).slice(2)}`;
		const rows = [
			{
				locale: "en",
				json: { welcome: "Hello cache" },
				updatedAt: new Date("2026-01-01T00:00:00Z"),
			},
		];
		const localeMessages = makeDelegate(rows);

		await createJustTPrisma({
			prisma: { localeMessages },
			source: "json",
			locale: "en",
			cache: { key: cacheKey },
			dev: true,
		});
		await createJustTPrisma({
			prisma: { localeMessages },
			source: "json",
			locale: "en",
			cache: { key: cacheKey },
			dev: true,
		});

		expect(localeMessages.aggregateCalls).toBe(2);
		expect(localeMessages.findManyCalls).toBe(1);
	});
});
