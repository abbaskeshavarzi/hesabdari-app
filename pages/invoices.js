import React,{useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/router';
import Layout from '../components/Layout';
import MoneyInput from '../components/MoneyInput';
import JalaliDatePicker from '../components/JalaliDatePicker';
import Pagination from '../components/Pagination';
import {TableSkeleton} from '../components/Skeleton';
import ConfirmDialog from '../components/ConfirmDialog';
import {friendlyError} from '../lib/errorMessages';
import {formatJalaliShort} from '../lib/dateFormat';
import {downloadCsv} from '../lib/csv';
import {supabase} from '../lib/supabaseClient';

const PAGE_SIZE=15;
const EMPTY_LINE={product_id:'',product_name:'',quantity:'1',unit_price:''};
const STATUS_LABELS={DRAFT:'پیش‌نویس',POSTED:'ثبت‌شده',VOIDED:'باطل‌شده'};
const today=()=>new Date().toISOString().slice(0,10);
const money=(n)=>new Intl.NumberFormat('fa-IR').format(Math.round(Number(n)||0))+' تومان';

export default function Invoices(){
 const router=useRouter();
 const [invoices,setInvoices]=useState([]),[customers,setCustomers]=useState([]),[products,setProducts]=useState([]);
 const [settings,setSettings]=useState({tax_enabled:false,tax_rate:0}),[loading,setLoading]=useState(true);
 const [showForm,setShowForm]=useState(false),[editingId,setEditingId]=useState(null),[error,setError]=useState('');
 const [submitting,setSubmitting]=useState(false),[search,setSearch]=useState(''),[expanded,setExpanded]=useState(null),[itemsCache,setItemsCache]=useState({});
 const [page,setPage]=useState(1),[confirm,setConfirm]=useState({open:false,id:null,mode:null,busy:false});
 const [header,setHeader]=useState({customer_id:'',invoice_number:'',issue_date:today(),due_date:today(),description:'',status:'DRAFT',discount_type:'amount',discount_value:'',tax_rate:0,shipping_amount:''});
 const [lines,setLines]=useState([{...EMPTY_LINE}]);

 useEffect(()=>{load();},[]);
 useEffect(()=>{if(typeof router.query.search==='string')setSearch(router.query.search);},[router.query.search]);

 async function load(){
  setLoading(true);
  const [{data:c},{data:p},{data:i},{data:s}]=await Promise.all([
   supabase.from('customers').select('id,name').order('name'),
   supabase.from('products').select('id,name,price,sale_price,unit,stock_qty').eq('is_active',true).order('name'),
   supabase.from('invoices').select('id,invoice_number,issue_date,due_date,subtotal_amount,total_amount,discount_amount,tax_rate,tax_amount,shipping_amount,description,status,payment_status,customer_id,customers(name)').order('issue_date',{ascending:false}),
   supabase.from('business_settings').select('tax_enabled,tax_rate').eq('id','default').single()
  ]);
  setCustomers(c||[]);setProducts(p||[]);setInvoices(i||[]);
  setSettings({tax_enabled:!!s?.tax_enabled,tax_rate:Number(s?.tax_rate)||0});setLoading(false);
 }
 function openNew(){
  setEditingId(null);setHeader({customer_id:'',invoice_number:'',issue_date:today(),due_date:today(),description:'',status:'DRAFT',discount_type:'amount',discount_value:'',tax_rate:settings.tax_rate,shipping_amount:''});
  setLines([{...EMPTY_LINE}]);setError('');setShowForm(true);
 }
 async function openEdit(inv){
  const {data,error:e}=await supabase.from('invoice_items').select('*').eq('invoice_id',inv.id).order('created_at');
  if(e)return setError(friendlyError(e,'خطا در دریافت اقلام فاکتور.'));
  setEditingId(inv.id);setHeader({customer_id:inv.customer_id||'',invoice_number:inv.invoice_number||'',issue_date:inv.issue_date||today(),due_date:inv.due_date||inv.issue_date||today(),description:inv.description||'',status:'DRAFT',discount_type:inv.discount_type||'amount',discount_value:inv.discount_value??'',tax_rate:Number(inv.tax_rate)||settings.tax_rate,shipping_amount:inv.shipping_amount??''});
  setLines((data||[]).map(x=>({product_id:x.product_id||'',product_name:x.product_name||'',quantity:String(x.quantity),unit_price:String(x.unit_price)})));setError('');setShowForm(true);
 }
 function updateLine(i,patch){setLines(v=>v.map((x,n)=>n===i?{...x,...patch}:x));}
 function pickProduct(i,id){const p=products.find(x=>x.id===id);updateLine(i,{product_id:id,product_name:p?.name||'',unit_price:String(p?.sale_price??p?.price??'')});}
 function addLine(){setLines(v=>[...v,{...EMPTY_LINE}]);}
 function removeLine(i){setLines(v=>v.length>1?v.filter((_,n)=>n!==i):v);}
 const subtotal=useMemo(()=>lines.reduce((s,l)=>s+(Number(l.quantity)||0)*(Number(l.unit_price)||0),0),[lines]);
 const discountValue=Number(header.discount_value)||0;
 const discount=Math.min(subtotal,Math.max(0,header.discount_type==='percent'?subtotal*discountValue/100:discountValue));
 const taxRate=settings.tax_enabled?Math.max(0,Math.min(100,Number(header.tax_rate)||0)):0;
 const tax=Math.max(0,(subtotal-discount)*taxRate/100),shipping=Math.max(0,Number(header.shipping_amount)||0);
 const total=Math.max(0,subtotal-discount+tax+shipping);

 async function submit(e){
  e.preventDefault();setError('');
  if(!header.customer_id||!header.issue_date||!header.due_date)return setError('مشتری، تاریخ صدور و سررسید الزامی است.');
  if(header.due_date<header.issue_date)return setError('تاریخ سررسید نمی‌تواند قبل از تاریخ صدور باشد.');
  const valid=lines.filter(x=>x.product_name.trim()&&Number(x.quantity)>0&&Number(x.unit_price)>=0);
  if(!valid.length)return setError('حداقل یک قلم معتبر لازم است.');
  setSubmitting(true);
  const args={p_customer_id:header.customer_id,p_invoice_number:header.invoice_number||null,p_issue_date:header.issue_date,p_due_date:header.due_date,p_description:header.description||null,p_items:valid.map(x=>({product_id:x.product_id||null,product_name:x.product_name.trim(),quantity:Number(x.quantity),unit_price:Number(x.unit_price)||0})),p_discount_type:header.discount_type,p_discount_value:discountValue,p_tax_rate:taxRate,p_shipping_amount:shipping};
  const {error:rpcError}=editingId?await supabase.rpc('update_draft_invoice_with_items',{...args,p_invoice_id:editingId}):await supabase.rpc('create_invoice_with_items',{...args,p_status:header.status});
  setSubmitting(false);if(rpcError)return setError(friendlyError(rpcError,'خطا در ذخیره فاکتور.'));
  setShowForm(false);setEditingId(null);await load();
 }
 function ask(id,mode){setConfirm({open:true,id,mode,busy:false});}
 async function run(){
  const {id,mode}=confirm;setConfirm(c=>({...c,busy:true}));
  const rpc=mode==='post'?'post_invoice':mode==='void'?'void_invoice':'delete_invoice';
  const {error:e}=await supabase.rpc(rpc,{p_invoice_id:id});
  if(e){setConfirm({open:false,id:null,mode:null,busy:false});return setError(friendlyError(e,'عملیات فاکتور انجام نشد.'));}
  setConfirm({open:false,id:null,mode:null,busy:false});await load();
 }
 async function toggle(id){
  if(expanded===id)return setExpanded(null);setExpanded(id);
  if(!itemsCache[id]){const {data}=await supabase.from('invoice_items').select('*').eq('invoice_id',id).order('created_at');setItemsCache(v=>({...v,[id]:data||[]}));}
 }
 const filtered=invoices.filter(i=>{const q=search.trim();return !q||(i.customers?.name||'').includes(q)||String(i.invoice_number||'').includes(q);});
 useEffect(()=>setPage(1),[search]);
 const totalPages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE)),rows=filtered.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE);
 function csv(){downloadCsv('فاکتورهای حرفه‌ای.csv',['تاریخ','سررسید','مشتری','شماره','جمع اقلام','تخفیف','مالیات','ارسال','جمع کل','وضعیت'],filtered.map(i=>[i.issue_date,i.due_date,i.customers?.name||'',i.invoice_number||'',i.subtotal_amount,i.discount_amount,i.tax_amount,i.shipping_amount,i.total_amount,STATUS_LABELS[i.status]||i.status]));}

 return <Layout title="فاکتورهای حرفه‌ای">
  <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
   <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="جست‌وجو بر اساس مشتری یا شماره فاکتور…" className="focus-ring rounded-md border border-line px-3 py-2 text-sm w-full sm:w-64"/>
   <div className="flex gap-2"><button onClick={csv} className="focus-ring bg-surface border border-line text-sm rounded-md px-4 py-2">خروجی CSV</button><button onClick={()=>showForm?setShowForm(false):openNew()} className="focus-ring bg-brass text-white text-sm rounded-md px-4 py-2 font-semibold">{showForm?'بستن فرم':'+ فاکتور جدید'}</button></div>
  </div>
  {error&&<div role="alert" className="text-badText text-xs bg-bad/10 rounded-md px-3 py-2 mb-4">{error}</div>}
  {showForm&&<form onSubmit={submit} className="bg-surface border border-line rounded-xl p-5 mb-6">
   <div className="flex justify-between mb-4"><b>{editingId?'ویرایش پیش‌نویس':'فاکتور جدید'}</b>{settings.tax_enabled&&<span className="text-xs text-goodText">مالیات فعال: {taxRate}%</span>}</div>
   <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
    <div><label className="block text-xs text-ink/60 mb-1">مشتری *</label><select value={header.customer_id} onChange={e=>setHeader({...header,customer_id:e.target.value})} className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm bg-surface"><option value="">انتخاب کنید…</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
    <div><label className="block text-xs text-ink/60 mb-1">شماره فاکتور</label><input value={header.invoice_number} onChange={e=>setHeader({...header,invoice_number:e.target.value})} placeholder="خودکار" className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm"/></div>
    <div><label className="block text-xs text-ink/60 mb-1">تاریخ صدور *</label><JalaliDatePicker value={header.issue_date} onChange={v=>setHeader({...header,issue_date:v})} className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm bg-surface"/></div>
    <div><label className="block text-xs text-ink/60 mb-1">تاریخ سررسید *</label><JalaliDatePicker value={header.due_date} onChange={v=>setHeader({...header,due_date:v})} className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm bg-surface"/></div>
    {!editingId&&<div><label className="block text-xs text-ink/60 mb-1">وضعیت اولیه</label><select value={header.status} onChange={e=>setHeader({...header,status:e.target.value})} className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm bg-surface"><option value="DRAFT">پیش‌نویس</option><option value="POSTED">ثبت‌شده</option></select></div>}
   </div>
   <div className="text-xs text-ink/60 mb-2">اقلام فاکتور *</div>
   <div className="space-y-2 mb-3">{lines.map((l,i)=><div key={i} className="grid grid-cols-12 gap-2 items-center rounded-md p-2 bg-paper">
    <select value={l.product_id} onChange={e=>pickProduct(i,e.target.value)} className="focus-ring col-span-12 sm:col-span-4 rounded-md border border-line px-2 py-2 text-xs bg-surface"><option value="">کالا را انتخاب کنید…</option>{products.map(p=><option key={p.id} value={p.id}>{p.name} — موجودی {p.stock_qty}</option>)}</select>
    <input value={l.product_name} onChange={e=>updateLine(i,{product_name:e.target.value})} placeholder="شرح قلم" className="focus-ring col-span-7 sm:col-span-3 rounded-md border border-line px-2 py-2 text-xs"/>
    <input type="number" min="0" step="any" value={l.quantity} onChange={e=>updateLine(i,{quantity:e.target.value})} className="focus-ring col-span-5 sm:col-span-2 rounded-md border border-line px-2 py-2 text-xs" placeholder="تعداد"/>
    <MoneyInput value={l.unit_price} onChange={v=>updateLine(i,{unit_price:v})} className="focus-ring col-span-7 sm:col-span-2 rounded-md border border-line px-2 py-2 text-xs" placeholder="قیمت واحد"/>
    <button type="button" onClick={()=>removeLine(i)} className="focus-ring col-span-5 sm:col-span-1 text-badText text-xs">حذف</button>
    <div className="col-span-12 text-left text-xs text-ink/50">{money(Number(l.quantity)*Number(l.unit_price))}</div>
   </div>)}</div>
   <button type="button" onClick={addLine} className="focus-ring text-xs text-brass mb-4">+ افزودن قلم</button>
   <div className="grid sm:grid-cols-3 gap-3 mb-4">
    <div><label className="block text-xs text-ink/60 mb-1">نوع تخفیف</label><select value={header.discount_type} onChange={e=>setHeader({...header,discount_type:e.target.value})} className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm bg-surface"><option value="amount">مبلغ ثابت</option><option value="percent">درصد</option></select></div>
    <div><label className="block text-xs text-ink/60 mb-1">میزان تخفیف</label><MoneyInput value={header.discount_value} onChange={v=>setHeader({...header,discount_value:v})} className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm" placeholder="0"/></div>
    <div><label className="block text-xs text-ink/60 mb-1">هزینه ارسال</label><MoneyInput value={header.shipping_amount} onChange={v=>setHeader({...header,shipping_amount:v})} className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm" placeholder="0"/></div>
   </div>
   <div className="bg-ink text-paper rounded-lg px-4 py-3 mb-4 space-y-1 text-sm">
    <div className="flex justify-between"><span>جمع اقلام</span><span>{money(subtotal)}</span></div>
    <div className="flex justify-between"><span>تخفیف</span><span>- {money(discount)}</span></div>
    {settings.tax_enabled&&<div className="flex justify-between"><span>مالیات ({taxRate}%)</span><span>{money(tax)}</span></div>}
    <div className="flex justify-between"><span>ارسال</span><span>{money(shipping)}</span></div>
    <div className="flex justify-between border-t border-white/10 pt-2 font-bold"><span>جمع کل</span><span>{money(total)}</span></div>
   </div>
   <label className="block text-xs text-ink/60 mb-1">توضیحات</label><textarea value={header.description} onChange={e=>setHeader({...header,description:e.target.value})} rows={2} className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm mb-4"/>
   <button disabled={submitting} className="focus-ring bg-ink text-white text-sm rounded-md px-4 py-2 font-semibold disabled:opacity-60">{submitting?'در حال ثبت…':editingId?'ذخیره پیش‌نویس':header.status==='POSTED'?'ثبت فاکتور و کسر موجودی':'ذخیره پیش‌نویس'}</button>
  </form>}
  <div className="bg-surface border border-line rounded-xl overflow-x-auto"><table className="ledger"><thead><tr><th>صدور</th><th>سررسید</th><th>مشتری</th><th>شماره</th><th>جمع کل</th><th>وضعیت</th><th></th></tr></thead>
  <tbody>{loading?<TableSkeleton columns={7}/>:rows.length===0?<tr><td colSpan={7} className="text-center text-ink/40 py-8">فاکتوری یافت نشد.</td></tr>:rows.map(inv=><React.Fragment key={inv.id}>
   <tr><td>{formatJalaliShort(inv.issue_date)}</td><td>{formatJalaliShort(inv.due_date)}</td><td className="font-medium">{inv.customers?.name||'—'}</td><td>{inv.invoice_number||'—'}</td><td>{money(inv.total_amount)}</td><td><span className="text-xs rounded-full px-2 py-1 bg-ink/5">{STATUS_LABELS[inv.status]||inv.status}</span></td>
   <td className="whitespace-nowrap"><button onClick={()=>toggle(inv.id)} className="focus-ring text-xs text-brass ml-2">اقلام</button>{inv.status==='DRAFT'&&<button onClick={()=>openEdit(inv)} className="focus-ring text-xs text-brass ml-2">ویرایش</button>}{inv.status==='DRAFT'&&<button onClick={()=>ask(inv.id,'post')} className="focus-ring text-xs text-goodText ml-2">ثبت نهایی</button>}{inv.status==='POSTED'&&<button onClick={()=>ask(inv.id,'void')} className="focus-ring text-xs text-badText ml-2">ابطال</button>}{inv.status==='DRAFT'&&<button onClick={()=>ask(inv.id,'delete')} className="focus-ring text-xs text-badText ml-2">حذف</button>}<Link href={'/invoice-print?id='+inv.id} target="_blank" className="focus-ring text-xs text-brass">چاپ/PDF</Link></td></tr>
   {expanded===inv.id&&<tr><td colSpan={7} className="bg-paper">{!itemsCache[inv.id]?<span className="text-xs text-ink/40">در حال بارگذاری…</span>:<div className="py-2 space-y-1">{itemsCache[inv.id].map(it=><div key={it.id} className="flex justify-between text-xs"><span>{it.product_name} × {it.quantity}</span><span>{money(Number(it.quantity)*Number(it.unit_price))}</span></div>)}</div>}<div className="text-xs text-ink/60 mt-2">تخفیف: {money(inv.discount_amount)} · مالیات: {money(inv.tax_amount)} · ارسال: {money(inv.shipping_amount)}</div></td></tr>}
  </React.Fragment>)}</tbody></table><Pagination page={page} totalPages={totalPages} onChange={setPage} totalCount={filtered.length} pageSize={PAGE_SIZE}/></div>
  <ConfirmDialog open={confirm.open} title={confirm.mode==='post'?'ثبت نهایی فاکتور':confirm.mode==='void'?'ابطال فاکتور':'حذف پیش‌نویس'} description={confirm.mode==='post'?'فاکتور ثبت می‌شود و موجودی به‌صورت اتمیک کاهش می‌یابد.':confirm.mode==='void'?'فاکتور باطل و اثر موجودی آن به‌صورت اتمیک برگشت می‌خورد.':'فقط پیش‌نویس حذف می‌شود؛ فاکتور ثبت‌شده قابل حذف نیست.'} confirmLabel={confirm.mode==='post'?'ثبت نهایی':confirm.mode==='void'?'ابطال':'حذف'} busy={confirm.busy} onConfirm={run} onCancel={()=>setConfirm({open:false,id:null,mode:null,busy:false})}/>
 </Layout>;
}
