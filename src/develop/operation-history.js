import { applyDevelopOperations } from "./operations.js";
import { createPhotoModel } from "./photo-model.js";

export function createOperationHistory(history = {}) {
  if (Array.isArray(history)) {
    return {
      past: normalizeOperations(history),
      future: [],
    };
  }

  const { past = [], future = [] } = history;

  return {
    past: normalizeOperations(past),
    future: normalizeOperations(future),
  };
}

export function addHistoryOperation(history, operation) {
  if (!operation?.type) {
    throw new Error("History operation requires a type");
  }

  const currentHistory = createOperationHistory(history);

  return createOperationHistory({
    past: [...currentHistory.past, operation],
    future: [],
  });
}

export function undoHistoryOperation(history) {
  const currentHistory = createOperationHistory(history);

  if (currentHistory.past.length === 0) {
    return currentHistory;
  }

  const nextPast = currentHistory.past.slice(0, -1);
  const undoneOperation = currentHistory.past.at(-1);

  return createOperationHistory({
    past: nextPast,
    future: [undoneOperation, ...currentHistory.future],
  });
}

export function redoHistoryOperation(history) {
  const currentHistory = createOperationHistory(history);

  if (currentHistory.future.length === 0) {
    return currentHistory;
  }

  const [redoneOperation, ...nextFuture] = currentHistory.future;

  return createOperationHistory({
    past: [...currentHistory.past, redoneOperation],
    future: nextFuture,
  });
}

export function getHistoryAdjustments(history) {
  return applyDevelopOperations({}, createOperationHistory(history).past);
}

export function applyOperationToPhoto(photo, operation) {
  const currentPhoto = createPhotoModel(photo);
  const history = addHistoryOperation(currentPhoto.history, operation);

  return applyHistoryToPhoto(currentPhoto, history);
}

export function applyHistoryToPhoto(photo, history) {
  const currentPhoto = createPhotoModel(photo);
  const nextHistory = createOperationHistory(history);

  return createPhotoModel({
    ...currentPhoto,
    history: nextHistory,
    adjustments: getHistoryAdjustments(nextHistory),
  });
}

export function undoPhotoOperation(photo) {
  const currentPhoto = createPhotoModel(photo);
  const history = undoHistoryOperation(currentPhoto.history);

  return createPhotoModel({
    ...currentPhoto,
    history,
    adjustments: getHistoryAdjustments(history),
  });
}

export function redoPhotoOperation(photo) {
  const currentPhoto = createPhotoModel(photo);
  const history = redoHistoryOperation(currentPhoto.history);

  return createPhotoModel({
    ...currentPhoto,
    history,
    adjustments: getHistoryAdjustments(history),
  });
}

function normalizeOperations(operations) {
  return Array.isArray(operations) ? operations.filter((operation) => operation?.type) : [];
}
