package main

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"flag"
	"fmt"
	"html/template"
	"io"
	"log"
	"math/rand"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

type result struct {
	Timestamp time.Time
	Target    string
	Status    string
	LatencyMs int64
}

type speedTestResult struct {
	Timestamp    time.Time
	DownloadMbps float64
	UploadMbps   float64
	LatencyMs    int64
}

type summaryResult struct {
	Target      string  `json:"target"`
	UptimePct   float64 `json:"uptime_pct"`
	AvgLatency  float64 `json:"avg_latency_ms"`
	TotalChecks int     `json:"total_checks"`
}

var (
	targets           []string
	checkInterval     time.Duration
	retentionPeriod   time.Duration
	dbPath            string
	recentMinutes     int
	pruneInterval     time.Duration
	latencyThreshold  int64
	speedTestInterval time.Duration
	speedTestBytes    int64
	db                *sql.DB
)

type server struct {
	db       *sql.DB
	template *template.Template
}

func newServer(db *sql.DB) (*server, error) {
	tmpl, err := template.ParseFiles("ui/index.html")
	if err != nil {
		return nil, fmt.Errorf("failed to parse template: %v", err)
	}

	return &server{
		db:       db,
		template: tmpl,
	}, nil
}

func (s *server) indexHandler(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}

	data := struct {
		Targets []string
	}{
		Targets: targets,
	}

	w.Header().Set("Content-Type", "text/html")
	if err := s.template.Execute(w, data); err != nil {
		log.Printf("Failed to execute template: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
	}
}

func (s *server) tableSizeHandler(w http.ResponseWriter, r *http.Request) {
	var size int64
	err := s.db.QueryRow("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()").Scan(&size)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]int64{
		"size_bytes": size,
	})
}

func (s *server) statusHandler(w http.ResponseWriter, r *http.Request) {
	cutoff := time.Now().Add(-time.Duration(recentMinutes) * time.Minute)

	rows, err := s.db.Query(`
		SELECT timestamp, target, status, latency_ms 
		FROM checks 
		WHERE timestamp > ? 
		ORDER BY timestamp DESC
		LIMIT 500`, cutoff) // TODO: add pagination
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var results []result
	for rows.Next() {
		var r result
		if err := rows.Scan(&r.Timestamp, &r.Target, &r.Status, &r.LatencyMs); err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			return
		}
		results = append(results, r)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(results)
}

func (s *server) summaryHandler(w http.ResponseWriter, r *http.Request) {
	cutoff := time.Now().Add(-time.Duration(recentMinutes) * time.Minute)

	var summaries []summaryResult
	for _, target := range targets {
		var summary summaryResult
		summary.Target = target

		err := s.db.QueryRow(`
			SELECT 
				COUNT(*) as total_checks,
				ROUND(100.0 * SUM(CASE WHEN status = 'up' THEN 1 ELSE 0 END) / COUNT(*), 2) as uptime_pct,
				ROUND(AVG(latency_ms), 2) as avg_latency
			FROM checks 
			WHERE target = ? AND timestamp > ?`, target, cutoff).Scan(
			&summary.TotalChecks,
			&summary.UptimePct,
			&summary.AvgLatency,
		)
		if err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			return
		}

		summaries = append(summaries, summary)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(summaries)
}

func (s *server) uptimeHandler(w http.ResponseWriter, r *http.Request) {
	cutoff := time.Now().Add(-time.Duration(recentMinutes) * time.Minute)

	var summaries []struct {
		Target      string  `json:"target"`
		UptimePct   float64 `json:"uptime_pct"`
		TotalChecks int     `json:"total_checks"`
		WindowHours float64 `json:"window_hours"`
	}

	for _, target := range targets {
		var summary struct {
			Target      string  `json:"target"`
			UptimePct   float64 `json:"uptime_pct"`
			TotalChecks int     `json:"total_checks"`
			WindowHours float64 `json:"window_hours"`
		}
		summary.Target = target
		summary.WindowHours = float64(recentMinutes) / 60.0

		err := s.db.QueryRow(`
			SELECT 
				COUNT(*) as total_checks,
				ROUND(100.0 * SUM(CASE WHEN latency_ms <= ? THEN 1 ELSE 0 END) / COUNT(*), 2) as uptime_pct
			FROM checks 
			WHERE target = ? AND timestamp > ?`, latencyThreshold, target, cutoff).Scan(
			&summary.TotalChecks,
			&summary.UptimePct,
		)
		if err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			return
		}

		summaries = append(summaries, summary)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(summaries)
}

