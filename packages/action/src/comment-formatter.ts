/**
 * PR Comment Formatter
 * Generates beautiful Markdown comments for GitHub PRs
 */

import { ScanResult, DetectedIssue, FixSuggestion, DebtMetrics } from '@lingoguard/cli';

export class CommentFormatter {
  format(results: ScanResult): string {
    const sections = [
      this.formatHeader(results),
      this.formatHighSeverityIssues(results.hardcoded, results.suggestions),
      this.formatMediumSeverityIssues(results.hardcoded),
      this.formatConsistencyIssues(results.consistency),
      this.formatBreakdown(results),
      this.formatDebtScore(results.debt),
      this.formatQuickActions(),
      this.formatFooter(),
    ];

    return sections.filter(Boolean).join('\n\n---\n\n');
  }

  // =========================================
  // HEADER
  // =========================================

  private formatHeader(results: ScanResult): string {
    const { health } = results;

    const emoji =
      health.score >= 80 ? '🎉'
      : health.score >= 60 ? '⚠️'
      : '🚨';

    return `## ${emoji} LingoGuard i18n Report

### 📊 Health Score: **${health.score}/100** (${health.grade})

Total Issues: **${health.issuesFound}**
`;
  }

  // =========================================
  // HIGH SEVERITY
  // =========================================

  private formatHighSeverityIssues(
    issues: DetectedIssue[],
    suggestions: Map<string, FixSuggestion>
  ): string {
    const high = issues.filter(i => i.severity === 'high').slice(0, 5);

    if (high.length === 0) return '';

    let output = `### 🔴 High Severity Issues (${high.length})`;

    high.forEach(issue => {
      const suggestion = suggestions.get(issue.text);
      const fileName = issue.file.split(/[\\/]/).pop();

      output += `

<details>
<summary><code>${fileName}:${issue.line}</code></summary>

**Detected text:**  
\`${issue.text}\`

${suggestion ? `
**💡 One-Click Fix (Apply directly in PR):**

\`\`\`suggestion
${suggestion.suggestedCode.trim()}
\`\`\`

**Translation Key:** \`${suggestion.suggestedKey}\`
` : ''}


</details>`;
    });

    return output;
  }

  // =========================================
  // MEDIUM SEVERITY
  // =========================================

  private formatMediumSeverityIssues(
    issues: DetectedIssue[]
  ): string {
    const medium = issues.filter(i => i.severity === 'medium').slice(0, 5);

    if (medium.length === 0) return '';

    let output = `### ⚠️ Medium Severity Issues (${medium.length})`;

    medium.forEach(issue => {
      const fileName = issue.file.split(/[\\/]/).pop();
      output += `\n- \`${fileName}:${issue.line}\` → "${issue.text}"`;
    });

    return output;
  }

  // =========================================
  // CONSISTENCY
  // =========================================

  private formatConsistencyIssues(consistency: any[]): string {
    if (!consistency || consistency.length === 0) return '';

    let output = `### 🔄 Word Consistency Issues (${consistency.length})`;

    consistency.slice(0, 3).forEach(issue => {
      output += `\n\n**Variations Found:**`;

      issue.occurrences.forEach((occ: any, index: number) => {
        const badge = index === 0 ? ' ✅ Recommended' : '';
        output += `\n- "${occ.text}" (used ${occ.count} times)${badge}`;
      });
    });

    return output;
  }

  // =========================================
  // BREAKDOWN TABLE
  // =========================================

  private formatBreakdown(results: ScanResult): string {
    return `### 📈 Breakdown

| Metric | Count |
|--------|-------|
| Total files scanned | ${results.health.totalFiles} |
| Clean files | ${results.health.cleanFiles} |
| Hardcoded strings | ${results.hardcoded.length} |
| Consistency issues | ${results.consistency.length} |
| Missing keys | ${results.missingKeys.length} |`;
  }

  // =========================================
  // DEBT SCORE
  // =========================================

  private formatDebtScore(debt: DebtMetrics): string {
    const levelMap: Record<'low' | 'medium' | 'high' | 'critical', string> = {
      low: '🟢',
      medium: '🟡',
      high: '🟠',
      critical: '🔴',
    };

    const emoji = levelMap[debt.level];

    let output = `### 🧾 Lingo Debt

**Debt Level:** ${emoji} ${debt.level.toUpperCase()}  
**Estimated Fix Time:** ~${debt.estimatedFixTimeHours} hours`;

    if (debt.topFiles.length > 0) {
      output += `\n\n**Top Problematic Files:**`;

      debt.topFiles.slice(0, 3).forEach((file, i) => {
        const fileName = file.file.split(/[\\/]/).pop();
        output += `\n${i + 1}. \`${fileName}\` - ${file.issueCount} issues (${file.estimatedMinutes}min)`;
      });
    }

    return output;
  }

  // =========================================
  // QUICK ACTIONS
  // =========================================

  private formatQuickActions(): string {
    return `### 🚀 Quick Actions

- [ ] Review high severity issues
- [ ] Apply suggested fixes
- [ ] Re-run LingoGuard to verify improvements`;
  }

  // =========================================
  // FOOTER
  // =========================================

  private formatFooter(): string {
    return `<sub>Powered by **LingoGuard** | Built for Dev Teams 🚀</sub>`;
  }
}
