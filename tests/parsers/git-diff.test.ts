import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  parseGitDiff,
  categorizeFilePath,
  calculatePrSize,
} from '../../src/parsers/git-diff.js';

describe('git-diff parser', () => {
  it('correctly parses additions, deletions and changed lines per file', () => {
    const diffPath = path.resolve('tests/fixtures/sample.diff');
    const diffContent = fs.readFileSync(diffPath, 'utf-8');

    const result = parseGitDiff(diffContent);

    expect(result.stats.filesChanged).toBe(2);
    expect(result.stats.additions).toBe(10);
    expect(result.stats.deletions).toBe(1);
    expect(result.stats.size).toBe('XS');

    // Check changed lines for auth.service.ts: line 10 is context, lines 11-15 are additions
    const authLines = result.changedLinesPerFile.get('src/services/auth.service.ts');
    expect(authLines).toBeDefined();
    expect(authLines?.has(10)).toBe(false);
    expect(authLines?.has(11)).toBe(true);
    expect(authLines?.has(12)).toBe(true);
    expect(authLines?.has(13)).toBe(true);
    expect(authLines?.has(14)).toBe(true);
    expect(authLines?.has(15)).toBe(true);
    expect(authLines?.has(16)).toBe(false);

    // Check Dockerfile
    const dockerLines = result.changedLinesPerFile.get('Dockerfile');
    expect(dockerLines).toBeDefined();
    expect(dockerLines?.size).toBe(5);
  });

  it('categorizes file paths accurately', () => {
    expect(categorizeFilePath('src/app.ts')).toBe('Source Code');
    expect(categorizeFilePath('tests/app.test.ts')).toBe('Tests');
    expect(categorizeFilePath('docs/README.md')).toBe('Documentation');
    expect(categorizeFilePath('.github/workflows/ci.yml')).toBe('Infrastructure / CI');
    expect(categorizeFilePath('config/rules.json')).toBe('Configuration');
  });

  it('calculates PR size accurately', () => {
    expect(calculatePrSize(10)).toBe('XS');
    expect(calculatePrSize(50)).toBe('S');
    expect(calculatePrSize(250)).toBe('M');
    expect(calculatePrSize(750)).toBe('L');
    expect(calculatePrSize(1500)).toBe('XL');
  });
});
