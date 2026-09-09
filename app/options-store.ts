"use client";
import{useEffect,useState}from"react";

/* The administrator-maintained dropdown choices, fetched once and shared.

   Every caller passes what the list used to be hardcoded as. If the request fails, or
   an administrator empties a list, the form falls back to that rather than showing an
   empty dropdown - a screen with no choices is worse than a stale one. */

let cache:Record<string,string[]>|null=null;
let inflight:Promise<Record<string,string[]>>|null=null;
const listeners=new Set<()=>void>();

async function fetchAll(){
  const r=await fetch("/api/settings/options");
  const d=await r.json() as{options?:{listId:string;name:string;active:number}[]};
  const out:Record<string,string[]>={};
  for(const o of d.options||[])
    if(o.active)(out[o.listId]=out[o.listId]||[]).push(o.name);
  return out}

export function refreshOptions(){
  cache=null;inflight=null;
  for(const fn of listeners)fn()}

export function useOptions(listId:string,fallback:readonly string[]){
  const[,bump]=useState(0);
  const[ready,setReady]=useState(!!cache);
  useEffect(()=>{
    let live=true;
    const onChange=()=>{if(live){setReady(false);bump(n=>n+1)}};
    listeners.add(onChange);
    if(!cache){
      inflight=inflight||fetchAll();
      inflight.then(d=>{cache=d;if(live){setReady(true);bump(n=>n+1)}})
        .catch(()=>{if(live)setReady(true)});
    }
    return()=>{live=false;listeners.delete(onChange)};
  },[ready]);
  const got=cache?.[listId];
  return got&&got.length?got:[...fallback]}
