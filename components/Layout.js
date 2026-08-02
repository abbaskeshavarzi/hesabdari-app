import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { supabase } from '../lib/supabaseClient';

const NAV = [
  { href: '/', label: 'داشبورد', key: '01' },
  { href: '/customers', label: 'مشتریان', key: '02' },
  { href: '/invoices', label: 'فاکتورها', key: '03' },
  { href: '/payments', label: 'پرداخت‌ها', key: '04' },
  { href: '/reports', label: 'گزارش فروش', key: '05' },
];

export default function Layout({ children, title }) {
  const router = useRouter();
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (!s) router.replace('/login');
    });
    return () => listener.subscription.unsubscribe();
  }, [router]);

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
      <aside className="md:w-60 shrink-0 bg-ink text-paper flex md:flex-col justify-between">
        <div className="p-5">
          <div className="font-bold text-lg tracking-tight">دفتر حساب</div>
          <div className="text-xs text-paper/50 mt-1">حسابداری کسب‌وکار</div>
          <nav className="mt-8 flex md:flex-col gap-1">
            {NAV.map((item) => {
              const active = router.pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`focus-ring flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                    active ? 'bg-brass text-ink font-semibold' : 'text-paper/80 hover:bg-white/10'
                  }`}
                >
                  <span className="text-[10px] opacity-60 font-mono">{item.key}</span>
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="p-5">
          <button
            onClick={() => supabase.auth.signOut()}
            className="focus-ring text-xs text-paper/60 hover:text-paper underline underline-offset-2"
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
