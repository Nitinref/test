import Anthropic from '@anthropic-ai/sdk';
import { FixSuggestion } from '../types';

export class LingoMCPClient {
  private client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
    });
  }

  async generateFix(context: {
    file: string;
    line: number;
    text: string;
    surroundingCode?: string;
  }): Promise<FixSuggestion> {
    const prompt = this.buildPrompt(context);

    try {
      const message = await this.client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const response = message.content[0];
      if (response.type !== 'text') {
        throw new Error('Unexpected response type from Claude');
      }

      const result = this.parseResponse(response.text);

      return {
        originalText: context.text,
        suggestedKey: result.key,
        suggestedCode: result.code,
        confidence: result.confidence || 'medium',
      };
    } catch (error) {
      // Fallback to simple key generation
      return this.generateSimpleFix(context.text);
    }
  }

  async generateBatchFixes(
    issues: Array<{ file: string; line: number; text: string }>
  ): Promise<FixSuggestion[]> {
    const suggestions: FixSuggestion[] = [];

    // Process in small batches to avoid rate limits
    const batchSize = 5;
    for (let i = 0; i < issues.length; i += batchSize) {
      const batch = issues.slice(i, i + batchSize);
      const batchPromises = batch.map((issue) => this.generateFix(issue));
      
      try {
        const batchResults = await Promise.all(batchPromises);
        suggestions.push(...batchResults);
      } catch (error) {
        // If batch fails, generate simple fixes
        batch.forEach((issue) => {
          suggestions.push(this.generateSimpleFix(issue.text));
        });
      }

      // Small delay to respect rate limits
      if (i + batchSize < issues.length) {
        await this.delay(1000);
      }
    }

    return suggestions;
  }

  private buildPrompt(context: {
    file: string;
    line: number;
    text: string;
    surroundingCode?: string;
  }): string {
    return `You are a senior developer helping fix i18n issues.

Context:
- File: ${context.file}
- Line: ${context.line}
- Hardcoded text: "${context.text}"

${context.surroundingCode ? `Surrounding code:\n\`\`\`\n${context.surroundingCode}\n\`\`\`` : ''}

Generate a semantic translation key and replacement code.

Rules:
1. Key format: "category.identifier" (e.g., "button.submit", "header.welcome")
2. Category should match the UI component type
3. Identifier should be descriptive but concise
4. Code should use t() function

Respond ONLY with JSON:
{
  "key": "category.identifier",
  "code": "t(\\"category.identifier\\")",
  "confidence": "high"
}`;
  }

  private parseResponse(text: string): any {
    try {
      // Try to extract JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error('No JSON found');
    } catch (error) {
      // Fallback parsing
      return {
        key: 'common.text',
        code: 't("common.text")',
        confidence: 'low',
      };
    }
  }

  private generateSimpleFix(text: string): FixSuggestion {
    // Simple key generation without AI
    const key = this.textToKey(text);
    
    return {
      originalText: text,
      suggestedKey: key,
      suggestedCode: `t("${key}")`,
      confidence: 'low',
    };
  }

  private textToKey(text: string): string {
    // Convert "Submit Form" -> "button.submitForm"
    const cleaned = text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .trim()
      .split(/\s+/)
      .map((word, i) => (i === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)))
      .join('');

    return `common.${cleaned}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}