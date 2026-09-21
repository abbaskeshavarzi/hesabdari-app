import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import '../styles/globals.css';
import { supabase } from '../lib/supabaseClient';
import ErrorBoundary from '../components/ErrorBoundary';
import { reportException, reportMonitoringEvent } from '../lib/monitoring';

const PUBLIC_ROUTES = ['/login', '/register', '/forgot-password', '/reset-password'];

export default function App({ Component, pageProps }) {
  const router = useRouter();
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('theme');
    document.documentElement.classList.toggle('dark', saved === 'dark');
  }, []);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
      navigator.serviceWorker.register(`${basePath}/sw.js`).catch((error) => {
        reportException(error, { source: 'service_worker_registration' });
      });
    }
  }, []);

  useEffect(() => {
    const onError = (event) => {
      reportException(event.error || new Error(event.message || 'Unhandled window error'), {
        source: 'window_error',
      });
    };
    const onUnhandledRejection = (event) => {
      reportException(event.reason || new Error('Unhandled promise rejection'), {
        source: 'unhandled_rejection',
      });
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    let timer;

    async function checkSession() {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          reportMonitoringEvent('error', 'authentication_session_check_failed', {
            source: 'auth_session_check',
            error: { name: error.name, code: error.code, message: error.message },
            critical: true,
          });
        }
        if (!mounted) return;
        setAuthReady(true);
        const isPublic = PUBLIC_ROUTES.includes(router.pathname);
        if (!data.session && !isPublic) router.replace('/login');
        if (data.session && router.pathname === '/login') router.replace('/');
      } catch (error) {
        reportException(error, { source: 'auth_session_check' });
        if (mounted) setAuthReady(true);
      }
    }

    checkSession();

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
        reportMonitoringEvent('info', 'authentication_state_change', {
          auth_event: event,
          has_session: Boolean(session),
        });
      }
      clearTimeout(timer);
      timer = setTimeout(() => {
        const isPublic = PUBLIC_ROUTES.includes(router.pathname);
        if (!session && !isPublic) router.replace('/login');
        if (session && router.pathname === '/login') router.replace('/');
      }, 0);
    });

    return () => {
      mounted = false;
      clearTimeout(timer);
      listener.subscription.unsubscribe();
    };
  }, [router]);

  if (!authReady && !PUBLIC_ROUTES.includes(router.pathname)) {
    return <div className="min-h-screen flex items-center justify-center text-ink/60 text-sm">در حال بررسی نشست…</div>;
  }

  return (
    <ErrorBoundary>
      <Component {...pageProps} />
    </ErrorBoundary>
  );
}
