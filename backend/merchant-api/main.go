package main

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/go-redis/redis/v8"
	_ "github.com/lib/pq"
)

// ── Config ────────────────────────────────────────────────────────────────────

type Config struct {
	DBHost           string
	DBPort           string
	DBUser           string
	DBPassword       string
	DBName           string
	Port             string
	RedisAddr        string
	OfferAgentURL    string
	OfferCacheTTL    time.Duration
	AgentTimeoutSecs int
}

func loadConfig() Config {
	return Config{
		DBHost:           getEnv("DB_HOST", "localhost"),
		DBPort:           getEnv("DB_PORT", "5432"),
		DBUser:           getEnv("DB_USER", "merchantmind"),
		DBPassword:       getEnv("DB_PASSWORD", "localdev123"),
		DBName:           getEnv("DB_NAME", "merchantmind"),
		Port:             getEnv("PORT", "8081"),
		RedisAddr:        getEnv("REDIS_ADDR", "localhost:6379"),
		OfferAgentURL:    getEnv("OFFER_AGENT_URL", "http://localhost:5001/offer"),
		OfferCacheTTL:    30 * time.Minute,
		AgentTimeoutSecs: 8,
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// ── DB ────────────────────────────────────────────────────────────────────────

func connectDB(cfg Config) (*sql.DB, error) {
	dsn := fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		cfg.DBHost, cfg.DBPort, cfg.DBUser, cfg.DBPassword, cfg.DBName,
	)
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(20)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("ping failed: %w", err)
	}
	log.Println("✅ Connected to PostgreSQL")
	return db, nil
}

// ── Response models ───────────────────────────────────────────────────────────

type SummaryResponse struct {
	MerchantID    string  `json:"merchant_id"`
	TodayRevenue  float64 `json:"today_revenue"`
	TodayTxns     int     `json:"today_txns"`
	WeekRevenue   float64 `json:"week_revenue"`
	WeekTxns      int     `json:"week_txns"`
	TopCategory   string  `json:"top_category"`
	ActiveCampaigns int   `json:"active_campaigns"`
}

type PatternRow struct {
	Antecedent string  `json:"antecedent"`
	Consequent string  `json:"consequent"`
	Confidence float64 `json:"confidence"`
	Support    float64 `json:"support"`
}

type SegmentRow struct {
	Segment     string  `json:"segment"`
	CustomerCount int   `json:"customer_count"`
	AvgBasket   float64 `json:"avg_basket"`
}

type CustomerRow struct {
	CustomerHash string  `json:"customer_hash"`
	Segment      string  `json:"segment"`
	AvgBasket    float64 `json:"avg_basket"`
	VisitCount   int     `json:"visit_count"`
	DaysAbsent   float64 `json:"days_absent"`
	LastSeen     string  `json:"last_seen"`
}

type CampaignRow struct {
	ID            string  `json:"id"`
	AgentType     string  `json:"agent_type"`
	Status        string  `json:"status"`
	TargetSegment string  `json:"target_segment"`
	MessageBody   string  `json:"message_body"`
	CreatedAt     string  `json:"created_at"`
	ScheduledAt   *string `json:"scheduled_at"`
}

type VelocityRow struct {
	Category   string  `json:"category"`
	Last7Days  int     `json:"last_7_days"`
	Prev7Days  int     `json:"prev_7_days"`
	PctChange  float64 `json:"pct_change"`
}

type ApproveRequest struct {
	ScheduledAt *time.Time `json:"scheduled_at"` // optional — defaults to now
}

// ── Offer Models ──────────────────────────────────────────────────────────────

type OfferRequest struct {
	MerchantID   string `json:"merchant_id"   binding:"required"`
	CustomerHash string `json:"customer_hash" binding:"required"`
}

type OfferResponse struct {
	HasOffer       bool    `json:"has_offer"`
	DisplayText    string  `json:"display_text,omitempty"`
	Category       string  `json:"offer_category,omitempty"`
	DiscountAmount float64 `json:"discount_amount,omitempty"`
	Source         string  `json:"source"`
	ElapsedMS      int64   `json:"elapsed_ms"`
}

type TagRequest struct {
	MerchantID   string  `json:"merchant_id" binding:"required"`
	Category     string  `json:"category" binding:"required"`
	Amount       float64 `json:"amount" binding:"required"`
	CustomerHash string  `json:"customer_hash"`
}

