export class DebounceGate {
  private lastTriggeredAt = 0;
  private debounceMs: number;

  public constructor(debounceMs: number) {
    this.debounceMs = Math.max(0, debounceMs);
  }

  public updateDebounceMs(debounceMs: number): void {
    this.debounceMs = Math.max(0, debounceMs);
  }

  public canTrigger(now: number = Date.now()): boolean {
    if (this.debounceMs <= 0) {
      this.lastTriggeredAt = now;
      return true;
    }

    if (now - this.lastTriggeredAt < this.debounceMs) {
      return false;
    }

    this.lastTriggeredAt = now;
    return true;
  }
}
