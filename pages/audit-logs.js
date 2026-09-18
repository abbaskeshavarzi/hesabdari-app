import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabaseClient';

const ACTION_LABELS={insert:'ایجاد',update:'ویرایش',delete:'حذف'};
const TABLE_LABELS={
 customers:'مشتریان',suppliers:'تأمین‌کنندگان',products:'کالاها',invoices:'فاکتورها',
 invoice_items:'اقلام فاکتور',payments:'پرداخت‌ها',expenses:'هزینه‌ها',
 financial_accounts:'حساب‌های مالی',business_settings:'تنظیمات',warehouses:'انبارها',
 stock_movements:'گردش موجودی',organization_members:'اعضای سازمان',
 journal_entries:'سندهای حسابداری',journal_lines:'آیتم‌های سند'
};

export default function AuditLogs(){
 const [rows,setRows]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const [table,setTable]=useState(''),[action,setAction]=useState('');
 async function load(){
  setLoading(true);setError('');
  let q=supabase.from('audit_logs').select('*').order('occurred_at',{ascending:false}).limit(200);
  if(table) q=q.eq('table_name',table);
  if(action) q=q.eq('action',action);
  const {data,error:e}=await q;
  if(e)setError(e.message||'دریافت گزارش حسابرسی انجام نشد.');
  setRows(data||[]);setLoading(false);
 }
 useEffect(()=>{load()},[table,action]);
 return <Layout title="گزارش حسابرسی">
  {error&&<div className="text-badText text-xs bg-bad/10 rounded-md px-3 py-2 mb-4">{error}</div>}
  <div className="bg-surface border border-line rounded-xl p-4 mb-4 flex flex-wrap gap-3">
   <select value={table} onChange={e=>setTable(e.target.value)} className="focus-ring rounded-md border border-line px-3 py-2 text-sm bg-surface">
    <option value="">همه بخش‌ها</option>{Object.entries(TABLE_LABELS).map(([v,l])=><option key={v} value={v}>{l}</option>)}
   </select>
   <select value={action} onChange={e=>setAction(e.target.value)} className="focus-ring rounded-md border border-line px-3 py-2 text-sm bg-surface">
    <option value="">همه عملیات</option><option value="insert">ایجاد</option><option value="update">ویرایش</option><option value="delete">حذف</option>
   </select>
  </div>
  <div className="bg-surface border border-line rounded-xl overflow-x-auto">
   {loading?<div className="p-5 text-sm text-ink/50">در حال بارگذاری…</div>:
   <table className="ledger w-full"><thead><tr><th>زمان</th><th>عملیات</th><th>بخش</th><th>رکورد</th><th>تغییرات</th></tr></thead>
   <tbody>{rows.map(r=><tr key={r.id}>
    <td dir="ltr" className="whitespace-nowrap">{new Date(r.occurred_at).toLocaleString('fa-IR')}</td>
    <td>{ACTION_LABELS[r.action]||r.action}</td>
    <td>{TABLE_LABELS[r.table_name]||r.table_name}</td>
    <td dir="ltr" className="text-xs">{r.record_id||'—'}</td>
    <td className="text-xs"><details><summary className="cursor-pointer text-brass">نمایش before / after</summary><pre dir="ltr" className="mt-2 max-w-[600px] whitespace-pre-wrap text-[10px] bg-paper rounded p-2 overflow-auto">{JSON.stringify({before:r.before_data,after:r.after_data},null,2)}</pre></details></td>
   </tr>)}</tbody></table>}
  </div>
  <p className="text-[11px] text-ink/45 mt-3">این جدول فقط خواندنی است و درج/ویرایش/حذف آن از سمت کاربر مسدود شده است.</p>
 </Layout>;
}
