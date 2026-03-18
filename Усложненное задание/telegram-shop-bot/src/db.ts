import mysql from 'mysql2/promise';
import { env } from './env.js';

export const PAGE_SIZE = 5;

export type Category = { id: number; name: string };
export type Product = {
  id: number;
  category_id: number;
  title: string;
  description: string | null;
  price_minor: number;
  cost_minor?: number;
  currency: string;
  stock: number;
  is_active: number;
};

export type CartItem = {
  product_id: number;
  title: string;
  price_minor: number;
  currency: string;
  qty: number;
  line_total_minor: number;
};

export type OrderRow = {
  id: number;
  status: 'NEW' | 'WAITING_PAYMENT' | 'PAID' | 'CANCELLED';
  currency: string;
  total_minor: number;
  created_at: string;
};

export type OrderItemRow = {
  product_id: number;
  title: string;
  price_minor: number;
  cost_minor?: number;
  qty: number;
  line_total_minor: number;
  currency: string;
};

export const pool = mysql.createPool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  connectionLimit: 10,
  namedPlaceholders: true,
});

export async function ensureUser(params: {
  telegramId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
}): Promise<{ userId: number }> {
  const { telegramId, username, firstName, lastName } = params;

  await pool.execute(
    `INSERT INTO users (telegram_id, username, first_name, last_name)
     VALUES (:telegramId, :username, :firstName, :lastName)
     ON DUPLICATE KEY UPDATE
       username = VALUES(username),
       first_name = VALUES(first_name),
       last_name = VALUES(last_name),
       last_seen_at = CURRENT_TIMESTAMP`,
    { telegramId, username: username ?? null, firstName: firstName ?? null, lastName: lastName ?? null },
  );

  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT id FROM users WHERE telegram_id = :telegramId`,
    { telegramId },
  );
  return { userId: Number(rows[0].id) };
}

export async function ensureCart(userId: number): Promise<{ cartId: number }> {
  await pool.execute(`INSERT IGNORE INTO carts (user_id) VALUES (:userId)`, { userId });
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT id FROM carts WHERE user_id = :userId`,
    { userId },
  );
  return { cartId: Number(rows[0].id) };
}

export async function listCategories(page: number): Promise<{ items: Category[]; total: number }> {
  const safePage = Number.isFinite(page) && page >= 0 ? Math.floor(page) : 0;
  const offset = safePage * PAGE_SIZE;
  const [totalRows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt FROM categories WHERE parent_id IS NULL`,
  );
  const total = Number(totalRows[0].cnt);
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT id, name FROM categories
     WHERE parent_id IS NULL
     ORDER BY id
     LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
  );
  return { items: rows.map((r) => ({ id: Number(r.id), name: String(r.name) })), total };
}

export async function listProducts(categoryId: number, page: number): Promise<{ items: Product[]; total: number }> {
  const safePage = Number.isFinite(page) && page >= 0 ? Math.floor(page) : 0;
  const offset = safePage * PAGE_SIZE;
  const [totalRows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt FROM products
     WHERE category_id = :categoryId AND is_active = 1`,
    { categoryId },
  );
  const total = Number(totalRows[0].cnt);
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT id, category_id, title, description, price_minor, cost_minor, currency, stock, is_active
     FROM products
     WHERE category_id = :categoryId AND is_active = 1
     ORDER BY id
     LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
    { categoryId },
  );
  return { items: rows.map(toProduct), total };
}

