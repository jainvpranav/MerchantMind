"""
MerchantMind — Comprehensive Seed Data Generator

Covers every customer segment, edge case, and agent trigger scenario:

CUSTOMER ARCHETYPES (50 customers total):
  - C1000–C1009  : Loyal customers     (frequent, recent, high basket)
  - C2000–C2009  : Active customers    (regular, recent, medium basket)
  - C3000–C3009  : At-Risk customers   (were loyal/active, gone quiet 15-25 days)
  - C4000–C4004  : New customers       (first purchase in last 7 days)
  - C5000–C5009  : Dormant customers   (haven't visited in 30-90 days)
  - C6000–C6004  : High-value one-timers (single massive purchase, never returned)
  - C7000–C7004  : Bargain shoppers    (very frequent, very low basket)
  - C8000–C8004  : Category specialists (only ever buy one category)

BASKET PATTERNS (for FP-Growth to detect):
  - Grocery → Dairy         (strong rule, confidence ~0.7)
  - Grocery → Beverages     (strong rule, confidence ~0.6)
  - Pharma → Personal Care  (medium rule, confidence ~0.4)
  - Electronics → Accessories (medium rule)
  - Clothing → Personal Care (weak rule)

AGENT TRIGGER SCENARIOS:
  - Restock Agent : Grocery velocity spike in last 7 days (+40% vs prev week)
  - Recovery Agent: C3000-C3009 are at_risk — perfect win-back targets
  - Dynamic Offer : C1000-C1009 return regularly — cross-sell opportunities exist

Usage:
  cd ml
  source venv/bin/activate
  python scripts/seed_data.py

  Prints the merchant_id at the end — save it.
"""

import psycopg2
import random
import uuid
from datetime import datetime, timedelta

# ── Config ────────────────────────────────────────────────────────────────────

DB_URL = "host=localhost port=5432 user=merchantmind password=localdev123 dbname=merchantmind"
random.seed(42)  # reproducible data — same run always gives same results

NOW = datetime.now()


def days_ago(n):
    return NOW - timedelta(days=n)


def rand_time(base_date):
    """Add a random hour/minute to a date so timestamps aren't all midnight."""
    return base_date + timedelta(
        hours=random.randint(8, 22), minutes=random.randint(0, 59)
    )


def txn(merchant_id, customer_hash, category, amount, date):
    return (
        str(uuid.uuid4()),
        merchant_id,
        round(amount, 2),
        category,
        customer_hash,
        rand_time(date),
    )


# ── Category sets ─────────────────────────────────────────────────────────────

ALL_CATS = ["Grocery", "Pharma", "Clothing", "Food & Bev", "Electronics"]
DAIRY = "Dairy"  # sub-category of Grocery for basket patterns
BEVERAGES = "Food & Bev"
PERSONAL = "Personal Care"  # sub-category for Pharma cross-sell
ACCESSORIES = "Electronics"  # reusing Electronics for simplicity

# ── Transaction builders ──────────────────────────────────────────────────────


def build_loyal_customer(merchant_id, cid):
    """
    Shops 3-5x per week, every week, for the last 90 days.
    Buys across multiple categories — perfect for basket analysis.
    High average basket: ₹400-900.
    Last visit: 0-3 days ago.
    """
    rows = []
    for day_offset in range(90, 0, -1):
        # Shops on ~60% of days (roughly 4x per week)
        if random.random() > 0.60:
            continue
        date = days_ago(day_offset)
        num_items = random.randint(1, 3)

        # Always buys Grocery — makes them good for basket rule detection
        rows.append(txn(merchant_id, cid, "Grocery", random.uniform(300, 800), date))

        # 70% chance also buys Dairy on same day (creates Grocery→Dairy rule)
        if num_items >= 2 and random.random() < 0.70:
            rows.append(txn(merchant_id, cid, "Dairy", random.uniform(80, 200), date))

        # 50% chance also buys Beverages (creates Grocery→Food & Bev rule)
        if num_items >= 2 and random.random() < 0.50:
            rows.append(
                txn(merchant_id, cid, "Food & Bev", random.uniform(60, 150), date)
            )

    # Ensure a visit within last 3 days
    for i in range(random.randint(1, 3)):
        rows.append(
            txn(
                merchant_id,
                cid,
                "Grocery",
                random.uniform(400, 900),
                days_ago(random.randint(0, 3)),
            )
        )
    return rows


