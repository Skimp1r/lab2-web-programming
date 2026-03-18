import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { env } from './env.js';
import {
  addToCart,
  adminCreateCategory,
  adminCreateProduct,
  adminDeleteCategory,
  adminDeleteProduct,
  adminListCategories,
  adminListProducts,
  adminRenameCategory,
  adminUpdateProduct,
  confirmOrder,
  createOrderFromCart,
  ensureUser,
  getOrderItems,
  getCartTotals,
  getOrderForUser,
  getProduct,
  listCartItems,
  listCategories,
  listOrders,
  listProducts,
  markOrderPaid,
  statsProfitMinor,
  statsSoldQty,
  statsVisitors,
} from './db.js';
import { cartView, categoriesView, mainMenuKb, orderCard, ordersView, productCard, productsView } from './ui.js';
import { renderMenu } from './render.js';
import { sendAdminOrderEmail } from './email.js';
import { isAdmin } from './admin/guards.js';
import { adminCategoriesView, adminMenuKb, adminPickCategoryForProduct, adminProductsView, adminStatsView } from './admin/ui.js';
import { clearPending, getAdminSession, setPending } from './admin/state.js';

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

function getChatId(ctx: any): number {
  const id = ctx?.chat?.id ?? ctx?.callbackQuery?.message?.chat?.id;
  if (typeof id === 'number') return id;
  throw new Error('No chat id in context');
}

bot.start(async (ctx) => {
  await auth(ctx);
  const payload = (ctx as any).startPayload ? String((ctx as any).startPayload) : '';
  const m = /^product_(\d+)$/.exec(payload);
  if (m) {
    const productId = Number(m[1]);
    const p = await getProduct(productId);
    if (p && p.is_active) {
      const view = productCard(p);
      await renderMenu({ bot, chatId: getChatId(ctx), ctx, text: view.text, extra: { reply_markup: view.reply_markup } });
      return;
    }
  }

  await renderMenu({
    bot,
    chatId: getChatId(ctx),
    ctx,
    text: `Здравствуйте! Это простой интернет‑магазин.\n\nВыберите раздел:`,
    extra: { reply_markup: mainMenuKb() },
  });
});

bot.command('help', async (ctx) => {
  await auth(ctx);
  await renderMenu({
    bot,
    chatId: getChatId(ctx),
    ctx,
    text: `Команды:\n/start — меню\n/help — помощь\n\nНавигация внутри бота идёт кнопками.`,
    extra: { reply_markup: mainMenuKb() },
  });
});

bot.command('admin', async (ctx) => {
  await auth(ctx);
  if (!isAdmin(ctx as any)) {
    await ctx.reply('Нет доступа.');
    return;
  }
  await renderMenu({ bot, chatId: getChatId(ctx), ctx, text: '👮 Админ‑панель', extra: { reply_markup: adminMenuKb() } });
});

bot.action('adm:home', async (ctx) => {
  await ctx.answerCbQuery();
  await auth(ctx as any);
  if (!isAdmin(ctx as any)) return;
  await renderMenu({ bot, chatId: getChatId(ctx), ctx, text: '👮 Админ‑панель', extra: { reply_markup: adminMenuKb() } });
});

bot.action(/^adm:cat:list:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  await auth(ctx as any);
  if (!isAdmin(ctx as any)) return;
  const page = Number(ctx.match[1] ?? 0);
  const { items, total } = await adminListCategories(page);
  const view = adminCategoriesView(items, total, page);
  await renderMenu({ bot, chatId: getChatId(ctx), ctx, text: view.text, extra: { reply_markup: view.reply_markup } });
});

bot.action('adm:cat:create', async (ctx) => {
  await ctx.answerCbQuery();
  await auth(ctx as any);
  if (!isAdmin(ctx as any)) return;
  setPending(ctx.from.id, { type: 'cat:create' });
  await ctx.reply('Введите название новой категории (одной строкой).');
});