type agentPayload struct {
	CustomerHash string `json:"customer_hash"`
}

type agentResponse struct {
	HasOffer       bool    `json:"has_offer"`
	DisplayText    string  `json:"display_text"`
	OfferCategory  string  `json:"offer_category"`
	DiscountAmount float64 `json:"discount_amount"`
	Reasoning      string  `json:"reasoning"`
	ElapsedSecs    float64 `json:"elapsed_seconds"`
}

// ── Redis Cache ───────────────────────────────────────────────────────────────

func connectRedis(cfg Config) *redis.Client {
	rdb := redis.NewClient(&redis.Options{
		Addr:     cfg.RedisAddr,
		Password: "",
		DB:       0,
	})
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	if err := rdb.Ping(ctx).Err(); err != nil {
		log.Printf("⚠️  Redis unavailable (%v) — offer caching disabled", err)
		return nil
	}
	log.Println("✅ Connected to Redis")
	return rdb
}

func cacheKey(merchantID, customerHash string) string {
	return fmt.Sprintf("offer:%s:%s", merchantID, customerHash)
}

func getFromCache(rdb *redis.Client, merchantID, customerHash string) (*OfferResponse, bool) {
	if rdb == nil {
		return nil, false
	}
	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()

	val, err := rdb.Get(ctx, cacheKey(merchantID, customerHash)).Result()
	if err != nil {
		return nil, false
	}

	var offer OfferResponse
	if err := json.Unmarshal([]byte(val), &offer); err != nil {
		return nil, false
	}
	offer.Source = "cache"
	return &offer, true
}

func setInCache(rdb *redis.Client, merchantID, customerHash string, offer OfferResponse, ttl time.Duration) {
	if rdb == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()

	data, err := json.Marshal(offer)
	if err != nil {
		return
	}
	_ = rdb.Set(ctx, cacheKey(merchantID, customerHash), data, ttl).Err()
}

// ── Python Agent Caller ───────────────────────────────────────────────────────

func callOfferAgent(cfg Config, customerHash string) (*agentResponse, error) {
	payload, err := json.Marshal(agentPayload{CustomerHash: customerHash})
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(
		context.Background(),
		time.Duration(cfg.AgentTimeoutSecs)*time.Second,
	)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, cfg.OfferAgentURL,
		bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("agent request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("reading agent response: %w", err)
	}

	var ar agentResponse
	if err := json.Unmarshal(body, &ar); err != nil {
		return nil, fmt.Errorf("parsing agent response: %w", err)
	}

	return &ar, nil
}

// ── Handlers ──────────────────────────────────────────────────────────────────

// GET /v1/merchant/:id/summary
// Top-line numbers for the dashboard header cards
func handleSummary(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		merchantID := c.Param("id")

		var s SummaryResponse
		s.MerchantID = merchantID

		// Today revenue + txn count
		row := db.QueryRow(`
			SELECT
				COALESCE(SUM(amount), 0),
				COUNT(*)
			FROM transactions
			WHERE merchant_id = $1
			  AND transacted_at >= CURRENT_DATE
		`, merchantID)
		if err := row.Scan(&s.TodayRevenue, &s.TodayTxns); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		// This week revenue + txn count
		row = db.QueryRow(`
			SELECT
				COALESCE(SUM(amount), 0),
				COUNT(*)
			FROM transactions
			WHERE merchant_id = $1
			  AND transacted_at >= DATE_TRUNC('week', NOW())
		`, merchantID)
		if err := row.Scan(&s.WeekRevenue, &s.WeekTxns); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		// Top category this week
		row = db.QueryRow(`
			SELECT category
			FROM transactions
			WHERE merchant_id = $1
			  AND transacted_at >= DATE_TRUNC('week', NOW())
			GROUP BY category
			ORDER BY COUNT(*) DESC
			LIMIT 1
		`, merchantID)
		_ = row.Scan(&s.TopCategory) // not fatal if no data yet

		// Draft + approved campaigns pending action
		row = db.QueryRow(`
			SELECT COUNT(*)
			FROM campaigns
			WHERE merchant_id = $1
			  AND status IN ('draft', 'draft')
		`, merchantID)
		_ = row.Scan(&s.ActiveCampaigns)

		c.JSON(http.StatusOK, s)
	}
}