export async function getProduct(productId: number): Promise<Product | null> {
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT id, category_id, title, description, price_minor, cost_minor, currency, stock, is_active
     FROM products WHERE id = :productId`,
    { productId },
  );
  if (rows.length === 0) return null;
  return toProduct(rows[0]);
}

export async function addToCart(userId: number, productId: number, deltaQty: number): Promise<void> {
  const { cartId } = await ensureCart(userId);
  await pool.execute(
    `INSERT INTO cart_items (cart_id, product_id, qty)
     VALUES (:cartId, :productId, :qty)
     ON DUPLICATE KEY UPDATE qty = GREATEST(qty + VALUES(qty), 0)`,
    { cartId, productId, qty: deltaQty },
  );
  await pool.execute(
    `DELETE FROM cart_items WHERE cart_id = :cartId AND product_id = :productId AND qty <= 0`,
    { cartId, productId },
  );
}

export async function setCartItemQty(userId: number, productId: number, qty: number): Promise<void> {
  const { cartId } = await ensureCart(userId);
  if (qty <= 0) {
    await pool.execute(`DELETE FROM cart_items WHERE cart_id = :cartId AND product_id = :productId`, {
      cartId,
      productId,
    });
    return;
  }
  await pool.execute(
    `INSERT INTO cart_items (cart_id, product_id, qty)
     VALUES (:cartId, :productId, :qty)
     ON DUPLICATE KEY UPDATE qty = VALUES(qty)`,
    { cartId, productId, qty },
  );
}

export async function listCartItems(userId: number, page: number): Promise<{ items: CartItem[]; total: number }> {
  const { cartId } = await ensureCart(userId);
  const safePage = Number.isFinite(page) && page >= 0 ? Math.floor(page) : 0;
  const offset = safePage * PAGE_SIZE;

  const [totalRows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt FROM cart_items WHERE cart_id = :cartId`,
    { cartId },
  );
  const total = Number(totalRows[0].cnt);

  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT
       ci.product_id,
       p.title,
       p.price_minor,
       p.currency,
       ci.qty,
       (p.price_minor * ci.qty) AS line_total_minor
     FROM cart_items ci
     JOIN products p ON p.id = ci.product_id
     WHERE ci.cart_id = :cartId
     ORDER BY ci.id
     LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
    { cartId },
  );

  return {
    items: rows.map((r) => ({
      product_id: Number(r.product_id),
      title: String(r.title),
      price_minor: Number(r.price_minor),
      currency: String(r.currency),
      qty: Number(r.qty),
      line_total_minor: Number(r.line_total_minor),
    })),
    total,
  };
}

export async function getCartTotals(userId: number): Promise<{ totalMinor: number; currency: string }> {
  const { cartId } = await ensureCart(userId);
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT
       COALESCE(SUM(p.price_minor * ci.qty), 0) AS total_minor,
       COALESCE(MIN(p.currency), :fallback) AS currency
     FROM cart_items ci
     JOIN products p ON p.id = ci.product_id
     WHERE ci.cart_id = :cartId`,
    { cartId, fallback: env.PAYMENTS_CURRENCY },
  );
  return { totalMinor: Number(rows[0].total_minor), currency: String(rows[0].currency) };
}

export async function createOrderFromCart(userId: number): Promise<{ orderId: number } | null> {
  const { cartId } = await ensureCart(userId);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [cartRows] = await conn.execute<mysql.RowDataPacket[]>(
      `SELECT
         ci.product_id,
         p.title,
         p.price_minor,
         p.cost_minor,
         p.currency,
         ci.qty
       FROM cart_items ci
       JOIN products p ON p.id = ci.product_id
       WHERE ci.cart_id = :cartId`,
      { cartId },
    );
    if (cartRows.length === 0) {
      await conn.rollback();
      return null;
    }

    const currency = String(cartRows[0].currency ?? env.PAYMENTS_CURRENCY);
    const totalMinor = cartRows.reduce((sum, r) => sum + Number(r.price_minor) * Number(r.qty), 0);

    const [orderRes] = await conn.execute<mysql.ResultSetHeader>(
      `INSERT INTO orders (user_id, status, currency, total_minor)
       VALUES (:userId, 'NEW', :currency, :totalMinor)`,
      { userId, currency, totalMinor },
    );
    const orderId = Number(orderRes.insertId);

    for (const r of cartRows) {
      await conn.execute(
        `INSERT INTO order_items (order_id, product_id, title, price_minor, cost_minor, qty)
         VALUES (:orderId, :productId, :title, :priceMinor, :costMinor, :qty)`,
        {
          orderId,
          productId: Number(r.product_id),
          title: String(r.title),
          priceMinor: Number(r.price_minor),
          costMinor: Number(r.cost_minor ?? 0),
          qty: Number(r.qty),
        },
      );
    }

    await conn.execute(`DELETE FROM cart_items WHERE cart_id = :cartId`, { cartId });

    await conn.execute(
      `INSERT INTO payments (order_id, provider, currency, amount_minor, status)
       VALUES (:orderId, 'telegram', :currency, :amountMinor, 'CREATED')
       ON DUPLICATE KEY UPDATE
         currency = VALUES(currency),
         amount_minor = VALUES(amount_minor)`,
      { orderId, currency, amountMinor: totalMinor },
    );

    await conn.commit();
    return { orderId };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function confirmOrder(userId: number, orderId: number): Promise<boolean> {
  const [res] = await pool.execute<mysql.ResultSetHeader>(
    `UPDATE orders
     SET status = 'WAITING_PAYMENT'
     WHERE id = :orderId AND user_id = :userId AND status = 'NEW'`,
    { orderId, userId },
  );
  return res.affectedRows > 0;
}

export async function getOrderItems(userId: number, orderId: number): Promise<OrderItemRow[] | null> {
  const [ownRows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT id, currency FROM orders WHERE id = :orderId AND user_id = :userId`,
    { orderId, userId },
  );
  if (ownRows.length === 0) return null;
  const currency = String(ownRows[0].currency);

  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT
       product_id,
       title,
       price_minor,
       cost_minor,
       qty,
       (price_minor * qty) AS line_total_minor
     FROM order_items
     WHERE order_id = :orderId
     ORDER BY id`,
    { orderId },
  );

  return rows.map((r) => ({
    product_id: Number(r.product_id),
    title: String(r.title),
    price_minor: Number(r.price_minor),
    cost_minor: Number(r.cost_minor ?? 0),
    qty: Number(r.qty),
    line_total_minor: Number(r.line_total_minor),
    currency,
  }));
}

export async function listOrders(userId: number, page: number): Promise<{ items: OrderRow[]; total: number }> {
  const safePage = Number.isFinite(page) && page >= 0 ? Math.floor(page) : 0;
  const offset = safePage * PAGE_SIZE;
  const [totalRows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt FROM orders WHERE user_id = :userId`,
    { userId },
  );
  const total = Number(totalRows[0].cnt);

  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT id, status, currency, total_minor, created_at
     FROM orders
     WHERE user_id = :userId
     ORDER BY id DESC
     LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
    { userId },
  );

  return {
    items: rows.map((r) => ({
      id: Number(r.id),
      status: r.status as OrderRow['status'],
      currency: String(r.currency),
      total_minor: Number(r.total_minor),
      created_at: new Date(r.created_at).toISOString(),
    })),
    total,
  };
}