bot.action(/^adm:cat:rename:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  await auth(ctx as any);
  if (!isAdmin(ctx as any)) return;
  const categoryId = Number(ctx.match[1]);
  setPending(ctx.from.id, { type: 'cat:rename', categoryId });
  await ctx.reply(`Введите новое название для категории #${categoryId}.`);
});

bot.action(/^adm:cat:del:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  await auth(ctx as any);
  if (!isAdmin(ctx as any)) return;
  const id = Number(ctx.match[1]);
  await adminDeleteCategory(id);
  await ctx.reply(`Категория #${id} удалена.`);
});

bot.action(/^adm:prod:list:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  await auth(ctx as any);
  if (!isAdmin(ctx as any)) return;
  const page = Number(ctx.match[1] ?? 0);
  const { items, total } = await adminListProducts(page);
  const view = adminProductsView(items, total, page);
  await renderMenu({ bot, chatId: getChatId(ctx), ctx, text: view.text, extra: { reply_markup: view.reply_markup } });
});

bot.action('adm:prod:create:pickcat', async (ctx) => {
  await ctx.answerCbQuery();
  await auth(ctx as any);
  if (!isAdmin(ctx as any)) return;
  const { items } = await adminListCategories(0);
  const view = adminPickCategoryForProduct(items);
  await renderMenu({ bot, chatId: getChatId(ctx), ctx, text: view.text, extra: { reply_markup: view.reply_markup } });
});

bot.action(/^adm:prod:create:cat:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  await auth(ctx as any);
  if (!isAdmin(ctx as any)) return;
  const categoryId = Number(ctx.match[1]);
  setPending(ctx.from.id, { type: 'prod:create', categoryId });
  await ctx.reply(
    `Введите товар в формате:\n` +
      `title|price_rub|cost_rub|stock|description(optional)\n` +
      `Пример:\n` +
      `Фильтр салона|490|300|10|Подходит для ...`,
  );
});

bot.action(/^adm:prod:edit:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  await auth(ctx as any);
  if (!isAdmin(ctx as any)) return;
  const productId = Number(ctx.match[1]);
  setPending(ctx.from.id, { type: 'prod:update', productId });
  await ctx.reply(
    `Обновление товара #${productId}.\n` +
      `Введите patch в формате:\n` +
      `title|price_rub|cost_rub|stock|is_active(0/1)|description(optional)\n` +
      `Можно оставить поле пустым, чтобы не менять.\n` +
      `Пример:\n` +
      `|550|320|12|1|`,
  );
});

bot.action(/^adm:prod:del:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  await auth(ctx as any);
  if (!isAdmin(ctx as any)) return;
  const productId = Number(ctx.match[1]);
  await adminDeleteProduct(productId);
  await ctx.reply(`Товар #${productId} удалён.`);
});

bot.action('adm:stats', async (ctx) => {
  await ctx.answerCbQuery();
  await auth(ctx as any);
  if (!isAdmin(ctx as any)) return;

  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const periodFrom = new Date(now);
  periodFrom.setDate(periodFrom.getDate() - 7);

  const [vDay, v7, soldDay, sold7, profDay, prof7] = await Promise.all([
    statsVisitors(dayStart, dayEnd),
    statsVisitors(periodFrom, now),
    statsSoldQty(dayStart, dayEnd),
    statsSoldQty(periodFrom, now),
    statsProfitMinor(dayStart, dayEnd),
    statsProfitMinor(periodFrom, now),
  ]);

  const text =
    `Посетители:\n` +
    `- за день: ${vDay}\n` +
    `- за 7 дней: ${v7}\n\n` +
    `Продано товаров (шт.):\n` +
    `- за день: ${soldDay}\n` +
    `- за 7 дней: ${sold7}\n\n` +
    `Прибыль:\n` +
    `- за день: ${(profDay / 100).toFixed(2)} ${env.PAYMENTS_CURRENCY}\n` +
    `- за 7 дней: ${(prof7 / 100).toFixed(2)} ${env.PAYMENTS_CURRENCY}`;

  const view = adminStatsView(text);
  await renderMenu({ bot, chatId: getChatId(ctx), ctx, text: view.text, extra: { reply_markup: view.reply_markup } });
});

