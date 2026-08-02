import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
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

    setStats({
      totalCustomers,
      totalOwed,
      monthSales,
      recentInvoices: (invoices || []).slice(0, 5),
    });
  }

  return (
    <Layout title="داشبورد">
      {!stats ? (
        <p className="text-ink/50 text-sm">در حال بارگذاری…</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-line p-5">
            <div className="text-xs text-ink/50 mb-1">تعداد مشتریان</div>
            <div className="text-2xl font-bold">{stats.totalCustomers}</div>
          </div>
          <div className="bg-white rounded-xl border border-line p-5">
            <div className="text-xs text-ink/50 mb-1">مطالبات باز</div>
            <div className="text-2xl font-bold text-bad">{formatToman(stats.totalOwed)}</div>
          </div>
          <div className="bg-white rounded-xl border border-line p-5">
            <div className="text-xs text-ink/50 mb-1">فروش این ماه</div>
            <div className="text-2xl font-bold text-good">{formatToman(stats.monthSales)}</div>
          </div>
          <div className="sm:col-span-3 bg-white rounded-xl border border-line p-5">
            <div className="text-sm font-semibold mb-3">آخرین فاکتورها</div>
            {stats.recentInvoices.length === 0 ? (
              <p className="text-xs text-ink/40">هنوز فاکتوری ثبت نشده است.</p>
            ) : (
              <ul className="text-sm divide-y divide-line">
                {stats.recentInvoices.map((inv, idx) => (
                  <li key={idx} className="py-2 flex justify-between">
                    <span>{inv.issue_date}</span>
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
