package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type ReleaseHandler struct {
	pool *pgxpool.Pool
}

func NewReleaseHandler(pool *pgxpool.Pool) *ReleaseHandler {
	return &ReleaseHandler{pool: pool}
}

type latestReleaseResponse struct {
	Version     string            `json:"version"`
	ReleaseID   string            `json:"release_id"`
	PublishedAt time.Time         `json:"published_at"`
	URL         string            `json:"url"`
	Changelog   string            `json:"changelog"`
	Artifacts   []json.RawMessage `json:"artifacts"`
}

func (h *ReleaseHandler) Latest(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "public, max-age=60")

	var (
		resp         latestReleaseResponse
		artifactsRaw []byte
	)
	err := h.pool.QueryRow(
		r.Context(),
		`SELECT version, release_id, published_at, url, changelog, artifacts
		 FROM app_releases
		 ORDER BY is_latest DESC, published_at DESC
		 LIMIT 1`,
	).Scan(
		&resp.Version,
		&resp.ReleaseID,
		&resp.PublishedAt,
		&resp.URL,
		&resp.Changelog,
		&artifactsRaw,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "no release published yet")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to load release metadata")
		return
	}

	resp.Artifacts = make([]json.RawMessage, 0)
	if len(artifactsRaw) > 0 {
		_ = json.Unmarshal(artifactsRaw, &resp.Artifacts)
	}

	writeJSON(w, http.StatusOK, resp)
}