bot.on(message('text'), async (ctx) => {
  // Admin pending actions
  if (isAdmin(ctx as any)) {
    const session = getAdminSession(ctx.from.id);
    if (session.pending) {
      const input = ctx.message.text.trim();
      try {
        if (session.pending.type === 'cat:create') {
          await adminCreateCategory(input);
          clearPending(ctx.from.id);
          await ctx.reply('Категория создана.');
          return;
        }
        if (session.pending.type === 'cat:rename') {
          await adminRenameCategory(session.pending.categoryId, input);
          clearPending(ctx.from.id);
          await ctx.reply(`Категория #${session.pending.categoryId} переименована.`);
          return;
        }
        if (session.pending.type === 'prod:create') {
          const parts = input.split('|');
          const [title, priceRub, costRub, stockStr, desc] = parts.map((x) => x?.trim() ?? '');
          if (!title || !priceRub || !costRub || !stockStr) throw new Error('Неверный формат');
          await adminCreateProduct({
            categoryId: session.pending.categoryId,
            title,
            description: desc || undefined,
            priceMinor: Math.round(Number(priceRub.replace(',', '.')) * 100),
            costMinor: Math.round(Number(costRub.replace(',', '.')) * 100),
            currency: env.PAYMENTS_CURRENCY,
            stock: Number(stockStr),
          });
          clearPending(ctx.from.id);
          await ctx.reply('Товар создан.');
          return;
        }
        if (session.pending.type === 'prod:update') {
          const parts = input.split('|');
          const [title, priceRub, costRub, stockStr, activeStr, desc] = parts.map((x) => x?.trim() ?? '');
          const patch: any = {};
          if (title) patch.title = title;
          if (priceRub) patch.priceMinor = Math.round(Number(priceRub.replace(',', '.')) * 100);
          if (costRub) patch.costMinor = Math.round(Number(costRub.replace(',', '.')) * 100);
          if (stockStr) patch.stock = Number(stockStr);
          if (activeStr) patch.isActive = Number(activeStr);
          if (desc !== undefined && desc !== '') patch.description = desc;
          if (desc === '') patch.description = null;
          await adminUpdateProduct(session.pending.productId, patch);
          clearPending(ctx.from.id);
          await ctx.reply(`Товар #${session.pending.productId} обновлён.`);
          return;
        }
      } catch {
        await ctx.reply('Ошибка. Проверь формат ввода и попробуй снова.');
        return;
      }
    }
  }

  const text = ctx.message.text.trim().toLowerCase();
  if (text === 'меню' || text === 'menu') {
    await auth(ctx);
    await renderMenu({ bot, chatId: getChatId(ctx), ctx, text: 'Главное меню:', extra: { reply_markup: mainMenuKb() } });
  }
});

bot.action('home', async (ctx) => {
  await ctx.answerCbQuery();
  await auth(ctx);
  await renderMenu({ bot, chatId: getChatId(ctx), ctx, text: 'Главное меню:', extra: { reply_markup: mainMenuKb() } });
});

bot.action('about', async (ctx) => {
  await ctx.answerCbQuery();
  await auth(ctx);
  await renderMenu({
    bot,
    chatId: getChatId(ctx),
    ctx,
    text: `ℹ️ О приложении\n\nЛР2: вопросно‑ответная система на Telegram Bot API.\nФункции: категории, товары, корзина, заказы, оплата (Telegram Payments), пагинация по 5.`,
    extra: { reply_markup: mainMenuKb() },
  });
});

