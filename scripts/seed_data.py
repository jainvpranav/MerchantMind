import psycopg2, random, uuid
from datetime import datetime, timedelta

CATEGORIES = ['Grocery','Pharma','Clothing','Food & Bev','Electronics']
CUSTOMERS  = [str(i).zfill(4) for i in range(1000, 1050)]  # 50 fake customers

conn = psycopg2.connect('host=localhost user=merchantmind password=localdev123 dbname=merchantmind')
cur  = conn.cursor()

# Insert a demo merchant
merchant_id = str(uuid.uuid4())
cur.execute("INSERT INTO merchants (id,name) VALUES (%s,%s)", (merchant_id, 'Demo Store'))

# Generate 90 days of transaction history
for day in range(90):
    txn_date = datetime.now() - timedelta(days=90-day)
    num_txns = random.randint(20, 60)
    for _ in range(num_txns):
        customer = random.choice(CUSTOMERS)
        category = random.choices(CATEGORIES, weights=[40,20,15,15,10])[0]
        amount   = round(random.uniform(80, 1200), 2)
        cur.execute(
            'INSERT INTO transactions (id,merchant_id,amount,category,customer_hash,transacted_at) VALUES (%s,%s,%s,%s,%s,%s)',
            (str(uuid.uuid4()), merchant_id, amount, category, customer, txn_date)
        )

conn.commit()
print(f'Seeded merchant_id: {merchant_id}')  # Save this!
print('Done. Run: SELECT COUNT(*) FROM transactions;')