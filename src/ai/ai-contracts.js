import {
  DEVELOP_OPERATION_TYPES,
  createDevelopOperation,
} from "../develop/index.js";

export const AI_PROVIDER_CAPABILITIES = Object.freeze({
  EDIT_INTENT: "edit-intent",
  PHOTO_ANALYSIS: "photo-analysis",
  SMART_SEARCH: "smart-search",
});

export const FUTURE_AI_ADAPTERS = Object.freeze([
  "openai",
  "gemini",
  "anthropic",
  "ollama",
  "lm-studio",
]);

export function createAIProvider({
  id,
  name,
  capabilities = [],
  run = null,
} = {}) {
  if (!id) {
    throw new Error("AI provider id is required");
  }

  if (!name) {
    throw new Error("AI provider name is required");
  }

  return {
    id,
    name,
    capabilities: normalizeCapabilities(capabilities),
    run,
  };
}

export function createEditIntent({
  prompt = "",
  targetPhotoId = "",
  operations = [],
  confidence = 0,
} = {}) {
  return {
    prompt,
    targetPhotoId,
    operations: normalizeAIOperations(operations),
    confidence: normalizeConfidence(confidence),
  };
}

export function createPhotoAnalysis({
  photoId = "",
  labels = [],
  description = "",
  technical = {},
  confidence = 0,
} = {}) {
  return {
    photoId,
    labels: normalizeStringList(labels),
    description,
    technical,
    confidence: normalizeConfidence(confidence),
  };
}

export function createSmartSearch({
  query = "",
  filters = {},
  ranking = [],
} = {}) {
  return {
    query,
    filters,
    ranking: Array.isArray(ranking) ? ranking : [],
  };
}

export function normalizeAIOperations(operations) {
  if (!Array.isArray(operations)) {
    return [];
  }

  return operations
    .filter((operation) => Object.values(DEVELOP_OPERATION_TYPES).includes(operation?.type))
    .map((operation) => createDevelopOperation(operation));
}

function normalizeCapabilities(capabilities) {
  const validCapabilities = new Set(Object.values(AI_PROVIDER_CAPABILITIES));
  return normalizeStringList(capabilities).filter((capability) => validCapabilities.has(capability));
}

function normalizeStringList(items) {
  return Array.isArray(items)
    ? [...new Set(items.map((item) => String(item).trim()).filter(Boolean))]
    : [];
}

function normalizeConfidence(confidence) {
  const numericConfidence = Number(confidence);

  if (!Number.isFinite(numericConfidence)) {
    return 0;
  }

  return Math.min(1, Math.max(0, numericConfidence));
}
