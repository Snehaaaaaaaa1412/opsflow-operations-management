import { Request, Response, NextFunction } from 'express';
import {
  CommentService,
  commentService as defaultCommentService,
} from '../services/commentService';

export class CommentController {
  constructor(private service: CommentService = defaultCommentService) {}

  create = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const rawWorkItemId = req.params.id || req.params.workItemId;
      const workItemId = Array.isArray(rawWorkItemId)
        ? rawWorkItemId[0]!
        : rawWorkItemId!;
      const authorId = req.user!.id;
      const content = req.body.content ?? req.body.body;

      const comment = await this.service.addComment(
        workItemId,
        authorId,
        content
      );

      res.status(201).json({
        data: comment,
      });
    } catch (error) {
      next(error);
    }
  };

  list = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const rawWorkItemId = req.params.id || req.params.workItemId;
      const workItemId = Array.isArray(rawWorkItemId)
        ? rawWorkItemId[0]!
        : rawWorkItemId!;
      const requesterId = req.user!.id;

      const comments = await this.service.getComments(
        workItemId,
        requesterId
      );

      res.status(200).json({
        data: comments,
      });
    } catch (error) {
      next(error);
    }
  };

  delete = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const rawWorkItemId = req.params.id || req.params.workItemId;
      const workItemId = Array.isArray(rawWorkItemId)
        ? rawWorkItemId[0]!
        : rawWorkItemId!;
      const rawCommentId = req.params.commentId;
      const commentId = Array.isArray(rawCommentId)
        ? rawCommentId[0]!
        : rawCommentId!;
      const requesterId = req.user!.id;

      await this.service.deleteComment(workItemId, commentId, requesterId);

      res.status(200).json({
        data: { message: 'Comment deleted successfully.' },
      });
    } catch (error) {
      next(error);
    }
  };
}

export const commentController = new CommentController();
