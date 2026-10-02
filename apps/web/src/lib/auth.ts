import type { AuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { prisma } from '@specai/database';
import { authenticateWithCredentials } from '@/lib/credentials';
import { isTokenIssuedBeforePasswordChange } from '@/lib/passwordChanged';
import { clientIpFrom } from '@/lib/loginErrors';

export const authOptions: AuthOptions = {
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      authorize(credentials, req) {
        // Общая проверка с POST /api/mobile/login (см. lib/credentials.ts).
        // LoginError (лимит попыток, база недоступна) доходит до страницы входа
        // как result.error с кодом, а не как «неверный пароль».
        const headers = (req?.headers ?? {}) as Record<string, string | undefined>;
        return authenticateWithCredentials(credentials, {
          ip: clientIpFrom((name) => headers[name]),
        });
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.companyId = user.companyId;
        return token;
      }

      // Повторный запрос с уже выданным токеном: проверяем, не менялся ли пароль после выдачи.
      if (token.id && typeof token.iat === 'number') {
        const record = await prisma.user.findUnique({
          where: { id: token.id },
          select: { passwordChangedAt: true },
        });
        if (!record || isTokenIssuedBeforePasswordChange(token.iat, record.passwordChangedAt)) {
          // Исключение в jwt-callback: next-auth очищает cookie сессии и возвращает пустую сессию.
          throw new Error('Session invalidated: password changed after token was issued');
        }
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.companyId = token.companyId;
      }
      return session;
    },
  },
};
