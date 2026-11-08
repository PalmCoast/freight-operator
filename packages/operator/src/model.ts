import { createOpenAI } from "@ai-sdk/openai";
import { ParsedRateRequest, formatZodError } from "@freight/schema";
import { generateText, tool, stepCountIs, type LanguageModel } from "ai";
import type { z } from "zod";
import { MockLanguageModelV4 } from "ai/test";
import { ModelOutputError } from "./errors";
import { parseRateRequestText } from "./parser";

const MODEL_ATTEMPTS = 3;

const usage = {
  inputTokens: {
    total: 8,
    noCache: 8,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: 12,
    text: 12,
    reasoning: undefined,
  },
};

export function activeProvider(): "mock" | "openai" {
  if (process.env.OPERATOR_FORCE_MOCK === "1") return "mock";
  if (process.env.OPENAI_API_KEY?.trim()) return "openai";
  return "mock";
}

export function buildToolPrompt(input: {
  toolName: string;
  instructions: string;
  context: unknown;
}): string {
  return [
    `REQUIRED_TOOL: ${input.toolName}`,
    input.instructions,
    "CONTEXT_JSON:",
    JSON.stringify(input.context),
    "Call the tool. Copy identifiers from CONTEXT_JSON exactly. Do not invent prices or carrier ids.",
  ].join("\n\n");
}

function collectText(value: unknown, out: string[]): void {
  if (typeof value === "string") {
    out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectText(item, out);
    return;
  }
  if (value && typeof value === "object") {
    for (const nested of Object.values(value)) collectText(nested, out);
  }
}

function readContext(text: string): Record<string, unknown> {
  const marker = text.indexOf("CONTEXT_JSON:");
  if (marker < 0) return {};
  const brace = text.indexOf("{", marker);
  if (brace < 0) return {};
  let depth = 0;
  for (let index = brace; index < text.length; index += 1) {
    const char = text[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          const parsed: unknown = JSON.parse(text.slice(brace, index + 1));
          return parsed && typeof parsed === "object"
            ? (parsed as Record<string, unknown>)
            : {};
        } catch {
          return {};
        }
      }
    }
  }
  return {};
}

function mockArguments(
  toolName: string,
  context: Record<string, unknown>,
): unknown {
  if (toolName === "parseRateRequest") {
    const rawText = typeof context.rawText === "string" ? context.rawText : "";
    const now =
      typeof context.now === "string" ? new Date(context.now) : new Date();
    const parsed = parseRateRequestText(rawText, Number.isNaN(now.getTime()) ? new Date() : now);
    if (!parsed.ok) return { reasoning: parsed.error };
    return {
      ...parsed.value,
      reasoning:
        "Extracted the lane, equipment, weight, and pickup from the email.",
    };
  }

  const parsed = ParsedRateRequest.safeParse(context.parsed);
  if (toolName === "lookupLaneRate") {
    if (!parsed.success) return { reasoning: "Missing the parsed request." };
    return {
      originCity: parsed.data.originCity,
      originState: parsed.data.originState,
      destinationCity: parsed.data.destinationCity,
      destinationState: parsed.data.destinationState,
      equipment: parsed.data.equipment,
      reasoning: "Using the parsed lane as the rate-card key.",
    };
  }

  if (toolName === "checkCarrier") {
    if (!parsed.success) return { reasoning: "Missing the parsed request." };
    return {
      equipment: parsed.data.equipment,
      originState: parsed.data.originState,
      destinationState: parsed.data.destinationState,
      reasoning: "Checking authority, insurance, safety, and coverage.",
    };
  }

  if (toolName === "draftQuote") {
    return {
      laneRateId: context.laneId,
      carrierId: context.carrierId,
      rawText: context.rawText,
      weightLbs: context.weightLbs,
      pickupDate: context.pickupDate,
      reasoning: "Price this from the rate card, not from a guessed number.",
    };
  }

  return { reasoning: "Unsupported tool." };
}

