import { state } from "./src/state.js";
import {
  folderInput, serverButton, previousButton, nextButton, fullscreenButton,
  playButton, stopButton, shuffleButton, zoomOutButton, zoomInButton,
  resetZoomButton, themeToggleButton, closeViewerButton, menuButton,
  closeSidebarButton, sidebarScrim, clearRecentFoldersButton, imageViewport,
  controls, activeImage, activeVideo, photoFrame, folderNav, sortSelect,
  sidebarImportButton
} from "./src/dom.js";
import {
  handleBrowserFolderIntent, handleFolderSelection, loadLocalFolder, closeViewer
} from "./src/file-loader.js";
import {
  showPrevious, showNext, toggleFullscreen, startSlideshow, stopSlideshowAndRender,
  toggleShuffle, handleImageDoubleClick, updateFullscreenButton, updateFrameOrientation,
  handleVideoEnded, isActiveVideo, applyFolderFilter
} from "./src/viewer.js";
import {
  setZoom, startImageDrag, dragImage, endImageDrag, resetFullscreenZoom
} from "./src/zoom-pan.js";
import {
  cycleThemePreference, openSidebar, closeSidebar, setThemePreference, renderRecentFolders
} from "./src/ui.js";
import { loadRecentFolders, clearRecentFolders } from "./src/storage.js";

function handleViewerOutsideClick(event) {
  if (!state.images.length || document.fullscreenElement || document.body.classList.contains("has-open-sidebar")) {
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
  if (event.key === "Escape" && document.body.classList.contains("has-open-sidebar")) {
    event.preventDefault();
    closeSidebar();
    return;
  }

  if (!state.images.length) {
    if (event.key === "Enter" && canOpenFolderFromKeyboard(event)) {
      event.preventDefault();
      loadLocalFolder();
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

function canOpenFolderFromKeyboard(event) {
  if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
    return false;
  }

  if (document.body.classList.contains("has-open-sidebar") || serverButton.disabled) {
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
serverButton.addEventListener("click", loadLocalFolder);
sidebarImportButton.addEventListener("click", () => {
  closeSidebar();
  loadLocalFolder();
});
previousButton.addEventListener("click", showPrevious);
nextButton.addEventListener("click", showNext);
fullscreenButton.addEventListener("click", toggleFullscreen);
playButton.addEventListener("click", startSlideshow);
stopButton.addEventListener("click", stopSlideshowAndRender);
shuffleButton.addEventListener("click", toggleShuffle);
zoomOutButton.addEventListener("click", () => setZoom(state.zoom - 10));
zoomInButton.addEventListener("click", () => setZoom(state.zoom + 10));
resetZoomButton.addEventListener("click", () => setZoom(100));
themeToggleButton.addEventListener("click", cycleThemePreference);
closeViewerButton.addEventListener("click", closeViewer);
menuButton.addEventListener("click", openSidebar);
closeSidebarButton.addEventListener("click", closeSidebar);
sidebarScrim.addEventListener("click", closeSidebar);
clearRecentFoldersButton.addEventListener("click", clearRecentFolders);
imageViewport.addEventListener("pointerdown", startImageDrag);
imageViewport.addEventListener("pointermove", dragImage);
imageViewport.addEventListener("pointerup", endImageDrag);
imageViewport.addEventListener("pointercancel", endImageDrag);
imageViewport.addEventListener("lostpointercapture", endImageDrag);
imageViewport.addEventListener("dblclick", handleImageDoubleClick);
controls.addEventListener("click", (event) => event.stopPropagation());
controls.addEventListener("pointerdown", (event) => event.stopPropagation());
activeImage.addEventListener("load", updateFrameOrientation);
activeVideo.addEventListener("loadedmetadata", updateFrameOrientation);
activeVideo.addEventListener("ended", handleVideoEnded);
sortSelect.addEventListener("change", (event) => {
  state.sortBy = event.target.value;
  applyFolderFilter({ keepIndex: true });
});

document.addEventListener("fullscreenchange", updateFullscreenButton);
document.addEventListener("click", handleViewerOutsideClick);
document.addEventListener("keydown", handleKeyboard);

setThemePreference("auto", { persist: false });
loadRecentFolders();
renderRecentFolders();
