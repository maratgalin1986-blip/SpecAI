export { default } from 'next-auth/middleware';

export const config = {
  // /provider handles guests itself (sends them to the login page).
  matcher: ['/dashboard/:path*'],
};
