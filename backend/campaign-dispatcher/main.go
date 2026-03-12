package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	_ "github.com/lib/pq"
	twilio "github.com/twilio/twilio-go"
	twilioApi "github.com/twilio/twilio-go/rest/api/v2010"
)

// ── Config ────────────────────────────────────────────────────────────────────

type Config struct {
	DBHost          string
	DBPort          string
	DBUser          string
	DBPassword      string
	DBName          string
	TwilioSID       string
	TwilioToken     string
	TwilioFrom      string // WhatsApp sender: "whatsapp:+14155238886"
	DemoPhoneNumber string // For hackathon demo — all messages go to this number
	PollInterval    time.Duration
}

func loadConfig() Config {
	pollSecs := 10
	return Config{
		DBHost:          getEnv("DB_HOST", "localhost"),
		DBPort:          getEnv("DB_PORT", "5432"),
		DBUser:          getEnv("DB_USER", "merchantmind"),
		DBPassword:      getEnv("DB_PASSWORD", "localdev123"),
		DBName:          getEnv("DB_NAME", "merchantmind"),
		TwilioSID:       getEnv("TWILIO_ACCOUNT_SID", ""),
		TwilioToken:     getEnv("TWILIO_AUTH_TOKEN", ""),
		TwilioFrom:      getEnv("TWILIO_WHATSAPP_FROM", "whatsapp:+14155238886"),
		DemoPhoneNumber: getEnv("DEMO_PHONE_NUMBER", ""), // e.g. +919876543210
		PollInterval:    time.Duration(pollSecs) * time.Second,
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// ── DB ────────────────────────────────────────────────────────────────────────

type Campaign struct {
	ID            string
	MerchantID    string
	AgentType     string
	TargetSegment string
	MessageBody   string
	ScheduledAt   time.Time
}

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
		return nil, fmt.Errorf("ping failed: %w", err)
	}
	log.Println("✅ Connected to PostgreSQL")
	return db, nil
}

// fetchApprovedCampaigns returns campaigns that are approved and due to be sent
func fetchApprovedCampaigns(db *sql.DB) ([]Campaign, error) {
	rows, err := db.Query(`
		SELECT id, merchant_id, agent_type,
		       COALESCE(target_segment, ''),
		       COALESCE(message_body, ''),
		       COALESCE(scheduled_at, NOW())
		FROM campaigns
		WHERE status = 'approved'
		  AND (scheduled_at IS NULL OR scheduled_at <= NOW())
		ORDER BY scheduled_at ASC
		LIMIT 10
	`)
	if err != nil {
		return nil, fmt.Errorf("fetchApprovedCampaigns: %w", err)
	}
	defer rows.Close()

	var campaigns []Campaign
	for rows.Next() {
		var c Campaign
		if err := rows.Scan(
			&c.ID, &c.MerchantID, &c.AgentType,
			&c.TargetSegment, &c.MessageBody, &c.ScheduledAt,
		); err != nil {
			log.Printf("⚠️  scan error: %v", err)
			continue
		}
		campaigns = append(campaigns, c)
	}
	return campaigns, nil
}

// markSent updates the campaign status to 'sent' and records the send time
func markSent(db *sql.DB, campaignID string) error {
	_, err := db.Exec(`
		UPDATE campaigns
		SET status  = 'sent',
		    sent_at = NOW()
		WHERE id = $1
	`, campaignID)
	return err
}

// markFailed updates the campaign status to 'failed'
func markFailed(db *sql.DB, campaignID string) error {
	_, err := db.Exec(`
		UPDATE campaigns
		SET status = 'failed'
		WHERE id = $1
	`, campaignID)
	return err
}

// ── Twilio sender ─────────────────────────────────────────────────────────────

type Sender struct {
	client          *twilio.RestClient
	from            string
	demoPhoneNumber string // if set, all messages go here (hackathon mode)
}

func newSender(cfg Config) (*Sender, error) {
	if cfg.TwilioSID == "" || cfg.TwilioToken == "" {
		return nil, fmt.Errorf("TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set")
	}

	client := twilio.NewRestClientWithParams(twilio.ClientParams{
		Username: cfg.TwilioSID,
		Password: cfg.TwilioToken,
	})

	return &Sender{
		client:          client,
		from:            cfg.TwilioFrom,
		demoPhoneNumber: cfg.DemoPhoneNumber,
	}, nil
}

