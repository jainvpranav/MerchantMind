"""
Restock Agent — Amazon Bedrock version
Detects category velocity spikes and drafts restock alerts.
"""

import psycopg2
import json
import os
import uuid
from datetime import datetime
from dotenv import load_dotenv

from bedrock_client import make_client, call_bedrock, MODEL_SONNET

load_dotenv()

MERCHANT_ID = os.getenv("MERCHANT_ID")
DB_URL      = os.getenv("DB_URL", "host=localhost port=5432 user=merchantmind password=localdev123 dbname=merchantmind")

# ── Tool definitions ──────────────────────────────────────────────────────────

tools = [
    {
        "name": "get_velocity_data",
        "description": (
            "Returns purchase velocity per category: last 7 days vs previous 7 days. "
            "Includes pct_change so you can spot spikes."
        ),
        "input_schema": {
            "type":       "object",
            "properties": {},
            "required":   []
        }
    },
    {
        "name": "get_restock_history",
        "description": "Returns average daily transactions and revenue for a specific category over 90 days.",
        "input_schema": {
            "type": "object",
            "properties": {
                "category": {
                    "type":        "string",
                    "description": "Category to check restock history for"
                }
            },
            "required": ["category"]
        }
    },
    {
        "name": "draft_restock_alert",
        "description": "Saves a restock alert draft to the campaigns table for merchant approval.",
        "input_schema": {
            "type": "object",
            "properties": {
                "category": {
                    "type": "string"
                },
                "message_body": {
                    "type":        "string",
                    "description": "Short merchant-facing alert. Max 200 chars. Include category, spike %, and estimated stockout days."
                },
                "estimated_stockout_days": {
                    "type": "number"
                },
                "reasoning": {
                    "type": "string"
                }
            },
            "required": ["category", "message_body", "estimated_stockout_days", "reasoning"]
        }
    }
]

# ── Tool handlers ─────────────────────────────────────────────────────────────

def get_velocity_data() -> str:
    conn = psycopg2.connect(DB_URL)
    cur  = conn.cursor()
    cur.execute("""
        SELECT
            category,
            COUNT(*) FILTER (WHERE transacted_at >= NOW() - INTERVAL '7 days')  AS last_7,
            COUNT(*) FILTER (WHERE transacted_at >= NOW() - INTERVAL '14 days'
                               AND transacted_at <  NOW() - INTERVAL '7 days')  AS prev_7,
            ROUND(AVG(amount) FILTER (WHERE transacted_at >= NOW() - INTERVAL '7 days')::numeric, 2)
                AS avg_amount_last7
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
            "category":       category,
            "last_7_days":    last_7,
            "prev_7_days":    prev_7,
            "pct_change":     pct_change,
            "avg_amount":     float(avg_amount) if avg_amount else 0.0,
            "spike_detected": pct_change >= 30
        })
    return json.dumps(result, default=str)


def get_restock_history(category: str) -> str:
    conn = psycopg2.connect(DB_URL)
    cur  = conn.cursor()
    cur.execute("""
        SELECT
            DATE(transacted_at) AS day,
            COUNT(*)            AS txn_count,
            SUM(amount)         AS revenue
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
        return json.dumps({"category": category, "avg_daily_txns": 0, "data_days": 0})

    counts  = [r[1] for r in rows]
    revenue = [float(r[2]) for r in rows]
    return json.dumps({
        "category":          category,
        "avg_daily_txns":    round(sum(counts)  / len(counts),  1),
        "peak_daily_txns":   max(counts),
        "avg_daily_revenue": round(sum(revenue) / len(revenue), 2),
        "data_days":         len(rows),
    })


def draft_restock_alert(category: str, message_body: str,
                         estimated_stockout_days: float, reasoning: str) -> str:
    conn = psycopg2.connect(DB_URL)
    cur  = conn.cursor()
    campaign_id = str(uuid.uuid4())
    cur.execute("""
        INSERT INTO campaigns
            (id, merchant_id, agent_type, status, target_segment, message_body, created_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
    """, (campaign_id, MERCHANT_ID, "restock", "draft",
          category, message_body, datetime.now()))
    conn.commit()
    conn.close()
    print(f"\n📦 Restock alert drafted")
    print(f"   Category : {category}")
    print(f"   Stockout : ~{estimated_stockout_days:.0f} days")
    print(f"   Message  : {message_body}")
    return json.dumps({"status": "saved", "campaign_id": campaign_id})


def handle_tool(name: str, tool_input: dict) -> str:
    print(f"   🔧 Tool: {name}  input={json.dumps(tool_input)[:120]}")
    if name == "get_velocity_data":
        return get_velocity_data()
    elif name == "get_restock_history":
        return get_restock_history(tool_input["category"])
    elif name == "draft_restock_alert":
        return draft_restock_alert(
            tool_input["category"],
            tool_input["message_body"],
            tool_input.get("estimated_stockout_days", 0),
            tool_input.get("reasoning", "")
        )
    return json.dumps({"error": f"Unknown tool: {name}"})


# ── Agent loop ────────────────────────────────────────────────────────────────

def run_restock_agent():
    print("\n🔄 Starting Restock Agent (Bedrock)...")

    client = make_client()

    messages = [{
        "role":    "user",
        "content": """You are the Restock Agent for a small retail merchant using Pine Labs.

Your job:
1. Call get_velocity_data to find categories with a spike of 30% or more.
2. For any spiking category, call get_restock_history to understand daily draw-down.
3. Estimate days until stockout at the current velocity.
4. If stockout is within 10 days, call draft_restock_alert.

Only alert on categories that genuinely need attention.
Keep the message_body friendly and under 200 characters."""
    }]

    for iteration in range(1, 10):
        print(f"\n--- Iteration {iteration} ---")

        stop_reason, content_blocks, tool_calls = call_bedrock(
            client, MODEL_SONNET, messages, tools=tools, max_tokens=1024
        )

        if content_blocks:
            messages.append({"role": "assistant", "content": content_blocks})

        print(f"   Stop reason: {stop_reason}")

        if stop_reason == "end_turn":
            for block in content_blocks:
                if block.get("type") == "text":
                    print(f"\n🤖 Agent summary:\n{block['text']}")
            break

        if not tool_calls:
            break

        tool_results = []
        for tc in tool_calls:
            result = handle_tool(tc["name"], tc["input"])
            tool_results.append({
                "type":        "tool_result",
                "tool_use_id": tc["id"],
                "content":     result
            })

        messages.append({"role": "user", "content": tool_results})

    print("\n✅ Restock Agent complete")
    print("   SELECT * FROM campaigns WHERE agent_type='restock';")


if __name__ == "__main__":
    if not MERCHANT_ID:
        print("❌ MERCHANT_ID not set in .env")
        exit(1)
    run_restock_agent()
