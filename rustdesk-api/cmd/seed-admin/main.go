package main

import (
	"context"
	"crypto/rand"
	"flag"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/ekalliptus/eldesk-api/internal/db"
	"golang.org/x/crypto/bcrypt"
)

func main() {
	var (
		username      = flag.String("username", strings.TrimSpace(os.Getenv("ADMIN_USERNAME")), "admin username")
		password      = flag.String("password", os.Getenv("ADMIN_PASSWORD"), "admin password")
		displayName   = flag.String("display-name", strings.TrimSpace(os.Getenv("ADMIN_DISPLAY_NAME")), "display name")
		email         = flag.String("email", strings.TrimSpace(os.Getenv("ADMIN_EMAIL")), "email address")
		isAdmin       = flag.Bool("admin", true, "grant admin privileges")
		runMigrate    = flag.Bool("migrate", false, "apply SQL migration before seeding")
		migrationPath = flag.String("migration-file", "/app/migrations/001_init.sql", "path to init SQL migration")
	)
	flag.Parse()

	dbURL := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if dbURL == "" {
		log.Fatal("DATABASE_URL is required")
	}
	if strings.TrimSpace(*username) == "" || len(*password) < 8 {
		log.Fatal("-username (non-empty) and -password (at least 8 characters) are required")
	}
	if *displayName == "" {
		*displayName = *username
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	pool, err := db.NewNeonPool(ctx, dbURL)
	if err != nil {
		log.Fatalf("database init failed: %v", err)
	}
	defer pool.Close()

	if *runMigrate {
		sqlBytes, err := os.ReadFile(*migrationPath)
		if err != nil {
			log.Fatalf("read migration file %s: %v", *migrationPath, err)
		}
		if _, err := pool.Exec(ctx, string(sqlBytes)); err != nil {
			log.Fatalf("apply migration failed: %v", err)
		}
		log.Printf("applied migration: %s", *migrationPath)
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(*password), 12)
	if err != nil {
		log.Fatalf("bcrypt hash failed: %v", err)
	}

	var userID int64
	err = pool.QueryRow(
		ctx,
		`INSERT INTO users (username, display_name, email, password_hash, is_admin, status, updated_at)
		 VALUES ($1, $2, $3, $4, $5, 1, NOW())
		 ON CONFLICT (username) DO UPDATE SET
		     display_name = EXCLUDED.display_name,
		     email = EXCLUDED.email,
		     password_hash = EXCLUDED.password_hash,
		     is_admin = EXCLUDED.is_admin,
		     status = 1,
		     updated_at = NOW()
		 RETURNING id`,
		strings.TrimSpace(*username), *displayName, *email, string(hash), *isAdmin,
	).Scan(&userID)
	if err != nil {
		log.Fatalf("upsert user failed: %v", err)
	}

	guid, err := randomUUIDv4()
	if err != nil {
		log.Fatalf("generate address book guid failed: %v", err)
	}
	if _, err := pool.Exec(
		ctx,
		`INSERT INTO address_books (guid, user_id) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING`,
		guid, userID,
	); err != nil {
		log.Fatalf("initialize address book failed: %v", err)
	}

	log.Printf("seeded user %q (id=%d, admin=%v)", strings.TrimSpace(*username), userID, *isAdmin)
}

func randomUUIDv4() (string, error) {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
		b[0:4], b[4:6], b[6:8], b[8:10], b[10:16]), nil
}
