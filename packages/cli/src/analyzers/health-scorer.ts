/**
 * Health Score Calculator
 * Computes a 0-100 score based on detected issues
 */

import { HealthMetrics, DetectedIssue, ConsistencyIssue } from '../types';

export class HealthScorer {
  calculate(results: {
    totalFiles: number;
    hardcoded: DetectedIssue[];
    consistency: ConsistencyIssue[];
    missingKeys: DetectedIssue[];
  }): HealthMetrics {
    const { totalFiles, hardcoded, consistency, missingKeys } = results;

    // Start with perfect score
    let score = 100;

    // Apply penalties
    score -= hardcoded.length * 5;      // -5 per hardcoded string
    score -= consistency.length * 3;     // -3 per consistency issue
    score -= missingKeys.length * 4;     // -4 per missing key

    // Apply bonuses
    const cleanFiles = this.countCleanFiles(results, totalFiles);
    score += cleanFiles * 2;             // +2 per clean file

    // Clamp score between 0 and 100
    score = Math.max(0, Math.min(100, score));

    return {
      totalFiles,
      cleanFiles,
      issuesFound: hardcoded.length + consistency.length + missingKeys.length,
      hardcodedCount: hardcoded.length,
      consistencyCount: consistency.length,
      missingKeysCount: missingKeys.length,
      score: Math.round(score),
      grade: this.getGrade(score),
    };
  }

  private countCleanFiles(results: any, totalFiles: number): number {
    const filesWithIssues = new Set<string>();
    
    [...results.hardcoded, ...results.consistency, ...results.missingKeys].forEach(
      (issue: any) => {
        if (issue.file) {
          filesWithIssues.add(issue.file);
        }
      }
    );

    return totalFiles - filesWithIssues.size;
  }

  private getGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }
}