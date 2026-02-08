type DbMetricsSnapshot = {
  totalChecks: number;
  totalErrors: number;
  lastLatencyMs: number | null;
  avgLatencyMs: number | null;
  lastError: string | null;
  lastErrorAt: string | null;
};

class DbMetrics {
  private totalChecks = 0;
  private totalErrors = 0;
  private totalLatencyMs = 0;
  private lastLatencyMs: number | null = null;
  private lastError: string | null = null;
  private lastErrorAt: string | null = null;

  recordLatency(ms: number): void {
    this.totalChecks += 1;
    this.totalLatencyMs += ms;
    this.lastLatencyMs = ms;
  }

  recordError(message: string): void {
    this.totalErrors += 1;
    this.lastError = message;
    this.lastErrorAt = new Date().toISOString();
  }

  snapshot(): DbMetricsSnapshot {
    const avgLatencyMs = this.totalChecks > 0 ? Math.round(this.totalLatencyMs / this.totalChecks) : null;
    return {
      totalChecks: this.totalChecks,
      totalErrors: this.totalErrors,
      lastLatencyMs: this.lastLatencyMs,
      avgLatencyMs,
      lastError: this.lastError,
      lastErrorAt: this.lastErrorAt,
    };
  }
}

export const dbMetrics = new DbMetrics();
