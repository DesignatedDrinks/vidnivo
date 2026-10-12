/**
 * Captions derived from an earlier video revision cannot silently become
 * current merely because the user edited the caption and tapped Save.
 * Re-generation explicitly records the new video revision.
 */
export function isSocialDraftCurrent(projectRevision:number,draftRevision:number|null):boolean{
 return Number.isInteger(projectRevision) && projectRevision>=1 &&
   Number.isInteger(draftRevision) && draftRevision===projectRevision;
}
export function assertSocialDraftCurrent(projectRevision:number,draftRevision:number|null):void {
 if(!isSocialDraftCurrent(projectRevision,draftRevision))
  throw Error('This video changed after the post was generated. Regenerate the captions before sharing or publishing.');
}
