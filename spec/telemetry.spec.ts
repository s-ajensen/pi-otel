import { test, expect } from "bun:test";
import { buildHarness } from "./helpers/harness.ts";

const assistantMessage = (overrides: Record<string, unknown> = {}) => ({
	role: "assistant",
	model: "claude-opus-4-8",
	provider: "anthropic",
	usage: {
		input: 100,
		output: 50,
		cacheRead: 10,
		cacheWrite: 20,
		totalTokens: 180,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0.25 },
	},
	...overrides,
});

test("a completed session emits one session span", async () => {
	const h = await buildHarness();
	h.telemetry.startSession({ sessionId: "s1", cwd: "/work" });
	h.telemetry.endSession();
	expect(h.span("session")).toBeDefined();
});

test("the session span carries identifying attributes", async () => {
	const h = await buildHarness();
	h.telemetry.startSession({ sessionId: "s1", cwd: "/work" });
	h.telemetry.endSession();
	const span = h.span("session")!;
	expect(span.attributes["session.id"]).toBe("s1");
	expect(span.attributes["session.cwd"]).toBe("/work");
});

test("a meta session span links to its parent (trunk) session", async () => {
	const h = await buildHarness();
	h.telemetry.startSession({ sessionId: "meta1", cwd: "/work", parentSession: "trunk1" });
	h.telemetry.endSession();
	expect(h.span("session")!.attributes["pi.meta.parent_session"]).toBe("trunk1");
});

test("a trunk session span omits the parent attribute entirely", async () => {
	const h = await buildHarness();
	h.telemetry.startSession({ sessionId: "s1", cwd: "/work" });
	h.telemetry.endSession();
	expect(h.span("session")!.attributes["pi.meta.parent_session"]).toBeUndefined();
});

test("a tool span nests under its turn under its prompt under the session", async () => {
	const h = await buildHarness();
	h.telemetry.startSession({ sessionId: "s1", cwd: "/work" });
	h.telemetry.startPrompt();
	h.telemetry.startTurn({ turnIndex: 0 });
	h.telemetry.startTool({ toolCallId: "t1", toolName: "bash", args: { command: "ls" } });
	h.telemetry.endTool({ toolCallId: "t1", toolName: "bash", isError: false });
	h.telemetry.endTurn({ message: assistantMessage() });
	h.telemetry.endPrompt({ messageCount: 1 });
	h.telemetry.endSession();

	const tool = h.span("tool.bash")!;
	const turn = h.span("agent.turn")!;
	const prompt = h.span("agent.prompt")!;
	const session = h.span("session")!;
	expect(tool.parentSpanContext?.spanId).toBe(turn.spanContext().spanId);
	expect(turn.parentSpanContext?.spanId).toBe(prompt.spanContext().spanId);
	expect(prompt.parentSpanContext?.spanId).toBe(session.spanContext().spanId);
});

test("turn token metrics are labeled by model", async () => {
	const h = await buildHarness();
	h.telemetry.startSession({ sessionId: "s1", cwd: "/work" });
	h.telemetry.startPrompt();
	h.telemetry.startTurn({ turnIndex: 0 });
	h.telemetry.endTurn({ message: assistantMessage() });
	h.telemetry.endPrompt({ messageCount: 1 });
	h.telemetry.endSession();

	const input = await h.metric("pi.tokens.input");
	expect(input).toHaveLength(1);
	expect(input[0].value).toBe(130); // input + cacheRead + cacheWrite
	expect(input[0].attributes["model"]).toBe("claude-opus-4-8");
});

test("turn cost is recorded as a model-labeled metric", async () => {
	const h = await buildHarness();
	h.telemetry.startSession({ sessionId: "s1", cwd: "/work" });
	h.telemetry.startPrompt();
	h.telemetry.startTurn({ turnIndex: 0 });
	h.telemetry.endTurn({ message: assistantMessage() });
	h.telemetry.endPrompt({ messageCount: 1 });
	h.telemetry.endSession();

	const cost = await h.metric("pi.cost");
	expect(cost).toHaveLength(1);
	expect(cost[0].value).toBeCloseTo(0.25);
	expect(cost[0].attributes["model"]).toBe("claude-opus-4-8");
});

test("a failed tool increments the error counter and marks the span", async () => {
	const h = await buildHarness();
	h.telemetry.startSession({ sessionId: "s1", cwd: "/work" });
	h.telemetry.startPrompt();
	h.telemetry.startTurn({ turnIndex: 0 });
	h.telemetry.startTool({ toolCallId: "t1", toolName: "bash", args: {} });
	h.telemetry.endTool({ toolCallId: "t1", toolName: "bash", isError: true });
	h.telemetry.endTurn({ message: assistantMessage() });
	h.telemetry.endPrompt({ messageCount: 1 });
	h.telemetry.endSession();

	const errors = await h.metric("pi.tool.errors");
	expect(errors).toHaveLength(1);
	expect(errors[0].value).toBe(1);
	expect(h.span("tool.bash")!.attributes["tool.is_error"]).toBe(true);
});

test("tool duration is measured from the injected clock", async () => {
	const h = await buildHarness();
	h.telemetry.startSession({ sessionId: "s1", cwd: "/work" });
	h.telemetry.startPrompt();
	h.telemetry.startTurn({ turnIndex: 0 });
	h.telemetry.startTool({ toolCallId: "t1", toolName: "bash", args: {} });
	h.tick(250);
	h.telemetry.endTool({ toolCallId: "t1", toolName: "bash", isError: false });
	h.telemetry.endTurn({ message: assistantMessage() });
	h.telemetry.endPrompt({ messageCount: 1 });
	h.telemetry.endSession();

	const duration = await h.metric("pi.tool.duration");
	expect(duration[0].value).toBe(250);
});

test("the session span totals tokens across turns", async () => {
	const h = await buildHarness();
	h.telemetry.startSession({ sessionId: "s1", cwd: "/work" });
	h.telemetry.startPrompt();
	h.telemetry.startTurn({ turnIndex: 0 });
	h.telemetry.endTurn({ message: assistantMessage() });
	h.telemetry.startTurn({ turnIndex: 1 });
	h.telemetry.endTurn({ message: assistantMessage() });
	h.telemetry.endPrompt({ messageCount: 2 });
	h.telemetry.endSession();

	const session = h.span("session")!;
	expect(session.attributes["session.turns"]).toBe(2);
	expect(session.attributes["session.tokens.output"]).toBe(100);
});
