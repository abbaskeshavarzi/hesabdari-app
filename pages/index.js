import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip } from 'chart.js';
import Layout from '../components/Layout';
import { CardSkeleton, ListSkeleton, SkeletonBar } from '../components/Skeleton';
import { formatJalaliShort } from '../lib/dateFormat';
import { friendlyError } from '../lib/errorMessages';
import { supabase } from '../lib/supabaseClient';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

const money=(n)=>new Intl.NumberFormat('fa-IR').format(Math.round(Number(n)||0))+' تومان';
const firstOfMonth=()=>{const d=new Date();d.setDate(1);return d.toISOString().slice(0,10);};
const today=()=>new Date().toISOString().slice(0,10);

function SalesChart({rows}) {
  const data={labels:rows.map(x=>new Date(x.sales_day).toLocaleDateString('fa-IR',{day:'numeric',month:'short'})),datasets:[{label:'فروش',data:rows.map(x=>Number(x.total)),backgroundColor:'#B8873B',borderRadius:5,maxBarThickness:36}]};
  return <div className="h-56"><Bar data={data} options={{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{rtl:true,callbacks:{label:c=>money(c.parsed.y)}}},scales:{x:{reverse:true},y:{beginAtZero:true,ticks:{callback:v=>new Intl.NumberFormat('fa-IR',{notation:'compact'}).format(v)}}}}}/></div>;
}

function QuickAdd(){
  return <div className="flex flex-wrap gap-2 mb-5">
    <Link href="/invoices?new=1" className="focus-ring bg-brass hover:bg-brassDark text-white text-sm font-semibold rounded-md px-4 py-2.5">+ فاکتور جدید</Link>
    <Link href="/customers?new=1" className="focus-ring bg-surface border border-line text-sm rounded-md px-4 py-2.5">+ مشتری</Link>
    <Link href="/expenses?new=1" className="focus-ring bg-surface border border-line text-sm rounded-md px-4 py-2.5">+ هزینه</Link>
    <Link href="/reports" className="focus-ring bg-surface border border-line text-sm rounded-md px-4 py-2.5">گزارش‌های کامل</Link>
  </div>;
}

export default function Dashboard(){
 const [data,setData]=useState(null); const [error,setError]=useState('');
 useEffect(()=>{(async()=>{setError('');const {data,error}=await supabase.rpc('get_reports_data',{p_from:firstOfMonth(),p_to:today(),p_page:1,p_page_size:5});if(error||!data){setError(friendlyError(error,'خطا در بارگذاری داشبورد. لطفاً دوباره تلاش کنید.'));setData({summary:{},sales_daily:[],top_customers:[],top_products:[],inventory:[],sales_rows:[]});return;}setData(data);})();},[]);
 const s=data?.summary||{};
 return <Layout title="داشبورد"><QuickAdd/>{error&&<div className="text-badText text-xs bg-bad/10 border border-bad/30 rounded-md px-3 py-2 mb-4">{error}</div>}
 {!data?<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"><CardSkeleton/><CardSkeleton/><CardSkeleton/><CardSkeleton/><div className="lg:col-span-4 bg-surface border border-line rounded-xl p-5"><SkeletonBar className="h-4 w-32 mb-4"/><SkeletonBar className="h-48 w-full"/></div><div className="lg:col-span-4 grid lg:grid-cols-2 gap-4"><div className="bg-surface border border-line rounded-xl p-5"><ListSkeleton rows={4}/></div><div className="bg-surface border border-line rounded-xl p-5"><ListSkeleton rows={4}/></div></div></div>
 :<div className="space-y-5">
   <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
    {[['فروش ماه',s.sales,'text-goodText'],['سود و زیان',s.profit,s.profit>=0?'text-goodText':'text-badText'],['هزینه‌ها',s.expenses,'text-badText'],['دریافت‌ها',s.receipts,'text-goodText'],['پرداخت‌ها',s.payments,'text-badText'],['مطالبات',s.receivables,'text-badText'],['بدهی‌ها',s.payables,'text-badText']].map(([label,val,cls])=><div key={label} className="bg-surface border border-line rounded-xl p-4"><div className="text-xs text-ink/50 mb-1">{label}</div><div className={'text-lg sm:text-xl font-bold '+cls}>{error?'—':money(val)}</div></div>)}
   </div>
   <div className="bg-surface border border-line rounded-xl p-5"><div className="flex justify-between items-center mb-4"><div className="text-sm font-semibold">فروش روزانه این ماه</div><Link href="/reports" className="text-xs text-brass hover:underline">جزئیات ←</Link></div>{data.sales_daily.length?<SalesChart rows={data.sales_daily}/>:<p className="text-xs text-ink/40">فروشی در این بازه ثبت نشده است.</p>}</div>
   <div className="grid lg:grid-cols-2 gap-5">
    <div className="bg-surface border border-line rounded-xl p-5"><div className="text-sm font-semibold mb-3">مشتریان برتر</div>{data.top_customers.length?<ul className="divide-y divide-line text-sm">{data.top_customers.slice(0,5).map(x=><li key={x.customer_id} className="py-2 flex justify-between gap-3"><span>{x.name}</span><span className="font-medium">{money(x.total)}</span></li>)}</ul>:<p className="text-xs text-ink/40">داده‌ای وجود ندارد.</p>}</div>
    <div className="bg-surface border border-line rounded-xl p-5"><div className="text-sm font-semibold mb-3">محصولات پرفروش</div>{data.top_products.length?<ul className="divide-y divide-line text-sm">{data.top_products.slice(0,5).map((x,i)=><li key={x.product_id+'-'+i} className="py-2 flex justify-between gap-3"><span>{x.name}</span><span className="font-medium">{money(x.revenue)}</span></li>)}</ul>:<p className="text-xs text-ink/40">داده‌ای وجود ندارد.</p>}</div>
   </div>
   <div className="bg-surface border border-line rounded-xl p-5"><div className="flex justify-between mb-3"><div className="text-sm font-semibold">آخرین فروش‌ها</div><Link href="/invoices" className="text-xs text-brass hover:underline">همه فاکتورها ←</Link></div>{data.sales_rows.length?<div className="overflow-x-auto"><table className="ledger"><thead><tr><th>تاریخ</th><th>شماره</th><th>مشتری</th><th>مبلغ</th></tr></thead><tbody>{data.sales_rows.map(x=><tr key={x.id}><td>{formatJalaliShort(x.issue_date)}</td><td>{x.invoice_number||'—'}</td><td>{x.customer_name||'—'}</td><td>{money(x.total_amount)}</td></tr>)}</tbody></table></div>:<p className="text-xs text-ink/40">فاکتوری ثبت نشده است.</p>}</div>
 </div>}
 </Layout>;
}