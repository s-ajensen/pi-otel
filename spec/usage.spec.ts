import { test, expect } from "bun:test";
import { extractTurnUsage } from "../src/usage.ts";

test("returns undefined when the message is not an assistant message", () => {
	expect(extractTurnUsage({ role: "user" })).toBeUndefined();
});

test("returns undefined when usage is absent", () => {
	expect(extractTurnUsage({ role: "assistant" })).toBeUndefined();
});

test("extracts tokens, model, and provider", () => {
	const usage = extractTurnUsage({
		role: "assistant",
		model: "claude-opus-4-8",
		provider: "anthropic",
		usage: {
			input: 10,
			output: 20,
			cacheRead: 5,
			cacheWrite: 7,
			totalTokens: 42,
			cost: { input: 0.1, output: 0.2, cacheRead: 0.01, cacheWrite: 0.02, total: 0.33 },
		},
	});
	expect(usage).toEqual({
		model: "claude-opus-4-8",
		provider: "anthropic",
		inputTokens: 10,
		outputTokens: 20,
		cacheReadTokens: 5,
		cacheWriteTokens: 7,
		totalTokens: 42,
		cost: 0.33,
	});
});

test("treats missing token and cost fields as zero", () => {
	const usage = extractTurnUsage({ role: "assistant", usage: {} });
	expect(usage).toMatchObject({
		inputTokens: 0,
		outputTokens: 0,
		cacheReadTokens: 0,
		cacheWriteTokens: 0,
		totalTokens: 0,
		cost: 0,
		model: "",
		provider: "",
	});
});
