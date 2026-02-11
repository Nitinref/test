import { Octokit } from '@octokit/rest';
import * as github from '@actions/github';
import { ScanResult } from '@lingoguard/cli';
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
  // 💬 Post or Update PR Comment
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
  // ✅ Create GitHub Check Run (Inline Annotations)
  // --------------------------------------------------
  async createCheckRun(results: ScanResult): Promise<void> {
    const { owner, repo } = this.context.repo;
    const pullRequest = this.context.payload.pull_request;

    if (!pullRequest) return;

    const headSha = pullRequest.head.sha;

    // 🔥 Fail if high severity OR health score < 70
    const hasHighSeverity = results.hardcoded.some(
      (i) => i.severity === 'high'
    );

    const conclusion: 'success' | 'failure' =
      hasHighSeverity || results.health.score < 70
        ? 'failure'
        : 'success';

    // Build safe annotations (max 50 allowed per request)
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
      annotations: annotations.slice(0, 50),
    });

    console.log('Created GitHub check run');
  }

  // --------------------------------------------------
  // 🔧 Convert absolute path → repo relative
  // --------------------------------------------------
  private toRelativePath(fullPath: string): string {
    return path.relative(process.cwd(), fullPath).replace(/\\/g, '/');
  }
}
