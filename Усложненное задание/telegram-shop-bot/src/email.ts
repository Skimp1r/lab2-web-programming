import nodemailer from 'nodemailer';
import { env } from './env.js';

export async function sendAdminOrderEmail(params: {
  orderId: number;
  userTelegramId: number;
  totalText: string;
  itemsText: string;
}): Promise<'sent' | 'skipped'> {
  if (!env.ADMIN_EMAIL || !env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) return 'skipped';

  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });

  const subject = `Новый заказ #${params.orderId}`;
  const text =
    `Заказ #${params.orderId}\n` +
    `Пользователь Telegram ID: ${params.userTelegramId}\n\n` +
    `${params.itemsText}\n\n` +
    `Итого: ${params.totalText}\n`;

  await transporter.sendMail({
    from: env.SMTP_USER,
    to: env.ADMIN_EMAIL,
    subject,
    text,
  });

  return 'sent';
}