def build_active_customer(merchant_id, cid):
    """
    Shops 1-2x per week, for the last 60 days.
    Medium basket: ₹200-500.
    Last visit: 3-10 days ago.
    """
    rows = []
    for day_offset in range(60, 10, -1):
        if random.random() > 0.30:
            continue
        date = days_ago(day_offset)
        cat = random.choices(["Grocery", "Pharma", "Food & Bev"], weights=[50, 30, 20])[
            0
        ]
        rows.append(txn(merchant_id, cid, cat, random.uniform(200, 500), date))

        # Pharma → Personal Care co-purchase (medium basket rule)
        if cat == "Pharma" and random.random() < 0.40:
            rows.append(
                txn(merchant_id, cid, "Personal Care", random.uniform(100, 300), date)
            )

    # Last visit 3-10 days ago
    rows.append(
        txn(
            merchant_id,
            cid,
            random.choice(["Grocery", "Pharma"]),
            random.uniform(200, 500),
            days_ago(random.randint(3, 10)),
        )
    )
    return rows


def build_at_risk_customer(merchant_id, cid):
    """
    WAS a loyal/active customer. Has been MIA for 15-25 days.
    Has strong history — the Recovery Agent should flag these.
    """
    rows = []
    # Strong history 90–25 days ago
    for day_offset in range(90, 25, -1):
        if random.random() > 0.40:
            continue
        date = days_ago(day_offset)
        cat = random.choices(["Grocery", "Pharma", "Clothing"], weights=[50, 30, 20])[0]
        rows.append(txn(merchant_id, cid, cat, random.uniform(250, 600), date))

        if cat == "Pharma" and random.random() < 0.40:
            rows.append(
                txn(merchant_id, cid, "Personal Care", random.uniform(100, 250), date)
            )

    # Last visit was 15-25 days ago — the trigger window for at_risk
    last_visit_days = random.randint(15, 25)
    rows.append(
        txn(
            merchant_id,
            cid,
            random.choice(["Grocery", "Clothing"]),
            random.uniform(300, 700),
            days_ago(last_visit_days),
        )
    )
    return rows


def build_new_customer(merchant_id, cid):
    """
    First-time visitor. 1-3 transactions, all in the last 7 days.
    Small basket — still exploring.
    No basket patterns to detect yet (good edge case for agents).
    """
    rows = []
    num_visits = random.randint(1, 3)
    for i in range(num_visits):
        date = days_ago(random.randint(0, 6))
        cat = random.choice(ALL_CATS)
        rows.append(txn(merchant_id, cid, cat, random.uniform(100, 400), date))
    return rows


def build_dormant_customer(merchant_id, cid):
    """
    Has history but completely gone. Last visit 30-90 days ago.
    Were moderately active before — not worth aggressive recovery.
    """
    rows = []
    # History 90–35 days ago
    for day_offset in range(90, 35, -1):
        if random.random() > 0.20:
            continue
        date = days_ago(day_offset)
        rows.append(
            txn(
                merchant_id,
                cid,
                random.choice(ALL_CATS),
                random.uniform(150, 400),
                date,
            )
        )

    # Last visit 30-90 days ago
    last_visit = random.randint(30, 90)
    rows.append(
        txn(
            merchant_id,
            cid,
            random.choice(ALL_CATS),
            random.uniform(150, 400),
            days_ago(last_visit),
        )
    )
    return rows


def build_high_value_onetimer(merchant_id, cid):
    """
    Single massive purchase (₹3000-8000) in the last 30 days, never returned.
    Electronics or Clothing. Edge case for segmentation.
    """
    rows = []
    cat = random.choice(["Electronics", "Clothing"])
    rows.append(
        txn(
            merchant_id,
            cid,
            cat,
            random.uniform(3000, 8000),
            days_ago(random.randint(5, 30)),
        )
    )
    # Maybe one accessory purchase same day
    if cat == "Electronics" and random.random() < 0.60:
        rows.append(
            txn(
                merchant_id,
                cid,
                "Electronics",
                random.uniform(200, 800),
                days_ago(random.randint(5, 30)),
            )
        )
    return rows


def build_bargain_shopper(merchant_id, cid):
    """
    Comes in almost daily but spends very little each time (₹30-80).
    High frequency, low value — interesting for RFM scoring.
    """
    rows = []
    for day_offset in range(60, 0, -1):
        if random.random() > 0.70:  # 70% of days
            continue
        date = days_ago(day_offset)
        rows.append(
            txn(
                merchant_id,
                cid,
                random.choice(["Grocery", "Food & Bev"]),
                random.uniform(30, 80),
                date,
            )
        )
    # Recent visit
    rows.append(
        txn(
            merchant_id,
            cid,
            "Grocery",
            random.uniform(30, 80),
            days_ago(random.randint(0, 2)),
        )
    )
    return rows


