import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

describe('End-to-End Consumer Verification Flow', () => {
  const e2eDir = path.resolve('tests/e2e/workspace');
  const distPostReview = path.resolve('dist/post-inline-review.js');
  const distPrSummary = path.resolve('dist/pr-summary.js');

  beforeAll(() => {
    // 1. Clean up & initialize consumer repo
    if (fs.existsSync(e2eDir)) {
      fs.rmSync(e2eDir, { recursive: true, force: true });
    }
    fs.mkdirSync(e2eDir, { recursive: true });

    // Initialize git
    execSync('git init -b main', { cwd: e2eDir });
    execSync('git config user.name "Test Developer"', { cwd: e2eDir });
    execSync('git config user.email "dev@example.com"', { cwd: e2eDir });

    // Create base files on main
    fs.mkdirSync(path.join(e2eDir, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(e2eDir, 'src/math.ts'),
      `export function add(a: number, b: number): number {\n  return a + b;\n}\n`
    );
    fs.writeFileSync(
      path.join(e2eDir, 'src/auth.ts'),
      `export function login(user: string): boolean {\n  return user === 'admin';\n}\n`
    );

    execSync('git add . && git commit -m "chore: initial commit on main"', { cwd: e2eDir });

    // 2. Create feature branch (simulating PR branch)
    execSync('git checkout -b feat/docker-and-auth', { cwd: e2eDir });

    // Modify src/auth.ts (adding lines 4-9)
    fs.writeFileSync(
      path.join(e2eDir, 'src/auth.ts'),
      `export function login(user: string): boolean {
  if (!user) {
    return false;
  }
  const isAuthorized = user === 'admin' || user === 'root';
  return isAuthorized;
}
`
    );

    // Add compose.yaml (should trigger Docker & Infrastructure impact rule)
    fs.writeFileSync(
      path.join(e2eDir, 'compose.yaml'),
      `services:\n  app:\n    image: node:22-alpine\n    ports:\n      - "3000:3000"\n`
    );

    execSync('git add . && git commit -m "feat: add root login and compose.yaml"', { cwd: e2eDir });
  });

  afterAll(() => {
    if (fs.existsSync(e2eDir)) {
      fs.rmSync(e2eDir, { recursive: true, force: true });
    }
  });

  it('Scenario 1: Runs post-inline-review with diff-only filtering and suggestion generation', () => {
    // Generate a SARIF report:
    // Finding 1: on src/auth.ts line 6 (CHANGED line in PR) -> SHOULD be captured inline!
    // Finding 2: on src/math.ts line 2 (UNTOUCHED line in PR) -> MUST be filtered out!
    const sarifPayload = {
      version: '2.1.0',
      runs: [
        {
          tool: {
            driver: {
              name: 'ESLint',
              rules: [
                {
                  id: 'security/detect-possible-timing-attacks',
                  helpUri: 'https://security-rules.io/timing',
                  properties: { category: 'Security', 'security-severity': 8.0, tags: ['security'] },
                },
                {
                  id: 'no-unused-vars',
                  properties: { category: 'Maintainability' },
                },
              ],
            },
          },
          results: [
            {
              ruleId: 'security/detect-possible-timing-attacks',
              level: 'error',
              message: { text: 'Direct string comparison can lead to timing attacks.' },
              locations: [
                {
                  physicalLocation: {
                    artifactLocation: { uri: 'src/auth.ts' },
                    region: { startLine: 6, startColumn: 3 },
                  },
                },
              ],
              fixes: [
                {
                  description: { text: 'Use constant-time comparison' },
                  artifactChanges: [
                    {
                      artifactLocation: { uri: 'src/auth.ts' },
                      replacements: [
                        {
                          deletedRegion: { startLine: 6, endLine: 6 },
                          insertedContent: { text: "  const isAuthorized = crypto.timingSafeEqual(Buffer.from(user), Buffer.from('admin'));" },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              ruleId: 'no-unused-vars',
              level: 'warning',
              message: { text: 'Old warning on untouched file.' },
              locations: [
                {
                  physicalLocation: {
                    artifactLocation: { uri: 'src/math.ts' },
                    region: { startLine: 2, startColumn: 1 },
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    const sarifPath = path.join(e2eDir, 'lint.sarif');
    fs.writeFileSync(sarifPath, JSON.stringify(sarifPayload, null, 2));

    const githubOutput = path.join(e2eDir, 'github_output_review.txt');
    fs.writeFileSync(githubOutput, '');

    // Execute bundled post-inline-review.js
    // Note: Since finding is critical security, it should set process exit code or fail
    let executionOutput = '';
    try {
      executionOutput = execSync(`node ${distPostReview}`, {
        cwd: e2eDir,
        env: {
          ...process.env,
          NODE_ENV: 'production',
          GITHUB_ACTIONS: 'true',
          GITHUB_OUTPUT: githubOutput,
          INPUT_SARIF_PATH: 'lint.sarif',
          INPUT_BASE_REF: 'main',
          INPUT_HEAD_REF: 'HEAD',
          INPUT_MAX_INLINE_COMMENTS: '15',
          INPUT_WORKING_DIRECTORY: '.',
        },
        encoding: 'utf-8',
      });
    } catch (err: unknown) {
      // In @actions/core setFailed sets process.exitCode = 1
      const execErr = err as { stdout?: string; stderr?: string };
      executionOutput = (execErr.stdout || '') + (execErr.stderr || '');
    }

    // Verify .pr-verification/lint-report.json was generated
    const lintReportPath = path.join(e2eDir, '.pr-verification/lint-report.json');
    expect(fs.existsSync(lintReportPath)).toBe(true);

    const lintReport = JSON.parse(fs.readFileSync(lintReportPath, 'utf-8'));
    // Total findings in SARIF: 2
    expect(lintReport.counts.total).toBe(2);
    expect(lintReport.counts.critical).toBe(1);
    // Inline comment posted: exactly 1 (the one on changed line in auth.ts; math.ts line was filtered out!)
    expect(lintReport.inlineCommentsCount).toBe(1);
    expect(lintReport.overflowFindings).toHaveLength(0);

    // Verify output logs indicate diff filtering
    expect(executionOutput).toContain('1 diff-matching findings');
  });

  it('Scenario 2: Runs pr-summary with failure callout, blast radius, diff coverage and uncovered lines', () => {
    // Create JUnit XML with 1 pass, 1 failure
    const junitXml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites tests="2" failures="1" errors="0" time="1.5">
  <testsuite name="AuthSuite" tests="2" failures="1" errors="0" time="1.5">
    <testcase name="should login admin" classname="AuthSuite" time="0.5"/>
    <testcase name="should reject invalid token" classname="AuthSuite" time="1.0">
      <failure message="Expected false but received true">AssertionError: Expected false but received true\n    at auth.test.ts:32</failure>
    </testcase>
  </testsuite>
</testsuites>`;
    fs.writeFileSync(path.join(e2eDir, 'junit.xml'), junitXml);

    // Create LCOV coverage report:
    // In src/auth.ts lines 2, 3, 5 are covered, lines 6, 7 are uncovered (hit = 0)
    const lcov = `TN:
SF:src/auth.ts
DA:1,1
DA:2,1
DA:3,1
DA:5,1
DA:6,0
DA:7,0
LF:6
LH:4
end_of_record`;
    fs.writeFileSync(path.join(e2eDir, 'lcov.info'), lcov);

    // Gate results
    const gateResults = {
      gates: [
        { name: 'typecheck', command: 'npm run typecheck', status: 'passed', duration: 1.2 },
        { name: 'lint-and-sast', command: 'npm run lint', status: 'passed', duration: 2.5 },
        { name: 'test-and-coverage', command: 'npm test', status: 'failed', duration: 1.5 },
      ],
    };
    fs.mkdirSync(path.join(e2eDir, '.pr-verification'), { recursive: true });
    fs.writeFileSync(
      path.join(e2eDir, '.pr-verification/gate-results.json'),
      JSON.stringify(gateResults, null, 2)
    );

    const summaryFile = path.join(e2eDir, 'step_summary.md');
    fs.writeFileSync(summaryFile, '');

    try {
      execSync(`node ${distPrSummary}`, {
        cwd: e2eDir,
        env: {
          ...process.env,
          NODE_ENV: 'production',
          GITHUB_ACTIONS: 'true',
          GITHUB_STEP_SUMMARY: summaryFile,
          INPUT_REPORT_ID: 'frontend',
          INPUT_JUNIT_PATH: 'junit.xml',
          INPUT_COVERAGE_PATH: 'lcov.info',
          INPUT_SARIF_PATH: 'lint.sarif',
          INPUT_COVERAGE_THRESHOLD: '80',
          INPUT_DIFF_COVERAGE_THRESHOLD: '80',
          INPUT_BASE_REF: 'main',
          INPUT_HEAD_REF: 'HEAD',
        },
        encoding: 'utf-8',
      });
    } catch {
      // Expected to fail with exit code 1
    }

    // Verify step summary contents
    const summaryContent = fs.readFileSync(summaryFile, 'utf-8');

    // 1. Unique report ID marker
    expect(summaryContent).toContain('<!-- pr-verification-report:frontend -->');

    // 2. Verdict badge
    expect(summaryContent).toContain('### 🔴 Verification Failed');

    // 3. CAUTION alert block with exact blockers
    expect(summaryContent).toContain('> [!CAUTION]');
    expect(summaryContent).toContain('Gate **test-and-coverage** failed');
    expect(summaryContent).toContain('**1** failing test case(s) detected.');
    expect(summaryContent).toContain('Diff coverage (**75%**) is below required **80%** threshold (-5.0%).');

    // 4. Failing test details
    expect(summaryContent).toContain('should reject invalid token');
    expect(summaryContent).toContain('Expected false but received true');

    // 5. Blast Radius & Checklist: compose.yaml matched!
    expect(summaryContent).toContain('#### 🔍 Impact & Blast Radius');
    expect(summaryContent).toContain('Docker & Infrastructure');
    expect(summaryContent).toContain('compose.yaml');
    expect(summaryContent).toContain('Verify base image version pinning');

    // 6. Diff coverage & exact uncovered lines
    expect(summaryContent).toContain('**Diff Coverage:** ❌ **75%**');
    expect(summaryContent).toContain('`src/auth.ts`: L6');
  });

  it('Scenario 3: Runs pr-summary with 100% passing gates and clean verdict', () => {
    // Update JUnit to all pass
    const junitXml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites tests="2" failures="0" errors="0" time="1.0">
  <testsuite name="AuthSuite" tests="2" failures="0" errors="0" time="1.0">
    <testcase name="should login admin" classname="AuthSuite" time="0.5"/>
    <testcase name="should reject invalid token" classname="AuthSuite" time="0.5"/>
  </testsuite>
</testsuites>`;
    fs.writeFileSync(path.join(e2eDir, 'junit.xml'), junitXml);

    // Update LCOV to 100% coverage
    const lcov = `TN:
SF:src/auth.ts
DA:1,1
DA:2,1
DA:3,1
DA:5,1
DA:6,1
DA:7,1
LF:6
LH:6
end_of_record`;
    fs.writeFileSync(path.join(e2eDir, 'lcov.info'), lcov);

    // Gate results all passed
    const gateResults = {
      gates: [
        { name: 'typecheck', command: 'npm run typecheck', status: 'passed', duration: 1.0 },
        { name: 'lint-and-sast', command: 'npm run lint', status: 'passed', duration: 1.8 },
        { name: 'test-and-coverage', command: 'npm test', status: 'passed', duration: 1.0 },
        { name: 'build', command: 'npm run build', status: 'passed', duration: 2.1 },
      ],
    };
    fs.writeFileSync(
      path.join(e2eDir, '.pr-verification/gate-results.json'),
      JSON.stringify(gateResults, null, 2)
    );

    // Empty SARIF report with 0 critical/error issues
    const cleanSarif = { version: '2.1.0', runs: [] };
    fs.writeFileSync(path.join(e2eDir, 'clean.sarif'), JSON.stringify(cleanSarif));

    const summaryFile = path.join(e2eDir, 'clean_summary.md');
    fs.writeFileSync(summaryFile, '');

    execSync(`node ${distPrSummary}`, {
      cwd: e2eDir,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        GITHUB_ACTIONS: 'true',
        GITHUB_STEP_SUMMARY: summaryFile,
        INPUT_REPORT_ID: 'backend',
        INPUT_JUNIT_PATH: 'junit.xml',
        INPUT_COVERAGE_PATH: 'lcov.info',
        INPUT_SARIF_PATH: 'clean.sarif',
        INPUT_COVERAGE_THRESHOLD: '80',
        INPUT_DIFF_COVERAGE_THRESHOLD: '80',
        INPUT_BASE_REF: 'main',
        INPUT_HEAD_REF: 'HEAD',
      },
      encoding: 'utf-8',
    });

    const summaryContent = fs.readFileSync(summaryFile, 'utf-8');

    // 1. Report ID
    expect(summaryContent).toContain('<!-- pr-verification-report:backend -->');

    // 2. Green verdict badge
    expect(summaryContent).toContain('### 🟢 Verification Passed');
    expect(summaryContent).not.toContain('[!CAUTION]');

    // 3. Diff Coverage is 100%
    expect(summaryContent).toContain('**Diff Coverage:** ✅ **100%**');
    expect(summaryContent).toContain('**Overall Coverage:** ✅ **100%**');

    // 4. Quality gates table
    expect(summaryContent).toContain('**typecheck**');
    expect(summaryContent).toContain('**build**');
    expect(summaryContent).toContain('✅ Passed');
  });
});
