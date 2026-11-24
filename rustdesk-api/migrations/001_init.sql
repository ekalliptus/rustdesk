-- EL-Desk Custom Go API Schema (NeonDB PostgreSQL)
-- Strictly excludes live heartbeat presence (kept in-memory) and hbbs/hbbr relay DB state.

CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    avatar TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,
    status SMALLINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY,
    uuid TEXT NOT NULL DEFAULT '',
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    hostname TEXT NOT NULL DEFAULT '',
    username TEXT NOT NULL DEFAULT '',
    os TEXT NOT NULL DEFAULT '',
    cpu TEXT NOT NULL DEFAULT '',
    memory TEXT NOT NULL DEFAULT '',
    version TEXT NOT NULL DEFAULT '',
    ip TEXT NOT NULL DEFAULT '',
    last_sysinfo_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices (user_id);
CREATE INDEX IF NOT EXISTS idx_devices_uuid ON devices (uuid);

CREATE TABLE IF NOT EXISTS address_books (
    guid TEXT PRIMARY KEY,
    user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    peers JSONB NOT NULL DEFAULT '[]'::jsonb,
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_address_books_user_id ON address_books (user_id);
CREATE INDEX IF NOT EXISTS idx_address_books_peers_gin ON address_books USING GIN (peers);

CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    guid TEXT NOT NULL UNIQUE,
    nonce TEXT UNIQUE,
    audit_type TEXT NOT NULL DEFAULT 'conn',
    device_id TEXT NOT NULL DEFAULT '',
    device_uuid TEXT NOT NULL DEFAULT '',
    peer_id TEXT NOT NULL DEFAULT '',
    conn_id BIGINT NOT NULL DEFAULT 0,
    action TEXT NOT NULL DEFAULT '',
    source_ip TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_device_created ON audit_logs (device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_type_created ON audit_logs (audit_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs (created_at DESC);

CREATE TABLE IF NOT EXISTS app_releases (
    id BIGSERIAL PRIMARY KEY,
    version TEXT NOT NULL UNIQUE,
    release_id TEXT NOT NULL,
    published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    url TEXT NOT NULL,
    changelog TEXT NOT NULL DEFAULT '',
    artifacts JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_latest BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_releases_latest ON app_releases (is_latest, published_at DESC) WHERE is_latest = TRUE;
CREATE INDEX IF NOT EXISTS idx_app_releases_published ON app_releases (published_at DESC);
