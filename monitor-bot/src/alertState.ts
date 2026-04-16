type ServiceStatus = 'ok' | 'down';

interface AlertEntry {
  lastStatus: ServiceStatus;
  lastAlertAt: number;
}

const state = new Map<string, AlertEntry>();

/**
 * Returns true if an alert should be sent for this key.
 * Alerts fire when:
 *   - status changes (ok→down or down→ok)
 *   - still down AND cooldown has elapsed (reminder)
 */
export function shouldAlert(key: string, isDown: boolean, cooldownMs: number): boolean {
  const now = Date.now();
  const current: ServiceStatus = isDown ? 'down' : 'ok';
  const entry = state.get(key);

  if (!entry) {
    // First check
    state.set(key, { lastStatus: current, lastAlertAt: isDown ? now : 0 });
    return isDown;
  }

  const statusChanged = entry.lastStatus !== current;
  if (statusChanged) {
    state.set(key, { lastStatus: current, lastAlertAt: now });
    return true;
  }

  // Same status — only re-alert if still down and cooldown passed
  if (isDown && now - entry.lastAlertAt > cooldownMs) {
    state.set(key, { ...entry, lastAlertAt: now });
    return true;
  }

  return false;
}

export function getStatus(key: string): ServiceStatus | 'unknown' {
  return state.get(key)?.lastStatus ?? 'unknown';
}
