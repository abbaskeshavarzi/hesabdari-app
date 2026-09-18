import { useState } from 'react';
import Layout from '../components/Layout';
import JalaliDatePicker from '../components/JalaliDatePicker';
import { formatJalaliShort } from '../lib/dateFormat';
import { friendlyError } from '../lib/errorMessages';
import { supabase } from '../lib/supabaseClient';

const money=(n)=>new Intl.NumberFormat('fa-IR').format(Math.round(Number(n)||0))+' تومان';
const firstOfMonth=()=>{const d=new Date();d.setDate(1);return d.toISOString().slice(0,10);};
const today=()=>new Date().toISOString().slice(0,10);
function Card({label,value,negative=false}){return <div className="bg-surface border border-line rounded-xl p-4"><div className="text-xs text-ink/50 mb-1">{label}</div><div className={'text-lg font-bold '+(negative?'text-badText':'text-ink')}>{money(value)}</div></div>;}
function Section({title,children}){return <section className="bg-surface border border-line rounded-xl p-5">{title&&<h2 className="text-sm font-semibold mb-4">{title}</h2>}{children}</section>;}
function Pager({page,pages,loading,run}){return <div className="flex justify-between items-center mt-4 text-xs"><span>صفحه {page} از {pages}</span><div className="flex gap-2"><button disabled={page<=1||loading} onClick={()=>run(null,page-1)} className="border border-line rounded px-3 py-1 disabled:opacity-40">قبلی</button><button disabled={page>=pages||loading} onClick={()=>run(null,page+1)} className="border border-line rounded px-3 py-1 disabled:opacity-40">بعدی</button></div></div>;}

