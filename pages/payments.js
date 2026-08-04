import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import MoneyInput from '../components/MoneyInput';
import { formatJalaliShort } from '../lib/dateFormat';
import { supabase } from '../lib/supabaseClient';

function formatToman(n) {
  return new Intl.NumberFormat('fa-IR').format(Math.round(n || 0)) + ' تومان';
}

const emptyForm = {
  customer_id: '',
  amount: '',
  payment_date: new Date().toISOString().slice(0, 10),
  note: '',
};

export default function Payments() {
  const [payments, setPayments] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data: custs } = await supabase.from('customers').select('id, name').order('name');
    const { data: pays } = await supabase
      .from('payments')
      .select('id, amount, payment_date, note, customer_id, customers(name)')
      .order('payment_date', { ascending: false });
    setCustomers(custs || []);
    setPayments(pays || []);
    setLoading(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.customer_id || !form.amount) {
      setError('انتخاب مشتری و مبلغ پرداخت الزامی است.');
      return;
    }
    const { error } = await supabase.from('payments').insert({
      customer_id: form.customer_id,
      amount: Number(form.amount),
      payment_date: form.payment_date,
      note: form.note,
    });
    if (error) return setError('خطا در ثبت پرداخت.');
    setForm(emptyForm);
    setShowForm(false);
    load();
  }

  async function deleteRow(id) {
    if (!confirm('این پرداخت حذف شود؟')) return;
    await supabase.from('payments').delete().eq('id', id);
    load();
  }

  const filtered = payments.filter((p) => {
    const q = search.trim();
    if (!q) return true;
    return (p.customers?.name || '').includes(q) || (p.note || '').includes(q);
  });

  return (
    <Layout title="پرداخت‌ها">
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="جست‌وجو بر اساس مشتری یا توضیح…"
          className="focus-ring rounded-md border border-line px-3 py-2 text-sm w-full sm:w-64"
        />
        <button
          onClick={() => setShowForm((s) => !s)}
          className="focus-ring bg-brass hover:bg-brassDark text-white text-sm rounded-md px-4 py-2 font-semibold"
        >
          {showForm ? 'بستن فرم' : '+ ثبت پرداخت جدید'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-line rounded-xl p-5 mb-6 grid sm:grid-cols-4 gap-3">
          {error && <div className="sm:col-span-4 text-bad text-xs bg-bad/10 rounded-md px-3 py-2">{error}</div>}
          <div>
            <label className="block text-xs text-ink/60 mb-1">مشتری</label>
            <select
              value={form.customer_id}
              onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
              className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm bg-white"
            >
              <option value="">انتخاب کنید…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-ink/60 mb-1">مبلغ (تومان)</label>
            <MoneyInput
              value={form.amount}
              onChange={(v) => setForm({ ...form, amount: v })}
              className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm"
              placeholder="0"
            />
          </div>
          <div>
            <label className="block text-xs text-ink/60 mb-1">تاریخ پرداخت</label>
            <input
              type="date"
              value={form.payment_date}
              onChange={(e) => setForm({ ...form, payment_date: e.target.value })}
              className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-ink/60 mb-1">توضیحات (اختیاری)</label>
            <input
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="مثلاً: نقدی، کارت به کارت…"
              className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-4">
            <button className="focus-ring bg-ink text-white text-sm rounded-md px-4 py-2 font-semibold">ثبت پرداخت</button>
          </div>
        </form>
      )}

      <div className="bg-white border border-line rounded-xl overflow-x-auto">
        <table className="ledger">
          <thead>
            <tr>
              <th>تاریخ</th>
              <th>مشتری</th>
              <th>مبلغ</th>
              <th>توضیحات</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="text-center text-ink/40 py-6">در حال بارگذاری…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} className="text-center text-ink/40 py-6">پرداختی یافت نشد.</td></tr>
            ) : (
              filtered.map((p) => (
                <tr key={p.id}>
                  <td>{formatJalaliShort(p.payment_date)}</td>
                  <td className="font-medium">{p.customers?.name || '—'}</td>
                  <td className="text-good font-semibold">{formatToman(p.amount)}</td>
                  <td className="text-ink/60">{p.note || '—'}</td>
                  <td>
                    <button onClick={() => deleteRow(p.id)} className="focus-ring text-xs text-bad hover:underline">حذف</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
