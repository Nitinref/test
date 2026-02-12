import * as core from '@actions/core';
import { LingoGuard } from '@lingoguard/cli';
import { GitHubClient } from './github-client';
import { CommentFormatter } from './comment-formatter';
import { execSync } from 'child_process';
import * as github from '@actions/github';

async function getChangedFiles(): Promise<string[]> {
  try {
    const base = github.context.payload.pull_request?.base.ref;
    if (!base) return [];

    // Ensure base branch is fetched
    execSync(`git fetch origin ${base}`, { stdio: 'ignore' });

    const diff = execSync(
      `git diff --name-only origin/${base}...HEAD`,
      { encoding: 'utf-8' }
    );

    return diff
      .split('\n')
      .filter(f =>
        f.endsWith('.js') ||
        f.endsWith('.ts') ||
        f.endsWith('.jsx') ||
        f.endsWith('.tsx')
      )
      .filter(Boolean);

  } catch (error) {
    core.warning('Could not determine changed files.');
    return [];
  }
}

async function run(): Promise<void> {
  try {
    // ==============================
    // 🔹 Inputs
    // ==============================
    const scanPath =
      core.getInput('scan-path') || process.env.GITHUB_WORKSPACE!;

    const ignorePatterns =
      core.getInput('ignore-patterns')?.split(',') || [];

    const githubToken = core.getInput('github-token', { required: true });

    const openAiApiKey = core.getInput('openai-api-key');

    const minHealthScore = parseInt(
      core.getInput('min-health-score') || '70'
    );

    const failOnHighSeverity =
      core.getInput('fail-on-high-severity') === 'true';

    const autoFix =
      core.getInput('auto-fix') === 'true';

    core.info('🛡️ Starting LingoGuard scan...');

    // ==============================
    // 🔹 Initialize Scanner
    // ==============================
    const scanner = new LingoGuard({
      openAiKey: openAiApiKey || process.env.OPENAI_API_KEY,
    });

    // ==============================
    // 🔹 Detect Changed Files
    // ==============================
    const changedFiles = await getChangedFiles();
    core.info(`Changed files detected: ${changedFiles.length}`);

    // ==============================
    // 🔹 Run Scan
    // ==============================
    const results = await scanner.scan({
      scanPath,
      ignorePatterns,
      extensions: ['.js', '.jsx', '.ts', '.tsx'],
      generateFixes: !!openAiApiKey,
      filesOverride:
        changedFiles.length > 0 ? changedFiles : undefined,
    });

    core.info(
      `✓ Scan complete. Health Score: ${results.health.score}/100`
    );

    // ==============================
    // 🔹 Format PR Comment
    // ==============================
    const formatter = new CommentFormatter();
    const comment = formatter.format(results);

    const githubClient = new GitHubClient(githubToken);

    await githubClient.postComment(comment);
    core.info('✓ Posted results to PR');

    // ==============================
    // 🔹 Inline Suggestions
    // ==============================
    await githubClient.createReviewComments(
      results.hardcoded,
      results.suggestions
    );

    // ==============================
    // 🔹 Auto Fix Mode
    // ==============================
    if (autoFix && results.suggestions.size > 0) {
      core.info('🤖 Auto-fix enabled. Applying fixes...');
      await githubClient.applyAutoFixes(
        results.hardcoded,
        results.suggestions
      );
      core.info('✅ Auto-fixes committed and pushed.');
    }

    // ==============================
    // 🔹 Create Check Run
    // ==============================
    await githubClient.createCheckRun(results);

    // ==============================
    // 🔹 Outputs
    // ==============================
    core.setOutput('health-score', results.health.score);
    core.setOutput('issues-found', results.health.issuesFound);
    core.setOutput('results', JSON.stringify(results));

    // ==============================
    // 🔹 Final Failure Logic
    // ==============================
    if (results.health.score < minHealthScore) {
      core.setFailed(
        `Health Score ${results.health.score} below minimum ${minHealthScore}`
      );
    } else if (
      failOnHighSeverity &&
      results.hardcoded.some(i => i.severity === 'high')
    ) {
      core.setFailed('High severity issues found');
    }

  } catch (error) {
    core.setFailed(
      `Action failed: ${(error as Error).message}`
    );
  }
}

run();
