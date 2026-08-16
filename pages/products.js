import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import Pagination from '../components/Pagination';
import MoneyInput from '../components/MoneyInput';
import { TableSkeleton } from '../components/Skeleton';
import ConfirmDialog from '../components/ConfirmDialog';
import { supabase } from '../lib/supabaseClient';
import { friendlyError } from '../lib/errorMessages';

const PAGE_SIZE = 15;

function formatToman(n) {
  return new Intl.NumberFormat('fa-IR').format(Math.round(n || 0)) + ' تومان';
}

const emptyForm = { id: null, name: '', unit: 'عدد', price: '', stock_qty: '0' };
const UNITS = ['عدد', 'کیلوگرم', 'گرم', 'متر', 'لیتر', 'بسته', 'جعبه'];

export default function Products() {
  const [rows, setRows] = useState([]);
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
    const { data } = await supabase.from('products').select('*').order('name');
    setRows(data || []);
    setLoading(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.name.trim() || form.price === '') {
      setError('نام کالا و قیمت الزامی است.');
      return;
    }
    if (form.id) {
      const { error } = await supabase
        .from('products')
        .update({ name: form.name, unit: form.unit, price: Number(form.price) })
        .eq('id', form.id);
      if (error) return setError(friendlyError(error, 'خطا در ویرایش کالا.'));
    } else {
      const { error } = await supabase.from('products').insert({
        name: form.name,
        unit: form.unit,
        price: Number(form.price),
        stock_qty: Number(form.stock_qty || 0),
      });
      if (error) return setError(friendlyError(error, 'خطا در ثبت کالا.'));
    }
    setForm(emptyForm);
    setShowForm(false);
    load();
  }

  function editRow(p) {
    setForm({ id: p.id, name: p.name, unit: p.unit, price: p.price, stock_qty: p.stock_qty });
    setShowForm(true);
  }

  const [confirmDelete, setConfirmDelete] = useState({ open: false, id: null, busy: false });

  function askDelete(id) {
    setConfirmDelete({ open: true, id, busy: false });
  }

  async function doDelete() {
    const id = confirmDelete.id;
    setConfirmDelete((c) => ({ ...c, busy: true }));
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) {
      setConfirmDelete({ open: false, id: null, busy: false });
      return setError(friendlyError(error, 'خطا در حذف کالا. اگر این کالا در فاکتوری استفاده شده، ابتدا آن فاکتور را حذف کنید.'));
    }
    setConfirmDelete({ open: false, id: null, busy: false });
    load();
  }

  const filtered = rows.filter((r) => !search.trim() || (r.name || '').includes(search.trim()));

  useEffect(() => {
    setPage(1);
  }, [search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <Layout title="کالاها">
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="جست‌وجو بر اساس نام کالا…"
          className="focus-ring rounded-md border border-line px-3 py-2 text-sm w-full sm:w-64"
        />
        <button
          onClick={() => {
            setForm(emptyForm);
            setShowForm((s) => !s);
          }}
          className="focus-ring bg-brass hover:bg-brassDark text-white text-sm rounded-md px-4 py-2 font-semibold"
        >
          {showForm ? 'بستن فرم' : '+ کالای جدید'}
        </button>
      </div>

      {!showForm && error && (
        <div className="text-bad text-xs bg-bad/10 rounded-md px-3 py-2 mb-4">{error}</div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-surface border border-line rounded-xl p-5 mb-6 grid sm:grid-cols-4 gap-3">
          {error && <div className="sm:col-span-4 text-bad text-xs bg-bad/10 rounded-md px-3 py-2">{error}</div>}
          <div>
            <label className="block text-xs text-ink/60 mb-1">نام کالا</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-ink/60 mb-1">واحد</label>
            <select
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
              className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm bg-surface"
            >
              {UNITS.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-ink/60 mb-1">قیمت واحد (تومان)</label>
            <MoneyInput
              value={form.price}
              onChange={(v) => setForm({ ...form, price: v })}
              className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm"
              placeholder="0"
            />
          </div>
          {!form.id && (
            <div>
              <label className="block text-xs text-ink/60 mb-1">موجودی اولیه</label>
              <input
                type="number"
                value={form.stock_qty}
                onChange={(e) => setForm({ ...form, stock_qty: e.target.value })}
                className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm"
              />
            </div>
          )}
          <div className="sm:col-span-4">
            <button className="focus-ring bg-ink text-white text-sm rounded-md px-4 py-2 font-semibold">
              {form.id ? 'ذخیره تغییرات' : 'ثبت کالا'}
            </button>
            {form.id && (
              <p className="text-xs text-ink/40 mt-2">برای تغییر موجودی، از صفحه «انبار» استفاده کن.</p>
            )}
          </div>
        </form>
      )}

      <div className="bg-surface border border-line rounded-xl overflow-x-auto">
        <table className="ledger">
          <thead>
            <tr>
              <th>نام کالا</th>
              <th>واحد</th>
              <th>قیمت واحد</th>
              <th>موجودی</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableSkeleton columns={5} />
            ) : pageRows.length === 0 ? (
              <tr><td colSpan={5} className="text-center text-ink/40 py-6">کالایی یافت نشد.</td></tr>
            ) : (
              pageRows.map((p) => (
                <tr key={p.id}>
                  <td className="font-medium">{p.name}</td>
                  <td>{p.unit}</td>
                  <td>{formatToman(p.price)}</td>
                  <td className={p.stock_qty <= 0 ? 'text-bad font-semibold' : ''}>
                    {p.stock_qty} {p.unit}
                  </td>
                  <td className="whitespace-nowrap">
                    <button onClick={() => editRow(p)} className="focus-ring text-xs text-brass hover:underline ml-3">ویرایش</button>
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
        title="حذف کالا"
        description="این کالا حذف شود؟ این عملیات قابل بازگشت نیست."
        confirmLabel="حذف کالا"
        busy={confirmDelete.busy}
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete({ open: false, id: null, busy: false })}
      />
    </Layout>
  );
}