// runPythonAgent launches a Python bedrock agent script in a background goroutine.
// scriptName should be the filename only (e.g. "recovery_agent_bedrock.py").
// agentsDir is the absolute path to ml/agents/.
func runPythonAgent(agentsDir, scriptName, merchantID string) {
	scriptPath := agentsDir + "/" + scriptName
	cmd := exec.Command("python", scriptPath)
	// Set working dir to ml/agents so python's load_dotenv finds the right .env
	cmd.Dir = agentsDir
	cmd.Env = append(os.Environ(), "MERCHANT_ID="+merchantID, "PYTHONIOENCODING=utf-8")

	out, err := cmd.CombinedOutput()
	if err != nil {
		log.Printf("❌ %s failed: %v\nOutput: %s", scriptName, err, string(out))
	} else {
		log.Printf("✅ %s finished successfully\n%s", scriptName, string(out))
	}
}

// agentsDir returns the absolute path to ml/agents relative to this binary.
// Assumes the binary is run from the backend/merchant-api folder.
func agentsDirPath() string {
	// Walk up two levels from backend/merchant-api to the project root, then into ml/agents
	wd, err := os.Getwd()
	if err != nil {
		return "../../ml/agents"
	}
	return wd + "/../../ml/agents"
}

// POST /v1/merchant/:id/agent/recovery
// Manually triggers the Python Recovery Agent (Bedrock version)
func handleRunRecoveryAgent(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		merchantID := c.Param("id")
		go func(mID string) {
			log.Printf("🔄 Starting recovery agent for merchant %s", mID)
			runPythonAgent(agentsDirPath(), "recovery_agent_bedrock.py", mID)
		}(merchantID)
		c.JSON(http.StatusAccepted, gin.H{"status": "accepted", "message": "Recovery agent started"})
	}
}

// POST /v1/merchant/:id/agent/restock
// Manually triggers the Python Restock Agent (Bedrock version)
func handleRunRestockAgent(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		merchantID := c.Param("id")
		go func(mID string) {
			log.Printf("🔄 Starting restock agent for merchant %s", mID)
			runPythonAgent(agentsDirPath(), "restock_agent_bedrock.py", mID)
		}(merchantID)
		c.JSON(http.StatusAccepted, gin.H{"status": "accepted", "message": "Restock agent started"})
	}
}

// GET /v1/merchant/:id/patterns
// Basket association rules computed by the Python FP-Growth job
func handlePatterns(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		merchantID := c.Param("id")

		rows, err := db.Query(`
			SELECT antecedent, consequent, confidence, support
			FROM basket_patterns
			WHERE merchant_id = $1
			ORDER BY confidence DESC
			LIMIT 20
		`, merchantID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		defer rows.Close()

		var patterns []PatternRow
		for rows.Next() {
			var p PatternRow
			if err := rows.Scan(&p.Antecedent, &p.Consequent, &p.Confidence, &p.Support); err != nil {
				continue
			}
			patterns = append(patterns, p)
		}

		if patterns == nil {
			patterns = []PatternRow{}
		}
		c.JSON(http.StatusOK, gin.H{"patterns": patterns})
	}
}

// GET /v1/merchant/:id/segments
// Customer segment breakdown (counts + avg basket per segment)
func handleSegments(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		merchantID := c.Param("id")

		rows, err := db.Query(`
			SELECT
				segment,
				COUNT(*)          AS customer_count,
				AVG(avg_basket)   AS avg_basket
			FROM customer_segments
			WHERE merchant_id = $1
			GROUP BY segment
			ORDER BY customer_count DESC
		`, merchantID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		defer rows.Close()

		var segments []SegmentRow
		for rows.Next() {
			var s SegmentRow
			if err := rows.Scan(&s.Segment, &s.CustomerCount, &s.AvgBasket); err != nil {
				continue
			}
			segments = append(segments, s)
		}
		if segments == nil {
			segments = []SegmentRow{}
		}
		c.JSON(http.StatusOK, gin.H{"segments": segments})
	}
}

