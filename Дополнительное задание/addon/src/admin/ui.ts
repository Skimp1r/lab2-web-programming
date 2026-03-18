import { Markup } from 'telegraf';
import type { InlineKeyboardMarkup } from 'telegraf/types';
import type { Category, Product } from '../db.js';
import { fmtMoney } from '../ui.js';

export function adminMenuKb(): InlineKeyboardMarkup {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📦 Категории (CRUD)', 'adm:cat:list:0')],
    [Markup.button.callback('🧩 Товары (CRUD)', 'adm:prod:list:0')],
    [Markup.button.callback('📊 Статистика', 'adm:stats')],
    [Markup.button.callback('🏠 В меню магазина', 'home')],
  ]).reply_markup;
}

export function adminCategoriesView(items: Category[], total: number, page: number) {
  const pages = Math.max(1, Math.ceil(total / 5));
  const p = Math.min(Math.max(page, 0), pages - 1);
  const text =
    `👮 Админ: категории (страница ${p + 1}/${pages})\n\n` +
    (items.length ? items.map((c) => `• #${c.id} ${c.name}`).join('\n') : 'Нет категорий.');

  const rows: any[] = [
    [Markup.button.callback('➕ Добавить категорию', 'adm:cat:create')],
    ...items.map((c) => [
      Markup.button.callback(`✏️ #${c.id}`, `adm:cat:rename:${c.id}`),
      Markup.button.callback(`🗑️ #${c.id}`, `adm:cat:del:${c.id}`),
    ]),
  ];
  const nav: any[] = [];
  if (p > 0) nav.push(Markup.button.callback('◀️', `adm:cat:list:${p - 1}`));
  nav.push(Markup.button.callback('👮 Админ', 'adm:home'));
  if (p < pages - 1) nav.push(Markup.button.callback('▶️', `adm:cat:list:${p + 1}`));
  rows.push(nav);

  return { text, reply_markup: Markup.inlineKeyboard(rows).reply_markup };
}

export function adminProductsView(items: Product[], total: number, page: number) {
  const pages = Math.max(1, Math.ceil(total / 5));
  const p = Math.min(Math.max(page, 0), pages - 1);
  const text =
    `👮 Админ: товары (страница ${p + 1}/${pages})\n\n` +
    (items.length
      ? items.map((x) => `• #${x.id} [cat ${x.category_id}] ${x.title} — ${fmtMoney(x.price_minor, x.currency)}`).join('\n')
      : 'Нет товаров.');

  const rows: any[] = [
    [Markup.button.callback('➕ Добавить товар', 'adm:prod:create:pickcat')],
    ...items.map((x) => [
      Markup.button.callback(`✏️ #${x.id}`, `adm:prod:edit:${x.id}`),
      Markup.button.callback(`🗑️ #${x.id}`, `adm:prod:del:${x.id}`),
    ]),
  ];
  const nav: any[] = [];
  if (p > 0) nav.push(Markup.button.callback('◀️', `adm:prod:list:${p - 1}`));
  nav.push(Markup.button.callback('👮 Админ', 'adm:home'));
  if (p < pages - 1) nav.push(Markup.button.callback('▶️', `adm:prod:list:${p + 1}`));
  rows.push(nav);

  return { text, reply_markup: Markup.inlineKeyboard(rows).reply_markup };
}

export function adminPickCategoryForProduct(categories: Category[]) {
  const text = `👮 Добавление товара\n\nВыберите категорию:`;
  const rows = categories.map((c) => [Markup.button.callback(c.name, `adm:prod:create:cat:${c.id}`)]);
  rows.push([Markup.button.callback('👮 Админ', 'adm:home')]);
  return { text, reply_markup: Markup.inlineKeyboard(rows).reply_markup };
}

export function adminStatsView(text: string) {
  return { text: `📊 Статистика\n\n${text}`, reply_markup: adminMenuKb() };
}

