package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

const minJWTSecretBytes = 32

type Config struct {
	Port           string
	DatabaseURL    string
	JWTSecret      []byte
	JWTTTL         time.Duration
	PresenceTTL    time.Duration
	ReleaseCDNBase string
	WebProfileURL  string
	AllowedOrigin  string
	TrustProxy     bool
}

func Load() (*Config, error) {
	dbURL := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if dbURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}

	jwtSecretRaw := os.Getenv("JWT_SECRET")
	if len(jwtSecretRaw) < minJWTSecretBytes {
		return nil, fmt.Errorf("JWT_SECRET must be at least %d bytes", minJWTSecretBytes)
	}

	port := strings.TrimSpace(os.Getenv("PORT"))
	if port == "" {
		port = "21114"
	}
	if p, err := strconv.Atoi(port); err != nil || p < 1 || p > 65535 {
		return nil, fmt.Errorf("invalid PORT %q", port)
	}

	jwtTTLHours, err := envInt("JWT_TTL_HOURS", 168)
	if err != nil || jwtTTLHours <= 0 {
		return nil, fmt.Errorf("invalid JWT_TTL_HOURS")
	}

	presenceTTLS, err := envInt("PRESENCE_TTL_SECONDS", 45)
	if err != nil || presenceTTLS <= 0 {
		return nil, fmt.Errorf("invalid PRESENCE_TTL_SECONDS")
	}

	trustProxy, err := envBool("TRUST_PROXY", true)
	if err != nil {
		return nil, fmt.Errorf("invalid TRUST_PROXY")
	}

	return &Config{
		Port:           port,
		DatabaseURL:    dbURL,
		JWTSecret:      []byte(jwtSecretRaw),
		JWTTTL:         time.Duration(jwtTTLHours) * time.Hour,
		PresenceTTL:    time.Duration(presenceTTLS) * time.Second,
		ReleaseCDNBase: envString("RELEASE_CDN_BASE", "https://dl.desk.ekalliptus.com"),
		WebProfileURL:  envString("WEB_PROFILE_URL", "https://desk.ekalliptus.com"),
		AllowedOrigin:  envString("ALLOWED_ORIGIN", "https://desk.ekalliptus.com"),
		TrustProxy:     trustProxy,
	}, nil
}

func envString(key, fallback string) string {
	val := strings.TrimSpace(os.Getenv(key))
	if val == "" {
		return fallback
	}
	return val
}

func envInt(key string, fallback int) (int, error) {
	val := strings.TrimSpace(os.Getenv(key))
	if val == "" {
		return fallback, nil
	}
	return strconv.Atoi(val)
}

func envBool(key string, fallback bool) (bool, error) {
	val := strings.TrimSpace(os.Getenv(key))
	if val == "" {
		return fallback, nil
	}
	return strconv.ParseBool(val)
}
