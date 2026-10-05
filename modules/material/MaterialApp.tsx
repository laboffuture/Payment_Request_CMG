"use client";
import {createContext,useContext,useMemo,type ComponentType,type ReactNode} from "react";
import {QueryClient,QueryClientProvider,useQuery} from "@tanstack/react-query";
import {Bell,BellRing,Boxes,Building,ClipboardCheck,ClipboardList,FileBarChart,FilePlus2,
  FolderKanban,LayoutDashboard,Layers,ListChecks,Mail,MessagesSquare,Package,PackageCheck,
  PackagePlus,Printer,Receipt,ScrollText,ShoppingCart,Stamp,Tags,Truck,Upload,BadgeCheck} from "lucide-react";
import {NAV,homeFor,resolveDeepLink,type Role} from "@cm/shared";
import {setActiveMaterialRole} from "./lib/api";
import {MaterialNavProvider,RouteParams,onMaterialPath,useMaterialLocation,useRouter} from "./lib/nav";
import {SessionProvider,countsQuery,meQuery} from "./lib/session";
import {ToastProvider} from "./components/Toast";
import {useLiveRefresh} from "./lib/sync";

import Home from "./screens/Home";
import Categories from "./screens/admin/Categories";
import Company from "./screens/admin/Company";
import Email from "./screens/admin/Email";
import ImportInventory from "./screens/admin/Import";
import Items from "./screens/admin/Items";
import NotificationRules from "./screens/admin/NotificationRules";
import Projects from "./screens/admin/Projects";
import Vendors from "./screens/admin/Vendors";
import Docs from "./screens/Docs";
import Grn from "./screens/Grn";
import Inventory from "./screens/Inventory";
import Issue from "./screens/Issue";
import Issues from "./screens/Issues";
import IssueDetail from "./screens/IssueDetail";
import Mrs from "./screens/Mrs";
import MrNew from "./screens/MrNew";
import MrPrint from "./screens/MrPrint";
import MrDetail from "./screens/MrDetail";
import MrEdit from "./screens/MrEdit";
import Notifications from "./screens/Notifications";
import PmQueue from "./screens/PmQueue";
import Pool from "./screens/Pool";
import Pos from "./screens/Pos";
import PoNew from "./screens/PoNew";
import PoApprovals from "./screens/PoApprovals";
import PoValidate from "./screens/PoValidate";
import PoDetail from "./screens/PoDetail";
import PoEdit from "./screens/PoEdit";
import PoRevise from "./screens/PoRevise";
import QsQueue from "./screens/QsQueue";
import Receive from "./screens/Receive";
import Reports from "./screens/Reports";
import Rfqs from "./screens/Rfqs";
import RfqDetail from "./screens/RfqDetail";
import VendorEnquiries from "./screens/vendor/Enquiries";
import VendorPos from "./screens/vendor/Pos";
import VendorDocs from "./screens/vendor/Docs";
import VendorRfqQuote from "./screens/vendor/RfqQuote";
import NotFound from "./screens/NotFound";

/* Material Management as part of the one application.

   The payment shell owns the frame: sign-in, the sidebar, the header with its role
   selector, notifications and the profile menu. This supplies what the material
   screens need inside it - their data client, their router, who is signed in and in
   which material role - and the screens themselves. Their rules stay in the Material
   API; nothing here decides who may do what. */

// ------------------------------------------------------------------- routes
const ROUTES:[string,ComponentType][]=[
  ["/",Home],
  ["/admin/categories",Categories],["/admin/company",Company],["/admin/email",Email],
  ["/admin/import",ImportInventory],["/admin/items",Items],
  ["/admin/notification-rules",NotificationRules],["/admin/projects",Projects],
  ["/admin/vendors",Vendors],
  ["/docs",Docs],["/grn",Grn],["/inventory",Inventory],["/issue",Issue],
  ["/issues",Issues],["/issues/:id",IssueDetail],
  ["/mrs",Mrs],["/mrs/new",MrNew],["/mrs/print",MrPrint],["/mrs/:id",MrDetail],["/mrs/:id/edit",MrEdit],
  ["/notifications",Notifications],["/pm",PmQueue],["/pool",Pool],
  ["/pos",Pos],["/pos/new",PoNew],["/pos/approvals",PoApprovals],["/pos/validate",PoValidate],
  ["/pos/:id",PoDetail],["/pos/:id/edit",PoEdit],["/pos/:id/revise",PoRevise],
  ["/qs",QsQueue],["/receive",Receive],["/reports",Reports],
  ["/rfqs",Rfqs],["/rfqs/:id",RfqDetail],
  ["/vendor",VendorEnquiries],["/vendor/pos",VendorPos],["/vendor/docs",VendorDocs],
  ["/vendor/rfqs/:id",VendorRfqQuote],
];

