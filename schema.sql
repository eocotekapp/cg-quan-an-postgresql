CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS menu (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT DEFAULT 'main',
  price INTEGER DEFAULT 0, original_price INTEGER DEFAULT 0, profit INTEGER DEFAULT 0,
  popular INTEGER DEFAULT 0, icon TEXT DEFAULT '🍽️', description TEXT DEFAULT '',
  image_url TEXT DEFAULT '', available BOOLEAN DEFAULT TRUE,
  image_fit TEXT DEFAULT 'cover', image_zoom INTEGER DEFAULT 100, image_pos_x INTEGER DEFAULT 50, image_pos_y INTEGER DEFAULT 50,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY DEFAULT 'main', shop_name TEXT DEFAULT 'CG Quán Ăn',
  phone TEXT DEFAULT '', address TEXT DEFAULT '', shipping_fee INTEGER DEFAULT 0,
  free_ship_from INTEGER DEFAULT 0, updated_at TIMESTAMPTZ DEFAULT now()
);
INSERT INTO settings(id) VALUES ('main') ON CONFLICT(id) DO NOTHING;

CREATE TABLE IF NOT EXISTS tables (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, seats INTEGER DEFAULT 4, zone TEXT DEFAULT '',
  status TEXT DEFAULT 'free', locked BOOLEAN DEFAULT FALSE, note TEXT DEFAULT '', updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), order_code TEXT UNIQUE, type TEXT DEFAULT 'ship',
  customer JSONB DEFAULT '{}'::jsonb, items JSONB DEFAULT '[]'::jsonb,
  subtotal INTEGER DEFAULT 0, discount INTEGER DEFAULT 0, shipping_fee INTEGER DEFAULT 0, total INTEGER DEFAULT 0,
  status TEXT DEFAULT 'new', table_session_id UUID, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders(status, created_at DESC);

CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), booking_code TEXT UNIQUE,
  name TEXT DEFAULT '', phone TEXT DEFAULT '', date TEXT NOT NULL, time TEXT NOT NULL,
  guests INTEGER DEFAULT 1, table_id TEXT NOT NULL, note TEXT DEFAULT '', status TEXT DEFAULT 'new',
  preorder_items JSONB DEFAULT '[]'::jsonb, preorder_subtotal INTEGER DEFAULT 0,
  lock_start TIMESTAMPTZ, lock_end TIMESTAMPTZ, lock_start_ms BIGINT, lock_end_ms BIGINT,
  lock_start_text TEXT DEFAULT '', lock_end_text TEXT DEFAULT '',
  session_id UUID, session_code TEXT DEFAULT '', paid_total INTEGER DEFAULT 0, closed_at_text TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bookings_table_date_status ON bookings(table_id, date, status);

CREATE TABLE IF NOT EXISTS table_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), session_code TEXT UNIQUE, booking_id UUID,
  customer_name TEXT DEFAULT 'Khách tại bàn', phone TEXT DEFAULT '', guests INTEGER DEFAULT 1,
  tables JSONB DEFAULT '[]'::jsonb, main_table TEXT DEFAULT '', table_id TEXT DEFAULT '',
  status TEXT DEFAULT 'open', source TEXT DEFAULT 'walk-in', calls JSONB DEFAULT '[]'::jsonb, note TEXT DEFAULT '',
  arrival_clock TEXT DEFAULT '', lock_start TIMESTAMPTZ, lock_end TIMESTAMPTZ, lock_start_ms BIGINT, lock_end_ms BIGINT,
  lock_start_text TEXT DEFAULT '', lock_end_text TEXT DEFAULT '',
  total INTEGER DEFAULT 0, preorder_total INTEGER DEFAULT 0, extra_total INTEGER DEFAULT 0,
  opened_at_text TEXT DEFAULT '', closed_at_text TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sessions_status_created ON table_sessions(status, created_at DESC);

CREATE TABLE IF NOT EXISTS inventory (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, unit TEXT DEFAULT '', stock NUMERIC DEFAULT 0, min_stock NUMERIC DEFAULT 0,
  last_import_qty NUMERIC DEFAULT 0, last_import_price INTEGER DEFAULT 0, last_import_date TEXT DEFAULT '',
  supplier TEXT DEFAULT '', note TEXT DEFAULT '', updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS archived_years (
  year INTEGER PRIMARY KEY, summary JSONB DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ DEFAULT now()
);
