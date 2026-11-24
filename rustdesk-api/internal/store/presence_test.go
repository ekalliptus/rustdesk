package store

import (
	"testing"
	"time"
)

func TestPresenceStoreLifecycleAndTTL(t *testing.T) {
	now := time.Date(2026, 11, 23, 0, 0, 0, 0, time.UTC)
	st := NewPresenceStore(45 * time.Second)
	st.nowFn = func() time.Time { return now }

	st.Record(PeerHeartbeat{
		ID:    "100200300",
		UUID:  "uuid-1",
		Ver:   10406,
		Conns: []string{"1"},
		IP:    "203.0.113.10",
	})
	st.Record(PeerHeartbeat{
		ID:   "100200100",
		UUID: "uuid-2",
		IP:   "203.0.113.11",
	})

	if !st.IsOnline("100200300") {
		t.Fatal("expected peer 100200300 to be online immediately after heartbeat")
	}

	list := st.ListOnline()
	if len(list) != 2 || list[0].ID != "100200100" || list[1].ID != "100200300" {
		t.Fatalf("unexpected sorted online list: %+v", list)
	}

	now = now.Add(45 * time.Second)
	if !st.IsOnline("100200300") {
		t.Fatal("expected peer at exact TTL boundary to remain online")
	}

	now = now.Add(1 * time.Second)
	if st.IsOnline("100200300") {
		t.Fatal("expected peer past TTL to be offline")
	}
	if removed := st.Prune(); removed != 1 {
		t.Fatalf("expected Prune to remove remaining expired peer, got %d", removed)
	}
	if len(st.ListOnline()) != 0 {
		t.Fatal("expected empty online peer list after expiration")
	}
}

func TestTokenBlocklistRevocationAndPrune(t *testing.T) {
	now := time.Date(2026, 11, 23, 0, 0, 0, 0, time.UTC)
	bl := NewTokenBlocklist()
	bl.nowFn = func() time.Time { return now }

	bl.Revoke("jti-1", now.Add(10*time.Minute))
	if !bl.IsRevoked("jti-1") {
		t.Fatal("expected revoked token jti-1 to be blocked")
	}
	if bl.IsRevoked("jti-other") {
		t.Fatal("unexpected block on unknown jti")
	}

	now = now.Add(11 * time.Minute)
	if bl.IsRevoked("jti-1") {
		t.Fatal("expected expired blocklist entry to stop blocking after expiry")
	}
}
