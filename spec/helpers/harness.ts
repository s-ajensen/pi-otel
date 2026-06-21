import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { InMemorySpanExporter, SimpleSpanProcessor, type ReadableSpan } from "@opentelemetry/sdk-trace-base";
import {
	MeterProvider,
	PeriodicExportingMetricReader,
	InMemoryMetricExporter,
	AggregationTemporality,
} from "@opentelemetry/sdk-metrics";
import type { ResourceMetrics } from "@opentelemetry/sdk-metrics";
import { createTelemetry, type Telemetry } from "../../src/telemetry.ts";

export interface Harness {
	telemetry: Telemetry;
	spans: () => ReadableSpan[];
	span: (name: string) => ReadableSpan | undefined;
	metrics: () => Promise<MetricPoint[]>;
	metric: (name: string) => Promise<MetricPoint[]>;
	tick: (ms: number) => void;
}

export interface MetricPoint {
	name: string;
	value: number;
	attributes: Record<string, unknown>;
}

export async function buildHarness(): Promise<Harness> {
	const spanExporter = new InMemorySpanExporter();
	const traceProvider = new NodeTracerProvider({
		spanProcessors: [new SimpleSpanProcessor(spanExporter)],
	});
	const tracer = traceProvider.getTracer("test");

	const metricExporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
	const metricReader = new PeriodicExportingMetricReader({
		exporter: metricExporter,
		exportIntervalMillis: 86_400_000,
	});
	const meterProvider = new MeterProvider({ readers: [metricReader] });
	const meter = meterProvider.getMeter("test");

	let clock = 0;
	const telemetry = createTelemetry({
		tracer,
		meter,
		commonAttrs: { "user.name": "tester", "host.name": "box" },
		now: () => clock,
	});

	const readMetrics = async (): Promise<MetricPoint[]> => {
		await meterProvider.forceFlush();
		const collected = metricExporter.getMetrics();
		return flattenMetrics(collected);
	};

	return {
		telemetry,
		spans: () => spanExporter.getFinishedSpans(),
		span: (name) => spanExporter.getFinishedSpans().find((s) => s.name === name),
		metrics: readMetrics,
		metric: async (name) => (await readMetrics()).filter((m) => m.name === name),
		tick: (ms) => {
			clock += ms;
		},
	};
}

function flattenMetrics(collected: ResourceMetrics[]): MetricPoint[] {
	const points: MetricPoint[] = [];
	for (const resourceMetric of collected) {
		for (const scope of resourceMetric.scopeMetrics) {
			for (const metric of scope.metrics) {
				for (const point of metric.dataPoints) {
					const value =
						typeof point.value === "number" ? point.value : (point.value as { sum: number }).sum;
					points.push({
						name: metric.descriptor.name,
						value,
						attributes: point.attributes,
					});
				}
			}
		}
	}
	return points;
}
