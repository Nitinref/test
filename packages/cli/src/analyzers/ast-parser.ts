import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';
import * as fs from 'fs';

export class ASTParser {

  parseFile(filePath: string): any {
    const code = fs.readFileSync(filePath, 'utf-8');

    const isTypeScript = /\.tsx?$/.test(filePath);

    return parse(code, {
      sourceType: 'module',
      plugins: [
        ...(isTypeScript ? (['typescript'] as any) : []),
        'jsx' as any,
        'decorators-legacy' as any,
        'classProperties' as any,
        'objectRestSpread' as any,
        'optionalChaining' as any,
        'nullishCoalescingOperator' as any,
      ]

    });
  }

  /**
   * Check if a node is a translation function call
   * Examples: t("key"), i18n.t("key"), $t("key"), useTranslation()
   */
  isTranslationCall(node: any): boolean {
    if (!t.isCallExpression(node)) return false;

    const callee = node.callee;

    // Direct calls: t(), $t()
    if (t.isIdentifier(callee)) {
      return ['t', '$t', 'i18n', 'translate', 'trans'].includes(callee.name);
    }

    // Member calls: i18n.t(), intl.formatMessage()
    if (t.isMemberExpression(callee)) {
      const property = callee.property;
      if (t.isIdentifier(property)) {
        return ['t', 'formatMessage', 'translate', 'trans'].includes(property.name);
      }
    }

    return false;
  }

  /**
   * Check if string is inside a translation context
   */
  isInTranslationContext(path: any): boolean {
    let current = path.parentPath;

    while (current) {
      if (this.isTranslationCall(current.node)) {
        return true;
      }
      current = current.parentPath;
    }

    return false;
  }

  /**
   * Get surrounding code context for better AI suggestions
   */
  getSurroundingCode(filePath: string, line: number, contextLines: number = 3): string {
    const code = fs.readFileSync(filePath, 'utf-8');
    const lines = code.split('\n');

    const start = Math.max(0, line - contextLines - 1);
    const end = Math.min(lines.length, line + contextLines);

    return lines.slice(start, end).join('\n');
  }
}