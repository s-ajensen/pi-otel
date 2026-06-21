import { test, expect } from "bun:test";
import { resolveOtlpHttpEndpoint } from "../src/endpoint.ts";

test("appends the signal path to a bare base endpoint", () => {
	expect(resolveOtlpHttpEndpoint("http://localhost:4318", "traces")).toBe(
		"http://localhost:4318/v1/traces"
	);
	expect(resolveOtlpHttpEndpoint("http://localhost:4318", "metrics")).toBe(
		"http://localhost:4318/v1/metrics"
	);
});

test("strips trailing slashes before appending", () => {
	expect(resolveOtlpHttpEndpoint("http://localhost:4318///", "traces")).toBe(
		"http://localhost:4318/v1/traces"
	);
});

test("leaves an endpoint that already targets the matching signal untouched", () => {
	expect(resolveOtlpHttpEndpoint("http://collector/v1/traces", "traces")).toBe(
		"http://collector/v1/traces"
	);
});

test("does not double-append when the endpoint targets the other signal", () => {
	expect(resolveOtlpHttpEndpoint("http://collector/v1/metrics", "traces")).toBe(
		"http://collector/v1/metrics"
	);
});
