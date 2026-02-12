import { Octokit } from '@octokit/rest';
import * as github from '@actions/github';
import { DetectedIssue, FixSuggestion, ScanResult } from '@lingoguard/cli';
import * as path from 'path';

type CheckAnnotation = {
  path: string;
  start_line: number;
  end_line: number;
  annotation_level: 'notice' | 'warning' | 'failure';
  message: string;
};

export class GitHubClient {
  private octokit: Octokit;
  private context = github.context;

  constructor(token: string) {
    this.octokit = new Octokit({ auth: token });
  }

  // --------------------------------------------------
  // 💬 Create or Update PR Comment
  // --------------------------------------------------
  async postComment(comment: string): Promise<void> {
    const { owner, repo } = this.context.repo;
    const prNumber = this.context.payload.pull_request?.number;

    if (!prNumber) {
      throw new Error('Not running inside a pull request context');
    }

    const comments = await this.octokit.issues.listComments({
      owner,
      repo,
      issue_number: prNumber,
    });

    const existing = comments.data.find((c) =>
      c.body?.includes('LingoGuard i18n Report')
    );

    if (existing) {
      await this.octokit.issues.updateComment({
        owner,
        repo,
        comment_id: existing.id,
        body: comment,
      });
      console.log('Updated existing LingoGuard comment');
    } else {
      await this.octokit.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body: comment,
      });
      console.log('Posted new LingoGuard comment');
    }
  }

  // --------------------------------------------------
  // ✅ Create Check Run with Inline Annotations
  // --------------------------------------------------
  async createCheckRun(results: ScanResult): Promise<void> {
    const { owner, repo } = this.context.repo;
    const pr = this.context.payload.pull_request;
    if (!pr) return;

    const headSha = pr.head.sha;

    const hasHighSeverity = results.hardcoded.some(
      (i) => i.severity === 'high'
    );

    const conclusion: 'success' | 'failure' =
      hasHighSeverity || results.health.score < 70
        ? 'failure'
        : 'success';

    const annotations: CheckAnnotation[] = results.hardcoded
      .filter((issue) => issue.line > 0)
      .map((issue) => ({
        path: this.toRelativePath(issue.file),
        start_line: issue.line,
        end_line: issue.line,
        annotation_level:
          issue.severity === 'high'
            ? 'failure'
            : issue.severity === 'medium'
            ? 'warning'
            : 'notice',
        message: `Hardcoded string "${issue.text}"`,
      }));

    await this.octokit.checks.create({
      owner,
      repo,
      name: 'LingoGuard',
      head_sha: headSha,
      status: 'completed',
      conclusion,
      output: {
        title: 'LingoGuard i18n Report',
        summary: `Health Score: ${results.health.score}/100`,
      },
      annotations: annotations.slice(0, 50), // GitHub limit
    });

    console.log('Created GitHub check run');
  }

  // --------------------------------------------------
  // 💡 Inline One-Click Suggestions
  // --------------------------------------------------
  async createReviewComments(
    issues: DetectedIssue[],
    suggestions: Map<string, FixSuggestion>
  ): Promise<void> {
    const pr = this.context.payload.pull_request;
    if (!pr) return;

    const { owner, repo } = this.context.repo;
    const commitId = pr.head.sha;

    const comments = issues
      .filter((i) => i.severity === 'high')
      .slice(0, 5)
      .map((issue) => {
        const suggestion = suggestions.get(issue.text);
        const relativePath = this.toRelativePath(issue.file);

        return {
          path: relativePath,
          line: issue.line,
          side: 'RIGHT',
          body: suggestion
            ? `💡 Suggested Fix

\`\`\`suggestion
${suggestion.suggestedCode.trim()}
\`\`\`
`
            : `🚨 Hardcoded string detected:

\`${issue.text}\``,
        };
      });

    if (comments.length === 0) return;

    await this.octokit.pulls.createReview({
      owner,
      repo,
      pull_number: pr.number,
      commit_id: commitId,
      event: 'COMMENT',
      comments,
    });

    console.log('Created inline review suggestions');
  }

  // --------------------------------------------------
  // 🔧 Convert absolute path → repo relative
  // --------------------------------------------------
  private toRelativePath(fullPath: string): string {
    return path
      .relative(process.env.GITHUB_WORKSPACE || process.cwd(), fullPath)
      .replace(/\\/g, '/');
  }
}
