import type { getOctokit } from '@actions/github';

export type OctokitClient = ReturnType<typeof getOctokit>;

export interface CommentSyncParams {
  octokit: OctokitClient;
  owner: string;
  repo: string;
  issueNumber: number;
  reportId: string;
  body: string;
}

export async function upsertStickyPrComment(params: CommentSyncParams): Promise<{ commentId: number; updated: boolean }> {
  const { octokit, owner, repo, issueNumber, reportId, body } = params;
  const marker = `<!-- pr-verification-report:${reportId} -->`;

  try {
    const { data: comments } = await octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: issueNumber,
      per_page: 100,
    });

    const existingComment = comments.find((c) => c.body && c.body.includes(marker));

    if (existingComment) {
      await octokit.rest.issues.updateComment({
        owner,
        repo,
        comment_id: existingComment.id,
        body,
      });
      return { commentId: existingComment.id, updated: true };
    } else {
      const { data: newComment } = await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: issueNumber,
        body,
      });
      return { commentId: newComment.id, updated: false };
    }
  } catch (err) {
    throw new Error(`Failed to upsert sticky PR comment: ${String(err)}`);
  }
}
