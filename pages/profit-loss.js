import { useState } from 'react';
import Layout from '../components/Layout';
import JalaliDatePicker from '../components/JalaliDatePicker';
import { formatJalaliShort } from '../lib/dateFormat';
import { friendlyError } from '../lib/errorMessages';
import { supabase } from '../lib/supabaseClient';

const money=(n)=>new Intl.NumberFormat('fa-IR').format(Math.round(Number(n)||0))+' تومان';
const firstOfMonth=()=>{const d=new Date();d.setDate(1);return d.toISOString().slice(0,10);};
const today=()=>new Date().toISOString().slice(0,10);

export default function ProfitLoss(){
 const [from,setFrom]=useState(firstOfMonth()),[to,setTo]=useState(today()),[data,setData]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
 async function run(e){e?.preventDefault();setLoading(true);setError('');const {data,error}=await supabase.rpc('get_reports_data',{p_from:from,p_to:to,p_page:1,p_page_size:25});if(error||!data)setError(friendlyError(error,'خطا در تولید سود و زیان. لطفاً دوباره تلاش کنید.'));else setData(data);setLoading(false);}
 const s=data?.summary||{};
 return <Layout title="سود و زیان">
  <form onSubmit={run} className="bg-surface border border-line rounded-xl p-4 mb-5 flex flex-wrap items-end gap-3"><div><label className="block text-xs text-ink/60 mb-1">از تاریخ</label><JalaliDatePicker value={from} onChange={setFrom}/></div><div><label className="block text-xs text-ink/60 mb-1">تا تاریخ</label><JalaliDatePicker value={to} onChange={setTo}/></div><button disabled={loading} className="focus-ring bg-brass hover:bg-brassDark text-white text-sm rounded-md px-4 py-2 font-semibold disabled:opacity-60">{loading?'در حال محاسبه…':'نمایش سود و زیان'}</button></form>
  {error&&<div className="text-badText text-xs bg-bad/10 border border-bad/30 rounded-md px-3 py-2 mb-4">{error}</div>}
  {data&&<div className="space-y-5"><div className="grid grid-cols-1 sm:grid-cols-3 gap-3"><div className="bg-surface border border-line rounded-xl p-5"><div className="text-xs text-ink/50">درآمد/فروش</div><div className="text-xl font-bold text-goodText mt-1">{money(s.sales)}</div></div><div className="bg-surface border border-line rounded-xl p-5"><div className="text-xs text-ink/50">هزینه‌ها</div><div className="text-xl font-bold text-badText mt-1">{money(s.expenses)}</div></div><div className={(Number(s.profit)>=0?'bg-good':'bg-bad')+' text-white rounded-xl p-5'}><div className="text-xs opacity-80">{Number(s.profit)>=0?'سود خالص':'زیان خالص'}</div><div className="text-xl font-bold mt-1">{money(Math.abs(Number(s.profit)||0))}</div></div></div>
  <div className="bg-surface border border-line rounded-xl p-5 overflow-x-auto"><div className="text-sm font-semibold mb-3">جزئیات حسابداری Profit & Loss</div><table className="ledger"><thead><tr><th>کد</th><th>حساب</th><th>نوع</th><th>بدهکار</th><th>بستانکار</th><th>خالص</th></tr></thead><tbody>{(data.profit_loss||[]).map(x=><tr key={x.code}><td>{x.code}</td><td>{x.name}</td><td>{x.account_type==='REVENUE'?'درآمد':'هزینه'}</td><td>{money(x.debit)}</td><td>{money(x.credit)}</td><td className={x.account_type==='REVENUE'?'text-goodText':'text-badText'}>{money(x.amount)}</td></tr>)}</tbody></table></div>
  <div className="bg-surface border border-line rounded-xl p-5 overflow-x-auto"><div className="text-sm font-semibold mb-3">ریز هزینه‌ها</div><table className="ledger"><thead><tr><th>تاریخ</th><th>دسته</th><th>شرح</th><th>مبلغ</th></tr></thead><tbody>{(data.expense_rows||[]).map(x=><tr key={x.id}><td>{formatJalaliShort(x.expense_date)}</td><td>{x.category}</td><td>{x.description||'—'}</td><td>{money(x.amount)}</td></tr>)}</tbody></table></div></div>}
 </Layout>;
}