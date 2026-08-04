import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { formatJalaliShort } from '../lib/dateFormat';
import { supabase } from '../lib/supabaseClient';

function formatToman(n) {
  return new Intl.NumberFormat('fa-IR').format(Math.round(n || 0)) + ' تومان';
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data: balances } = await supabase.from('customer_balances').select('*');
    const { data: invoices } = await supabase
      .from('invoices')
      .select('total_amount, issue_date')
      .order('issue_date', { ascending: false });

    const totalCustomers = balances?.length || 0;
    const totalOwed = (balances || []).reduce((s, b) => s + (b.balance > 0 ? b.balance : 0), 0);
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    const monthSales = (invoices || [])
      .filter((i) => new Date(i.issue_date) >= startOfMonth)
      .reduce((s, i) => s + Number(i.total_amount), 0);

    const now = new Date();
    const buckets = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const next = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const total = (invoices || [])
        .filter((inv) => {
          const dt = new Date(inv.issue_date);
          return dt >= d && dt < next;
        })
        .reduce((s, inv) => s + Number(inv.total_amount), 0);
      buckets.push({
        label: d.toLocaleDateString('fa-IR', { month: 'long' }),
        total,
      });
    }

    setStats({
      totalCustomers,
      totalOwed,
      monthSales,
      recentInvoices: (invoices || []).slice(0, 5),
      monthlyChart: buckets,
    });
  }

  return (
    <Layout title="داشبورد">
      {!stats ? (
        <p className="text-ink/50 text-sm">در حال بارگذاری…</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-surface rounded-xl border border-line p-5">
            <div className="text-xs text-ink/50 mb-1">تعداد مشتریان</div>
            <div className="text-2xl font-bold">{stats.totalCustomers}</div>
          </div>
          <div className="bg-surface rounded-xl border border-line p-5">
            <div className="text-xs text-ink/50 mb-1">مطالبات باز</div>
            <div className="text-2xl font-bold text-bad">{formatToman(stats.totalOwed)}</div>
          </div>
          <div className="bg-surface rounded-xl border border-line p-5">
            <div className="text-xs text-ink/50 mb-1">فروش این ماه</div>
            <div className="text-2xl font-bold text-good">{formatToman(stats.monthSales)}</div>
          </div>
          <div className="sm:col-span-3 bg-surface rounded-xl border border-line p-5">
            <div className="text-sm font-semibold mb-4">روند فروش (۶ ماه اخیر)</div>
            {(() => {
              const max = Math.max(1, ...stats.monthlyChart.map((b) => b.total));
              return (
                <div className="flex items-end justify-between gap-2 h-40">
                  {stats.monthlyChart.map((b, idx) => (
                    <div key={idx} className="flex-1 flex flex-col items-center gap-2">
                      <div className="text-[10px] text-ink/50 whitespace-nowrap">
                        {b.total > 0 ? new Intl.NumberFormat('fa-IR', { notation: 'compact' }).format(b.total) : ''}
                      </div>
                      <div
                        className="w-full bg-brass rounded-t-md"
                        style={{ height: (b.total / max) * 100 + '%', minHeight: b.total > 0 ? '4px' : '0' }}
                      />
                      <div className="text-[10px] text-ink/50">{b.label}</div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>

          <div className="sm:col-span-3 bg-surface rounded-xl border border-line p-5">
            <div className="text-sm font-semibold mb-3">آخرین فاکتورها</div>
            {stats.recentInvoices.length === 0 ? (
              <p className="text-xs text-ink/40">هنوز فاکتوری ثبت نشده است.</p>
            ) : (
              <ul className="text-sm divide-y divide-line">
                {stats.recentInvoices.map((inv, idx) => (
                  <li key={idx} className="py-2 flex justify-between">
                    <span>{formatJalaliShort(inv.issue_date)}</span>
                    <span className="font-medium">{formatToman(inv.total_amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
}
