import { useState } from 'react';
import Layout from '../components/Layout';
import JalaliDatePicker from '../components/JalaliDatePicker';
import { friendlyError } from '../lib/errorMessages';
import { supabase } from '../lib/supabaseClient';

const money=(n)=>new Intl.NumberFormat('fa-IR').format(Math.round(Number(n)||0))+' تومان';
const firstOfMonth=()=>{const d=new Date();d.setDate(1);return d.toISOString().slice(0,10);};
const today=()=>new Date().toISOString().slice(0,10);

export default function BestPerformers(){
 const [from,setFrom]=useState(firstOfMonth()),[to,setTo]=useState(today()),[data,setData]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
 async function run(e){e?.preventDefault();setLoading(true);setError('');const {data,error}=await supabase.rpc('get_reports_data',{p_from:from,p_to:to,p_page:1,p_page_size:25});if(error||!data)setError(friendlyError(error,'خطا در تولید گزارش. لطفاً دوباره تلاش کنید.'));else setData(data);setLoading(false);}
 return <Layout title="پرفروش‌ترین‌ها"><form onSubmit={run} className="bg-surface border border-line rounded-xl p-4 mb-5 flex flex-wrap items-end gap-3"><div><label className="block text-xs text-ink/60 mb-1">از تاریخ</label><JalaliDatePicker value={from} onChange={setFrom}/></div><div><label className="block text-xs text-ink/60 mb-1">تا تاریخ</label><JalaliDatePicker value={to} onChange={setTo}/></div><button disabled={loading} className="focus-ring bg-brass hover:bg-brassDark text-white text-sm rounded-md px-4 py-2 font-semibold disabled:opacity-60">{loading?'در حال محاسبه…':'نمایش گزارش'}</button></form>
 {error&&<div className="text-badText text-xs bg-bad/10 border border-bad/30 rounded-md px-3 py-2 mb-4">{error}</div>}
 {data&&<div className="grid grid-cols-1 lg:grid-cols-2 gap-5"><div className="bg-surface border border-line rounded-xl p-5 overflow-x-auto"><div className="text-sm font-semibold mb-3">محصولات پرفروش</div><table className="ledger"><thead><tr><th>رتبه</th><th>محصول</th><th>تعداد</th><th>فروش</th></tr></thead><tbody>{(data.top_products||[]).map((x,i)=><tr key={x.product_id+'-'+i}><td>{i+1}</td><td>{x.name}</td><td>{x.quantity}</td><td>{money(x.revenue)}</td></tr>)}</tbody></table></div><div className="bg-surface border border-line rounded-xl p-5 overflow-x-auto"><div className="text-sm font-semibold mb-3">مشتریان برتر</div><table className="ledger"><thead><tr><th>رتبه</th><th>مشتری</th><th>فاکتور</th><th>خرید</th></tr></thead><tbody>{(data.top_customers||[]).map((x,i)=><tr key={x.customer_id}><td>{i+1}</td><td>{x.name}</td><td>{x.invoice_count}</td><td>{money(x.total)}</td></tr>)}</tbody></table></div></div>}
 </Layout>;
}