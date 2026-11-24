package handler

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/ekalliptus/eldesk-api/internal/middleware"
	"github.com/ekalliptus/eldesk-api/internal/store"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

// Precomputed dummy bcrypt hash (cost 10) for constant-work rejection on unknown usernames.
var dummyPasswordHash = []byte("$2a$10$7EqJtq98hPqEX7fNZaFWoOHiZ0vK6j2y7G0U0N5k2V7c6xP0lQ1qO")

type AuthHandler struct {
	pool      *pgxpool.Pool
	jwtSecret []byte
	jwtTTL    time.Duration
	blocklist *store.TokenBlocklist
}

func NewAuthHandler(
	pool *pgxpool.Pool,
	jwtSecret []byte,
	jwtTTL time.Duration,
	blocklist *store.TokenBlocklist,
) *AuthHandler {
	return &AuthHandler{
		pool:      pool,
		jwtSecret: jwtSecret,
		jwtTTL:    jwtTTL,
		blocklist: blocklist,
	}
}

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type userPayload struct {
	Name        string `json:"name"`
	DisplayName string `json:"display_name"`
	Avatar      string `json:"avatar"`
	Email       string `json:"email"`
	Note        string `json:"note"`
	Status      int16  `json:"status"`
	IsAdmin     bool   `json:"is_admin"`
}

type loginResponse struct {
	Type        string      `json:"type"`
	AccessToken string      `json:"access_token"`
	User        userPayload `json:"user"`
}

func (h *AuthHandler) LoginOptions(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, []string{})
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request payload")
		return
	}
	req.Username = strings.TrimSpace(req.Username)
	if req.Username == "" || req.Password == "" {
		writeError(w, http.StatusBadRequest, "username and password are required")
		return
	}

	var (
		userID       int64
		passwordHash string
		user         userPayload
	)
	err := h.pool.QueryRow(
		r.Context(),
		`SELECT id, username, display_name, avatar, email, note, password_hash, status, is_admin
		 FROM users
		 WHERE username = $1`,
		req.Username,
	).Scan(
		&userID,
		&user.Name,
		&user.DisplayName,
		&user.Avatar,
		&user.Email,
		&user.Note,
		&passwordHash,
		&user.Status,
		&user.IsAdmin,
	)
	if err != nil {
		_ = bcrypt.CompareHashAndPassword(dummyPasswordHash, []byte(req.Password))
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusUnauthorized, "invalid username or password")
			return
		}
		writeError(w, http.StatusInternalServerError, "authentication error")
		return
	}

	if user.Status != 1 {
		_ = bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(req.Password))
		writeError(w, http.StatusForbidden, "account is disabled")
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(req.Password)); err != nil {
		writeError(w, http.StatusUnauthorized, "invalid username or password")
		return
	}

	jti, err := newUUIDv4()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create session")
		return
	}
	token, err := middleware.IssueToken(h.jwtSecret, h.jwtTTL, userID, user.Name, user.IsAdmin, jti)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to sign token")
		return
	}

	writeJSON(w, http.StatusOK, loginResponse{
		Type:        "access_token",
		AccessToken: token,
		User:        user,
	})
}

func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	if raw := middleware.ExtractBearerToken(r); raw != "" && h.blocklist != nil {
		if claims, err := middleware.VerifyToken(h.jwtSecret, raw); err == nil && claims.ID != "" {
			exp := time.Now().UTC().Add(h.jwtTTL)
			if claims.ExpiresAt != nil {
				exp = claims.ExpiresAt.Time
			}
			h.blocklist.Revoke(claims.ID, exp)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{})
}

func (h *AuthHandler) CurrentUser(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var user userPayload
	err := h.pool.QueryRow(
		r.Context(),
		`SELECT username, display_name, avatar, email, note, status, is_admin
		 FROM users
		 WHERE id = $1`,
		claims.UserID,
	).Scan(
		&user.Name,
		&user.DisplayName,
		&user.Avatar,
		&user.Email,
		&user.Note,
		&user.Status,
		&user.IsAdmin,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusUnauthorized, "user not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to load user")
		return
	}
	if user.Status != 1 {
		writeError(w, http.StatusUnauthorized, "account is disabled")
		return
	}

	writeJSON(w, http.StatusOK, user)
}
