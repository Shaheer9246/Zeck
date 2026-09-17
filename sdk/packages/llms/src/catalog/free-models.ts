export type FreeModelTag = "thinking" | "coding" | "fast" | "chat";

export interface FreeModelEntry {
	provider: "groq" | "cloudflare" | "openrouter";
	modelId: string;
	label: string;
	tags: FreeModelTag[];
}

export const CURATED_FREE_MODELS: FreeModelEntry[] = [
	{
		provider: "groq",
		modelId: "openai/gpt-oss-120b",
		label: "GPT OSS 120B",
		tags: ["thinking", "coding"],
	},
	{
		provider: "groq",
		modelId: "llama-3.3-70b-versatile",
		label: "Llama 3.3 70B Versatile",
		tags: ["coding", "chat"],
	},
	{
		provider: "groq",
		modelId: "llama-3.1-8b-instant",
		label: "Llama 3.1 8B Instant",
		tags: ["fast"],
	},
	{
		provider: "groq",
		modelId: "meta-llama/llama-4-scout-17b-16e-instruct",
		label: "Llama 4 Scout 17B",
		tags: ["chat"],
	},
	{
		provider: "cloudflare",
		modelId: "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
		label: "DeepSeek R1 Distill Qwen 32B",
		tags: ["thinking"],
	},
	{
		provider: "cloudflare",
		modelId: "@cf/meta/llama-3.3-70b-instruct-fp8",
		label: "Llama 3.3 70B Instruct",
		tags: ["coding", "chat"],
	},
	{
		provider: "cloudflare",
		modelId: "@cf/qwen/qwen3-30b-a3b-fp8",
		label: "Qwen 3 30B A3B",
		tags: ["coding"],
	},
	{
		provider: "cloudflare",
		modelId: "@cf/meta/llama-3.1-8b-instruct",
		label: "Llama 3.1 8B Instruct",
		tags: ["fast"],
	},
	{
		provider: "openrouter",
		modelId: "deepseek/deepseek-r1:free",
		label: "DeepSeek R1",
		tags: ["thinking"],
	},
	{
		provider: "openrouter",
		modelId: "qwen/qwen3-coder:free",
		label: "Qwen 3 Coder",
		tags: ["coding"],
	},
	{
		provider: "openrouter",
		modelId: "meta-llama/llama-3.3-70b-instruct:free",
		label: "Llama 3.3 70B Instruct",
		tags: ["chat"],
	},
	{
		provider: "openrouter",
		modelId: "google/gemini-2.0-flash-exp:free",
		label: "Gemini 2.0 Flash Experimental",
		tags: ["fast"],
	},
];

export function freeModelsFor(
	provider: FreeModelEntry["provider"],
): FreeModelEntry[] {
	return CURATED_FREE_MODELS.filter((entry) => entry.provider === provider);
}

export function freeModelsByTag(tag: FreeModelTag): FreeModelEntry[] {
	return CURATED_FREE_MODELS.filter((entry) => entry.tags.includes(tag));
}

export function isFreeModel({
	modelId,
	inputPrice,
	outputPrice,
}: {
	modelId: string;
	inputPrice?: number;
	outputPrice?: number;
}): boolean {
	return (inputPrice === 0 && outputPrice === 0) || modelId.endsWith(":free");
}
