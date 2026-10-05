"use client";
import {useEffect} from "react";

/* On a phone every register table becomes a stack of cards, one per row, each value
   named by its column (mobile.css). The names come from the table's own header, copied
   onto its cells here, so no screen has to repeat them - and new rows, new pages and new
   screens are labelled as they appear. Material's tables label themselves already (.t). */
function label(table:HTMLTableElement){
  const head=table.tHead?.rows[table.tHead.rows.length-1];
  if(!head)return;
  const names:string[]=[];
  for(const th of Array.from(head.cells))
    for(let i=0;i<(th.colSpan||1);i++)names.push((th.textContent||"").trim());
  for(const body of Array.from(table.tBodies))
    for(const row of Array.from(body.rows)){
      let col=0;
      for(const cell of Array.from(row.cells)){
        const span=cell.colSpan||1;
        if(span>1||row.cells.length===1){cell.setAttribute("data-span","");cell.setAttribute("data-label","")}
        else{cell.removeAttribute("data-span");
          const name=names[col]??"";
          if(cell.getAttribute("data-label")!==name)cell.setAttribute("data-label",name)}
        col+=span}}}

export default function ResponsiveTables(){
  useEffect(()=>{
    let queued=0;
    const run=()=>{queued=0;
      document.querySelectorAll<HTMLTableElement>(".shell table:not(.t)").forEach(label)};
    const soon=()=>{if(!queued)queued=requestAnimationFrame(run)};
    run();
    const watch=new MutationObserver(soon);
    watch.observe(document.body,{childList:true,subtree:true,characterData:true});
    return()=>{watch.disconnect();if(queued)cancelAnimationFrame(queued)}},[]);
  return null}
