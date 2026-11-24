package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/ekalliptus/eldesk-api/internal/middleware"
	"github.com/ekalliptus/eldesk-api/internal/store"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type ABHandler struct {
	pool     *pgxpool.Pool
	presence *store.PresenceStore
}

func NewABHandler(pool *pgxpool.Pool, presence *store.PresenceStore) *ABHandler {
	return &ABHandler{
		pool:     pool,
		presence: presence,
	}
}

type abPeer struct {
	ID              string   `json:"id"`
	Hash            string   `json:"hash,omitempty"`
	Password        string   `json:"password,omitempty"`
	Username        string   `json:"username,omitempty"`
	Hostname        string   `json:"hostname,omitempty"`
	Platform        string   `json:"platform,omitempty"`
	Alias           string   `json:"alias,omitempty"`
	Tags            []string `json:"tags"`
	ForceAlwaysRelay string  `json:"forceAlwaysRelay,omitempty"`
	RDPPort         string   `json:"rdpPort,omitempty"`
	RDPUsername     string   `json:"rdpUsername,omitempty"`
	LoginName       string   `json:"loginName,omitempty"`
	DeviceGroupName string   `json:"device_group_name,omitempty"`
	Note            string   `json:"note,omitempty"`
	SameServer      *bool    `json:"same_server,omitempty"`
	Online          bool     `json:"online"`
}

type abTag struct {
	Name  string `json:"name"`
	Color int64  `json:"color"`
}

type legacyABPayload struct {
	Tags      []string `json:"tags"`
	TagColors string   `json:"tag_colors"`
	Peers     []abPeer `json:"peers"`
}

func (h *ABHandler) ensurePersonalAB(ctx context.Context, userID int64) (string, error) {
	guid, err := newUUIDv4()
	if err != nil {
		return "", err
	}
	var existing string
	err = h.pool.QueryRow(
		ctx,
		`INSERT INTO address_books (guid, user_id)
		 VALUES ($1, $2)
		 ON CONFLICT (user_id) DO UPDATE SET user_id = address_books.user_id
		 RETURNING guid`,
		guid, userID,
	).Scan(&existing)
	return existing, err
}

func (h *ABHandler) Settings(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"max_peer_one_ab": 0})
}

func (h *ABHandler) Personal(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	guid, err := h.ensurePersonalAB(r.Context(), claims.UserID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load personal address book")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"guid": guid})
}

func (h *ABHandler) SharedProfiles(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"total": 0,
		"data":  []any{},
	})
}

func (h *ABHandler) LegacyGet(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	guid, err := h.ensurePersonalAB(r.Context(), claims.UserID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load address book")
		return
	}

	var peersRaw, tagsRaw []byte
	err = h.pool.QueryRow(
		r.Context(),
		`SELECT peers, tags FROM address_books WHERE guid = $1 AND user_id = $2`,
		guid, claims.UserID,
	).Scan(&peersRaw, &tagsRaw)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to read address book")
		return
	}

	peers, tags := decodePeersAndTags(peersRaw, tagsRaw)
	if len(peers) == 0 && len(tags) == 0 {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("null"))
		return
	}

	tagNames := make([]string, 0, len(tags))
	tagColorMap := make(map[string]int64, len(tags))
	for _, t := range tags {
		tagNames = append(tagNames, t.Name)
		tagColorMap[t.Name] = t.Color
	}
	tagColorsJSON, err := json.Marshal(tagColorMap)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to encode tag colors")
		return
	}
	for i := range peers {
		if peers[i].Tags == nil {
			peers[i].Tags = []string{}
		}
		peers[i].Online = h.presence.IsOnline(peers[i].ID)
	}

	inner, err := json.Marshal(legacyABPayload{
		Tags:      tagNames,
		TagColors: string(tagColorsJSON),
		Peers:     peers,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to encode address book")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"data": string(inner),
	})
}

