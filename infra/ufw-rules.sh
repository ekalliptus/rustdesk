#!/usr/bin/env bash
set -euo pipefail

# UFW firewall rules for EL-Desk VPS (Ubuntu/Debian).
# Keeps port 21114 (rustdesk-api) closed externally; Nginx proxies HTTPS -> 127.0.0.1:21114.

ufw --force reset
ufw default deny incoming
ufw default allow outgoing

# Admin SSH & Nginx HTTPS/HTTP
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP redirect to HTTPS'
ufw allow 443/tcp comment 'HTTPS API (Cloudflare Proxied)'

# EL-Desk Rendezvous (hbbs) & Relay (hbbr) direct TCP/UDP (DNS Only)
ufw allow 21115/tcp comment 'hbbs NAT type test'
ufw allow 21116/tcp comment 'hbbs TCP hole punching / registration'
ufw allow 21116/udp comment 'hbbs UDP registration / heartbeat'
ufw allow 21117/tcp comment 'hbbr Relay'
ufw allow 21118/tcp comment 'hbbs WebSocket ID'
ufw allow 21119/tcp comment 'hbbr WebSocket Relay'

ufw --force enable
ufw status verbose
