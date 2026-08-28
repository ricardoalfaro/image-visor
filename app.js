import { state } from "./src/state.js";
import {
  folderInput, previousButton, nextButton, fullscreenButton,
  playButton, stopButton, shuffleButton,
  resetZoomButton, themeToggleButton, closeViewerButton, sidebarToggleButton, menuButton, sortButton,
  sidebarScrim, addToCollectionButton, foldersSectionToggle, collectionsSectionToggle, imageViewport,
  controls, activeImage, activeVideo, photoFrame, folderNav, mediaStrip,
  gallerySelectionBar, gallerySelectionCount, gallerySelectionCancel, gallerySelectionDelete,
  sidebarImportButton, favoriteButton, deleteButton, deleteConfirmDialog, deleteConfirmCancelButton, deleteConfirmAcceptButton,
  newCollectionDialog, newCollectionName, newCollectionCancelButton, newCollectionAcceptButton,
  collectionMenu, zoomPopover, zoomSlider, adjustmentsButton,
  adjustmentInputs, resetAdjustmentsButton
} from "./src/dom.js";
import {
  handleBrowserFolderIntent, handleFolderSelection, loadLocalFolder, closeViewer, openRecentFolder
} from "./src/file-loader.js";
import {
  showPrevious, showNext, toggleFullscreen, startSlideshow, stopSlideshowAndRender,
  toggleShuffle, handleImageDoubleClick, updateFullscreenButton, updateFrameOrientation, selectImage,
  handleVideoEnded, isActiveVideo, applyFolderFilter, updateFavoriteButton, renderActiveImage, renderFolderNav
} from "./src/viewer.js";
import {
  setZoom, startImageDrag, dragImage, endImageDrag, resetFullscreenZoom
} from "./src/zoom-pan.js";
import {
  cycleThemePreference, openSidebar, toggleSidebar, closeSidebar, setThemePreference, renderRecentFolders, renderFavorites, renderCollections, renderSortOptions, showNotice
} from "./src/ui.js";
import { loadRecentFolders } from "./src/storage.js";
import { isFavorite, loadFavorites, toggleFavorite } from "./src/favorites.js";
import { openDeleteConfirm, openDeleteBatchConfirm, closeDeleteConfirm, confirmDelete, trapDeleteDialogFocus } from "./src/delete.js";
import { createCollection, isMediaInCollection, loadCollections, toggleMediaInCollection } from "./src/collections.js";
import { FAVORITES_FOLDER_PATH, HOME_CTA_SEEN_KEY } from "./src/constants.js";
import {
  renderImageAdjustmentControls,
  resetImageAdjustments,
  updateImageAdjustment
} from "./src/image-adjustments.js";

let favoriteControlTimer = 0;
let viewerControlsTimer = 0;
let pendingCollectionMedia = null;

function setMediaStripExpanded(expanded) {
  if (expanded) {
    closeSidebar();
    state.gallerySelectedMedia.clear();
    state.gallerySelectionMode = false;
  }
  else {
    state.gallerySelectedMedia.clear();
    state.gallerySelectionMode = false;
    mediaStrip.querySelectorAll(".media-strip-item").forEach((item) => item.classList.remove("is-selected-for-delete"));
  }
  state.mediaStripExpanded = expanded;
  document.body.classList.toggle("media-strip-expanded", expanded);
  mediaStrip.setAttribute("aria-expanded", String(expanded));
  renderGallerySelectionBar();
  if (expanded) mediaStrip.focus({ preventScroll: true });
}

function renderGallerySelectionBar() {
  const count = state.gallerySelectedMedia.size;
  const visible = state.mediaStripExpanded && state.gallerySelectionMode && count > 0;
  gallerySelectionBar.classList.toggle("is-visible", visible);
  gallerySelectionBar.setAttribute("aria-hidden", String(!visible));
  gallerySelectionCount.textContent = `${count} ${count === 1 ? "foto seleccionada" : "fotos seleccionadas"}`;
  gallerySelectionDelete.disabled = count === 0;
}

function toggleSidebarSection(event) {
  const toggle = event.currentTarget;
  const section = toggle.closest(".recent-section");
  const isExpanded = toggle.getAttribute("aria-expanded") === "true";

  toggle.setAttribute("aria-expanded", String(!isExpanded));
  section?.classList.toggle("is-collapsed", isExpanded);
}

