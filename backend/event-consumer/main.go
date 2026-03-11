package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	_ "github.com/lib/pq"
	kafka "github.com/segmentio/kafka-go"
)

// ── Config ────────────────────────────────────────────────────────────────────

type Config struct {
	KafkaBroker string
	KafkaTopic  string
	KafkaGroup  string
	DBHost      string
	DBPort      string
	DBUser      string
	DBPassword  string
	DBName      string
}

func loadConfig() Config {
	return Config{
		KafkaBroker: getEnv("KAFKA_BROKER", "localhost:9092"),
		KafkaTopic:  getEnv("KAFKA_TOPIC", "pos.transaction.raw"),
		KafkaGroup:  getEnv("KAFKA_GROUP", "event-consumer-group"),
		DBHost:      getEnv("DB_HOST", "localhost"),
		DBPort:      getEnv("DB_PORT", "5432"),
		DBUser:      getEnv("DB_USER", "merchantmind"),
		DBPassword:  getEnv("DB_PASSWORD", "localdev123"),
		DBName:      getEnv("DB_NAME", "merchantmind"),
	}
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}

// ── Event model (must match terminal-gateway) ─────────────────────────────────

type TransactionEvent struct {
	ID           string    `json:"id"`
	MerchantID   string    `json:"merchant_id"`
	Amount       float64   `json:"amount"`
	Category     string    `json:"category"`
	CustomerHash string    `json:"customer_hash"` // may be empty
	Timestamp    time.Time `json:"timestamp"`
}

// ── Database ──────────────────────────────────────────────────────────────────

func connectDB(cfg Config) (*sql.DB, error) {
	dsn := fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		cfg.DBHost, cfg.DBPort, cfg.DBUser, cfg.DBPassword, cfg.DBName,
	)

	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, fmt.Errorf("sql.Open: %w", err)
	}

	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		return nil, fmt.Errorf("db ping failed: %w", err)
	}

	log.Println("✅ Connected to PostgreSQL")
	return db, nil
}

// insertTransaction writes one normalised event to the transactions table.
// ON CONFLICT DO NOTHING makes it idempotent — safe against Kafka
// at-least-once redelivery after a consumer restart.
func insertTransaction(ctx context.Context, db *sql.DB, evt TransactionEvent) (int64, error) {
	const q = `
		INSERT INTO transactions
			(id, merchant_id, amount, category, customer_hash, transacted_at)
		VALUES
			($1, $2, $3, $4, NULLIF($5, ''), $6)
		ON CONFLICT (id) DO NOTHING`

	result, err := db.ExecContext(ctx, q,
		evt.ID,
		evt.MerchantID,
		evt.Amount,
		evt.Category,
		evt.CustomerHash,
		evt.Timestamp,
	)
	if err != nil {
		return 0, fmt.Errorf("insert transaction: %w", err)
	}

	rows, _ := result.RowsAffected()
	return rows, nil
}

// ── Error classification ──────────────────────────────────────────────────────

// isTransientError returns true for errors that may resolve on retry
// (e.g. DB connection lost), and false for permanent errors (bad data,
// schema violations) that will never succeed no matter how many retries.
func isTransientError(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()

	// Permanent errors — bad data or schema violations.
	// Commit the offset and move on — retrying will never help.
	permanentKeywords := []string{
		"invalid input syntax", // e.g. string where UUID expected
		"violates foreign key", // merchant_id not in merchants table
		"violates not-null",    // required field missing
		"violates unique",      // duplicate on unique constraint
		"column",               // unknown column name
		"22P02",                // invalid_text_representation
		"23503",                // foreign_key_violation
		"23502",                // not_null_violation
		"23505",                // unique_violation
	}
	for _, kw := range permanentKeywords {
		if strings.Contains(msg, kw) {
			return false
		}
	}

	// Transient errors — infrastructure issues that may resolve on their own.
	// Do NOT commit offset so the message is retried after recovery.
	transientKeywords := []string{
		"connection refused",
		"connection reset",
		"broken pipe",
		"timeout",
		"no such host",
		"EOF",
	}
	for _, kw := range transientKeywords {
		if strings.Contains(msg, kw) {
			return true
		}
	}

	// Default: treat unknown errors as transient to avoid silent data loss
	return true
}