func (h *ABHandler) LegacyPost(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	guid, err := h.ensurePersonalAB(r.Context(), claims.UserID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to initialize address book")
		return
	}

	var envelope struct {
		Data string `json:"data"`
	}
	if err := decodeJSON(r, &envelope); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request payload")
		return
	}

	var legacy legacyABPayload
	if strings.TrimSpace(envelope.Data) != "" && strings.TrimSpace(envelope.Data) != "null" {
		if err := json.Unmarshal([]byte(envelope.Data), &legacy); err != nil {
			writeError(w, http.StatusBadRequest, "invalid address book data JSON")
			return
		}
	}

	tagColors := make(map[string]int64)
	if strings.TrimSpace(legacy.TagColors) != "" {
		_ = json.Unmarshal([]byte(legacy.TagColors), &tagColors)
	}
	tags := make([]abTag, 0, len(legacy.Tags))
	for _, name := range legacy.Tags {
		if name == "" {
			continue
		}
		tags = append(tags, abTag{Name: name, Color: tagColors[name]})
	}
	for i := range legacy.Peers {
		if legacy.Peers[i].Tags == nil {
			legacy.Peers[i].Tags = []string{}
		}
		legacy.Peers[i].Online = false
	}

	peersJSON, err := json.Marshal(legacy.Peers)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to serialize peers")
		return
	}
	tagsJSON, err := json.Marshal(tags)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to serialize tags")
		return
	}

	_, err = h.pool.Exec(
		r.Context(),
		`UPDATE address_books SET peers = $1::jsonb, tags = $2::jsonb, updated_at = NOW() WHERE guid = $3 AND user_id = $4`,
		string(peersJSON), string(tagsJSON), guid, claims.UserID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to store address book")
		return
	}
	writeEmptyOK(w)
}

func (h *ABHandler) Peers(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	guid := strings.TrimSpace(r.URL.Query().Get("ab"))
	if guid == "" {
		var err error
		guid, err = h.ensurePersonalAB(r.Context(), claims.UserID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to resolve address book")
			return
		}
	}

	var peersRaw, tagsRaw []byte
	err := h.pool.QueryRow(
		r.Context(),
		`SELECT peers, tags FROM address_books WHERE guid = $1 AND user_id = $2`,
		guid, claims.UserID,
	).Scan(&peersRaw, &tagsRaw)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "address book not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to query address book")
		return
	}

	peers, _ := decodePeersAndTags(peersRaw, tagsRaw)
	total := len(peers)

	current, pageSize := parsePagination(r)
	start := (current - 1) * pageSize
	if start >= total {
		writeJSON(w, http.StatusOK, map[string]any{"total": total, "data": []abPeer{}})
		return
	}
	end := start + pageSize
	if end > total {
		end = total
	}
	page := peers[start:end]
	for i := range page {
		if page[i].Tags == nil {
			page[i].Tags = []string{}
		}
		page[i].Online = h.presence.IsOnline(page[i].ID)
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"total": total,
		"data":  page,
	})
}

func (h *ABHandler) Tags(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	guid := strings.TrimSpace(chi.URLParam(r, "guid"))
	if guid == "" {
		var err error
		guid, err = h.ensurePersonalAB(r.Context(), claims.UserID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to resolve address book")
			return
		}
	}

	var peersRaw, tagsRaw []byte
	err := h.pool.QueryRow(
		r.Context(),
		`SELECT peers, tags FROM address_books WHERE guid = $1 AND user_id = $2`,
		guid, claims.UserID,
	).Scan(&peersRaw, &tagsRaw)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "address book not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to query tags")
		return
	}

	_, tags := decodePeersAndTags(peersRaw, tagsRaw)
	writeJSON(w, http.StatusOK, tags)
}

func (h *ABHandler) AddPeer(w http.ResponseWriter, r *http.Request) {
	var incoming abPeer
	if err := decodeJSON(r, &incoming); err != nil {
		writeError(w, http.StatusBadRequest, "invalid peer payload")
		return
	}
	incoming.ID = strings.TrimSpace(incoming.ID)
	if incoming.ID == "" {
		writeError(w, http.StatusBadRequest, "peer id is required")
		return
	}
	if incoming.Tags == nil {
		incoming.Tags = []string{}
	}
	incoming.Online = false

	h.mutateAB(w, r, func(peers *[]abPeer, _ *[]abTag) error {
		for _, p := range *peers {
			if p.ID == incoming.ID {
				return nil
			}
		}
		*peers = append(*peers, incoming)
		return nil
	})
}

