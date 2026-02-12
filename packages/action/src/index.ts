import * as core from '@actions/core';
import { LingoGuard } from '@lingoguard/cli';
import { GitHubClient } from './github-client';
import { CommentFormatter } from './comment-formatter';
import { execSync } from 'child_process';
import * as github from '@actions/github';

// ==========================================
// 🔍 Detect Changed Files (PR-safe version)
// ==========================================
async function getChangedFiles(): Promise<string[]> {
  try {
    const base =
      process.env.PR_BASE_REF ||
      github.context.payload.pull_request?.base.ref;

    if (!base) {
      core.info('No base branch detected.');
      return [];
    }

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

  } catch {
    core.warning('Could not determine changed files.');
    return [];
  }
}

// ==========================================
// 🚀 Main Runner
// ==========================================
async function run(): Promise<void> {
  try {
    const context = github.context;

    // ==============================
    // 🔹 Inputs
    // ==============================
    let autoFix = core.getInput('auto-fix') === 'true';
    const githubToken = core.getInput('github-token', { required: true });
    const openAiApiKey = core.getInput('openai-api-key');

    const scanPath =
      core.getInput('scan-path') || process.env.GITHUB_WORKSPACE!;

    const ignorePatterns =
      core.getInput('ignore-patterns')?.split(',') || [];

    const minHealthScore =
      parseInt(core.getInput('min-health-score') || '70');

    const failOnHighSeverity =
      core.getInput('fail-on-high-severity') === 'true';

    // ======================================
    // 🔥 Slash Command Support (REAL FIX)
    // ======================================
    if (context.eventName === 'issue_comment') {

      const body = context.payload.comment?.body;

      if (!body?.includes('/lingoguard fix')) {
        core.info('Not LingoGuard command. Skipping.');
        return;
      }

      if (!context.payload.issue?.pull_request) {
        core.info('Comment is not on a PR. Skipping.');
        return;
      }

      core.info('Slash command detected.');

      autoFix = true;

      // 🔥 Load PR data manually
      const octokit = github.getOctokit(githubToken);

      const { owner, repo } = context.repo;
      const pull_number = context.payload.issue.number;

      const pr = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number,
      });

      process.env.PR_BASE_REF = pr.data.base.ref;

      core.info(`Loaded PR base branch: ${pr.data.base.ref}`);
    }

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

    const githubClient = new GitHubClient(githubToken);

    // ==============================
    // 🔹 PR Comment
    // ==============================
    const formatter = new CommentFormatter();
    const comment = formatter.format(results);

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
    // 🔹 Failure Logic
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
