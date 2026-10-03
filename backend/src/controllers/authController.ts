import { Request, Response, NextFunction } from 'express';
import { authService, AuthService } from '../services/authService';

/**
 * Controller handling authentication endpoints.
 * Keeps business logic isolated inside AuthService.
 */
export class AuthController {
  constructor(private service: AuthService = authService) {}

  register = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const safeUser = await this.service.register(req.body);
      res.status(201).json({
        data: safeUser,
      });
    } catch (error) {
      next(error);
    }
  };
}

export const authController = new AuthController();
