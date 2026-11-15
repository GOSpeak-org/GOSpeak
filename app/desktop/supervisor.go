package main

import "time"

const (
	maxRestarts    = 3
	restartWindow  = 10 * time.Minute
	probeFailLimit = 2
	probeInterval  = 15 * time.Second
)

type component int

const (
	componentPage component = iota
	componentProxy
)

type supervisorEventKind int

const (
	eventPageRenderGone supervisorEventKind = iota
	eventPageLoadFailed
	eventProxyProbeFailed
	eventProxyProbeOK
	eventProxyRestarted
)

type supervisorEvent struct {
	kind    supervisorEventKind
	reason  string
	detail  string
	oldPort int
	newPort int
}

type supervisorAction struct {
	Wait         time.Duration
	RestartProxy bool
	ReloadPage   bool
	Report       bool
	Notify       string
	ReportReason string
	ReportDetail string
}

type supervision struct {
	attempts   map[component][]time.Time
	probeFails int
}

func newSupervision() *supervision {
	return &supervision{attempts: map[component][]time.Time{}}
}

var restartBackoff = []time.Duration{500 * time.Millisecond, time.Second, 2 * time.Second}

func (s *supervision) decide(ev supervisorEvent, now time.Time) supervisorAction {
	switch ev.kind {
	case eventProxyProbeOK:
		s.probeFails = 0
		delete(s.attempts, componentProxy)
		return supervisorAction{}
	case eventProxyProbeFailed:
		s.probeFails++
		if s.probeFails < probeFailLimit {
			return supervisorAction{}
		}
		s.probeFails = 0
		return s.restart(componentProxy, ev, now)
	case eventProxyRestarted:
		delete(s.attempts, componentProxy)
		act := supervisorAction{ReloadPage: true}
		if ev.oldPort != ev.newPort {
			act.Notify = "本地代理端口已变更，页面已重新加载，需要重新登录。"
		}
		return act
	case eventPageRenderGone, eventPageLoadFailed:
		return s.restart(componentPage, ev, now)
	default:
		return supervisorAction{}
	}
}

func (s *supervision) restart(comp component, ev supervisorEvent, now time.Time) supervisorAction {
	kept := s.attempts[comp][:0]
	for _, at := range s.attempts[comp] {
		if now.Sub(at) <= restartWindow {
			kept = append(kept, at)
		}
	}
	s.attempts[comp] = kept

	if len(kept) >= maxRestarts {
		detail := ev.detail
		if detail == "" {
			detail = ev.reason
		}
		if detail == "" {
			detail = "no detail"
		}
		return supervisorAction{
			Report:       true,
			ReportReason: "页面或本地代理反复失效，已自动重启 3 次仍未恢复。",
			ReportDetail: detail,
		}
	}

	act := supervisorAction{Wait: restartBackoff[len(kept)]}
	s.attempts[comp] = append(s.attempts[comp], now)
	if comp == componentProxy {
		act.RestartProxy = true
	} else {
		act.ReloadPage = true
	}
	return act
}