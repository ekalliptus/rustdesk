package handler

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/ekalliptus/eldesk-api/internal/middleware"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type AuditHandler struct {
	pool *pgxpool.Pool
}

func NewAuditHandler(pool *pgxpool.Pool) *AuditHandler {
	return &AuditHandler{pool: pool}
}

func (h *AuditHandler) Create(w http.ResponseWriter, r *http.Request) {
	var raw map[string]json.RawMessage
	if err := decodeJSON(r, &raw); err != nil {
		writeError(w, http.StatusBadRequest, "invalid audit payload")
		return
	}

	auditType := strings.TrimSpace(chi.URLParam(r, "type"))
	if auditType == "" {
		auditType = rawMapString(raw, "audit_type")
	}
	if auditType == "" {
		auditType = "conn"
	}

	guid := rawMapString(raw, "guid")
	if guid == "" {
		var err error
		guid, err = newUUIDv4()
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to allocate audit id")
			return
		}
	}

	nonce := rawMapString(raw, "nonce")
	var nonceArg any
	if nonce != "" {
		nonceArg = nonce
	}

	deviceID := rawMapString(raw, "id")
	deviceUUID := rawMapString(raw, "uuid")
	peerID := rawMapString(raw, "peer_id")
	action := rawMapString(raw, "action")
	note := rawMapString(raw, "note")
	sourceIP := middleware.ClientIPFromContext(r.Context())

	var connID int64
	if c, ok := raw["conn_id"]; ok {
		_ = json.Unmarshal(c, &connID)
	}

	payloadJSON, err := json.Marshal(raw)
	if err != nil {
		payloadJSON = []byte("{}")
	}

	_, err = h.pool.Exec(
		r.Context(),
		`INSERT INTO audit_logs (guid, nonce, audit_type, device_id, device_uuid, peer_id, conn_id, action, source_ip, note, payload)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
		 ON CONFLICT (nonce) DO NOTHING`,
		guid, nonceArg, auditType, deviceID, deviceUUID, peerID, connID, action, sourceIP, note, string(payloadJSON),
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to store audit log")
		return
	}

	writeEmptyOK(w)
}

func (h *AuditHandler) UpdateNote(w http.ResponseWriter, r *http.Request) {
	var req struct {
		GUID string `json:"guid"`
		Note string `json:"note"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid audit note payload")
		return
	}
	req.GUID = strings.TrimSpace(req.GUID)
	if req.GUID == "" {
		writeError(w, http.StatusBadRequest, "guid is required")
		return
	}

	_, err := h.pool.Exec(
		r.Context(),
		`UPDATE audit_logs SET note = $1 WHERE guid = $2`,
		req.Note, req.GUID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update audit note")
		return
	}
	writeEmptyOK(w)
}

func rawMapString(raw map[string]json.RawMessage, key string) string {
	v, ok := raw[key]
	if !ok {
		return ""
	}
	return rawTokenToString(v)
}
