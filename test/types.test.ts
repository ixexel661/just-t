import { createJustT } from "../src/index";

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

// @ts-expect-error invalid key should fail
justT.t("not_exists");

// @ts-expect-error missing interpolation params should fail
justT.t("hello_user");

// @ts-expect-error wrong interpolation param name should fail
justT.t("hello_user", { wrong: "Max" });

// @ts-expect-error count must be number for plural messages
justT.t("items", { count: "3" });
