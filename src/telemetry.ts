import { trace, context, SpanStatusCode, type Span, type Tracer, type Context } from "@opentelemetry/api";
import type { Meter } from "@opentelemetry/api";
import { extractTurnUsage } from "./usage.ts";
import { summarizeArgs } from "./summarize-args.ts";

export interface TelemetryConfig {
	tracer: Tracer;
	meter: Meter;
	commonAttrs: Record<string, string>;
	now: () => number;
}

export interface SessionInfo {
	sessionId: string;
	cwd: string;
	parentSession?: string;
	account?: AccountAttrs;
}

export interface AccountAttrs {
	email?: string;
	userName?: string;
	gitName?: string;
	hostname?: string;
}

export interface Telemetry {
	startSession(info: SessionInfo): void;
	endSession(): void;
	startPrompt(): void;
	endPrompt(info: { messageCount: number }): void;
	startTurn(info: { turnIndex: number }): void;
	endTurn(info: { message: unknown }): void;
	startTool(info: { toolCallId: string; toolName: string; args: unknown }): void;
	endTool(info: { toolCallId: string; toolName: string; isError: boolean }): void;
	noteModelChange(info: { current: string; previous?: string; source: string }): void;
	noteCompaction(info: { fromExtension: boolean }): void;
	noteProviderRequest(info: { payloadSize: number }): void;
}

