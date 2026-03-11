package main

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	kafka "github.com/segmentio/kafka-go"
)

type TagRequest struct {
	MerchantID   string  `json:"merchant_id"   binding:"required"`
	Amount       float64 `json:"amount"        binding:"required"`
	Category     string  `json:"category"      binding:"required"`
	CustomerHash string  `json:"customer_hash"` // optional
}

type TransactionEvent struct {
	ID           string    `json:"id"`
	MerchantID   string    `json:"merchant_id"`
	Amount       float64   `json:"amount"`
	Category     string    `json:"category"`
	CustomerHash string    `json:"customer_hash"`
	Timestamp    time.Time `json:"timestamp"`
}

func main() {
	writer := &kafka.Writer{
		Addr:  kafka.TCP("localhost:9092"),
		Topic: "pos.transaction.raw",
	}
	defer writer.Close()

	r := gin.Default()

	r.POST("/v1/transaction/tag", func(c *gin.Context) {
		var req TagRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		event := TransactionEvent{
			ID: uuid.New().String(), MerchantID: req.MerchantID,
			Amount: req.Amount, Category: req.Category,
			CustomerHash: req.CustomerHash, Timestamp: time.Now(),
		}

		payload, _ := json.Marshal(event)
		err := writer.WriteMessages(context.Background(),
			kafka.Message{Key: []byte(req.MerchantID), Value: payload},
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "kafka write failed", "message": err})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "ok", "event_id": event.ID})
	})

	r.Run(":8080")
}
