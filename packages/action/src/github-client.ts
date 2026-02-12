import { Octokit } from '@octokit/rest';
import * as github from '@actions/github';
import { ScanResult, DetectedIssue, FixSuggestion } from '@lingoguard/cli';
import * as path from 'path';
import { execSync } from 'child_process';
import * as fs from 'fs';

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
    // 💡 Inline Review Suggestions (Safe Version)
    // --------------------------------------------------
 async createReviewComments(
  issues: DetectedIssue[],
  suggestions: Map<string, FixSuggestion>
) {
  const pr = this.context.payload.pull_request;
  if (!pr) return;

  const { owner, repo } = this.context.repo;

  const filesResponse = await this.octokit.pulls.listFiles({
    owner,
    repo,
    pull_number: pr.number,
  });

  const comments: any[] = [];

  for (const issue of issues) {
    if (issue.severity !== 'high') continue;

    const relativePath = this.toRelativePath(issue.file);

    const fileData = filesResponse.data.find(
      f => f.filename === relativePath
    );

    if (!fileData) continue;

    const suggestion = suggestions.get(issue.text);
    if (!suggestion) continue;

    // 🔥 IMPORTANT: use position instead of line
    comments.push({
      path: relativePath,
      position: fileData.patch
        ? fileData.patch.split('\n').length - 1
        : 1,
      body: `💡 Suggested Fix:

\`\`\`suggestion
${suggestion.suggestedCode.trim()}
\`\`\`
`
    });

    break;
  }

  if (comments.length === 0) {
    console.log('No inline comments created');
    return;
  }

  await this.octokit.pulls.createReview({
    owner,
    repo,
    pull_number: pr.number,
    commit_id: pr.head.sha,
    event: "COMMENT",
    comments
  });

  console.log('Inline review created successfully');
}



    // --------------------------------------------------
    // 🤖 Auto Fix Mode (Commit + Push)
    // --------------------------------------------------
    async applyAutoFixes(
        issues: DetectedIssue[],
        suggestions: Map<string, FixSuggestion>
    ) {
        const workspace = process.env.GITHUB_WORKSPACE;
        if (!workspace) return;

        let changed = false;

        for (const issue of issues) {
            const suggestion = suggestions.get(issue.text);
            if (!suggestion) continue;

            const filePath = issue.file;
            if (!fs.existsSync(filePath)) continue;

            let content = fs.readFileSync(filePath, 'utf-8');

            if (!content.includes(issue.text)) continue;

            // 🔥 Replace ALL occurrences safely
            content = content.replaceAll(issue.text, suggestion.suggestedCode);

            fs.writeFileSync(filePath, content);
            changed = true;
        }

        if (!changed) {
            console.log('No changes applied in auto-fix');
            return;
        }

        execSync('git config user.name "lingoguard-bot"');
        execSync('git config user.email "bot@lingoguard.dev"');

        execSync('git add .');

        try {
            execSync('git commit -m "🤖 LingoGuard Auto Fixes"');
            execSync('git push');
            console.log('Auto-fix committed and pushed');
        } catch {
            console.log('No commit created (possibly no changes)');
        }
    }

    // --------------------------------------------------
    // ✅ Create GitHub Check Run
    // --------------------------------------------------
    async createCheckRun(results: ScanResult): Promise<void> {
        const { owner, repo } = this.context.repo;
        const pullRequest = this.context.payload.pull_request;
        if (!pullRequest) return;

        const headSha = pullRequest.head.sha;

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
            annotations: annotations.slice(0, 50),
        });

        console.log('Created GitHub check run');
    }

    // --------------------------------------------------
    // 🔧 Convert absolute path → repo relative
    // --------------------------------------------------
    private toRelativePath(fullPath: string): string {
        const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
        return path.relative(workspace, fullPath).replace(/\\/g, '/');
    }
}
