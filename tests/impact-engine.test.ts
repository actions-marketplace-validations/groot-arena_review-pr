import { describe, it, expect } from 'vitest';
import {
  loadImpactConfig,
  analyzeImpact,
} from '../src/impact-engine.js';

describe('impact-engine', () => {
  it('loads default impact rules and matches changed paths', () => {
    const config = loadImpactConfig();
    expect(config.rules.length).toBeGreaterThan(0);

    const changedPaths = [
      'Dockerfile',
      '.github/workflows/ci.yml',
      'src/auth/jwt.service.ts',
      'src/normal-code.ts',
    ];

    const result = analyzeImpact(changedPaths, config);

    expect(result.matchedImpacts.length).toBe(3);

    const ruleIds = result.matchedImpacts.map((m) => m.rule.id);
    expect(ruleIds).toContain('docker-infra');
    expect(ruleIds).toContain('ci-cd');
    expect(ruleIds).toContain('auth-security');

    expect(result.allChecklistItems.length).toBeGreaterThan(0);
    expect(
      result.allChecklistItems.some((item) =>
        item.toLowerCase().includes('base image')
      )
    ).toBe(true);
  });

  it('handles consumer override configuration', () => {
    const customConfig = {
      rules: [
        {
          id: 'custom-payments',
          name: 'Payment Processing',
          patterns: ['**/billing/**', '**/stripe/**'],
          checklist: ['Verify PCI compliance', 'Test idempotency keys'],
        },
      ],
    };

    // Load with custom in-memory or override
    const changed = ['src/billing/stripe.ts'];
    const result = analyzeImpact(changed, customConfig);

    expect(result.matchedImpacts).toHaveLength(1);
    expect(result.matchedImpacts[0]?.rule.id).toBe('custom-payments');
    expect(result.allChecklistItems).toContain('Verify PCI compliance');
  });
});
