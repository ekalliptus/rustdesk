FROM golang:1.23-alpine AS builder

RUN apk add --no-cache ca-certificates

WORKDIR /src
COPY . .

RUN go mod tidy \
    && CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/rustdesk-api ./cmd/api \
    && CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/seed-admin ./cmd/seed-admin

FROM alpine:3.20

RUN apk add --no-cache ca-certificates \
    && adduser -D -u 10001 appuser

WORKDIR /app
COPY --from=builder /out/rustdesk-api /usr/local/bin/rustdesk-api
COPY --from=builder /out/seed-admin /usr/local/bin/seed-admin
COPY --from=builder /src/migrations/001_init.sql /app/migrations/001_init.sql

USER appuser
EXPOSE 21114

ENTRYPOINT ["/usr/local/bin/rustdesk-api"]
