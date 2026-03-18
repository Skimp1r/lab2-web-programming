USE tg_shop;

-- Посетители: фиксируем последний визит
ALTER TABLE users
  ADD COLUMN last_seen_at TIMESTAMP NULL DEFAULT NULL;

-- Себестоимость товара для расчёта прибыли
ALTER TABLE products
  ADD COLUMN cost_minor BIGINT NOT NULL DEFAULT 0 AFTER price_minor;

-- Сохраняем себестоимость в момент заказа
ALTER TABLE order_items
  ADD COLUMN cost_minor BIGINT NOT NULL DEFAULT 0 AFTER price_minor;

-- Заполним cost_minor по текущим данным (если раньше не было)
UPDATE products SET cost_minor = 0 WHERE cost_minor IS NULL;

