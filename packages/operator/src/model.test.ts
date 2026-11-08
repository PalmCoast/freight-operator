import { describe, expect, it } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { z } from "zod";
import { activeProvider, getLanguageModel, runTool } from "./model";

function modelName(model: ReturnType<typeof getLanguageModel>): string {
  if (typeof model === "string") return model;
  if ("modelId" in model && typeof model.modelId === "string") return model.modelId;
  return "";
}

const usage = {
  inputTokens: {
    total: 4,
    noCache: 4,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: 4,
    text: 4,
    reasoning: undefined,
  },
};

const schema = z.object({ value: z.number().int() });

function toolCall(input: unknown) {
  return {
    content: [
      {
        type: "tool-call" as const,
        toolCallId: "call-test",
        toolName: "echo",
        input: JSON.stringify(input),
      },
    ],
    finishReason: { unified: "tool-calls" as const, raw: undefined },
    usage,
    warnings: [],
  };
}

describe("model gateway", () => {
  it("stays on the mock when no API key is configured", () => {
    delete process.env.OPENAI_API_KEY;
    process.env.OPERATOR_FORCE_MOCK = "1";
    expect(activeProvider()).toBe("mock");
    const model = getLanguageModel();
    expect(modelName(model)).toBe("deterministic-operator");
  });

  it("selects OpenAI only when a key is set and the force flag is off", () => {
    const previous = process.env.OPERATOR_FORCE_MOCK;
    delete process.env.OPERATOR_FORCE_MOCK;
    process.env.OPENAI_API_KEY = "sk-test";
    expect(activeProvider()).toBe("openai");
    const model = getLanguageModel();
    expect(modelName(model)).toContain("gpt-4o-mini");
    delete process.env.OPENAI_API_KEY;
    process.env.OPERATOR_FORCE_MOCK = previous ?? "1";
  });

  it("retries when the model returns arguments that fail the Zod schema", async () => {
    let calls = 0;
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        calls += 1;
        if (calls === 1) return toolCall({ value: "nope" });
        return toolCall({ value: 4 });
      },
    });
    const result = await runTool({
      model,
      toolName: "echo",
      description: "Echo a number.",
      inputSchema: schema,
      outputSchema: schema,
      prompt: "REQUIRED_TOOL: echo\n\nCONTEXT_JSON:\n{}",
      execute: async (input) => input,
    });
    expect(result.output.value).toBe(4);
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(result.attempts).toBeLessThanOrEqual(3);
  });

  it("retries when the tool output fails validation, then stops", async () => {
    let executions = 0;
    const model = new MockLanguageModelV4({
      doGenerate: async (options) => {
        if (options.prompt.some((message) => message.role === "tool")) {
          return {
            content: [{ type: "text" as const, text: "ok" }],
            finishReason: { unified: "stop" as const, raw: undefined },
            usage,
            warnings: [],
          };
        }
        return toolCall({ value: 1 });
      },
    });
    const result = await runTool({
      model,
      toolName: "echo",
      description: "Echo a number.",
      inputSchema: schema,
      outputSchema: schema,
      prompt: "REQUIRED_TOOL: echo",
      execute: async () => {
        executions += 1;
        if (executions === 1) return { value: "not-a-number" };
        return { value: 1 };
      },
    });
    expect(executions).toBe(2);
    expect(result.output.value).toBe(1);
  });
});
