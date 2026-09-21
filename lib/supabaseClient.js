import { createClient } from '@supabase/supabase-js';
import { reportMonitoringEvent, reportSupabaseHttpFailure } from './monitoring';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function monitoredFetch(input, init = {}) {
  const started = performance.now();
  const url = typeof input === 'string' ? input : input?.url || '';
  const method = init.method || (typeof input !== 'string' ? input?.method : undefined) || 'GET';

  try {
    const response = await fetch(input, init);
    if (!response.ok) {
      reportSupabaseHttpFailure({
        url,
        method,
        status: response.status,
        durationMs: performance.now() - started,
      });
    }
    return response;
  } catch (error) {
    reportMonitoringEvent('error', 'supabase_network_failure', {
      category: 'network',
      method,
      path: (() => {
        try { return new URL(url, window.location.origin).pathname; } catch { return '[unknown]'; }
      })(),
      duration_ms: Math.round(performance.now() - started),
      error: { name: error?.name, message: error?.message },
      critical: true,
    });
    throw error;
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: monitoredFetch,
  },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
