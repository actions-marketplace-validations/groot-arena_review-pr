import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseSarifOrRdjson } from '../../src/parsers/sarif.js';

describe('sarif parser', () => {
  it('parses SARIF fixture and extracts findings, severities and suggestions', () => {
    const sarifPath = path.resolve('tests/fixtures/sample.sarif');
    const content = fs.readFileSync(sarifPath, 'utf-8');

    const report = parseSarifOrRdjson(content);

    expect(report.counts.total).toBe(2);
    expect(report.counts.critical).toBe(1); // security rule with severity 9.5
    expect(report.counts.error).toBe(1); // no-floating-promises

    const floatingPromise = report.findings.find(
      (f) => f.ruleId === '@typescript-eslint/no-floating-promises'
    );
    expect(floatingPromise).toBeDefined();
    expect(floatingPromise?.severity).toBe('error');
    expect(floatingPromise?.helpUri).toBe('https://typescript-eslint.io/rules/no-floating-promises');
    expect(floatingPromise?.suggestion).toBeDefined();
    expect(floatingPromise?.suggestion?.text).toBe('    const decoded = await verifyJwt(token);');

    const evalSecurity = report.findings.find(
      (f) => f.ruleId === 'security/detect-eval-with-expr'
    );
    expect(evalSecurity).toBeDefined();
    expect(evalSecurity?.severity).toBe('critical');
    expect(evalSecurity?.category).toBe('Security');
  });

  it('parses RDJSON format', () => {
    const rdjson = JSON.stringify({
      source: { name: 'flake8' },
      diagnostics: [
        {
          message: 'unused import os',
          location: {
            path: 'src/main.py',
            range: { start: { line: 5, column: 1 } },
          },
          severity: 'WARNING',
          code: { value: 'F401', url: 'https://flake8.pycqa.org/en/latest/' },
        },
      ],
    });

    const report = parseSarifOrRdjson(rdjson);
    expect(report.counts.total).toBe(1);
    expect(report.counts.warning).toBe(1);
    expect(report.findings[0]?.ruleId).toBe('F401');
    expect(report.findings[0]?.file).toBe('src/main.py');
    expect(report.findings[0]?.startLine).toBe(5);
  });
});
