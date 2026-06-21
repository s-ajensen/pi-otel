import { test, expect } from "bun:test";
import { buildResourceAttrs, parseResourceAttrEnv, selectCommonAttrs } from "../src/providers.ts";

test("parseResourceAttrEnv reads comma-separated key=value pairs", () => {
	expect(parseResourceAttrEnv("a=1,b=2")).toEqual({ a: "1", b: "2" });
});

test("parseResourceAttrEnv trims whitespace and ignores malformed pairs", () => {
	expect(parseResourceAttrEnv(" a = 1 ,nonsense, b=2")).toEqual({ a: "1", b: "2" });
});

test("parseResourceAttrEnv returns empty object for undefined", () => {
	expect(parseResourceAttrEnv(undefined)).toEqual({});
});

test("buildResourceAttrs includes service identity and account", () => {
	const attrs = buildResourceAttrs({
		serviceName: "pi",
		version: "1.1.0",
		account: { hostname: "box", userName: "tester", email: "a@b.c", gitName: "Ada" },
		envAttrs: {},
	});
	expect(attrs["service.name"]).toBe("pi");
	expect(attrs["host.name"]).toBe("box");
	expect(attrs["user.name"]).toBe("tester");
	expect(attrs["user.email"]).toBe("a@b.c");
	expect(attrs["user.full_name"]).toBe("Ada");
});

test("buildResourceAttrs omits optional identity fields when absent", () => {
	const attrs = buildResourceAttrs({
		serviceName: "pi",
		version: "1.1.0",
		account: { hostname: "box", userName: "tester", email: "", gitName: "" },
		envAttrs: {},
	});
	expect("user.email" in attrs).toBe(false);
	expect("user.full_name" in attrs).toBe(false);
});

test("selectCommonAttrs promotes only the label-worthy resource attributes", () => {
	expect(
		selectCommonAttrs({
			"user.name": "tester",
			"host.name": "box",
			"service.name": "pi",
			"user.email": "a@b.c",
		})
	).toEqual({ "user.name": "tester", "host.name": "box" });
});

test("selectCommonAttrs includes environment when present", () => {
	expect(selectCommonAttrs({ environment: "prod" })).toEqual({ environment: "prod" });
});

test("buildResourceAttrs lets env attributes override", () => {
	const attrs = buildResourceAttrs({
		serviceName: "pi",
		version: "1.1.0",
		account: { hostname: "box", userName: "tester", email: "", gitName: "" },
		envAttrs: { environment: "prod", "host.name": "override" },
	});
	expect(attrs["environment"]).toBe("prod");
	expect(attrs["host.name"]).toBe("override");
});
