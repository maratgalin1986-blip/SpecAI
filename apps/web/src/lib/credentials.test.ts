import { beforeEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import { LOGIN_LIMIT_PER_EMAIL, LOGIN_LIMIT_PER_IP, LoginError } from './loginErrors';

const findUserByEmail = vi.fn();
vi.mock('@/lib/findUserByEmail', () => ({
  findUserByEmail: (...args: unknown[]) => findUserByEmail(...args),
}));

const { authenticateWithCredentials } = await import('./credentials');

const passwordHash = bcrypt.hashSync('correct-horse', 4);
const user = {
  id: 'u1',
  email: 'dispatcher@example.com',
  name: 'Диспетчер',
  role: 'PROVIDER_ADMIN',
  companyId: 'c1',
  passwordHash,
};

let counter = 0;
const freshEmail = () => `login-test-${Date.now()}-${(counter += 1)}@example.com`;

describe('authenticateWithCredentials: the login limit counts failures only', () => {
  beforeEach(() => {
    findUserByEmail.mockReset();
    findUserByEmail.mockImplementation(async (email: string) => ({ ...user, email }));
  });

  it('lets a correct password through more often than the limit', async () => {
    const email = freshEmail();
    const ip = `10.0.0.${counter}`;
    for (let i = 0; i < LOGIN_LIMIT_PER_IP.limit + 2; i += 1) {
      const result = await authenticateWithCredentials(
        { email, password: 'correct-horse' },
        { ip },
      );
      expect(result?.id).toBe('u1');
    }
  });

  it('locks the e-mail after the limit of wrong passwords, and a success resets it', async () => {
    const email = freshEmail();
    for (let i = 0; i < LOGIN_LIMIT_PER_EMAIL.limit; i += 1) {
      expect(await authenticateWithCredentials({ email, password: 'wrong' })).toBeNull();
    }
    await expect(
      authenticateWithCredentials({ email, password: 'correct-horse' }),
    ).rejects.toBeInstanceOf(LoginError);

    // A few failures, then the right password: the counter starts over.
    const other = freshEmail();
    for (let i = 0; i < LOGIN_LIMIT_PER_EMAIL.limit - 1; i += 1) {
      expect(await authenticateWithCredentials({ email: other, password: 'wrong' })).toBeNull();
    }
    const success = await authenticateWithCredentials({ email: other, password: 'correct-horse' });
    expect(success?.id).toBe('u1');
    for (let i = 0; i < LOGIN_LIMIT_PER_EMAIL.limit - 1; i += 1) {
      expect(await authenticateWithCredentials({ email: other, password: 'wrong' })).toBeNull();
    }
  });

  it('counts an unknown e-mail and bad input as failures of the address', async () => {
    findUserByEmail.mockResolvedValue(null);
    const ip = `10.1.0.${counter}`;
    for (let i = 0; i < LOGIN_LIMIT_PER_IP.limit; i += 1) {
      const bad = i % 2 === 0 ? { email: freshEmail(), password: 'x' } : { email: 'not-an-email' };
      expect(await authenticateWithCredentials(bad, { ip })).toBeNull();
    }
    await expect(
      authenticateWithCredentials({ email: freshEmail(), password: 'x' }, { ip }),
    ).rejects.toBeInstanceOf(LoginError);
  });
});
