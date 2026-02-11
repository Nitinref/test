import traverse from '@babel/traverse';
import * as t from '@babel/types';
import { ASTParser } from '../analyzers/ast-parser';
import { DetectedIssue } from '../types';
import { OpenAIClient } from '../integrations/openai-client';

export class HardcodedDetector {
  private parser: ASTParser;
  private aiClient?: OpenAIClient;

  constructor(aiClient?: OpenAIClient) {
    this.parser = new ASTParser();
    this.aiClient = aiClient;
  }

  detect(filePath: string): DetectedIssue[] {
    const issues: DetectedIssue[] = [];

    try {
      const ast = this.parser.parseFile(filePath);

      traverse(ast, {
        JSXText: (path) => {
          const text = path.node.value.trim();
          if (!text || this.isWhitespace(text)) return;
          if (!this.isUserFacingText(text)) return;

          issues.push({
            file: filePath,
            line: path.node.loc?.start.line || 0,
            column: path.node.loc?.start.column || 0,
            text,
            type: 'hardcoded',
            severity: 'high',
          });
        },

        JSXAttribute: (path) => {
          const value = path.node.value;
          if (!t.isStringLiteral(value)) return;

          const text = value.value.trim();
          if (!text) return;

          const attrName = t.isJSXIdentifier(path.node.name)
            ? path.node.name.name
            : '';

          if (this.isIgnoredAttribute(attrName)) return;
          if (!this.isUserFacingText(text)) return;

          issues.push({
            file: filePath,
            line: path.node.loc?.start.line || 0,
            column: path.node.loc?.start.column || 0,
            text,
            type: 'hardcoded',
            severity: 'medium',
            context: `attribute="${attrName}"`,
          });
        },

        StringLiteral: (path) => {
          const text = path.node.value.trim();
          if (!text || text.length < 2) return;
          if (this.parser.isInTranslationContext(path)) return;
          if (this.looksLikeKey(text)) return;
          if (!this.isUserFacingText(text)) return;

          issues.push({
            file: filePath,
            line: path.node.loc?.start.line || 0,
            column: path.node.loc?.start.column || 0,
            text,
            type: 'hardcoded',
            severity: 'low',
          });
        },

        TemplateLiteral: (path) => {
          if (this.parser.isInTranslationContext(path)) return;

          for (const quasi of path.node.quasis) {
            const text = quasi.value.cooked?.trim();
            if (!text) continue;
            if (!this.isUserFacingText(text)) continue;

            issues.push({
              file: filePath,
              line: quasi.loc?.start.line || 0,
              column: quasi.loc?.start.column || 0,
              text,
              type: 'hardcoded',
              severity: 'medium',
            });
          }
        },
      });

    } catch (error) {
      console.warn(`Failed to parse ${filePath}:`, (error as Error).message);
    }

    return issues;
  }


  // 🔹 Use AI only for non-TSX files (performance optimization)
  private shouldUseAI(filePath: string): boolean {
    return filePath.endsWith('.js');
  }

  private isWhitespace(text: string): boolean {
    return /^\s*$/.test(text);
  }

  private isIgnoredAttribute(name: string): boolean {
    const ignored = [
      'className',
      'id',
      'key',
      'ref',
      'style',
      'data-',
      'aria-',
      'type',
      'name',
      'value',
      'href',
      'src',
    ];
    return ignored.some((attr) => name.startsWith(attr));
  }

  private looksLikeKey(text: string): boolean {
    return /^[a-z0-9._-]+$/i.test(text);
  }

  private isUserFacingText(text: string): boolean {
    // Must contain at least one alphabet
    if (!/[a-zA-Z]/.test(text)) return false;

    // Ignore file paths
    if (/^[./]/.test(text)) return false;

    // Ignore glob patterns
    if (/[*?]/.test(text)) return false;

    // Ignore rootDir / path-like strings
    if (text.includes('/') || text.includes('\\')) return false;

    // Ignore common config keywords
    const configWords = ['src', 'dist', 'build', 'test', 'node_modules'];
    if (configWords.some(word => text.toLowerCase().includes(word))) return false;

    // Ignore hex colors
    if (/^#[0-9a-fA-F]{3,8}$/.test(text)) return false;

    return true;
  }

}
