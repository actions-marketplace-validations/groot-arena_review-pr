import { z } from 'zod';
import { FindingSchema, FindingSeveritySchema } from './reports.js';

export const InlineReviewCommentSchema = z.object({
  path: z.string(),
  line: z.number().int().positive(),
  side: z.literal('RIGHT').default('RIGHT'),
  body: z.string(),
  ruleId: z.string(),
  severity: FindingSeveritySchema,
});
export type InlineReviewComment = z.infer<typeof InlineReviewCommentSchema>;

export const FormattedReviewResultSchema = z.object({
  inlineComments: z.array(InlineReviewCommentSchema),
  overflowFindings: z.array(FindingSchema),
  infoFindings: z.array(FindingSchema),
  totalEligible: z.number().int().min(0),
});
export type FormattedReviewResult = z.infer<typeof FormattedReviewResultSchema>;

export const ReviewThreadCommentSchema = z.object({
  id: z.string(),
  body: z.string(),
  path: z.string(),
  line: z.number().nullable(),
  author: z.object({
    login: z.string(),
  }).nullable(),
});
export type ReviewThreadComment = z.infer<typeof ReviewThreadCommentSchema>;

export const ReviewThreadSchema = z.object({
  id: z.string(),
  isResolved: z.boolean(),
  comments: z.object({
    nodes: z.array(ReviewThreadCommentSchema),
  }),
});
export type ReviewThread = z.infer<typeof ReviewThreadSchema>;
