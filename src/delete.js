import { state } from "./state.js";
import {
  deleteConfirmDialog,
  deleteConfirmName,
  deleteConfirmAcceptButton,
  deleteConfirmCancelButton,
} from "./dom.js";
import { showNotice, renderFavorites } from "./ui.js";
import { isFavorite, toggleFavorite } from "./favorites.js";
import { getFoldersFromMedia } from "./utils.js";
import { applyFolderFilter, renderActiveImage } from "./viewer.js";

let deleteTrigger = null;

export function canDeleteMedia(media) {
  if (!media) {
    return false;
  }

  return Boolean(media.absolutePath) || Boolean(state.activeDirectoryHandle && media.path);
}

export function openDeleteConfirm() {
  const media = state.images[state.activeIndex];

  if (!media) {
    return;
  }

  if (!canDeleteMedia(media)) {
    showNotice("No se puede eliminar este archivo desde esta fuente.", "warning");
    return;
  }

  state.pendingDeleteMedia = media;
  state.pendingDeleteMediaBatch = null;
  deleteTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  deleteConfirmName.textContent = media.name;
  deleteConfirmDialog.setAttribute("aria-hidden", "false");
  document.body.classList.add("has-open-dialog");
  deleteConfirmCancelButton.focus();
}

export function openDeleteBatchConfirm(mediaItems) {
  const targets = Array.from(new Set(mediaItems)).filter(canDeleteMedia);
  if (!targets.length) {
    showNotice("No se pueden eliminar las fotos seleccionadas desde esta fuente.", "warning");
    return;
  }
  state.pendingDeleteMediaBatch = targets;
  state.pendingDeleteMedia = null;
  deleteTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  deleteConfirmName.textContent = `${targets.length} ${targets.length === 1 ? "foto seleccionada" : "fotos seleccionadas"}`;
  deleteConfirmDialog.setAttribute("aria-hidden", "false");
  document.body.classList.add("has-open-dialog");
  deleteConfirmCancelButton.focus();
}

export function closeDeleteConfirm(options = {}) {
  state.pendingDeleteMedia = null;
  state.pendingDeleteMediaBatch = null;
  deleteConfirmDialog.setAttribute("aria-hidden", "true");
  document.body.classList.remove("has-open-dialog");

  if (options.restoreFocus !== false && deleteTrigger?.isConnected) {
    deleteTrigger.focus();
  }

  deleteTrigger = null;
}

export function trapDeleteDialogFocus(event) {
  if (event.key !== "Tab") {
    return;
  }

  const focusableElements = [deleteConfirmCancelButton, deleteConfirmAcceptButton];
  const currentIndex = focusableElements.indexOf(document.activeElement);
  const nextIndex = event.shiftKey
    ? (currentIndex <= 0 ? focusableElements.length - 1 : currentIndex - 1)
    : (currentIndex >= focusableElements.length - 1 ? 0 : currentIndex + 1);

  event.preventDefault();
  focusableElements[nextIndex].focus();
}

export async function confirmDelete() {
  if (state.pendingDeleteMediaBatch?.length) {
    const targets = state.pendingDeleteMediaBatch;
    const deleted = await deleteMediaBatch(targets);
    if (deleted) closeDeleteConfirm({ restoreFocus: false });
    return;
  }
  const media = state.pendingDeleteMedia;

  if (!media) {
    closeDeleteConfirm();
    return;
  }

  deleteConfirmAcceptButton.disabled = true;

  try {
    await removeMediaFromSource(media);
  } catch (error) {
    showNotice(`No se pudo eliminar el archivo. ${error?.message || ""}`.trim(), "error");
    deleteConfirmAcceptButton.disabled = false;
    return;
  }

  deleteConfirmAcceptButton.disabled = false;
  closeDeleteConfirm({ restoreFocus: false });

  const deletedIndex = state.images.indexOf(media);

  if (isFavorite(media)) {
    await toggleFavorite(media);
  }

  state.allMedia = state.allMedia.filter((item) => item !== media);
  state.folders = getFoldersFromMedia(state.allMedia);
  applyFolderFilter();

  if (deletedIndex >= 0) {
    state.activeIndex = state.images.length > 0 ? Math.min(deletedIndex, state.images.length - 1) : -1;
  }

  await renderActiveImage();
  renderFavorites();
  showNotice(`"${media.name}" se eliminó.`, "info");
}

export async function deleteMediaBatch(mediaItems) {
  const targets = Array.from(new Set(mediaItems)).filter(canDeleteMedia);
  if (!targets.length) {
    showNotice("No se pueden eliminar las fotos seleccionadas desde esta fuente.", "warning");
    return false;
  }

  try {
    for (const media of targets) await removeMediaFromSource(media);
  } catch (error) {
    showNotice(`No se pudieron eliminar todas las fotos. ${error?.message || ""}`.trim(), "error");
    return false;
  }

  for (const media of targets) {
    if (isFavorite(media)) await toggleFavorite(media);
  }
  const targetSet = new Set(targets);
  state.allMedia = state.allMedia.filter((item) => !targetSet.has(item));
  state.folders = getFoldersFromMedia(state.allMedia);
  applyFolderFilter();
  state.activeIndex = state.images.length ? Math.min(state.activeIndex, state.images.length - 1) : -1;
  await renderActiveImage();
  renderFavorites();
  showNotice(`${targets.length} ${targets.length === 1 ? "foto eliminada" : "fotos eliminadas"}.`, "info");
  return true;
}

async function removeMediaFromSource(media) {
  if (media.absolutePath) {
    const response = await fetch(`/media?path=${encodeURIComponent(media.absolutePath)}`, { method: "DELETE" });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "El servidor no pudo eliminar el archivo.");
    }

    return;
  }

  if (state.activeDirectoryHandle) {
    const segments = media.path.split("/");
    const fileName = segments.pop();
    let directoryHandle = state.activeDirectoryHandle;

    for (const segment of segments) {
      directoryHandle = await directoryHandle.getDirectoryHandle(segment);
    }

    await directoryHandle.removeEntry(fileName);
    return;
  }

  throw new Error("No hay acceso de escritura a la carpeta de origen.");
}