function openCollectionDialog(media = null) {
  pendingCollectionMedia = media;
  collectionMenu.classList.add("is-hidden");
  addToCollectionButton.setAttribute("aria-expanded", "false");
  newCollectionName.value = "";
  newCollectionDialog.setAttribute("aria-hidden", "false");
  document.body.classList.add("has-open-dialog");
  newCollectionName.focus();
}

function closeCollectionDialog() {
  pendingCollectionMedia = null;
  newCollectionDialog.setAttribute("aria-hidden", "true");
  document.body.classList.remove("has-open-dialog");
}

function renderCollectionMenu() {
  collectionMenu.replaceChildren();
  const activeMedia = state.images[state.activeIndex];
  const favoriteItem = document.createElement("button");
  const favoriteIncluded = isFavorite(activeMedia);
  favoriteItem.type = "button";
  favoriteItem.setAttribute("role", "menuitem");
  favoriteItem.disabled = !activeMedia || activeMedia.type === "video";
  favoriteItem.title = favoriteItem.disabled ? "Favoritos solo admite imágenes" : "Agregar o quitar de Favoritos";
  favoriteItem.classList.toggle("is-selected", favoriteIncluded);
  favoriteItem.append(document.createTextNode("Favoritos"));
  if (favoriteIncluded) {
    const check = document.createElement("i");
    check.className = "iconoir-check";
    check.setAttribute("aria-hidden", "true");
    favoriteItem.append(check);
  }
  favoriteItem.addEventListener("click", async () => {
    if (!activeMedia || activeMedia.type === "video") return;
    const result = await toggleFavorite(activeMedia);
    collectionMenu.classList.add("is-hidden");
    addToCollectionButton.setAttribute("aria-expanded", "false");
    renderFavorites();
    renderCollections();
    updateFavoriteButton(activeMedia);
    if (state.activeFolderPath === FAVORITES_FOLDER_PATH) {
      applyFolderFilter({ keepIndex: true });
      await renderActiveImage();
    }
    showNotice(result ? "Agregada a Favoritos." : "Quitada de Favoritos.", "info");
  });
  collectionMenu.append(favoriteItem);

  state.collections.forEach((collection) => {
    const item = document.createElement("button");
    const isIncluded = isMediaInCollection(collection.id, activeMedia);
    item.type = "button";
    item.setAttribute("role", "menuitem");
    item.classList.toggle("is-selected", isIncluded);
    item.append(document.createTextNode(collection.name));
    if (isIncluded) {
      const check = document.createElement("i");
      check.className = "iconoir-check";
      check.setAttribute("aria-hidden", "true");
      item.append(check);
    }
    item.addEventListener("click", async () => {
      const result = await toggleMediaInCollection(collection.id, activeMedia);
      collectionMenu.classList.add("is-hidden");
      addToCollectionButton.setAttribute("aria-expanded", "false");
      renderCollections();
      showNotice(result === "added" ? `Agregada a “${collection.name}”.` : result === "removed" ? `Quitada de “${collection.name}”.` : "No se pudo actualizar la colección.", result ? "info" : "warning");
    });
    collectionMenu.append(item);
  });
  const createItem = document.createElement("button");
  createItem.type = "button";
  createItem.setAttribute("role", "menuitem");
  createItem.textContent = "Nueva colección";
  createItem.addEventListener("click", () => openCollectionDialog(state.images[state.activeIndex]));
  collectionMenu.append(createItem);
}

function revealFullscreenFavorite() {
  if (!document.fullscreenElement || isActiveVideo()) {
    return;
  }

  revealViewerControls();
  window.clearTimeout(favoriteControlTimer);
  imageViewport.classList.add("show-favorite-control");
  favoriteControlTimer = window.setTimeout(() => {
    imageViewport.classList.remove("show-favorite-control");
  }, 1800);
}

function revealViewerControls() {
  if (isActiveVideo()) {
    return;
  }

  window.clearTimeout(viewerControlsTimer);
  imageViewport.classList.add("show-overlay-controls");
  viewerControlsTimer = window.setTimeout(() => {
    imageViewport.classList.remove("show-overlay-controls");
  }, 1800);
}