// send dispatches a single WhatsApp message.
// In demo mode (DEMO_PHONE_NUMBER set), all messages go to that number
// regardless of the intended recipient.
func (s *Sender) send(to, body string) error {
	recipient := to
	if s.demoPhoneNumber != "" {
		// Hackathon demo mode — always send to your phone
		recipient = "whatsapp:" + s.demoPhoneNumber
	}

	params := &twilioApi.CreateMessageParams{}
	params.SetTo(recipient)
	params.SetFrom(s.from)
	params.SetBody(body)

	resp, err := s.client.Api.CreateMessage(params)
	if err != nil {
		return fmt.Errorf("twilio send failed: %w", err)
	}

	log.Printf("   📱 Sent to %s  sid=%s  status=%s",
		recipient,
		deref(resp.Sid),
		deref(resp.Status),
	)
	return nil
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// ── Dispatch logic ────────────────────────────────────────────────────────────

// buildMessage formats the final message body based on agent type.
// You can expand these templates as the product grows.
func buildMessage(c Campaign) string {
	switch c.AgentType {
	case "restock":
		// Restock alerts are already well-formatted by the agent
		return c.MessageBody

	case "recovery":
		// Recovery messages are personalised by the agent
		return c.MessageBody

	case "offer":
		// Dynamic offer messages
		return c.MessageBody

	default:
		return c.MessageBody
	}
}

func dispatch(db *sql.DB, sender *Sender, c Campaign) {
	log.Printf("📤 Dispatching campaign id=%s type=%s segment=%s",
		c.ID, c.AgentType, c.TargetSegment)

	message := buildMessage(c)

	if message == "" {
		log.Printf("⚠️  Campaign %s has empty message body — skipping", c.ID)
		_ = markFailed(db, c.ID)
		return
	}

	// In production: look up customer phone numbers for the target segment
	// and send one message per customer. For the hackathon demo, we send
	// one message to DEMO_PHONE_NUMBER which represents the entire campaign.
	//
	// Production pattern would be:
	//   customers := fetchCustomersForSegment(db, c.MerchantID, c.TargetSegment)
	//   for _, customer := range customers {
	//       phone := lookupPhone(customer.CustomerHash)
	//       sender.send("whatsapp:"+phone, message)
	//   }

	err := sender.send("whatsapp:demo", message)
	if err != nil {
		log.Printf("❌ Send failed for campaign %s: %v", c.ID, err)
		_ = markFailed(db, c.ID)
		return
	}

	if err := markSent(db, c.ID); err != nil {
		log.Printf("⚠️  markSent failed for campaign %s: %v", c.ID, err)
		return
	}

	log.Printf("✅ Campaign sent: id=%s  type=%s", c.ID, c.AgentType)
}

// ── Poll loop ─────────────────────────────────────────────────────────────────

func run(db *sql.DB, sender *Sender, cfg Config, quit <-chan struct{}) {
	log.Printf("🚀 campaign-dispatcher started — polling every %s", cfg.PollInterval)

	ticker := time.NewTicker(cfg.PollInterval)
	defer ticker.Stop()

	// Run once immediately on start, then on each tick
	poll(db, sender)

	for {
		select {
		case <-ticker.C:
			poll(db, sender)
		case <-quit:
			log.Println("🛑 Shutdown signal — campaign-dispatcher exiting")
			return
		}
	}
}

func poll(db *sql.DB, sender *Sender) {
	campaigns, err := fetchApprovedCampaigns(db)
	if err != nil {
		log.Printf("❌ fetchApprovedCampaigns error: %v", err)
		return
	}

	if len(campaigns) == 0 {
		return // nothing to do, stay quiet
	}

	log.Printf("📋 Found %d campaign(s) to dispatch", len(campaigns))
	for _, c := range campaigns {
		dispatch(db, sender, c)
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

	sender, err := newSender(cfg)
	if err != nil {
		log.Fatalf("newSender: %v", err)
	}

	// Graceful shutdown
	quit := make(chan struct{})
	sigs := make(chan os.Signal, 1)
	signal.Notify(sigs, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-sigs
		close(quit)
	}()

	run(db, sender, cfg, quit)
	log.Println("👋 campaign-dispatcher exited cleanly")
}
