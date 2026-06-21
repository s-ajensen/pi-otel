export type OtlpSignal = "traces" | "metrics";

export function resolveOtlpHttpEndpoint(endpoint: string, signal: OtlpSignal): string {
	const trimmed = endpoint.replace(/\/+$/, "");
	if (trimmed.endsWith("/v1/traces") || trimmed.endsWith("/v1/metrics")) return trimmed;
	return `${trimmed}/v1/${signal}`;
}
