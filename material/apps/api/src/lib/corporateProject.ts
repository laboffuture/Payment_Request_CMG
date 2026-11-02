import { isCorporateProjectCode } from '@cm/shared';
import { Project } from '../models/masters.js';

/**
 * The corporate purchase project (TRG-CORP), whose material requests Operations approves
 * in place of a Project Manager - or null when it has not been set up. Looked up by code,
 * like the tools project.
 */
export async function corporateProjectId(): Promise<string | null> {
  const projects = await Project.find({ active: { $ne: false }, removed: { $ne: true } })
    .select('code')
    .lean();
  const corporate = projects.find((p) => isCorporateProjectCode(p.code));
  return corporate ? String(corporate._id) : null;
}

/** Whether this project is the corporate purchase one. */
export const isCorporateProject = (projectId: unknown, corporateId: string | null): boolean =>
  !!corporateId && String(projectId) === corporateId;
