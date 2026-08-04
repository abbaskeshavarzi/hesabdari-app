import { useState } from 'react';
import Layout from '../components/Layout';
import { formatJalaliShort } from '../lib/dateFormat';
import { supabase } from '../lib/supabaseClient';

function formatToman(n) {
  return new Intl.NumberFormat('fa-IR').format(Math.round(n || 0)) + ' تومان';
}

function firstOfMonth() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}
function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function ProfitLoss() {
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(today());
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  async function runReport(e) {
    e?.preventDefault();
    setLoading(true);
    const { data: invoices } = await supabase
      .from('invoices')
      .select('total_amount, issue_date')
      .gte('issue_date', from)
      .lte('issue_date', to);
    const { data: expenses } = await supabase
      .from('expenses')
      .select('category, amount, expense_date')
      .gte('expense_date', from)
      .lte('expense_date', to);

    const totalSales = (invoices || []).reduce((s, i) => s + Number(i.total_amount), 0);
    const totalExpenses = (expenses || []).reduce((s, e) => s + Number(e.amount), 0);

    const byCategory = {};
    (expenses || []).forEach((e) => {
      byCategory[e.category] = (byCategory[e.category] || 0) + Number(e.amount);
    });
    const categoryRows = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);

    setResult({
      totalSales,
      totalExpenses,
      net: totalSales - totalExpenses,
      categoryRows,
    });
    setLoading(false);
  }

  return (
    <Layout title="سود و زیان">
      <form onSubmit={runReport} className="bg-surface border border-line rounded-xl p-5 mb-6 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-ink/60 mb-1">از تاریخ</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="focus-ring rounded-md border border-line px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-ink/60 mb-1">تا تاریخ</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="focus-ring rounded-md border border-line px-3 py-2 text-sm" />
        </div>
        <button disabled={loading} className="focus-ring bg-brass hover:bg-brassDark text-white text-sm rounded-md px-4 py-2 font-semibold disabled:opacity-60">
          {loading ? 'در حال محاسبه…' : 'نمایش گزارش'}
        </button>
      </form>

      {result && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="bg-surface border border-line rounded-xl p-5">
              <div className="text-xs text-ink/50 mb-1">مجموع فروش</div>
              <div className="text-xl font-bold text-good">{formatToman(result.totalSales)}</div>
            </div>
            <div className="bg-surface border border-line rounded-xl p-5">
              <div className="text-xs text-ink/50 mb-1">مجموع هزینه‌ها</div>
              <div className="text-xl font-bold text-bad">{formatToman(result.totalExpenses)}</div>
            </div>
            <div className={`rounded-xl p-5 ${result.net >= 0 ? 'bg-good' : 'bg-bad'} text-white`}>
              <div className="text-xs opacity-80 mb-1">{result.net >= 0 ? 'سود خالص' : 'زیان خالص'}</div>
              <div className="text-xl font-bold">{formatToman(Math.abs(result.net))}</div>
            </div>
          </div>

          <div className="bg-surface border border-line rounded-xl overflow-x-auto">
            <table className="ledger">
              <thead>
                <tr>
                  <th>دسته هزینه</th>
                  <th>مبلغ</th>
                  <th>سهم از کل هزینه‌ها</th>
                </tr>
              </thead>
              <tbody>
                {result.categoryRows.length === 0 ? (
                  <tr><td colSpan={3} className="text-center text-ink/40 py-6">هزینه‌ای در این بازه ثبت نشده است.</td></tr>
                ) : (
                  result.categoryRows.map(([cat, amount]) => (
                    <tr key={cat}>
                      <td className="font-medium">{cat}</td>
                      <td>{formatToman(amount)}</td>
                      <td>{result.totalExpenses > 0 ? Math.round((amount / result.totalExpenses) * 100) : 0}٪</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Layout>
  );
}
