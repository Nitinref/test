

import { Command } from 'commander';
import { LingoGuard } from './index';
import { loadConfig } from './utils/config-loader';
import { Logger } from './utils/logger';
import * as fs from 'fs';
import * as path from 'path';

const program = new Command();

program
  .name('lingoguard')
  .description('Catch hardcoded strings and i18n violations before merge')
  .version('1.0.0');

program
  .command('scan')
  .description('Scan project for i18n issues')
  .option('-p, --path <path>', 'Path to scan', './src')
  .option('-o, --output <file>', 'Output results to JSON file')
  .option('--no-fixes', 'Disable AI fix suggestions')
  .option('--openai-key <key>', 'OpenAI API key')
  .option('--anthropic-key <key>', 'Anthropic API key for AI suggestions')
  .action(async (options) => {
    try {
      Logger.header('🛡️  LingoGuard - i18n Quality Scanner');

      // Load config
      const config = loadConfig();

      // Initialize scanner
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

      // Display results
      console.log('\n');
      Logger.header('📊 Results');
      
      Logger.result('Health Score', `${results.health.score}/100 (${results.health.grade})`, 
        results.health.score >= 80 ? 'green' : results.health.score >= 60 ? 'yellow' : 'red');
      
      Logger.result('Total Issues', results.health.issuesFound,
        results.health.issuesFound === 0 ? 'green' : 'red');
      
      Logger.result('Hardcoded Strings', results.hardcoded.length, 'red');
      Logger.result('Consistency Issues', results.consistency.length, 'yellow');
      Logger.result('Clean Files', `${results.health.cleanFiles}/${results.health.totalFiles}`, 'green');

      console.log('\n');
      Logger.header('⏱️  Lingo Debt');
      Logger.result('Debt Level', results.debt.level.toUpperCase(),
        results.debt.level === 'low' ? 'green' : results.debt.level === 'medium' ? 'yellow' : 'red');
      Logger.result('Estimated Fix Time', `${results.debt.estimatedFixTimeHours} hours`, 'yellow');

      // Show top problematic files
      if (results.debt.topFiles.length > 0) {
        console.log('\n');
        Logger.header('🔥 Top Problematic Files');
        results.debt.topFiles.slice(0, 5).forEach((file, i) => {
          console.log(
            `${i + 1}. ${path.basename(file.file)} - ${file.issueCount} issues (${file.estimatedMinutes}min)`
          );
        });
      }

      // Show sample issues
      if (results.hardcoded.length > 0) {
        console.log('\n');
        Logger.header('❌ Sample Issues (First 5)');
        results.hardcoded.slice(0, 5).forEach((issue) => {
          console.log(`\n${path.basename(issue.file)}:${issue.line}`);
          console.log(`  Text: "${issue.text}"`);
          
          if (results.suggestions.has(issue.text)) {
            const suggestion = results.suggestions.get(issue.text)!;
            Logger.info(`  Fix: ${suggestion.suggestedCode}`);
          }
        });
      }

      // Save to file if requested
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

      // Exit code based on health score
      if (config.minHealthScore && results.health.score < config.minHealthScore) {
        Logger.error(`Health score ${results.health.score} is below minimum ${config.minHealthScore}`);
        process.exit(1);
      }

      if (config.failOnHighSeverity && results.hardcoded.some(i => i.severity === 'high')) {
        Logger.error('High severity issues found');
        process.exit(1);
      }

    } catch (error) {
      Logger.error(`Scan failed: ${(error as Error).message}`);
      process.exit(1);
    }
  });

program
  .command('init')
  .description('Create .lingoguardrc.json config file')
  .action(() => {
    const config = {
      scanPath: './src',
      ignorePatterns: [
        '**/node_modules/**',
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/*.spec.ts',
        '**/*.spec.tsx',
        '**/dist/**',
        '**/build/**',
      ],
      extensions: ['.js', '.jsx', '.ts', '.tsx'],
      minHealthScore: 70,
      failOnHighSeverity: true,
      generateFixes: true,
    };

    fs.writeFileSync('.lingoguardrc.json', JSON.stringify(config, null, 2));
    Logger.success('Created .lingoguardrc.json');
  });

program.parse();