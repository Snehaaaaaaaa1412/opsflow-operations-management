import { z } from 'zod';

export const createCommentSchema = z.object({
  body: z
    .object({
      content: z
        .string()
        .trim()
        .min(1, 'Comment content cannot be empty')
        .max(2000, 'Comment content must be at most 2000 characters')
        .optional(),
      body: z
        .string()
        .trim()
        .min(1, 'Comment body cannot be empty')
        .max(2000, 'Comment body must be at most 2000 characters')
        .optional(),
    })
    .refine(
      (data) =>
        (data.content !== undefined && data.content.trim().length > 0) ||
        (data.body !== undefined && data.body.trim().length > 0),
      {
        message: 'Comment content is required and cannot be empty',
        path: ['content'],
      }
    ),
});

export type CreateCommentInput = z.infer<typeof createCommentSchema>['body'];
