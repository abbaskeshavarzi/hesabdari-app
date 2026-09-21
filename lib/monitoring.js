const SENSITIVE_KEY = /password|passwd|token|secret|service[_-]?role|authorization|cookie|api[_-]?key|database|connection[_-]?string/i;

function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function sanitize(value, depth = 0) {
  if (depth > 3) return '[truncated]';
  if (value == null) return value;
  if (typeof value === 'string') return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => sanitize(v, depth + 1));

  const out = {};
  for (const [key, val] of Object.entries(value)) {
    if (SENSITIVE_KEY.test(key)) {
      out[key] = '[redacted]';
    } else {
      out[key] = sanitize(val, depth + 1);
    }
  }
  return out;
}

function endpointPath(url) {
  try {
    return new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost').pathname;
  } catch {
    return '[unknown]';
  }
}

export function classifySupabaseRequest(url) {
  const path = endpointPath(url);
  if (path.includes('/auth/v1/')) return 'authentication';
  if (path.includes('/rest/v1/rpc/')) return 'rpc';
  if (path.includes('/rest/v1/')) return 'database';
  return 'api';
}

export function reportMonitoringEvent(level, event, details = {}) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    event,
    request_id: details.request_id || newId(),
    route: typeof window !== 'undefined' ? window.location.pathname : undefined,
    ...sanitize(details),
  };

  // Structured local logging is intentionally limited to metadata.
  if (typeof console !== 'undefined') {
    const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info';
    console[method]('[monitoring]', payload);
  }

  const endpoint = process.env.NEXT_PUBLIC_MONITORING_ENDPOINT;
  if (!endpoint || typeof navigator === 'undefined' || !navigator.sendBeacon) return;

  try {
    const body = JSON.stringify(payload);
    navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }));
  } catch {
    // Monitoring must never break the accounting application.
  }
}

export function reportException(error, context = {}) {
  const safeError = error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack?.split('\n').slice(0, 12).join('\n') }
    : { message: String(error) };

  reportMonitoringEvent('error', 'application_exception', {
    ...context,
    error: safeError,
  });
}

export function reportSupabaseHttpFailure({ url, method, status, durationMs }) {
  const category = classifySupabaseRequest(url);
  reportMonitoringEvent('error', 'supabase_request_failure', {
    category,
    method: method || 'GET',
    status,
    duration_ms: Math.round(durationMs),
    path: endpointPath(url),
    critical: category === 'rpc' || category === 'database' || category === 'authentication',
  });
}
