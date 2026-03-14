"""
Recovery Agent — Amazon Bedrock version
Detects at-risk customers and drafts personalised win-back campaigns.
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

# ── Tool definitions (Anthropic SDK format — bedrock_client converts them) ────

tools = [
    {
        "name": "get_at_risk_customers",
        "description": "Returns customers whose RFM segment is at_risk for this merchant",
        "input_schema": {
            "type":       "object",
            "properties": {},
            "required":   []
        }
    },
    {
        "name": "draft_winback_campaign",
        "description": "Saves a personalised win-back campaign draft to the database for merchant approval",
        "input_schema": {
            "type": "object",
            "properties": {
                "target_segment": {
                    "type":        "string",
                    "description": "The customer segment being targeted"
                },
                "message_body": {
                    "type":        "string",
                    "description": "Personalised WhatsApp message. Friendly, under 160 chars, includes a small incentive."
                },
                "reasoning": {
                    "type":        "string",
                    "description": "Why this campaign makes sense for these customers"
                }
            },
            "required": ["target_segment", "message_body", "reasoning"]
        }
    }
]

# ── Tool handlers ─────────────────────────────────────────────────────────────

def get_at_risk_customers() -> str:
    conn = psycopg2.connect(DB_URL)
    cur  = conn.cursor()
    cur.execute("""
        SELECT
            customer_hash,
            avg_basket,
            visit_count,
            EXTRACT(DAY FROM NOW() - last_seen) AS days_absent
        FROM customer_segments
        WHERE merchant_id = %s
          AND segment     = 'at_risk'
        ORDER BY avg_basket DESC
        LIMIT 20
    """, (MERCHANT_ID,))
    rows = cur.fetchall()
    conn.close()
    return json.dumps([
        {
            "customer":    r[0],
            "avg_basket":  float(r[1]),
            "visits":      r[2],
            "days_absent": float(r[3])
        }
        for r in rows
    ])


def draft_winback_campaign(target_segment: str, message_body: str, reasoning: str) -> str:
    conn = psycopg2.connect(DB_URL)
    cur  = conn.cursor()
    campaign_id = str(uuid.uuid4())
    cur.execute("""
        INSERT INTO campaigns
            (id, merchant_id, agent_type, status, target_segment, message_body, created_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
    """, (campaign_id, MERCHANT_ID, "recovery", "draft",
          target_segment, message_body, datetime.now()))
    conn.commit()
    conn.close()
    print(f"\n💬 Win-back campaign drafted")
    print(f"   Segment : {target_segment}")
    print(f"   Message : {message_body}")
    print(f"   Reason  : {reasoning}")
    return json.dumps({"status": "saved", "campaign_id": campaign_id})


def handle_tool(name: str, tool_input: dict) -> str:
    print(f"   🔧 Tool: {name}  input={json.dumps(tool_input)[:120]}")
    if name == "get_at_risk_customers":
        return get_at_risk_customers()
    elif name == "draft_winback_campaign":
        return draft_winback_campaign(
            tool_input["target_segment"],
            tool_input["message_body"],
            tool_input.get("reasoning", "")
        )
    return json.dumps({"error": f"Unknown tool: {name}"})


# ── Agent loop ────────────────────────────────────────────────────────────────

def run_recovery_agent():
    print("\n🔄 Starting Recovery Agent (Bedrock)...")

    client = make_client()

    messages = [{
        "role":    "user",
        "content": """You are the Recovery Agent for a small retail merchant using Pine Labs.

Your job:
1. Call get_at_risk_customers to see who has stopped visiting.
2. Analyse their avg_basket, visit count, and days absent.
3. Draft one warm, personalised WhatsApp win-back message for the at_risk segment.
   - Keep it under 160 characters
   - Sound friendly, not spammy
   - Include a small incentive (e.g. 5% off next visit)
4. Call draft_winback_campaign with the message.

Only draft one campaign per agent run."""
    }]

    for iteration in range(1, 8):
        print(f"\n--- Iteration {iteration} ---")

        stop_reason, content_blocks, tool_calls = call_bedrock(
            client, MODEL_SONNET, messages, tools=tools, max_tokens=1024
        )

        # Add assistant response to history
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

        # Run tools and collect results
        tool_results = []
        for tc in tool_calls:
            result = handle_tool(tc["name"], tc["input"])
            tool_results.append({
                "type":        "tool_result",
                "tool_use_id": tc["id"],
                "content":     result
            })

        messages.append({"role": "user", "content": tool_results})

    print("\n✅ Recovery Agent complete")
    print("   SELECT * FROM campaigns WHERE agent_type='recovery';")


if __name__ == "__main__":
    if not MERCHANT_ID:
        print("❌ MERCHANT_ID not set in .env")
        exit(1)
    run_recovery_agent()
