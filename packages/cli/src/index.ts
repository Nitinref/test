import { FileScanner } from './utils/file-scanner';
import { HardcodedDetector } from './detectors/hardcoded-detector';
import { ConsistencyChecker } from './detectors/consistency-checker';
import { HealthScorer } from './analyzers/health-scorer';
import { DebtScorer } from './analyzers/debt-scorer';
import { ScanResult, ScanOptions, FixSuggestion } from './types';
import { Logger } from './utils/logger';
import { OpenAIClient } from './integrations/openai-client';
import ora from 'ora';

export class LingoGuard {
  private fileScanner: FileScanner;
  private hardcodedDetector: HardcodedDetector;
  private consistencyChecker: ConsistencyChecker;
  private healthScorer: HealthScorer;
  private debtScorer: DebtScorer;
  private aiClient?: OpenAIClient;

  constructor(options?: { openAiKey?: string }) {
    this.fileScanner = new FileScanner();

    // 🔥 Initialize OpenAI only if key provided
    this.aiClient = options?.openAiKey
      ? new OpenAIClient(options.openAiKey)
      : undefined;

    // Inject AI into detector
    this.hardcodedDetector = new HardcodedDetector(this.aiClient);

    this.consistencyChecker = new ConsistencyChecker();
    this.healthScorer = new HealthScorer();
    this.debtScorer = new DebtScorer();
  }

  async scan(options: ScanOptions): Promise<ScanResult> {
    const spinner = ora('Scanning files...').start();

    try {
      // 1️⃣ Find files
     const files = options.filesOverride && options.filesOverride.length > 0
  ? options.filesOverride
  : await this.fileScanner.scan({
      scanPath: options.scanPath,
      ignorePatterns: options.ignorePatterns || [],
      extensions: options.extensions || ['.js', '.jsx', '.ts', '.tsx'],
    });

      spinner.text = `Found ${files.length} files. Analyzing...`;

      // 2️⃣ Detect hardcoded strings
      const hardcodedIssues = [];

      for (const file of files) {
       const issues = this.hardcodedDetector.detect(file);

        hardcodedIssues.push(...issues);
      }

      spinner.text = `Found ${hardcodedIssues.length} hardcoded strings. Checking consistency...`;

      // 3️⃣ Word consistency
      const allStrings = hardcodedIssues.map((issue) => issue.text);
      const consistencyIssues = this.consistencyChecker.check(allStrings);

      spinner.text = 'Calculating health score...';

      // 4️⃣ Health score
      const health = this.healthScorer.calculate({
        totalFiles: files.length,
        hardcoded: hardcodedIssues,
        consistency: consistencyIssues,
        missingKeys: [],
      });

      // 5️⃣ Debt score
      const debt = this.debtScorer.calculate({
        hardcoded: hardcodedIssues,
        consistency: consistencyIssues,
        missingKeys: [],
      });

      // 6️⃣ AI Fix Suggestions (OpenAI)
      let suggestions = new Map<string, FixSuggestion>();

      if (options.generateFixes && this.aiClient && hardcodedIssues.length > 0) {
        spinner.text = 'Generating AI fix suggestions...';

        try {
          const topIssues = hardcodedIssues
            .filter((issue) => issue.severity === 'high')
            .slice(0, 20); // Limit for demo

          const fixSuggestions = await Promise.all(
            topIssues.map((issue) =>
              this.aiClient!.generateFix({
                file: issue.file,
                line: issue.line,
                text: issue.text,
              })
            )
          );

          fixSuggestions.forEach((fix) => {
            suggestions.set(fix.originalText, fix);
          });

        } catch (error) {
          Logger.warning('Failed to generate AI suggestions');
        }
      }

      spinner.succeed('Scan complete!');

      return {
        hardcoded: hardcodedIssues,
        consistency: consistencyIssues,
        missingKeys: [],
        health,
        debt,
        suggestions,
      };

    } catch (error) {
      spinner.fail('Scan failed');
      throw error;
    }
  }
}

// Export types
export * from './types';
