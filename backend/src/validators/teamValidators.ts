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

export const addTeamMemberSchema = z.object({
  body: z.object({
    userId: z
      .string({ required_error: 'User ID is required' })
      .trim()
      .min(1, 'User ID cannot be empty'),
    role: z
      .enum(['ADMIN', 'TEAM_LEAD', 'MEMBER'], {
        errorMap: () => ({
          message: 'Role must be one of: ADMIN, TEAM_LEAD, MEMBER',
        }),
      })
      .optional()
      .default('MEMBER'),
  }),
});

export type AddTeamMemberInput = z.infer<typeof addTeamMemberSchema>['body'];

export const updateTeamMemberRoleSchema = z.object({
  body: z.object({
    role: z.enum(['ADMIN', 'TEAM_LEAD', 'MEMBER'], {
      errorMap: () => ({
        message: 'Role must be one of: ADMIN, TEAM_LEAD, MEMBER',
      }),
    }),
  }),
});

export type UpdateTeamMemberRoleInput = z.infer<
  typeof updateTeamMemberRoleSchema
>['body'];

