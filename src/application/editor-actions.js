import { state } from "../state.js";
import {
  DEVELOP_OPERATION_TYPES,
  applyOperationToPhoto,
  createDevelopOperation,
  redoPhotoOperation,
  undoPhotoOperation,
} from "../develop/index.js";
import { savePhotoHistory } from "../persistence/photo-history-store.js";
import { renderMedia } from "../rendering/index.js";

export async function setPhotoAdjustment(photoId, key, value) {
  const operation = createDevelopOperation({
    type: DEVELOP_OPERATION_TYPES.SET_ADJUSTMENT,
    payload: { key, value },
  });
  return await updatePhotoWithOperation(photoId, operation);
}

export async function resetPhotoAdjustments(photoId) {
  const operation = createDevelopOperation({
    type: DEVELOP_OPERATION_TYPES.RESET_ADJUSTMENTS,
  });
  return await updatePhotoWithOperation(photoId, operation);
}

export async function undoPhotoAdjustment(photoId) {
  return await replacePhoto(photoId, undoPhotoOperation(getPhotoOrThrow(photoId)));
}

export async function redoPhotoAdjustment(photoId) {
  return await replacePhoto(photoId, redoPhotoOperation(getPhotoOrThrow(photoId)));
}

async function updatePhotoWithOperation(photoId, operation) {
  return await replacePhoto(photoId, applyOperationToPhoto(getPhotoOrThrow(photoId), operation));
}

async function replacePhoto(photoId, nextPhoto) {
  const photoIndex = state.photos.findIndex((photo) => photo.id === photoId);

  if (photoIndex === -1) {
    throw new Error(`Photo not found: ${photoId}`);
  }

  state.photos = [
    ...state.photos.slice(0, photoIndex),
    nextPhoto,
    ...state.photos.slice(photoIndex + 1),
  ];
  savePhotoHistory(nextPhoto.id, nextPhoto.history);

  return {
    photo: nextPhoto,
    renderResult: await renderMedia({ photo: nextPhoto }),
  };
}

function getPhotoOrThrow(photoId) {
  const photo = state.photos.find((item) => item.id === photoId);

  if (!photo) {
    throw new Error(`Photo not found: ${photoId}`);
  }

  return photo;
}
