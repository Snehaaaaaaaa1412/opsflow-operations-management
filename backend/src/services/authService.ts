import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { IUserRepository, userRepository, UserEntity } from '../repositories/userRepository';
import { ConflictError, UnauthorizedError } from '../utils/errors';
import { RegisterInput, LoginInput } from '../validators/authValidators';

const BCRYPT_SALT_ROUNDS = 10;

export interface SafeUser {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthResponse {
  token: string;
  user: SafeUser;
}

export class AuthService {
  constructor(private userRepo: IUserRepository = userRepository) {}

  /**
   * Registers a new user account.
   * Normalizes email, validates uniqueness, hashes password, and persists.
   * Returns a safe user object without password hash.
   */
  async register(input: RegisterInput): Promise<SafeUser> {
    const normalizedEmail = input.email.trim().toLowerCase();

    // Verify email uniqueness before hashing/persisting
    const existingUser = await this.userRepo.findByEmail(normalizedEmail);
    if (existingUser) {
      throw new ConflictError(
        'An account with this email already exists.',
        'EMAIL_ALREADY_EXISTS'
      );
    }

    // Secure password hashing
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_SALT_ROUNDS);

    // Persist new user record
    const newUser = await this.userRepo.create({
      name: input.name.trim(),
      email: normalizedEmail,
      passwordHash,
    });

    return this.toSafeUser(newUser);
  }

  /**
   * Authenticates a user with email and password.
   * Compares password with bcrypt, creates signed JWT, and returns token with safe user.
   * Returns generic 401 error for both non-existent user and wrong password to prevent enumeration.
   */
  async login(input: LoginInput): Promise<AuthResponse> {
    const normalizedEmail = input.email.trim().toLowerCase();

    // Find user by normalized email
    const user = await this.userRepo.findByEmail(normalizedEmail);
    if (!user) {
      throw new UnauthorizedError(
        'Invalid email or password.',
        'INVALID_CREDENTIALS'
      );
    }

    // Compare supplied password with stored bcrypt hash
    const isMatch = await bcrypt.compare(input.password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedError(
        'Invalid email or password.',
        'INVALID_CREDENTIALS'
      );
    }

    // Create signed JWT with minimal payload (authenticated user id in sub)
    const token = jwt.sign(
      { sub: user.id },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn as jwt.SignOptions['expiresIn'] }
    );

    return {
      token,
      user: this.toSafeUser(user),
    };
  }

  /**
   * Transforms a User entity into a safe representation (omitting passwordHash).
   */
  public toSafeUser(user: UserEntity): SafeUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}

export const authService = new AuthService();