export async function getOrderForUser(userId: number, orderId: number): Promise<OrderRow | null> {
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT id, status, currency, total_minor, created_at
     FROM orders
     WHERE id = :orderId AND user_id = :userId`,
    { orderId, userId },
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: Number(r.id),
    status: r.status as OrderRow['status'],
    currency: String(r.currency),
    total_minor: Number(r.total_minor),
    created_at: new Date(r.created_at).toISOString(),
  };
}

export async function markOrderPaid(params: {
  userId: number;
  orderId: number;
  telegramPaymentChargeId: string;
  providerPaymentChargeId: string;
}): Promise<boolean> {
  const { userId, orderId, telegramPaymentChargeId, providerPaymentChargeId } = params;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute<mysql.RowDataPacket[]>(
      `SELECT status FROM orders WHERE id = :orderId AND user_id = :userId FOR UPDATE`,
      { orderId, userId },
    );
    if (rows.length === 0) {
      await conn.rollback();
      return false;
    }
    const status = String(rows[0].status);
    if (status === 'PAID') {
      await conn.commit();
      return true;
    }
    if (status !== 'WAITING_PAYMENT') {
      await conn.rollback();
      return false;
    }

    await conn.execute(
      `UPDATE orders SET status = 'PAID' WHERE id = :orderId AND user_id = :userId`,
      { orderId, userId },
    );
    await conn.execute(
      `UPDATE payments
       SET status = 'PAID',
           telegram_payment_charge_id = :tId,
           provider_payment_charge_id = :pId
       WHERE order_id = :orderId`,
      { orderId, tId: telegramPaymentChargeId, pId: providerPaymentChargeId },
    );
    await conn.commit();
    return true;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// ===== Admin + Stats (доп. задание) =====

export async function adminListCategories(page: number): Promise<{ items: Category[]; total: number }> {
  return await listCategories(page);
}

export async function adminCreateCategory(name: string): Promise<void> {
  await pool.execute(`INSERT INTO categories (name) VALUES (:name)`, { name });
}

export async function adminRenameCategory(id: number, name: string): Promise<void> {
  await pool.execute(`UPDATE categories SET name = :name WHERE id = :id`, { id, name });
}

export async function adminDeleteCategory(id: number): Promise<void> {
  await pool.execute(`DELETE FROM categories WHERE id = :id`, { id });
}

export async function adminListProducts(page: number): Promise<{ items: Product[]; total: number }> {
  const safePage = Number.isFinite(page) && page >= 0 ? Math.floor(page) : 0;
  const offset = safePage * PAGE_SIZE;
  const [totalRows] = await pool.execute<mysql.RowDataPacket[]>(`SELECT COUNT(*) AS cnt FROM products`);
  const total = Number(totalRows[0].cnt);
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT id, category_id, title, description, price_minor, cost_minor, currency, stock, is_active
     FROM products
     ORDER BY id DESC
     LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
  );
  return { items: rows.map(toProduct), total };
}

export async function adminCreateProduct(p: {
  categoryId: number;
  title: string;
  description?: string;
  priceMinor: number;
  costMinor: number;
  currency: string;
  stock: number;
}): Promise<void> {
  await pool.execute(
    `INSERT INTO products (category_id, title, description, price_minor, cost_minor, currency, stock, is_active)
     VALUES (:categoryId, :title, :description, :priceMinor, :costMinor, :currency, :stock, 1)`,
    {
      categoryId: p.categoryId,
      title: p.title,
      description: p.description ?? null,
      priceMinor: p.priceMinor,
      costMinor: p.costMinor,
      currency: p.currency,
      stock: p.stock,
    },
  );
}

export async function adminUpdateProduct(
  productId: number,
  patch: Partial<{
    title: string;
    description: string | null;
    priceMinor: number;
    costMinor: number;
    stock: number;
    isActive: number;
  }>,
): Promise<void> {
  const fields: string[] = [];
  const params: any = { productId };
  if (patch.title != null) {
    fields.push('title = :title');
    params.title = patch.title;
  }
  if (patch.description !== undefined) {
    fields.push('description = :description');
    params.description = patch.description;
  }
  if (patch.priceMinor != null) {
    fields.push('price_minor = :priceMinor');
    params.priceMinor = patch.priceMinor;
  }
  if (patch.costMinor != null) {
    fields.push('cost_minor = :costMinor');
    params.costMinor = patch.costMinor;
  }
  if (patch.stock != null) {
    fields.push('stock = :stock');
    params.stock = patch.stock;
  }
  if (patch.isActive != null) {
    fields.push('is_active = :isActive');
    params.isActive = patch.isActive;
  }
  if (!fields.length) return;
  await pool.execute(`UPDATE products SET ${fields.join(', ')} WHERE id = :productId`, params);
}

export async function adminDeleteProduct(productId: number): Promise<void> {
  await pool.execute(`DELETE FROM products WHERE id = :productId`, { productId });
}

export async function statsVisitors(from: Date, to: Date): Promise<number> {
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT COUNT(DISTINCT id) AS cnt
     FROM users
     WHERE last_seen_at IS NOT NULL
       AND last_seen_at >= :from AND last_seen_at < :to`,
    { from, to },
  );
  return Number(rows[0].cnt);
}

export async function statsSoldQty(from: Date, to: Date): Promise<number> {
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT COALESCE(SUM(oi.qty), 0) AS qty
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     WHERE o.status = 'PAID'
       AND o.updated_at >= :from AND o.updated_at < :to`,
    { from, to },
  );
  return Number(rows[0].qty);
}

export async function statsProfitMinor(from: Date, to: Date): Promise<number> {
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    `SELECT COALESCE(SUM((oi.price_minor - oi.cost_minor) * oi.qty), 0) AS profit_minor
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     WHERE o.status = 'PAID'
       AND o.updated_at >= :from AND o.updated_at < :to`,
    { from, to },
  );
  return Number(rows[0].profit_minor);
}

function toProduct(r: mysql.RowDataPacket): Product {
  return {
    id: Number(r.id),
    category_id: Number(r.category_id),
    title: String(r.title),
    description: r.description == null ? null : String(r.description),
    price_minor: Number(r.price_minor),
    cost_minor: r.cost_minor == null ? undefined : Number(r.cost_minor),
    currency: String(r.currency),
    stock: Number(r.stock),
    is_active: Number(r.is_active),
  };
}

