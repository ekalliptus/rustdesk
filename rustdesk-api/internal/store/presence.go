package store

import (
	"sort"
	"sync"
	"time"
)

type PeerHeartbeat struct {
	ID    string
	UUID  string
	Ver   int64
	Conns []string
	IP    string
}

type OnlinePeer struct {
	ID       string    `json:"id"`
	UUID     string    `json:"uuid,omitempty"`
	Ver      int64     `json:"ver,omitempty"`
	Conns    []string  `json:"conns,omitempty"`
	IP       string    `json:"ip,omitempty"`
	LastSeen time.Time `json:"last_seen"`
}

type presenceEntry struct {
	peer OnlinePeer
}

// PresenceStore tracks live device heartbeats strictly in memory so heartbeat
// traffic never wakes or writes to NeonDB.
type PresenceStore struct {
	ttl   time.Duration
	nowFn func() time.Time
	m     sync.Map
}

func NewPresenceStore(ttl time.Duration) *PresenceStore {
	if ttl <= 0 {
		ttl = 45 * time.Second
	}
	return &PresenceStore{
		ttl:   ttl,
		nowFn: time.Now,
	}
}

func (s *PresenceStore) Record(hb PeerHeartbeat) {
	if hb.ID == "" {
		return
	}
	var connsCopy []string
	if len(hb.Conns) > 0 {
		connsCopy = make([]string, len(hb.Conns))
		copy(connsCopy, hb.Conns)
	}
	entry := &presenceEntry{
		peer: OnlinePeer{
			ID:       hb.ID,
			UUID:     hb.UUID,
			Ver:      hb.Ver,
			Conns:    connsCopy,
			IP:       hb.IP,
			LastSeen: s.nowFn().UTC(),
		},
	}
	s.m.Store(hb.ID, entry)
}

func (s *PresenceStore) IsOnline(id string) bool {
	if id == "" {
		return false
	}
	raw, ok := s.m.Load(id)
	if !ok {
		return false
	}
	entry, ok := raw.(*presenceEntry)
	if !ok {
		return false
	}
	if s.nowFn().UTC().Sub(entry.peer.LastSeen) > s.ttl {
		s.m.CompareAndDelete(id, entry)
		return false
	}
	return true
}

func (s *PresenceStore) ListOnline() []OnlinePeer {
	now := s.nowFn().UTC()
	out := make([]OnlinePeer, 0)
	s.m.Range(func(k, v any) bool {
		entry, ok := v.(*presenceEntry)
		if !ok {
			s.m.CompareAndDelete(k, v)
			return true
		}
		if now.Sub(entry.peer.LastSeen) > s.ttl {
			s.m.CompareAndDelete(k, entry)
			return true
		}
		peer := entry.peer
		if len(peer.Conns) > 0 {
			cp := make([]string, len(peer.Conns))
			copy(cp, peer.Conns)
			peer.Conns = cp
		}
		out = append(out, peer)
		return true
	})
	sort.Slice(out, func(i, j int) bool {
		return out[i].ID < out[j].ID
	})
	return out
}

func (s *PresenceStore) Prune() int {
	now := s.nowFn().UTC()
	removed := 0
	s.m.Range(func(k, v any) bool {
		entry, ok := v.(*presenceEntry)
		if !ok || now.Sub(entry.peer.LastSeen) > s.ttl {
			if s.m.CompareAndDelete(k, v) {
				removed++
			}
		}
		return true
	})
	return removed
}

type TokenBlocklist struct {
	nowFn func() time.Time
	m     sync.Map
}

func NewTokenBlocklist() *TokenBlocklist {
	return &TokenBlocklist{nowFn: time.Now}
}

func (b *TokenBlocklist) Revoke(jti string, expiresAt time.Time) {
	if jti == "" {
		return
	}
	b.m.Store(jti, expiresAt.UTC())
}

func (b *TokenBlocklist) IsRevoked(jti string) bool {
	if jti == "" {
		return false
	}
	raw, ok := b.m.Load(jti)
	if !ok {
		return false
	}
	exp, ok := raw.(time.Time)
	if !ok {
		return false
	}
	if b.nowFn().UTC().After(exp) {
		b.m.CompareAndDelete(jti, raw)
		return false
	}
	return true
}

func (b *TokenBlocklist) Prune() int {
	now := b.nowFn().UTC()
	removed := 0
	b.m.Range(func(k, v any) bool {
		exp, ok := v.(time.Time)
		if !ok || now.After(exp) {
			if b.m.CompareAndDelete(k, v) {
				removed++
			}
		}
		return true
	})
	return removed
}