function match(path:string):{Screen:ComponentType;params:Record<string,string>}{
  const parts=path.split("/").filter(Boolean);
  for(const[pattern,Screen]of ROUTES){
    const want=pattern.split("/").filter(Boolean);
    if(want.length!==parts.length)continue;
    const params:Record<string,string>={};
    if(want.every((w,i)=>w.startsWith(":")?(params[w.slice(1)]=decodeURIComponent(parts[i]!),true):w===parts[i]))
      return{Screen,params}}
  return{Screen:NotFound,params:{}}}

// ------------------------------------------------------------------- sidebar
const ICONS:Record<string,ComponentType<{className?:string}>>={
  "/":LayoutDashboard,"/mrs":ClipboardList,"/mrs/new":FilePlus2,"/pos":ShoppingCart,
  "/receive":PackageCheck,"/reports":FileBarChart,"/notifications":Bell,"/pm":ClipboardCheck,
  "/rfqs":MessagesSquare,"/inventory":Boxes,"/qs":ListChecks,"/pos/validate":BadgeCheck,
  "/pool":Layers,"/pos/new":FilePlus2,"/docs":Receipt,"/pos/approvals":Stamp,"/grn":PackagePlus,
  "/issue":Truck,"/issues":ScrollText,"/admin/vendors":Building,"/admin/projects":FolderKanban,
  "/admin/company":Printer,"/admin/categories":Tags,"/admin/items":Package,"/admin/import":Upload,
  "/admin/notification-rules":BellRing,"/admin/email":Mail,"/vendor":MessagesSquare,
  "/vendor/pos":ShoppingCart,"/vendor/docs":Receipt};

export type MaterialNavItem={href:string;label:string;icon:ComponentType<{className?:string}>;count:number};

// ------------------------------------------------------------------- provider
type Ctx={role:Role|null};
const MaterialContext=createContext<Ctx>({role:null});

/* Wraps the whole shell, so the sidebar can show material items and badges and the
   main area the material screens. `role` is the material role in use, or null when
   the selected role has no material side. A new data cache per person and role, so
   nothing seen as one role is shown as another. */
export function MaterialProvider({role,person,children}:{role:Role|null;person:string;children:ReactNode}){
  setActiveMaterialRole(role??"");
  const client=useMemo(()=>new QueryClient({defaultOptions:{queries:{refetchOnWindowFocus:false,retry:1}}}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [role,person]);
  return <QueryClientProvider client={client}><MaterialNavProvider><ToastProvider>
    <MaterialContext.Provider value={{role}}>{children}</MaterialContext.Provider>
  </ToastProvider></MaterialNavProvider></QueryClientProvider>}

/* The sidebar entries for the material role in use, with their badge counts. User
   administration is the application's own (Users & access), so material's copy of it
   is not offered. */
export function useMaterialNav():MaterialNavItem[]{
  const{role}=useContext(MaterialContext);
  const counts=useQuery({...countsQuery(),enabled:!!role,refetchInterval:60_000});
  if(!role)return[];
  return NAV[role].filter(i=>i.href!=="/admin/users").map(i=>({href:i.href,
    label:i.href==="/"?"Material dashboard":i.label,icon:ICONS[i.href]??Package,
    count:i.count?Number((counts.data as Record<string,number>|undefined)?.[i.count]??0):0}))}

/* Opens a material screen from the sidebar, a notification or a deep link. */
export function useMaterialGo(){
  const router=useRouter();
  return(href:string)=>router.push(href)}

export const useMaterialPath=()=>useMaterialLocation().path;

export const materialHomeFor=(role:Role)=>homeFor(role);
export const materialPathFromLink=(link:string)=>resolveDeepLink(link);
export {onMaterialPath};

// ------------------------------------------------------------------- the screen
export function MaterialScreen(){
  const{role}=useContext(MaterialContext);
  const me=useQuery({...meQuery(),enabled:!!role});
  const{path}=useMaterialLocation();
  const{Screen,params}=match(path);

  if(!role)return null;
  if(me.isLoading)return <div className="page mm"><p className="queue-empty">Loading…</p></div>;
  if(me.isError||!me.data)return <div className="page mm"><div className="card">
    <p className="queue-empty">This account has no access to Material Management in this role. Ask the administrator to check the role and, for a vendor, the supplier on the login.</p></div></div>;

  return <SessionProvider me={me.data}><div className="page mm">
    <UpdatesBanner/>
    <RouteParams params={params}><Screen key={path}/></RouteParams>
  </div></SessionProvider>}

/* Live refresh: when someone else changes something, the screen refetches - unless
   the person is mid-edit, when this offers the refresh instead of pulling the form
   out from under them. */
function UpdatesBanner(){
  const{updatesWaiting,applyUpdates}=useLiveRefresh();
  if(!updatesWaiting)return null;
  return <div className="warn noprint" style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
    <span>New updates are available.</span>
    <button type="button" className="mm-btn small" onClick={applyUpdates}>Refresh</button></div>}

