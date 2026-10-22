import { isToolsProjectCode } from '@cm/shared';
import { Project } from '../models/masters.js';

/**
 * The one project every Tools & Assets request goes to (TRG TOOLS & ASSET), or
 * null when it has not been set up. Looked up by code so the record can be
 * renamed or re-created without a code change.
 */
export async function toolsProjectId(): Promise<string | null> {
  const projects = await Project.find({ active: { $ne: false } }).select('code').lean();
  const tools = projects.find((p) => isToolsProjectCode(p.code));
  return tools ? String(tools._id) : null;
}
