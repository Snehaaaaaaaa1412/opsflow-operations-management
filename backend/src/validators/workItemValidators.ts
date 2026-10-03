import { z } from 'zod';

export const createWorkItemSchema = z.object({
  body: z.object({
    title: z
      .string({ required_error: 'Title is required' })
      .trim()
      .min(1, 'Title cannot be empty')
      .max(200, 'Title must be at most 200 characters'),
    description: z
      .string()
      .trim()
      .max(5000, 'Description must be at most 5000 characters')
      .optional()
      .nullable(),
    priority: z
      .enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT'], {
        errorMap: () => ({
          message: 'Priority must be one of: LOW, MEDIUM, HIGH, URGENT',
        }),
      })
      .optional()
      .default('MEDIUM'),
    assigneeId: z
      .string()
      .trim()
      .min(1, 'Assignee ID cannot be empty')
      .optional()
      .nullable(),
  }),
});

export type CreateWorkItemInput = z.infer<typeof createWorkItemSchema>['body'];

export const updateWorkItemSchema = z.object({
  body: z
    .object({
      version: z
        .number({ required_error: 'Version is required' })
        .int('Version must be an integer')
        .positive('Version must be a positive integer'),
      title: z
        .string()
        .trim()
        .min(1, 'Title cannot be empty')
        .max(200, 'Title must be at most 200 characters')
        .optional(),
      description: z
        .string()
        .trim()
        .max(5000, 'Description must be at most 5000 characters')
        .optional()
        .nullable(),
      priority: z
        .enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT'], {
          errorMap: () => ({
            message: 'Priority must be one of: LOW, MEDIUM, HIGH, URGENT',
          }),
        })
        .optional(),
      assigneeId: z
        .string()
        .trim()
        .min(1, 'Assignee ID cannot be empty')
        .optional()
        .nullable(),
    })
    .refine(
      (data) =>
        data.title !== undefined ||
        data.description !== undefined ||
        data.priority !== undefined ||
        data.assigneeId !== undefined,
      {
        message: 'At least one field must be provided for update',
      }
    ),
});

export type UpdateWorkItemInput = z.infer<typeof updateWorkItemSchema>['body'];

export const transitionWorkItemSchema = z.object({
  body: z.object({
    status: z.enum(['OPEN', 'IN_PROGRESS', 'BLOCKED', 'RESOLVED', 'CLOSED'], {
      errorMap: () => ({
        message:
          'Status must be one of: OPEN, IN_PROGRESS, BLOCKED, RESOLVED, CLOSED',
      }),
    }),
    version: z
      .number({ required_error: 'Version is required' })
      .int('Version must be an integer')
      .positive('Version must be a positive integer'),
  }),
});

export type TransitionWorkItemInput = z.infer<
  typeof transitionWorkItemSchema
>['body'];