func (s *server) speedTestHandler(w http.ResponseWriter, r *http.Request) {
	cutoff := time.Now().Add(-time.Duration(recentMinutes) * time.Minute)

	rows, err := s.db.Query(`
		SELECT timestamp, download_mbps, upload_mbps, latency_ms 
		FROM speedtests 
		WHERE timestamp > ? 
		ORDER BY timestamp DESC
		LIMIT 100`, cutoff)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var results []speedTestResult
	for rows.Next() {
		var r speedTestResult
		if err := rows.Scan(&r.Timestamp, &r.DownloadMbps, &r.UploadMbps, &r.LatencyMs); err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			return
		}
		results = append(results, r)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(results)
}

func main() {
	targetsStr := flag.String("targets", "https://1.1.1.1,https://google.com,https://github.com", "Comma-separated list of URLs to monitor")
	checkInterval = *flag.Duration("interval", 30*time.Second, "Interval between checks")
	retentionPeriod = *flag.Duration("retention", 90*24*time.Hour, "How long to retain data")
	dbPath = *flag.String("db", "uptime.db", "Path to SQLite database file")
	recentMinutes = *flag.Int("recent", 60, "Number of minutes to consider for recent status")
	pruneInterval = *flag.Duration("prune-interval", 24*time.Hour, "How often to prune old entries")
	latencyThreshold = *flag.Int64("latency-threshold", 250, "Maximum latency in milliseconds to consider a check successful")
	speedTestInterval = *flag.Duration("speedtest-interval", 1*time.Hour, "Interval between speed tests")
	speedTestBytes = *flag.Int64("speedtest-bytes", 25_000_000, "Size of file to download for speed test in bytes")

	flag.Parse()

	// Create a context that will be canceled on program exit
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Handle OS signals for graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigChan
		log.Println("Received shutdown signal, cleaning up...")
		cancel()
	}()

	targets = strings.Split(*targetsStr, ",")
	for i, t := range targets {
		targets[i] = strings.TrimSpace(t)
	}

	var err error
	db, err = sql.Open("sqlite3", dbPath)
	if err != nil {
		log.Fatalf("Failed to open SQLite DB: %v", err)
	}
	defer db.Close()

	if err := initDB(); err != nil {
		log.Fatalf("Failed to init DB: %v", err)
	}

	s, err := newServer(db)
	if err != nil {
		log.Fatalf("Failed to create server: %v", err)
	}

	http.HandleFunc("/static/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		fs := http.FileServer(http.Dir("ui/static"))
		http.StripPrefix("/static/", fs).ServeHTTP(w, r)
	})

	http.HandleFunc("/", s.indexHandler)
	http.HandleFunc("/status", s.statusHandler)
	http.HandleFunc("/summary", s.summaryHandler)
	http.HandleFunc("/size", s.tableSizeHandler)
	http.HandleFunc("/uptime", s.uptimeHandler)
	http.HandleFunc("/speedtest", s.speedTestHandler)

	go func() {
		log.Printf("Starting HTTP server on http://localhost:8080")
		if err := http.ListenAndServe(":8080", nil); err != nil && err != http.ErrServerClosed {
			log.Fatalf("HTTP server error: %v", err)
		}
	}()

	ticker := time.NewTicker(checkInterval)
	defer ticker.Stop()

	go pruneOldEntries()

	go func() {
		ticker := time.NewTicker(speedTestInterval)
		defer ticker.Stop()

		// Run initial speed test
		if err := runSpeedTest(); err != nil {
			log.Printf("Initial speed test error: %v", err)
		}

		for {
			select {
			case <-ctx.Done():
				log.Println("Speed test routine shutting down...")
				return
			case <-ticker.C:
				if err := runSpeedTest(); err != nil {
					log.Printf("Speed test error: %v", err)
				}
			}
		}
	}()

	// Main loop with context
	for {
		select {
		case <-ctx.Done():
			log.Println("Main routine shutting down...")
			return
		case <-ticker.C:
			checkAllTargets()
		}
	}
}

