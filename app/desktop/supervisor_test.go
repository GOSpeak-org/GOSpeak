package main

import (
	"testing"
	"time"
)

func TestDecideRestartsWithinBudget(t *testing.T) {
	s := newSupervision()
	now := time.Unix(1000, 0)

	first := s.decide(supervisorEvent{kind: eventPageRenderGone, reason: "renderer gone"}, now)
	if !first.ReloadPage || first.Wait != 500*time.Millisecond || first.Report {
		t.Fatalf("first: %+v", first)
	}
	second := s.decide(supervisorEvent{kind: eventPageRenderGone}, now.Add(time.Second))
	if second.Wait != time.Second {
		t.Fatalf("second backoff = %v, want 1s", second.Wait)
	}
	third := s.decide(supervisorEvent{kind: eventPageRenderGone}, now.Add(2*time.Second))
	if third.Wait != 2*time.Second {
		t.Fatalf("third backoff = %v, want 2s", third.Wait)
	}
	fourth := s.decide(supervisorEvent{kind: eventPageRenderGone}, now.Add(3*time.Second))
	if !fourth.Report || fourth.ReloadPage {
		t.Fatalf("fourth must report instead of reloading: %+v", fourth)
	}
}

func TestDecideBudgetExpiresAfterWindow(t *testing.T) {
	s := newSupervision()
	now := time.Unix(2000, 0)
	for i := 0; i < maxRestarts; i++ {
		s.decide(supervisorEvent{kind: eventPageLoadFailed}, now.Add(time.Duration(i)*time.Second))
	}
	act := s.decide(supervisorEvent{kind: eventPageLoadFailed}, now.Add(restartWindow+time.Minute))
	if act.Report || act.Wait == 0 {
		t.Fatalf("after the window the budget must reset: %+v", act)
	}
}

func TestDecideProxyProbeNeedsTwoFailures(t *testing.T) {
	s := newSupervision()
	now := time.Unix(3000, 0)

	if act := s.decide(supervisorEvent{kind: eventProxyProbeFailed}, now); act.RestartProxy {
		t.Fatalf("one probe failure must not restart: %+v", act)
	}
	act := s.decide(supervisorEvent{kind: eventProxyProbeFailed}, now.Add(probeInterval))
	if !act.RestartProxy {
		t.Fatalf("second consecutive failure must restart: %+v", act)
	}
	s.decide(supervisorEvent{kind: eventProxyProbeOK}, now.Add(2*probeInterval))
	if act := s.decide(supervisorEvent{kind: eventProxyProbeFailed}, now.Add(3*probeInterval)); act.RestartProxy {
		t.Fatalf("a healthy probe must reset the failure streak: %+v", act)
	}
}

func TestDecidePortChangeNotifiesAndReloads(t *testing.T) {
	s := newSupervision()
	now := time.Unix(4000, 0)
	act := s.decide(supervisorEvent{kind: eventProxyRestarted, oldPort: 47000, newPort: 47001}, now)
	if !act.ReloadPage || act.Notify == "" {
		t.Fatalf("port change must notify and reload: %+v", act)
	}
	act = s.decide(supervisorEvent{kind: eventProxyRestarted, oldPort: 47000, newPort: 47000}, now)
	if !act.ReloadPage || act.Notify != "" {
		t.Fatalf("same port must only reload: %+v", act)
	}
}