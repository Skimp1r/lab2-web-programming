import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { env } from './env.js';
import {
  addToCart,
  createOrderFromCart,
  ensureUser,
  getCartTotals,
  getOrderForUser,
  getProduct,
  listCartItems,
  listCategories,
  listOrders,
  listProducts,
  markOrderPaid,
} from './db.js';
import { cartView, categoriesView, mainMenuKb, orderCard, ordersView, productCard, productsView } from './ui.js';

const bot = new Telegraf(env.BOT_TOKEN);
type Ctx = Parameters<(typeof bot)['command']>[1] extends (ctx: infer T) => any ? T : any;

async function auth(ctx: Ctx): Promise<{ userId: number }> {
  const u = ctx.from;
  if (!u) throw new Error('No ctx.from');
  return await ensureUser({
    telegramId: u.id,
    username: u.username,
    firstName: u.first_name,
    lastName: u.last_name,
  });
}

async function safeEditOrSend(ctx: any, text: string, extra?: any) {
  try {
    if (ctx.callbackQuery?.message) {
      await ctx.editMessageText(text, { ...extra, disable_web_page_preview: true });
      return;
    }
  } catch {
    // ignore and fallback to send
  }
  await ctx.reply(text, { ...extra, disable_web_page_preview: true });
}

bot.start(async (ctx) => {
  await auth(ctx);
  await ctx.reply(
    `Здравствуйте! Это простой интернет‑магазин.\n\nВыберите раздел:`,
    { reply_markup: mainMenuKb() },
  );
});

bot.command('help', async (ctx) => {
  await auth(ctx);
  await ctx.reply(
    `Команды:\n/start — меню\n/help — помощь\n\nНавигация внутри бота идёт кнопками.`,
    { reply_markup: mainMenuKb() },
  );
});

bot.on(message('text'), async (ctx) => {
  const text = ctx.message.text.trim().toLowerCase();
  if (text === 'меню' || text === 'menu') {
    await auth(ctx);
    await ctx.reply('Главное меню:', { reply_markup: mainMenuKb() });
  }
});

bot.action('home', async (ctx) => {
  await ctx.answerCbQuery();
  await auth(ctx);
  await safeEditOrSend(ctx, 'Главное меню:', { reply_markup: mainMenuKb() });
});

bot.action('about', async (ctx) => {
  await ctx.answerCbQuery();
  await auth(ctx);
  await safeEditOrSend(
    ctx,
    `ℹ️ О приложении\n\nЛР2: вопросно‑ответная система на Telegram Bot API.\nФункции: категории, товары, корзина, заказы, оплата (Telegram Payments), пагинация по 5.`,
    { reply_markup: mainMenuKb() },
  );
});

bot.action('help', async (ctx) => {
  await ctx.answerCbQuery();
  await auth(ctx);
  await safeEditOrSend(
    ctx,
    `❓ Помощь\n\n- Нажмите "Категории" → выберите категорию → товар.\n- В карточке товара добавляйте в корзину.\n- В корзине оформите заказ и оплатите.\n\nПагинация: кнопки ◀️/▶️.`,
    { reply_markup: mainMenuKb() },
  );
});

bot.action(/^cat:list:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  await auth(ctx);
  const page = Number(ctx.match[1] ?? 0);
  const { items, total } = await listCategories(page);
  const view = categoriesView(items, total, page);
  await safeEditOrSend(ctx, view.text, { reply_markup: view.reply_markup });
});

bot.action(/^prod:list:(\d+):(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  await auth(ctx);
  const categoryId = Number(ctx.match[1]);
  const page = Number(ctx.match[2]);
  const { items, total } = await listProducts(categoryId, page);
  const view = productsView({ categoryId, products: items, total, page });
  await safeEditOrSend(ctx, view.text, { reply_markup: view.reply_markup });
});

bot.action(/^prod:open:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  await auth(ctx);
  const productId = Number(ctx.match[1]);
  const p = await getProduct(productId);
  if (!p || !p.is_active) {
    await safeEditOrSend(ctx, 'Товар не найден или недоступен.', { reply_markup: mainMenuKb() });
    return;
  }
  const view = productCard(p);
  await safeEditOrSend(ctx, view.text, { reply_markup: view.reply_markup });
});

bot.action(/^cart:add:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery('Добавлено');
  const { userId } = await auth(ctx);
  const productId = Number(ctx.match[1]);
  await addToCart(userId, productId, 1);
});

bot.action(/^cart:dec:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery('Изменено');
  const { userId } = await auth(ctx);
  const productId = Number(ctx.match[1]);
  await addToCart(userId, productId, -1);
});

bot.action(/^cart:del:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery('Удалено');
  const { userId } = await auth(ctx);
  const productId = Number(ctx.match[1]);
  await addToCart(userId, productId, -999999);
});

