import { z } from 'zod';

export const ImpactRuleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  patterns: z.array(z.string().min(1)),
  checklist: z.array(z.string().min(1)),
});

export type ImpactRule = z.infer<typeof ImpactRuleSchema>;

export const ImpactConfigSchema = z.object({
  version: z.string().optional(),
  rules: z.array(ImpactRuleSchema),
});

export type ImpactConfig = z.infer<typeof ImpactConfigSchema>;

export const PostInlineReviewInputsSchema = z.object({
  sarifPath: z.string().min(1),
  maxInlineComments: z.coerce.number().int().positive().default(15),
  githubToken: z.string().min(1),
  baseRef: z.string().default('origin/main'),
  headRef: z.string().default('HEAD'),
  workingDirectory: z.string().default('.'),
});

export type PostInlineReviewInputs = z.infer<typeof PostInlineReviewInputsSchema>;

export const PrSummaryInputsSchema = z.object({
  reportId: z.string().default('default'),
  coverageThreshold: z.coerce.number().min(0).max(100).default(80),
  diffCoverageThreshold: z.coerce.number().min(0).max(100).default(80),
  junitPath: z.string().default(''),
  coveragePath: z.string().default(''),
  sarifPath: z.string().default(''),
  impactRulesPath: z.string().default(''),
  gateResultsPath: z.string().default(''),
  githubToken: z.string().default(''),
  baseRef: z.string().default('origin/main'),
  headRef: z.string().default('HEAD'),
  workingDirectory: z.string().default('.'),
});

export type PrSummaryInputs = z.infer<typeof PrSummaryInputsSchema>;
