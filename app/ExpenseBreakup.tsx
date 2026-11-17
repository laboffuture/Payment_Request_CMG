"use client";
import{useEffect,useState}from"react";
import{Paperclip,Plus,Trash2}from"lucide-react";
import{EXPENSE_CATEGORIES,expenseTotal,payableToEmployee,readExpenseLines}from"../lib/expense-lines";

/* Petty cash expense submission: the breakup table on the request form, and the same lines
   read back on the request page. */

export type ExpenseRow={key:number;date:string;category:string;description:string;amount:string;
  file:File|null};

let nextKey=1;
export const blankExpenseRow=():ExpenseRow=>({key:nextKey++,date:"",category:"",description:"",amount:"",file:null});

/* The file name a row's bill is uploaded under, so the request page can find it again. */
export const billName=(sn:number,file:File)=>`S.No ${sn} - ${file.name}`;

const money=(n:number)=>n.toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});

/* Categories someone added in this browser stay offered next time. */
const SAVED="pr.expenseCategories";
function useCategories(){
  /* The form opens on a click, never on the server's first render, so reading here is safe. */
  const[custom,setCustom]=useState<string[]>(()=>{try{const v=JSON.parse(localStorage.getItem(SAVED)||"[]");
    return Array.isArray(v)?v.filter(x=>typeof x==="string"):[]}catch{return []}});
  const add=(name:string)=>setCustom(c=>{
    const next=[...c.filter(x=>x.toLowerCase()!==name.toLowerCase()),name];
    try{localStorage.setItem(SAVED,JSON.stringify(next.slice(-30)))}catch{}
    return next});
  const all=[...EXPENSE_CATEGORIES,...custom.filter(c=>!EXPENSE_CATEGORIES.some(d=>d.toLowerCase()===c.toLowerCase()))];
  return{all,add};
}

export function ExpenseSummary({advance,total,currency}:{advance:number;total:number;currency:string}){
  const payable=Math.round((total-advance)*100)/100;
  return <div className="xb-summary wide">
    <div><span>Advance received</span><b>{currency} {money(advance)}</b></div>
    <div><span>Total expenses</span><b>{currency} {money(total)}</b></div>
    <div className={payable<0?"xb-return":"xb-pay"}><span>{payable<0?"Employee to return":"Payable to employee"}</span>
      <b>{currency} {money(Math.abs(payable))}</b></div>
  </div>;
}

