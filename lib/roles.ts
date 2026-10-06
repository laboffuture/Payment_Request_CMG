/* Every role in the one application, in two families.

   Payment roles open the payment, audit and workforce screens. Material roles open the
   Material Management screens, whose rules are enforced by the Material API; each maps
   to that API's role code. One login may hold roles from both families - the same
   person then has both sets of features and switches between them in the header.

   Administrator belongs to both: it runs the payment side and is ADMIN on the material
   side, so one administrator manages the whole application. */
export const PAYMENT_ROLES=["Requestor","Department Head","Accountant","Auditor","Finance",
  "Management","Cost Control","Audit Head","Administrator"] as const;

export const MATERIAL_ROLES={
  "Site Engineer":"SITE",
  "Project Manager":"PM",
  "QS":"QS",
  "Procurement":"PROC",
  "Procurement Manager":"PROC_MGR",
  "Store":"STORE",
  "Management (Material)":"MGMT",
  "Material Admin":"ADMIN",
  "Vendor":"VENDOR",
} as const;

export type MaterialRoleName=keyof typeof MATERIAL_ROLES;
export type MaterialRoleCode=(typeof MATERIAL_ROLES)[MaterialRoleName];

export const MATERIAL_ROLE_NAMES=Object.keys(MATERIAL_ROLES) as MaterialRoleName[];

export const isPaymentRole=(r:string)=>(PAYMENT_ROLES as readonly string[]).includes(r);
export const isMaterialRole=(r:string):r is MaterialRoleName=>r in MATERIAL_ROLES;

/* The Material roles switched on. Material Management is open to Procurement, Procurement
   Manager and the Administrator only for now; the other roles stay defined (the Material
   API knows them) but are offered to nobody and open nothing until they are added here. */
export const ENABLED_MATERIAL_ROLES:MaterialRoleName[]=["Procurement","Procurement Manager"];
export const isEnabledMaterialRole=(r:string)=>(ENABLED_MATERIAL_ROLES as string[]).includes(r);
/* A role that cannot be given to a login yet: a Material role not switched on. */
export const disabledRoles=(roles:string[]=[])=>roles.filter(r=>isMaterialRole(r)&&!isEnabledMaterialRole(r));

/* The material role a header role selection stands for, or null for a payment-only role. */
export const materialCodeFor=(role:string):MaterialRoleCode|null=>
  role==="Administrator"?"ADMIN":isMaterialRole(role)&&isEnabledMaterialRole(role)?MATERIAL_ROLES[role]:null;

export const hasPaymentAccess=(roles:string[]=[])=>roles.some(isPaymentRole);

/* Material scope held against the login: a Site Engineer's projects (empty = all) and a
   Vendor's supplier. */
export type MaterialScope={projectIds:string[];vendorId:string};
export const parseMaterialScope=(raw:unknown):MaterialScope=>{
  try{const v=typeof raw==="string"?JSON.parse(raw||"{}"):raw||{};
    return{projectIds:Array.isArray((v as any).projectIds)?(v as any).projectIds.map(String):[],
      vendorId:String((v as any).vendorId||"")}}
  catch{return{projectIds:[],vendorId:""}}};
