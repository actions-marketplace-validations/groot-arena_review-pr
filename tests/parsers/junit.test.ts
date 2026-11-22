import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseJUnitXml } from '../../src/parsers/junit.js';

describe('junit parser', () => {
  it('parses junit xml fixture with pass, fail, duration, and failure snippets', () => {
    const xmlPath = path.resolve('tests/fixtures/sample-junit.xml');
    const xmlContent = fs.readFileSync(xmlPath, 'utf-8');

    const result = parseJUnitXml(xmlContent);

    expect(result.total).toBe(3);
    expect(result.passed).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.errors).toBe(0);
    expect(result.duration).toBe(1.45);

    expect(result.failures).toHaveLength(1);
    const fail = result.failures[0]!;
    expect(fail.name).toBe('should process stripe payment');
    expect(fail.classname).toBe('BillingService');
    expect(fail.message).toBe('Payment failed with 402 Card Error');
    expect(fail.snippet).toContain('AssertionError: expected status 200');
  });

  it('handles empty XML or no tests gracefully', () => {
    const result = parseJUnitXml('');
    expect(result.total).toBe(0);
    expect(result.passed).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.failures).toEqual([]);
  });
});
