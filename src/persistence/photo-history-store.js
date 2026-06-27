import { PHOTO_HISTORIES_KEY } from "../constants.js";
import { createOperationHistory } from "../develop/index.js";

export function loadPhotoHistories() {
  try {
    const storedHistories = JSON.parse(localStorage.getItem(PHOTO_HISTORIES_KEY) || "{}");

    if (!storedHistories || typeof storedHistories !== "object" || Array.isArray(storedHistories)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(storedHistories).map(([photoId, history]) => [photoId, createOperationHistory(history)]),
    );
  } catch (error) {
    return {};
  }
}

export function getPhotoHistory(photoId) {
  return createOperationHistory(loadPhotoHistories()[photoId]);
}

export function savePhotoHistory(photoId, history) {
  if (!photoId) {
    throw new Error("Photo id is required to save history");
  }

  const histories = loadPhotoHistories();
  histories[photoId] = createOperationHistory(history);
  localStorage.setItem(PHOTO_HISTORIES_KEY, JSON.stringify(histories));
  return histories[photoId];
}

export function removePhotoHistory(photoId) {
  const histories = loadPhotoHistories();
  delete histories[photoId];
  localStorage.setItem(PHOTO_HISTORIES_KEY, JSON.stringify(histories));
  return histories;
}

export function clearPhotoHistories() {
  localStorage.removeItem(PHOTO_HISTORIES_KEY);
}