def build_category_specialist(merchant_id, cid, category):
    """
    Only ever buys one category. Useful for testing offer cross-sell logic.
    The Dynamic Offer Agent should try to cross-sell a different category.
    """
    rows = []
    for day_offset in range(60, 0, -1):
        if random.random() > 0.25:
            continue
        date = days_ago(day_offset)
        rows.append(txn(merchant_id, cid, category, random.uniform(200, 600), date))
    # Recent visit
    rows.append(
        txn(
            merchant_id,
            cid,
            category,
            random.uniform(200, 600),
            days_ago(random.randint(0, 5)),
        )
    )
    return rows


def build_restock_spike(merchant_id):
    """
    Generates extra Grocery transactions in the last 7 days to trigger
    the Restock Agent's velocity spike detector (+40% vs previous week).
    These are anonymous (no customer_hash) — simulating a busy period.
    """
    rows = []
    # Normal volume: ~15 Grocery txns in days 14-8
    for day_offset in range(14, 7, -1):
        num = random.randint(10, 18)
        for _ in range(num):
            rows.append(
                txn(
                    merchant_id,
                    None,
                    "Grocery",
                    random.uniform(200, 700),
                    days_ago(day_offset),
                )
            )

    # Spike: ~25 Grocery txns in last 7 days (+40-60% spike)
    for day_offset in range(7, 0, -1):
        num = random.randint(18, 28)
        for _ in range(num):
            rows.append(
                txn(
                    merchant_id,
                    None,
                    "Grocery",
                    random.uniform(200, 700),
                    days_ago(day_offset),
                )
            )

    return rows


# ── Main ──────────────────────────────────────────────────────────────────────


