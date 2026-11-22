import * as fs from 'node:fs';
import * as path from 'node:path';
import picomatch from 'picomatch';
import {
  ImpactConfigSchema,
  type ImpactConfig,
  type ImpactRule,
} from './types/config.js';

export interface MatchedImpact {
  rule: ImpactRule;
  matchedFiles: string[];
}

export interface ImpactAnalysisResult {
  matchedImpacts: MatchedImpact[];
  allChecklistItems: string[];
}

export function loadImpactConfig(overridePath?: string, cwd: string = '.'): ImpactConfig {
  let defaultRules: ImpactRule[] = [];

  // Try locating default-impact-rules.json
  const currentDir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();
  const candidatePaths = [
    path.resolve(cwd, 'config/default-impact-rules.json'),
    path.resolve(currentDir, '../config/default-impact-rules.json'),
    path.resolve(currentDir, '../../config/default-impact-rules.json'),
    path.resolve(currentDir, 'config/default-impact-rules.json'),
  ];

  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, 'utf-8');
        const parsed = JSON.parse(raw);
        const config = ImpactConfigSchema.parse(parsed);
        defaultRules = config.rules;
        break;
      } catch (err) {
        console.warn(`Warning: Failed to load default impact rules from ${p}: ${String(err)}`);
      }
    }
  }

  if (overridePath && overridePath.trim()) {
    const fullOverridePath = path.isAbsolute(overridePath) ? overridePath : path.resolve(cwd, overridePath);
    if (fs.existsSync(fullOverridePath)) {
      try {
        const rawOverride = fs.readFileSync(fullOverridePath, 'utf-8');
        const parsedOverride = JSON.parse(rawOverride);
        const overrideConfig = ImpactConfigSchema.parse(parsedOverride);

        // Merge: Override rules with same ID replace default; new rules are appended
        const ruleMap = new Map<string, ImpactRule>();
        for (const rule of defaultRules) {
          ruleMap.set(rule.id, rule);
        }
        for (const overrideRule of overrideConfig.rules) {
          ruleMap.set(overrideRule.id, overrideRule);
        }
        return {
          rules: Array.from(ruleMap.values()),
        };
      } catch (err) {
        throw new Error(`Consumer impact rules at '${overridePath}' are invalid: ${String(err)}`);
      }
    } else {
      console.warn(`Warning: Configured impact-rules-path '${overridePath}' does not exist.`);
    }
  }

  return { rules: defaultRules };
}

export function analyzeImpact(changedFiles: string[], config: ImpactConfig): ImpactAnalysisResult {
  const matchedImpacts: MatchedImpact[] = [];
  const checklistSet = new Set<string>();

  for (const rule of config.rules) {
    const isMatch = picomatch(rule.patterns, { dot: true });
    const matched = changedFiles.filter((file) => isMatch(file));

    if (matched.length > 0) {
      matchedImpacts.push({
        rule,
        matchedFiles: matched,
      });

      for (const item of rule.checklist) {
        checklistSet.add(item);
      }
    }
  }

  return {
    matchedImpacts,
    allChecklistItems: Array.from(checklistSet),
  };
}
