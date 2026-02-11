import OpenAI from "openai";
import { FixSuggestion } from "../types";

export class OpenAIClient {
  private client: OpenAI;

  constructor(apiKey?: string) {
    this.client = new OpenAI({
      apiKey: apiKey || process.env.OPENAI_API_KEY,
    });
  }

  // 🔥 NEW: Classification Layer
  async isUserVisibleText(text: string): Promise<boolean> {
    try {
      const response = await this.client.chat.completions.create({
        model: "gpt-4.1-mini",
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              "You are a strict classifier. Decide if a string is user-visible UI text that requires translation.",
          },
          {
            role: "user",
            content: `Is this string user-facing UI text? 
Answer ONLY YES or NO.

"${text}"`,
          },
        ],
      });

      const answer =
        response.choices[0].message?.content?.trim().toUpperCase();

      return answer === "YES";
    } catch {
      // Fail safe: assume it's UI text
      return true;
    }
  }

  async generateFix(context: {
    file: string;
    line: number;
    text: string;
  }): Promise<FixSuggestion> {
    try {
      const response = await this.client.chat.completions.create({
        model: "gpt-4.1-mini",
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "You generate semantic i18n translation keys for React apps.",
          },
          {
            role: "user",
            content: `
File: ${context.file}
Text: "${context.text}"

Generate a translation key and replacement code.
Respond ONLY in JSON:
{
  "key": "category.identifier",
  "code": "t(\\"category.identifier\\")",
  "confidence": "high"
}
`,
          },
        ],
      });

      const content = response.choices[0].message?.content || "";
      const parsed = this.parseResponse(content);

      return {
        originalText: context.text,
        suggestedKey: parsed.key,
        suggestedCode: parsed.code,
        confidence: parsed.confidence || "medium",
      };
    } catch {
      return this.simpleFallback(context.text);
    }
  }

  private parseResponse(text: string): any {
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1) {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1));
    }
    return {
      key: "common.text",
      code: 't("common.text")',
      confidence: "low",
    };
  }

  private simpleFallback(text: string): FixSuggestion {
    const cleaned = text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .trim()
      .split(/\s+/)
      .join("");

    return {
      originalText: text,
      suggestedKey: `common.${cleaned}`,
      suggestedCode: `t("common.${cleaned}")`,
      confidence: "low",
    };
  }
}
