import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import Pagination from '../components/Pagination';
import { TableSkeleton } from '../components/Skeleton';
import ConfirmDialog from '../components/ConfirmDialog';
import { downloadCsv } from '../lib/csv';
import { supabase } from '../lib/supabaseClient';
import { friendlyError } from '../lib/errorMessages';

const PAGE_SIZE = 15;
const emptyForm = {
  id: null, name: '', phone: '', mobile: '', address: '',
  economic_code: '', customer_code: '', notes: ''
};

function formatToman(n) {
  return new Intl.NumberFormat('fa-IR').format(Math.round(n || 0)) + ' تومان';
}

function accountStatus(balance) {
  if (Number(balance) > 0) return 'بدهکار';
  if (Number(balance) < 0) return 'بستانکار';
  return 'تسویه';
}

export default function Customers() {
  const router = useRouter();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [detailsId, setDetailsId] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState({ open: false, id: null, busy: false });

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (router.query.new === '1') {
      setForm(emptyForm);
      setShowForm(true);
    }
    if (typeof router.query.search === 'string') setSearch(router.query.search);
  }, [router.query.new, router.query.search]);

  async function load() {
    setLoading(true);
    const { data, error: loadError } = await supabase
      .from('customer_balances')
      .select('*')
      .order('name');
    if (loadError) setError(friendlyError(loadError, 'خطا در بارگذاری مشتریان.'));
    else setRows(data || []);
    setLoading(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) return setError('نام مشتری الزامی است.');

    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      mobile: form.mobile.trim() || null,
      address: form.address.trim() || null,
      economic_code: form.economic_code.trim() || null,
      customer_code: form.customer_code.trim() || null,
      notes: form.notes.trim() || null
    };

    const result = form.id
      ? await supabase.from('customers').update(payload).eq('id', form.id)
      : await supabase.from('customers').insert(payload);

    if (result.error) {
      setError(friendlyError(result.error, 'خطا در ذخیره مشتری. لطفاً اطلاعات را بررسی کنید.'));
      return;
    }
    setForm(emptyForm);
    setShowForm(false);
    await load();
  }

  function editRow(r) {
    setForm({
      id: r.customer_id,
      name: r.name || '',
      phone: r.phone || '',
      mobile: r.mobile || '',
      address: r.address || '',
      economic_code: r.economic_code || '',
      customer_code: r.customer_code || '',
      notes: r.notes || ''
    });
    setError('');
    setShowForm(true);
    setDetailsId(null);
  }

  async function toggleDetails(id) {
    if (detailsId === id) {
      setDetailsId(null);
      return;
    }
    setDetailsId(id);
    setTransactionsLoading(true);
    const { data, error: txError } = await supabase
      .from('customer_transactions')
      .select('*')
      .eq('customer_id', id)
      .order('transaction_date', { ascending: false });
    if (txError) {
      setError(friendlyError(txError, 'خطا در بارگذاری تاریخچه مشتری.'));
      setTransactions([]);
    } else {
      setTransactions(data || []);
    }
    setTransactionsLoading(false);
  }

  async function doDelete() {
    const id = confirmDelete.id;
    setConfirmDelete((c) => ({ ...c, busy: true }));
    const { error: delError } = await supabase.from('customers').delete().eq('id', id);
    if (delError) {
      setConfirmDelete({ open: false, id: null, busy: false });
      setError(friendlyError(delError, 'حذف مشتری ممکن نیست؛ سوابق مالی مرتبط را ابتدا بررسی کنید.'));
      return;
    }
    setConfirmDelete({ open: false, id: null, busy: false });
    if (detailsId === id) setDetailsId(null);
    load();
  }

  const filtered = useMemo(() => rows.filter((r) => {
    const q = search.trim().toLowerCase();
    const matchesSearch = !q || [r.name, r.phone, r.mobile, r.customer_code, r.economic_code]
      .some((v) => String(v || '').toLowerCase().includes(q));
    const matchesStatus = statusFilter === 'all' || accountStatus(r.balance) === statusFilter;
    return matchesSearch && matchesStatus;
  }), [rows, search, statusFilter]);

  useEffect(() => { setPage(1); }, [search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function exportCsv() {
    downloadCsv('مشتریان.csv',
      ['کد مشتری', 'نام', 'تلفن', 'موبایل', 'آدرس', 'کد اقتصادی', 'وضعیت حساب', 'مانده'],
      filtered.map((r) => [
        r.customer_code || '', r.name, r.phone || '', r.mobile || '', r.address || '',
        r.economic_code || '', accountStatus(r.balance), Math.abs(Number(r.balance || 0))
      ])
    );
  }

  return (
    <Layout title="مشتریان">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="جست‌وجو: نام، تلفن، موبایل یا کد…"
          className="focus-ring rounded-md border border-line px-3 py-2 text-sm w-full sm:w-72" />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="focus-ring rounded-md border border-line px-3 py-2 text-sm bg-surface">
          <option value="all">همه وضعیت‌ها</option>
          <option value="بدهکار">بدهکار</option>
          <option value="بستانکار">بستانکار</option>
          <option value="تسویه">تسویه</option>
        </select>
        <button onClick={exportCsv} className="focus-ring bg-surface border border-line text-ink text-sm rounded-md px-4 py-2 font-semibold">خروجی CSV</button>
        <button onClick={() => { setForm(emptyForm); setError(''); setShowForm((s) => !s); }}
          className="focus-ring bg-brass hover:bg-brassDark text-white text-sm rounded-md px-4 py-2 font-semibold">
          {showForm ? 'بستن فرم' : '+ مشتری جدید'}
        </button>
      </div>

      {error && <div role="alert" className="text-badText text-xs bg-bad/10 rounded-md px-3 py-2 mb-4">{error}</div>}

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-surface border border-line rounded-xl p-5 mb-6">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="lg:col-span-2">
              <label className="block text-xs text-ink/60 mb-1">نام مشتری *</label>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-ink/60 mb-1">کد مشتری</label>
              <input value={form.customer_code} onChange={(e) => setForm({ ...form, customer_code: e.target.value })}
                placeholder="مثلاً CUST-0005" className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm" dir="ltr" />
            </div>
            <div>
              <label className="block text-xs text-ink/60 mb-1">کد اقتصادی</label>
              <input value={form.economic_code} onChange={(e) => setForm({ ...form, economic_code: e.target.value })}
                className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm" dir="ltr" />
            </div>
            <div>
              <label className="block text-xs text-ink/60 mb-1">تلفن</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm" dir="ltr" />
            </div>
            <div>
              <label className="block text-xs text-ink/60 mb-1">موبایل</label>
              <input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })}
                className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm" dir="ltr" />
            </div>
            <div className="lg:col-span-2">
              <label className="block text-xs text-ink/60 mb-1">آدرس</label>
              <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm" />
            </div>
            <div className="sm:col-span-2 lg:col-span-4">
              <label className="block text-xs text-ink/60 mb-1">یادداشت</label>
              <textarea rows="2" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm" />
            </div>
          </div>
          <button className="focus-ring mt-4 bg-ink text-white text-sm rounded-md px-4 py-2 font-semibold">
            {form.id ? 'ذخیره تغییرات' : 'ثبت مشتری'}
          </button>
        </form>
      )}

      <div className="bg-surface border border-line rounded-xl overflow-x-auto">
        <table className="ledger">
          <thead><tr>
            <th>کد</th><th>نام</th><th>تماس</th><th>وضعیت حساب</th><th>مانده</th><th>آخرین ویرایش</th><th></th>
          </tr></thead>
          <tbody>
            {loading ? <TableSkeleton columns={7} /> :
              pageRows.length === 0 ? <tr><td colSpan={7} className="text-center text-ink/40 py-6">موردی یافت نشد.</td></tr> :
              pageRows.map((r) => (
                <>
                  <tr key={r.customer_id}>
                    <td className="text-xs">{r.customer_code || '—'}</td>
                    <td className="font-medium">{r.name}</td>
                    <td dir="ltr" className="text-left">{r.mobile || r.phone || '—'}</td>
                    <td>
                      <span className={accountStatus(r.balance) === 'بدهکار' ? 'text-badText text-xs font-semibold' :
                        accountStatus(r.balance) === 'بستانکار' ? 'text-goodText text-xs font-semibold' : 'text-ink/40 text-xs'}>
                        {accountStatus(r.balance)}
                      </span>
                    </td>
                    <td>{formatToman(Math.abs(r.balance))}</td>
                    <td className="text-xs text-ink/50">{r.updated_at ? new Date(r.updated_at).toLocaleDateString('fa-IR') : '—'}</td>
                    <td className="whitespace-nowrap">
                      <button onClick={() => toggleDetails(r.customer_id)} className="focus-ring text-xs text-ink/60 hover:underline ml-3">
                        {detailsId === r.customer_id ? 'بستن' : 'جزئیات'}
                      </button>
                      <button onClick={() => editRow(r)} className="focus-ring text-xs text-brass hover:underline ml-3">ویرایش</button>
                      <button onClick={() => setConfirmDelete({ open: true, id: r.customer_id, busy: false })}
                        className="focus-ring text-xs text-badText hover:underline">حذف</button>
                    </td>
                  </tr>
                  {detailsId === r.customer_id && (
                    <tr key={r.customer_id + '-details'}>
                      <td colSpan={7} className="bg-paper">
                        <div className="p-3 grid sm:grid-cols-2 gap-4">
                          <div className="text-xs space-y-2">
                            <div><span className="text-ink/50">نام:</span> {r.name}</div>
                            <div><span className="text-ink/50">تلفن:</span> {r.phone || '—'}</div>
                            <div><span className="text-ink/50">موبایل:</span> {r.mobile || '—'}</div>
                            <div><span className="text-ink/50">آدرس:</span> {r.address || '—'}</div>
                            <div><span className="text-ink/50">کد اقتصادی:</span> {r.economic_code || '—'}</div>
                            <div><span className="text-ink/50">یادداشت:</span> {r.notes || '—'}</div>
                            <div><span className="text-ink/50">تاریخ ایجاد:</span> {r.created_at ? new Date(r.created_at).toLocaleDateString('fa-IR') : '—'}</div>
                          </div>
                          <div>
                            <div className="text-sm font-semibold mb-2">تاریخچه تراکنش‌ها</div>
                            {transactionsLoading ? <p className="text-xs text-ink/40">در حال بارگذاری…</p> :
                              transactions.length === 0 ? <p className="text-xs text-ink/40">تراکنشی ثبت نشده است.</p> :
                              <ul className="text-xs divide-y divide-line">
                                {transactions.map((t) => (
                                  <li key={t.transaction_id} className="py-2 flex justify-between gap-3">
                                    <span>{t.transaction_type === 'invoice' ? 'فاکتور' : 'پرداخت'} · {t.reference || '—'} · {new Date(t.transaction_date).toLocaleDateString('fa-IR')}</span>
                                    <span className={t.transaction_type === 'invoice' ? 'text-badText font-semibold' : 'text-goodText font-semibold'}>
                                      {formatToman(t.amount)}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            }
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))
            }
          </tbody>
        </table>
        <Pagination page={page} totalPages={totalPages} onChange={setPage} totalCount={filtered.length} pageSize={PAGE_SIZE} />
      </div>

      <ConfirmDialog open={confirmDelete.open} title="حذف مشتری"
        description="حذف مشتری‌ای که سابقه فاکتور یا پرداخت دارد ممکن نیست. برای حفظ سوابق مالی، ابتدا سوابق مرتبط را بررسی کنید."
        confirmLabel="حذف مشتری" busy={confirmDelete.busy} onConfirm={doDelete}
        onCancel={() => setConfirmDelete({ open: false, id: null, busy: false })} />
    </Layout>
  );
}