// GET /v1/merchant/:id/customers?segment=at_risk
// Individual customer list, optionally filtered by segment
func handleCustomers(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		merchantID := c.Param("id")
		segment    := c.Query("segment") // optional filter

		var (
			rows *sql.Rows
			err  error
		)

		if segment != "" {
			rows, err = db.Query(`
				SELECT
					customer_hash,
					segment,
					COALESCE(avg_basket, 0),
					COALESCE(visit_count, 0),
					COALESCE(EXTRACT(DAY FROM NOW() - last_seen), 0),
					COALESCE(last_seen::text, '')
				FROM customer_segments
				WHERE merchant_id = $1
				  AND segment     = $2
				ORDER BY avg_basket DESC
				LIMIT 50
			`, merchantID, segment)
		} else {
			rows, err = db.Query(`
				SELECT
					customer_hash,
					segment,
					COALESCE(avg_basket, 0),
					COALESCE(visit_count, 0),
					COALESCE(EXTRACT(DAY FROM NOW() - last_seen), 0),
					COALESCE(last_seen::text, '')
				FROM customer_segments
				WHERE merchant_id = $1
				ORDER BY segment, avg_basket DESC
				LIMIT 100
			`, merchantID)
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		defer rows.Close()

		var customers []CustomerRow
		for rows.Next() {
			var cu CustomerRow
			if err := rows.Scan(
				&cu.CustomerHash, &cu.Segment, &cu.AvgBasket,
				&cu.VisitCount, &cu.DaysAbsent, &cu.LastSeen,
			); err != nil {
				continue
			}
			customers = append(customers, cu)
		}
		if customers == nil {
			customers = []CustomerRow{}
		}
		c.JSON(http.StatusOK, gin.H{"customers": customers})
	}
}

// GET /v1/merchant/:id/campaigns?status=draft
// Campaigns waiting for merchant approval (or filter by status)
func handleCampaigns(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		merchantID := c.Param("id")
		status     := c.DefaultQuery("status", "draft")

		rows, err := db.Query(`
			SELECT
				id,
				agent_type,
				status,
				COALESCE(target_segment, ''),
				COALESCE(message_body, ''),
				created_at::text,
				CASE WHEN scheduled_at IS NOT NULL THEN scheduled_at::text ELSE NULL END
			FROM campaigns
			WHERE merchant_id = $1
			  AND status      = $2
			ORDER BY created_at DESC
			LIMIT 20
		`, merchantID, status)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		defer rows.Close()

		var campaigns []CampaignRow
		for rows.Next() {
			var cam CampaignRow
			if err := rows.Scan(
				&cam.ID, &cam.AgentType, &cam.Status,
				&cam.TargetSegment, &cam.MessageBody,
				&cam.CreatedAt, &cam.ScheduledAt,
			); err != nil {
				continue
			}
			campaigns = append(campaigns, cam)
		}
		if campaigns == nil {
			campaigns = []CampaignRow{}
		}
		c.JSON(http.StatusOK, gin.H{"campaigns": campaigns})
	}
}

// POST /v1/campaign/:id/approve
// Merchant one-tap approval — marks campaign as approved so dispatcher picks it up
func handleApproveCampaign(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		campaignID := c.Param("id")

		var req ApproveRequest
		_ = c.ShouldBindJSON(&req) // body is optional

		scheduledAt := time.Now()
		if req.ScheduledAt != nil {
			scheduledAt = *req.ScheduledAt
		}

		result, err := db.Exec(`
			UPDATE campaigns
			SET status       = 'approved',
			    scheduled_at = $1
			WHERE id     = $2
			  AND status = 'draft'
		`, scheduledAt, campaignID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		rows, _ := result.RowsAffected()
		if rows == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "campaign not found or already approved"})
			return
		}

		log.Printf("✅ Campaign approved: id=%s scheduled=%s", campaignID, scheduledAt.Format(time.RFC3339))

		// Dispatched to WhatsApp Agent for POC
		// go func(id string) {
		// 	var msgBody string
		// 	err := db.QueryRow("SELECT message_body FROM campaigns WHERE id = $1", id).Scan(&msgBody)
		// 	if err != nil {
		// 		log.Printf("⚠️ Could not fetch campaign body for WhatsApp: %v", err)
		// 		return
		// 	}

		// 	payload := map[string]string{
		// 		"to":      "918618994561", // User requested PoC number
		// 		"message": msgBody,
		// 	}
		// 	jsonPayload, _ := json.Marshal(payload)
		// 	resp, err := http.Post("http://localhost:5002/send", "application/json", bytes.NewBuffer(jsonPayload))
		// 	if err != nil {
		// 		log.Printf("⚠️ WhatsApp Agent unreachable: %v", err)
		// 		return
		// 	}
		// 	defer resp.Body.Close()
		// 	log.Printf("📱 WhatsApp Agent response: %d", resp.StatusCode)
		// }(campaignID)

		c.JSON(http.StatusOK, gin.H{
			"status":       "approved",
			"campaign_id":  campaignID,
			"scheduled_at": scheduledAt.Format(time.RFC3339),
		})
	}
}

