import { describe, it, expect, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  InlineReviewCommentSchema,
  ReviewThreadSchema,
  FormattedReviewResultSchema,
} from '../src/types/review.js';
import {
  getGitDiffFromRepo,
  getRecentGitCommits,
} from '../src/parsers/git-diff.js';
import { loadImpactConfig } from '../src/impact-engine.js';
import { parseCoverage } from '../src/parsers/coverage.js';
import { parseJUnitXml } from '../src/parsers/junit.js';
import { parseSarifOrRdjson } from '../src/parsers/sarif.js';
import { upsertStickyPrComment, type OctokitClient } from '../src/github/comment-sync.js';
import { syncInlineReviews } from '../src/github/review-sync.js';
import { renderPrSummary } from '../src/formatters/pr-summary-renderer.js';

describe('coverage boost & edge cases', () => {
  it('validates review types schemas', () => {
    const inlineComment = InlineReviewCommentSchema.parse({
      path: 'src/index.ts',
      line: 10,
      body: 'test comment',
      ruleId: 'test-rule',
      severity: 'error',
    });
    expect(inlineComment.side).toBe('RIGHT');

    const formatted = FormattedReviewResultSchema.parse({
      inlineComments: [inlineComment],
      overflowFindings: [],
      infoFindings: [],
      totalEligible: 1,
    });
    expect(formatted.totalEligible).toBe(1);

    const thread = ReviewThreadSchema.parse({
      id: 'thread-1',
      isResolved: false,
      comments: {
        nodes: [
          {
            id: 'c-1',
            body: 'comment',
            path: 'src/index.ts',
            line: 10,
            author: { login: 'bot' },
          },
        ],
      },
    });
    expect(thread.id).toBe('thread-1');
  });

  it('tests git helpers with mock or local git repo', () => {
    // Current workspace is a git repo
    const diff = getGitDiffFromRepo('HEAD', 'HEAD');
    expect(typeof diff).toBe('string');

    const commits = getRecentGitCommits('HEAD~1', 'HEAD');
    expect(Array.isArray(commits)).toBe(true);

    // Test with invalid ref to trigger catch blocks
    const emptyDiff = getGitDiffFromRepo('non-existent-ref-xyz', 'HEAD');
    expect(typeof emptyDiff).toBe('string');

    const emptyCommits = getRecentGitCommits('non-existent-ref-xyz', 'HEAD');
    expect(emptyCommits).toEqual([]);
  });

  it('tests impact-engine override loading and error handling', () => {
    // 1. Non-existent override
    const config1 = loadImpactConfig('non-existent-file-xyz.json');
    expect(config1.rules.length).toBeGreaterThan(0);

    // 2. Valid override file
    const tmpOverride = path.resolve('tests/fixtures/tmp-override.json');
    fs.writeFileSync(
      tmpOverride,
      JSON.stringify({
        rules: [
          {
            id: 'docker-infra', // override existing
            name: 'Overridden Docker Infra',
            patterns: ['Dockerfile*'],
            checklist: ['Custom check'],
          },
          {
            id: 'brand-new-rule', // append new
            name: 'Brand New Rule',
            patterns: ['**/secrets/**'],
            checklist: ['Check secrets leak'],
          },
        ],
      })
    );

    const config2 = loadImpactConfig(tmpOverride);
    const dockerRule = config2.rules.find((r) => r.id === 'docker-infra');
    expect(dockerRule?.name).toBe('Overridden Docker Infra');
    const newRule = config2.rules.find((r) => r.id === 'brand-new-rule');
    expect(newRule).toBeDefined();

    // 3. Invalid override file (malformed JSON or invalid schema)
    const invalidOverride = path.resolve('tests/fixtures/invalid-override.json');
    fs.writeFileSync(invalidOverride, '{ "rules": [ { "id": "" } ] }');
    expect(() => loadImpactConfig(invalidOverride)).toThrow();

    // Clean up
    fs.unlinkSync(tmpOverride);
    fs.unlinkSync(invalidOverride);
  });

  it('tests coverage parser for JaCoCo XML and empty inputs', () => {
    expect(parseCoverage('')).toEqual({
      overall: { linesTotal: 0, linesCovered: 0, percentage: 100 },
      diffCoverage: { linesTotal: 0, linesCovered: 0, percentage: 100 },
      uncoveredDiffLines: [],
      directoryBreakdown: [],
    });

    const jacocoXml = `<?xml version="1.0" encoding="UTF-8"?>
    <report name="App">
      <package name="com/example">
        <sourcefile name="App.java">
          <line nr="1" mi="0" ci="1"/>
          <line nr="2" mi="1" ci="0"/>
          <line nr="3" mi="0" ci="2"/>
        </sourcefile>
      </package>
    </report>`;

    const changed = new Map<string, Set<number>>();
    changed.set('com/example/App.java', new Set([1, 2]));

    const report = parseCoverage(jacocoXml, changed);
    expect(report.overall.linesTotal).toBe(3);
    expect(report.overall.linesCovered).toBe(2);
    expect(report.diffCoverage.linesTotal).toBe(2);
    expect(report.diffCoverage.linesCovered).toBe(1);
    expect(report.uncoveredDiffLines[0]?.ranges).toEqual(['L2']);
  });

  it('tests junit parser with nested testsuites and error tags', () => {
    const junitWithErrors = `<?xml version="1.0"?>
    <testsuites>
      <testsuite name="RootSuite" time="2.0">
        <testsuite name="SubSuite" time="1.0">
          <testcase name="testThrows" classname="ErrorClass" file="src/error.ts">
            <error message="Fatal crash">Crash details</error>
          </testcase>
          <testcase name="testSkipped">
            <skipped/>
          </testcase>
        </testsuite>
      </testsuite>
    </testsuites>`;

    const res = parseJUnitXml(junitWithErrors);
    expect(res.total).toBe(2);
    expect(res.errors).toBe(1);
    expect(res.skipped).toBe(1);
    expect(res.failed).toBe(0);
    expect(res.failures[0]?.file).toBe('src/error.ts');
  });

  it('tests sarif parser with empty or invalid JSON', () => {
    expect(parseSarifOrRdjson('')).toEqual({
      counts: { critical: 0, error: 0, warning: 0, info: 0, total: 0 },
      findings: [],
    });

    expect(() => parseSarifOrRdjson('{ invalid json')).toThrow();
  });

  it('tests comment-sync error handling', async () => {
    const mockOctokit = {
      rest: {
        issues: {
          listComments: vi.fn().mockRejectedValue(new Error('Network error')),
        },
      },
    } as unknown as OctokitClient;

    await expect(
      upsertStickyPrComment({
        octokit: mockOctokit,
        owner: 'o',
        repo: 'r',
        issueNumber: 1,
        reportId: 'id',
        body: 'msg',
      })
    ).rejects.toThrow('Failed to upsert sticky PR comment');
  });

  it('tests review-sync individual comments fallback', async () => {
    const listReviewCommentsMock = vi.fn().mockResolvedValue({ data: [] });
    const createReviewMock = vi.fn().mockRejectedValue(new Error('Bulk review rejected'));
    const createReviewCommentMock = vi.fn().mockResolvedValue({});
    const graphqlMock = vi.fn().mockResolvedValue({
      repository: { pullRequest: { reviewThreads: { nodes: [] } } },
    });

    const mockOctokit = {
      rest: {
        pulls: {
          listReviewComments: listReviewCommentsMock,
          createReview: createReviewMock,
          createReviewComment: createReviewCommentMock,
        },
      },
      graphql: graphqlMock,
    } as unknown as OctokitClient;

    const result = await syncInlineReviews({
      octokit: mockOctokit,
      owner: 'o',
      repo: 'r',
      pullNumber: 1,
      commitSha: 'sha',
      inlineComments: [
        {
          path: 'src/file.ts',
          line: 5,
          side: 'RIGHT',
          body: 'body <!-- rule-id:r1 -->',
          ruleId: 'r1',
          severity: 'error',
        },
      ],
      currentFindings: [],
    });

    expect(result.postedCount).toBe(1);
    expect(createReviewCommentMock).toHaveBeenCalledTimes(1);
  });

  it('renders summary with warnings, skipped gates, and large directory lists', () => {
    const summary = renderPrSummary({
      reportId: 'warn-test',
      coverageThreshold: 80,
      diffCoverageThreshold: 80,
      diffStats: {
        filesChanged: 1,
        additions: 5,
        deletions: 1,
        size: 'XS',
        changedFiles: [{ path: 'a.ts', additions: 5, deletions: 1, category: 'Source Code' }],
        commits: [],
      },
      sarifReport: {
        counts: { critical: 0, error: 0, warning: 2, info: 1, total: 3 },
        findings: [],
      },
      gateResults: {
        gates: [
          { name: 'sonar', command: '', status: 'skipped', duration: 0 },
        ],
      },
      overflowFindings: [
        {
          id: 'of1',
          ruleId: 'over-rule',
          severity: 'warning',
          category: 'Maintainability',
          message: 'overflow finding message',
          file: 'src/a.ts',
          startLine: 10,
          tool: 'Tool',
        },
      ],
      matchedImpacts: [],
      checklistItems: [],
    });

    expect(summary).toContain('### 🟡 Verification Passed with Warnings');
    expect(summary).toContain('⏭️ Skipped');
    expect(summary).toContain('Static Analysis Overflow Findings');
  });
});
