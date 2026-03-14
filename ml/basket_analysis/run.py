# ml/basket_analysis/run.py
import pandas as pd
from mlxtend.frequent_patterns import fpgrowth, association_rules
from mlxtend.preprocessing import TransactionEncoder
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

# Fetch transactions
cur.execute(
    """
  SELECT customer_hash, DATE(transacted_at) as day, category
  FROM transactions
  WHERE merchant_id = %s AND customer_hash IS NOT NULL
""",
    (MERCHANT_ID,),
)

df = pd.DataFrame(cur.fetchall(), columns=["customer", "day", "category"])

# Build baskets: one row per customer-day session
baskets = df.groupby(["customer", "day"])["category"].apply(list).tolist()

# Encode for FP-Growth
te = TransactionEncoder()
te_arr = te.fit_transform(baskets)
basket_df = pd.DataFrame(te_arr, columns=te.columns_)

# Run FP-Growth
frequent = fpgrowth(basket_df, min_support=0.05, use_colnames=True)
if frequent.empty:
    print("No frequent itemsets found. Baskets might be too sparse.")
    rules = pd.DataFrame(
        columns=["antecedents", "consequents", "confidence", "support"]
    )
else:
    rules = association_rules(frequent, metric="confidence", min_threshold=0.3)

# Write rules back to Postgres
cur.execute("DELETE FROM basket_patterns WHERE merchant_id = %s", (MERCHANT_ID,))
for _, row in rules.iterrows():
    ante = ", ".join(list(row["antecedents"]))
    cons = ", ".join(list(row["consequents"]))
    cur.execute(
        "INSERT INTO basket_patterns (id,merchant_id,antecedent,consequent,confidence,support,computed_at) VALUES (%s,%s,%s,%s,%s,%s,%s)",
        (
            str(uuid.uuid4()),
            MERCHANT_ID,
            ante,
            cons,
            float(row["confidence"]),
            float(row["support"]),
            datetime.now(),
        ),
    )
conn.commit()
print(f"Wrote {len(rules)} association rules")
