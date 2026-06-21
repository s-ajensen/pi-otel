import { test, expect } from "bun:test";
import { flushProviders } from "../src/flush.ts";

function recordingProvider() {
	const calls: string[] = [];
	return {
		calls,
		forceFlush: async () => {
			calls.push("forceFlush");
		},
		shutdown: async () => {
			calls.push("shutdown");
		},
	};
}

function silentCtx() {
	const notes: string[] = [];
	return { notes, ui: { notify: (m: string) => notes.push(m) } };
}

test("flushes and shuts down both providers", async () => {
	const traces = recordingProvider();
	const metrics = recordingProvider();
	await flushProviders(traces, metrics, false, silentCtx());
	expect(metrics.calls).toEqual(["forceFlush", "shutdown"]);
	expect(traces.calls).toEqual(["forceFlush", "shutdown"]);
});

test("a failing step does not abort the remaining steps", async () => {
	const traces = recordingProvider();
	const metrics = {
		calls: [] as string[],
		forceFlush: async () => {
			throw new Error("boom");
		},
		shutdown: async () => {
			metrics.calls.push("shutdown");
		},
	};
	const ctx = silentCtx();
	await flushProviders(traces, metrics, true, ctx);
	expect(traces.calls).toEqual(["forceFlush", "shutdown"]);
	expect(metrics.calls).toEqual(["shutdown"]);
	expect(ctx.notes.some((n) => n.includes("boom"))).toBe(true);
});
