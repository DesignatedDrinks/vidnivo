import type {Project} from './timeline.ts';
import {validateProject} from './timeline.ts';

export type EditAttempt =
 | {status:'unchanged';project:Project}
 | {status:'applied';project:Project}
 | {status:'rejected';project:Project;message:string};

/**
 * All mobile toolbar actions pass through this guard. Domain operations may
 * reject an out-of-range split, a too-short trim, or stale clip ID during
 * rapid gestures. Handle these as non-destructive feedback, never as an
 * unhandled UI event exception that terminates an editing session.
 */
export function attemptProjectEdit(project:Project,operation:(project:Project)=>Project):EditAttempt{
 try {
  const updated=operation(project);
  if(updated===project)return {status:'unchanged',project};
  validateProject(updated);
  return {status:'applied',project:updated};
 } catch {
  // Do not forward internal exception objects to crash logs or show secrets.
  return {status:'rejected',project,
   message:'This edit could not be applied. The previous version was kept. Adjust the selection and try again.'};
 }
}
