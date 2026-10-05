import mongoose, {
  Schema,
  Types,
  type Model,
  type SchemaDefinitionProperty,
  type SchemaOptions,
} from 'mongoose';

/**
 * Registers a model, or returns the one already compiled under that name.
 *
 * Mongoose keeps models on a global registry, so evaluating a model module
 * twice in one process — which happens under a watching dev server and under
 * a test runner that isolates each file's module graph — would otherwise throw
 * `OverwriteModelError`.
 */
export function defineModel<T>(name: string, schema: Schema<T>): Model<T> {
  return (mongoose.models[name] as Model<T>) ?? mongoose.model<T>(name, schema);
}

/**
 * House style for every collection:
 *  - `rv` is the version key, so optimistic locking is visible to the client
 *  - `timestamps: true`
 *  - toJSON turns `_id` into `id` and keeps `rv`
 *
 * §9: every update carries `rv`; a stale one is rejected with 409.
 *
 * Each schema is declared as `new Schema<IThing>(…)` with an explicit document
 * interface. The field helpers below return loosely-typed definition objects,
 * which is exactly the case Mongoose's inference cannot see through — the
 * explicit generic is what makes `.lean()` give real types at the call sites.
 */
// The return type is deliberately loose: Mongoose's SchemaOptions is generic in
// the document type, and a shared options factory cannot satisfy every one of
// them. The `new Schema<IThing>` generic is what carries the real typing.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySchemaOptions = any;

export const baseOptions = (extra: SchemaOptions = {}): AnySchemaOptions => ({
  timestamps: true,
  versionKey: 'rv',
  optimisticConcurrency: true,
  toJSON: {
    virtuals: true,
    versionKey: true,
    transform: (_doc: unknown, ret: Record<string, unknown>) => {
      ret.id = String(ret._id);
      delete ret._id;
      return ret;
    },
  },
  toObject: { virtuals: true, versionKey: true },
  ...extra,
});

/** Append-only collections never need a version or an updatedAt. */
export const appendOnlyOptions = (): AnySchemaOptions => ({
  timestamps: { createdAt: true, updatedAt: false },
  versionKey: false,
  toJSON: {
    virtuals: true,
    transform: (_doc: unknown, ret: Record<string, unknown>) => {
      ret.id = String(ret._id);
      delete ret._id;
      return ret;
    },
  },
});

/** Timestamps every `baseOptions()` schema carries. */
export interface Timestamped {
  createdAt: Date;
  updatedAt: Date;
  rv?: number;
}

export const refTo = (
  model: string,
  required = true,
): SchemaDefinitionProperty<Types.ObjectId> =>
  ({
    type: Schema.Types.ObjectId,
    ref: model,
    required,
    index: true,
  }) as SchemaDefinitionProperty<Types.ObjectId>;

export const optionalRefTo = (
  model: string,
): SchemaDefinitionProperty<Types.ObjectId | null> =>
  ({
    type: Schema.Types.ObjectId,
    ref: model,
    default: null,
    index: true,
  }) as SchemaDefinitionProperty<Types.ObjectId | null>;

const roundTo = (places: number) => (v: unknown) => {
  const factor = 10 ** places;
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? Math.round(n * factor) / factor : 0;
};

/** Quantities: 3 decimals, never negative. */
export const qtyField = (required = true): SchemaDefinitionProperty<number> =>
  ({
    type: Number,
    required,
    ...(required ? {} : { default: 0 }),
    min: 0,
    set: roundTo(3),
  }) as SchemaDefinitionProperty<number>;

/** Money: 2 decimals. */
export const moneyField = (required = false): SchemaDefinitionProperty<number> =>
  ({
    type: Number,
    required,
    ...(required ? {} : { default: 0 }),
    min: 0,
    set: roundTo(2),
  }) as SchemaDefinitionProperty<number>;

/** A stored file (Cloudinary) — we keep only what we need to serve it. */
export interface StoredFileDoc {
  publicId: string;
  url: string;
  name: string;
  mime: string;
  size: number;
}

export const fileSchema = new Schema<StoredFileDoc>(
  {
    publicId: { type: String, required: true },
    url: { type: String, required: true },
    name: { type: String, default: '' },
    mime: { type: String, default: '' },
    size: { type: Number, default: 0 },
  },
  { _id: false },
);
