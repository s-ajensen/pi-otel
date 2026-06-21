import { resolveOtlpHttpEndpoint } from "./endpoint.ts";

export interface OtelConfig {
	enabled: boolean;
	debug: boolean;
	serviceName: string;
	tracesEndpoint: string;
	metricsEndpoint: string;
	metricIntervalMs: number;
}

const DEFAULT_ENDPOINT = "http://localhost:4318";
const DEFAULT_SERVICE_NAME = "pi-coding-agent";
const DEFAULT_METRIC_INTERVAL_MS = 10000;

export function resolveConfig(env: Record<string, string | undefined>): OtelConfig {
	const base = env.OTEL_EXPORTER_OTLP_ENDPOINT || DEFAULT_ENDPOINT;
	return {
		enabled: env.PI_OTEL_ENABLED !== "false",
		debug: env.PI_OTEL_DEBUG === "true",
		serviceName: env.OTEL_SERVICE_NAME || DEFAULT_SERVICE_NAME,
		tracesEndpoint: resolveOtlpHttpEndpoint(
			env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || base,
			"traces"
		),
		metricsEndpoint: resolveOtlpHttpEndpoint(
			env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT || base,
			"metrics"
		),
		metricIntervalMs: parseInt(env.OTEL_METRIC_EXPORT_INTERVAL || String(DEFAULT_METRIC_INTERVAL_MS), 10),
	};
}
