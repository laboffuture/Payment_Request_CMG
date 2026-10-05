"use client";
import {createContext,useCallback,useContext,useEffect,useMemo,useState,type ReactNode} from "react";

/* Material Management screens were written against next/navigation. Inside the one
   application they are not separate pages but a panel of the payment shell, so this
   stands in for it: the same hooks, backed by the URL hash (#/m/mrs/123?tab=x). A
   refresh keeps the screen, the back button works, and a link can be shared. */

const PREFIX="#/m";

type Loc={path:string;search:string};

const read=():Loc=>{
  if(typeof window==="undefined"||!window.location.hash.startsWith(PREFIX))return{path:"/",search:""};
  const raw=window.location.hash.slice(PREFIX.length)||"/";
  const q=raw.indexOf("?");
  return q<0?{path:raw||"/",search:""}:{path:raw.slice(0,q)||"/",search:raw.slice(q+1)}};

type Nav={loc:Loc;params:Record<string,string>;go:(href:string,replace?:boolean)=>void};
const NavContext=createContext<Nav|null>(null);
const ParamsContext=createContext<Record<string,string>>({});

export const materialHref=(href:string)=>`${PREFIX}${href.startsWith("/")?href:`/${href}`}`;

/* Is the address bar currently on a Material screen? */
export const onMaterialPath=()=>typeof window!=="undefined"&&window.location.hash.startsWith(PREFIX);

export function MaterialNavProvider({children}:{children:ReactNode}){
  const[loc,setLoc]=useState<Loc>(read);
  useEffect(()=>{
    const sync=()=>setLoc(read());
    window.addEventListener("hashchange",sync);
    return()=>window.removeEventListener("hashchange",sync)},[]);
  const go=useCallback((href:string,replace=false)=>{
    const next=materialHref(href);
    if(replace)window.history.replaceState(null,"",next);else window.history.pushState(null,"",next);
    setLoc(read());
    window.scrollTo({top:0})},[]);
  const value=useMemo(()=>({loc,params:{},go}),[loc,go]);
  return <NavContext.Provider value={value}>{children}</NavContext.Provider>}

/* The route table sets the :params of whichever pattern matched. */
export function RouteParams({params,children}:{params:Record<string,string>;children:ReactNode}){
  return <ParamsContext.Provider value={params}>{children}</ParamsContext.Provider>}

const useNav=()=>{const n=useContext(NavContext);if(!n)throw new Error("Material screen outside MaterialNavProvider");return n};

export function useRouter(){
  const{go}=useNav();
  return useMemo(()=>({
    push:(href:string)=>go(href),
    replace:(href:string)=>go(href,true),
    back:()=>window.history.back(),
    refresh:()=>{},
    prefetch:()=>{}}),[go])}

export const usePathname=()=>useNav().loc.path;
export const useSearchParams=()=>{const{search}=useNav().loc;return useMemo(()=>new URLSearchParams(search),[search])};
export function useParams<T extends Record<string,string>=Record<string,string>>(){return useContext(ParamsContext) as T}
export const useMaterialLocation=()=>useNav().loc;
