package middleware

import (
	"context"
	"errors"
	"net"
	"net/http"
	"net/netip"
	"strings"
	"time"

	"github.com/ekalliptus/eldesk-api/internal/store"
	"github.com/golang-jwt/jwt/v5"
)

type ctxKey int

const (
	ctxKeyClaims ctxKey = iota + 1
	ctxKeyClientIP
)

type Claims struct {
	UserID   int64  `json:"uid"`
	Username string `json:"username"`
	IsAdmin  bool   `json:"is_admin"`
	jwt.RegisteredClaims
}

func IssueToken(
	secret []byte,
	ttl time.Duration,
	userID int64,
	username string,
	isAdmin bool,
	jti string,
) (string, error) {
	now := time.Now().UTC()
	claims := Claims{
		UserID:   userID,
		Username: username,
		IsAdmin:  isAdmin,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   username,
			ID:        jti,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(secret)
}

func VerifyToken(secret []byte, tokenStr string) (*Claims, error) {
	claims := &Claims{}
	parsed, err := jwt.ParseWithClaims(
		tokenStr,
		claims,
		func(token *jwt.Token) (any, error) {
			return secret, nil
		},
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
	)
	if err != nil {
		return nil, err
	}
	if !parsed.Valid || claims.Username == "" {
		return nil, errors.New("invalid token claims")
	}
	return claims, nil
}

func ExtractBearerToken(r *http.Request) string {
	auth := strings.TrimSpace(r.Header.Get("Authorization"))
	if len(auth) < 7 || !strings.EqualFold(auth[:7], "Bearer ") {
		return ""
	}
	return strings.TrimSpace(auth[7:])
}

func RequireAuth(secret []byte, blocklist *store.TokenBlocklist) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			raw := ExtractBearerToken(r)
			if raw == "" {
				writeUnauthorized(w)
				return
			}
			claims, err := VerifyToken(secret, raw)
			if err != nil {
				writeUnauthorized(w)
				return
			}
			if blocklist != nil && claims.ID != "" && blocklist.IsRevoked(claims.ID) {
				writeUnauthorized(w)
				return
			}
			ctx := context.WithValue(r.Context(), ctxKeyClaims, claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func RequireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims, ok := ClaimsFromContext(r.Context())
		if !ok || !claims.IsAdmin {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusForbidden)
			_, _ = w.Write([]byte(`{"error":"admin required"}`))
			return
		}
		next.ServeHTTP(w, r)
	})
}

func ClaimsFromContext(ctx context.Context) (*Claims, bool) {
	c, ok := ctx.Value(ctxKeyClaims).(*Claims)
	return c, ok && c != nil
}

func ClientIP(r *http.Request, trustProxy bool) string {
	host := r.RemoteAddr
	if h, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		host = h
	}
	remoteAddr, err := netip.ParseAddr(strings.TrimSpace(host))
	if err == nil {
		remoteAddr = remoteAddr.Unmap()
	}

	if trustProxy && remoteAddr.IsValid() && (remoteAddr.IsLoopback() || remoteAddr.IsPrivate()) {
		if cfIP := strings.TrimSpace(r.Header.Get("CF-Connecting-IP")); cfIP != "" {
			if parsed, parseErr := netip.ParseAddr(cfIP); parseErr == nil {
				return parsed.Unmap().String()
			}
		}
		if xff := strings.TrimSpace(r.Header.Get("X-Forwarded-For")); xff != "" {
			first, _, _ := strings.Cut(xff, ",")
			if parsed, parseErr := netip.ParseAddr(strings.TrimSpace(first)); parseErr == nil {
				return parsed.Unmap().String()
			}
		}
	}

	if remoteAddr.IsValid() {
		return remoteAddr.String()
	}
	return r.RemoteAddr
}

func RealIPMiddleware(trustProxy bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := ClientIP(r, trustProxy)
			ctx := context.WithValue(r.Context(), ctxKeyClientIP, ip)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func ClientIPFromContext(ctx context.Context) string {
	if ip, ok := ctx.Value(ctxKeyClientIP).(string); ok {
		return ip
	}
	return ""
}

func MaxBodySize(limit int64) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Body != nil {
				r.Body = http.MaxBytesReader(w, r.Body, limit)
			}
			next.ServeHTTP(w, r)
		})
	}
}

func CORSMiddleware(allowedOrigin string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := strings.TrimSpace(r.Header.Get("Origin"))
			w.Header().Add("Vary", "Origin")
			if allowedOrigin == "*" {
				w.Header().Set("Access-Control-Allow-Origin", "*")
			} else if origin != "" && strings.EqualFold(origin, allowedOrigin) {
				w.Header().Set("Access-Control-Allow-Origin", allowedOrigin)
			}
			w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func writeUnauthorized(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnauthorized)
	_, _ = w.Write([]byte(`{"error":"unauthorized"}`))
}
