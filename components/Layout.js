import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { supabase } from '../lib/supabaseClient';

const NAV = [
  { href: '/', label: 'داشبورد', key: '01' },
  { href: '/customers', label: 'مشتریان', key: '02' },
  { href: '/products', label: 'کالاها', key: '03' },
  { href: '/inventory', label: 'انبار', key: '04' },
  { href: '/invoices', label: 'فاکتورها', key: '05' },
  { href: '/payments', label: 'پرداخت‌ها', key: '06' },
  { href: '/reports', label: 'گزارش فروش', key: '07' },
  { href: '/settings', label: 'تنظیمات', key: '08' },
];

export default function Layout({ children, title }) {
  const router = useRouter();
  const [session, setSession] = useState(undefined);
  const [business, setBusiness] = useState(null);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('theme');
    const isDark = saved === 'dark';
    setDark(isDark);
    document.documentElement.classList.toggle('dark', isDark);
  }, []);

  function toggleDark() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (!s) router.replace('/login');
    });
    return () => listener.subscription.unsubscribe();
  }, [router]);

  useEffect(() => {
    if (!session) return;
    supabase
      .from('business_settings')
      .select('name, logo_url')
      .eq('id', 'default')
      .single()
      .then(({ data }) => setBusiness(data || null));
  }, [session]);

  useEffect(() => {
    if (session === null) router.replace('/login');
  }, [session, router]);

  if (session === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center text-ink/60 text-sm">
        در حال بارگذاری…
      </div>
    );
  }
  if (!session) return null;

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <aside className="md:w-60 shrink-0 bg-[#12182B] text-gray-200 flex md:flex-col justify-between">
        <div className="p-5">
          <div className="flex items-center gap-2">
            {business?.logo_url && (
              <img src={business.logo_url} alt="لوگو" className="w-8 h-8 rounded object-contain bg-surface" />
            )}
            <div className="font-bold text-lg tracking-tight">{business?.name || 'دفتر حساب'}</div>
          </div>
          <div className="text-xs text-gray-400 mt-1">حسابداری کسب‌وکار</div>
          <nav className="mt-8 flex md:flex-col gap-1">
            {NAV.map((item) => {
              const active = router.pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`focus-ring flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                    active ? 'bg-brass text-ink font-semibold' : 'text-gray-300 hover:bg-white/10'
                  }`}
                >
                  <span className="text-[10px] opacity-60 font-mono">{item.key}</span>
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="p-5 flex items-center gap-4">
          <button
            onClick={toggleDark}
            className="focus-ring text-xs text-gray-400 hover:text-white flex items-center gap-1"
          >
            {dark ? '☀️ حالت روشن' : '🌙 حالت تاریک'}
          </button>
          <button
            onClick={() => supabase.auth.signOut()}
            className="focus-ring text-xs text-gray-400 hover:text-white underline underline-offset-2"
          >
            خروج از حساب
          </button>
        </div>
      </aside>
      <main className="flex-1 p-6 md:p-10">
        {title && <h1 className="text-xl font-bold mb-6">{title}</h1>}
        {children}
      </main>
    </div>
  );
}
