import pandas as pd
import psycopg2
import uuid
from datetime import datetime
from dotenv import load_dotenv
import os

load_dotenv()
MERCHANT_ID = os.getenv("MERCHANT_ID")

conn = psycopg2.connect(
    "host=localhost user=merchantmind password=localdev123 dbname=merchantmind"
)

cur = conn.cursor()
cur.execute(
    """
  SELECT customer_hash,
    MAX(transacted_at)     AS last_seen,
    COUNT(*)               AS frequency,
    SUM(amount)            AS monetary,
    AVG(amount)            AS avg_basket
  FROM transactions
  WHERE merchant_id = %s AND customer_hash IS NOT NULL
  GROUP BY customer_hash
""",
    (MERCHANT_ID,),
)

rows = cur.fetchall()
df = pd.DataFrame(
    rows,
    columns=["customer", "last_seen", "frequency", "monetary", "avg_basket"],
)

# Normalize to naive datetimes to avoid comparison errors with datetime.now()
last_seen_dt = pd.to_datetime(df["last_seen"], utc=True).dt.tz_localize(None)
now = datetime.now()

df["recency_days"] = (now - last_seen_dt).dt.days


# Assign segments based on recency + frequency
def segment(row):
    if row["recency_days"] <= 14 and row["frequency"] >= 5:
        return "loyal"
    elif row["recency_days"] <= 30 and row["frequency"] >= 2:
        return "active"
    elif row["recency_days"] <= 10:
        return "new"
    elif row["recency_days"] > 14 and row["frequency"] >= 3:
        return "at_risk"
    else:
        return "dormant"


df["segment"] = df.apply(segment, axis=1)

# Write to Postgres
cur.execute("DELETE FROM customer_segments WHERE merchant_id = %s", (MERCHANT_ID,))
for _, row in df.iterrows():
    cur.execute(
        "INSERT INTO customer_segments (id,merchant_id,customer_hash,segment,last_seen,avg_basket,visit_count,computed_at) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
        (
            str(uuid.uuid4()),
            MERCHANT_ID,
            row["customer"],
            row["segment"],
            row["last_seen"],
            float(row["avg_basket"]),
            int(row["frequency"]),
            datetime.now(),
        ),
    )
conn.commit()
print(df["segment"].value_counts())
