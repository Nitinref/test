#!/usr/bin/env node

import { Command } from 'commander';
import { LingoGuard } from './index';
import { loadConfig } from './utils/config-loader';
import { Logger } from './utils/logger';
import * as fs from 'fs';
import * as path from 'path';
import { init } from './commands/init';

const program = new Command();

program
  .name('lingoguard')
  .description('Catch hardcoded strings and i18n violations before merge')
  .version('1.0.0');


// 🛠️ INIT COMMAND
program
  .command('init')
  .description('Setup LingoGuard in your project')
  .action(init);


// 🔍 SCAN COMMAND
program
  .command('scan')
  .description('Scan project for i18n issues')
  .option('-p, --path <path>', 'Path to scan', './src')
  .option('-o, --output <file>', 'Save results to JSON file')
  .option('--no-fixes', 'Disable AI fix suggestions')
  .option('--openai-key <key>', 'OpenAI API key')
  .action(async (options) => {
    try {
      Logger.header('🛡️ LingoGuard Scanner');

      // Load config
      const config = loadConfig();

      // Initialize engine
      const scanner = new LingoGuard({
        openAiKey: options.openaiKey || process.env.OPENAI_API_KEY,
      });

      // Run scan
      const results = await scanner.scan({
        scanPath: options.path || config.scanPath || './src',
        ignorePatterns: config.ignorePatterns,
        extensions: config.extensions,
        generateFixes: options.fixes !== false && config.generateFixes,
      });

      console.log('\n');
      Logger.header('📊 Results');

      Logger.result(
        'Health Score',
        `${results.health.score}/100 (${results.health.grade})`,
        results.health.score >= 80
          ? 'green'
          : results.health.score >= 60
          ? 'yellow'
          : 'red'
      );

      Logger.result(
        'Total Issues',
        results.health.issuesFound,
        results.health.issuesFound === 0 ? 'green' : 'red'
      );

      Logger.result('Hardcoded Strings', results.hardcoded.length, 'red');
      Logger.result('Consistency Issues', results.consistency.length, 'yellow');
      Logger.result(
        'Clean Files',
        `${results.health.cleanFiles}/${results.health.totalFiles}`,
        'green'
      );

      // Show sample issues
      if (results.hardcoded.length > 0) {
        console.log('\n');
        Logger.header('❌ Sample Issues');

        results.hardcoded.slice(0, 5).forEach((issue) => {
          console.log(`\n${path.basename(issue.file)}:${issue.line}`);
          console.log(`  Text: "${issue.text}"`);

          if (results.suggestions.has(issue.text)) {
            const suggestion = results.suggestions.get(issue.text)!;
            Logger.info(`  Fix: ${suggestion.suggestedCode}`);
          }
        });
      }

      // Save output file
      if (options.output) {
        const output = {
          health: results.health,
          debt: results.debt,
          hardcoded: results.hardcoded,
          consistency: results.consistency,
          suggestions: Array.from(results.suggestions.values()),
        };

        fs.writeFileSync(options.output, JSON.stringify(output, null, 2));
        Logger.success(`Results saved to ${options.output}`);
      }

      // CI fail conditions
      if (config.minHealthScore && results.health.score < config.minHealthScore) {
        Logger.error(
          `Health score ${results.health.score} is below minimum ${config.minHealthScore}`
        );
        process.exit(1);
      }

      if (
        config.failOnHighSeverity &&
        results.hardcoded.some((i) => i.severity === 'high')
      ) {
        Logger.error('High severity issues found');
        process.exit(1);
      }

      Logger.success('Scan completed successfully ✅');

    } catch (error) {
      Logger.error(`Scan failed: ${(error as Error).message}`);
      process.exit(1);
    }
  });


// ⚠️ ALWAYS LAST
program.parse();