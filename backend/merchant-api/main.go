package main

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	_ "github.com/lib/pq"
)

// ── Config ────────────────────────────────────────────────────────────────────

type Config struct {
	DBHost     string
	DBPort     string
	DBUser     string
	DBPassword string
	DBName     string
	Port       string
}

func loadConfig() Config {
	return Config{
		DBHost:     getEnv("DB_HOST", "localhost"),
		DBPort:     getEnv("DB_PORT", "5432"),
		DBUser:     getEnv("DB_USER", "merchantmind"),
		DBPassword: getEnv("DB_PASSWORD", "localdev123"),
		DBName:     getEnv("DB_NAME", "merchantmind"),
		Port:       getEnv("PORT", "8081"),
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
			  AND status IN ('draft', 'approved')
		`, merchantID)
		_ = row.Scan(&s.ActiveCampaigns)

		c.JSON(http.StatusOK, s)
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

// GET /health
func handleHealth(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if err := db.Ping(); err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"status": "db_down", "error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "ok", "service": "merchant-api"})
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

	r := gin.Default()

	// CORS — allow the React dashboard to call this API
	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"http://localhost:3000", "https://*.vercel.app"},
		AllowMethods:     []string{"GET", "POST", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: false,
		MaxAge:           12 * time.Hour,
	}))

	// Health
	r.GET("/health", handleHealth(db))

	// Merchant data endpoints
	v1 := r.Group("/v1")
	{
		merchant := v1.Group("/merchant/:id")
		{
			merchant.GET("/summary",   handleSummary(db))
			merchant.GET("/patterns",  handlePatterns(db))
			merchant.GET("/segments",  handleSegments(db))
			merchant.GET("/customers", handleCustomers(db))
			merchant.GET("/campaigns", handleCampaigns(db))
			merchant.GET("/velocity",  handleVelocity(db))
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

	if err := r.Run(":" + cfg.Port); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
