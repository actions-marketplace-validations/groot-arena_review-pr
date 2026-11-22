import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  parseCoverage,
  formatLineRanges,
} from '../../src/parsers/coverage.js';

describe('coverage parser', () => {
  it('parses LCOV fixture and computes overall and diff coverage', () => {
    const lcovPath = path.resolve('tests/fixtures/sample-lcov.info');
    const content = fs.readFileSync(lcovPath, 'utf-8');

    // Simulate changed lines in auth.service.ts: lines 10, 11, 12, 13, 14, 15
    const changedMap = new Map<string, Set<number>>();
    changedMap.set('src/services/auth.service.ts', new Set([10, 11, 12, 13, 14, 15]));

    const report = parseCoverage(content, changedMap);

    // Overall:
    // auth.service.ts: LF 6, LH 4
    // logger.ts: LF 3, LH 3
    // Total lines: 9, Covered: 7 -> 77.78%
    expect(report.overall.linesTotal).toBe(9);
    expect(report.overall.linesCovered).toBe(7);
    expect(report.overall.percentage).toBe(77.78);

    // Diff Coverage:
    // Lines 10, 11, 12, 13, 14, 15 are in coverage data.
    // Hits: 10(1), 11(1), 12(1), 13(0), 14(1), 15(0) -> 4 covered out of 6 -> 66.67%
    expect(report.diffCoverage.linesTotal).toBe(6);
    expect(report.diffCoverage.linesCovered).toBe(4);
    expect(report.diffCoverage.percentage).toBe(66.67);

    // Uncovered diff lines: lines 13 and 15
    expect(report.uncoveredDiffLines).toHaveLength(1);
    expect(report.uncoveredDiffLines[0]?.file).toBe('src/services/auth.service.ts');
    expect(report.uncoveredDiffLines[0]?.ranges).toEqual(['L13', 'L15']);

    // Directory breakdown: src/services and src/utils
    expect(report.directoryBreakdown).toHaveLength(2);
    expect(report.directoryBreakdown[0]?.directory).toBe('src/services');
    expect(report.directoryBreakdown[1]?.directory).toBe('src/utils');
  });

  it('parses Cobertura XML fixture', () => {
    const cobPath = path.resolve('tests/fixtures/sample-cobertura.xml');
    const content = fs.readFileSync(cobPath, 'utf-8');

    const changedMap = new Map<string, Set<number>>();
    changedMap.set('src/services/auth.service.ts', new Set([10, 11, 12]));

    const report = parseCoverage(content, changedMap);

    expect(report.overall.linesTotal).toBe(4);
    expect(report.overall.linesCovered).toBe(3);
    expect(report.overall.percentage).toBe(75);

    // Diff coverage for 10, 11, 12: 10(1), 11(1), 12(0) -> 2/3 = 66.67%
    expect(report.diffCoverage.linesTotal).toBe(3);
    expect(report.diffCoverage.linesCovered).toBe(2);
    expect(report.diffCoverage.percentage).toBe(66.67);
    expect(report.uncoveredDiffLines[0]?.ranges).toEqual(['L12']);
  });

  it('formats contiguous line ranges properly', () => {
    expect(formatLineRanges([1, 2, 3, 5, 7, 8, 9, 10])).toEqual([
      'L1-L3',
      'L5',
      'L7-L10',
    ]);
  });
});
