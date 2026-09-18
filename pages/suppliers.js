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
const emptyForm = { id: null, name: '', phone: '', mobile: '', address: '', economic_code: '', supplier_code: '', notes: '' };

function formatToman(n) { return new Intl.NumberFormat('fa-IR').format(Math.round(n || 0)) + ' تومان'; }

export default function Suppliers() {
  const router = useRouter();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [detailsId, setDetailsId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState({ open: false, id: null, busy: false });

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (router.query.new === '1') { setForm(emptyForm); setShowForm(true); }
  }, [router.query.new]);

  async function load() {
    setLoading(true);
    const { data, error: loadError } = await supabase.from('supplier_balances').select('*').order('name');
    if (loadError) setError(friendlyError(loadError, 'خطا در بارگذاری تأمین‌کنندگان.'));
    else setRows(data || []);
    setLoading(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) return setError('نام تأمین‌کننده الزامی است.');
    const payload = {
      name: form.name.trim(), phone: form.phone.trim() || null, mobile: form.mobile.trim() || null,
      address: form.address.trim() || null, economic_code: form.economic_code.trim() || null,
      supplier_code: form.supplier_code.trim() || null, notes: form.notes.trim() || null
    };
    const result = form.id
      ? await supabase.from('suppliers').update(payload).eq('id', form.id)
      : await supabase.from('suppliers').insert(payload);
    if (result.error) return setError(friendlyError(result.error, 'خطا در ذخیره تأمین‌کننده.'));
    setForm(emptyForm); setShowForm(false); load();
  }

  function editRow(r) {
    setForm({ id: r.supplier_id, name: r.name || '', phone: r.phone || '', mobile: r.mobile || '',
      address: r.address || '', economic_code: r.economic_code || '', supplier_code: r.supplier_code || '', notes: r.notes || '' });
    setError(''); setShowForm(true); setDetailsId(null);
  }

  async function doDelete() {
    const id = confirmDelete.id;
    setConfirmDelete((c) => ({ ...c, busy: true }));
    const { error: delError } = await supabase.from('suppliers').delete().eq('id', id);
    if (delError) {
      setConfirmDelete({ open: false, id: null, busy: false });
      return setError(friendlyError(delError, 'حذف تأمین‌کننده انجام نشد.'));
    }
    setConfirmDelete({ open: false, id: null, busy: false }); load();
  }

  const filtered = useMemo(() => rows.filter((r) => {
    const q = search.trim().toLowerCase();
    return !q || [r.name, r.phone, r.mobile, r.supplier_code, r.economic_code]
      .some((v) => String(v || '').toLowerCase().includes(q));
  }), [rows, search]);

  useEffect(() => { setPage(1); }, [search]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function exportCsv() {
    downloadCsv('تأمین‌کنندگان.csv', ['کد تأمین‌کننده','نام','تلفن','موبایل','آدرس','کد اقتصادی','مانده'],
      filtered.map((r) => [r.supplier_code || '', r.name, r.phone || '', r.mobile || '', r.address || '', r.economic_code || '', Math.abs(Number(r.balance || 0))]));
  }

  return (
    <Layout title="تأمین‌کنندگان">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="جست‌وجو: نام، تلفن، موبایل یا کد…"
          className="focus-ring rounded-md border border-line px-3 py-2 text-sm w-full sm:w-72" />
        <button onClick={exportCsv} className="focus-ring bg-surface border border-line text-ink text-sm rounded-md px-4 py-2 font-semibold">خروجی CSV</button>
        <button onClick={() => { setForm(emptyForm); setError(''); setShowForm((s) => !s); }}
          className="focus-ring bg-brass hover:bg-brassDark text-white text-sm rounded-md px-4 py-2 font-semibold">{showForm ? 'بستن فرم' : '+ تأمین‌کننده جدید'}</button>
      </div>
      {error && <div role="alert" className="text-badText text-xs bg-bad/10 rounded-md px-3 py-2 mb-4">{error}</div>}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-surface border border-line rounded-xl p-5 mb-6">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="lg:col-span-2"><label className="block text-xs text-ink/60 mb-1">نام تأمین‌کننده *</label>
              <input required value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})} className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
            <div><label className="block text-xs text-ink/60 mb-1">کد تأمین‌کننده</label>
              <input value={form.supplier_code} onChange={(e)=>setForm({...form,supplier_code:e.target.value})} className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm" dir="ltr" /></div>
            <div><label className="block text-xs text-ink/60 mb-1">کد اقتصادی</label>
              <input value={form.economic_code} onChange={(e)=>setForm({...form,economic_code:e.target.value})} className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm" dir="ltr" /></div>
            <div><label className="block text-xs text-ink/60 mb-1">تلفن</label>
              <input value={form.phone} onChange={(e)=>setForm({...form,phone:e.target.value})} className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm" dir="ltr" /></div>
            <div><label className="block text-xs text-ink/60 mb-1">موبایل</label>
              <input value={form.mobile} onChange={(e)=>setForm({...form,mobile:e.target.value})} className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm" dir="ltr" /></div>
            <div className="lg:col-span-2"><label className="block text-xs text-ink/60 mb-1">آدرس</label>
              <input value={form.address} onChange={(e)=>setForm({...form,address:e.target.value})} className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
            <div className="sm:col-span-2 lg:col-span-4"><label className="block text-xs text-ink/60 mb-1">یادداشت</label>
              <textarea rows="2" value={form.notes} onChange={(e)=>setForm({...form,notes:e.target.value})} className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
          </div>
          <button className="focus-ring mt-4 bg-ink text-white text-sm rounded-md px-4 py-2 font-semibold">{form.id ? 'ذخیره تغییرات' : 'ثبت تأمین‌کننده'}</button>
        </form>
      )}
      <div className="bg-surface border border-line rounded-xl overflow-x-auto">
        <table className="ledger">
          <thead><tr><th>کد</th><th>نام</th><th>تماس</th><th>مانده حساب</th><th>تاریخ ایجاد</th><th></th></tr></thead>
          <tbody>
            {loading ? <TableSkeleton columns={6} /> : pageRows.length === 0 ? <tr><td colSpan={6} className="text-center text-ink/40 py-6">موردی یافت نشد.</td></tr> :
              pageRows.map((r) => (
                <tr key={r.supplier_id}>
                  <td className="text-xs">{r.supplier_code || '—'}</td>
                  <td className="font-medium">{r.name}</td>
                  <td dir="ltr" className="text-left">{r.mobile || r.phone || '—'}</td>
                  <td>{formatToman(Math.abs(r.balance))}</td>
                  <td className="text-xs text-ink/50">{r.created_at ? new Date(r.created_at).toLocaleDateString('fa-IR') : '—'}</td>
                  <td className="whitespace-nowrap">
                    <button onClick={() => setDetailsId(detailsId === r.supplier_id ? null : r.supplier_id)} className="focus-ring text-xs text-ink/60 hover:underline ml-3">{detailsId === r.supplier_id ? 'بستن' : 'جزئیات'}</button>
                    <button onClick={() => editRow(r)} className="focus-ring text-xs text-brass hover:underline ml-3">ویرایش</button>
                    <button onClick={() => setConfirmDelete({open:true,id:r.supplier_id,busy:false})} className="focus-ring text-xs text-badText hover:underline">حذف</button>
                  </td>
                </tr>
              ))
            }
          </tbody>
        </table>
        <Pagination page={page} totalPages={totalPages} onChange={setPage} totalCount={filtered.length} pageSize={PAGE_SIZE} />
      </div>
      {detailsId && (() => {
        const r = rows.find((x) => x.supplier_id === detailsId);
        if (!r) return null;
        return <div className="mt-4 bg-surface border border-line rounded-xl p-5 text-sm">
          <div className="font-semibold mb-3">جزئیات تأمین‌کننده: {r.name}</div>
          <div className="grid sm:grid-cols-2 gap-2 text-xs">
            <div>تلفن: {r.phone || '—'}</div><div>موبایل: {r.mobile || '—'}</div>
            <div>آدرس: {r.address || '—'}</div><div>کد اقتصادی: {r.economic_code || '—'}</div>
            <div>یادداشت: {r.notes || '—'}</div><div>مانده فعلی: {formatToman(r.balance)}</div>
          </div>
          <div className="mt-4 p-3 bg-paper rounded-md text-xs text-ink/50">
            تاریخچه تراکنش‌های تأمین‌کننده پس از اضافه شدن اسناد خرید و پرداخت تأمین‌کنندگان در مراحل مالی بعدی به همین بخش متصل می‌شود.
          </div>
        </div>;
      })()}
      <ConfirmDialog open={confirmDelete.open} title="حذف تأمین‌کننده" description="این تأمین‌کننده حذف شود؟ سوابق خرید در مراحل بعدی از حذف افراد دارای سابقه جلوگیری خواهند کرد." confirmLabel="حذف تأمین‌کننده" busy={confirmDelete.busy} onConfirm={doDelete} onCancel={()=>setConfirmDelete({open:false,id:null,busy:false})} />
    </Layout>
  );
}
