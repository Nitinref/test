export interface DetectedIssue {
  file: string;
  line: number;
  column: number;
  text: string;
  type: 'hardcoded' | 'consistency' | 'missing-key';
  severity: 'high' | 'medium' | 'low';
  context?: string;
}

export interface ConsistencyIssue {
  variations: string[];
  suggested: string;
  occurrences: Array<{ text: string; count: number }>;
}

export interface HealthMetrics {
  totalFiles: number;
  cleanFiles: number;
  issuesFound: number;
  hardcodedCount: number;
  consistencyCount: number;
  missingKeysCount: number;
  score: number; // 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
}

export interface DebtMetrics {
  level: 'low' | 'medium' | 'high' | 'critical';
  estimatedFixTimeHours: number;
  estimatedFixTimeMinutes: number;
  topFiles: Array<{
    file: string;
    issueCount: number;
    estimatedMinutes: number;
  }>;
}

export interface FixSuggestion {
  originalText: string;
  suggestedKey: string;
  suggestedCode: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface ScanResult {
  hardcoded: DetectedIssue[];
  consistency: ConsistencyIssue[];
  missingKeys: DetectedIssue[];
  health: HealthMetrics;
  debt: DebtMetrics;
  suggestions: Map<string, FixSuggestion>;
}

export interface ScanOptions {
  scanPath: string;
  ignorePatterns?: string[];
  extensions?: string[];
  generateFixes?: boolean;
  lingoApiKey?: string;
  anthropicApiKey?: string;
  filesOverride?: string[];

}

export interface CoverageData {
  features: string[];
  languages: string[];
  matrix: Record<string, Record<string, boolean>>;
  overallPercentage: number;
}