function handleFullscreenChange() {
  updateFullscreenButton();
  imageViewport.classList.remove("show-favorite-control");
  imageViewport.classList.remove("show-overlay-controls");
  window.clearTimeout(favoriteControlTimer);
  window.clearTimeout(viewerControlsTimer);
  favoriteControlTimer = 0;
  document.body.classList.remove("show-fullscreen-media-strip");

  if (document.fullscreenElement) {
    collectionMenu.classList.add("is-hidden");
    zoomPopover.classList.add("is-hidden");
    addToCollectionButton.setAttribute("aria-expanded", "false");
    closeSidebar();
  }
}

function handleFullscreenMediaStrip(event) {
  if (!document.fullscreenElement) {
    return;
  }

  const isInsideStrip = mediaStrip.contains(event.target);
  const isNearBottom = event.clientY >= window.innerHeight - 72;
  document.body.classList.toggle("show-fullscreen-media-strip", isInsideStrip || isNearBottom);
}

function initializeOnboarding() {
  try {
    localStorage.setItem(HOME_CTA_SEEN_KEY, "true");
  } catch (error) {}
}

function handleViewerOutsideClick(event) {
  if (
    !state.images.length ||
    document.fullscreenElement ||
    document.body.classList.contains("has-open-sidebar") ||
    document.body.classList.contains("has-open-dialog")
  ) {
    return;
  }

  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  if (
    photoFrame.contains(target) ||
    folderNav.contains(target) ||
    target.closest(".nav-button, .top-actions, .app-notice, button, input, select, textarea, a")
  ) {
    return;
  }

  closeViewer();
}

function handleKeyboard(event) {
  if (document.body.classList.contains("has-open-dialog")) {
    if (newCollectionDialog.getAttribute("aria-hidden") === "false") {
      if (event.key === "Escape") {
        event.preventDefault();
        closeCollectionDialog();
      } else if (event.key === "Enter") {
        event.preventDefault();
        newCollectionAcceptButton.click();
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
    } else {
      trapDeleteDialogFocus(event);
    }
    return;
  }

  if (event.key === "Escape" && document.body.classList.contains("has-open-sidebar")) {
    event.preventDefault();
    closeSidebar();
    return;
  }

  if (isFormControl(event.target)) {
    return;
  }

  if (state.mediaStripExpanded) {
    if (event.key === "Escape") {
      event.preventDefault();
      setMediaStripExpanded(false);
    } else if (event.key === "Enter") {
      event.preventDefault();
      setMediaStripExpanded(false);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      (event.key === "ArrowLeft" ? showPrevious : showNext)();
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const items = Array.from(mediaStrip.querySelectorAll(".media-strip-item"));
      const firstRowTop = items[0]?.offsetTop;
      const columns = Math.max(1, items.findIndex((item) => item.offsetTop > firstRowTop));
      const delta = event.key === "ArrowUp" ? -columns : columns;
      const nextIndex = Math.max(0, Math.min(state.images.length - 1, state.activeIndex + delta));
      selectImage(nextIndex);
    }
    return;
  }

  if (!state.images.length) {
    if (event.key === "Enter" && canOpenFolderFromKeyboard(event)) {
      event.preventDefault();
      loadLocalFolder();
    }

    return;
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    setMediaStripExpanded(true);
    return;
  }

  if (event.metaKey && (event.key === "Backspace" || event.key === "Delete")) {
    event.preventDefault();
    openDeleteConfirm();
    return;
  }

  if (event.metaKey && event.key.toLowerCase() === "f") {
    event.preventDefault();

    if (document.fullscreenElement) {
      revealFullscreenFavorite();
    } else {
      toggleFullscreen().then(revealFullscreenFavorite);
    }

    return;
  }

  if (event.key === "Escape" && !document.fullscreenElement) {
    event.preventDefault();
    closeViewer();
    return;
  }

  if (isActiveVideo()) {
    const videoKeyMap = {
      ArrowLeft: showPrevious,
      ArrowRight: showNext,
      r: toggleShuffle,
      R: toggleShuffle,
    };
    const videoHandler = videoKeyMap[event.key];
    if (videoHandler) {
      event.preventDefault();
      videoHandler();
    }
    return;
  }

  const keyMap = {
    ArrowLeft: showPrevious,
    ArrowRight: showNext,
    f: toggleFullscreen,
    F: toggleFullscreen,
    " ": () => (state.isPlaying ? stopSlideshowAndRender() : startSlideshow()),
    r: toggleShuffle,
    R: toggleShuffle,
    "+": () => {
      if (!isActiveVideo()) setZoom(state.zoom + 10);
    },
    "=": () => {
      if (!isActiveVideo()) setZoom(state.zoom + 10);
    },
    "-": () => {
      if (!isActiveVideo()) setZoom(state.zoom - 10);
    },
    0: () => {
      if (isActiveVideo()) return;
      setZoom(100);
      resetFullscreenZoom();
    },
  };

  const handler = keyMap[event.key];
  if (handler) {
    event.preventDefault();
    handler();
  }
}

function isFormControl(target) {
  return target instanceof Element
    && Boolean(target.closest("input, select, textarea, [contenteditable='true']"));
}

function canOpenFolderFromKeyboard(event) {
  if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
    return false;
  }

  if (document.body.classList.contains("has-open-sidebar") || sidebarImportButton.disabled) {
    return false;
  }

  const target = event.target;
  if (!(target instanceof Element)) {
    return true;
  }

  return !target.closest("button, input, select, textarea, a, [contenteditable='true']");
}

