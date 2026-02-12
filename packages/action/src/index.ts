import * as core from '@actions/core';
import { LingoGuard } from '@lingoguard/cli';
import { GitHubClient } from './github-client';
import { CommentFormatter } from './comment-formatter';
import { execSync } from 'child_process';
import * as github from '@actions/github';

async function getChangedFiles(baseRef: string): Promise<string[]> {
  try {
    execSync(`git fetch origin ${baseRef}`, { stdio: 'ignore' });

    const diff = execSync(
      `git diff --name-only origin/${baseRef}...HEAD`,
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

async function run(): Promise<void> {
  try {
    const context = github.context;
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

    let autoFix = core.getInput('auto-fix') === 'true';
    let baseRef: string | undefined;
    let headRef: string | undefined;

    // ==========================================
    // 🔥 HANDLE SLASH COMMAND
    // ==========================================
    if (context.eventName === 'issue_comment') {

      const body = context.payload.comment?.body;

      if (!body?.includes('/lingoguard fix')) {
        core.info('Not a LingoGuard command. Skipping.');
        return;
      }

      if (!context.payload.issue?.pull_request) {
        core.info('Comment is not on a PR. Skipping.');
        return;
      }

      autoFix = true;

      const octokit = github.getOctokit(githubToken);
      const { owner, repo } = context.repo;
      const pull_number = context.payload.issue.number;

      const pr = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number,
      });

      baseRef = pr.data.base.ref;
      headRef = pr.data.head.ref;

      core.info(`Checking out PR branch: ${headRef}`);

      execSync(`git fetch origin ${headRef}`, { stdio: 'inherit' });
      execSync(`git checkout ${headRef}`, { stdio: 'inherit' });

    }

    // ==========================================
    // 🔥 NORMAL PR EVENT
    // ==========================================
    if (context.payload.pull_request) {
      baseRef = context.payload.pull_request.base.ref;
    }

    if (!baseRef) {
      core.warning('No base branch detected.');
      return;
    }

    core.info('🛡️ Starting LingoGuard scan...');

    const scanner = new LingoGuard({
      openAiKey: openAiApiKey || process.env.OPENAI_API_KEY,
    });

    const changedFiles = await getChangedFiles(baseRef);
    core.info(`Changed files detected: ${changedFiles.length}`);

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

    const formatter = new CommentFormatter();
    const comment = formatter.format(results);

    await githubClient.postComment(comment);
    await githubClient.createReviewComments(
      results.hardcoded,
      results.suggestions
    );

    // ==========================================
    // 🤖 AUTO FIX ENGINE
    // ==========================================
    if (autoFix && results.suggestions.size > 0) {
      core.info('🤖 Auto-fix enabled. Applying fixes...');
      await githubClient.applyAutoFixes(
        results.hardcoded,
        results.suggestions
      );
      core.info('✅ Auto-fixes committed and pushed.');
    }

    await githubClient.createCheckRun(results);

    core.setOutput('health-score', results.health.score);
    core.setOutput('issues-found', results.health.issuesFound);
    core.setOutput('results', JSON.stringify(results));

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
