import { isTransientDbError } from './db-errors';
import { logger } from './logger';

type CircuitState = 'closed' | 'open' | 'half-open';

type CircuitConfig = {
  failureThreshold: number;
  openDurationMs: number;
};

type CircuitEvents = {
  onOpen?: () => void;
  onHalfOpen?: () => void;
  onClose?: () => void;
};

class DbCircuitBreaker {
  private state: CircuitState = 'closed';
  private failures = 0;
  private openUntil = 0;
  private readonly config: CircuitConfig;
  private halfOpenProbeInFlight = false;
  private readonly events: CircuitEvents;

  constructor(config: CircuitConfig, events: CircuitEvents = {}) {
    this.config = config;
    this.events = events;
  }

  canPass(): boolean {
    if (this.state === 'closed') {
      return true;
    }

    const now = Date.now();
    if (this.state === 'open') {
      if (now >= this.openUntil) {
        this.state = 'half-open';
        this.halfOpenProbeInFlight = false;
        this.events.onHalfOpen?.();
      } else {
        return false;
      }
    }

    if (this.state === 'half-open') {
      if (this.halfOpenProbeInFlight) {
        return false;
      }
      this.halfOpenProbeInFlight = true;
      return true;
    }

    return true;
  }

  recordSuccess(): void {
    const wasClosed = this.state === 'closed';
    this.failures = 0;
    this.state = 'closed';
    this.halfOpenProbeInFlight = false;
    if (!wasClosed) {
      this.events.onClose?.();
    }
  }

  recordFailure(err?: unknown): void {
    if (err && !isTransientDbError(err)) {
      return;
    }

    this.failures += 1;
    if (this.state === 'half-open') {
      this.trip();
      return;
    }

    if (this.failures >= this.config.failureThreshold) {
      this.trip();
    }
  }

  isOpen(): boolean {
    if (this.state !== 'open') {
      return false;
    }
    if (Date.now() >= this.openUntil) {
      this.state = 'half-open';
      this.halfOpenProbeInFlight = false;
      this.events.onHalfOpen?.();
      return false;
    }
    return true;
  }

  private trip(): void {
    this.state = 'open';
    this.openUntil = Date.now() + this.config.openDurationMs;
    this.halfOpenProbeInFlight = false;
    this.events.onOpen?.();
  }
}

export const dbCircuit = new DbCircuitBreaker(
  {
    failureThreshold: Number(process.env.DB_CIRCUIT_FAILURE_THRESHOLD ?? 5),
    openDurationMs: Number(process.env.DB_CIRCUIT_OPEN_MS ?? 30000),
  },
  {
    onOpen: () => {
      logger.warn('DB circuit breaker opened');
    },
    onHalfOpen: () => {
      logger.info('DB circuit breaker half-open');
    },
    onClose: () => {
      logger.info('DB circuit breaker closed');
    },
  }
);

export default dbCircuit;
