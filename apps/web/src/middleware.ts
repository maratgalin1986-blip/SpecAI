export { default } from 'next-auth/middleware';

export const config = {
  // /provider handles guests itself (shows a landing page for equipment owners).
  matcher: ['/dashboard/:path*'],
};
