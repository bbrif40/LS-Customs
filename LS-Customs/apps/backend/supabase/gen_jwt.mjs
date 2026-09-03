import crypto from 'node:crypto';

const header = { alg: 'HS256', typ: 'JWT' };
const now = Math.floor(Date.now() / 1000);
const payload = {
  aud: 'authenticated',
  iss: 'http://127.0.0.1:55421/auth/v1',
  sub: '11111111-1111-1111-1111-111111111111',
  email: 'alice@ls.test',
  role: 'authenticated',
  exp: now + 3600,
  iat: now,
  app_metadata: { role: 'customer' },
};

const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
const data = headerB64 + '.' + payloadB64;
const secret = 'super-secret-jwt-token-with-at-least-32-characters-long';
const signature = crypto.createHmac('sha256', secret).update(data).digest('base64url');

console.log(data + '.' + signature);
