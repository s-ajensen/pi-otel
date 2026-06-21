import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { resolveConfig } from "./config.ts";
import { resolveAccount, systemAccountSources } from "./account.ts";
import {
	buildResourceAttrs,
	parseResourceAttrEnv,
	selectCommonAttrs,
	createTraceProvider,
	createMeterProvider,
} from "./providers.ts";
import { createTelemetry } from "./telemetry.ts";
import { flushProviders } from "./flush.ts";

const VERSION = "1.1.0";

export default function (pi: ExtensionAPI) {
	const env = process.env;
	const config = resolveConfig(env);
	if (!config.enabled) return;

	const account = resolveAccount(systemAccountSources(env));
	const resourceAttrs = buildResourceAttrs({
		serviceName: config.serviceName,
		version: VERSION,
		account,
		envAttrs: parseResourceAttrEnv(env.OTEL_RESOURCE_ATTRIBUTES),
	});
	const commonAttrs = selectCommonAttrs(resourceAttrs);

	const providerConfig = {
		resourceAttrs,
		tracesEndpoint: config.tracesEndpoint,
		metricsEndpoint: config.metricsEndpoint,
		metricIntervalMs: config.metricIntervalMs,
		debug: config.debug,
	};
	const traceProvider = createTraceProvider(providerConfig);
	const meterProvider = createMeterProvider(providerConfig);

	const telemetry = createTelemetry({
		tracer: traceProvider.getTracer("pi-otel-extension", VERSION),
		meter: meterProvider.getMeter("pi-otel-extension", VERSION),
		commonAttrs,
		now: () => Date.now(),
	});

	pi.on("session_start", async (_event, ctx) => {
		telemetry.startSession({
			sessionId: ctx.sessionManager.getSessionFile() ?? "ephemeral",
			cwd: ctx.cwd,
			account,
		});
		if (config.debug) ctx.ui.setStatus("otel", ctx.ui.theme.fg("dim", "⊙ OTEL active"));
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		telemetry.endSession();
		await flushProviders(traceProvider, meterProvider, config.debug, ctx);
	});

	pi.on("agent_start", async () => telemetry.startPrompt());
	pi.on("agent_end", async (event) =>
		telemetry.endPrompt({ messageCount: event.messages?.length ?? 0 })
	);

	pi.on("turn_start", async (event) => telemetry.startTurn({ turnIndex: event.turnIndex }));
	pi.on("turn_end", async (event) => telemetry.endTurn({ message: event.message }));

	pi.on("tool_execution_start", async (event) =>
		telemetry.startTool({ toolCallId: event.toolCallId, toolName: event.toolName, args: event.args })
	);
	pi.on("tool_execution_end", async (event) =>
		telemetry.endTool({
			toolCallId: event.toolCallId,
			toolName: event.toolName,
			isError: event.isError ?? false,
		})
	);

	pi.on("model_select", async (event) =>
		telemetry.noteModelChange({
			current: `${event.model.provider}/${event.model.id}`,
			previous: event.previousModel
				? `${event.previousModel.provider}/${event.previousModel.id}`
				: undefined,
			source: event.source,
		})
	);

	pi.on("session_compact", async (event) =>
		telemetry.noteCompaction({ fromExtension: event.fromExtension ?? false })
	);

	pi.on("before_provider_request", (event) =>
		telemetry.noteProviderRequest({ payloadSize: JSON.stringify(event.payload).length })
	);
}
