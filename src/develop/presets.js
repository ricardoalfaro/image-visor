import {
  applyDevelopOperations,
  createDevelopOperation,
} from "./operations.js";
import { createPhotoModel } from "./photo-model.js";

export function createDevelopPreset({
  id,
  name,
  description = "",
  operations = [],
  createdAt = Date.now(),
  updatedAt = createdAt,
} = {}) {
  if (!id) {
    throw new Error("Preset id is required");
  }

  if (!name) {
    throw new Error("Preset name is required");
  }

  return {
    id,
    name,
    description,
    operations: normalizePresetOperations(operations),
    createdAt,
    updatedAt,
  };
}

export function createPresetOperation({ type, payload, createdAt }) {
  return createDevelopOperation({ type, payload, createdAt });
}

export function applyPresetToAdjustments(adjustments, preset) {
  return applyDevelopOperations(adjustments, createDevelopPreset(preset).operations);
}

export function applyPresetToPhoto(photo, preset) {
  const currentPhoto = createPhotoModel(photo);
  const nextAdjustments = applyPresetToAdjustments(photo?.adjustments, preset);
  const presetOperations = createDevelopPreset(preset).operations;

  return createPhotoModel({
    ...currentPhoto,
    adjustments: nextAdjustments,
    history: {
      past: [...(currentPhoto.history.past || []), ...presetOperations],
      future: [],
    },
  });
}

export function serializeDevelopPreset(preset) {
  return JSON.stringify(createDevelopPreset(preset), null, 2);
}

export function parseDevelopPreset(serializedPreset) {
  return createDevelopPreset(JSON.parse(serializedPreset));
}

function normalizePresetOperations(operations) {
  return Array.isArray(operations)
    ? operations.filter((operation) => operation?.type).map((operation) => createDevelopOperation(operation))
    : [];
}
