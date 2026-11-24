package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os/signal"
	"syscall"
	"time"

	"github.com/ekalliptus/eldesk-api/internal/config"
	"github.com/ekalliptus/eldesk-api/internal/db"
	"github.com/ekalliptus/eldesk-api/internal/handler"
	"github.com/ekalliptus/eldesk-api/internal/middleware"
	"github.com/ekalliptus/eldesk-api/internal/store"
	"github.com/go-chi/chi/v5"
	chiMiddleware "github.com/go-chi/chi/v5/middleware"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config error: %v", err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	pool, err := db.NewNeonPool(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("database init error: %v", err)
	}
	defer pool.Close()

	presence := store.NewPresenceStore(cfg.PresenceTTL)
	blocklist := store.NewTokenBlocklist()

	go func() {
		ticker := time.NewTicker(1 * time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				presence.Prune()
				blocklist.Prune()
			}
		}
	}()

	authHandler := handler.NewAuthHandler(pool, cfg.JWTSecret, cfg.JWTTTL, blocklist)
	hbHandler := handler.NewHeartbeatHandler(pool, presence, cfg.PresenceTTL)
	abHandler := handler.NewABHandler(pool, presence)
	auditHandler := handler.NewAuditHandler(pool)
	releaseHandler := handler.NewReleaseHandler(pool)

	r := chi.NewRouter()
	r.Use(chiMiddleware.RequestID)
	r.Use(middleware.RealIPMiddleware(cfg.TrustProxy))
	r.Use(chiMiddleware.Recoverer)
	r.Use(middleware.MaxBodySize(1 << 20))

	// Public & device-reporting routes
	r.Get("/api/login-options", authHandler.LoginOptions)
	r.Post("/api/login", authHandler.Login)
	r.Post("/api/logout", authHandler.Logout)

	// Strictly in-memory presence & static sysinfo version check (zero NeonDB calls)
	r.Post("/api/heartbeat", hbHandler.Heartbeat)
	r.Post("/api/sysinfo_ver", hbHandler.SysinfoVer)
	r.Post("/api/sysinfo", hbHandler.Sysinfo)

	r.Post("/api/audit", auditHandler.Create)
	r.Post("/api/audit/{type}", auditHandler.Create)

	r.Group(func(r chi.Router) {
		r.Use(middleware.CORSMiddleware(cfg.AllowedOrigin))
		r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"status":"ok"}`))
		})
		r.Options("/healthz", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusNoContent)
		})
		r.Get("/api/releases/latest", releaseHandler.Latest)
		r.Options("/api/releases/latest", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusNoContent)
		})
	})

	// Authenticated user routes
	r.Group(func(r chi.Router) {
		r.Use(middleware.RequireAuth(cfg.JWTSecret, blocklist))

		r.Get("/api/currentUser", authHandler.CurrentUser)
		r.Post("/api/currentUser", authHandler.CurrentUser)
		r.Put("/api/audit", auditHandler.UpdateNote)

		// Legacy & 1.2.6+ address book endpoints
		r.Get("/api/ab", abHandler.LegacyGet)
		r.Post("/api/ab", abHandler.LegacyPost)
		r.Post("/api/ab/settings", abHandler.Settings)
		r.Get("/api/ab/personal", abHandler.Personal)
		r.Post("/api/ab/personal", abHandler.Personal)
		r.Post("/api/ab/shared/profiles", abHandler.SharedProfiles)
		r.Get("/api/ab/peers", abHandler.Peers)
		r.Post("/api/ab/peers", abHandler.Peers)
		r.Get("/api/ab/tags", abHandler.Tags)
		r.Post("/api/ab/tags", abHandler.Tags)
		r.Get("/api/ab/tags/{guid}", abHandler.Tags)
		r.Post("/api/ab/tags/{guid}", abHandler.Tags)
		r.Post("/api/ab/peer/add/{guid}", abHandler.AddPeer)
		r.Put("/api/ab/peer/update/{guid}", abHandler.UpdatePeer)
		r.Delete("/api/ab/peer/{guid}", abHandler.DeletePeers)
		r.Post("/api/ab/tag/add/{guid}", abHandler.AddTag)
		r.Put("/api/ab/tag/rename/{guid}", abHandler.RenameTag)
		r.Put("/api/ab/tag/update/{guid}", abHandler.UpdateTagColor)
		r.Delete("/api/ab/tag/{guid}", abHandler.DeleteTags)

		// Group / peer lookup compatibility
		r.Get("/api/device-group/accessible", abHandler.DeviceGroupsAccessible)
		r.Get("/api/users", abHandler.Users)
		r.Get("/api/peers", abHandler.AccessiblePeers)

		// Admin-only routes
		r.Group(func(r chi.Router) {
			r.Use(middleware.RequireAdmin)
			r.Get("/api/admin/online-peers", hbHandler.OnlinePeers)
		})
	})

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           r,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		log.Printf("eldesk-api listening on :%s", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()

	select {
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := srv.Shutdown(shutdownCtx); err != nil {
			log.Printf("graceful shutdown error: %v", err)
		}
	case err := <-errCh:
		log.Fatalf("server error: %v", err)
	}
}