bot.action('help', async (ctx) => {
  await ctx.answerCbQuery();
  await auth(ctx);
  await renderMenu({
    bot,
    chatId: getChatId(ctx),
    ctx,
    text: `❓ Помощь\n\n- Нажмите "Категории" → выберите категорию → товар.\n- В карточке товара добавляйте в корзину.\n- В корзине оформите заказ и подтвердите.\n- После подтверждения доступна оплата.\n\nПагинация: кнопки ◀️/▶️.`,
    extra: { reply_markup: mainMenuKb() },
  });
});

bot.action(/^cat:list:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  await auth(ctx);
  const page = Number(ctx.match[1] ?? 0);
  const { items, total } = await listCategories(page);
  const view = categoriesView(items, total, page);
  await renderMenu({ bot, chatId: getChatId(ctx), ctx, text: view.text, extra: { reply_markup: view.reply_markup } });
});

bot.action(/^prod:list:(\d+):(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  await auth(ctx);
  const categoryId = Number(ctx.match[1]);
  const page = Number(ctx.match[2]);
  const { items, total } = await listProducts(categoryId, page);
  const view = productsView({ categoryId, products: items, total, page });
  await renderMenu({ bot, chatId: getChatId(ctx), ctx, text: view.text, extra: { reply_markup: view.reply_markup } });
});

bot.action(/^prod:open:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  await auth(ctx);
  const productId = Number(ctx.match[1]);
  const p = await getProduct(productId);
  if (!p || !p.is_active) {
    await renderMenu({ bot, chatId: getChatId(ctx), ctx, text: 'Товар не найден или недоступен.', extra: { reply_markup: mainMenuKb() } });
    return;
  }
  const view = productCard(p);
  await renderMenu({ bot, chatId: getChatId(ctx), ctx, text: view.text, extra: { reply_markup: view.reply_markup } });
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
  await renderMenu({ bot, chatId: getChatId(ctx), ctx, text: view.text, extra: { reply_markup: view.reply_markup } });
});

bot.action('cart:checkout', async (ctx) => {
  await ctx.answerCbQuery();
  const { userId } = await auth(ctx);
  const created = await createOrderFromCart(userId);
  if (!created) {
    await renderMenu({ bot, chatId: getChatId(ctx), ctx, text: 'Корзина пуста.', extra: { reply_markup: mainMenuKb() } });
    return;
  }
  const order = await getOrderForUser(userId, created.orderId);
  if (!order) {
    await renderMenu({ bot, chatId: getChatId(ctx), ctx, text: 'Не удалось создать заказ.', extra: { reply_markup: mainMenuKb() } });
    return;
  }
  const view = orderCard(order);
  await renderMenu({ bot, chatId: getChatId(ctx), ctx, text: `✅ Заказ создан.\n\n${view.text}`, extra: { reply_markup: view.reply_markup } });
});

bot.action(/^ord:list:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const { userId } = await auth(ctx);
  const page = Number(ctx.match[1] ?? 0);
  const { items, total } = await listOrders(userId, page);
  const view = ordersView({ items, total, page });
  await renderMenu({ bot, chatId: getChatId(ctx), ctx, text: view.text, extra: { reply_markup: view.reply_markup } });
});

bot.action(/^ord:open:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const { userId } = await auth(ctx);
  const orderId = Number(ctx.match[1]);
  const order = await getOrderForUser(userId, orderId);
  if (!order) {
    await renderMenu({ bot, chatId: getChatId(ctx), ctx, text: 'Заказ не найден.', extra: { reply_markup: mainMenuKb() } });
    return;
  }
  const view = orderCard(order);
  await renderMenu({ bot, chatId: getChatId(ctx), ctx, text: view.text, extra: { reply_markup: view.reply_markup } });
});

