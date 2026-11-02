import { firstApproverForProjectCode, type FirstApproverProject } from '@cm/shared';
import { Project } from '../models/masters.js';

/**
 * The projects whose material requests a department approves first instead of a Project
 * Manager (TRG-CORP: Operations, TRG-IT: IT Manager), by project id. Looked up by code,
 * like the tools project; a project not set up yet is simply absent.
 */
export type FirstApprovers = Map<string, FirstApproverProject>;

export async function firstApproverProjects(): Promise<FirstApprovers> {
  const projects = await Project.find({ active: { $ne: false }, removed: { $ne: true } })
    .select('code')
    .lean();
  const out: FirstApprovers = new Map();
  for (const p of projects) {
    const dept = firstApproverForProjectCode(p.code);
    if (dept) out.set(String(p._id), dept);
  }
  return out;
}

/** The department that approves this project's MRs first, or null for a Project Manager. */
export const firstApproverOf = (projectId: unknown, map: FirstApprovers): FirstApproverProject | null =>
  map.get(String(projectId)) ?? null;

/** The project ids a first-approver role is kept to (none when not set up). */
export const projectIdsOfRole = (role: string, map: FirstApprovers): string[] =>
  [...map].filter(([, dept]) => dept.role === role).map(([id]) => id);
