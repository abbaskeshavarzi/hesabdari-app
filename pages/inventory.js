import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { TableSkeleton } from '../components/Skeleton';
import { formatJalaliShort } from '../lib/dateFormat';
import { supabase } from '../lib/supabaseClient';
import { friendlyError } from '../lib/errorMessages';

const emptyMove={type:'in',warehouse_id:'',product_id:'',quantity:'',delta:'',reason:''};
const emptyTransfer={from:'',to:'',product_id:'',quantity:'',reason:''};
const input='focus-ring w-full rounded-md border border-line px-3 py-2 text-sm';
const label='block text-xs text-ink/60 mb-1';
function fmt(n){return new Intl.NumberFormat('fa-IR').format(Number(n||0));}

export default function Inventory(){
 const [warehouses,setWarehouses]=useState([]),[products,setProducts]=useState([]),[stocks,setStocks]=useState([]),[movements,setMovements]=useState([]);
 const [move,setMove]=useState(emptyMove),[transfer,setTransfer]=useState(emptyTransfer);
 const [showMove,setShowMove]=useState(false),[showTransfer,setShowTransfer]=useState(false),[showWarehouse,setShowWarehouse]=useState(false);
 const [warehouseName,setWarehouseName]=useState(''),[warehouseCode,setWarehouseCode]=useState(''),[selected,setSelected]=useState('');
 const [loading,setLoading]=useState(true),[error,setError]=useState('');
 useEffect(()=>{load();},[]);
 async function load(){
  setLoading(true);
  const [w,p,s,m]=await Promise.all([
   supabase.from('warehouses').select('id,name,code,is_active').order('name'),
   supabase.from('products').select('id,name,unit,sku,min_stock,is_active').order('name'),
   supabase.from('warehouse_stock').select('id,warehouse_id,product_id,quantity,updated_at'),
   supabase.from('stock_movements').select('id,warehouse_id,product_id,change_qty,quantity,movement_type,reason,created_at,transfer_id,products(name,unit),warehouses(name)').order('created_at',{ascending:false}).limit(100)
  ]);
  const er=[w.error,p.error,s.error,m.error].find(Boolean);if(er)setError(friendlyError(er,'خطا در دریافت اطلاعات انبار.'));
  const active=(w.data||[]).filter(x=>x.is_active);setWarehouses(w.data||[]);setProducts((p.data||[]).filter(x=>x.is_active));setStocks(s.data||[]);setMovements(m.data||[]);
  setSelected(cur=>cur||active[0]?.id||'');setLoading(false);
 }
 async function movement(e){
  e.preventDefault();setError('');
  const qty=Number(move.quantity);
  if(!move.warehouse_id||!move.product_id)return setError('انبار و کالا را انتخاب کنید.');
  if(move.type==='adjust'){
   const delta=Number(move.delta);if(!delta)return setError('مقدار اصلاح نمی‌تواند صفر باشد.');
   const r=await supabase.rpc('stock_adjust',{p_warehouse_id:move.warehouse_id,p_product_id:move.product_id,p_delta:delta,p_reason:move.reason||'اصلاح موجودی'});
   if(r.error)return setError(friendlyError(r.error,'اصلاح موجودی انجام نشد.'));
  }else{
   if(!qty||qty<=0)return setError('مقدار معتبر الزامی است.');
   const fn=move.type==='in'?'stock_receive':'stock_issue';
   const r=await supabase.rpc(fn,{p_warehouse_id:move.warehouse_id,p_product_id:move.product_id,p_quantity:qty,p_reason:move.reason||(move.type==='in'?'ورود کالا':'خروج کالا')});
   if(r.error)return setError(friendlyError(r.error,'عملیات موجودی انجام نشد.'));
  }
  setMove(emptyMove);setShowMove(false);await load();
 }
 async function doTransfer(e){
  e.preventDefault();setError('');const qty=Number(transfer.quantity);
  if(!transfer.from||!transfer.to||transfer.from===transfer.to||!transfer.product_id||!qty||qty<=0)return setError('مبدأ، مقصد، کالا و مقدار معتبر الزامی است.');
  const r=await supabase.rpc('stock_transfer',{p_from_warehouse_id:transfer.from,p_to_warehouse_id:transfer.to,p_product_id:transfer.product_id,p_quantity:qty,p_reason:transfer.reason||'انتقال بین انبارها'});
  if(r.error)return setError(friendlyError(r.error,'انتقال موجودی انجام نشد.'));
  setTransfer(emptyTransfer);setShowTransfer(false);await load();
 }
 async function addWarehouse(e){
  e.preventDefault();setError('');if(!warehouseName.trim())return setError('نام انبار الزامی است.');
  const r=await supabase.from('warehouses').insert({name:warehouseName.trim(),code:warehouseCode.trim()||null});
  if(r.error)return setError(friendlyError(r.error,'خطا در ثبت انبار.'));
  setWarehouseName('');setWarehouseCode('');setShowWarehouse(false);await load();
 }
 async function toggle(w){
  const r=await supabase.from('warehouses').update({is_active:!w.is_active}).eq('id',w.id);
  if(r.error)setError(friendlyError(r.error,'خطا در تغییر وضعیت انبار.'));else await load();
 }
 const active=warehouses.filter(w=>w.is_active),visible=selected?stocks.filter(s=>s.warehouse_id===selected):[];
 const productById=id=>products.find(p=>p.id===id);
 return <Layout title="انبار و موجودی">
  <div className="flex flex-wrap gap-2 justify-between items-center mb-4">
   <div className="flex gap-2 items-center"><select value={selected} onChange={e=>setSelected(e.target.value)} className={input+' bg-surface'}><option value="">انتخاب انبار…</option>{active.map(w=><option key={w.id} value={w.id}>{w.name}{w.code?' ('+w.code+')':''}</option>)}</select><button onClick={()=>{setError('');setShowWarehouse(s=>!s)}} className="focus-ring border border-line text-sm rounded-md px-3 py-2">+ انبار</button></div>
   <div className="flex gap-2"><button onClick={()=>{setMove({...emptyMove,warehouse_id:selected});setShowMove(s=>!s)}} className="focus-ring bg-brass text-white text-sm rounded-md px-4 py-2 font-semibold">ورود / خروج / اصلاح</button><button onClick={()=>{setTransfer({...emptyTransfer,from:selected});setShowTransfer(s=>!s)}} className="focus-ring bg-ink text-white text-sm rounded-md px-4 py-2 font-semibold">انتقال بین انبارها</button></div>
  </div>
  {error&&<div className="text-badText text-xs bg-bad/10 rounded-md px-3 py-2 mb-4">{error}</div>}
  {showWarehouse&&<form onSubmit={addWarehouse} className="bg-surface border border-line rounded-xl p-4 mb-4 grid sm:grid-cols-3 gap-3"><div><label className={label}>نام انبار *</label><input value={warehouseName} onChange={e=>setWarehouseName(e.target.value)} className={input}/></div><div><label className={label}>کد انبار</label><input value={warehouseCode} onChange={e=>setWarehouseCode(e.target.value)} className={input}/></div><div className="flex items-end"><button className="focus-ring bg-ink text-white text-sm rounded-md px-4 py-2">ثبت انبار</button></div></form>}
  {showMove&&<form onSubmit={movement} className="bg-surface border border-line rounded-xl p-5 mb-5 grid sm:grid-cols-4 gap-3">
   <div><label className={label}>انبار</label><select value={move.warehouse_id} onChange={e=>setMove({...move,warehouse_id:e.target.value})} className={input+' bg-surface'}>{active.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
   <div><label className={label}>کالا</label><select value={move.product_id} onChange={e=>setMove({...move,product_id:e.target.value})} className={input+' bg-surface'}><option value="">انتخاب…</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}{p.sku?' — '+p.sku:''}</option>)}</select></div>
   <div><label className={label}>عملیات</label><select value={move.type} onChange={e=>setMove({...move,type:e.target.value})} className={input+' bg-surface'}><option value="in">ورود کالا</option><option value="out">خروج کالا</option><option value="adjust">اصلاح موجودی</option></select></div>
   <div><label className={label}>{move.type==='adjust'?'تغییر (+/-)':'مقدار'}</label><input type="number" step="any" value={move.type==='adjust'?move.delta:move.quantity} onChange={e=>setMove({...move,[move.type==='adjust'?'delta':'quantity']:e.target.value})} className={input}/></div>
   <div className="sm:col-span-3"><label className={label}>دلیل</label><input value={move.reason} onChange={e=>setMove({...move,reason:e.target.value})} className={input}/></div><div className="flex items-end"><button className="focus-ring bg-ink text-white text-sm rounded-md px-4 py-2">ثبت عملیات</button></div>
  </form>}
  {showTransfer&&<form onSubmit={doTransfer} className="bg-surface border border-line rounded-xl p-5 mb-5 grid sm:grid-cols-4 gap-3">
   <div><label className={label}>مبدأ</label><select value={transfer.from} onChange={e=>setTransfer({...transfer,from:e.target.value})} className={input+' bg-surface'}>{active.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
   <div><label className={label}>مقصد</label><select value={transfer.to} onChange={e=>setTransfer({...transfer,to:e.target.value})} className={input+' bg-surface'}><option value="">انتخاب…</option>{active.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
   <div><label className={label}>کالا</label><select value={transfer.product_id} onChange={e=>setTransfer({...transfer,product_id:e.target.value})} className={input+' bg-surface'}><option value="">انتخاب…</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
   <div><label className={label}>مقدار</label><input type="number" step="any" value={transfer.quantity} onChange={e=>setTransfer({...transfer,quantity:e.target.value})} className={input}/></div>
   <div className="sm:col-span-3"><label className={label}>دلیل</label><input value={transfer.reason} onChange={e=>setTransfer({...transfer,reason:e.target.value})} className={input}/></div><div className="flex items-end"><button className="focus-ring bg-ink text-white text-sm rounded-md px-4 py-2">ثبت انتقال اتمیک</button></div>
  </form>}
  <div className="bg-surface border border-line rounded-xl overflow-x-auto mb-6"><div className="px-4 py-3 border-b border-line font-semibold text-sm">موجودی فعلی</div><table className="ledger"><thead><tr><th>کالا</th><th>SKU</th><th>واحد</th><th>موجودی</th><th>حداقل</th></tr></thead><tbody>
   {loading?<TableSkeleton columns={5}/>:visible.length===0?<tr><td colSpan={5} className="text-center text-ink/40 py-6">برای این انبار موجودی ثبت نشده است.</td></tr>:visible.map(s=>{const p=productById(s.product_id);if(!p)return null;return <tr key={s.id}><td className="font-medium">{p.name}</td><td>{p.sku||'—'}</td><td>{p.unit}</td><td className={Number(s.quantity)<=0?'text-badText font-semibold':''}>{fmt(s.quantity)}</td><td>{fmt(p.min_stock)}</td></tr>})}
  </tbody></table></div>
  <div className="bg-surface border border-line rounded-xl overflow-x-auto mb-6"><div className="px-4 py-3 border-b border-line font-semibold text-sm">انبارها</div><table className="ledger"><thead><tr><th>نام</th><th>کد</th><th>وضعیت</th><th></th></tr></thead><tbody>{warehouses.map(w=><tr key={w.id}><td className="font-medium">{w.name}</td><td>{w.code||'—'}</td><td>{w.is_active?'فعال':'غیرفعال'}</td><td><button onClick={()=>toggle(w)} className="text-xs text-brass hover:underline">{w.is_active?'غیرفعال‌کردن':'فعال‌کردن'}</button></td></tr>)}</tbody></table></div>
  <div className="bg-surface border border-line rounded-xl overflow-x-auto"><div className="px-4 py-3 border-b border-line font-semibold text-sm">آخرین ۱۰۰ گردش موجودی</div><table className="ledger"><thead><tr><th>تاریخ</th><th>انبار</th><th>کالا</th><th>نوع</th><th>تغییر</th><th>دلیل</th></tr></thead><tbody>
   {movements.length===0?<tr><td colSpan={6} className="text-center text-ink/40 py-6">گردشی ثبت نشده است.</td></tr>:movements.map(m=><tr key={m.id}><td>{formatJalaliShort(m.created_at)}</td><td>{m.warehouses?.name||'—'}</td><td>{m.products?.name||'—'}</td><td>{m.movement_type}</td><td className={Number(m.change_qty)>0?'text-goodText font-semibold':'text-badText font-semibold'}>{Number(m.change_qty)>0?'+':''}{fmt(m.change_qty)} {m.products?.unit||''}</td><td className="text-ink/60">{m.reason||'—'}</td></tr>)}
  </tbody></table></div>
 </Layout>;
}