// ── Kafka consumer ────────────────────────────────────────────────────────────

func newKafkaReader(cfg Config) *kafka.Reader {
	return kafka.NewReader(kafka.ReaderConfig{
		Brokers:     []string{cfg.KafkaBroker},
		Topic:       cfg.KafkaTopic,
		GroupID:     cfg.KafkaGroup,
		StartOffset: kafka.FirstOffset,
		MaxWait:     500 * time.Millisecond,
		MaxAttempts: 5,
		Logger:      kafka.LoggerFunc(func(msg string, args ...interface{}) { log.Printf("[kafka] "+msg, args...) }),
		ErrorLogger: kafka.LoggerFunc(func(msg string, args ...interface{}) { log.Printf("[kafka ERROR] "+msg, args...) }),
	})
}

// ── Processing logic ──────────────────────────────────────────────────────────

func processMessage(ctx context.Context, db *sql.DB, msg kafka.Message) error {
	// 1. Deserialise
	var evt TransactionEvent
	if err := json.Unmarshal(msg.Value, &evt); err != nil {
		return fmt.Errorf("unmarshal failed: %w", err)
	}

	// 2. Validate required fields
	if evt.ID == "" {
		return fmt.Errorf("invalid event: missing id")
	}
	if evt.MerchantID == "" {
		return fmt.Errorf("invalid event: missing merchant_id")
	}
	if evt.Category == "" {
		return fmt.Errorf("invalid event: missing category")
	}
	if evt.Amount <= 0 {
		return fmt.Errorf("invalid event: amount must be positive, got %.2f", evt.Amount)
	}

	// 3. Persist
	rows, err := insertTransaction(ctx, db, evt)
	if err != nil {
		return err
	}

	if rows == 0 {
		log.Printf("⚠️  Duplicate skipped  id=%-36s  merchant=%s", evt.ID, evt.MerchantID)
	} else {
		log.Printf("✅ Saved  id=%-36s  merchant=%s  category=%-14s  amount=%.2f  customer=%q",
			evt.ID, evt.MerchantID, evt.Category, evt.Amount, evt.CustomerHash)
	}

	return nil
}

// ── Main loop ─────────────────────────────────────────────────────────────────

func run(ctx context.Context, cfg Config) error {
	// Connect to Postgres
	db, err := connectDB(cfg)
	if err != nil {
		return fmt.Errorf("connectDB: %w", err)
	}
	defer db.Close()

	// Connect to Kafka
	reader := newKafkaReader(cfg)
	defer reader.Close()

	log.Printf("🚀 event-consumer started  broker=%s  topic=%s  group=%s",
		cfg.KafkaBroker, cfg.KafkaTopic, cfg.KafkaGroup)

	for {
		// Honour shutdown signal before blocking on Kafka
		select {
		case <-ctx.Done():
			log.Println("🛑 Shutdown signal received — exiting cleanly")
			return nil
		default:
		}

		// Fetch next message — blocks up to MaxWait (500ms) then loops
		msg, err := reader.FetchMessage(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return nil // clean shutdown, not an error
			}
			log.Printf("❌ FetchMessage error: %v — retrying in 2s", err)
			time.Sleep(2 * time.Second)
			continue
		}

		// Process the message
		if err := processMessage(ctx, db, msg); err != nil {
			log.Printf("❌ processMessage error: %v", err)

			if isTransientError(err) {
				// Don't commit — message will be redelivered after restart
				log.Println("   Transient error — not committing offset. Will retry.")
				time.Sleep(1 * time.Second)
				continue
			}

			// Permanent error — skip this message so we don't block the pipeline
			log.Println("   Permanent error — committing offset and skipping message.")
		}

		// Commit offset so this message isn't redelivered
		if err := reader.CommitMessages(ctx, msg); err != nil {
			log.Printf("❌ CommitMessages error: %v", err)
		}
	}
}

// ── Entry point ───────────────────────────────────────────────────────────────

func main() {
	cfg := loadConfig()

	// Graceful shutdown on Ctrl+C or SIGTERM (what Docker/AWS sends on container stop)
	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	if err := run(ctx, cfg); err != nil {
		log.Fatalf("Fatal error: %v", err)
	}

	log.Println("👋 event-consumer exited cleanly")
}
