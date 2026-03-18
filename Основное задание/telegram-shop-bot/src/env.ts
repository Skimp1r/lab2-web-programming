import 'dotenv/config';

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export const env = {
  BOT_TOKEN: req('BOT_TOKEN'),
  DB_HOST: req('DB_HOST'),
  DB_PORT: Number(process.env.DB_PORT ?? 3306),
  DB_USER: req('DB_USER'),
  DB_PASSWORD: process.env.DB_PASSWORD ?? '',
  DB_NAME: req('DB_NAME'),
  PAYMENTS_PROVIDER_TOKEN: process.env.PAYMENTS_PROVIDER_TOKEN ?? '',
  PAYMENTS_CURRENCY: process.env.PAYMENTS_CURRENCY ?? 'RUB',
};

