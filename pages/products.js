import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import Pagination from '../components/Pagination';
import MoneyInput from '../components/MoneyInput';
import { TableSkeleton } from '../components/Skeleton';
import ConfirmDialog from '../components/ConfirmDialog';
import { supabase } from '../lib/supabaseClient';
import { friendlyError } from '../lib/errorMessages';

const PAGE_SIZE=15;
const UNITS=['عدد','کیلوگرم','گرم','متر','لیتر','بسته','جعبه'];
const emptyForm={id:null,name:'',sku:'',barcode:'',category:'',unit:'عدد',purchase_price:'',sale_price:'',min_stock:'',is_active:true};
const input='focus-ring w-full rounded-md border border-line px-3 py-2 text-sm';
const label='block text-xs text-ink/60 mb-1';

function money(n){return new Intl.NumberFormat('fa-IR').format(Math.round(Number(n)||0))+' تومان';}

export default function Products(){
 const [rows,setRows]=useState([]),[stock,setStock]=useState({}),[loading,setLoading]=useState(true);
 const [form,setForm]=useState(emptyForm),[showForm,setShowForm]=useState(false),[error,setError]=useState('');
 const [search,setSearch]=useState(''),[page,setPage]=useState(1);
 const [confirmDelete,setConfirmDelete]=useState({open:false,id:null,busy:false});
 useEffect(()=>{load();},[]);
 async function load(){
  setLoading(true);
  const [a,b]=await Promise.all([
   supabase.from('products').select('id,name,sku,barcode,category,unit,purchase_price,sale_price,min_stock,is_active,created_at,updated_at').order('name'),
   supabase.from('warehouse_stock').select('product_id,quantity')
  ]);
  if(a.error)setError(friendlyError(a.error,'خطا در دریافت کالاها.'));
  else if(b.error)setError(friendlyError(b.error,'خطا در دریافت موجودی.'));
  const totals={};(b.data||[]).forEach(s=>{totals[s.product_id]=(totals[s.product_id]||0)+Number(s.quantity||0);});
  setRows(a.data||[]);setStock(totals);setLoading(false);
 }
 function editRow(p){
  setForm({id:p.id,name:p.name||'',sku:p.sku||'',barcode:p.barcode||'',category:p.category||'',unit:p.unit||'عدد',
   purchase_price:p.purchase_price??'',sale_price:p.sale_price??'',min_stock:p.min_stock??'',is_active:p.is_active!==false});
  setError('');setShowForm(true);
 }
 async function submit(e){
  e.preventDefault();setError('');
  if(!form.name.trim())return setError('نام کالا الزامی است.');
  const payload={name:form.name.trim(),sku:form.sku.trim()||null,barcode:form.barcode.trim()||null,category:form.category.trim()||null,
   unit:form.unit,purchase_price:Number(form.purchase_price||0),sale_price:Number(form.sale_price||0),price:Number(form.sale_price||0),
   min_stock:Number(form.min_stock||0),is_active:!!form.is_active};
  if(payload.purchase_price<0||payload.sale_price<0||payload.min_stock<0)return setError('قیمت‌ها و حداقل موجودی نمی‌توانند منفی باشند.');
  const r=form.id?await supabase.from('products').update(payload).eq('id',form.id):await supabase.from('products').insert(payload);
  if(r.error)return setError(friendlyError(r.error,'خطا در ذخیره کالا. SKU و بارکد باید در هر کسب‌وکار یکتا باشند.'));
  setForm(emptyForm);setShowForm(false);await load();
 }
 async function del(){
  setConfirmDelete(c=>({...c,busy:true}));
  const r=await supabase.from('products').delete().eq('id',confirmDelete.id);
  if(r.error){setConfirmDelete({open:false,id:null,busy:false});return setError(friendlyError(r.error,'این کالا به سوابق انبار یا اسناد متصل است و قابل حذف نیست.'));}
  setConfirmDelete({open:false,id:null,busy:false});await load();
 }
 const filtered=rows.filter(r=>{const q=search.trim().toLowerCase();return !q||[r.name,r.sku,r.barcode,r.category].some(v=>String(v||'').toLowerCase().includes(q));});
 useEffect(()=>setPage(1),[search]);
 const totalPages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE)),pageRows=filtered.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE);
 return <Layout title="کالاها">
  <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
   <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="جست‌وجو نام، SKU، بارکد یا دسته‌بندی…" className={input+' w-full sm:w-80'}/>
   <button onClick={()=>{setForm(emptyForm);setError('');setShowForm(s=>!s)}} className="focus-ring bg-brass hover:bg-brassDark text-white text-sm rounded-md px-4 py-2 font-semibold">{showForm?'بستن فرم':'+ کالای جدید'}</button>
  </div>
  {error&&<div className="text-badText text-xs bg-bad/10 rounded-md px-3 py-2 mb-4">{error}</div>}
  {showForm&&<form onSubmit={submit} className="bg-surface border border-line rounded-xl p-5 mb-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
   <div className="lg:col-span-2"><label className={label}>نام کالا *</label><input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className={input}/></div>
   <div><label className={label}>SKU</label><input value={form.sku} onChange={e=>setForm({...form,sku:e.target.value})} className={input}/></div>
   <div><label className={label}>بارکد</label><input value={form.barcode} onChange={e=>setForm({...form,barcode:e.target.value})} className={input}/></div>
   <div><label className={label}>دسته‌بندی</label><input value={form.category} onChange={e=>setForm({...form,category:e.target.value})} className={input}/></div>
   <div><label className={label}>واحد</label><select value={form.unit} onChange={e=>setForm({...form,unit:e.target.value})} className={input+' bg-surface'}>{UNITS.map(u=><option key={u}>{u}</option>)}</select></div>
   <div><label className={label}>قیمت خرید</label><MoneyInput value={form.purchase_price} onChange={v=>setForm({...form,purchase_price:v})} className={input}/></div>
   <div><label className={label}>قیمت فروش</label><MoneyInput value={form.sale_price} onChange={v=>setForm({...form,sale_price:v})} className={input}/></div>
   <div><label className={label}>حداقل موجودی</label><input type="number" min="0" step="any" value={form.min_stock} onChange={e=>setForm({...form,min_stock:e.target.value})} className={input}/></div>
   <label className="flex items-center gap-2 text-sm mt-6"><input type="checkbox" checked={form.is_active} onChange={e=>setForm({...form,is_active:e.target.checked})}/> کالا فعال است</label>
   <div className="sm:col-span-2 lg:col-span-4"><button className="focus-ring bg-ink text-white text-sm rounded-md px-4 py-2 font-semibold">{form.id?'ذخیره تغییرات':'ثبت کالا'}</button></div>
  </form>}
  <div className="bg-surface border border-line rounded-xl overflow-x-auto"><table className="ledger">
   <thead><tr><th>کالا</th><th>SKU / بارکد</th><th>دسته‌بندی</th><th>واحد</th><th>خرید</th><th>فروش</th><th>موجودی</th><th>وضعیت</th><th></th></tr></thead>
   <tbody>{loading?<TableSkeleton columns={9}/>:pageRows.length===0?<tr><td colSpan={9} className="text-center text-ink/40 py-6">کالایی یافت نشد.</td></tr>:
    pageRows.map(p=>{const qty=stock[p.id]||0,low=qty<=Number(p.min_stock||0);return <tr key={p.id}><td className="font-medium">{p.name}</td><td className="text-xs">{p.sku||'—'}<br/>{p.barcode||'—'}</td><td>{p.category||'—'}</td><td>{p.unit}</td><td>{money(p.purchase_price)}</td><td>{money(p.sale_price)}</td><td className={low?'text-badText font-semibold':''}>{new Intl.NumberFormat('fa-IR').format(qty)} {p.unit}</td><td>{p.is_active?<span className="text-goodText">فعال</span>:<span className="text-ink/40">غیرفعال</span>}</td><td className="whitespace-nowrap"><button onClick={()=>editRow(p)} className="focus-ring text-xs text-brass hover:underline ml-3">ویرایش</button><button onClick={()=>setConfirmDelete({open:true,id:p.id,busy:false})} className="focus-ring text-xs text-badText hover:underline">حذف</button></td></tr>})}</tbody>
  </table><Pagination page={page} totalPages={totalPages} onChange={setPage} totalCount={filtered.length} pageSize={PAGE_SIZE}/></div>
  <ConfirmDialog open={confirmDelete.open} title="حذف کالا" description="این کالا حذف شود؟ سوابق انبار قابل حذف خودکار نیستند." confirmLabel="حذف کالا" busy={confirmDelete.busy} onConfirm={del} onCancel={()=>setConfirmDelete({open:false,id:null,busy:false})}/>
 </Layout>;
}