import { z } from 'zod';

/**
 * Fail fast and loudly on a missing secret — never start with a default one.
 */
const schema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'staging', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().default(4000),
  LOG_LEVEL: z.string().default('info'),

  APP_URL: z.string().url().default('http://localhost:8080'),
  WEB_ORIGIN: z.string().default('http://localhost:8080'),

  MONGO_URI: z.string().min(1),
  /**
   * Empty is allowed for local development only: the API then uses an
   * in-process stand-in (see lib/memoryRedis.ts) and turns BullMQ off. The
   * check below refuses to start production that way.
   */
  REDIS_URL: z.string().optional().default(''),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().default(7),
  COOKIE_DOMAIN: z.string().optional().default(''),

  CLOUDINARY_CLOUD_NAME: z.string().optional().default(''),
  CLOUDINARY_API_KEY: z.string().optional().default(''),
  CLOUDINARY_API_SECRET: z.string().optional().default(''),
  CLOUDINARY_FOLDER: z.string().default('chandramari-material'),

  MAIL_PROVIDER: z.enum(['smtp', 'brevo', 'resend']).default('smtp'),
  MAIL_FROM: z.string().default('Chandramari <noreply@example.com>'),
  MAIL_API_KEY: z.string().optional().default(''),
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_SECURE: z
    .string()
    .optional()
    .default('false')
    .transform((v) => v === 'true'),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),

  PAYMENT_APP_BASE_URL: z.string().optional().default(''),
  PAYMENT_APP_TOKEN: z.string().optional().default(''),
  /**
   * Single sign-on with the Payment app. Where this API can reach it server to
   * server (http://payment:8787 in Docker, http://localhost:5173 in dev), and the
   * name of its session cookie. Empty turns SSO off: Material logins only.
   */
  PAYMENT_INTERNAL_URL: z.string().optional().default(''),
  PAYMENT_SESSION_COOKIE: z.string().default('cot_session'),
  /** The path the web app is served under behind the gateway, e.g. /material. */
  PUBLIC_BASE_PATH: z
    .string()
    .optional()
    .default('')
    .transform((v) => v.replace(/\/+$/, '')),

  SEED_ALLOWED: z
    .string()
    .optional()
    .default('false')
    .transform((v) => v === 'true'),
  BULL_BOARD_ENABLED: z
    .string()
    .optional()
    .default('false')
    .transform((v) => v === 'true'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  // eslint-disable-next-line no-console
  console.error(`Invalid environment configuration:\n${issues}`);
  process.exit(1);
}

export const env = parsed.data;

export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

/**
 * A real Redis means shared rate limits, shared idempotency keys and working
 * background jobs. Production gets none of those without it, so refuse rather
 * than start in a state that looks healthy and quietly is not.
 */
if (isProd && !env.REDIS_URL) {
  // eslint-disable-next-line no-console
  console.error('REDIS_URL is required in production — refusing to start');
  process.exit(1);
}

/** False when running against the in-memory stand-in (no BullMQ, no sharing). */
export const redisEnabled = Boolean(env.REDIS_URL);

/** Seeding is only ever allowed outside production (§9). */
export const seedAllowed = env.SEED_ALLOWED && !isProd;

export const cloudinaryConfigured = Boolean(
  env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET,
);

export const mailConfigured =
  env.MAIL_PROVIDER === 'smtp'
    ? Boolean(env.SMTP_HOST)
    : Boolean(env.MAIL_API_KEY);

/** Payment app sign-in is accepted here (see lib/paymentSso.ts). */
export const ssoEnabled = Boolean(env.PAYMENT_INTERNAL_URL);
