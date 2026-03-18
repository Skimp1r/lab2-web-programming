import type { Telegraf } from 'telegraf';
import { getLastMenuMessageId, setLastMenuMessageId } from './menuState.js';

export async function renderMenu(params: {
  bot: Telegraf;
  chatId: number;
  ctx: any;
  text: string;
  extra?: any;
}): Promise<void> {
  const { bot, chatId, ctx, text, extra } = params;
  const disable_web_page_preview = true;

  // 1) If we're in callback context, always edit that message.
  if (ctx?.callbackQuery?.message?.message_id) {
    const messageId = Number(ctx.callbackQuery.message.message_id);
    setLastMenuMessageId(chatId, messageId);
    await ctx.editMessageText(text, { ...extra, disable_web_page_preview });
    return;
  }

  // 2) Otherwise try to edit last known menu message.
  const lastId = getLastMenuMessageId(chatId);
  if (lastId) {
    try {
      await bot.telegram.editMessageText(chatId, lastId, undefined, text, { ...extra, disable_web_page_preview });
      return;
    } catch {
      // fall through to sending a new menu message
    }
  }

  // 3) Send new menu message and remember it.
  const msg = await ctx.reply(text, { ...extra, disable_web_page_preview });
  if (msg?.message_id) setLastMenuMessageId(chatId, Number(msg.message_id));
}

