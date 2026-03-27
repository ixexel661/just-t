import { createJustT } from "./index.js";

const justT = createJustT({
	locale: "en",
	fallbackLocale: "de",
	messages: {
		en: {
			welcome: "Hello",
			hello_user: "Hello {name}",
			items: { one: "{count} item", other: "{count} items" },
		},
		de: {
			welcome: "Hallo",
			hello_user: "Hallo {name}",
			items: { one: "{count} Ding", other: "{count} Dinge" },
		},
	} as const,
});

console.log(justT.t("welcome"));
console.log(justT.t("hello_user", { name: "Max" }));
console.log(justT.t("items", { count: 3 }));

justT.setLocale("de");
console.log(justT.t("items", { count: 1 }));
