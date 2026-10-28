import { z } from 'zod';

export const LivenessResponse = z.object({
  status: z.literal('ok'),
});
export type LivenessResponse = z.infer<typeof LivenessResponse>;

export const DependencyCheck = z.object({
  status: z.enum(['up', 'down']),
  latencyMs: z.number().nonnegative(),
  /** Short, non-sensitive reason when `down`. */
  reason: z.string().optional(),
});
export type DependencyCheck = z.infer<typeof DependencyCheck>;

export const ReadinessResponse = z.object({
  status: z.enum(['ready', 'not_ready']),
  checks: z.object({
    database: DependencyCheck,
    queue: DependencyCheck,
  }),
});
export type ReadinessResponse = z.infer<typeof ReadinessResponse>;
