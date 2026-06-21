export interface Flushable {
	forceFlush(): Promise<void>;
	shutdown(): Promise<void>;
}

export interface NotifyContext {
	ui: { notify(message: string, level?: "warning" | "error" | "info"): void };
}

export async function flushProviders(
	traceProvider: Flushable,
	meterProvider: Flushable,
	debug: boolean,
	ctx: NotifyContext
): Promise<void> {
	const steps: [string, () => Promise<void>][] = [
		["metrics forceFlush", () => meterProvider.forceFlush()],
		["traces forceFlush", () => traceProvider.forceFlush()],
		["metrics shutdown", () => meterProvider.shutdown()],
		["traces shutdown", () => traceProvider.shutdown()],
	];
	for (const [label, run] of steps) {
		try {
			await run();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (debug) ctx.ui.notify(`OTEL ${label} failed: ${message}`, "warning");
			else console.error(`[pi-otel-telemetry] ${label} failed: ${message}`);
		}
	}
}
