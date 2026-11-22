import { z } from 'zod';

export const FindingSeveritySchema = z.enum(['critical', 'error', 'warning', 'info']);
export type FindingSeverity = z.infer<typeof FindingSeveritySchema>;

export const FindingSuggestionSchema = z.object({
  text: z.string(),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
});
export type FindingSuggestion = z.infer<typeof FindingSuggestionSchema>;

export const FindingSchema = z.object({
  id: z.string(),
  ruleId: z.string(),
  ruleName: z.string().optional(),
  category: z.string().default('Reliability'),
  severity: FindingSeveritySchema,
  message: z.string(),
  helpUri: z.string().url().optional().or(z.literal('')),
  file: z.string(),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive().optional(),
  startColumn: z.number().int().positive().optional(),
  endColumn: z.number().int().positive().optional(),
  tool: z.string().default('Static Analysis'),
  suggestion: FindingSuggestionSchema.optional(),
});
export type Finding = z.infer<typeof FindingSchema>;

export const FindingCountsSchema = z.object({
  critical: z.number().int().min(0),
  error: z.number().int().min(0),
  warning: z.number().int().min(0),
  info: z.number().int().min(0),
  total: z.number().int().min(0),
});
export type FindingCounts = z.infer<typeof FindingCountsSchema>;

export const SarifReportSchema = z.object({
  counts: FindingCountsSchema,
  findings: z.array(FindingSchema),
});
export type SarifReport = z.infer<typeof SarifReportSchema>;

export const TestFailureSchema = z.object({
  name: z.string(),
  classname: z.string().default(''),
  file: z.string().optional(),
  message: z.string(),
  snippet: z.string(),
});
export type TestFailure = z.infer<typeof TestFailureSchema>;

export const TestResultSchema = z.object({
  total: z.number().int().min(0),
  passed: z.number().int().min(0),
  failed: z.number().int().min(0),
  skipped: z.number().int().min(0),
  errors: z.number().int().min(0),
  duration: z.number().min(0),
  failures: z.array(TestFailureSchema),
});
export type TestResult = z.infer<typeof TestResultSchema>;

export const CoverageMetricsSchema = z.object({
  linesTotal: z.number().int().min(0),
  linesCovered: z.number().int().min(0),
  percentage: z.number().min(0).max(100),
});
export type CoverageMetrics = z.infer<typeof CoverageMetricsSchema>;

export const DirectoryCoverageSchema = z.object({
  directory: z.string(),
  linesTotal: z.number().int().min(0),
  linesCovered: z.number().int().min(0),
  percentage: z.number().min(0).max(100),
});
export type DirectoryCoverage = z.infer<typeof DirectoryCoverageSchema>;

export const UncoveredRangeSchema = z.object({
  file: z.string(),
  ranges: z.array(z.string()),
});
export type UncoveredRange = z.infer<typeof UncoveredRangeSchema>;

export const CoverageReportSchema = z.object({
  overall: CoverageMetricsSchema,
  diffCoverage: CoverageMetricsSchema,
  uncoveredDiffLines: z.array(UncoveredRangeSchema),
  directoryBreakdown: z.array(DirectoryCoverageSchema),
});
export type CoverageReport = z.infer<typeof CoverageReportSchema>;

export const GateStatusSchema = z.enum(['passed', 'failed', 'skipped']);
export type GateStatus = z.infer<typeof GateStatusSchema>;

export const GateResultSchema = z.object({
  name: z.string(),
  command: z.string().default(''),
  status: GateStatusSchema,
  duration: z.number().min(0),
  errorSnippet: z.string().optional(),
  metrics: z.string().optional(),
});
export type GateResult = z.infer<typeof GateResultSchema>;

export const GateResultsReportSchema = z.object({
  gates: z.array(GateResultSchema),
});
export type GateResultsReport = z.infer<typeof GateResultsReportSchema>;

export const PrSizeSchema = z.enum(['XS', 'S', 'M', 'L', 'XL']);
export type PrSize = z.infer<typeof PrSizeSchema>;

export const GitCommitSchema = z.object({
  hash: z.string(),
  author: z.string(),
  message: z.string(),
});
export type GitCommit = z.infer<typeof GitCommitSchema>;

export const ChangedFileDiffSchema = z.object({
  path: z.string(),
  additions: z.number().int().min(0),
  deletions: z.number().int().min(0),
  category: z.string(),
});
export type ChangedFileDiff = z.infer<typeof ChangedFileDiffSchema>;

export const DiffStatsSchema = z.object({
  filesChanged: z.number().int().min(0),
  additions: z.number().int().min(0),
  deletions: z.number().int().min(0),
  size: PrSizeSchema,
  changedFiles: z.array(ChangedFileDiffSchema),
  commits: z.array(GitCommitSchema),
});
export type DiffStats = z.infer<typeof DiffStatsSchema>;
