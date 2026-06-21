import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { BatchSpanProcessor, ConsoleSpanExporter } from "@opentelemetry/sdk-trace-base";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import {
	MeterProvider,
	PeriodicExportingMetricReader,
	ConsoleMetricExporter,
} from "@opentelemetry/sdk-metrics";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import type { Account } from "./account.ts";

export interface ResourceAttrInput {
	serviceName: string;
	version: string;
	account: Account;
	envAttrs: Record<string, string>;
}

export function parseResourceAttrEnv(raw: string | undefined): Record<string, string> {
	const attrs: Record<string, string> = {};
	if (!raw) return attrs;
	for (const pair of raw.split(",")) {
		const eq = pair.indexOf("=");
		if (eq > 0) {
			attrs[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
		}
	}
	return attrs;
}

export function buildResourceAttrs(input: ResourceAttrInput): Record<string, string> {
	const attrs: Record<string, string> = {
		[ATTR_SERVICE_NAME]: input.serviceName,
		[ATTR_SERVICE_VERSION]: input.version,
		"pi.extension": "otel-telemetry",
		"host.name": input.account.hostname,
		"user.name": input.account.userName,
	};
	if (input.account.email) attrs["user.email"] = input.account.email;
	if (input.account.gitName) attrs["user.full_name"] = input.account.gitName;
	return { ...attrs, ...input.envAttrs };
}

export function selectCommonAttrs(resourceAttrs: Record<string, string>): Record<string, string> {
	const common: Record<string, string> = {};
	if (resourceAttrs["user.name"]) common["user.name"] = resourceAttrs["user.name"];
	if (resourceAttrs["environment"]) common["environment"] = resourceAttrs["environment"];
	if (resourceAttrs["host.name"]) common["host.name"] = resourceAttrs["host.name"];
	return common;
}

export interface ProviderConfig {
	resourceAttrs: Record<string, string>;
	tracesEndpoint: string;
	metricsEndpoint: string;
	metricIntervalMs: number;
	debug: boolean;
}

export function createTraceProvider(config: ProviderConfig): NodeTracerProvider {
	const resource = resourceFromAttributes(config.resourceAttrs);
	const spanProcessors = [
		new BatchSpanProcessor(new OTLPTraceExporter({ url: config.tracesEndpoint })),
	];
	if (config.debug) {
		spanProcessors.push(new BatchSpanProcessor(new ConsoleSpanExporter()));
	}
	return new NodeTracerProvider({ resource, spanProcessors });
}

export function createMeterProvider(config: ProviderConfig): MeterProvider {
	const resource = resourceFromAttributes(config.resourceAttrs);
	const readers = [
		new PeriodicExportingMetricReader({
			exporter: new OTLPMetricExporter({ url: config.metricsEndpoint }),
			exportIntervalMillis: config.metricIntervalMs,
		}),
	];
	if (config.debug) {
		readers.push(
			new PeriodicExportingMetricReader({
				exporter: new ConsoleMetricExporter(),
				exportIntervalMillis: config.metricIntervalMs,
			})
		);
	}
	return new MeterProvider({ resource, readers });
}
