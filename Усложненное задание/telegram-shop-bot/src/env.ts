import 'dotenv/config';

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export const env = {
  BOT_TOKEN: req('BOT_TOKEN'),
  BOT_USERNAME: process.env.BOT_USERNAME ?? '',
  DB_HOST: req('DB_HOST'),
  DB_PORT: Number(process.env.DB_PORT ?? 3306),
  DB_USER: req('DB_USER'),
  DB_PASSWORD: process.env.DB_PASSWORD ?? '',
  DB_NAME: req('DB_NAME'),
  PAYMENTS_PROVIDER_TOKEN: process.env.PAYMENTS_PROVIDER_TOKEN ?? '',
  PAYMENTS_CURRENCY: process.env.PAYMENTS_CURRENCY ?? 'RUB',
  ADMIN_EMAIL: process.env.ADMIN_EMAIL ?? '',
  SMTP_HOST: process.env.SMTP_HOST ?? '',
  SMTP_PORT: Number(process.env.SMTP_PORT ?? 587),
  SMTP_USER: process.env.SMTP_USER ?? '',
  SMTP_PASS: process.env.SMTP_PASS ?? '',
  ADMIN_TELEGRAM_IDS: (process.env.ADMIN_TELEGRAM_IDS ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n) && n > 0),
};

