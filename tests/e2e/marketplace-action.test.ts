import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

describe('GitHub Marketplace Action Metadata & Execution', () => {
  const rootDir = path.resolve('.');
  const actionYamlPath = path.join(rootDir, 'action.yml');
  const distPrSummary = path.join(rootDir, 'dist/pr-summary.js');
  const distPostReview = path.join(rootDir, 'dist/post-inline-review.js');

  beforeAll(() => {
    if (!fs.existsSync(distPrSummary) || !fs.existsSync(distPostReview)) {
      execSync('npm run build', { cwd: rootDir });
    }
  });

  it('validates action.yml exists and satisfies GitHub Marketplace requirements', () => {
    expect(fs.existsSync(actionYamlPath)).toBe(true);

    const actionContent = fs.readFileSync(actionYamlPath, 'utf8');

    // 1. Name must be defined and distinct
    const nameMatch = actionContent.match(/^name:\s*['"](.+)['"]/m);
    expect(nameMatch).not.toBeNull();
    const actionName = nameMatch?.[1] ?? '';
    expect(actionName.length).toBeGreaterThan(0);
    expect(actionName).toBe('Enterprise Multi-Language PR Verification');

    // 2. Description must be <= 125 characters for Marketplace
    const descMatch = actionContent.match(/^description:\s*['"](.+)['"]/m);
    expect(descMatch).not.toBeNull();
    const description = descMatch?.[1] ?? '';
    expect(description.length).toBeGreaterThan(0);
    expect(description.length).toBeLessThanOrEqual(125);

    // 3. Author must be set
    const authorMatch = actionContent.match(/^author:\s*['"](.+)['"]/m);
    expect(authorMatch).not.toBeNull();
    expect(authorMatch?.[1]).toBe('Groot Arena');

    // 4. Branding must have valid Feather icon and GitHub color
    const validColors = ['white', 'black', 'yellow', 'blue', 'green', 'orange', 'red', 'purple', 'gray-dark'];
    const iconMatch = actionContent.match(/icon:\s*['"](.+)['"]/);
    const colorMatch = actionContent.match(/color:\s*['"](.+)['"]/);
    expect(iconMatch).not.toBeNull();
    expect(colorMatch).not.toBeNull();
    expect(iconMatch?.[1]).toBe('shield');
    expect(validColors).toContain(colorMatch?.[1]);

    // 5. Must run as composite action
    expect(actionContent).toContain("using: 'composite'");

    // 6. Must define essential inputs and outputs
    expect(actionContent).toContain('junit-path:');
    expect(actionContent).toContain('coverage-path:');
    expect(actionContent).toContain('sarif-path:');
    expect(actionContent).toContain('verdict:');
    expect(actionContent).toContain('diff-coverage:');
    expect(actionContent).toContain('total-coverage:');
  });

  it('runs pr-summary and populates GITHUB_OUTPUT with gate verdicts', () => {
    const tempDir = path.join(rootDir, 'tests/e2e/.temp-marketplace-test');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const outputFile = path.join(tempDir, 'action_output.txt');
    const summaryFile = path.join(tempDir, 'step_summary.md');
    fs.writeFileSync(outputFile, '');
    fs.writeFileSync(summaryFile, '');

    // Sample JUnit XML
    const junitXml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites tests="5" failures="0" errors="0" time="1.23">
  <testsuite name="AppTests" tests="5" failures="0" errors="0" time="1.23">
    <testcase name="test1" time="0.1"/>
    <testcase name="test2" time="0.2"/>
    <testcase name="test3" time="0.3"/>
    <testcase name="test4" time="0.4"/>
    <testcase name="test5" time="0.23"/>
  </testsuite>
</testsuites>`;
    const junitPath = path.join(tempDir, 'junit.xml');
    fs.writeFileSync(junitPath, junitXml);

    // Sample LCOV
    const lcov = `TN:
SF:src/index.ts
DA:1,1
DA:2,1
DA:3,1
DA:4,1
DA:5,1
DA:6,1
DA:7,1
DA:8,1
DA:9,1
DA:10,1
LF:10
LH:10
end_of_record`;
    const lcovPath = path.join(tempDir, 'lcov.info');
    fs.writeFileSync(lcovPath, lcov);

    execSync(`node "${distPrSummary}"`, {
      cwd: tempDir,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        GITHUB_ACTIONS: 'true',
        GITHUB_OUTPUT: outputFile,
        GITHUB_STEP_SUMMARY: summaryFile,
        GITHUB_REPOSITORY: 'groot-arena/ci-pr-verification-workflow',
        GITHUB_SHA: 'abc1234567890abcdef1234567890abcdef12345',
        GITHUB_RUN_ID: '987654321',
        INPUT_JUNIT_PATH: junitPath,
        INPUT_COVERAGE_PATH: lcovPath,
        INPUT_COVERAGE_THRESHOLD: '80',
        INPUT_DIFF_COVERAGE_THRESHOLD: '80',
      },
    });

    const outputContent = fs.readFileSync(outputFile, 'utf8');
    expect(outputContent).toContain('verdict');
    expect(outputContent).toContain('PASSED');
    expect(outputContent).toContain('total-coverage');
    expect(outputContent).toContain('100');
    expect(outputContent).toContain('tests-passed');
    expect(outputContent).toContain('5');
    expect(outputContent).toContain('tests-failed');
    expect(outputContent).toContain('0');

    // Clean up
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});
