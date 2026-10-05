import { MSG, type ImportPaymentUsersInput, type Role, type UpsertUserInput, type UserDto } from '@cm/shared';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { hashPassword } from '../lib/password.js';
import { revokeAllForUser } from '../lib/tokens.js';
import { bumpSyncStamp } from '../lib/sync.js';
import { User, Vendor } from '../models/masters.js';
import { externalMasters } from '../integrations/paymentApp.js';

/** Prototype: VIEWS.users — role tabs, then the table. */
export async function listUsers(role?: Role): Promise<UserDto[]> {
  const filter = role ? { role } : {};
  const users = await User.find(filter).sort({ name: 1 }).lean();
  const vendorIds = users.map((u) => u.vendorId).filter(Boolean);
  const vendors = await Vendor.find({ _id: { $in: vendorIds } })
    .select('name')
    .lean();
  const vendorName = new Map(vendors.map((v) => [String(v._id), v.name]));

  return users.map((u) => ({
    id: String(u._id),
    rv: u.rv ?? 0,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
    name: u.name,
    login: u.login,
    email: u.email ?? '',
    phone: u.phone ?? '',
    role: u.role as Role,
    vendorId: u.vendorId ? String(u.vendorId) : null,
    vendorName: u.vendorId ? (vendorName.get(String(u.vendorId)) ?? null) : null,
    projectIds: (u.projectIds ?? []).map(String),
    paymentUserId: u.paymentUserId ?? '',
    active: !!u.active,
    emailOn: !!u.emailOn,
  }));
}

async function assertLoginFree(login: string, exceptId?: string): Promise<void> {
  const clash = await User.findOne({
    login,
    ...(exceptId ? { _id: { $ne: exceptId } } : {}),
  })
    .select('_id')
    .lean();
  if (clash) throw conflict(MSG.userLoginTaken);
}

/** Prototype: A.saveUser (create). */
export async function createUser(input: UpsertUserInput): Promise<UserDto> {
  if (!input.password) throw badRequest(MSG.userPasswordRequired);
  await assertLoginFree(input.login);

  if (input.role === 'VENDOR') {
    const vendor = await Vendor.findById(input.vendorId).select('_id').lean();
    if (!vendor) throw badRequest(MSG.userVendorRequired);
  }

  const user = await User.create({
    name: input.name,
    login: input.login,
    email: input.email ?? '',
    phone: input.phone ?? '',
    role: input.role,
    vendorId: input.role === 'VENDOR' ? input.vendorId : null,
    // Only SITE users are project-scoped; everyone else sees every project.
    projectIds: input.role === 'SITE' ? input.projectIds : [],
    active: input.active,
    emailOn: input.emailOn,
    passwordHash: await hashPassword(input.password),
  });

  await bumpSyncStamp();
  const [dto] = await listUsersById([String(user._id)]);
  return dto!;
}

/** Prototype: A.saveUser (edit) — a blank password keeps the old one. */
export async function updateUser(
  id: string,
  input: UpsertUserInput,
): Promise<UserDto> {
  const user = await User.findById(id).exec();
  if (!user) throw notFound();

  await assertLoginFree(input.login, id);

  if (input.role === 'VENDOR') {
    const vendor = await Vendor.findById(input.vendorId).select('_id').lean();
    if (!vendor) throw badRequest(MSG.userVendorRequired);
  }

  const wasActive = user.active;

  user.name = input.name;
  user.login = input.login;
  user.email = input.email ?? '';
  user.phone = input.phone ?? '';
  user.role = input.role;
  user.vendorId = input.role === 'VENDOR' ? (input.vendorId as never) : null;
  user.projectIds = (input.role === 'SITE' ? input.projectIds : []) as never;
  user.active = input.active;
  user.emailOn = input.emailOn;

  if (input.password) user.passwordHash = await hashPassword(input.password);

  await user.save();

  // A new password, a changed role, or deactivation must end open sessions.
  if (input.password || !input.active || (wasActive && !input.active)) {
    await revokeAllForUser(id);
  }

  await bumpSyncStamp();
  const [dto] = await listUsersById([id]);
  return dto!;
}

async function listUsersById(ids: string[]): Promise<UserDto[]> {
  const all = await listUsers();
  const wanted = new Set(ids);
  return all.filter((u) => wanted.has(u.id));
}

/**
 * Prototype: A.importUsers / A.doImportUsers — pull staff from the Payment app.
 * Passwords are set afterwards by the admin (Edit), so the account cannot be
 * used until someone deliberately gives it one.
 */
export async function importPaymentUsers(
  input: ImportPaymentUsersInput,
): Promise<{ imported: number }> {
  const external = await externalMasters().listUsers();
  const wanted = new Set(input.externalIds);
  const candidates = external.filter((u) => wanted.has(u.id));
  if (!candidates.length) throw badRequest(MSG.paymentUsersAllPresent);

  let imported = 0;
  for (const ext of candidates) {
    const already = await User.findOne({ paymentUserId: ext.id }).select('_id').lean();
    if (already) continue;

    const base =
      (ext.email || ext.name).toLowerCase().replace(/[^a-z0-9._@-]/g, '') || 'user';
    let login = base;
    let n = 1;
    // eslint-disable-next-line no-await-in-loop
    while (await User.findOne({ login }).select('_id').lean()) {
      n += 1;
      login = `${base}${n}`;
    }

    // A random unusable password: the account is inert until an admin sets one.
    await User.create({
      name: ext.name,
      login,
      email: ext.email ?? '',
      role: input.role,
      projectIds: [],
      active: true,
      emailOn: true,
      paymentUserId: ext.id,
      passwordHash: await hashPassword(
        `imported-${Math.random().toString(36).slice(2)}9`,
      ),
    });
    imported += 1;
  }

  await bumpSyncStamp();
  return { imported };
}

/** The pick-list behind the "Import from Payment app" modal. */
export async function listImportablePaymentUsers() {
  const [external, existing] = await Promise.all([
    externalMasters().listUsers(),
    User.find({ paymentUserId: { $gt: '' } }).select('paymentUserId').lean(),
  ]);
  const have = new Set(existing.map((u) => u.paymentUserId));
  return external.filter((u) => !have.has(u.id));
}