export function ExpenseBreakupEditor({rows,setRows,currency}:{rows:ExpenseRow[];
  setRows:(f:(rows:ExpenseRow[])=>ExpenseRow[])=>void;currency:string}){
  const cats=useCategories();
  const[adding,setAdding]=useState<number|null>(null),[newCat,setNewCat]=useState("");
  const set=(key:number,patch:Partial<ExpenseRow>)=>setRows(rs=>rs.map(r=>r.key===key?{...r,...patch}:r));
  const today=new Date().toISOString().slice(0,10);
  const saveCat=(key:number)=>{const name=newCat.trim().slice(0,60);
    if(name){cats.add(name);set(key,{category:name})}
    setAdding(null);setNewCat("")};
  return <div className="xb wide">
    <div className="xb-head"><b>Expense breakup</b><span>One line per bill. The total fills in Total expenses.</span></div>
    <div className="xb-scroll"><table className="xb-table">
      <thead><tr><th>S.No</th><th>Expense date</th><th>Expense category</th><th>Description</th>
        <th className="num">Amount ({currency})</th><th>Bill</th><th>Action</th></tr></thead>
      <tbody>{rows.map((r,i)=><tr key={r.key}>
        <td className="sn">{i+1}</td>
        <td><input type="date" required max={today} value={r.date} onChange={e=>set(r.key,{date:e.target.value})}/></td>
        <td>{adding===r.key
          ?<span className="xb-newcat"><input autoFocus placeholder="New category" value={newCat} maxLength={60}
              onChange={e=>setNewCat(e.target.value)}
              onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();saveCat(r.key)}if(e.key==="Escape")setAdding(null)}}/>
            <button type="button" onClick={()=>saveCat(r.key)}>Add</button></span>
          :<select required value={r.category} onChange={e=>{
              if(e.target.value==="__add"){setAdding(r.key);setNewCat("")}else set(r.key,{category:e.target.value})}}>
            <option value="">— choose —</option>
            {(cats.all.includes(r.category)||!r.category?cats.all:[...cats.all,r.category]).map(c=><option key={c}>{c}</option>)}
            <option value="__add">+ Add item…</option>
          </select>}</td>
        <td><input required maxLength={300} placeholder="What was it for" value={r.description}
          onChange={e=>set(r.key,{description:e.target.value})}/></td>
        <td><input className="num" type="number" required min="0.01" step="0.01" inputMode="decimal" value={r.amount}
          onChange={e=>set(r.key,{amount:e.target.value})}/></td>
        <td><label className={"xb-bill"+(r.file?" has":"")} title={r.file?.name||"Upload the bill"}>
          <Paperclip/><span>{r.file?r.file.name:"Upload bill"}</span>
          <input type="file" accept="image/*,application/pdf" onChange={e=>set(r.key,{file:e.target.files?.[0]||null})}/></label></td>
        <td><button type="button" className="xb-del" title="Delete this line" disabled={rows.length<2}
          onClick={()=>setRows(rs=>rs.filter(x=>x.key!==r.key))}><Trash2/></button></td>
      </tr>)}</tbody>
      <tfoot><tr><td colSpan={4}>Total expenses</td><td className="num">{money(expenseTotal(rows))}</td><td colSpan={2}/></tr></tfoot>
    </table></div>
    <button type="button" className="xb-add" onClick={()=>setRows(rs=>[...rs,blankExpenseRow()])}><Plus/>Add item</button>
  </div>;
}

type Att={id:string;fileName:string};

/* The request page: the lines as submitted, each bill opening from its row. */
export function ExpenseBreakupView({raw,advance,currency,paymentId}:{raw:unknown;advance:string;currency:string;paymentId:number}){
  const lines=readExpenseLines(raw);
  const[files,setFiles]=useState<Att[]>([]);
  useEffect(()=>{let live=true;
    fetch(`/api/attachments?entityType=payment&entityId=${encodeURIComponent(String(paymentId))}`)
      .then(r=>r.json() as Promise<{attachments?:Att[]}>).then(d=>{if(live)setFiles(d.attachments||[])}).catch(()=>{});
    return()=>{live=false}},[paymentId]);
  if(!lines.length)return null;
  const total=expenseTotal(lines);
  return <section className="xb xb-view">
    <h4>Expense breakup</h4>
    <div className="xb-scroll"><table className="xb-table">
      <thead><tr><th>S.No</th><th>Date</th><th>Category</th><th>Description</th><th className="num">Amount</th><th>Bill</th></tr></thead>
      <tbody>{lines.map(l=>{const f=files.find(a=>a.fileName===l.bill);
        return <tr key={l.sn}><td className="sn">{l.sn}</td><td>{l.date}</td><td>{l.category}</td><td>{l.description}</td>
          <td className="num">{money(l.amount)}</td>
          <td>{f?<a className="wf-attach-link" href={`/api/attachments?id=${encodeURIComponent(f.id)}`} target="_blank" rel="noreferrer"><Paperclip/>Bill</a>
            :<span className="xb-nobill">{l.bill?"—":"No bill"}</span>}</td></tr>})}</tbody>
      <tfoot><tr><td colSpan={4}>Total expenses</td><td className="num">{money(total)}</td><td/></tr></tfoot>
    </table></div>
    <ExpenseSummary advance={Number(advance)||0} total={total} currency={currency}/>
  </section>;
}

export{payableToEmployee};
