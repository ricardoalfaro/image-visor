import { state } from "./state.js";
import {
  deleteConfirmDialog,
  deleteConfirmName,
  deleteConfirmAcceptButton,
} from "./dom.js";
import { showNotice, renderFavorites } from "./ui.js";
import { isFavorite, toggleFavorite } from "./favorites.js";
import { getFoldersFromMedia } from "./utils.js";
import { applyFolderFilter, renderActiveImage } from "./viewer.js";

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
  deleteConfirmName.textContent = media.name;
  deleteConfirmDialog.setAttribute("aria-hidden", "false");
  document.body.classList.add("has-open-dialog");
  deleteConfirmAcceptButton.focus();
}

export function closeDeleteConfirm() {
  state.pendingDeleteMedia = null;
  deleteConfirmDialog.setAttribute("aria-hidden", "true");
  document.body.classList.remove("has-open-dialog");
}

export async function confirmDelete() {
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
  closeDeleteConfirm();

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
