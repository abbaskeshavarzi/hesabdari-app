import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import MoneyInput from '../components/MoneyInput';
import JalaliDatePicker from '../components/JalaliDatePicker';
import Pagination from '../components/Pagination';
import { TableSkeleton } from '../components/Skeleton';
import ConfirmDialog from '../components/ConfirmDialog';
import { formatJalaliShort } from '../lib/dateFormat';
import { supabase } from '../lib/supabaseClient';
import { friendlyError } from '../lib/errorMessages';

const PAGE_SIZE = 15;

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
  const [page, setPage] = useState(1);

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
    if (error) return setError(friendlyError(error, 'خطا در ثبت پرداخت.'));
    setForm(emptyForm);
    setShowForm(false);
    load();
  }

  const [confirmDelete, setConfirmDelete] = useState({ open: false, id: null, busy: false });

  function askDelete(id) {
    setConfirmDelete({ open: true, id, busy: false });
  }

  async function doDelete() {
    const id = confirmDelete.id;
    setConfirmDelete((c) => ({ ...c, busy: true }));
    const { error } = await supabase.from('payments').delete().eq('id', id);
    if (error) {
      setConfirmDelete({ open: false, id: null, busy: false });
      return setError(friendlyError(error, 'خطا در حذف پرداخت.'));
    }
    setConfirmDelete({ open: false, id: null, busy: false });
    load();
  }

  const filtered = payments.filter((p) => {
    const q = search.trim();
    if (!q) return true;
    return (p.customers?.name || '').includes(q) || (p.note || '').includes(q);
  });

  useEffect(() => {
    setPage(1);
  }, [search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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

      {!showForm && error && (
        <div className="text-bad text-xs bg-bad/10 rounded-md px-3 py-2 mb-4">{error}</div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-surface border border-line rounded-xl p-5 mb-6 grid sm:grid-cols-4 gap-3">
          {error && <div className="sm:col-span-4 text-bad text-xs bg-bad/10 rounded-md px-3 py-2">{error}</div>}
          <div>
            <label className="block text-xs text-ink/60 mb-1">مشتری</label>
            <select
              value={form.customer_id}
              onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
              className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm bg-surface"
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
            <JalaliDatePicker
              value={form.payment_date}
              onChange={(v) => setForm({ ...form, payment_date: v })}
              className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm text-right bg-surface"
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

      <div className="bg-surface border border-line rounded-xl overflow-x-auto">
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
              <TableSkeleton columns={5} />
            ) : pageRows.length === 0 ? (
              <tr><td colSpan={5} className="text-center text-ink/40 py-6">پرداختی یافت نشد.</td></tr>
            ) : (
              pageRows.map((p) => (
                <tr key={p.id}>
                  <td>{formatJalaliShort(p.payment_date)}</td>
                  <td className="font-medium">{p.customers?.name || '—'}</td>
                  <td className="text-good font-semibold">{formatToman(p.amount)}</td>
                  <td className="text-ink/60">{p.note || '—'}</td>
                  <td>
                    <button onClick={() => askDelete(p.id)} className="focus-ring text-xs text-bad hover:underline">حذف</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <Pagination page={page} totalPages={totalPages} onChange={setPage} totalCount={filtered.length} pageSize={PAGE_SIZE} />
      </div>

      <ConfirmDialog
        open={confirmDelete.open}
        title="حذف پرداخت"
        description="این پرداخت حذف شود؟ این عملیات قابل بازگشت نیست."
        confirmLabel="حذف پرداخت"
        busy={confirmDelete.busy}
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete({ open: false, id: null, busy: false })}
      />
    </Layout>
  );
}
