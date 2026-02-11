import * as core from '@actions/core';
import { LingoGuard } from '@lingoguard/cli';
import { GitHubClient } from './github-client';
import { CommentFormatter } from './comment-formatter';

async function run(): Promise<void> {
  try {
    // ✅ Get inputs
    const scanPath = core.getInput('scan-path') || './src';
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
    const results = await scanner.scan({
      scanPath,
      ignorePatterns,
      extensions: ['.js', '.jsx', '.ts', '.tsx'],
      generateFixes: !!openAiApiKey,
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
