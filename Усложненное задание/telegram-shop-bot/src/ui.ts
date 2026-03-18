import { Markup } from 'telegraf';
import type { InlineKeyboardMarkup } from 'telegraf/types';
import { PAGE_SIZE, type CartItem, type Category, type OrderRow, type Product } from './db.js';

export function fmtMoney(minor: number, currency: string): string {
  const value = minor / 100;
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency }).format(value);
}

export function paginate(total: number, page: number): { page: number; pages: number; hasPrev: boolean; hasNext: boolean } {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(Math.max(page, 0), pages - 1);
  return { page: safePage, pages, hasPrev: safePage > 0, hasNext: safePage < pages - 1 };
}

export function mainMenuKb(): InlineKeyboardMarkup {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📦 Категории', 'cat:list:0')],
    [Markup.button.callback('🛒 Корзина', 'cart:view:0')],
    [Markup.button.callback('🧾 Заказы', 'ord:list:0')],
    [Markup.button.callback('ℹ️ О приложении', 'about'), Markup.button.callback('❓ Помощь', 'help')],
  ]).reply_markup;
}

export function categoriesView(categories: Category[], total: number, page: number) {
  const pg = paginate(total, page);
  const text =
    `📦 Категории (страница ${pg.page + 1}/${pg.pages})\n\n` +
    (categories.length ? categories.map((c) => `• ${c.name}`).join('\n') : 'Категорий нет.');

  const rows = categories.map((c) => [Markup.button.callback(c.name, `prod:list:${c.id}:0`)]);
  const nav: ReturnType<typeof Markup.button.callback>[] = [];
  if (pg.hasPrev) nav.push(Markup.button.callback('◀️', `cat:list:${pg.page - 1}`));
  nav.push(Markup.button.callback('🏠 Меню', 'home'));
  if (pg.hasNext) nav.push(Markup.button.callback('▶️', `cat:list:${pg.page + 1}`));
  rows.push(nav);

  return { text, reply_markup: Markup.inlineKeyboard(rows).reply_markup };
}

export function productsView(params: { categoryId: number; products: Product[]; total: number; page: number }) {
  const { categoryId, products, total, page } = params;
  const pg = paginate(total, page);
  const text =
    `🧩 Товары (категория #${categoryId}) — страница ${pg.page + 1}/${pg.pages}\n\n` +
    (products.length
      ? products
          .map((p) => `• ${p.title} — ${fmtMoney(p.price_minor, p.currency)} (остаток: ${p.stock})`)
          .join('\n')
      : 'Товаров нет.');

  const rows = products.map((p) => [Markup.button.callback(p.title, `prod:open:${p.id}`)]);
  const nav: ReturnType<typeof Markup.button.callback>[] = [];
  if (pg.hasPrev) nav.push(Markup.button.callback('◀️', `prod:list:${categoryId}:${pg.page - 1}`));
  nav.push(Markup.button.callback('📦 Категории', 'cat:list:0'));
  nav.push(Markup.button.callback('🛒 Корзина', 'cart:view:0'));
  if (pg.hasNext) nav.push(Markup.button.callback('▶️', `prod:list:${categoryId}:${pg.page + 1}`));
  rows.push(nav);

  return { text, reply_markup: Markup.inlineKeyboard(rows).reply_markup };
}

export function productCard(p: Product) {
  const text =
    `🛍️ ${p.title}\n` +
    `Цена: ${fmtMoney(p.price_minor, p.currency)}\n` +
    `Остаток: ${p.stock}\n\n` +
    `${p.description ?? ''}`;

  const kb = Markup.inlineKeyboard([
    [Markup.button.callback('➕ В корзину', `cart:add:${p.id}`), Markup.button.callback('➖', `cart:dec:${p.id}`)],
    [Markup.button.switchToChat('🔗 Поделиться', String(p.id))],
    [Markup.button.callback('🛒 Корзина', 'cart:view:0'), Markup.button.callback('🏠 Меню', 'home')],
  ]);

  return { text, reply_markup: kb.reply_markup };
}