folderInput.addEventListener("click", handleBrowserFolderIntent);
folderInput.addEventListener("change", handleFolderSelection);
window.addEventListener("image-visor:recent-folders-updated", renderFolderNav);
window.addEventListener("image-visor:open-recent-folder", (event) => {
  openRecentFolder(event.detail?.folderId);
});
sidebarImportButton.addEventListener("click", () => {
  loadLocalFolder();
});
previousButton.addEventListener("click", showPrevious);
nextButton.addEventListener("click", showNext);
fullscreenButton.addEventListener("click", toggleFullscreen);
playButton.addEventListener("click", startSlideshow);
stopButton.addEventListener("click", stopSlideshowAndRender);
shuffleButton.addEventListener("click", toggleShuffle);
favoriteButton.addEventListener("click", async () => {
  const activeMedia = state.images[state.activeIndex];
  if (!activeMedia || activeMedia.type === "video") return;
  await toggleFavorite(activeMedia);
  renderFavorites();
  renderCollections();

  if (state.activeFolderPath === FAVORITES_FOLDER_PATH) {
    applyFolderFilter({ keepIndex: true });
    await renderActiveImage();
  } else {
    updateFavoriteButton(activeMedia);
  }
});
deleteButton.addEventListener("click", () => openDeleteConfirm());
deleteButton.addEventListener("pointerdown", (event) => event.stopPropagation());
deleteConfirmCancelButton.addEventListener("click", () => closeDeleteConfirm());
deleteConfirmAcceptButton.addEventListener("click", async () => {
  await confirmDelete();
  if (state.mediaStripExpanded && !state.pendingDeleteMediaBatch) setMediaStripExpanded(false);
});
deleteConfirmDialog.addEventListener("click", (event) => {
  if (event.target === deleteConfirmDialog) {
    closeDeleteConfirm();
  }
});
foldersSectionToggle.addEventListener("click", toggleSidebarSection);
collectionsSectionToggle.addEventListener("click", toggleSidebarSection);
addToCollectionButton.addEventListener("click", () => {
  renderCollectionMenu();
  const isOpen = !collectionMenu.classList.toggle("is-hidden");
  addToCollectionButton.setAttribute("aria-expanded", String(isOpen));
});
newCollectionCancelButton.addEventListener("click", closeCollectionDialog);
newCollectionAcceptButton.addEventListener("click", async () => {
  const collection = await createCollection(newCollectionName.value);
  if (!collection) { showNotice("No se pudo crear la colección.", "warning"); return; }
  if (pendingCollectionMedia) await toggleMediaInCollection(collection.id, pendingCollectionMedia);
  renderCollections();
  closeCollectionDialog();
  showNotice("Colección creada.", "info");
});
resetZoomButton.addEventListener("click", () => zoomPopover.classList.toggle("is-hidden"));
zoomSlider.addEventListener("input", () => setZoom(Number(zoomSlider.value)));
themeToggleButton.addEventListener("click", cycleThemePreference);
closeViewerButton.addEventListener("click", closeViewer);
sidebarToggleButton.addEventListener("click", () => {
  if (document.body.classList.contains("has-open-sidebar")) {
    closeSidebar();
  } else {
    openSidebar(state.activeSidebarPanel);
  }
});
menuButton.addEventListener("click", () => toggleSidebar("folders"));
adjustmentsButton.addEventListener("click", () => {
  toggleSidebar("adjustments");
  renderImageAdjustmentControls();
});
sortButton.addEventListener("click", () => toggleSidebar("sort"));
resetAdjustmentsButton.addEventListener("click", resetImageAdjustments);
adjustmentInputs.forEach((input) => {
  input.addEventListener("input", () => {
    updateImageAdjustment(input.dataset.imageAdjustment, input.value);
  });
});
imageViewport.addEventListener("pointerdown", startImageDrag);
imageViewport.addEventListener("pointermove", dragImage);
imageViewport.addEventListener("pointermove", revealFullscreenFavorite);
imageViewport.addEventListener("pointermove", revealViewerControls);
imageViewport.addEventListener("pointerup", endImageDrag);
imageViewport.addEventListener("pointercancel", endImageDrag);
imageViewport.addEventListener("lostpointercapture", endImageDrag);
imageViewport.addEventListener("dblclick", handleImageDoubleClick);
controls.addEventListener("click", (event) => event.stopPropagation());
controls.addEventListener("pointerdown", (event) => event.stopPropagation());
activeImage.addEventListener("load", updateFrameOrientation);
activeVideo.addEventListener("loadedmetadata", updateFrameOrientation);
activeVideo.addEventListener("canplay", () => {
  if (isActiveVideo() && activeVideo.paused) {
    activeVideo.play().catch(() => {
      activeVideo.muted = true;
      activeVideo.play().catch(() => {});
    });
  }
});
activeVideo.addEventListener("pointerup", () => {
  if (isActiveVideo() && activeVideo.paused) activeVideo.play().catch(() => {});
});
activeVideo.addEventListener("error", () => {
  if (isActiveVideo()) showNotice("No se pudo reproducir este video en el navegador.", "warning");
});
activeVideo.addEventListener("ended", handleVideoEnded);