bot.action(/^cart:view:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const { userId } = await auth(ctx);
  const page = Number(ctx.match[1] ?? 0);
  const [{ items, total }, totals] = await Promise.all([listCartItems(userId, page), getCartTotals(userId)]);
  const view = cartView({
    items,
    totalItems: total,
    page,
    cartTotalMinor: totals.totalMinor,
    currency: totals.currency,
  });
  await safeEditOrSend(ctx, view.text, { reply_markup: view.reply_markup });
});

bot.action('cart:checkout', async (ctx) => {
  await ctx.answerCbQuery();
  const { userId } = await auth(ctx);
  const created = await createOrderFromCart(userId);
  if (!created) {
    await safeEditOrSend(ctx, 'Корзина пуста.', { reply_markup: mainMenuKb() });
    return;
  }
  const order = await getOrderForUser(userId, created.orderId);
  if (!order) {
    await safeEditOrSend(ctx, 'Не удалось создать заказ.', { reply_markup: mainMenuKb() });
    return;
  }
  const view = orderCard(order);
  await safeEditOrSend(ctx, `✅ Заказ создан.\n\n${view.text}`, { reply_markup: view.reply_markup });
});

bot.action(/^ord:list:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const { userId } = await auth(ctx);
  const page = Number(ctx.match[1] ?? 0);
  const { items, total } = await listOrders(userId, page);
  const view = ordersView({ items, total, page });
  await safeEditOrSend(ctx, view.text, { reply_markup: view.reply_markup });
});

bot.action(/^ord:open:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const { userId } = await auth(ctx);
  const orderId = Number(ctx.match[1]);
  const order = await getOrderForUser(userId, orderId);
  if (!order) {
    await safeEditOrSend(ctx, 'Заказ не найден.', { reply_markup: mainMenuKb() });
    return;
  }
  const view = orderCard(order);
  await safeEditOrSend(ctx, view.text, { reply_markup: view.reply_markup });
});

bot.action(/^pay:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const { userId } = await auth(ctx);
  const orderId = Number(ctx.match[1]);
  const order = await getOrderForUser(userId, orderId);
  if (!order) {
    await safeEditOrSend(ctx, 'Заказ не найден.', { reply_markup: mainMenuKb() });
    return;
  }
  if (order.status !== 'WAITING_PAYMENT') {
    await safeEditOrSend(ctx, 'Этот заказ нельзя оплатить (не тот статус).', { reply_markup: mainMenuKb() });
    return;
  }
  if (!env.PAYMENTS_PROVIDER_TOKEN) {
    await safeEditOrSend(
      ctx,
      `Оплата не настроена: заполните PAYMENTS_PROVIDER_TOKEN в .env.\n\nПока можете проверить остальные разделы.`,
      { reply_markup: mainMenuKb() },
    );
    return;
  }

  const payload = `order:${order.id}`;
  await ctx.replyWithInvoice({
    title: `Заказ #${order.id}`,
    description: `Оплата заказа #${order.id}`,
    payload,
    provider_token: env.PAYMENTS_PROVIDER_TOKEN,
    currency: order.currency,
    prices: [{ label: `Заказ #${order.id}`, amount: order.total_minor }],
  });
});

bot.on('pre_checkout_query', async (ctx) => {
  const { userId } = await auth(ctx as any);
  const payload = ctx.preCheckoutQuery.invoice_payload;
  const m = /^order:(\d+)$/.exec(payload);
  if (!m) {
    await ctx.answerPreCheckoutQuery(false, 'Неверный payload.');
    return;
  }
  const orderId = Number(m[1]);
  const order = await getOrderForUser(userId, orderId);
  if (!order || order.status !== 'WAITING_PAYMENT') {
    await ctx.answerPreCheckoutQuery(false, 'Заказ не найден или уже оплачен.');
    return;
  }
  await ctx.answerPreCheckoutQuery(true);
});

bot.on(message('successful_payment'), async (ctx) => {
  const { userId } = await auth(ctx);
  const payload = ctx.message.successful_payment.invoice_payload;
  const m = /^order:(\d+)$/.exec(payload);
  if (!m) return;
  const orderId = Number(m[1]);

  await markOrderPaid({
    userId,
    orderId,
    telegramPaymentChargeId: ctx.message.successful_payment.telegram_payment_charge_id,
    providerPaymentChargeId: ctx.message.successful_payment.provider_payment_charge_id,
  });

  const order = await getOrderForUser(userId, orderId);
  if (!order) return;
  const view = orderCard(order);
  await ctx.reply(`✅ Оплата прошла успешно!\n\n${view.text}`, { reply_markup: view.reply_markup });
});

bot.catch((err) => {
  console.error('Bot error', err);
});

await bot.launch();
console.log('Bot started (polling).');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

