import type { Context } from 'telegraf';
import { env } from '../env.js';

export function isAdmin(ctx: Context): boolean {
  const id = ctx.from?.id;
  if (!id) return false;
  return env.ADMIN_TELEGRAM_IDS.includes(id);
}

