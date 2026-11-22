import { describe, it, expect } from 'vitest';
import { renderPrSummary } from '../../src/formatters/pr-summary-renderer.js';
import type {
  DiffStats,
  TestResult,
  CoverageReport,
  SarifReport,
  GateResultsReport,
} from '../../src/types/reports.js';

describe('pr-summary-renderer', () => {
  const dummyDiffStats: DiffStats = {
    filesChanged: 3,
    additions: 120,
    deletions: 15,
    size: 'M',
    changedFiles: [
      { path: 'src/services/auth.ts', additions: 100, deletions: 10, category: 'Source Code' },
      { path: 'Dockerfile', additions: 10, deletions: 0, category: 'Infrastructure / CI' },
      { path: 'tests/auth.test.ts', additions: 10, deletions: 5, category: 'Tests' },
    ],
    commits: [
      { hash: 'abcdef1234567890', author: 'Jane Doe', message: 'feat: add jwt auth' },
    ],
  };

  it('renders green verdict report when all gates, tests, and coverage thresholds pass', () => {
    const testResult: TestResult = {
      total: 10,
      passed: 10,
      failed: 0,
      skipped: 0,
      errors: 0,
      duration: 2.1,
      failures: [],
    };

    const coverageReport: CoverageReport = {
      overall: { linesTotal: 100, linesCovered: 90, percentage: 90 },
      diffCoverage: { linesTotal: 40, linesCovered: 36, percentage: 90 },
      uncoveredDiffLines: [],
      directoryBreakdown: [
        { directory: 'src/services', linesTotal: 80, linesCovered: 72, percentage: 90 },
      ],
    };

    const gateResults: GateResultsReport = {
      gates: [
        { name: 'typecheck', command: 'npm run typecheck', status: 'passed', duration: 1.5, metrics: '0 errors' },
        { name: 'lint-and-sast', command: 'eslint .', status: 'passed', duration: 3.2, metrics: '0 issues' },
        { name: 'test-and-coverage', command: 'vitest run', status: 'passed', duration: 2.1, metrics: '10/10 passed' },
        { name: 'build', command: 'npm run build', status: 'passed', duration: 4.0 },
      ],
    };

    const markdown = renderPrSummary({
      reportId: 'backend',
      repoName: 'my-org/backend-app',
      headRef: 'feat/auth',
      baseRef: 'main',
      commitSha: 'abcdef1234567890',
      runId: '987654321',
      coverageThreshold: 80,
      diffCoverageThreshold: 80,
      diffStats: dummyDiffStats,
      testResult,
      coverageReport,
      gateResults,
      matchedImpacts: [],
      checklistItems: [],
    });

    expect(markdown).toContain('<!-- pr-verification-report:backend -->');
    expect(markdown).toContain('### 🟢 Verification Passed');
    expect(markdown).not.toContain('[!CAUTION]');
    expect(markdown).toContain('**Diff Coverage:** ✅ **90%**');
    expect(markdown).toContain('**Overall Coverage:** ✅ **90%**');
    expect(markdown).toContain('**typecheck**');
    expect(markdown).toContain('✅ Passed');
  });

  it('renders CAUTION block and red verdict when gates or coverage threshold fail', () => {
    const testResult: TestResult = {
      total: 5,
      passed: 4,
      failed: 1,
      skipped: 0,
      errors: 0,
      duration: 1.2,
      failures: [
        {
          name: 'should login',
          classname: 'AuthTest',
          message: 'Expected 200 got 401',
          snippet: 'Error: Expected 200 got 401\n    at auth.test.ts:25',
        },
      ],
    };

    const coverageReport: CoverageReport = {
      overall: { linesTotal: 100, linesCovered: 60, percentage: 60 },
      diffCoverage: { linesTotal: 50, linesCovered: 30, percentage: 60 },
      uncoveredDiffLines: [
        { file: 'src/services/auth.ts', ranges: ['L42-L49', 'L55'] },
      ],
      directoryBreakdown: [],
    };

    const sarifReport: SarifReport = {
      counts: { critical: 1, error: 0, warning: 1, info: 0, total: 2 },
      findings: [
        {
          id: 'f-sec',
          ruleId: 'no-eval',
          category: 'Security',
          severity: 'critical',
          message: 'eval detected',
          file: 'src/services/auth.ts',
          startLine: 12,
          tool: 'ESLint',
        },
      ],
    };

    const markdown = renderPrSummary({
      reportId: 'default',
      coverageThreshold: 80,
      diffCoverageThreshold: 80,
      diffStats: dummyDiffStats,
      testResult,
      coverageReport,
      sarifReport,
      matchedImpacts: [
        {
          rule: {
            id: 'auth-security',
            name: 'Authentication & Security',
            patterns: ['**/auth/**'],
            checklist: ['Verify session expiration'],
          },
          matchedFiles: ['src/services/auth.ts'],
        },
      ],
      checklistItems: ['Verify session expiration'],
    });

    expect(markdown).toContain('<!-- pr-verification-report:default -->');
    expect(markdown).toContain('### 🔴 Verification Failed');
    expect(markdown).toContain('> [!CAUTION]');
    expect(markdown).toContain('Diff coverage (**60%**) is below required **80%** threshold (-20.0%).');
    expect(markdown).toContain('**1** failing test case(s) detected.');
    expect(markdown).toContain('Static analysis found **1 critical**');
    expect(markdown).toContain('`src/services/auth.ts`: L42-L49, L55');
    expect(markdown).toContain('Verify session expiration');
  });
});
