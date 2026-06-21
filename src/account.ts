import { execSync } from "child_process";
import { hostname, userInfo } from "os";

export interface Account {
	email: string;
	gitName: string;
	userName: string;
	hostname: string;
}

export interface AccountSources {
	env: Record<string, string | undefined>;
	readGitConfig: (key: string) => string;
	username: () => string;
	hostname: () => string;
}

export function resolveAccount(sources: AccountSources): Account {
	return {
		email: sources.env.PI_OTEL_USER_EMAIL || sources.readGitConfig("user.email") || "",
		gitName: sources.env.PI_OTEL_USER_NAME || sources.readGitConfig("user.name") || "",
		userName: sources.username(),
		hostname: sources.hostname(),
	};
}

export function readGitConfig(key: string): string {
	try {
		return execSync(`git config --global ${key}`, { encoding: "utf-8", timeout: 2000 }).trim();
	} catch {
		return "";
	}
}

export function systemAccountSources(env: Record<string, string | undefined>): AccountSources {
	return {
		env,
		readGitConfig,
		username: () => userInfo().username,
		hostname: () => hostname(),
	};
}
