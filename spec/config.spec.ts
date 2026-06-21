import { test, expect } from "bun:test";
import { resolveConfig } from "../src/config.ts";

test("defaults apply with an empty environment", () => {
	const config = resolveConfig({});
	expect(config.enabled).toBe(true);
	expect(config.debug).toBe(false);
	expect(config.serviceName).toBe("pi-coding-agent");
	expect(config.tracesEndpoint).toBe("http://localhost:4318/v1/traces");
	expect(config.metricsEndpoint).toBe("http://localhost:4318/v1/metrics");
	expect(config.metricIntervalMs).toBe(10000);
});

test("PI_OTEL_ENABLED=false disables", () => {
	expect(resolveConfig({ PI_OTEL_ENABLED: "false" }).enabled).toBe(false);
});

test("a base endpoint is expanded to both signal paths", () => {
	const config = resolveConfig({ OTEL_EXPORTER_OTLP_ENDPOINT: "http://collector:4318" });
	expect(config.tracesEndpoint).toBe("http://collector:4318/v1/traces");
	expect(config.metricsEndpoint).toBe("http://collector:4318/v1/metrics");
});

test("per-signal endpoint overrides win over the base", () => {
	const config = resolveConfig({
		OTEL_EXPORTER_OTLP_ENDPOINT: "http://base:4318",
		OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "http://traces:4318",
	});
	expect(config.tracesEndpoint).toBe("http://traces:4318/v1/traces");
	expect(config.metricsEndpoint).toBe("http://base:4318/v1/metrics");
});
