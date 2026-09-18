import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import '../styles/globals.css';
import { supabase } from '../lib/supabaseClient';

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
      navigator.serviceWorker.register(`${basePath}/sw.js`).catch(() => {});
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    let timer;

    async function checkSession() {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setAuthReady(true);
      const isPublic = PUBLIC_ROUTES.includes(router.pathname);
      if (!data.session && !isPublic) router.replace('/login');
      if (data.session && router.pathname === '/login') router.replace('/');
    }

    checkSession();

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
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

  return <Component {...pageProps} />;
}
