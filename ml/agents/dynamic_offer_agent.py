import anthropic
import psycopg2
import json
import os
import uuid
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

client      = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
MERCHANT_ID = os.getenv("MERCHANT_ID")
DB_URL      = os.getenv("DB_URL", "host=localhost port=5432 user=merchantmind password=localdev123 dbname=merchantmind")

# ── Tool definitions ──────────────────────────────────────────────────────────

tools = [
    {
        "name": "get_velocity_data",
        "description": (
            "Returns the purchase velocity for every category for this merchant. "
            "Compares the last 7 days against the previous 7 days and returns "
            "the percentage change so you can spot spikes."
        ),
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": []
        }
    },
    {
        "name": "get_restock_history",
        "description": (
            "Returns how often each category has historically been restocked "
            "and the average days between restocks. Use this to estimate "
            "when the merchant will run out given the current velocity."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "category": {
                    "type": "string",
                    "description": "The product category to check restock history for"
                }
            },
            "required": ["category"]
        }
    },
    {
        "name": "draft_restock_alert",
        "description": (
            "Saves a restock alert to the campaigns table with status=draft. "
            "The merchant will see this in their dashboard and can approve it "
            "to trigger a supplier order or a reminder."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "category": {
                    "type": "string",
                    "description": "The category that needs restocking"
                },
                "message_body": {
                    "type": "string",
                    "description": (
                        "A short, clear WhatsApp-style message for the merchant. "
                        "Include the category, the velocity spike %, and the "
                        "estimated days until stockout. Max 200 characters."
                    )
                },
                "estimated_stockout_days": {
                    "type": "number",
                    "description": "Estimated number of days until the category runs out of stock"
                },
                "reasoning": {
                    "type": "string",
                    "description": "Brief explanation of why you're flagging this category"
                }
            },
            "required": ["category", "message_body", "estimated_stockout_days", "reasoning"]
        }
    }
]

# ── Tool handlers ─────────────────────────────────────────────────────────────

def get_velocity_data() -> str:
    """
    Compares transaction counts per category:
      - last 7 days  vs  previous 7 days
    Returns a list of categories with their counts and % change.
    """
    conn = psycopg2.connect(DB_URL)
    cur  = conn.cursor()

    cur.execute("""
        SELECT
            category,
            COUNT(*) FILTER (WHERE transacted_at >= NOW() - INTERVAL '7 days')  AS last_7,
            COUNT(*) FILTER (WHERE transacted_at >= NOW() - INTERVAL '14 days'
                               AND transacted_at <  NOW() - INTERVAL '7 days')  AS prev_7,
            ROUND(AVG(amount) FILTER (WHERE transacted_at >= NOW() - INTERVAL '7 days'), 2) AS avg_amount_last7
        FROM transactions
        WHERE merchant_id = %s
        GROUP BY category
        ORDER BY last_7 DESC
    """, (MERCHANT_ID,))

    rows = cur.fetchall()
    conn.close()

    result = []
    for category, last_7, prev_7, avg_amount in rows:
        if prev_7 and prev_7 > 0:
            pct_change = round(((last_7 - prev_7) / prev_7) * 100, 1)
        else:
            pct_change = 100.0 if last_7 > 0 else 0.0

        result.append({
            "category":        category,
            "last_7_days":     last_7,
            "prev_7_days":     prev_7,
            "pct_change":      pct_change,
            "avg_amount":      float(avg_amount) if avg_amount else 0.0,
            "spike_detected":  pct_change >= 30
        })

    return json.dumps(result, default=str)


def get_restock_history(category: str) -> str:
    """
    Approximates restock cadence by looking at gaps between
    high-volume days for the given category. For a real system
    you'd have a supplier_orders table; for the POC we infer
    from transaction density.
    """
    conn = psycopg2.connect(DB_URL)
    cur  = conn.cursor()

    # Find daily transaction counts for this category over the last 90 days
    cur.execute("""
        SELECT
            DATE(transacted_at)     AS day,
            COUNT(*)                AS txn_count,
            SUM(amount)             AS revenue
        FROM transactions
        WHERE merchant_id = %s
          AND category    = %s
          AND transacted_at >= NOW() - INTERVAL '90 days'
        GROUP BY DATE(transacted_at)
        ORDER BY day
    """, (MERCHANT_ID, category))

    rows = cur.fetchall()
    conn.close()

    if not rows:
        return json.dumps({
            "category":            category,
            "avg_daily_txns":      0,
            "peak_daily_txns":     0,
            "avg_daily_revenue":   0,
            "data_days":           0,
            "note":                "No historical data found for this category"
        })

    counts  = [r[1] for r in rows]
    revenue = [float(r[2]) for r in rows]

    return json.dumps({
        "category":          category,
        "avg_daily_txns":    round(sum(counts)  / len(counts),  1),
        "peak_daily_txns":   max(counts),
        "avg_daily_revenue": round(sum(revenue) / len(revenue), 2),
        "data_days":         len(rows),
        "note": (
            "Higher avg_daily_txns relative to recent 7-day velocity "
            "suggests stock is being drawn down faster than usual."
        )
    })


