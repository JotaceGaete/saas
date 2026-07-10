/**
 * Applies a restored draft's form data on top of the current (DB-loaded)
 * state, without ever letting an empty/missing image field in the draft
 * erase an image that's already present in the current state. The product
 * editor's equivalent rule guards a whole images array; here the images are
 * single URL fields (logoUrl, headerImageUrl, coverImageUrl, ...), so the
 * same rule is applied per named field instead.
 */
export function mergeDraftFormData(current, draftFormData, imageFields = []) {
  if (!draftFormData) return current;
  const merged = { ...current, ...draftFormData };
  imageFields.forEach((field) => {
    if (!draftFormData[field]) merged[field] = current?.[field];
  });
  return merged;
}
