import { describe, it, expect } from 'vitest';
import { formatSarifToReview } from '../../src/formatters/sarif-to-review.js';
import type { Finding } from '../../src/types/reports.js';

describe('sarif-to-review formatter', () => {
  it('enforces diff-only filtering and formats 3-part anatomy with suggestion block', () => {
    const findings: Finding[] = [
      {
        id: 'f1',
        ruleId: '@typescript-eslint/no-floating-promises',
        file: 'src/services/auth.service.ts',
        startLine: 14,
        severity: 'error',
        category: 'Reliability',
        message: 'Unhandled promise.',
        tool: 'ESLint',
        helpUri: 'https://rules.io/fp',
        suggestion: {
          text: '    const decoded = await verifyJwt(token);',
          startLine: 14,
          endLine: 14,
        },
      },
      {
        id: 'f2',
        ruleId: 'legacy-issue',
        file: 'src/services/auth.service.ts',
        startLine: 99, // NOT in diff
        severity: 'error',
        category: 'Maintainability',
        message: 'Old issue on untouched line',
        tool: 'ESLint',
      },
    ];

    const changedLines = new Map<string, Set<number>>();
    changedLines.set('src/services/auth.service.ts', new Set([10, 11, 14]));

    const result = formatSarifToReview(findings, changedLines, 15);

    expect(result.inlineComments).toHaveLength(1);
    expect(result.overflowFindings).toHaveLength(0);

    const comment = result.inlineComments[0]!;
    expect(comment.path).toBe('src/services/auth.service.ts');
    expect(comment.line).toBe(14);
    expect(comment.ruleId).toBe('@typescript-eslint/no-floating-promises');

    // 3-part anatomy checks
    expect(comment.body).toContain('🔴 Error • Reliability • [@typescript-eslint/no-floating-promises](https://rules.io/fp) (ESLint)');
    expect(comment.body).toContain('**Impact:** Unhandled promise.');
    expect(comment.body).toContain('**Remediation:**');
    expect(comment.body).toContain('```suggestion\n    const decoded = await verifyJwt(token);\n```');
    expect(comment.body).toContain('<!-- rule-id:@typescript-eslint/no-floating-promises -->');
  });

  it('caps inline comments at max limit (e.g. 15) and prioritizes by severity', () => {
    const findings: Finding[] = [];
    const changedSet = new Set<number>();

    // Generate 20 findings: 5 warning, 10 error, 5 critical
    for (let i = 1; i <= 20; i++) {
      changedSet.add(i);
      let severity: 'critical' | 'error' | 'warning' = 'warning';
      if (i <= 5) severity = 'warning';
      else if (i <= 15) severity = 'error';
      else severity = 'critical';

      findings.push({
        id: `f-${i}`,
        ruleId: `rule-${i}`,
        file: 'src/app.ts',
        startLine: i,
        severity,
        category: 'Reliability',
        message: `Issue ${i}`,
        tool: 'Tool',
      });
    }

    const changedMap = new Map<string, Set<number>>([['src/app.ts', changedSet]]);

    const result = formatSarifToReview(findings, changedMap, 15);

    expect(result.inlineComments).toHaveLength(15);
    expect(result.overflowFindings).toHaveLength(5);

    // Critical and errors should be included first!
    const postedSeverities = result.inlineComments.map((c) => c.severity);
    expect(postedSeverities.filter((s) => s === 'critical')).toHaveLength(5);
    expect(postedSeverities.filter((s) => s === 'error')).toHaveLength(10);
  });
});