export function cartView(params: { items: CartItem[]; totalItems: number; page: number; cartTotalMinor: number; currency: string }) {
  const { items, totalItems, page, cartTotalMinor, currency } = params;
  const pg = paginate(totalItems, page);

  const lines = items.map(
    (i) => `• ${i.title}\n  ${i.qty} × ${fmtMoney(i.price_minor, i.currency)} = ${fmtMoney(i.line_total_minor, i.currency)}`,
  );

  const text =
    `🛒 Корзина (страница ${pg.page + 1}/${pg.pages})\n\n` +
    (lines.length ? lines.join('\n') : 'Корзина пуста.') +
    `\n\nИтого: ${fmtMoney(cartTotalMinor, currency)}`;

  const rows: ReturnType<typeof Markup.button.callback>[][] = [];
  for (const i of items) {
    rows.push([
      Markup.button.callback(`➖ ${i.title}`, `cart:dec:${i.product_id}`),
      Markup.button.callback(`❌`, `cart:del:${i.product_id}`),
      Markup.button.callback(`➕`, `cart:add:${i.product_id}`),
    ]);
  }

  const nav: ReturnType<typeof Markup.button.callback>[] = [];
  if (pg.hasPrev) nav.push(Markup.button.callback('◀️', `cart:view:${pg.page - 1}`));
  nav.push(Markup.button.callback('🏠 Меню', 'home'));
  if (pg.hasNext) nav.push(Markup.button.callback('▶️', `cart:view:${pg.page + 1}`));
  rows.push(nav);

  if (cartTotalMinor > 0) {
    rows.unshift([Markup.button.callback('✅ Оформить заказ', 'cart:checkout')]);
  }

  return { text, reply_markup: Markup.inlineKeyboard(rows).reply_markup };
}

export function ordersView(params: { items: OrderRow[]; total: number; page: number }) {
  const { items, total, page } = params;
  const pg = paginate(total, page);

  const text =
    `🧾 Заказы (страница ${pg.page + 1}/${pg.pages})\n\n` +
    (items.length
      ? items
          .map((o) => `• Заказ #${o.id} — ${o.status} — ${fmtMoney(o.total_minor, o.currency)}`)
          .join('\n')
      : 'Заказов пока нет.');

  const rows: ReturnType<typeof Markup.button.callback>[][] = items.map((o) => [
    Markup.button.callback(`Открыть #${o.id}`, `ord:open:${o.id}`),
  ]);

  const nav: ReturnType<typeof Markup.button.callback>[] = [];
  if (pg.hasPrev) nav.push(Markup.button.callback('◀️', `ord:list:${pg.page - 1}`));
  nav.push(Markup.button.callback('🏠 Меню', 'home'));
  if (pg.hasNext) nav.push(Markup.button.callback('▶️', `ord:list:${pg.page + 1}`));
  rows.push(nav);

  return { text, reply_markup: Markup.inlineKeyboard(rows).reply_markup };
}

export function orderCard(o: OrderRow) {
  const text =
    `🧾 Заказ #${o.id}\n` +
    `Статус: ${o.status}\n` +
    `Сумма: ${fmtMoney(o.total_minor, o.currency)}\n` +
    `Создан: ${new Date(o.created_at).toLocaleString('ru-RU')}`;

  const rows: ReturnType<typeof Markup.button.callback>[][] = [];
  if (o.status === 'NEW') rows.push([Markup.button.callback('✅ Подтвердить заказ', `ord:confirm:${o.id}`)]);
  if (o.status === 'WAITING_PAYMENT') rows.push([Markup.button.callback('💳 Оплатить', `pay:${o.id}`)]);
  rows.push([Markup.button.callback('🧾 Заказы', 'ord:list:0'), Markup.button.callback('🏠 Меню', 'home')]);

  return { text, reply_markup: Markup.inlineKeyboard(rows).reply_markup };
}

