package server

import (
	"context"
	"net/http"
	"os"
	ossignal "os/signal"
	"syscall"
	"time"

	"GOSpeak/internal/audit"
	"GOSpeak/internal/authstate"
	"GOSpeak/internal/logger"
	"GOSpeak/internal/signal"
	"GOSpeak/internal/ws"
)

type shutdownDeps struct {
	srv                   *http.Server
	signalHub             *signal.Hub
	wsUpgrader            *ws.Upgrader
	auditSvc              *audit.Service
	closeEventBus         func()
	stopMuteExpiryScanner func()
}

func runGracefulShutdown(deps shutdownDeps) {
	quit := make(chan os.Signal, 1)
	ossignal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	logger.WithComponent("Server").Info("shutting down...")

	// 1) stop accepting HTTP first so in-flight handlers can still emit signal
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := deps.srv.Shutdown(ctx); err != nil {
		logger.WithComponent("HTTP").Errorf("shutdown error: %v", err)
	}

	// 2) 停掉定时扫描器，避免关闭过程中继续广播/调 SFU
	if deps.stopMuteExpiryScanner != nil {
		deps.stopMuteExpiryScanner()
		logger.WithComponent("MuteExpiry").Info("mute expiry scanner stopped")
	}

	// 3) stop membership heartbeat, then close websocket connections
	deps.signalHub.StopEmptyRoomReconciler()
	deps.signalHub.StopMembershipHeartbeat()
	if deps.wsUpgrader != nil && deps.wsUpgrader.Fanout() != nil {
		deps.wsUpgrader.Fanout().CloseAll()
		logger.WithComponent("WS").Info("websocket connections closed")
	}

	// 4) close event bus last
	authstate.StopKeyRotationLoop()
	logger.WithComponent("EventBus").Info("closing event bus")
	deps.closeEventBus()
	logger.WithComponent("EventBus").Info("closed")

	// 5) 最后排空审计队列，确保已入队记录落库
	if deps.auditSvc != nil {
		deps.auditSvc.Stop()
		logger.WithComponent("Audit").Info("audit queue drained")
	}
}
