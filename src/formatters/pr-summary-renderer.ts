import type {
  DiffStats,
  TestResult,
  CoverageReport,
  SarifReport,
  GateResultsReport,
  Finding,
} from '../types/reports.js';
import type { MatchedImpact } from '../impact-engine.js';

export interface PrSummaryRenderOptions {
  reportId: string;
  repoName?: string | undefined;
  headRef?: string | undefined;
  baseRef?: string | undefined;
  commitSha?: string | undefined;
  runId?: string | undefined;
  serverUrl?: string | undefined;
  coverageThreshold: number;
  diffCoverageThreshold: number;
  diffStats: DiffStats;
  testResult?: TestResult | undefined;
  coverageReport?: CoverageReport | undefined;
  sarifReport?: SarifReport | undefined;
  gateResults?: GateResultsReport | undefined;
  matchedImpacts: MatchedImpact[];
  checklistItems: string[];
  overflowFindings?: Finding[] | undefined;
}

export function renderPrSummary(options: PrSummaryRenderOptions): string {
  const {
    reportId,
    repoName = '',
    headRef = 'HEAD',
    baseRef = 'main',
    commitSha = '',
    runId = '',
    serverUrl = 'https://github.com',
    coverageThreshold,
    diffCoverageThreshold,
    diffStats,
    testResult,
    coverageReport,
    sarifReport,
    gateResults,
    matchedImpacts,
    checklistItems,
    overflowFindings = [],
  } = options;

  // Determine Failure Conditions
  const failures: string[] = [];

  // 1. Gates
  if (gateResults) {
    for (const g of gateResults.gates) {
      if (g.status === 'failed') {
        failures.push(`Gate **${g.name}** failed (${g.command || 'execution error'}).`);
      }
    }
  }

  // 2. Tests
  if (testResult && (testResult.failed > 0 || testResult.errors > 0)) {
    failures.push(`**${testResult.failed + testResult.errors}** failing test case(s) detected.`);
  }

  // 3. Coverage
  if (coverageReport) {
    if (coverageReport.diffCoverage.percentage < diffCoverageThreshold) {
      const diffGap = (diffCoverageThreshold - coverageReport.diffCoverage.percentage).toFixed(1);
      failures.push(
        `Diff coverage (**${coverageReport.diffCoverage.percentage}%**) is below required **${diffCoverageThreshold}%** threshold (-${diffGap}%).`
      );
    }
    if (coverageReport.overall.percentage < coverageThreshold) {
      const overallGap = (coverageThreshold - coverageReport.overall.percentage).toFixed(1);
      failures.push(
        `Overall coverage (**${coverageReport.overall.percentage}%**) is below required **${coverageThreshold}%** threshold (-${overallGap}%).`
      );
    }
  }

  // 4. Critical / Error SAST findings
  if (sarifReport && (sarifReport.counts.critical > 0 || sarifReport.counts.error > 0)) {
    failures.push(
      `Static analysis found **${sarifReport.counts.critical} critical** and **${sarifReport.counts.error} error** severity issue(s).`
    );
  }

  const isFailed = failures.length > 0;
  const hasWarnings = (sarifReport?.counts.warning || 0) > 0;

  let verdictBadge = '### 🟢 Verification Passed';
  if (isFailed) {
    verdictBadge = '### 🔴 Verification Failed';
  } else if (hasWarnings) {
    verdictBadge = '### 🟡 Verification Passed with Warnings';
  }

  const linesChanged = `+${diffStats.additions} / -${diffStats.deletions}`;
  const commitUrl = repoName && commitSha ? `${serverUrl}/${repoName}/commit/${commitSha}` : '';
  const commitDisplay = commitUrl ? `[\`${commitSha.substring(0, 7)}\`](${commitUrl})` : `\`${commitSha.substring(0, 7) || 'HEAD'}\``;
  const runUrl = repoName && runId ? `${serverUrl}/${repoName}/actions/runs/${runId}` : '';
  const runDisplay = runUrl ? `[Workflow Run #${runId}](${runUrl})` : '';

  const sections: string[] = [];

  // Marker
  sections.push(`<!-- pr-verification-report:${reportId} -->`);

  // 1. Header & Verdict
  sections.push(
    `${verdictBadge}\n\n` +
      `> **PR Branch:** \`${headRef}\` → \`${baseRef}\` &nbsp;|&nbsp; ` +
      `**Diff:** ${linesChanged} across **${diffStats.filesChanged}** files &nbsp;|&nbsp; ` +
      `**PR Size:** \`${diffStats.size}\` &nbsp;|&nbsp; ` +
      `**Commit:** ${commitDisplay}${runDisplay ? ` &nbsp;|&nbsp; ${runDisplay}` : ''}`
  );

  // 2. Action Required Callout (On Failure Only)
  if (isFailed) {
    let callout = `> [!CAUTION]\n> **Action Required: Merge Blockers Detected**\n>\n`;
    for (const f of failures) {
      callout += `> - ${f}\n`;
    }
    sections.push(callout);
  }

  // 3. Quality Gates & Static Analysis Table
  if (gateResults && gateResults.gates.length > 0) {
    let gateTable = `#### 🛡️ Quality Gates\n\n`;
    gateTable += `| Gate | Command / Tool | Status | Metrics | Duration |\n`;
    gateTable += `| :--- | :--- | :--- | :--- | :--- |\n`;

    for (const g of gateResults.gates) {
      const statusIcon = g.status === 'passed' ? '✅ Passed' : g.status === 'failed' ? '❌ Failed' : '⏭️ Skipped';
      const cmdDisplay = g.command ? `\`${g.command.length > 30 ? g.command.substring(0, 27) + '...' : g.command}\`` : '—';
      const metrics = g.metrics || '—';
      const dur = g.duration > 0 ? `${g.duration.toFixed(1)}s` : '—';
      gateTable += `| **${g.name}** | ${cmdDisplay} | ${statusIcon} | ${metrics} | ${dur} |\n`;
    }

    sections.push(gateTable);
  }

  // Top Failing Tests snippet
  if (testResult && testResult.failures.length > 0) {
    const topFailures = testResult.failures.slice(0, 5);
    let failSnippet = `<details><summary><b>⚠️ Failing Test Details (${testResult.failures.length})</b></summary>\n\n`;
    for (const f of topFailures) {
      failSnippet += `**${f.name}** \`${f.classname}\`:\n\`\`\`text\n${f.snippet}\n\`\`\`\n\n`;
    }
    if (testResult.failures.length > 5) {
      failSnippet += `*...and ${testResult.failures.length - 5} more failing test(s). Check CI logs for details.*\n\n`;
    }
    failSnippet += `</details>`;
    sections.push(failSnippet);
  }

  // Overflow Findings snippet
  if (overflowFindings.length > 0) {
    let overflowBlock = `<details><summary><b>📋 Static Analysis Overflow Findings (${overflowFindings.length})</b></summary>\n\n`;
    overflowBlock += `| File & Line | Severity | Rule | Message |\n`;
    overflowBlock += `| :--- | :--- | :--- | :--- |\n`;
    for (const item of overflowFindings.slice(0, 20)) {
      const ruleLink = item.helpUri ? `[${item.ruleId}](${item.helpUri})` : `\`${item.ruleId}\``;
      overflowBlock += `| \`${item.file}:${item.startLine}\` | ${item.severity} | ${ruleLink} | ${escapeMarkdown(item.message)} |\n`;
    }
    if (overflowFindings.length > 20) {
      overflowBlock += `\n*...and ${overflowFindings.length - 20} more findings exceeding cap.*\n`;
    }
    overflowBlock += `\n</details>`;
    sections.push(overflowBlock);
  }

  // 4. Impact & Blast Radius
  if (matchedImpacts.length > 0) {
    let impactSection = `#### 🔍 Impact & Blast Radius\n\n`;
    impactSection += `The following high-risk domains were touched in this pull request:\n\n`;

    for (const impact of matchedImpacts) {
      impactSection += `* **${impact.rule.name}** (${impact.matchedFiles.length} file(s))\n`;
      const sampleFiles = impact.matchedFiles.slice(0, 3).map((f) => `\`${f}\``).join(', ');
      const more = impact.matchedFiles.length > 3 ? ` *(+${impact.matchedFiles.length - 3} more)*` : '';
      impactSection += `  - Touched: ${sampleFiles}${more}\n`;
    }

    if (checklistItems.length > 0) {
      impactSection += `\n**Reviewer Guidance & Checklist:**\n\n`;
      for (const item of checklistItems) {
        impactSection += `- [ ] ${item}\n`;
      }
    }
    sections.push(impactSection);
  }

  // 5. Test Results & Coverage
  if (testResult || coverageReport) {
    let testCovSection = `#### 📊 Tests & Coverage\n\n`;

    if (testResult) {
      testCovSection += `* **Tests:** Total: **${testResult.total}** | Passed: **${testResult.passed}** | Failed: **${testResult.failed}** | Skipped: **${testResult.skipped}** (${testResult.duration}s)\n`;
    }

    if (coverageReport) {
      const diffStatus = coverageReport.diffCoverage.percentage >= diffCoverageThreshold ? '✅' : '❌';
      const overallStatus = coverageReport.overall.percentage >= coverageThreshold ? '✅' : '❌';

      testCovSection += `* **Diff Coverage:** ${diffStatus} **${coverageReport.diffCoverage.percentage}%** (Required: ${diffCoverageThreshold}%) — *${coverageReport.diffCoverage.linesCovered}/${coverageReport.diffCoverage.linesTotal} executable lines*\n`;
      testCovSection += `* **Overall Coverage:** ${overallStatus} **${coverageReport.overall.percentage}%** (Threshold: ${coverageThreshold}%) — *${coverageReport.overall.linesCovered}/${coverageReport.overall.linesTotal} lines*\n`;

      if (coverageReport.uncoveredDiffLines.length > 0) {
        testCovSection += `\n**Uncovered Lines in PR Diff:**\n`;
        for (const item of coverageReport.uncoveredDiffLines.slice(0, 8)) {
          testCovSection += `- \`${item.file}\`: ${item.ranges.join(', ')}\n`;
        }
        if (coverageReport.uncoveredDiffLines.length > 8) {
          testCovSection += `- *...and ${coverageReport.uncoveredDiffLines.length - 8} more files with uncovered lines.*\n`;
        }
      }

      if (coverageReport.directoryBreakdown.length > 0) {
        testCovSection += `\n<details><summary><b>Directory Coverage Breakdown (${coverageReport.directoryBreakdown.length} directories)</b></summary>\n\n`;
        testCovSection += `| Directory | Coverage | Covered / Total |\n`;
        testCovSection += `| :--- | :--- | :--- |\n`;
        for (const dir of coverageReport.directoryBreakdown) {
          const dirPass = dir.percentage >= coverageThreshold ? '🟢' : '🔴';
          testCovSection += `| \`${dir.directory}\` | ${dirPass} **${dir.percentage}%** | ${dir.linesCovered} / ${dir.linesTotal} |\n`;
        }
        testCovSection += `\n</details>\n`;
      }
    }

    sections.push(testCovSection);
  }

  // 6. Changed Files & Recent Commits
  if (diffStats.changedFiles.length > 0) {
    let filesSection = `<details><summary><b>📁 Changed Files Breakdown (${diffStats.filesChanged})</b></summary>\n\n`;
    filesSection += `| File | Category | Additions | Deletions |\n`;
    filesSection += `| :--- | :--- | :--- | :--- |\n`;

    for (const f of diffStats.changedFiles.slice(0, 25)) {
      filesSection += `| \`${f.path}\` | ${f.category} | +${f.additions} | -${f.deletions} |\n`;
    }
    if (diffStats.changedFiles.length > 25) {
      filesSection += `\n*...and ${diffStats.changedFiles.length - 25} more files.*\n`;
    }
    filesSection += `\n</details>`;
    sections.push(filesSection);
  }

  if (diffStats.commits.length > 0) {
    let commitsSection = `<details><summary><b>📜 Recent Commits (${diffStats.commits.length})</b></summary>\n\n`;
    for (const c of diffStats.commits) {
      const hashShort = c.hash.substring(0, 7);
      commitsSection += `- \`${hashShort}\` **${escapeMarkdown(c.message)}** — *${c.author}*\n`;
    }
    commitsSection += `\n</details>`;
    sections.push(commitsSection);
  }

  return sections.join('\n\n') + '\n';
}

function escapeMarkdown(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}
