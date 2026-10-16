import { Types } from 'mongoose';
import { UNITS, unitLabel, type CreateUnitInput, type UnitDto } from '@cm/shared';
import { badRequest, conflict } from '../lib/errors.js';
import { bumpSyncStamp } from '../lib/sync.js';
import { MeasureUnit } from '../models/masters.js';

const ci = { locale: 'en', strength: 2 } as const;

/** Every unit the dropdowns offer: the built-in list, then the ones added from the item master. */
export async function listUnits(): Promise<UnitDto[]> {
  const added = await MeasureUnit.find({ active: true }).sort({ name: 1 }).lean();
  const builtIn = new Set<string>(UNITS.map((u) => u.toLowerCase()));
  return [
    ...UNITS.map((u) => ({ name: u, label: unitLabel(u), builtIn: true })),
    ...added
      .filter((u) => !builtIn.has(u.name.toLowerCase()))
      .map((u) => ({ name: u.name, label: u.label || u.name, builtIn: false })),
  ];
}

/**
 * The unit as it is known - same spelling as the list, whatever case it was typed in -
 * or a refusal, so an item or an MR line can never carry a unit nobody can pick again.
 */
export async function knownUnit(name: string): Promise<string> {
  const want = name.trim().toLowerCase();
  const builtIn = UNITS.find((u) => u.toLowerCase() === want);
  if (builtIn) return builtIn;
  const added = await MeasureUnit.findOne({ name: name.trim(), active: true }).collation(ci).lean();
  if (added) return added.name;
  throw badRequest(`"${name}" is not a unit on the list — add it to the units first`);
}

/** QS or an administrator adds the unit an item needs; the list it returns includes it. */
export async function createUnit(input: CreateUnitInput, actorId: string): Promise<UnitDto[]> {
  const name = input.name.trim();
  if (UNITS.some((u) => u.toLowerCase() === name.toLowerCase())) {
    throw conflict(`"${name}" is already on the list`);
  }
  const clash = await MeasureUnit.findOne({ name }).collation(ci).lean();
  if (clash?.active) throw conflict(`"${clash.name}" is already on the list`);
  if (clash) {
    await MeasureUnit.updateOne({ _id: clash._id }, { $set: { active: true } });
  } else {
    await MeasureUnit.create({
      name,
      label: input.label ? `${name} — ${input.label}` : '',
      active: true,
      createdBy: Types.ObjectId.isValid(actorId) ? new Types.ObjectId(actorId) : null,
    });
  }
  await bumpSyncStamp();
  return listUnits();
}
