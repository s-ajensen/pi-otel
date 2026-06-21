const MAX_SUMMARY_LENGTH = 200;

export function summarizeArgs(toolName: string, args: any): string {
	if (!args) return "";

	switch (toolName) {
		case "bash":
			return truncate(args.command ?? "", MAX_SUMMARY_LENGTH);
		case "read":
		case "write":
		case "edit":
			return args.path ?? "";
		default:
			try {
				return truncate(JSON.stringify(args), MAX_SUMMARY_LENGTH);
			} catch {
				return "[unserializable]";
			}
	}
}

export function truncate(str: string, maxLength: number): string {
	return str.length > maxLength ? str.slice(0, maxLength) + "…" : str;
}
