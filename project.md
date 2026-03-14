MerchantMind — Integration Brief for Antigravity
What it is
MerchantMind is an agentic commerce layer that sits on top of Pine Labs POS terminals. It turns raw payment data into three autonomous AI agents that act on behalf of the merchant — restocking, recovering churned customers, and surfacing real-time offers at the point of payment.

The one-line pitch
Every Pine Labs terminal already captures what customers buy. MerchantMind makes that data work — automatically.

How it works (the full loop)
After every payment on a Pine Labs terminal, the merchant taps one of six category buttons (Grocery, Pharma, Clothing, etc.) on a post-payment screen. That single tap feeds a data pipeline that runs three AI agent loops in the background:
Agent 1 — Restock Agent
Monitors purchase velocity per category. When a category spikes more than 30% above its rolling weekly average, the agent calculates estimated days until stockout, drafts a plain-language restock alert, and surfaces it on the merchant's dashboard for one-tap approval. The merchant never has to manually track inventory movement.
Agent 2 — Recovery Agent
Scores every customer using RFM (Recency, Frequency, Monetary value). When a previously loyal customer crosses 10+ days without a visit, the agent generates a personalised WhatsApp win-back message — timed to their historical shopping window — and queues it for merchant approval before sending.
Agent 3 — Dynamic Offer Agent
Runs synchronously at payment time. When a returning customer taps to pay, their purchase history is looked up in under 2 seconds, the best cross-sell offer is selected from the merchant's active offer pool, and it appears on the POS screen before the transaction closes. No merchant action needed.

What we need Antigravity to integrate
SurfaceWhat's neededPine Labs Terminal SDKHook into the post-payment success event to fire our webhook and show the category tag UIPre-payment screenSurface the Dynamic Offer Agent's result on the terminal display before transaction closesWhatsApp Business APIProduction-grade message delivery for Recovery Agent campaigns (we currently use Twilio sandbox)Merchant dashboardEmbed our React dashboard (or expose the REST API endpoints so it can live inside the existing merchant portal)

What's already built
The entire backend is functional and running locally:

Go event pipeline (terminal-gateway → Kafka → event-consumer → PostgreSQL)
Python ML engine (FP-Growth basket analysis + RFM segmentation)
Three Claude API agent loops with tool-use (restock, recovery, dynamic offer)
Go REST API exposing all merchant data and campaign approval endpoints
Campaign dispatcher wired to Twilio WhatsApp sandbox
React dashboard with agent approval cards

The only missing pieces are the Pine Labs terminal SDK hooks, production WhatsApp delivery, and hardening for multi-merchant scale.

Tech stack
Go · Python · PostgreSQL · Kafka · Redis · Claude API (Anthropic) · React/Next.js · Twilio WhatsApp · AWS (RDS + EC2)

The ask
Two integration points are blocking demo-readiness for the hackathon:

Terminal hook — fire a POST to http://our-server/v1/transaction/tag after every payment success event, with merchant_id, amount, category (from tag UI), and optional customer_hash
Pre-payment callback — before the payment confirmation screen, call GET http://our-server/v1/offer/realtime with merchant_id + customer_hash, and display the returned display_text on screen if has_offer: true

Everything else on our side is ready to receive those two calls.
