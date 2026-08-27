import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  trackRegisterAttempt,
  registerMetricsSnapshot,
  resetRegisterMetrics,
  subscribeRegisterMetrics,
  logRegisterMetricsSummary,
  SLOW_CHALLENGE_MS,
} from "../registerMetrics";

describe("Métriques REGISTER TLS", () => {
  beforeEach(() => {
    resetRegisterMetrics();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("mesure la latence et compte les 407", () => {
    const t = trackRegisterAttempt("TLS");
    t.challenge(407);
    t.success();
    const s = registerMetricsSnapshot();
    expect(s.total).toBe(1);
    expect(s.ok).toBe(1);
    expect(s.challenge407).toBe(1);
    expect(s.successRate).toBe(100);
    expect(s.lastSample?.outcome).toBe("ok");
    expect(s.lastSample?.challengeMs).not.toBeNull();
  });

  it("classe PJSIP_EBUSY, watchdog et erreurs génériques", () => {
    trackRegisterAttempt().failure(new Error("PJSIP_EBUSY"));
    trackRegisterAttempt().failure(new Error("watchdog"));
    trackRegisterAttempt().failure("connection reset");
    const s = registerMetricsSnapshot();
    expect(s.ebusy).toBe(1);
    expect(s.watchdog).toBe(1);
    expect(s.errors).toBe(1);
    expect(s.failures).toBe(3);
    expect(s.successRate).toBe(0);
  });

  it("marque un 407 tardif (>10 s) comme challenge lent", () => {
    let clock = 0;
    const spy = vi.spyOn(performance, "now").mockImplementation(() => clock);
    const t = trackRegisterAttempt();
    clock = SLOW_CHALLENGE_MS + 3_500; // 407 à 13,5 s (cellulaire)
    t.challenge();
    clock += 400;
    t.success();
    const s = registerMetricsSnapshot();
    expect(s.slowChallenges).toBe(1);
    expect(s.challengeLatency.max).toBe(13_500);
    expect(s.latency.max).toBe(13_900);
    expect(console.warn).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("ne compte jamais deux fois la même tentative", () => {
    const t = trackRegisterAttempt();
    t.success();
    t.success();
    t.failure(new Error("PJSIP_EBUSY"));
    expect(registerMetricsSnapshot().total).toBe(1);
  });

  it("calcule p50/p95 et notifie les abonnés", () => {
    const seen: number[] = [];
    const off = subscribeRegisterMetrics((s) => seen.push(s.total));
    let clock = 0;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    for (const d of [100, 200, 300, 400, 5000]) {
      const t = trackRegisterAttempt();
      clock += d;
      t.success();
    }
    const s = registerMetricsSnapshot();
    expect(s.total).toBe(5);
    expect(s.latency.p50).toBeGreaterThan(0);
    expect(s.latency.p95).toBe(5000);
    expect(seen[seen.length - 1]).toBe(5);
    off();
    logRegisterMetricsSummary("test");
    expect(registerMetricsSnapshot().total).toBe(5);
  });
});
