"use client";
import {useEffect,useRef} from "react";
import type {Role} from "@cm/shared";
import {materialHomeFor,materialPathFromLink,onMaterialPath,useMaterialGo,useMaterialNav,useMaterialPath} from "./MaterialApp";

/* The pieces of the payment shell that show Material Management. They live inside
   MaterialProvider, which the shell wraps around its frame. */

/* The material entries of the sidebar, in the same buttons as every other entry.
   `heading` separates them from the payment entries when a role has both. */
export function MaterialSideNav({active,heading,onOpen}:{active:boolean;heading:boolean;onOpen:()=>void}){
  const items=useMaterialNav();
  const path=useMaterialPath();
  const go=useMaterialGo();
  if(!items.length)return null;
  const current=items.filter(i=>path===i.href||(i.href!=="/"&&path.startsWith(`${i.href}/`)))
    .sort((a,b)=>b.href.length-a.href.length)[0]?.href??(path==="/"?"/":"");
  return <>{heading&&<small className="nav-section">MATERIAL MANAGEMENT</small>}
    {items.map(i=><button key={i.href} className={active&&current===i.href?"active":""}
      onClick={()=>{go(i.href);onOpen()}}><i.icon/>{i.label}{i.count>0&&<i>{i.count>99?"99+":i.count}</i>}</button>)}</>}

/* The page title in the header while a material screen is open. */
export function MaterialTitle(){
  const items=useMaterialNav();
  const path=useMaterialPath();
  const hit=items.filter(i=>path===i.href||(i.href!=="/"&&path.startsWith(`${i.href}/`)))
    .sort((a,b)=>b.href.length-a.href.length)[0];
  return <>{hit?.label??"Material Management"}</>}

/* Where a person lands. Choosing a material role opens its home screen; an email
   link (?open=mr:<id>) or a bookmarked #/m/... address opens that screen instead. */
export function MaterialLanding({code,active,onOpen,onLeave}:{code:Role|null;active:boolean;
  onOpen:()=>void;onLeave:()=>void}){
  const go=useMaterialGo();
  const last=useRef<string>("");
  /* The address decides: back/forward or a pasted #/m/... link onto a material screen
     opens it; back off one returns to the payment side. */
  useEffect(()=>{
    if(!code)return;
    const follow=()=>{if(onMaterialPath())onOpen();else if(active)onLeave()};
    window.addEventListener("hashchange",follow);window.addEventListener("popstate",follow);
    return()=>{window.removeEventListener("hashchange",follow);window.removeEventListener("popstate",follow)}},
    [code,active,onOpen,onLeave]);
  useEffect(()=>{
    if(!code)return;
    const url=new URL(window.location.href);
    const link=url.searchParams.get("open");
    if(link){
      const to=materialPathFromLink(link);
      url.searchParams.delete("open");
      window.history.replaceState(null,"",url.pathname+url.search+url.hash);
      if(to){go(to);onOpen();last.current=code;return}}
    if(last.current===code)return;
    const first=!last.current;
    last.current=code;
    if(first&&onMaterialPath()){onOpen();return}
    if(active)go(materialHomeFor(code));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[code,active]);
  return null}