export function createTelemetry(config: TelemetryConfig): Telemetry {
	const { tracer, meter, commonAttrs, now } = config;

	const tokensInput = meter.createCounter("pi.tokens.input", {
		description: "Total input tokens consumed",
		unit: "tokens",
	});
	const tokensOutput = meter.createCounter("pi.tokens.output", {
		description: "Total output tokens produced",
		unit: "tokens",
	});
	const costCounter = meter.createCounter("pi.cost", {
		description: "Total cost in USD",
		unit: "usd",
	});
	const toolCalls = meter.createCounter("pi.tool.calls", { description: "Total tool invocations" });
	const toolErrors = meter.createCounter("pi.tool.errors", {
		description: "Total failed tool invocations",
	});
	const toolDuration = meter.createHistogram("pi.tool.duration", {
		description: "Tool execution duration",
		unit: "ms",
	});
	const turns = meter.createCounter("pi.turns", { description: "Total LLM turns" });
	const prompts = meter.createCounter("pi.prompts", {
		description: "Total user prompts (agent starts)",
	});
	const sessionDuration = meter.createHistogram("pi.session.duration", {
		description: "Session duration",
		unit: "s",
	});

	let sessionSpan: Span | undefined;
	let sessionCtx: Context = context.active();
	let promptSpan: Span | undefined;
	let promptCtx: Context = context.active();
	let turnSpan: Span | undefined;
	let turnCtx: Context = context.active();
	const toolSpans = new Map<string, { span: Span; startTime: number }>();

	let turnCount = 0;
	let toolCallCount = 0;
	let totalTokensIn = 0;
	let totalTokensOut = 0;
	let sessionStart = 0;

	const endSpan = (span: Span | undefined) => {
		if (!span) return;
		span.setStatus({ code: SpanStatusCode.OK });
		span.end();
	};

	return {
		startSession(info) {
			sessionStart = now();
			turnCount = 0;
			toolCallCount = 0;
			totalTokensIn = 0;
			totalTokensOut = 0;
			sessionSpan = tracer.startSpan("session", {
				attributes: {
					"session.id": info.sessionId,
					"session.cwd": info.cwd,
					"user.email": info.account?.email ?? "",
					"user.name": info.account?.userName ?? "",
					"user.full_name": info.account?.gitName ?? "",
					"host.name": info.account?.hostname ?? "",
				},
			});
			if (info.parentSession) {
				sessionSpan.setAttribute("pi.meta.parent_session", info.parentSession);
			}
			sessionCtx = trace.setSpan(context.active(), sessionSpan);
		},

		endSession() {
			if (sessionStart > 0) {
				sessionDuration.record((now() - sessionStart) / 1000, commonAttrs);
			}
			if (sessionSpan) {
				sessionSpan.setAttribute("session.turns", turnCount);
				sessionSpan.setAttribute("session.tool_calls", toolCallCount);
				sessionSpan.setAttribute("session.tokens.input", totalTokensIn);
				sessionSpan.setAttribute("session.tokens.output", totalTokensOut);
			}
			endSpan(sessionSpan);
			sessionSpan = undefined;
		},

		startPrompt() {
			prompts.add(1, commonAttrs);
			promptSpan = tracer.startSpan("agent.prompt", {}, sessionCtx);
			promptCtx = trace.setSpan(sessionCtx, promptSpan);
		},

		endPrompt(info) {
			promptSpan?.setAttribute("agent.messages_count", info.messageCount);
			endSpan(promptSpan);
			promptSpan = undefined;
		},

		startTurn(info) {
			turnCount++;
			turns.add(1, commonAttrs);
			turnSpan = tracer.startSpan(
				"agent.turn",
				{ attributes: { "turn.index": info.turnIndex, "turn.number": turnCount } },
				promptCtx
			);
			turnCtx = trace.setSpan(promptCtx, turnSpan);
		},

		endTurn(info) {
			const usage = extractTurnUsage(info.message);
			if (usage && turnSpan) {
				const modelAttrs = { ...commonAttrs, model: usage.model, provider: usage.provider };
				const billedInput = usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;

				turnSpan.setAttribute("llm.model", usage.model);
				turnSpan.setAttribute("llm.provider", usage.provider);
				turnSpan.setAttribute("llm.usage.input_tokens", usage.inputTokens);
				turnSpan.setAttribute("llm.usage.output_tokens", usage.outputTokens);
				turnSpan.setAttribute("llm.usage.cache_read_tokens", usage.cacheReadTokens);
				turnSpan.setAttribute("llm.usage.cache_write_tokens", usage.cacheWriteTokens);
				turnSpan.setAttribute("llm.usage.total_tokens", usage.totalTokens);
				turnSpan.setAttribute("llm.cost.usd", usage.cost);

				totalTokensIn += billedInput;
				totalTokensOut += usage.outputTokens;

				tokensInput.add(billedInput, modelAttrs);
				tokensOutput.add(usage.outputTokens, modelAttrs);
				costCounter.add(usage.cost, modelAttrs);
			}
			endSpan(turnSpan);
			turnSpan = undefined;
		},

		startTool(info) {
			toolCallCount++;
			const attrs = { ...commonAttrs, "tool.name": info.toolName };
			toolCalls.add(1, attrs);
			const span = tracer.startSpan(
				`tool.${info.toolName}`,
				{
					attributes: {
						"tool.name": info.toolName,
						"tool.call_id": info.toolCallId,
						"tool.args_summary": summarizeArgs(info.toolName, info.args),
					},
				},
				turnCtx
			);
			toolSpans.set(info.toolCallId, { span, startTime: now() });
		},

		endTool(info) {
			const entry = toolSpans.get(info.toolCallId);
			if (!entry) return;
			const durationMs = now() - entry.startTime;
			const attrs = { ...commonAttrs, "tool.name": info.toolName };

			toolDuration.record(durationMs, attrs);
			if (info.isError) {
				toolErrors.add(1, attrs);
				entry.span.setStatus({ code: SpanStatusCode.ERROR, message: "Tool execution failed" });
			} else {
				entry.span.setStatus({ code: SpanStatusCode.OK });
			}
			entry.span.setAttribute("tool.is_error", info.isError);
			entry.span.setAttribute("tool.duration_ms", durationMs);
			entry.span.end();
			toolSpans.delete(info.toolCallId);
		},

		noteModelChange(info) {
			if (!sessionSpan) return;
			sessionSpan.setAttribute("llm.model", info.current);
			if (info.previous) {
				sessionSpan.addEvent("model.changed", {
					"model.previous": info.previous,
					"model.current": info.current,
					"model.source": info.source,
				});
			}
		},

		noteCompaction(info) {
			sessionSpan?.addEvent("session.compacted", {
				"compaction.from_extension": info.fromExtension,
			});
		},

		noteProviderRequest(info) {
			turnSpan?.addEvent("llm.request", { "llm.payload_size": info.payloadSize });
		},
	};
}
