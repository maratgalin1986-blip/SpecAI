import type { AuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { prisma } from '@specai/database';
import { authenticateWithCredentials } from '@/lib/credentials';
import { isTokenIssuedBeforePasswordChange } from '@/lib/passwordChanged';
import { clientIpFrom } from '@/lib/loginErrors';
import { verifyQuickLoginToken } from '@/lib/quickProvider';

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
    // «Встать на линию — попробовать бесплатно»: вход сразу после лёгкой формы
    // по короткому подписанному токену (lib/quickProvider.ts), без пароля.
    CredentialsProvider({
      id: 'quick',
      name: 'Quick',
      credentials: { token: { label: 'Token', type: 'text' } },
      async authorize(credentials) {
        const userId = await verifyQuickLoginToken(credentials?.token);
        if (!userId) return null;
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            companyId: true,
            quickSignup: true,
          },
        });
        if (!user?.quickSignup) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          companyId: user.companyId,
        };
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
          select: { passwordChangedAt: true, role: true, companyId: true },
        });
        if (!record || isTokenIssuedBeforePasswordChange(token.iat, record.passwordChangedAt)) {
          // Исключение в jwt-callback: next-auth очищает cookie сессии и возвращает пустую сессию.
          throw new Error('Session invalidated: password changed after token was issued');
        }
        // «Стать исполнителем» меняет роль и компанию: сессия берёт их из базы,
        // без повторного входа.
        token.role = record.role;
        token.companyId = record.companyId;
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
