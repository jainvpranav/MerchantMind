"""
Dynamic Offer Agent — Amazon Bedrock version
Real-time cross-sell offer at POS payment time. Must respond in <2 seconds.

Run modes:
  python dynamic_offer_agent_bedrock.py 1234          # test for customer 1234
  python dynamic_offer_agent_bedrock.py --server      # start Flask HTTP server
"""

import psycopg2
import json
import os
import sys
import time
from dotenv import load_dotenv

from bedrock_client import make_client, call_bedrock, MODEL_HAIKU

load_dotenv()

MERCHANT_ID = os.getenv("MERCHANT_ID")
DB_URL = os.getenv(
    "DB_URL",
    "host=localhost port=5432 user=merchantmind password=localdev123 dbname=merchantmind",
)

# ── Tool definitions ──────────────────────────────────────────────────────────

tools = [
    {
        "name": "get_customer_purchase_history",
        "description": (
            "Returns the customer's category purchase history at this merchant. "
            "Includes categories bought, frequency, avg basket, and categories never bought."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "customer_hash": {
                    "type": "string",
                    "description": "The hashed customer identifier",
                }
            },
            "required": ["customer_hash"],
        },
    },
    {
        "name": "get_available_offers",
        "description": "Returns the list of currently active offers for this merchant.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "return_offer_to_terminal",
        "description": (
            "Finalises the chosen offer. Call this exactly once. "
            "display_text must be under 80 characters — it shows on a small POS screen. "
            "discount_amount must be the numeric savings value (e.g. 50 for 50 off)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "offer_category": {"type": "string"},
                "display_text": {
                    "type": "string",
                    "description": "Offer shown on POS screen. Max 80 chars.",
                },
                "discount_amount": {
                    "type": "number",
                    "description": "The exact numeric savings provided by the offer in INR (e.g. 50, 200). If none, 0.",
                },
                "reasoning": {"type": "string"},
            },
            "required": [
                "offer_category",
                "display_text",
                "discount_amount",
                "reasoning",
            ],
        },
    },
    {
        "name": "no_offer_available",
        "description": "Call this if no offer is a good fit. Do not force a bad offer.",
        "input_schema": {
            "type": "object",
            "properties": {"reason": {"type": "string"}},
            "required": ["reason"],
        },
    },
]

# ── Tool handlers ─────────────────────────────────────────────────────────────

_offer_result = None  # set by return_offer_to_terminal or no_offer_available


def get_customer_purchase_history(customer_hash: str) -> str:
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    cur.execute(
        """
        SELECT
            category,
            COUNT(*)                            AS visit_count,
            ROUND(AVG(amount)::numeric, 2)      AS avg_amount,
            MAX(transacted_at)                  AS last_purchase
        FROM transactions
        WHERE merchant_id   = %s
          AND customer_hash = %s
        GROUP BY category
        ORDER BY visit_count DESC
    """,
        (MERCHANT_ID, customer_hash),
    )
    bought = cur.fetchall()

    cur.execute(
        "SELECT DISTINCT category FROM transactions WHERE merchant_id = %s",
        (MERCHANT_ID,),
    )
    all_categories = {r[0] for r in cur.fetchall()}
    bought_categories = {r[0] for r in bought}
    never_bought = list(all_categories - bought_categories)
    conn.close()

    if not bought:
        return json.dumps(
            {
                "customer_hash": customer_hash,
                "is_new_customer": True,
                "categories_bought": [],
                "never_bought": list(all_categories),
                "total_visits": 0,
            }
        )

    total_visits = sum(r[1] for r in bought)
    avg_basket = sum(float(r[2]) * r[1] for r in bought) / total_visits
    return json.dumps(
        {
            "customer_hash": customer_hash,
            "is_new_customer": False,
            "total_visits": total_visits,
            "avg_basket": round(avg_basket, 2),
            "categories_bought": [
                {
                    "category": r[0],
                    "visit_count": r[1],
                    "avg_amount": float(r[2]),
                    "last_purchase": str(r[3]),
                }
                for r in bought
            ],
            "never_bought": never_bought,
        },
        default=str,
    )


def get_available_offers() -> str:
    # Hardcoded demo offers — replace with DB query when you build the offer management UI
    return json.dumps(
        [
            {
                "id": "offer-001",
                "category": "Dairy",
                "description": "Add ₹200+ of dairy — get ₹30 cashback",
                "min_amount": 200,
                "discount": 30,
                "type": "cashback",
            },
            {
                "id": "offer-002",
                "category": "Pharma",
                "description": "Buy any 2 pharma items — 10% off",
                "min_amount": 150,
                "discount": 10,
                "type": "percentage",
            },
            {
                "id": "offer-003",
                "category": "Grocery",
                "description": "Spend ₹500+ on groceries — free delivery",
                "min_amount": 500,
                "discount": 0,
                "type": "free_delivery",
            },
            {
                "id": "offer-004",
                "category": "Personal Care",
                "description": "First personal care purchase — ₹50 off",
                "min_amount": 100,
                "discount": 50,
                "type": "flat_off",
            },
            {
                "id": "offer-005",
                "category": "Food & Bev",
                "description": "Buy 3+ beverages — 1 free",
                "min_amount": 120,
                "discount": 0,
                "type": "buy_x_get_1",
            },
        ]
    )


