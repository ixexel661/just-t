import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createJustT } from "../src/index";

const messages = {
	en: {
		welcome: "Hello",
		hello_user: "Hello {name}",
		items: { one: "{count} item", other: "{count} items" },
		nested: {
			deep: "Deep value",
		},
	},
	de: {
		welcome: "Hallo",
		hello_user: "Hallo {name}",
		items: { one: "{count} Ding", other: "{count} Dinge" },
		only_de: "Nur Deutsch",
	},
} as const;

describe("createJustT", () => {
	it("returns string values and interpolates params", () => {
		const justT = createJustT({
			locale: "en",
			fallbackLocale: "de",
			messages,
			dev: true,
		});
		expect(justT.t("welcome")).toBe("Hello");
		expect(justT.t("hello_user", { name: "Max" })).toBe("Hello Max");
		expect(justT.t("nested.deep", {} as never)).toBe("Deep value");
	});

	it("can load messages from a JSON string (multi-locale object)", () => {
		const justT = createJustT({
			locale: "en",
			json: JSON.stringify({
				en: { welcome: "Hello from JSON" },
				de: { welcome: "Hallo aus JSON" },
			}),
			dev: true,
		});
		expect(justT.t("welcome" as never, {} as never)).toBe("Hello from JSON");
	});

	it("can load messages from a JSON object (single-locale tree) when jsonLocale is set", () => {
		const justT = createJustT({
			locale: "en",
			jsonLocale: "en",
			json: { welcome: "Hello tree" },
			dev: true,
		});
		expect(justT.t("welcome" as never, {} as never)).toBe("Hello tree");
	});

	it("loads from folder with per-locale json files (Node-only)", async () => {
		const dir = await mkdtemp(join(tmpdir(), "just-t-"));
		await writeFile(
			join(dir, "en.json"),
			JSON.stringify({ welcome: "Hello file" }),
			"utf8",
		);
		await writeFile(
			join(dir, "de.json"),
			JSON.stringify({ welcome: "Hallo Datei" }),
			"utf8",
		);

		const justT = await createJustT({
			locale: "en",
			folder: dir,
			dev: true,
		});
		expect(justT.t("welcome" as never, {} as never)).toBe("Hello file");
	});

	it("handles plural forms with count", () => {
		const justT = createJustT({ locale: "en", messages, dev: true });
		expect(justT.t("items", { count: 1 })).toBe("1 item");
		expect(justT.t("items", { count: 3 })).toBe("3 items");
	});

	it("uses fallback locale when key is missing in current locale", () => {
		const justT = createJustT({
			locale: "en",
			fallbackLocale: "de",
			messages,
			dev: true,
		});
		expect(justT.t("only_de", {} as never)).toBe("Nur Deutsch");
	});

	it("throws in dev mode for missing keys", () => {
		const justT = createJustT({ locale: "en", messages, dev: true });
		expect(() => justT.t("missing.key" as never, {} as never)).toThrow(
			/Missing key/,
		);
	});

	it("returns key in prod mode for missing keys", () => {
		const justT = createJustT({ locale: "en", messages, dev: false });
		expect(justT.t("missing.key" as never, {} as never)).toBe("missing.key");
	});

	it("throws in dev mode for missing interpolation params", () => {
		const justT = createJustT({ locale: "en", messages, dev: true });
		expect(() => justT.t("hello_user", {} as never)).toThrow(
			/Missing interpolation params/,
		);
	});

	it("throws in dev mode when plural count is missing", () => {
		const justT = createJustT({ locale: "en", messages, dev: true });
		expect(() => justT.t("items", {} as never)).toThrow(/Missing "count"/);
	});
});
