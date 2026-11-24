package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/ekalliptus/eldesk-api/internal/store"
	"github.com/golang-jwt/jwt/v5"
)

func TestClientIPTrustsProxyOnlyFromPrivateRemoteAddr(t *testing.T) {
	reqLocal := httptest.NewRequest(http.MethodGet, "/", nil)
	reqLocal.RemoteAddr = "127.0.0.1:43210"
	reqLocal.Header.Set("CF-Connecting-IP", "198.51.100.42")
	if got := ClientIP(reqLocal, true); got != "198.51.100.42" {
		t.Fatalf("expected CF-Connecting-IP when proxied from loopback, got %q", got)
	}

	reqSpoof := httptest.NewRequest(http.MethodGet, "/", nil)
	reqSpoof.RemoteAddr = "203.0.113.9:12345"
	reqSpoof.Header.Set("CF-Connecting-IP", "198.51.100.42")
	if got := ClientIP(reqSpoof, true); got != "203.0.113.9" {
		t.Fatalf("expected public remote addr to ignore spoofed header, got %q", got)
	}

	reqInvalid := httptest.NewRequest(http.MethodGet, "/", nil)
	reqInvalid.RemoteAddr = "127.0.0.1:43210"
	reqInvalid.Header.Set("CF-Connecting-IP", "not-an-ip")
	reqInvalid.Header.Set("X-Forwarded-For", "192.0.2.15, 10.0.0.1")
	if got := ClientIP(reqInvalid, true); got != "192.0.2.15" {
		t.Fatalf("expected fallback to valid XFF first hop, got %q", got)
	}
}

func TestJWTIssueVerifyAndAlgNoneRejection(t *testing.T) {
	secret := []byte("0123456789abcdef0123456789abcdef")
	tok, err := IssueToken(secret, time.Hour, 7, "admin", true, "jti-123")
	if err != nil {
		t.Fatalf("IssueToken failed: %v", err)
	}
	claims, err := VerifyToken(secret, tok)
	if err != nil {
		t.Fatalf("VerifyToken failed: %v", err)
	}
	if claims.UserID != 7 || claims.Username != "admin" || !claims.IsAdmin || claims.ID != "jti-123" {
		t.Fatalf("unexpected claims: %+v", claims)
	}

	unsigned := jwt.NewWithClaims(jwt.SigningMethodNone, Claims{
		UserID:   1,
		Username: "attacker",
		IsAdmin:  true,
	})
	noneTok, err := unsigned.SignedString(jwt.UnsafeAllowNoneSignatureType)
	if err != nil {
		t.Fatalf("sign alg=none test token: %v", err)
	}
	if _, err := VerifyToken(secret, noneTok); err == nil {
		t.Fatal("expected VerifyToken to reject alg=none token")
	}

	bl := store.NewTokenBlocklist()
	bl.Revoke("jti-123", time.Now().Add(time.Hour))
	mw := RequireAuth(secret, bl)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	rec := httptest.NewRecorder()
	mw.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for revoked token, got %d", rec.Code)
	}
}

func TestCORSMiddleware(t *testing.T) {
	const allowed = "https://desk.ekalliptus.com"
	handler := CORSMiddleware(allowed)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	}))

	// Matching origin sets ACAO + Vary: Origin and serves 200.
	reqAllowed := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	reqAllowed.Header.Set("Origin", allowed)
	recAllowed := httptest.NewRecorder()
	handler.ServeHTTP(recAllowed, reqAllowed)
	if recAllowed.Code != http.StatusOK {
		t.Fatalf("expected 200 for allowed origin, got %d", recAllowed.Code)
	}
	if got := recAllowed.Header().Get("Access-Control-Allow-Origin"); got != allowed {
		t.Fatalf("expected ACAO %q, got %q", allowed, got)
	}
	if got := recAllowed.Header().Get("Vary"); got != "Origin" {
		t.Fatalf("expected Vary Origin, got %q", got)
	}

	// OPTIONS preflight returns 204 without hitting downstream.
	reqOpt := httptest.NewRequest(http.MethodOptions, "/healthz", nil)
	reqOpt.Header.Set("Origin", allowed)
	recOpt := httptest.NewRecorder()
	handler.ServeHTTP(recOpt, reqOpt)
	if recOpt.Code != http.StatusNoContent {
		t.Fatalf("expected 204 for preflight, got %d", recOpt.Code)
	}
	if got := recOpt.Header().Get("Access-Control-Allow-Origin"); got != allowed {
		t.Fatalf("expected ACAO %q on preflight, got %q", allowed, got)
	}

	// Disallowed origin omits Access-Control-Allow-Origin.
	reqOther := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	reqOther.Header.Set("Origin", "https://evil.example")
	recOther := httptest.NewRecorder()
	handler.ServeHTTP(recOther, reqOther)
	if got := recOther.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Fatalf("expected empty ACAO for disallowed origin, got %q", got)
	}

	// Non-browser request without Origin passes cleanly with 200.
	reqNoOrigin := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	recNoOrigin := httptest.NewRecorder()
	handler.ServeHTTP(recNoOrigin, reqNoOrigin)
	if recNoOrigin.Code != http.StatusOK {
		t.Fatalf("expected 200 when Origin is absent, got %d", recNoOrigin.Code)
	}
	if got := recNoOrigin.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Fatalf("expected empty ACAO when Origin is absent, got %q", got)
	}
}