def return_offer_to_terminal(
    offer_category: str, display_text: str, discount_amount: float, reasoning: str
) -> str:
    global _offer_result
    _offer_result = {
        "has_offer": True,
        "offer_category": offer_category,
        "display_text": display_text,
        "discount_amount": float(discount_amount),
        "reasoning": reasoning,
    }
    return json.dumps({"status": "offer_set", "display_text": display_text})


def no_offer_available(reason: str) -> str:
    global _offer_result
    _offer_result = {"has_offer": False, "reason": reason}
    return json.dumps({"status": "no_offer", "reason": reason})


def handle_tool(name: str, tool_input: dict) -> str:
    if name == "get_customer_purchase_history":
        return get_customer_purchase_history(tool_input["customer_hash"])
    elif name == "get_available_offers":
        return get_available_offers()
    elif name == "return_offer_to_terminal":
        return return_offer_to_terminal(
            tool_input["offer_category"],
            tool_input["display_text"],
            tool_input.get("discount_amount", 0.0),
            tool_input.get("reasoning", ""),
        )
    elif name == "no_offer_available":
        return no_offer_available(tool_input.get("reason", "No suitable offer"))
    return json.dumps({"error": f"Unknown tool: {name}"})


# ── Agent loop ────────────────────────────────────────────────────────────────


def run_dynamic_offer_agent(customer_hash: str) -> dict:
    global _offer_result
    _offer_result = None

    client = make_client()

    messages = [
        {
            "role": "user",
            "content": f"""You are the Dynamic Offer Agent. A customer with hash "{customer_hash}" is paying right now.

You have under 2 seconds total. Be decisive:
1. Call get_customer_purchase_history to see what they buy.
2. Call get_available_offers to see active offers.
3. Pick the SINGLE best offer for a category they have NEVER bought or rarely buy.
4. Call return_offer_to_terminal (max 80 chars display_text).
   OR call no_offer_available if nothing fits.

One offer only. Do not overthink it.""",
        }
    ]

    for iteration in range(1, 6):  # tight limit — must be fast
        stop_reason, content_blocks, tool_calls = call_bedrock(
            client, MODEL_HAIKU, messages, tools=tools, max_tokens=512
        )

        if content_blocks:
            messages.append({"role": "assistant", "content": content_blocks})

        if stop_reason == "end_turn" or not tool_calls:
            break

        tool_results = []
        for tc in tool_calls:
            result = handle_tool(tc["name"], tc["input"])
            tool_results.append(
                {"type": "tool_result", "tool_use_id": tc["id"], "content": result}
            )
        messages.append({"role": "user", "content": tool_results})

        if _offer_result is not None:
            break

    if _offer_result is None:
        _offer_result = {"has_offer": False, "reason": "Agent did not produce a result"}

    return _offer_result


# ── HTTP server (for Go offer-engine-proxy to call) ───────────────────────────


def start_http_server(port: int = 5001):
    try:
        from flask import Flask, request, jsonify
    except ImportError:
        print("Flask not installed. Run: pip install flask")
        return

    app = Flask(__name__)

    @app.route("/offer", methods=["POST"])
    def offer():
        data = request.get_json()
        customer_hash = data.get("customer_hash", "")
        if not customer_hash:
            return jsonify({"error": "customer_hash required"}), 400
        start = time.time()
        result = run_dynamic_offer_agent(customer_hash)
        elapsed = round(time.time() - start, 3)
        result["elapsed_seconds"] = elapsed
        return jsonify(result)

    @app.route("/health", methods=["GET"])
    def health():
        return jsonify({"status": "ok"})

    print(f"🚀 Dynamic Offer Agent (Bedrock) running on port {port}")
    app.run(host="0.0.0.0", port=port, debug=False)


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    if not MERCHANT_ID:
        print("❌ MERCHANT_ID not set in .env")
        sys.exit(1)

    if len(sys.argv) > 1 and sys.argv[1] == "--server":
        start_http_server(int(os.getenv("OFFER_AGENT_PORT", "5001")))
    elif len(sys.argv) > 1:
        customer_hash = sys.argv[1]
        print(f"\n🎯 Running Dynamic Offer Agent for customer: {customer_hash}")
        start = time.time()
        result = run_dynamic_offer_agent(customer_hash)
        elapsed = round(time.time() - start, 3)
        print(f"\n── Result ({elapsed}s) ──────────────────────────────")
        print(json.dumps(result, indent=2))
    else:
        print("Usage:")
        print("  python dynamic_offer_agent_bedrock.py <customer_hash>")
        print("  python dynamic_offer_agent_bedrock.py --server")
        print("\nRunning test with customer '1000'...\n")
        start = time.time()
        result = run_dynamic_offer_agent("1000")
        elapsed = round(time.time() - start, 3)
        print(f"\n── Result ({elapsed}s) ──────────────────────────────")
        print(json.dumps(result, indent=2))
