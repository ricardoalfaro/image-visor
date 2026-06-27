import {
  applyOperationToPhoto,
  createDevelopOperation,
} from "../develop/index.js";
import { normalizeAIOperations } from "./ai-contracts.js";

const IMAGE_OUTPUT_KEYS = new Set([
  "image",
  "imageUrl",
  "imageData",
  "base64",
  "blob",
  "bitmap",
]);

export function createPromptEditInstruction({
  prompt = "",
  operations = [],
  providerId = "",
  createdAt = Date.now(),
} = {}) {
  if (containsImageOutput({ operations })) {
    throw new Error("Prompt editing instructions cannot include image outputs");
  }

  return {
    prompt,
    providerId,
    operations: normalizeAIOperations(operations).map((operation) => createDevelopOperation({
      ...operation,
      createdAt: operation.createdAt || createdAt,
    })),
    createdAt,
  };
}

export function parsePromptEditInstruction(serializedInstruction) {
  return createPromptEditInstruction(JSON.parse(serializedInstruction));
}

export function applyPromptEditInstruction(photo, instruction) {
  const promptInstruction = createPromptEditInstruction(instruction);

  return promptInstruction.operations.reduce(
    (nextPhoto, operation) => applyOperationToPhoto(nextPhoto, operation),
    photo,
  );
}

export function serializePromptEditInstruction(instruction) {
  return JSON.stringify(createPromptEditInstruction(instruction), null, 2);
}

function containsImageOutput(value) {
  if (!value || typeof value !== "object") {
    return false;
  }

  if (Array.isArray(value)) {
    return value.some(containsImageOutput);
  }

  return Object.entries(value).some(([key, entryValue]) => (
    IMAGE_OUTPUT_KEYS.has(key) || containsImageOutput(entryValue)
  ));
}