def draft_restock_alert(category: str, message_body: str,
                         estimated_stockout_days: float, reasoning: str) -> str:
    """Writes a restock alert draft to the campaigns table."""
    conn = psycopg2.connect(DB_URL)
    cur  = conn.cursor()

    campaign_id = str(uuid.uuid4())
    cur.execute("""
        INSERT INTO campaigns
            (id, merchant_id, agent_type, status, target_segment, message_body, created_at)
        VALUES
            (%s, %s, %s, %s, %s, %s, %s)
    """, (
        campaign_id,
        MERCHANT_ID,
        "restock",
        "draft",
        category,
        message_body,
        datetime.now()
    ))
    conn.commit()
    conn.close()

    print(f"\n📦 Restock alert drafted for category: {category}")
    print(f"   Estimated stockout in {estimated_stockout_days:.0f} days")
    print(f"   Message: {message_body}")
    print(f"   Reasoning: {reasoning}")

    return json.dumps({
        "status":                  "saved",
        "campaign_id":             campaign_id,
        "category":                category,
        "estimated_stockout_days": estimated_stockout_days,
        "message":                 message_body
    })

# ── Tool dispatcher ───────────────────────────────────────────────────────────

def handle_tool(tool_name: str, tool_input: dict) -> str:
    print(f"   🔧 Tool called: {tool_name}  input={json.dumps(tool_input)}")

    if tool_name == "get_velocity_data":
        return get_velocity_data()

    elif tool_name == "get_restock_history":
        return get_restock_history(tool_input["category"])

    elif tool_name == "draft_restock_alert":
        return draft_restock_alert(
            category                = tool_input["category"],
            message_body            = tool_input["message_body"],
            estimated_stockout_days = tool_input.get("estimated_stockout_days", 0),
            reasoning               = tool_input.get("reasoning", "")
        )

    return json.dumps({"error": f"Unknown tool: {tool_name}"})

# ── Agent loop ────────────────────────────────────────────────────────────────

def run_restock_agent():
    print("\n🔄 Starting Restock Agent...")

    messages = [{
        "role": "user",
        "content": """You are the Restock Agent for a small retail merchant using Pine Labs.

Your job:
1. Call get_velocity_data to see which categories have had a spike in purchases recently.
2. For any category with a spike of 30% or more, call get_restock_history to understand
   how quickly that category typically gets drawn down.
3. Estimate how many days until the merchant might run out of stock at the current rate.
4. If the estimated stockout is within 10 days, call draft_restock_alert to create
   a draft alert for the merchant.

Only alert on categories that genuinely need attention. Do not alert on every category.
Be concise and practical — the merchant is a busy small business owner.
Keep the message_body friendly, specific, and under 200 characters."""
    }]

    # Agentic loop — runs until Claude stops calling tools
    max_iterations = 10
    iteration      = 0

    while iteration < max_iterations:
        iteration += 1
        print(f"\n--- Agent iteration {iteration} ---")

        response = client.messages.create(
            model      = "claude-sonnet-4-20250514",
            max_tokens = 1024,
            tools      = tools,
            messages   = messages
        )

        # Add Claude's response to conversation history
        messages.append({"role": "assistant", "content": response.content})

        print(f"   Stop reason: {response.stop_reason}")

        # If Claude is done, exit
        if response.stop_reason == "end_turn":
            for block in response.content:
                if hasattr(block, "text"):
                    print(f"\n🤖 Agent summary:\n{block.text}")
            break

        # Process tool calls
        tool_results = []
        for block in response.content:
            if block.type == "tool_use":
                result = handle_tool(block.name, block.input)
                tool_results.append({
                    "type":        "tool_result",
                    "tool_use_id": block.id,
                    "content":     result
                })

        if not tool_results:
            # No tools called and not end_turn — shouldn't happen, but exit safely
            break

        messages.append({"role": "user", "content": tool_results})

    print("\n✅ Restock Agent complete.")
    print("   Check dashboard: SELECT * FROM campaigns WHERE agent_type='restock';")


if __name__ == "__main__":
    if not MERCHANT_ID:
        print("❌ MERCHANT_ID not set in .env")
        exit(1)
    if not os.getenv("ANTHROPIC_API_KEY"):
        print("❌ ANTHROPIC_API_KEY not set in .env")
        exit(1)

    run_restock_agent()