
import { levenshteinDistance, calculateSimilarity } from '../utils/levenshtein';
import { ConsistencyIssue } from '../types';

export class ConsistencyChecker {
  private threshold: number = 0.8; // 80% similarity

  check(allStrings: string[]): ConsistencyIssue[] {
    const groups = this.groupSimilarStrings(allStrings);
    const issues: ConsistencyIssue[] = [];

    for (const group of groups) {
      if (group.length > 1) {
        // Count occurrences
        const counts = new Map<string, number>();
        allStrings.forEach((str) => {
          if (group.includes(str)) {
            counts.set(str, (counts.get(str) || 0) + 1);
          }
        });

        // Sort by frequency
        const sorted = Array.from(counts.entries())
          .map(([text, count]) => ({ text, count }))
          .sort((a, b) => b.count - a.count);

        issues.push({
          variations: group,
          suggested: sorted[0].text, // Most common variant
          occurrences: sorted,
        });
      }
    }

    return issues;
  }

  private groupSimilarStrings(strings: string[]): string[][] {
    const groups: string[][] = [];
    const processed = new Set<string>();

    for (const str1 of strings) {
      if (processed.has(str1)) continue;

      const group = [str1];
      processed.add(str1);

      for (const str2 of strings) {
        if (str1 === str2 || processed.has(str2)) continue;

        if (this.areSimilar(str1, str2)) {
          group.push(str2);
          processed.add(str2);
        }
      }

      if (group.length > 1) {
        groups.push(group);
      }
    }

    return groups;
  }

  private areSimilar(str1: string, str2: string): boolean {
    // Normalize strings
    const normalized1 = str1.toLowerCase().replace(/\s+/g, '');
    const normalized2 = str2.toLowerCase().replace(/\s+/g, '');

    // Exact match after normalization
    if (normalized1 === normalized2) return true;

    // Check similarity using Levenshtein distance
    const similarity = calculateSimilarity(normalized1, normalized2);

    return similarity >= this.threshold;
  }
}