bot.action(/^ord:confirm:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const { userId } = await auth(ctx);
  const orderId = Number(ctx.match[1]);
  const order = await getOrderForUser(userId, orderId);
  if (!order) {
    await renderMenu({ bot, chatId: getChatId(ctx), ctx, text: 'Заказ не найден.', extra: { reply_markup: mainMenuKb() } });
    return;
  }
  if (order.status !== 'NEW') {
    const view = orderCard(order);
    await renderMenu({ bot, chatId: getChatId(ctx), ctx, text: view.text, extra: { reply_markup: view.reply_markup } });
    return;
  }

  const ok = await confirmOrder(userId, orderId);
  if (!ok) {
    await renderMenu({ bot, chatId: getChatId(ctx), ctx, text: 'Не удалось подтвердить заказ.', extra: { reply_markup: mainMenuKb() } });
    return;
  }

  const items = await getOrderItems(userId, orderId);
  const fresh = await getOrderForUser(userId, orderId);
  if (!items || !fresh) return;

  const itemsText = items.map((i) => `- ${i.title}: ${i.qty} × ${i.price_minor / 100} = ${i.line_total_minor / 100}`).join('\n');
  const totalText = `${fresh.total_minor / 100} ${fresh.currency}`;
  await sendAdminOrderEmail({
    orderId,
    userTelegramId: ctx.from.id,
    totalText,
    itemsText,
  });

  const view = orderCard(fresh);
  await renderMenu({ bot, chatId: getChatId(ctx), ctx, text: `✅ Заказ подтвержден. Администратор уведомлен.\n\n${view.text}`, extra: { reply_markup: view.reply_markup } });
});

bot.action(/^pay:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const { userId } = await auth(ctx);
  const orderId = Number(ctx.match[1]);
  const order = await getOrderForUser(userId, orderId);
  if (!order) {
    await renderMenu({ bot, chatId: getChatId(ctx), ctx, text: 'Заказ не найден.', extra: { reply_markup: mainMenuKb() } });
    return;
  }
  if (order.status !== 'WAITING_PAYMENT') {
    await renderMenu({ bot, chatId: getChatId(ctx), ctx, text: 'Этот заказ нельзя оплатить (не тот статус).', extra: { reply_markup: mainMenuKb() } });
    return;
  }
  if (!env.PAYMENTS_PROVIDER_TOKEN) {
    await renderMenu({
      bot,
      chatId: getChatId(ctx),
      ctx,
      text: `Оплата не настроена: заполните PAYMENTS_PROVIDER_TOKEN в .env.\n\nПока можете проверить остальные разделы.`,
      extra: { reply_markup: mainMenuKb() },
    });
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

// Inline mode: share product in other chats
bot.on('inline_query', async (ctx) => {
  await auth(ctx as any);
  const q = (ctx.inlineQuery.query ?? '').trim().toLowerCase();

  // Simple search: if query is a number - treat as product id
  let results: any[] = [];
  const id = Number(q);
  if (Number.isFinite(id) && id > 0) {
    const p = await getProduct(id);
    if (p && p.is_active) {
      results = [productInlineResult(p)];
    }
  } else if (q.length === 0) {
    // show a few popular items (category 1 first page)
    const { items } = await listProducts(1, 0);
    results = items.slice(0, 5).map(productInlineResult);
  } else {
    // lightweight search: scan first page of each category (enough for lab)
    const candidates: any[] = [];
    for (const categoryId of [1, 2, 3, 4, 5]) {
      const { items } = await listProducts(categoryId, 0);
      candidates.push(...items);
    }
    const filtered = candidates.filter((p) => p.title.toLowerCase().includes(q));
    results = filtered.slice(0, 10).map(productInlineResult);
  }

  await ctx.answerInlineQuery(results, { cache_time: 0 });
});

function productInlineResult(p: any) {
  return {
    type: 'article',
    id: String(p.id),
    title: p.title,
    description: `${p.price_minor / 100} ${p.currency}`,
    input_message_content: {
      message_text:
        `🛍️ ${p.title}\n` +
        `Цена: ${p.price_minor / 100} ${p.currency}\n` +
        `Открыть в боте: https://t.me/${env.BOT_USERNAME || 'YOUR_BOT_USERNAME'}?start=product_${p.id}`,
    },
  };
}

bot.catch((err) => {
  console.error('Bot error', err);
});

await bot.launch();
console.log('Bot started (polling).');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

