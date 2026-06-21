export interface TurnUsage {
	model: string;
	provider: string;
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	cacheWriteTokens: number;
	totalTokens: number;
	cost: number;
}

export function extractTurnUsage(message: any): TurnUsage | undefined {
	if (message?.role !== "assistant" || !message.usage) return undefined;

	const usage = message.usage;
	return {
		model: message.model ?? "",
		provider: message.provider ?? "",
		inputTokens: usage.input ?? 0,
		outputTokens: usage.output ?? 0,
		cacheReadTokens: usage.cacheRead ?? 0,
		cacheWriteTokens: usage.cacheWrite ?? 0,
		totalTokens: usage.totalTokens ?? 0,
		cost: usage.cost?.total ?? 0,
	};
}
