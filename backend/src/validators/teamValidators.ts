import { z } from 'zod';

export const createTeamSchema = z.object({
  body: z.object({
    name: z
      .string({ required_error: 'Team name is required' })
      .trim()
      .min(1, 'Team name cannot be empty')
      .max(100, 'Team name must be at most 100 characters'),
  }),
});

export type CreateTeamInput = z.infer<typeof createTeamSchema>['body'];
