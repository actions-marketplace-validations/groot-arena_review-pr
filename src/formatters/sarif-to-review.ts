import type { Finding, FindingSeverity } from '../types/reports.js';
import type { FormattedReviewResult, InlineReviewComment } from '../types/review.js';

export const SEVERITY_BADGES: Record<FindingSeverity, string> = {
  critical: '🛑 Critical',
  error: '🔴 Error',
  warning: '🟡 Warning',
  info: '🔵 Info',
};

const SEVERITY_PRIORITY: Record<FindingSeverity, number> = {
  critical: 0,
  error: 1,
  warning: 2,
  info: 3,
};

export function formatSarifToReview(
  findings: Finding[],
  changedLinesPerFile: Map<string, Set<number>>,
  maxInlineComments: number = 15
): FormattedReviewResult {
  // 1. Diff-only filtering
  const diffFindings: Finding[] = [];
  const infoFindings: Finding[] = [];

  for (const finding of findings) {
    if (finding.severity === 'info') {
      infoFindings.push(finding);
      continue;
    }

    const changedLines = changedLinesPerFile.get(finding.file);
    if (!changedLines || !changedLines.has(finding.startLine)) {
      // Untouched line, suppress from inline comment
      continue;
    }

    diffFindings.push(finding);
  }

  // 2. Prioritize: Critical -> Error -> Warning
  diffFindings.sort((a, b) => {
    const pDiff = SEVERITY_PRIORITY[a.severity] - SEVERITY_PRIORITY[b.severity];
    if (pDiff !== 0) return pDiff;
    if (a.file !== b.file) return a.file.localeCompare(b.file);
    return a.startLine - b.startLine;
  });

  // 3. Split at maxInlineComments cap
  const cappedFindings = diffFindings.slice(0, maxInlineComments);
  const overflowFindings = diffFindings.slice(maxInlineComments);

  const inlineComments: InlineReviewComment[] = cappedFindings.map((finding) => {
    const body = buildCommentBody(finding);
    return {
      path: finding.file,
      line: finding.startLine,
      side: 'RIGHT',
      body,
      ruleId: finding.ruleId,
      severity: finding.severity,
    };
  });

  return {
    inlineComments,
    overflowFindings,
    infoFindings,
    totalEligible: diffFindings.length,
  };
}

export function buildCommentBody(finding: Finding): string {
  const badge = SEVERITY_BADGES[finding.severity];
  const ruleDisplay = finding.helpUri
    ? `[${finding.ruleId}](${finding.helpUri})`
    : `\`${finding.ruleId}\``;
  const toolName = finding.tool ? ` (${finding.tool})` : '';

  // 1. Header
  const header = `### ${badge} • ${finding.category} • ${ruleDisplay}${toolName}`;

  // 2. Impact & Context
  const impact = `**Impact:** ${finding.message}`;

  // 3. Actionable Remediation
  let remediation = '**Remediation:** Inspect the flagged code and apply appropriate validation or error handling.';
  if (finding.category === 'Security') {
    remediation = '**Remediation:** Sanitize untrusted input or verify permissions to prevent potential vulnerabilities.';
  } else if (finding.severity === 'critical' || finding.severity === 'error') {
    remediation = '**Remediation:** Resolve this error before merging to prevent runtime exceptions or regressions.';
  }

  let suggestionBlock = '';
  if (finding.suggestion?.text !== undefined) {
    suggestionBlock = `\n\n\`\`\`suggestion\n${finding.suggestion.text}\n\`\`\``;
  }

  // Identifier tag for deduplication and auto-resolution
  const marker = `<!-- rule-id:${finding.ruleId} -->`;

  return `${header}\n\n${impact}\n\n${remediation}${suggestionBlock}\n\n${marker}`;
}