func initDB() error {
	createTableSQL := `
    CREATE TABLE IF NOT EXISTS checks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME NOT NULL,
        target TEXT NOT NULL,
        status TEXT NOT NULL,
        latency_ms INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_checks_time ON checks(timestamp);
    
    CREATE TABLE IF NOT EXISTS speedtests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME NOT NULL,
        download_mbps REAL NOT NULL,
        upload_mbps REAL NOT NULL,
        latency_ms INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_speedtests_time ON speedtests(timestamp);
    `
	_, err := db.Exec(createTableSQL)
	return err
}

func checkAllTargets() {
	for _, target := range targets {
		start := time.Now()
		resp, err := http.Head(target)
		latency := time.Since(start).Milliseconds()

		status := "down"
		if err == nil && resp.StatusCode == 200 {
			status = "up"
		}

		result := result{
			Timestamp: time.Now(),
			Target:    target,
			Status:    status,
			LatencyMs: latency,
		}

		log.Printf("[%s] %s - %s (%dms)", result.Timestamp.Format(time.RFC3339), result.Target, result.Status, result.LatencyMs)
		saveResult(result)
	}
}

func saveResult(r result) {
	stmt := `INSERT INTO checks (timestamp, target, status, latency_ms) VALUES (?, ?, ?, ?)`
	_, err := db.Exec(stmt, r.Timestamp, r.Target, r.Status, r.LatencyMs)
	if err != nil {
		log.Printf("Failed to insert row: %v", err)
	}
}

func pruneOldEntries() {
	for {
		cutoff := time.Now().Add(-retentionPeriod)
		_, err := db.Exec("DELETE FROM checks WHERE timestamp < ?", cutoff)
		if err != nil {
			log.Printf("Failed to prune old entries: %v", err)
		} else {
			log.Printf("Pruned old entries older than %s", cutoff.Format(time.RFC3339))
		}
		time.Sleep(pruneInterval)
	}
}

// TODO(nigel): Expose an endpoint elsewhere for speed test. These endpoints are not documented.
func runSpeedTest() error {
	url := fmt.Sprintf("https://speed.cloudflare.com/__down?bytes=%d", speedTestBytes)

	start := time.Now()
	resp, err := http.Get(url)
	if err != nil {
		return fmt.Errorf("failed to run speed test: %v", err)
	}
	defer resp.Body.Close()

	_, err = io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read response body: %v", err)
	}
	downloadDuration := time.Since(start)
	downloadMbps := (float64(speedTestBytes) * 8.0 / 1_000_000.0) / downloadDuration.Seconds() // Convert bytes to Mbps

	url = fmt.Sprintf("https://speed.cloudflare.com/__up?uploadId=%d", rand.Intn(1000000))
	payloadSize := 10 * 1024 * 1024
	data := bytes.Repeat([]byte("a"), payloadSize)

	start = time.Now()
	resp, err = http.Post(url, "application/octet-stream", bytes.NewReader(data))
	uploadDuration := time.Since(start)
	if err != nil {
		return fmt.Errorf("failed to run upload speed test: %v", err)
	}
	defer resp.Body.Close()
	uploadMbps := (float64(payloadSize*8) / uploadDuration.Seconds()) / 1e6
	fmt.Printf("Upload completed in %s (%.2f Mbps)\n", uploadDuration, uploadMbps)

	latencyStart := time.Now()
	_, err = http.Head("https://1.1.1.1")
	latencyMs := time.Since(latencyStart).Milliseconds()

	result := speedTestResult{
		Timestamp:    time.Now(),
		DownloadMbps: downloadMbps,
		UploadMbps:   uploadMbps,
		LatencyMs:    latencyMs,
	}

	// Save the result
	stmt := `INSERT INTO speedtests (timestamp, download_mbps, upload_mbps, latency_ms) VALUES (?, ?, ?, ?)`
	_, err = db.Exec(stmt, result.Timestamp, result.DownloadMbps, result.UploadMbps, result.LatencyMs)
	if err != nil {
		return fmt.Errorf("failed to save speed test result: %v", err)
	}

	log.Printf("Speed test completed: %.2f Mbps down, %.2f Mbps up, %d ms latency",
		result.DownloadMbps, result.UploadMbps, result.LatencyMs)
	return nil
}
