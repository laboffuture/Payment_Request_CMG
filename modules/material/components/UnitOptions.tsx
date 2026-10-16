'use client';

import { unitsOf, useReference } from '@mm/lib/reference';

/**
 * The <option>s of a unit dropdown: the built-in units and any added from the item master.
 * A value no longer on the list (or not yet loaded) is kept, so the dropdown never shows a
 * different unit from the one the line carries.
 */
export function UnitOptions({ current }: { current?: string }) {
  const units = unitsOf(useReference());
  const missing = current && !units.some((u) => u.name === current);
  return (
    <>
      {missing ? <option value={current}>{current}</option> : null}
      {units.map((u) => (
        <option key={u.name} value={u.name}>
          {u.label}
        </option>
      ))}
    </>
  );
}
