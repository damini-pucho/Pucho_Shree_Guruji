/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

export default {
  poweredByHeader: false,
  serverExternalPackages: ['@node-rs/argon2', 'pg'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};
