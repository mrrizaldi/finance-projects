const KEY = 'recovery';

export function markRecovery() {
  try {
    sessionStorage.setItem(KEY, '1');
  } catch {}
}

export function isRecovery() {
  try {
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function clearRecovery() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {}
}
