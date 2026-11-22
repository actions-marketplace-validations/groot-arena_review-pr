import type { OctokitClient } from './comment-sync.js';
import type { InlineReviewComment } from '../types/review.js';
import type { Finding } from '../types/reports.js';

export interface SyncReviewParams {
  octokit: OctokitClient;
  owner: string;
  repo: string;
  pullNumber: number;
  commitSha: string;
  inlineComments: InlineReviewComment[];
  currentFindings: Finding[];
}

export interface ReviewSyncResult {
  postedCount: number;
  skippedDuplicatesCount: number;
  resolvedThreadsCount: number;
}

export async function syncInlineReviews(params: SyncReviewParams): Promise<ReviewSyncResult> {
  const { octokit, owner, repo, pullNumber, commitSha, inlineComments, currentFindings } = params;

  let postedCount = 0;
  let skippedDuplicatesCount = 0;
  let resolvedThreadsCount = 0;

  // 1. Fetch existing review comments on the PR for deduplication
  let existingComments: Array<{ path?: string; line?: number; body?: string }> = [];
  try {
    const res = await octokit.rest.pulls.listReviewComments({
      owner,
      repo,
      pull_number: pullNumber,
      per_page: 100,
    });
    existingComments = res.data;
  } catch (err) {
    console.warn(`Warning: Could not list review comments for deduplication: ${String(err)}`);
  }

  // Helper to extract ruleId from body
  function extractRuleId(body: string | undefined): string | null {
    if (!body) return null;
    const match = body.match(/<!-- rule-id:(.+?) -->/);
    return match?.[1] ? match[1].trim() : null;
  }

  // Filter out duplicates
  const commentsToPost: Array<{ path: string; line: number; side: 'RIGHT'; body: string }> = [];

  for (const comment of inlineComments) {
    const isDuplicate = existingComments.some((existing) => {
      if (existing.path !== comment.path) return false;
      if (existing.line !== comment.line) return false;
      const existingRule = extractRuleId(existing.body);
      return existingRule === comment.ruleId;
    });

    if (isDuplicate) {
      skippedDuplicatesCount += 1;
    } else {
      commentsToPost.push({
        path: comment.path,
        line: comment.line,
        side: 'RIGHT',
        body: comment.body,
      });
    }
  }

  // 2. Post new review comments in a single PR review
  if (commentsToPost.length > 0) {
    try {
      await octokit.rest.pulls.createReview({
        owner,
        repo,
        pull_number: pullNumber,
        commit_id: commitSha,
        event: 'COMMENT',
        comments: commentsToPost,
      });
      postedCount = commentsToPost.length;
    } catch (err) {
      console.warn(`Warning: Bulk review creation failed, falling back to individual comments: ${String(err)}`);
      // Fallback: Post individually
      for (const c of commentsToPost) {
        try {
          await octokit.rest.pulls.createReviewComment({
            owner,
            repo,
            pull_number: pullNumber,
            commit_id: commitSha,
            path: c.path,
            line: c.line,
            side: c.side,
            body: c.body,
          });
          postedCount += 1;
        } catch (individualErr) {
          console.warn(`Warning: Failed to post inline comment on ${c.path}:${c.line}: ${String(individualErr)}`);
        }
      }
    }
  }

  // 3. Auto-resolve fixed threads via GraphQL
  try {
    resolvedThreadsCount = await autoResolveFixedThreads({
      octokit,
      owner,
      repo,
      pullNumber,
      currentFindings,
    });
  } catch (err) {
    console.warn(`Warning: Failed to auto-resolve review threads: ${String(err)}`);
  }

  return {
    postedCount,
    skippedDuplicatesCount,
    resolvedThreadsCount,
  };
}

interface ThreadNode {
  id: string;
  isResolved: boolean;
  comments: {
    nodes: Array<{
      id: string;
      body: string;
      path: string;
      line: number | null;
      author?: { login?: string };
    }>;
  };
}

interface GraphQLThreadsResponse {
  repository?: {
    pullRequest?: {
      reviewThreads?: {
        nodes?: ThreadNode[];
      };
    };
  };
}

async function autoResolveFixedThreads(params: {
  octokit: OctokitClient;
  owner: string;
  repo: string;
  pullNumber: number;
  currentFindings: Finding[];
}): Promise<number> {
  const { octokit, owner, repo, pullNumber, currentFindings } = params;

  const query = `
    query($owner: String!, $repo: String!, $pullNumber: Int!) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $pullNumber) {
          reviewThreads(first: 100) {
            nodes {
              id
              isResolved
              comments(first: 1) {
                nodes {
                  id
                  body
                  path
                  line
                  author {
                    login
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  const data = (await octokit.graphql(query, {
    owner,
    repo,
    pullNumber,
  })) as GraphQLThreadsResponse;

  const threads = data.repository?.pullRequest?.reviewThreads?.nodes || [];
  let resolvedCount = 0;

  // Active findings set: "file:line:ruleId"
  const activeFindingsSet = new Set(
    currentFindings.map((f) => `${f.file}:${f.startLine}:${f.ruleId}`)
  );

  for (const thread of threads) {
    if (thread.isResolved) continue;

    const firstComment = thread.comments?.nodes?.[0];
    if (!firstComment?.body) continue;

    const match = firstComment.body.match(/<!-- rule-id:(.+?) -->/);
    if (!match?.[1]) continue;

    const ruleId = match[1].trim();
    const commentPath = firstComment.path;
    const commentLine = firstComment.line || 1;

    const findingKey = `${commentPath}:${commentLine}:${ruleId}`;

    if (!activeFindingsSet.has(findingKey)) {
      // Finding is resolved!
      const mutation = `
        mutation($threadId: ID!) {
          resolveReviewThread(input: { threadId: $threadId }) {
            thread {
              id
              isResolved
            }
          }
        }
      `;

      try {
        await octokit.graphql(mutation, { threadId: thread.id });
        resolvedCount += 1;
      } catch (mutationErr) {
        console.warn(`Warning: Failed to resolve thread ${thread.id}: ${String(mutationErr)}`);
      }
    }
  }

  return resolvedCount;
}