// POST /v1/campaign/:id/reject
// Merchant can reject a campaign draft — marks it as rejected so it doesn't reappear
func handleRejectCampaign(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		campaignID := c.Param("id")

		result, err := db.Exec(`
			UPDATE campaigns
			SET status = 'rejected'
			WHERE id     = $1
			  AND status = 'draft'
		`, campaignID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		rows, _ := result.RowsAffected()
		if rows == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "campaign not found or not in draft state"})
			return
		}

		log.Printf("🚫 Campaign rejected: id=%s", campaignID)
		c.JSON(http.StatusOK, gin.H{"status": "rejected", "campaign_id": campaignID})
	}
}

// GET /v1/merchant/:id/velocity
// Category velocity data for the Restock Agent trigger chart
func handleVelocity(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		merchantID := c.Param("id")

		rows, err := db.Query(`
			SELECT
				category,
				COUNT(*) FILTER (WHERE transacted_at >= NOW() - INTERVAL '7 days')  AS last_7,
				COUNT(*) FILTER (WHERE transacted_at >= NOW() - INTERVAL '14 days'
				                   AND transacted_at <  NOW() - INTERVAL '7 days')  AS prev_7
			FROM transactions
			WHERE merchant_id = $1
			GROUP BY category
			ORDER BY last_7 DESC
		`, merchantID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		defer rows.Close()

		var velocity []VelocityRow
		for rows.Next() {
			var v VelocityRow
			if err := rows.Scan(&v.Category, &v.Last7Days, &v.Prev7Days); err != nil {
				continue
			}
			if v.Prev7Days > 0 {
				v.PctChange = float64(v.Last7Days-v.Prev7Days) / float64(v.Prev7Days) * 100
			} else if v.Last7Days > 0 {
				v.PctChange = 100
			}
			velocity = append(velocity, v)
		}
		if velocity == nil {
			velocity = []VelocityRow{}
		}
		c.JSON(http.StatusOK, gin.H{"velocity": velocity})
	}
}

// POST /v1/offer/realtime
func handleRealtimeOffer(db *sql.DB, rdb *redis.Client, cfg Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()

		var req OfferRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		if cached, ok := getFromCache(rdb, req.MerchantID, req.CustomerHash); ok {
			cached.ElapsedMS = time.Since(start).Milliseconds()
			log.Printf("⚡ Cache hit: merchant=%s customer=%s offer=%v", req.MerchantID, req.CustomerHash, cached.HasOffer)
			c.JSON(http.StatusOK, cached)
			return
		}

		agentResp, err := callOfferAgent(cfg, req.CustomerHash)
		if err != nil {
			log.Printf("⚠️  Offer agent failed (merchant=%s customer=%s): %v", req.MerchantID, req.CustomerHash, err)
			c.JSON(http.StatusOK, OfferResponse{HasOffer: false, Source: "fallback", ElapsedMS: time.Since(start).Milliseconds()})
			return
		}

		offer := OfferResponse{
			HasOffer:       agentResp.HasOffer,
			DisplayText:    agentResp.DisplayText,
			Category:       agentResp.OfferCategory,
			DiscountAmount: agentResp.DiscountAmount,
			Source:         "agent",
			ElapsedMS:      time.Since(start).Milliseconds(),
		}

		setInCache(rdb, req.MerchantID, req.CustomerHash, offer, cfg.OfferCacheTTL)
		log.Printf("🎯 Offer served: merchant=%s customer=%s has_offer=%v elapsed=%dms", req.MerchantID, req.CustomerHash, offer.HasOffer, offer.ElapsedMS)
		c.JSON(http.StatusOK, offer)
	}
}

