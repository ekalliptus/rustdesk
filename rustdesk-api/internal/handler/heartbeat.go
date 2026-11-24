package handler

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/ekalliptus/eldesk-api/internal/middleware"
	"github.com/ekalliptus/eldesk-api/internal/store"
	"github.com/jackc/pgx/v5/pgxpool"
)

type HeartbeatHandler struct {
	pool     *pgxpool.Pool
	presence *store.PresenceStore
	ttl      time.Duration
}

func NewHeartbeatHandler(pool *pgxpool.Pool, presence *store.PresenceStore, ttl time.Duration) *HeartbeatHandler {
	return &HeartbeatHandler{
		pool:     pool,
		presence: presence,
		ttl:      ttl,
	}
}

type heartbeatRequest struct {
	ID         string            `json:"id"`
	UUID       string            `json:"uuid"`
	Ver        int64             `json:"ver"`
	ModifiedAt int64             `json:"modified_at"`
	Conns      []json.RawMessage `json:"conns"`
}

// Heartbeat updates device presence strictly in memory so NeonDB stays scaled to zero.
func (h *HeartbeatHandler) Heartbeat(w http.ResponseWriter, r *http.Request) {
	var req heartbeatRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid heartbeat payload")
		return
	}
	req.ID = strings.TrimSpace(req.ID)
	if req.ID == "" {
		writeError(w, http.StatusBadRequest, "id is required")
		return
	}

	conns := make([]string, 0, len(req.Conns))
	for _, raw := range req.Conns {
		if s := rawTokenToString(raw); s != "" {
			conns = append(conns, s)
		}
	}

	h.presence.Record(store.PeerHeartbeat{
		ID:    req.ID,
		UUID:  req.UUID,
		Ver:   req.Ver,
		Conns: conns,
		IP:    middleware.ClientIPFromContext(r.Context()),
	})
	writeJSON(w, http.StatusOK, map[string]any{})
}

func (h *HeartbeatHandler) OnlinePeers(w http.ResponseWriter, r *http.Request) {
	peers := h.presence.ListOnline()
	writeJSON(w, http.StatusOK, map[string]any{
		"total":       len(peers),
		"ttl_seconds": int(h.ttl.Seconds()),
		"peers":       peers,
	})
}

func (h *HeartbeatHandler) SysinfoVer(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("1"))
}

type sysinfoRequest struct {
	ID       string          `json:"id"`
	UUID     string          `json:"uuid"`
	Hostname string          `json:"hostname"`
	Username string          `json:"username"`
	OS       string          `json:"os"`
	CPU      json.RawMessage `json:"cpu"`
	Memory   json.RawMessage `json:"memory"`
	Version  string          `json:"version"`
}

func (h *HeartbeatHandler) Sysinfo(w http.ResponseWriter, r *http.Request) {
	var req sysinfoRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid sysinfo payload")
		return
	}
	req.ID = strings.TrimSpace(req.ID)
	if req.ID == "" {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte("ID_NOT_FOUND"))
		return
	}

	ip := middleware.ClientIPFromContext(r.Context())
	cpuStr := rawTokenToString(req.CPU)
	memStr := rawTokenToString(req.Memory)

	_, err := h.pool.Exec(
		r.Context(),
		`INSERT INTO devices (id, uuid, hostname, username, os, cpu, memory, version, ip, last_sysinfo_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
		 ON CONFLICT (id) DO UPDATE SET
		     uuid = EXCLUDED.uuid,
		     hostname = EXCLUDED.hostname,
		     username = EXCLUDED.username,
		     os = EXCLUDED.os,
		     cpu = EXCLUDED.cpu,
		     memory = EXCLUDED.memory,
		     version = EXCLUDED.version,
		     ip = EXCLUDED.ip,
		     last_sysinfo_at = NOW(),
		     updated_at = NOW()`,
		req.ID, req.UUID, req.Hostname, req.Username, req.OS, cpuStr, memStr, req.Version, ip,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save sysinfo")
		return
	}

	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("SYSINFO_UPDATED"))
}

func rawTokenToString(raw json.RawMessage) string {
	trimmed := strings.TrimSpace(string(raw))
	if trimmed == "" || trimmed == "null" {
		return ""
	}
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		return s
	}
	var num int64
	if err := json.Unmarshal(raw, &num); err == nil {
		return strconv.FormatInt(num, 10)
	}
	return trimmed
}
