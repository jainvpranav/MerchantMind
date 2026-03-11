-- Merchants table
CREATE TABLE merchants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Every POS transaction lands here
CREATE TABLE transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id     UUID REFERENCES merchants(id),
  amount          NUMERIC(10,2) NOT NULL,
  category        TEXT NOT NULL,
  customer_hash   TEXT,          -- hashed last-4 phone, nullable
  transacted_at   TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Basket analysis results (written by Python nightly)
CREATE TABLE basket_patterns (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id  UUID REFERENCES merchants(id),
  antecedent   TEXT NOT NULL,   -- e.g. 'Grocery'
  consequent   TEXT NOT NULL,   -- e.g. 'Dairy'
  confidence   NUMERIC(5,4),
  support      NUMERIC(5,4),
  computed_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Customer segments (written by Python nightly)
CREATE TABLE customer_segments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id    UUID REFERENCES merchants(id),
  customer_hash  TEXT NOT NULL,
  segment        TEXT NOT NULL,  -- 'loyal','at_risk','new','dormant'
  rfm_score      NUMERIC(5,2),
  last_seen      TIMESTAMPTZ,
  avg_basket     NUMERIC(10,2),
  visit_count    INT,
  computed_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Campaigns created by agents
CREATE TABLE campaigns (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id    UUID REFERENCES merchants(id),
  agent_type     TEXT NOT NULL,  -- 'recovery','restock','offer'
  status         TEXT DEFAULT 'draft',  -- draft,approved,sent
  target_segment TEXT,
  message_body   TEXT,
  scheduled_at   TIMESTAMPTZ,
  sent_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast merchant queries
CREATE INDEX idx_txn_merchant  ON transactions(merchant_id, transacted_at DESC);
CREATE INDEX idx_txn_customer  ON transactions(customer_hash, merchant_id);
CREATE INDEX idx_seg_merchant  ON customer_segments(merchant_id, segment);