document.addEventListener("fullscreenchange", handleFullscreenChange);
document.addEventListener("pointermove", handleFullscreenMediaStrip);
mediaStrip.addEventListener("pointerleave", () => {
  if (document.fullscreenElement) {
    document.body.classList.remove("show-fullscreen-media-strip");
  }
});
mediaStrip.addEventListener("wheel", (event) => {
  if (state.mediaStripExpanded || event.deltaY >= 0) return;
  event.preventDefault();
  setMediaStripExpanded(true);
}, { passive: false });
window.addEventListener("image-visor:gallery-selection-changed", renderGallerySelectionBar);
window.addEventListener("image-visor:gallery-open-image", () => setMediaStripExpanded(false));
gallerySelectionCancel.addEventListener("click", () => {
  state.gallerySelectedMedia.clear();
  state.gallerySelectionMode = false;
  renderGallerySelectionBar();
  mediaStrip.querySelectorAll(".media-strip-select").forEach((selector) => { selector.checked = false; });
  mediaStrip.querySelectorAll(".media-strip-item").forEach((item) => item.classList.remove("is-selected-for-delete"));
});
gallerySelectionDelete.addEventListener("click", async () => {
  const targets = Array.from(state.gallerySelectedMedia);
  if (!targets.length) return;
  openDeleteBatchConfirm(targets);
});
document.addEventListener("click", handleViewerOutsideClick);
document.addEventListener("keydown", handleKeyboard);

let initialTheme = "auto";

try {
  initialTheme = localStorage.getItem("imageVisorTheme") || "auto";
} catch (error) {}

setThemePreference(initialTheme, { persist: false });
await loadRecentFolders();
await loadFavorites();
await loadCollections();
renderRecentFolders();
renderCollections();
renderFavorites();
renderImageAdjustmentControls();
renderSortOptions();
initializeOnboarding();
