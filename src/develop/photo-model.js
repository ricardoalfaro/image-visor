import { createDevelopAdjustments } from "./adjustments.js";

export function createPhotoModel({
  id,
  source,
  metadata = {},
  rating = 0,
  tags = [],
  adjustments = createDevelopAdjustments(),
  history = [],
  virtualCopies = [],
} = {}) {
  if (!id) {
    throw new Error("Photo id is required");
  }

  return {
    id,
    source,
    metadata,
    rating,
    tags,
    adjustments,
    history,
    virtualCopies,
  };
}