func (h *ABHandler) UpdatePeer(w http.ResponseWriter, r *http.Request) {
	var raw map[string]json.RawMessage
	if err := decodeJSON(r, &raw); err != nil {
		writeError(w, http.StatusBadRequest, "invalid peer update payload")
		return
	}
	var id string
	if rawID, ok := raw["id"]; ok {
		_ = json.Unmarshal(rawID, &id)
	}
	id = strings.TrimSpace(id)
	if id == "" {
		writeError(w, http.StatusBadRequest, "peer id is required")
		return
	}

	h.mutateAB(w, r, func(peers *[]abPeer, _ *[]abTag) error {
		for i := range *peers {
			if (*peers)[i].ID != id {
				continue
			}
			applyPeerUpdates(&(*peers)[i], raw)
			return nil
		}
		return nil
	})
}

func (h *ABHandler) DeletePeers(w http.ResponseWriter, r *http.Request) {
	var ids []string
	if err := decodeJSON(r, &ids); err != nil {
		writeError(w, http.StatusBadRequest, "invalid peer id list")
		return
	}
	toDelete := make(map[string]struct{}, len(ids))
	for _, id := range ids {
		toDelete[id] = struct{}{}
	}

	h.mutateAB(w, r, func(peers *[]abPeer, _ *[]abTag) error {
		kept := make([]abPeer, 0, len(*peers))
		for _, p := range *peers {
			if _, ok := toDelete[p.ID]; !ok {
				kept = append(kept, p)
			}
		}
		*peers = kept
		return nil
	})
}

func (h *ABHandler) AddTag(w http.ResponseWriter, r *http.Request) {
	var incoming abTag
	if err := decodeJSON(r, &incoming); err != nil {
		writeError(w, http.StatusBadRequest, "invalid tag payload")
		return
	}
	incoming.Name = strings.TrimSpace(incoming.Name)
	if incoming.Name == "" {
		writeError(w, http.StatusBadRequest, "tag name is required")
		return
	}

	h.mutateAB(w, r, func(_ *[]abPeer, tags *[]abTag) error {
		for i := range *tags {
			if (*tags)[i].Name == incoming.Name {
				(*tags)[i].Color = incoming.Color
				return nil
			}
		}
		*tags = append(*tags, incoming)
		return nil
	})
}

