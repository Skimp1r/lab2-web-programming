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
       last_name = VALUES(last_name)`,
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
    `SELECT id, category_id, title, description, price_minor, currency, stock, is_active
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
    `SELECT id, category_id, title, description, price_minor, currency, stock, is_active
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
       VALUES (:userId, 'WAITING_PAYMENT', :currency, :totalMinor)`,
      { userId, currency, totalMinor },
    );
    const orderId = Number(orderRes.insertId);

    for (const r of cartRows) {
      await conn.execute(
        `INSERT INTO order_items (order_id, product_id, title, price_minor, qty)
         VALUES (:orderId, :productId, :title, :priceMinor, :qty)`,
        {
          orderId,
          productId: Number(r.product_id),
          title: String(r.title),
          priceMinor: Number(r.price_minor),
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

function toProduct(r: mysql.RowDataPacket): Product {
  return {
    id: Number(r.id),
    category_id: Number(r.category_id),
    title: String(r.title),
    description: r.description == null ? null : String(r.description),
    price_minor: Number(r.price_minor),
    currency: String(r.currency),
    stock: Number(r.stock),
    is_active: Number(r.is_active),
  };
}