export default function Reports(){
 const [from,setFrom]=useState(firstOfMonth()),[to,setTo]=useState(today()),[data,setData]=useState(null),[tab,setTab]=useState('overview'),[page,setPage]=useState(1),[loading,setLoading]=useState(false),[error,setError]=useState('');
 async function run(e,nextPage=1){e?.preventDefault();setLoading(true);setError('');const {data,error}=await supabase.rpc('get_reports_data',{p_from:from,p_to:to,p_page:nextPage,p_page_size:25});if(error||!data)setError(friendlyError(error,'خطا در تولید گزارش. لطفاً دوباره تلاش کنید.'));else{setData(data);setPage(nextPage);}setLoading(false);}
 const s=data?.summary||{}; const tabs=[['overview','خلاصه'],['sales','فروش'],['cash','دریافت و پرداخت'],['inventory','موجودی'],['pnl','سود و زیان']];
 const rows=tab==='sales'?data?.sales_rows||[]:tab==='cash'?[...(data?.receipt_rows||[]).map(x=>({...x,kind:'دریافت'})),...(data?.payment_rows||[]).map(x=>({...x,kind:'پرداخت'}))]:[];
 const count=tab==='sales'?Number(s.sales_count||0):tab==='cash'?Number(s.receipt_count||0)+Number(s.payment_count||0):0;
 const pages=Math.max(1,Math.ceil(count/25));
 return <Layout title="گزارش‌ها">
  <form onSubmit={run} className="bg-surface border border-line rounded-xl p-4 mb-5 flex flex-wrap items-end gap-3">
   <div><label className="block text-xs text-ink/60 mb-1">از تاریخ</label><JalaliDatePicker value={from} onChange={setFrom}/></div>
   <div><label className="block text-xs text-ink/60 mb-1">تا تاریخ</label><JalaliDatePicker value={to} onChange={setTo}/></div>
   <button disabled={loading} className="focus-ring bg-brass hover:bg-brassDark text-white text-sm rounded-md px-4 py-2 font-semibold disabled:opacity-60">{loading?'در حال محاسبه…':'اجرای گزارش'}</button>
  </form>
  {error&&<div className="text-badText text-xs bg-bad/10 border border-bad/30 rounded-md px-3 py-2 mb-4">{error}</div>}
  {data&&<div className="space-y-5">
   <div className="flex gap-1 overflow-x-auto pb-1">{tabs.map(([id,label])=><button key={id} onClick={()=>setTab(id)} className={'focus-ring whitespace-nowrap text-sm px-3 py-2 rounded-md '+(tab===id?'bg-ink text-paper':'bg-surface border border-line')}>{label}</button>)}</div>
   <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
    <Card label="فروش" value={s.sales}/><Card label="هزینه‌ها" value={s.expenses} negative/><Card label="سود و زیان" value={s.profit} negative={Number(s.profit)<0}/><Card label="دریافت‌ها" value={s.receipts}/><Card label="پرداخت‌ها" value={s.payments} negative/><Card label="مطالبات" value={s.receivables} negative/><Card label="بدهی‌ها" value={s.payables} negative/>
   </div>
   {tab==='overview'&&<div className="grid lg:grid-cols-2 gap-5">
    <Section title="فروش ماهانه"><div className="space-y-3">{(data.sales_monthly||[]).map(x=><div key={x.month_start} className="flex items-center gap-3 text-sm"><span className="w-24">{formatJalaliShort(x.month_start)}</span><div className="flex-1 bg-paper rounded-full h-2 overflow-hidden"><div className="bg-brass h-full" style={{width:(Math.min(100,(Number(x.total)/Math.max(...data.sales_monthly.map(y=>Number(y.total)),1))*100)+'%')}}/></div><span className="font-medium whitespace-nowrap">{money(x.total)}</span></div>)}</div></Section>
    <Section title="فروش سالانه"><div className="overflow-x-auto"><table className="ledger"><thead><tr><th>سال</th><th>تعداد فاکتور</th><th>فروش</th></tr></thead><tbody>{(data.sales_yearly||[]).map(x=><tr key={x.year_start}><td>{new Date(x.year_start).toLocaleDateString('fa-IR',{year:'numeric'})}</td><td>{x.invoice_count}</td><td>{money(x.total)}</td></tr>)}</tbody></table></div></Section>
    <Section title="مشتریان برتر"><div className="overflow-x-auto"><table className="ledger"><thead><tr><th>مشتری</th><th>فاکتور</th><th>خرید</th></tr></thead><tbody>{(data.top_customers||[]).map(x=><tr key={x.customer_id}><td>{x.name}</td><td>{x.invoice_count}</td><td>{money(x.total)}</td></tr>)}</tbody></table></div></Section>
    <Section title="محصولات پرفروش"><div className="overflow-x-auto"><table className="ledger"><thead><tr><th>محصول</th><th>تعداد</th><th>فروش</th></tr></thead><tbody>{(data.top_products||[]).map((x,i)=><tr key={x.product_id+'-'+i}><td>{x.name}</td><td>{x.quantity}</td><td>{money(x.revenue)}</td></tr>)}</tbody></table></div></Section>
   </div>}
   {tab==='sales'&&<Section title="فروش و فاکتورها"><div className="overflow-x-auto"><table className="ledger"><thead><tr><th>تاریخ</th><th>شماره</th><th>مشتری</th><th>وضعیت پرداخت</th><th>مبلغ</th></tr></thead><tbody>{rows.map(x=><tr key={x.id}><td>{formatJalaliShort(x.issue_date)}</td><td>{x.invoice_number||'—'}</td><td>{x.customer_name||'—'}</td><td>{x.payment_status||'—'}</td><td>{money(x.total_amount)}</td></tr>)}{!rows.length&&<tr><td colSpan={5} className="text-center text-ink/40 py-6">داده‌ای یافت نشد.</td></tr>}</tbody></table></div><Pager page={page} pages={pages} loading={loading} run={run}/></Section>}
   {tab==='cash'&&<div className="space-y-5"><Section title="Cash Flow"><div className="overflow-x-auto"><table className="ledger"><thead><tr><th>تاریخ</th><th>دریافت</th><th>پرداخت</th><th>هزینه</th><th>خالص</th></tr></thead><tbody>{(data.cash_flow||[]).map(x=><tr key={x.flow_day}><td>{formatJalaliShort(x.flow_day)}</td><td>{money(x.receipts)}</td><td>{money(x.payments)}</td><td>{money(x.expenses)}</td><td className={Number(x.net)<0?'text-badText':'text-goodText'}>{money(x.net)}</td></tr>)}</tbody></table></div></Section><Section title="دریافت‌ها و پرداخت‌ها"><div className="overflow-x-auto"><table className="ledger"><thead><tr><th>نوع</th><th>تاریخ</th><th>طرف حساب</th><th>روش</th><th>مبلغ</th></tr></thead><tbody>{rows.map((x,i)=><tr key={(x.id||i)+x.kind}><td>{x.kind}</td><td>{formatJalaliShort(x.payment_date)}</td><td>{x.customer_name||x.supplier_name||'—'}</td><td>{x.payment_method||'—'}</td><td>{money(x.amount)}</td></tr>)}</tbody></table></div><Pager page={page} pages={pages} loading={loading} run={run}/></Section></div>}
   {tab==='inventory'&&<Section title="وضعیت موجودی"><div className="overflow-x-auto"><table className="ledger"><thead><tr><th>محصول</th><th>واحد</th><th>موجودی</th><th>حداقل</th><th>وضعیت</th></tr></thead><tbody>{(data.inventory||[]).map(x=><tr key={x.product_id}><td>{x.name}</td><td>{x.unit}</td><td>{x.quantity}</td><td>{x.min_stock}</td><td className={x.low_stock?'text-badText':'text-goodText'}>{x.low_stock?'کمبود':'مناسب'}</td></tr>)}</tbody></table></div></Section>}
   {tab==='pnl'&&<div className="space-y-5"><Section title="Profit & Loss"><div className="overflow-x-auto"><table className="ledger"><thead><tr><th>کد</th><th>حساب</th><th>نوع</th><th>مبلغ</th></tr></thead><tbody>{(data.profit_loss||[]).map(x=><tr key={x.code}><td>{x.code}</td><td>{x.name}</td><td>{x.account_type==='REVENUE'?'درآمد':'هزینه'}</td><td className={x.account_type==='REVENUE'?'text-goodText':'text-badText'}>{money(x.amount)}</td></tr>)}</tbody></table></div></Section><Section title="ریز هزینه‌ها"><div className="overflow-x-auto"><table className="ledger"><thead><tr><th>تاریخ</th><th>دسته</th><th>شرح</th><th>مبلغ</th></tr></thead><tbody>{(data.expense_rows||[]).map(x=><tr key={x.id}><td>{formatJalaliShort(x.expense_date)}</td><td>{x.category}</td><td>{x.description||'—'}</td><td>{money(x.amount)}</td></tr>)}</tbody></table></div></Section></div>}
  </div>}
 </Layout>;
}