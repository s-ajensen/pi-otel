import { test, expect } from "bun:test";
import { summarizeArgs, truncate } from "../src/summarize-args.ts";

test("truncate leaves short strings untouched", () => {
	expect(truncate("short", 200)).toBe("short");
});

test("truncate clips long strings and marks the cut", () => {
	expect(truncate("abcdef", 3)).toBe("abc…");
});

test("summarizeArgs returns empty string for missing args", () => {
	expect(summarizeArgs("bash", undefined)).toBe("");
});

test("summarizeArgs reports the command for bash, truncated", () => {
	const long = "x".repeat(300);
	expect(summarizeArgs("bash", { command: long })).toBe("x".repeat(200) + "…");
});

test("summarizeArgs reports the path for file tools", () => {
	expect(summarizeArgs("read", { path: "/a/b.ts" })).toBe("/a/b.ts");
	expect(summarizeArgs("write", { path: "/a/b.ts" })).toBe("/a/b.ts");
	expect(summarizeArgs("edit", { path: "/a/b.ts" })).toBe("/a/b.ts");
});

test("summarizeArgs serializes unknown tools, truncated", () => {
	expect(summarizeArgs("mystery", { a: 1 })).toBe('{"a":1}');
});

test("summarizeArgs survives unserializable args", () => {
	const circular: Record<string, unknown> = {};
	circular.self = circular;
	expect(summarizeArgs("mystery", circular)).toBe("[unserializable]");
});