func (h *ABHandler) RenameTag(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Old string `json:"old"`
		New string `json:"new"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid tag rename payload")
		return
	}
	req.Old = strings.TrimSpace(req.Old)
	req.New = strings.TrimSpace(req.New)
	if req.Old == "" || req.New == "" {
		writeError(w, http.StatusBadRequest, "old and new tag names are required")
		return
	}

	h.mutateAB(w, r, func(peers *[]abPeer, tags *[]abTag) error {
		for i := range *tags {
			if (*tags)[i].Name == req.Old {
				(*tags)[i].Name = req.New
			}
		}
		for i := range *peers {
			for j, t := range (*peers)[i].Tags {
				if t == req.Old {
					(*peers)[i].Tags[j] = req.New
				}
			}
		}
		return nil
	})
}

func (h *ABHandler) UpdateTagColor(w http.ResponseWriter, r *http.Request) {
	var req abTag
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid tag update payload")
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "tag name is required")
		return
	}

	h.mutateAB(w, r, func(_ *[]abPeer, tags *[]abTag) error {
		for i := range *tags {
			if (*tags)[i].Name == req.Name {
				(*tags)[i].Color = req.Color
				return nil
			}
		}
		*tags = append(*tags, req)
		return nil
	})
}

func (h *ABHandler) DeleteTags(w http.ResponseWriter, r *http.Request) {
	var names []string
	if err := decodeJSON(r, &names); err != nil {
		writeError(w, http.StatusBadRequest, "invalid tag list")
		return
	}
	toDelete := make(map[string]struct{}, len(names))
	for _, n := range names {
		toDelete[n] = struct{}{}
	}

	h.mutateAB(w, r, func(peers *[]abPeer, tags *[]abTag) error {
		keptTags := make([]abTag, 0, len(*tags))
		for _, t := range *tags {
			if _, ok := toDelete[t.Name]; !ok {
				keptTags = append(keptTags, t)
			}
		}
		*tags = keptTags
		for i := range *peers {
			filtered := make([]string, 0, len((*peers)[i].Tags))
			for _, t := range (*peers)[i].Tags {
				if _, ok := toDelete[t]; !ok {
					filtered = append(filtered, t)
				}
			}
			(*peers)[i].Tags = filtered
		}
		return nil
	})
}

func (h *ABHandler) DeviceGroupsAccessible(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"total": 0, "data": []any{}})
}

func (h *ABHandler) Users(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	query := `SELECT username, display_name, avatar, email, note, status, is_admin FROM users WHERE id = $1`
	args := []any{claims.UserID}
	if claims.IsAdmin {
		query = `SELECT username, display_name, avatar, email, note, status, is_admin FROM users ORDER BY id ASC`
		args = nil
	}

	rows, err := h.pool.Query(r.Context(), query, args...)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load users")
		return
	}
	defer rows.Close()

	users := make([]userPayload, 0)
	for rows.Next() {
		var u userPayload
		if err := rows.Scan(&u.Name, &u.DisplayName, &u.Avatar, &u.Email, &u.Note, &u.Status, &u.IsAdmin); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to scan user")
			return
		}
		users = append(users, u)
	}
	writeJSON(w, http.StatusOK, map[string]any{"total": len(users), "data": users})
}

func (h *ABHandler) AccessiblePeers(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"total": 0, "data": []any{}})
}

func (h *ABHandler) mutateAB(w http.ResponseWriter, r *http.Request, fn func(*[]abPeer, *[]abTag) error) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	guid := strings.TrimSpace(chi.URLParam(r, "guid"))
	if guid == "" {
		writeError(w, http.StatusBadRequest, "address book guid is required")
		return
	}

	tx, err := h.pool.BeginTx(r.Context(), pgx.TxOptions{})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to start transaction")
		return
	}
	defer func() { _ = tx.Rollback(context.Background()) }()

	var peersRaw, tagsRaw []byte
	err = tx.QueryRow(
		r.Context(),
		`SELECT peers, tags FROM address_books WHERE guid = $1 AND user_id = $2 FOR UPDATE`,
		guid, claims.UserID,
	).Scan(&peersRaw, &tagsRaw)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "address book not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to load address book")
		return
	}

	peers, tags := decodePeersAndTags(peersRaw, tagsRaw)
	if err := fn(&peers, &tags); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	newPeersRaw, err := json.Marshal(peers)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to serialize peers")
		return
	}
	newTagsRaw, err := json.Marshal(tags)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to serialize tags")
		return
	}

	if _, err := tx.Exec(
		r.Context(),
		`UPDATE address_books SET peers = $1::jsonb, tags = $2::jsonb, updated_at = NOW() WHERE guid = $3 AND user_id = $4`,
		string(newPeersRaw), string(newTagsRaw), guid, claims.UserID,
	); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update address book")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to commit address book")
		return
	}

	writeEmptyOK(w)
}

func decodePeersAndTags(peersRaw, tagsRaw []byte) ([]abPeer, []abTag) {
	peers := make([]abPeer, 0)
	if len(peersRaw) > 0 {
		_ = json.Unmarshal(peersRaw, &peers)
	}
	tags := make([]abTag, 0)
	if len(tagsRaw) > 0 {
		_ = json.Unmarshal(tagsRaw, &tags)
	}
	return peers, tags
}

func applyPeerUpdates(p *abPeer, raw map[string]json.RawMessage) {
	setStr := func(key string, dst *string) {
		if v, ok := raw[key]; ok {
			var s string
			if err := json.Unmarshal(v, &s); err == nil {
				*dst = s
			}
		}
	}
	setStr("alias", &p.Alias)
	setStr("note", &p.Note)
	setStr("hash", &p.Hash)
	setStr("password", &p.Password)
	setStr("username", &p.Username)
	setStr("hostname", &p.Hostname)
	setStr("platform", &p.Platform)
	if v, ok := raw["tags"]; ok {
		var list []string
		if err := json.Unmarshal(v, &list); err == nil {
			if list == nil {
				list = []string{}
			}
			p.Tags = list
		}
	}
}

func parsePagination(r *http.Request) (current int, pageSize int) {
	current = 1
	pageSize = 100
	if c, err := strconv.Atoi(r.URL.Query().Get("current")); err == nil && c > 0 {
		current = c
	}
	if ps, err := strconv.Atoi(r.URL.Query().Get("pageSize")); err == nil && ps > 0 && ps <= 500 {
		pageSize = ps
	}
	return current, pageSize
}
