"use client";
import type {AnchorHTMLAttributes,MouseEvent,ReactNode} from "react";
import {materialHref,useRouter} from "./nav";

/* next/link for Material screens: a real href (so open-in-new-tab works) that
   navigates in place on an ordinary click. */
export default function Link({href,children,onClick,...rest}:
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>,"href">&{href:string;children?:ReactNode;prefetch?:boolean}){
  const router=useRouter();
  const{prefetch:_ignored,...attrs}=rest as typeof rest&{prefetch?:boolean};
  return <a {...attrs} href={materialHref(href)} onClick={(e:MouseEvent<HTMLAnchorElement>)=>{
    onClick?.(e);
    if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
    e.preventDefault();router.push(href)}}>{children}</a>}
