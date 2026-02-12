import * as core from '@actions/core';
import { LingoGuard } from '@lingoguard/cli';
import { GitHubClient } from './github-client';
import { CommentFormatter } from './comment-formatter';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

core.info(`CWD: ${process.cwd()}`);
core.info(`Files in CWD: ${fs.readdirSync(process.cwd()).join(', ')}`);
core.info(`GITHUB_WORKSPACE: ${process.env.GITHUB_WORKSPACE}`);
core.info(`process.cwd(): ${process.cwd()}`);



async function getChangedFiles(): Promise<string[]> {
  try {
    const base = process.env.GITHUB_BASE_REF;
    if (!base) return [];

    const diff = execSync(
      `git diff --name-only origin/${base}...HEAD`,
      { encoding: 'utf-8' }
    );

    const files = diff
      .split('\n')
      .filter(f =>
        f.endsWith('.js') ||
        f.endsWith('.ts') ||
        f.endsWith('.jsx') ||
        f.endsWith('.tsx')
      )
      .filter(Boolean);

    return files;
  } catch {
    return [];
  }
}
async function run(): Promise<void> {
    try {
        // ✅ Get inputs
      const scanPath = core.getInput('scan-path') || process.env.GITHUB_WORKSPACE!;


        const ignorePatterns = core.getInput('ignore-patterns')?.split(',') || [];
        const githubToken = core.getInput('github-token', { required: true });
        const openAiApiKey = core.getInput('openai-api-key'); // 🔥 updated
        const minHealthScore = parseInt(core.getInput('min-health-score') || '70');
        const failOnHighSeverity = core.getInput('fail-on-high-severity') === 'true';

        core.info('🛡️  Starting LingoGuard scan...');

        // ✅ Initialize scanner with OpenAI
        const scanner = new LingoGuard({
            openAiKey: openAiApiKey || process.env.OPENAI_API_KEY,
        });

        // ✅ Run scan
      // 🔥 Detect changed files
const changedFiles = await getChangedFiles();

core.info(`Changed files detected: ${changedFiles.length}`);

const results = await scanner.scan({
    scanPath,
    ignorePatterns,
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
    generateFixes: !!openAiApiKey,
    filesOverride: changedFiles.length > 0 ? changedFiles : undefined,
});


        core.info(`✓ Scan complete. Health Score: ${results.health.score}/100`);

        // ✅ Format PR comment
        const formatter = new CommentFormatter();
        const comment = formatter.format(results);

        // ✅ Post to GitHub PR
        const githubClient = new GitHubClient(githubToken);
        await githubClient.postComment(comment);

        core.info('✓ Posted results to PR');

        // ✅ Set outputs
        core.setOutput('health-score', results.health.score);
        core.setOutput('issues-found', results.health.issuesFound);
        core.setOutput('results', JSON.stringify(results));

        // ✅ Determine check status
        let conclusion: 'success' | 'failure' | 'neutral' = 'success';
        let summary = `Health Score: ${results.health.score}/100`;

        if (results.health.score < minHealthScore) {
            conclusion = 'failure';
            summary += ` (below minimum ${minHealthScore})`;
            core.setFailed(summary);
        } else if (
            failOnHighSeverity &&
            results.hardcoded.some((i) => i.severity === 'high')
        ) {
            conclusion = 'failure';
            summary += ' - High severity issues found';
            core.setFailed(summary);
        }

        await githubClient.createCheckRun(results);


    } catch (error) {
        core.setFailed(`Action failed: ${(error as Error).message}`);
    }
}

run();