def main():
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    # ── Create merchant ───────────────────────────────────────────────────────
    merchant_id = str(uuid.uuid4())
    cur.execute(
        "INSERT INTO merchants (id, name) VALUES (%s, %s)",
        (merchant_id, "Demo Store — MerchantMind"),
    )
    print(f"\n🏪 Created merchant: {merchant_id}")
    print("   Name: Demo Store — MerchantMind")

    # ── Build all transactions ────────────────────────────────────────────────
    all_txns = []

    print("\n👥 Building customer archetypes...")

    # Loyal customers (C1000–C1009)
    for i in range(10):
        cid = f"{1000 + i}"
        rows = build_loyal_customer(merchant_id, cid)
        all_txns.extend(rows)
    print(
        f"   ✅ 10 loyal customers (C1000–C1009)  — {sum(1 for t in all_txns)} txns so far"
    )

    count_before = len(all_txns)
    # Active customers (C2000–C2009)
    for i in range(10):
        cid = f"{2000 + i}"
        rows = build_active_customer(merchant_id, cid)
        all_txns.extend(rows)
    print(
        f"   ✅ 10 active customers (C2000–C2009) — +{len(all_txns) - count_before} txns"
    )

    count_before = len(all_txns)
    # At-risk customers (C3000–C3009) — Recovery Agent targets
    for i in range(10):
        cid = f"{3000 + i}"
        rows = build_at_risk_customer(merchant_id, cid)
        all_txns.extend(rows)
    print(
        f"   ✅ 10 at-risk customers (C3000–C3009) — +{len(all_txns) - count_before} txns  ← Recovery Agent will target these"
    )

    count_before = len(all_txns)
    # New customers (C4000–C4004)
    for i in range(5):
        cid = f"{4000 + i}"
        rows = build_new_customer(merchant_id, cid)
        all_txns.extend(rows)
    print(
        f"   ✅ 5 new customers (C4000–C4004)     — +{len(all_txns) - count_before} txns"
    )

    count_before = len(all_txns)
    # Dormant customers (C5000–C5009)
    for i in range(10):
        cid = f"{5000 + i}"
        rows = build_dormant_customer(merchant_id, cid)
        all_txns.extend(rows)
    print(
        f"   ✅ 10 dormant customers (C5000–C5009) — +{len(all_txns) - count_before} txns"
    )

    count_before = len(all_txns)
    # High-value one-timers (C6000–C6004)
    for i in range(5):
        cid = f"{6000 + i}"
        rows = build_high_value_onetimer(merchant_id, cid)
        all_txns.extend(rows)
    print(
        f"   ✅ 5 high-value one-timers (C6000–C6004) — +{len(all_txns) - count_before} txns"
    )

    count_before = len(all_txns)
    # Bargain shoppers (C7000–C7004)
    for i in range(5):
        cid = f"{7000 + i}"
        rows = build_bargain_shopper(merchant_id, cid)
        all_txns.extend(rows)
    print(
        f"   ✅ 5 bargain shoppers (C7000–C7004)   — +{len(all_txns) - count_before} txns"
    )

    count_before = len(all_txns)
    # Category specialists (C8000–C8004) — one per category
    specialist_cats = ["Grocery", "Pharma", "Clothing", "Food & Bev", "Electronics"]
    for i, cat in enumerate(specialist_cats):
        cid = f"{8000 + i}"
        rows = build_category_specialist(merchant_id, cid, cat)
        all_txns.extend(rows)
    print(
        f"   ✅ 5 category specialists (C8000–C8004) — +{len(all_txns) - count_before} txns"
    )

    count_before = len(all_txns)
    # Anonymous restock spike (no customer_hash)
    spike_rows = build_restock_spike(merchant_id)
    all_txns.extend(spike_rows)
    print(
        f"\n📦 Restock spike data             — +{len(all_txns) - count_before} txns  ← Restock Agent will trigger on Grocery"
    )

    # ── Bulk insert ───────────────────────────────────────────────────────────
    print(f"\n💾 Inserting {len(all_txns)} transactions into PostgreSQL...")

    INSERT_SQL = """
        INSERT INTO transactions
            (id, merchant_id, amount, category, customer_hash, transacted_at)
        VALUES (%s, %s, %s, %s, %s, %s)
        ON CONFLICT (id) DO NOTHING
    """

    # Insert in batches of 500 for performance
    batch_size = 500
    inserted = 0
    for i in range(0, len(all_txns), batch_size):
        batch = all_txns[i : i + batch_size]
        cur.executemany(INSERT_SQL, batch)
        inserted += len(batch)

    conn.commit()

    # ── Summary ───────────────────────────────────────────────────────────────
    cur.execute(
        """
        SELECT category, COUNT(*) as cnt,
               ROUND(AVG(amount)::numeric, 2) as avg_amount
        FROM transactions
        WHERE merchant_id = %s
        GROUP BY category
        ORDER BY cnt DESC
    """,
        (merchant_id,),
    )
    cat_stats = cur.fetchall()

    cur.execute(
        """
        SELECT COUNT(DISTINCT customer_hash)
        FROM transactions
        WHERE merchant_id = %s AND customer_hash IS NOT NULL
    """,
        (merchant_id,),
    )
    unique_customers = cur.fetchone()[0]

    cur.execute(
        """
        SELECT COUNT(*) FROM transactions WHERE merchant_id = %s
    """,
        (merchant_id,),
    )
    total = cur.fetchone()[0]

    conn.close()

    print(f"\n{'─' * 55}")
    print(f"✅ SEED COMPLETE")
    print(f"{'─' * 55}")
    print(f"  Total transactions : {total}")
    print(f"  Unique customers   : {unique_customers}")
    print(f"\n  By category:")
    for cat, cnt, avg in cat_stats:
        print(f"    {cat:<16} {cnt:>5} txns  avg ₹{avg}")

    print(f"\n{'─' * 55}")
    print(f"  MERCHANT ID (save this!):")
    print(f"  {merchant_id}")
    print(f"{'─' * 55}")

    print(f"""
  Next steps:
  1. Copy the merchant_id above into your .env:
       MERCHANT_ID={merchant_id}

  2. Run basket analysis:
       python basket_analysis/run.py

  3. Run RFM segmentation:
       python segmentation/rfm.py

  4. Run agents:
       python agents/restock_agent.py
       python agents/recovery_agent.py

  5. Test the API:
       curl http://localhost:8081/v1/merchant/{merchant_id}/summary

  Expected segments after RFM:
    loyal    → C1000-C1009  (10 customers)
    active   → C2000-C2009  (10 customers)
    at_risk  → C3000-C3009  (10 customers)  ← Recovery Agent triggers here
    new      → C4000-C4004  (5 customers)
    dormant  → C5000-C5009 + C6000-C6004   (10-15 customers)

  Expected basket rules after FP-Growth:
    Grocery    → Dairy        (confidence ~0.65)
    Grocery    → Food & Bev   (confidence ~0.55)
    Pharma     → Personal Care (confidence ~0.40)

  Expected Restock Agent trigger:
    Grocery spike: +40-60% vs previous 7 days
""")


if __name__ == "__main__":
    main()
