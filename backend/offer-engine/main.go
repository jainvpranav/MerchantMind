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
	RedisAddr        string
	OfferAgentURL    string // URL of the Python dynamic_offer_agent Flask server
	OfferCacheTTL    time.Duration
	Port             string
	AgentTimeoutSecs int
}

func loadConfig() Config {
	return Config{
		DBHost:           getEnv("DB_HOST", "localhost"),
		DBPort:           getEnv("DB_PORT", "5432"),
		DBUser:           getEnv("DB_USER", "merchantmind"),
		DBPassword:       getEnv("DB_PASSWORD", "localdev123"),
		DBName:           getEnv("DB_NAME", "merchantmind"),
		RedisAddr:        getEnv("REDIS_ADDR", "localhost:6379"),
		OfferAgentURL:    getEnv("OFFER_AGENT_URL", "http://localhost:8081/offer"),
		OfferCacheTTL:    30 * time.Minute, // cache each customer's offer for 30 min
		Port:             getEnv("PORT", "8081"),
		AgentTimeoutSecs: 3, // hard 3-second timeout — we'd rather show no offer than slow down payment
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// ── Models ────────────────────────────────────────────────────────────────────

// OfferRequest is what the terminal-gateway or POS sends us
type OfferRequest struct {
	MerchantID   string `json:"merchant_id"   binding:"required"`
	CustomerHash string `json:"customer_hash" binding:"required"`
}

// OfferResponse is what we return to the terminal to display
type OfferResponse struct {
	HasOffer     bool    `json:"has_offer"`
	DisplayText  string  `json:"display_text,omitempty"`
	Category     string  `json:"offer_category,omitempty"`
	Source       string  `json:"source"` // "cache" or "agent" or "fallback"
	ElapsedMS    int64   `json:"elapsed_ms"`
}

// agentPayload is what we POST to the Python offer agent
type agentPayload struct {
	CustomerHash string `json:"customer_hash"`
}

// agentResponse is what the Python offer agent returns
type agentResponse struct {
	HasOffer     bool   `json:"has_offer"`
	DisplayText  string `json:"display_text"`
	OfferCategory string `json:"offer_category"`
	Reasoning    string `json:"reasoning"`
	ElapsedSecs  float64 `json:"elapsed_seconds"`
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
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(3)
	db.SetConnMaxLifetime(5 * time.Minute)
	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("ping: %w", err)
	}
	log.Println("✅ Connected to PostgreSQL")
	return db, nil
}

// ── Redis cache ───────────────────────────────────────────────────────────────

func connectRedis(cfg Config) *redis.Client {
	rdb := redis.NewClient(&redis.Options{
		Addr:     cfg.RedisAddr,
		Password: "",
		DB:       0,
	})
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	if err := rdb.Ping(ctx).Err(); err != nil {
		// Redis is optional — degrade gracefully if it's down
		log.Printf("⚠️  Redis unavailable (%v) — offer caching disabled", err)
		return nil
	}
	log.Println("✅ Connected to Redis")
	return rdb
}

// cacheKey builds the Redis key for a customer's offer
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

// ── Python agent caller ───────────────────────────────────────────────────────

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

// ── Handler ───────────────────────────────────────────────────────────────────

// POST /v1/offer/realtime
// Called by terminal-gateway when a returning customer initiates payment.
// Must respond in under 2 seconds.
func handleRealtimeOffer(db *sql.DB, rdb *redis.Client, cfg Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()

		var req OfferRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// 1. Try cache first — fastest path (~1ms)
		if cached, ok := getFromCache(rdb, req.MerchantID, req.CustomerHash); ok {
			cached.ElapsedMS = time.Since(start).Milliseconds()
			log.Printf("⚡ Cache hit: merchant=%s customer=%s offer=%v",
				req.MerchantID, req.CustomerHash, cached.HasOffer)
			c.JSON(http.StatusOK, cached)
			return
		}

		// 2. Call the Python offer agent with a strict timeout
		agentResp, err := callOfferAgent(cfg, req.CustomerHash)
		if err != nil {
			// Agent timed out or failed — return no offer rather than blocking payment
			log.Printf("⚠️  Offer agent failed (merchant=%s customer=%s): %v — returning no offer",
				req.MerchantID, req.CustomerHash, err)

			c.JSON(http.StatusOK, OfferResponse{
				HasOffer:  false,
				Source:    "fallback",
				ElapsedMS: time.Since(start).Milliseconds(),
			})
			return
		}

		// 3. Build response
		offer := OfferResponse{
			HasOffer:    agentResp.HasOffer,
			DisplayText: agentResp.DisplayText,
			Category:    agentResp.OfferCategory,
			Source:      "agent",
			ElapsedMS:   time.Since(start).Milliseconds(),
		}

		// 4. Cache the result so subsequent calls for this customer are instant
		setInCache(rdb, req.MerchantID, req.CustomerHash, offer, cfg.OfferCacheTTL)

		log.Printf("🎯 Offer served: merchant=%s customer=%s has_offer=%v elapsed=%dms",
			req.MerchantID, req.CustomerHash, offer.HasOffer, offer.ElapsedMS)

		c.JSON(http.StatusOK, offer)
	}
}

// POST /v1/offer/invalidate
// Call this after a customer makes a purchase to clear their cached offer
// so the next visit gets a fresh recommendation
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

// GET /health
func handleHealth(db *sql.DB, rdb *redis.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		dbOK := db.Ping() == nil
		redisOK := false
		if rdb != nil {
			ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
			defer cancel()
			redisOK = rdb.Ping(ctx).Err() == nil
		}

		status := "ok"
		code   := http.StatusOK
		if !dbOK {
			status = "degraded"
			code   = http.StatusServiceUnavailable
		}

		c.JSON(code, gin.H{
			"status":  status,
			"service": "offer-engine",
			"db":      dbOK,
			"redis":   redisOK,
		})
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
		AllowOrigins:  []string{"*"},
		AllowMethods:  []string{"GET", "POST", "OPTIONS"},
		AllowHeaders:  []string{"Origin", "Content-Type"},
		MaxAge:        12 * time.Hour,
	}))

	r.GET("/health",                  handleHealth(db, rdb))
	r.POST("/v1/offer/realtime",      handleRealtimeOffer(db, rdb, cfg))
	r.POST("/v1/offer/invalidate",    handleInvalidateOffer(rdb))

	log.Printf("🚀 offer-engine running on :%s", cfg.Port)
	log.Printf("   POST /v1/offer/realtime   — real-time offer at POS")
	log.Printf("   POST /v1/offer/invalidate — clear offer cache after purchase")
	log.Printf("   Agent URL: %s", cfg.OfferAgentURL)
	log.Printf("   Agent timeout: %ds", cfg.AgentTimeoutSecs)

	if err := r.Run(":" + cfg.Port); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