// POST /v1/offer/invalidate
func handleInvalidateOffer(rdb *redis.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req OfferRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if rdb != nil {
			ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
			defer cancel()
			_ = rdb.Del(ctx, cacheKey(req.MerchantID, req.CustomerHash)).Err()
		}
		c.JSON(http.StatusOK, gin.H{"status": "invalidated"})
	}
}

// POST /v1/transaction/tag
func handleTagTransaction(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req TagRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		_, err := db.Exec(`
			INSERT INTO transactions (merchant_id, amount, category, customer_hash, transacted_at)
			VALUES ($1, $2, $3, $4, NOW())
		`, req.MerchantID, req.Amount, req.Category, req.CustomerHash)

		if err != nil {
			log.Printf("❌ Failed inserting transaction tag: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		// Trigger background Restock and Recovery Agents
		go runPythonAgent(agentsDirPath(), "restock_agent_bedrock.py", req.MerchantID)
		if req.CustomerHash != "" {
			go runPythonAgent(agentsDirPath(), "recovery_agent_bedrock.py", req.MerchantID)
		}

		c.JSON(http.StatusOK, gin.H{"status": "tagged and agents triggered"})
	}
}

// ── Main ──────────────────────────────────────────────────────────────────────

func main() {
	cfg := loadConfig()

	db, err := connectDB(cfg)
	if err != nil {
		log.Fatalf("connectDB: %v", err)
	}
	defer db.Close()

	rdb := connectRedis(cfg)
	if rdb != nil {
		defer rdb.Close()
	}

	r := gin.Default()

	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"http://localhost:3000", "https://*.vercel.app", "http://localhost:*"},
		AllowMethods:     []string{"GET", "POST", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: false,
		MaxAge:           12 * time.Hour,
	}))

	r.GET("/health", func(c *gin.Context) {
		dbOK := db.Ping() == nil
		redisOK := false
		if rdb != nil {
			ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
			defer cancel()
			redisOK = rdb.Ping(ctx).Err() == nil
		}

		status := "ok"
		code := http.StatusOK
		if !dbOK {
			status = "degraded"
			code = http.StatusServiceUnavailable
		}

		c.JSON(code, gin.H{"status": status, "service": "merchant-api", "db": dbOK, "redis": redisOK})
	})

	v1 := r.Group("/v1")
	{
		offer := v1.Group("/offer")
		{
			offer.POST("/realtime",   handleRealtimeOffer(db, rdb, cfg))
			offer.POST("/invalidate", handleInvalidateOffer(rdb))
		}

		transaction := v1.Group("/transaction")
		{
			transaction.POST("/tag", handleTagTransaction(db))
		}

		merchant := v1.Group("/merchant/:id")
		{
			merchant.GET("/summary",   handleSummary(db))
			merchant.GET("/patterns",  handlePatterns(db))
			merchant.GET("/segments",  handleSegments(db))
			merchant.GET("/customers", handleCustomers(db))
			merchant.GET("/campaigns", handleCampaigns(db))
			merchant.GET("/velocity",  handleVelocity(db))
			merchant.POST("/agent/recovery", handleRunRecoveryAgent(db))
			merchant.POST("/agent/restock",  handleRunRestockAgent(db))
		}

		campaign := v1.Group("/campaign")
		{
			campaign.POST("/:id/approve", handleApproveCampaign(db))
			campaign.POST("/:id/reject",  handleRejectCampaign(db))
		}
	}

	log.Printf("🚀 merchant-api running on :%s", cfg.Port)
	log.Printf("   Endpoints:")
	log.Printf("   GET  /v1/merchant/:id/summary")
	log.Printf("   GET  /v1/merchant/:id/patterns")
	log.Printf("   GET  /v1/merchant/:id/segments")
	log.Printf("   GET  /v1/merchant/:id/customers?segment=at_risk")
	log.Printf("   GET  /v1/merchant/:id/campaigns?status=draft")
	log.Printf("   GET  /v1/merchant/:id/velocity")
	log.Printf("   POST /v1/campaign/:id/approve")
	log.Printf("   POST /v1/campaign/:id/reject")
	log.Printf("   POST /v1/merchant/:id/agent/recovery")
	log.Printf("   POST /v1/merchant/:id/agent/restock")

	if err := r.Run(":" + cfg.Port); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