/**
 * Deterministic provider. It reads CONTEXT_JSON from the prompt and returns
 * the tool call the step asked for. No network, no API key.
 */
export function createMockOperatorModel(): LanguageModel {
  return new MockLanguageModelV4({
    provider: "freight-mock",
    modelId: "deterministic-operator",
    doGenerate: async (options) => {
      if (options.prompt.some((message) => message.role === "tool")) {
        return {
          content: [{ type: "text", text: "Recorded." }],
          finishReason: { unified: "stop", raw: undefined },
          usage,
          warnings: [],
        };
      }
      const chunks: string[] = [];
      collectText(options.prompt, chunks);
      const text = chunks.join("\n");
      const toolName =
        /REQUIRED_TOOL:\s*([A-Za-z0-9_]+)/.exec(text)?.[1] ?? "parseRateRequest";
      return {
        content: [
          {
            type: "tool-call",
            toolCallId: "call-mock-1",
            toolName,
            input: JSON.stringify(mockArguments(toolName, readContext(text))),
          },
        ],
        finishReason: { unified: "tool-calls", raw: undefined },
        usage,
        warnings: [],
      };
    },
  });
}

export function getLanguageModel(): LanguageModel {
  if (activeProvider() === "openai") {
    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return openai.languageModel(process.env.OPENAI_MODEL ?? "gpt-4o-mini");
  }
  return createMockOperatorModel();
}

export async function runTool<TIn, TOut>(options: {
  model: LanguageModel;
  toolName: string;
  description: string;
  inputSchema: z.ZodType<TIn>;
  outputSchema: z.ZodType<TOut>;
  prompt: string;
  execute: (input: TIn) => Promise<unknown>;
  maxAttempts?: number;
}): Promise<{ input: TIn; output: TOut; attempts: number }> {
  const maxAttempts = options.maxAttempts ?? MODEL_ATTEMPTS;
  let feedback = "";
  let lastError = "The model did not return a tool result.";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const prompt = feedback
      ? `${options.prompt}\n\nPREVIOUS_ATTEMPT_FAILED: ${feedback}\nFix the tool arguments and call the tool again.`
      : options.prompt;
    try {
      // Open generics and the SDK's FlexibleSchema overloads do not infer
      // together. The schemas are still applied with safeParse below, so a
      // bad model payload never becomes a decision.
      const registered = tool({
        description: options.description,
        inputSchema: options.inputSchema,
        outputSchema: options.outputSchema,
        execute: async (input: TIn) => {
          const produced = await options.execute(input);
          const parsed = options.outputSchema.safeParse(produced);
          if (!parsed.success) {
            throw new Error(
              `Tool output failed validation: ${formatZodError(parsed.error)}`,
            );
          }
          return parsed.data;
        },
      } as never);
      const result = await generateText({
        model: options.model,
        prompt,
        toolChoice: "required",
        stopWhen: stepCountIs(1),
        maxRetries: 0,
        tools: {
          [options.toolName]: registered,
        },
      });

      const produced = result.toolResults.find(
        (item) => item.toolName === options.toolName,
      );
      if (!produced) {
        const invalid = result.toolCalls.find(
          (item) => "invalid" in item && item.invalid,
        );
        const invalidError =
          invalid && "error" in invalid ? invalid.error : undefined;
        lastError =
          invalidError instanceof Error
            ? invalidError.message
            : "The model did not return a validated tool result.";
        feedback = lastError;
        continue;
      }

      const input = options.inputSchema.safeParse(produced.input);
      if (!input.success) {
        lastError = formatZodError(input.error);
        feedback = lastError;
        continue;
      }
      const output = options.outputSchema.safeParse(produced.output);
      if (!output.success) {
        lastError = formatZodError(output.error);
        feedback = lastError;
        continue;
      }
      return { input: input.data, output: output.data, attempts: attempt };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      feedback = lastError;
    }
  }

  throw new ModelOutputError(
    `Model output failed validation after ${maxAttempts} attempts: ${lastError}`,
  );
}
