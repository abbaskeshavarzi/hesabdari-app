import { useState } from 'react';
import Layout from '../components/Layout';
import JalaliDatePicker from '../components/JalaliDatePicker';
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

export default function BestPerformers() {
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(today());
  const [loading, setLoading] = useState(false);
  const [topProducts, setTopProducts] = useState(null);
  const [topCustomers, setTopCustomers] = useState(null);

  async function runReport(e) {
    e?.preventDefault();
    setLoading(true);

    const { data: invoicesInRange } = await supabase
      .from('invoices')
      .select('id, customer_id, total_amount, customers(name)')
      .gte('issue_date', from)
      .lte('issue_date', to);

    const invoiceIds = (invoicesInRange || []).map((i) => i.id);

    let items = [];
    if (invoiceIds.length > 0) {
      const { data } = await supabase
        .from('invoice_items')
        .select('product_name, quantity, unit_price, invoice_id')
        .in('invoice_id', invoiceIds);
      items = data || [];
    }

    const productMap = {};
    items.forEach((it) => {
      const key = it.product_name || 'نامشخص';
      if (!productMap[key]) productMap[key] = { name: key, qty: 0, revenue: 0 };
      productMap[key].qty += Number(it.quantity);
      productMap[key].revenue += Number(it.quantity) * Number(it.unit_price);
    });
    const productsSorted = Object.values(productMap).sort((a, b) => b.revenue - a.revenue).slice(0, 10);

    const customerMap = {};
    (invoicesInRange || []).forEach((inv) => {
      const key = inv.customer_id;
      const name = inv.customers ? inv.customers.name : 'نامشخص';
      if (!customerMap[key]) customerMap[key] = { name, revenue: 0, count: 0 };
      customerMap[key].revenue += Number(inv.total_amount);
      customerMap[key].count += 1;
    });
    const customersSorted = Object.values(customerMap).sort((a, b) => b.revenue - a.revenue).slice(0, 10);

    setTopProducts(productsSorted);
    setTopCustomers(customersSorted);
    setLoading(false);
  }

  return (
    <Layout title="پرفروش‌ترین‌ها">
      <form onSubmit={runReport} className="bg-surface border border-line rounded-xl p-5 mb-6 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-ink/60 mb-1">از تاریخ</label>
          <JalaliDatePicker value={from} onChange={setFrom} />
        </div>
        <div>
          <label className="block text-xs text-ink/60 mb-1">تا تاریخ</label>
          <JalaliDatePicker value={to} onChange={setTo} />
        </div>
        <button disabled={loading} className="focus-ring bg-brass hover:bg-brassDark text-white text-sm rounded-md px-4 py-2 font-semibold disabled:opacity-60">
          {loading ? 'در حال محاسبه…' : 'نمایش گزارش'}
        </button>
      </form>

      {topProducts && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <div className="text-sm font-semibold mb-2">پرفروش‌ترین کالاها</div>
            <div className="bg-surface border border-line rounded-xl overflow-x-auto">
              <table className="ledger">
                <thead>
                  <tr>
                    <th>رتبه</th>
                    <th>کالا</th>
                    <th>تعداد فروش</th>
                    <th>مبلغ فروش</th>
                  </tr>
                </thead>
                <tbody>
                  {topProducts.length === 0 ? (
                    <tr><td colSpan={4} className="text-center text-ink/40 py-6">داده‌ای در این بازه یافت نشد.</td></tr>
                  ) : (
                    topProducts.map((p, idx) => (
                      <tr key={p.name}>
                        <td>{idx + 1}</td>
                        <td className="font-medium">{p.name}</td>
                        <td>{p.qty}</td>
                        <td>{formatToman(p.revenue)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <div className="text-sm font-semibold mb-2">بهترین مشتریان</div>
            <div className="bg-surface border border-line rounded-xl overflow-x-auto">
              <table className="ledger">
                <thead>
                  <tr>
                    <th>رتبه</th>
                    <th>مشتری</th>
                    <th>تعداد فاکتور</th>
                    <th>مبلغ خرید</th>
                  </tr>
                </thead>
                <tbody>
                  {topCustomers.length === 0 ? (
                    <tr><td colSpan={4} className="text-center text-ink/40 py-6">داده‌ای در این بازه یافت نشد.</td></tr>
                  ) : (
                    topCustomers.map((c, idx) => (
                      <tr key={c.name + idx}>
                        <td>{idx + 1}</td>
                        <td className="font-medium">{c.name}</td>
                        <td>{c.count}</td>
                        <td>{formatToman(c.revenue)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
