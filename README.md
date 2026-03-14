# 🧠 MerchantMind: Agentic Growth for Pine Labs

MerchantMind is an AI-powered commerce layer that transforms every card swipe on a Pine Labs POS terminal into an autonomous growth engine. It uses Amazon Bedrock (Claude 3) to process real-time payment data, giving merchants the power to automate inventory, recover churned customers, and offer personalized rewards instantly.

---

## 🚀 The Vision

Every Pine Labs terminal captures what customers buy. MerchantMind makes that data act for the merchant automatically.

1. **Agent 1: Dynamic Offer Agent (Real-time)**
   - Runs synchronously at payment time.
   - Analyzes customer history in **< 3 seconds** using Bedrock.
   - Surfaces a personalized offer (e.g., "₹50 off your first Pharma purchase") directly on the Plutus terminal screen _before_ the transaction closes.

2. **Agent 2: Restock Agent (Background)**
   - Monitors category purchase velocity.
   - Detects surges (e.g., "Personal Care purchases are up 40%!") and automatically drafts restock campaigns for the merchant to approve.

3. **Agent 3: Recovery Agent (Background)**
   - Scores customers via RFM (Recency, Frequency, Monetary).
   - Identifies loyal customers at risk of churn and generates personalized WhatsApp win-back messages.

---

## 🛠️ Tech Stack

- **Frontend**: Next.js 15, TailwindCSS, Lucide Icons, Shadcn UI.
- **Backend API**: Go (Gin), PostgreSQL, Redis (Caching).
- **AI Engine**: Python, Amazon Bedrock (Claude 3 Haiku/Sonnet), boto3.

---

## 🏗️ Getting Started

### 1. Prerequisites

- **PostgreSQL** (running on localhost:5432)
- **Redis** (running on localhost:6379)
- **AWS Bedrock Access** (with `AWS_BEARER_TOKEN_BEDROCK` or standard credentials)

### 2. Backend Setup (Go)

```bash
cd backend/merchant-api
go run main.go
# Server starts on http://localhost:8081
```

### 3. Dynamic Offer Agent (Python)

```bash
cd ml/agents
# Install dependencies: pip install flask boto3 psycopg2-binary python-dotenv
python dynamic_offer_agent_bedrock.py --server
# AI Service starts on http://localhost:5001
```

### 4. Frontend Dashboard (Next.js)

```bash
cd frontend
# Install dependencies: npm install
npm run dev
# Dashboard available at http://localhost:3000
# Terminal simulator at http://localhost:3000/terminal
```

---

## 📡 API Endpoints

- `POST /v1/offer/realtime` - Triggered by Terminal pre-payment.
- `POST /v1/transaction/tag` - Triggered by Terminal post-payment (starts background agents).
- `GET /v1/merchant/:id/campaigns` - Fetches AI-generated drafts.
- `POST /v1/campaign/:id/approve` - Dispatches campaign to WhatsApp.

---

## 🧪 Testing the Loop

1. **Swipe**: Go to `/terminal`, enter an amount, and tap **Pay**.
2. **Offer**: Wait for the AI offer to appear. Accept it to see the total adjust.
3. **Trigger**: Select a category (e.g., "Personal Care") to tag the transaction.
4. **Approve**: Open the Dashboard (`/`), find the new "Draft" campaign from the AI agent, and click **Approve**.
5. **Receive**: Check the linked WhatsApp account to see the message arrive!

---

_Built for the Pine Labs Hackathon 2026._
