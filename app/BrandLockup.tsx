/* The CMG Control name block: the logo tile, "CMG Control", and the three modules beneath.
   "panel" draws its own navy card (the sign-in page); "sidebar" sits on the sidebar's navy,
   so it drops the card and keeps the spacing and the tile. */
export default function BrandLockup({variant="panel"}:{variant?:"panel"|"sidebar"}){
  return <div className={`brand-lockup ${variant}`}>
    <span className="brand-lockup-tile"><img src="/cmg-mark-white.png" alt="" aria-hidden="true"/></span>
    <span className="brand-lockup-text">
      <strong>CMG Control</strong>
      <span className="brand-lockup-modules">
        <span>Payment</span><i aria-hidden="true"/><span>Audit</span><i aria-hidden="true"/><span>Material</span>
      </span>
    </span>
  </div>}
