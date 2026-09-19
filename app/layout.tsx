import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./flow.css";
import "./reference-theme.css";
import "./workflow.css";
import "./workbench.css";
import "./access.css";
import "./queue-filter.css";
import "./receivables.css";
import "./role-dashboard.css";
import "./login.css";
import "./import-centre.css";
import "./audit-ops.css";
import "./audit-task-card.css";
import "./audit-list.css";
import "./company-setup.css";
import "./reports-live.css";
import "./simple-import.css";
import "./community.css";
import "./scheduled-payments.css";
import "./audit-main-tabs.css";
import "./scheduled-fix.css";
import "./workforce.css";
import "./settings.css";
import "./notifications.css";
import "./sidebar-scroll.css";
/* There was no viewport tag at all, so phones laid the page out at about 980px and then
   zoomed out: the 49 media queries in these stylesheets were mostly never reaching the
   breakpoints they were written for. This is the one line that makes the mobile work
   already in the CSS actually apply.

   The shell colour is the sidebar green, so the status bar matches the app rather than
   flashing white. Zoom is deliberately NOT disabled - people need to magnify an amount or
   an invoice number, and taking that away fails an accessibility review as well as being
   unkind.

   viewportFit:"cover" is deliberately absent. It was set here first, but this framework's
   metadata shim does not emit it - the served tag came back as width and initial-scale
   only - and configuration that looks meaningful while doing nothing is worse than none.
   When this is wrapped for the stores, viewport-fit=cover will have to be added as a raw
   meta tag so the app can paint under the notch and the home indicator. */
export const viewport:Viewport={
  width:"device-width",initialScale:1,themeColor:"#102f2a"};

export const metadata:Metadata={
  title:"CMG Payment Request",
  description:"Every audit task, observation, document, and decision in one controlled system.",
  applicationName:"CMG Payment",
  manifest:"/manifest.webmanifest",
  appleWebApp:{capable:true,title:"CMG Payment",statusBarStyle:"black-translucent"},
  icons:{icon:[{url:"/favicon.svg",type:"image/svg+xml"},
      {url:"/icon-192.png",sizes:"192x192",type:"image/png"},
      {url:"/icon-512.png",sizes:"512x512",type:"image/png"}],
    apple:[{url:"/icon-192.png",sizes:"192x192"}]}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
