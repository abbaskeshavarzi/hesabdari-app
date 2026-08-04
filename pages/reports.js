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

export default function Reports() {
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(today());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  async function runReport(e) {
    e?.preventDefault();
    setLoading(true);
    const { data } = await supabase
      .from('invoices')
      .select('id, issue_date, total_amount, customers(name)')
      .gte('issue_date', from)
      .lte('issue_date', to)
      .order('issue_date');
    setRows(data || []);
    setLoading(false);
    setSearched(true);
  }

  const total = rows.reduce((s, r) => s + Number(r.total_amount), 0);

  return (
    <Layout title="گزارش فروش دوره‌ای">
      <form onSubmit={runReport} className="bg-surface border border-line rounded-xl p-5 mb-6 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-ink/60 mb-1">از تاریخ</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="focus-ring rounded-md border border-line px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-ink/60 mb-1">تا تاریخ</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="focus-ring rounded-md border border-line px-3 py-2 text-sm" />
        </div>
        <button className="focus-ring bg-brass hover:bg-brassDark text-white text-sm rounded-md px-4 py-2 font-semibold">
          نمایش گزارش
        </button>
      </form>

      {searched && (
        <>
          <div className="bg-ink text-paper rounded-xl p-5 mb-6 flex justify-between items-center">
            <span className="text-sm">مجموع فروش در این بازه</span>
            <span className="text-xl font-bold">{formatToman(total)}</span>
          </div>
          <div className="bg-surface border border-line rounded-xl overflow-x-auto">
            <table className="ledger">
              <thead>
                <tr>
                  <th>تاریخ</th>
                  <th>مشتری</th>
                  <th>مبلغ</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={3} className="text-center text-ink/40 py-6">در حال بارگذاری…</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={3} className="text-center text-ink/40 py-6">فاکتوری در این بازه یافت نشد.</td></tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id}>
                      <td>{formatJalaliShort(r.issue_date)}</td>
                      <td>{r.customers?.name || '—'}</td>
                      <td>{formatToman(r.total_amount)}</td>
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
