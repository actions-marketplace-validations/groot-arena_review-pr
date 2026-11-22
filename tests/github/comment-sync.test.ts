import { describe, it, expect, vi } from 'vitest';
import { upsertStickyPrComment, type OctokitClient } from '../../src/github/comment-sync.js';

describe('comment-sync', () => {
  it('creates new comment when no existing report comment found', async () => {
    const listCommentsMock = vi.fn().mockResolvedValue({
      data: [{ id: 101, body: 'Some other bot comment' }],
    });
    const createCommentMock = vi.fn().mockResolvedValue({
      data: { id: 202 },
    });
    const updateCommentMock = vi.fn().mockResolvedValue({});

    const mockOctokit = {
      rest: {
        issues: {
          listComments: listCommentsMock,
          createComment: createCommentMock,
          updateComment: updateCommentMock,
        },
      },
    } as unknown as OctokitClient;

    const result = await upsertStickyPrComment({
      octokit: mockOctokit,
      owner: 'my-org',
      repo: 'my-repo',
      issueNumber: 42,
      reportId: 'default',
      body: '<!-- pr-verification-report:default -->\n### Verification Report',
    });

    expect(result.updated).toBe(false);
    expect(result.commentId).toBe(202);
    expect(createCommentMock).toHaveBeenCalledTimes(1);
    expect(updateCommentMock).not.toHaveBeenCalled();
  });

  it('updates existing comment when marker is present', async () => {
    const listCommentsMock = vi.fn().mockResolvedValue({
      data: [
        { id: 101, body: 'Other comment' },
        { id: 303, body: '<!-- pr-verification-report:backend -->\nOld content' },
      ],
    });
    const createCommentMock = vi.fn().mockResolvedValue({});
    const updateCommentMock = vi.fn().mockResolvedValue({});

    const mockOctokit = {
      rest: {
        issues: {
          listComments: listCommentsMock,
          createComment: createCommentMock,
          updateComment: updateCommentMock,
        },
      },
    } as unknown as OctokitClient;

    const result = await upsertStickyPrComment({
      octokit: mockOctokit,
      owner: 'my-org',
      repo: 'my-repo',
      issueNumber: 42,
      reportId: 'backend',
      body: '<!-- pr-verification-report:backend -->\nNew content',
    });

    expect(result.updated).toBe(true);
    expect(result.commentId).toBe(303);
    expect(updateCommentMock).toHaveBeenCalledWith({
      owner: 'my-org',
      repo: 'my-repo',
      comment_id: 303,
      body: '<!-- pr-verification-report:backend -->\nNew content',
    });
    expect(createCommentMock).not.toHaveBeenCalled();
  });
});
