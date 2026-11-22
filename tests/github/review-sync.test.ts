import { describe, it, expect, vi } from 'vitest';
import { syncInlineReviews } from '../../src/github/review-sync.js';
import type { OctokitClient } from '../../src/github/comment-sync.js';
import type { InlineReviewComment } from '../../src/types/review.js';
import type { Finding } from '../../src/types/reports.js';

describe('review-sync', () => {
  it('deduplicates comments and resolves fixed threads', async () => {
    const listReviewCommentsMock = vi.fn().mockResolvedValue({
      data: [
        {
          path: 'src/app.ts',
          line: 10,
          body: 'Some review\n<!-- rule-id:existing-rule -->',
        },
      ],
    });

    const createReviewMock = vi.fn().mockResolvedValue({});

    // GraphQL mock: 1 unresolved thread with old-rule on src/app.ts:20
    const graphqlMock = vi.fn().mockImplementation((query: string) => {
      if (query.includes('reviewThreads')) {
        return Promise.resolve({
          repository: {
            pullRequest: {
              reviewThreads: {
                nodes: [
                  {
                    id: 'THREAD_1',
                    isResolved: false,
                    comments: {
                      nodes: [
                        {
                          id: 'COMMENT_1',
                          path: 'src/app.ts',
                          line: 20,
                          body: 'Old issue\n<!-- rule-id:resolved-rule -->',
                          author: { login: 'github-actions[bot]' },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          },
        });
      }
      if (query.includes('resolveReviewThread')) {
        return Promise.resolve({
          resolveReviewThread: { thread: { id: 'THREAD_1', isResolved: true } },
        });
      }
      return Promise.resolve({});
    });

    const mockOctokit = {
      rest: {
        pulls: {
          listReviewComments: listReviewCommentsMock,
          createReview: createReviewMock,
        },
      },
      graphql: graphqlMock,
    } as unknown as OctokitClient;

    const inlineComments: InlineReviewComment[] = [
      {
        path: 'src/app.ts',
        line: 10,
        side: 'RIGHT',
        body: 'New comment on existing rule\n<!-- rule-id:existing-rule -->',
        ruleId: 'existing-rule',
        severity: 'warning',
      },
      {
        path: 'src/app.ts',
        line: 15,
        side: 'RIGHT',
        body: 'Brand new finding\n<!-- rule-id:new-rule -->',
        ruleId: 'new-rule',
        severity: 'error',
      },
    ];

    const currentFindings: Finding[] = [
      {
        id: 'f1',
        ruleId: 'existing-rule',
        file: 'src/app.ts',
        startLine: 10,
        severity: 'warning',
        category: 'Reliability',
        message: 'Existing issue',
        tool: 'Tool',
      },
      {
        id: 'f2',
        ruleId: 'new-rule',
        file: 'src/app.ts',
        startLine: 15,
        severity: 'error',
        category: 'Reliability',
        message: 'New issue',
        tool: 'Tool',
      },
      // Notice: resolved-rule is NOT in currentFindings!
    ];

    const result = await syncInlineReviews({
      octokit: mockOctokit,
      owner: 'my-org',
      repo: 'my-repo',
      pullNumber: 7,
      commitSha: 'sha123',
      inlineComments,
      currentFindings,
    });

    // 1 duplicate skipped (existing-rule on line 10)
    expect(result.skippedDuplicatesCount).toBe(1);
    // 1 new comment posted (new-rule on line 15)
    expect(result.postedCount).toBe(1);
    expect(createReviewMock).toHaveBeenCalledTimes(1);

    // 1 thread auto-resolved
    expect(result.resolvedThreadsCount).toBe(1);
  });
});
