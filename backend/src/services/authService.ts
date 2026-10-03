import bcrypt from 'bcrypt';
import { IUserRepository, userRepository, UserEntity } from '../repositories/userRepository';
import { ConflictError } from '../utils/errors';
import { RegisterInput } from '../validators/authValidators';

const BCRYPT_SALT_ROUNDS = 10;

export interface SafeUser {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
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
