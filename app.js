import { state } from "./src/state.js";
import {
  folderInput, previousButton, nextButton, fullscreenButton,
  playButton, stopButton, shuffleButton,
  resetZoomButton, themeToggleButton, closeViewerButton, sidebarToggleButton, menuButton, sortButton,
  sidebarScrim, clearRecentFoldersButton, newCollectionButton, addToCollectionButton, foldersSectionToggle, collectionsSectionToggle, imageViewport,
  controls, activeImage, activeVideo, photoFrame, folderNav, mediaStrip,
  sidebarImportButton, favoriteButton, deleteButton, deleteConfirmDialog, deleteConfirmCancelButton, deleteConfirmAcceptButton,
  clearRecentConfirmDialog, clearRecentConfirmCancelButton, clearRecentConfirmAcceptButton,
  newCollectionDialog, newCollectionName, newCollectionCancelButton, newCollectionAcceptButton,
  collectionMenu, zoomPopover, zoomSlider, adjustmentsButton,
  adjustmentInputs, resetAdjustmentsButton
} from "./src/dom.js";
import {
  handleBrowserFolderIntent, handleFolderSelection, loadLocalFolder, closeViewer, openRecentFolder
} from "./src/file-loader.js";
import {
  showPrevious, showNext, toggleFullscreen, startSlideshow, stopSlideshowAndRender,
  toggleShuffle, handleImageDoubleClick, updateFullscreenButton, updateFrameOrientation,
  handleVideoEnded, isActiveVideo, applyFolderFilter, updateFavoriteButton, renderActiveImage, renderFolderNav
} from "./src/viewer.js";
import {
  setZoom, startImageDrag, dragImage, endImageDrag, resetFullscreenZoom
} from "./src/zoom-pan.js";
import {
  cycleThemePreference, openSidebar, toggleSidebar, closeSidebar, setThemePreference, renderRecentFolders, renderFavorites, renderCollections, renderSortOptions, showNotice
} from "./src/ui.js";
import { loadRecentFolders, clearRecentFolders } from "./src/storage.js";
import { loadFavorites, toggleFavorite } from "./src/favorites.js";
import { openDeleteConfirm, closeDeleteConfirm, confirmDelete, trapDeleteDialogFocus } from "./src/delete.js";
import { createCollection, isMediaInCollection, loadCollections, toggleMediaInCollection } from "./src/collections.js";
import { FAVORITES_FOLDER_PATH, HOME_CTA_SEEN_KEY } from "./src/constants.js";
import {
  renderImageAdjustmentControls,
  resetImageAdjustments,
  updateImageAdjustment
} from "./src/image-adjustments.js";

let favoriteControlTimer = 0;
let viewerControlsTimer = 0;
let clearRecentFoldersTrigger = null;
let pendingCollectionMedia = null;

function openClearRecentFoldersConfirm() {
  clearRecentFoldersTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  clearRecentConfirmDialog.setAttribute("aria-hidden", "false");
  document.body.classList.add("has-open-dialog");
  clearRecentConfirmCancelButton.focus();
}

function closeClearRecentFoldersConfirm(options = {}) {
  clearRecentConfirmDialog.setAttribute("aria-hidden", "true");
  document.body.classList.remove("has-open-dialog");

  if (options.restoreFocus !== false && clearRecentFoldersTrigger?.isConnected) {
    clearRecentFoldersTrigger.focus();
  }

  clearRecentFoldersTrigger = null;
}

function trapClearRecentDialogFocus(event) {
  if (event.key !== "Tab") {
    return;
  }

  const focusableElements = [clearRecentConfirmCancelButton, clearRecentConfirmAcceptButton];
  const currentIndex = focusableElements.indexOf(document.activeElement);
  const nextIndex = event.shiftKey
    ? (currentIndex <= 0 ? focusableElements.length - 1 : currentIndex - 1)
    : (currentIndex >= focusableElements.length - 1 ? 0 : currentIndex + 1);

  event.preventDefault();
  focusableElements[nextIndex].focus();
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
  state.collections.forEach((collection) => {
    const item = document.createElement("button");
    const isIncluded = isMediaInCollection(collection.id, state.images[state.activeIndex]);
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
      const result = await toggleMediaInCollection(collection.id, state.images[state.activeIndex]);
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
  let hasSeenHomeCta = false;

  try {
    hasSeenHomeCta = localStorage.getItem(HOME_CTA_SEEN_KEY) === "true";
    localStorage.setItem(HOME_CTA_SEEN_KEY, "true");
  } catch (error) {}

  window.setTimeout(() => openSidebar("folders"), hasSeenHomeCta ? 350 : 2600);
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
      if (clearRecentConfirmDialog.getAttribute("aria-hidden") === "false") {
        closeClearRecentFoldersConfirm();
      } else {
        closeDeleteConfirm();
      }
    } else if (clearRecentConfirmDialog.getAttribute("aria-hidden") === "false") {
      trapClearRecentDialogFocus(event);
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

  if (!state.images.length) {
    if (event.key === "Enter" && canOpenFolderFromKeyboard(event)) {
      event.preventDefault();
      loadLocalFolder();
    }

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
deleteConfirmAcceptButton.addEventListener("click", () => confirmDelete());
deleteConfirmDialog.addEventListener("click", (event) => {
  if (event.target === deleteConfirmDialog) {
    closeDeleteConfirm();
  }
});
clearRecentFoldersButton.addEventListener("click", openClearRecentFoldersConfirm);
foldersSectionToggle.addEventListener("click", toggleSidebarSection);
collectionsSectionToggle.addEventListener("click", toggleSidebarSection);
clearRecentConfirmCancelButton.addEventListener("click", () => closeClearRecentFoldersConfirm());
clearRecentConfirmAcceptButton.addEventListener("click", async () => {
  clearRecentConfirmAcceptButton.disabled = true;
  try {
    await clearRecentFolders();
    closeClearRecentFoldersConfirm({ restoreFocus: false });
    sidebarImportButton.focus();
  } catch (error) {
    showNotice("No se pudieron limpiar las carpetas recientes.", "error");
  } finally {
    clearRecentConfirmAcceptButton.disabled = false;
  }
});
clearRecentConfirmDialog.addEventListener("click", (event) => {
  if (event.target === clearRecentConfirmDialog) {
    closeClearRecentFoldersConfirm();
  }
});
newCollectionButton.addEventListener("click", () => openCollectionDialog());
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
activeVideo.addEventListener("ended", handleVideoEnded);

document.addEventListener("fullscreenchange", handleFullscreenChange);
document.addEventListener("pointermove", handleFullscreenMediaStrip);
mediaStrip.addEventListener("pointerleave", () => {
  if (document.fullscreenElement) {
    document.body.classList.remove("show-fullscreen-media-strip");
  }
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
renderFavorites();
renderCollections();
renderImageAdjustmentControls();
renderSortOptions();
initializeOnboarding();
