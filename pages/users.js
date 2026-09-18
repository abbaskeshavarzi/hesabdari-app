import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabaseClient';

const ROLES = [
  ['OWNER','مالک'],
  ['ADMIN','مدیر'],
  ['ACCOUNTANT','حسابدار'],
  ['SELLER','فروشنده'],
  ['WAREHOUSE','انباردار'],
];

export default function Users() {
  const [rows,setRows]=useState([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [saving,setSaving]=useState(null);
  const [message,setMessage]=useState('');

  async function load() {
    setLoading(true); setError('');
    const { data, error } = await supabase.rpc('get_organization_members');
    if (error) setError(error.message || 'دریافت کاربران انجام نشد.');
    setRows(data || []); setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function changeRole(id, role) {
    setSaving(id); setError(''); setMessage('');
    const { error } = await supabase.rpc('set_member_role',{p_member_id:id,p_role:role});
    if (error) setError(error.message || 'تغییر نقش انجام نشد.');
    else { setMessage('نقش کاربر با موفقیت تغییر کرد.'); await load(); }
    setSaving(null);
  }

  async function removeMember(id) {
    if (!window.confirm('این کاربر از سازمان حذف شود؟')) return;
    setSaving(id); setError(''); setMessage('');
    const { error } = await supabase.rpc('remove_member',{p_member_id:id});
    if (error) setError(error.message || 'حذف کاربر انجام نشد.');
    else { setMessage('کاربر از سازمان حذف شد.'); await load(); }
    setSaving(null);
  }

  return <Layout title="کاربران و نقش‌ها">
    {error && <div className="text-badText text-xs bg-bad/10 rounded-md px-3 py-2 mb-4">{error}</div>}
    {message && <div className="text-goodText text-xs bg-good/10 rounded-md px-3 py-2 mb-4">{message}</div>}
    <div className="bg-surface border border-line rounded-xl p-5">
      <div className="mb-4">
        <h2 className="font-bold">اعضای سازمان</h2>
        <p className="text-xs text-ink/55 mt-1">تغییر نقش و حذف عضو فقط از مسیر مجاز Database انجام می‌شود.</p>
      </div>
      {loading ? <div className="text-sm text-ink/50">در حال بارگذاری…</div> :
      <div className="overflow-x-auto">
        <table className="ledger w-full">
          <thead><tr><th>نام</th><th>ایمیل</th><th>نقش</th><th>تاریخ عضویت</th><th></th></tr></thead>
          <tbody>{rows.map(r => <tr key={r.member_id}>
            <td>{r.full_name || '—'}</td>
            <td dir="ltr">{r.email || '—'}</td>
            <td>
              <select value={r.role} disabled={saving===r.member_id} onChange={e=>changeRole(r.member_id,e.target.value)} className="focus-ring rounded-md border border-line px-2 py-1 text-xs bg-surface">
                {ROLES.map(([value,label])=><option key={value} value={value}>{label}</option>)}
              </select>
            </td>
            <td>{r.created_at ? new Date(r.created_at).toLocaleDateString('fa-IR') : '—'}</td>
            <td><button disabled={saving===r.member_id} onClick={()=>removeMember(r.member_id)} className="focus-ring text-xs text-badText hover:underline disabled:opacity-40">حذف</button></td>
          </tr>)}</tbody>
        </table>
      </div>}
    </div>
  </Layout>;
}
