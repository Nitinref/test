/**
 * Lingo Debt Score Calculator
 * Estimates time to fix all i18n issues
 */

import { DebtMetrics, DetectedIssue, ConsistencyIssue } from '../types';

export class DebtScorer {
  // Time estimates per issue type (in minutes)
  private readonly TIME_PER_HARDCODED = 3;
  private readonly TIME_PER_CONSISTENCY = 2;
  private readonly TIME_PER_MISSING_KEY = 4;

  calculate(results: {
    hardcoded: DetectedIssue[];
    consistency: ConsistencyIssue[];
    missingKeys: DetectedIssue[];
  }): DebtMetrics {
    const { hardcoded, consistency, missingKeys } = results;

    // Calculate total time
    const totalMinutes =
      hardcoded.length * this.TIME_PER_HARDCODED +
      consistency.length * this.TIME_PER_CONSISTENCY +
      missingKeys.length * this.TIME_PER_MISSING_KEY;

    // Group issues by file
    const fileIssues = this.groupByFile(hardcoded, consistency, missingKeys);

    // Sort files by issue count
    const topFiles = Array.from(fileIssues.entries())
      .map(([file, issues]) => ({
        file,
        issueCount: issues.length,
        estimatedMinutes: this.calculateFileTime(issues),
      }))
      .sort((a, b) => b.issueCount - a.issueCount)
      .slice(0, 10); // Top 10 problematic files

    return {
      level: this.getDebtLevel(totalMinutes),
      estimatedFixTimeHours: Math.round((totalMinutes / 60) * 10) / 10,
      estimatedFixTimeMinutes: totalMinutes,
      topFiles,
    };
  }

  private groupByFile(
    hardcoded: DetectedIssue[],
    consistency: ConsistencyIssue[],
    missingKeys: DetectedIssue[]
  ): Map<string, Array<DetectedIssue | ConsistencyIssue>> {
    const map = new Map<string, Array<DetectedIssue | ConsistencyIssue>>();

    // Add hardcoded issues
    hardcoded.forEach((issue) => {
      if (!map.has(issue.file)) {
        map.set(issue.file, []);
      }
      map.get(issue.file)!.push(issue);
    });

    // Add consistency issues (these don't have a file property, so we skip)
    // In real implementation, you'd track which files have inconsistent strings

    // Add missing key issues
    missingKeys.forEach((issue) => {
      if (!map.has(issue.file)) {
        map.set(issue.file, []);
      }
      map.get(issue.file)!.push(issue);
    });

    return map;
  }

  private calculateFileTime(issues: Array<DetectedIssue | ConsistencyIssue>): number {
    let total = 0;

    issues.forEach((issue) => {
      if ('type' in issue) {
        // DetectedIssue
        if (issue.type === 'hardcoded') {
          total += this.TIME_PER_HARDCODED;
        } else if (issue.type === 'missing-key') {
          total += this.TIME_PER_MISSING_KEY;
        }
      } else {
        // ConsistencyIssue
        total += this.TIME_PER_CONSISTENCY;
      }
    });

    return total;
  }

  private getDebtLevel(minutes: number): 'low' | 'medium' | 'high' | 'critical' {
    if (minutes < 30) return 'low';
    if (minutes < 120) return 'medium';
    if (minutes < 300) return 'high';
    return 'critical';
  }
}