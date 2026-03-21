-- Categories table
CREATE TABLE IF NOT EXISTS categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID REFERENCES merchants(id),
  name        TEXT NOT NULL,
  description TEXT,
  emoji       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(merchant_id, name)
);

-- Offers table
CREATE TABLE IF NOT EXISTS offers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id     UUID REFERENCES merchants(id),
  title           TEXT NOT NULL,
  offer_type      TEXT NOT NULL, -- flat, percent, cashback, bogo
  discount_value  NUMERIC(10,2) NOT NULL,
  min_amount      NUMERIC(10,2) NOT NULL,
  target_segment  TEXT,          -- all, loyal, at_risk, new
  category_tag    TEXT,          -- Any or specific category name
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
