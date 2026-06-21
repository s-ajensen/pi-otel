import { test, expect } from "bun:test";
import { resolveAccount, type AccountSources } from "../src/account.ts";

function sources(overrides: Partial<AccountSources>): AccountSources {
	return {
		env: {},
		readGitConfig: () => "",
		username: () => "osuser",
		hostname: () => "box",
		...overrides,
	};
}

test("falls back to OS username and hostname with empty git identity", () => {
	const account = resolveAccount(sources({}));
	expect(account).toEqual({ email: "", gitName: "", userName: "osuser", hostname: "box" });
});

test("reads identity from git config when env is absent", () => {
	const account = resolveAccount(
		sources({
			readGitConfig: (key) => (key === "user.email" ? "a@b.c" : "Ada"),
		})
	);
	expect(account.email).toBe("a@b.c");
	expect(account.gitName).toBe("Ada");
});

test("env overrides git config", () => {
	const account = resolveAccount(
		sources({
			env: { PI_OTEL_USER_EMAIL: "env@x.y", PI_OTEL_USER_NAME: "EnvName" },
			readGitConfig: () => "git-value",
		})
	);
	expect(account.email).toBe("env@x.y");
	expect(account.gitName).toBe("EnvName");
});
