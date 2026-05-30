const IMAGE_TYPES = new Set([
  "image/avif",
  "image/bmp",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/svg+xml",
  "image/webp",
]);

const SERVER_PAGE_SIZE = 100;
const PREFETCH_REMAINING = 12;
const SLIDESHOW_INTERVAL_MS = 4000;
const BROWSER_PICKER_WARNING = "Modo sin servidor: evita elegir una carpeta demasiado grande.";
const THEME_SEQUENCE = ["auto", "light", "dark"];

const folderInput = document.querySelector("#folderInput");
const browserFolderWarning = document.querySelector("#browserFolderWarning");
const stage = document.querySelector("#stage");
const photoFrame = document.querySelector("#photoFrame");
const placeholderImage = document.querySelector("#placeholderImage");
const imageViewport = document.querySelector("#imageViewport");
const activeImage = document.querySelector("#activeImage");
const activeName = document.querySelector("#activeName");
const activePosition = document.querySelector("#activePosition");
const zoomSelection = document.querySelector("#zoomSelection");
const previousButton = document.querySelector("#previousButton");
const nextButton = document.querySelector("#nextButton");
const serverButton = document.querySelector("#serverButton");
const fullscreenButton = document.querySelector("#fullscreenButton");
const playButton = document.querySelector("#playButton");
const stopButton = document.querySelector("#stopButton");
const shuffleButton = document.querySelector("#shuffleButton");
const zoomOutButton = document.querySelector("#zoomOutButton");
const zoomInButton = document.querySelector("#zoomInButton");
const resetZoomButton = document.querySelector("#resetZoomButton");
const themeToggleButton = document.querySelector("#themeToggleButton");

let images = [];
let activeIndex = -1;
let zoom = 100;
let sourceLabel = "Carpeta local";
let sourceMode = "local";
let currentObjectUrl = "";
let serverTotal = 0;
let serverHasMore = false;
let serverLoading = false;
let isPlaying = false;
let shuffleEnabled = false;
let slideshowTimer = 0;
let panX = 0;
let panY = 0;
let dragState = null;
let fullscreenSelection = null;
let fullscreenZoom = {
  active: false,
  scale: 1,
  x: 0,
  y: 0,
};

folderInput.addEventListener("click", handleBrowserFolderIntent);
folderInput.addEventListener("change", handleFolderSelection);
serverButton.addEventListener("click", loadServerImages);
previousButton.addEventListener("click", showPrevious);
nextButton.addEventListener("click", showNext);
fullscreenButton.addEventListener("click", toggleFullscreen);
playButton.addEventListener("click", startSlideshow);
stopButton.addEventListener("click", stopSlideshowAndRender);
shuffleButton.addEventListener("click", toggleShuffle);
zoomOutButton.addEventListener("click", () => setZoom(zoom - 10));
zoomInButton.addEventListener("click", () => setZoom(zoom + 10));
resetZoomButton.addEventListener("click", () => setZoom(100));
themeToggleButton.addEventListener("click", cycleThemePreference);
imageViewport.addEventListener("pointerdown", startImageDrag);
imageViewport.addEventListener("pointermove", dragImage);
imageViewport.addEventListener("pointerup", endImageDrag);
imageViewport.addEventListener("pointercancel", endImageDrag);
imageViewport.addEventListener("lostpointercapture", endImageDrag);
imageViewport.addEventListener("dblclick", resetFullscreenZoom);
activeImage.addEventListener("load", updateFrameOrientation);

document.addEventListener("fullscreenchange", updateFullscreenButton);
document.addEventListener("keydown", handleKeyboard);
setThemePreference(localStorage.getItem("imageVisorTheme") || "auto", { persist: false });

async function handleBrowserFolderIntent() {
  browserFolderWarning.classList.remove("is-hidden");
  browserFolderWarning.textContent = BROWSER_PICKER_WARNING;
}

async function handleFolderSelection(event) {
  clearActiveObjectUrl();
  sourceMode = "local";
  sourceLabel = "Carpeta local";
  serverTotal = 0;
  serverHasMore = false;
  stopSlideshow();

  const files = Array.from(event.target.files || []);
  images = files
    .filter(isSupportedImage)
    .sort((a, b) => getDisplayPath(a).localeCompare(getDisplayPath(b), undefined, { numeric: true }))
    .map((file) => ({
      file,
      name: file.name,
      path: getDisplayPath(file),
    }));

  activeIndex = images.length > 0 ? 0 : -1;
  setZoom(100);
  resetFullscreenZoom();
  await renderActiveImage();
}

async function loadServerImages() {
  clearActiveObjectUrl();
  browserFolderWarning.classList.add("is-hidden");
  sourceMode = "server";
  sourceLabel = "Servidor local";
  images = [];
  activeIndex = -1;
  serverTotal = 0;
  serverHasMore = false;
  stopSlideshow();
  serverButton.disabled = true;

  try {
    const folderSelected = await selectServerFolder();
    if (!folderSelected) {
      renderActiveImage();
      return;
    }

    await loadServerPage(0);
    activeIndex = images.length > 0 ? 0 : -1;
    setZoom(100);
    await renderActiveImage();
  } catch (error) {
    images = [];
    activeIndex = -1;
    renderActiveImage();
    browserFolderWarning.classList.remove("is-hidden");
    browserFolderWarning.textContent = "No se pudo elegir o cargar la carpeta desde el servidor local.";
  } finally {
    serverButton.disabled = false;
  }
}

async function selectServerFolder() {
  const response = await fetch("/api/select-folder", { method: "POST" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (payload.cancelled) {
    return false;
  }

  sourceLabel = payload.root || "Servidor local";
  return true;
}

async function loadServerPage(offset) {
  if (serverLoading) {
    return;
  }

  serverLoading = true;

  try {
    const response = await fetch(`/api/images?offset=${offset}&limit=${SERVER_PAGE_SIZE}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    sourceLabel = payload.root || "Servidor local";
    serverTotal = payload.total || payload.count || 0;
    serverHasMore = Boolean(payload.hasMore);

    const incoming = payload.images.map((image) => ({
      name: image.name,
      path: image.path,
      url: image.url,
    }));

    images.push(...incoming);
  } finally {
    serverLoading = false;
  }
}

function isSupportedImage(file) {
  if (IMAGE_TYPES.has(file.type)) {
    return true;
  }

  return /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(file.name);
}

function getDisplayPath(file) {
  return file.webkitRelativePath || file.name;
}

async function renderActiveImage() {
  const hasImages = images.length > 0;
  if (!hasImages) {
    stopSlideshow();
  }

  placeholderImage.classList.toggle("is-hidden", hasImages);
  imageViewport.classList.toggle("is-hidden", !hasImages);
  stage.classList.toggle("is-hidden", !hasImages);
  stage.classList.toggle("has-images", hasImages);
  photoFrame.classList.toggle("is-portrait", false);
  photoFrame.classList.toggle("is-landscape", false);

  fullscreenButton.disabled = !hasImages;
  zoomOutButton.disabled = !hasImages;
  zoomInButton.disabled = !hasImages;
  resetZoomButton.disabled = !hasImages;
  playButton.disabled = !hasImages || isPlaying;
  stopButton.disabled = !hasImages || !isPlaying;
  shuffleButton.disabled = !hasImages || images.length < 2;
  playButton.setAttribute("aria-pressed", String(isPlaying));
  playButton.classList.toggle("is-active", isPlaying);
  shuffleButton.setAttribute("aria-pressed", String(shuffleEnabled));
  shuffleButton.classList.toggle("is-active", shuffleEnabled);
  previousButton.disabled = activeIndex <= 0;
  nextButton.disabled = !canMoveNext();

  if (!hasImages) {
    clearActiveObjectUrl();
    activeImage.removeAttribute("src");
    activeImage.alt = "";
    activeName.textContent = "";
    activePosition.textContent = "";
    return;
  }

  const image = images[activeIndex];
  activeImage.src = getImageUrl(image);
  activeImage.alt = image.name;
  activeName.textContent = image.name;
  activeName.title = image.path;
  activePosition.textContent = getPositionText();
  resetFullscreenZoom();
  updateFrameOrientation();

  if (sourceMode === "server") {
    await maybePrefetchServerPage();
    nextButton.disabled = !canMoveNext();
  }
}

function getImageUrl(image) {
  if (sourceMode === "server") {
    clearActiveObjectUrl();
    return image.url;
  }

  clearActiveObjectUrl();
  currentObjectUrl = URL.createObjectURL(image.file);
  return currentObjectUrl;
}

function getPositionText() {
  const total = sourceMode === "server" && serverTotal ? serverTotal : images.length;
  return `${activeIndex + 1}/${total}`;
}

async function selectImage(index) {
  if (index < 0) {
    return;
  }

  if (sourceMode === "server" && index >= images.length && serverHasMore) {
    await loadServerPage(images.length);
  }

  if (index >= images.length) {
    return;
  }

  activeIndex = index;
  setZoom(100);
  await renderActiveImage();
}

function showPrevious() {
  selectImage(activeIndex - 1);
}

function showNext() {
  selectImage(getNextIndex());
}

function canMoveNext() {
  return activeIndex < images.length - 1 || (sourceMode === "server" && serverHasMore);
}

function getNextIndex() {
  if (!shuffleEnabled || images.length < 2) {
    return activeIndex + 1;
  }

  let nextIndex = activeIndex;
  while (nextIndex === activeIndex) {
    nextIndex = Math.floor(Math.random() * images.length);
  }

  return nextIndex;
}

async function startSlideshow() {
  if (!images.length) {
    return;
  }

  stopSlideshow();
  isPlaying = true;
  playButton.setAttribute("aria-pressed", "true");
  playButton.classList.add("is-active");
  slideshowTimer = window.setInterval(playNextSlide, SLIDESHOW_INTERVAL_MS);
  await renderActiveImage();
}

function stopSlideshow() {
  if (slideshowTimer) {
    window.clearInterval(slideshowTimer);
    slideshowTimer = 0;
  }

  isPlaying = false;
}

async function stopSlideshowAndRender() {
  stopSlideshow();
  await renderActiveImage();
}

async function playNextSlide() {
  if (!images.length) {
    stopSlideshow();
    await renderActiveImage();
    return;
  }

  if (shuffleEnabled && sourceMode === "server" && serverHasMore && !serverLoading) {
    await loadServerPage(images.length);
  }

  if (!shuffleEnabled && !canMoveNext()) {
    stopSlideshow();
    await renderActiveImage();
    return;
  }

  await selectImage(getNextIndex());
}

async function toggleShuffle() {
  shuffleEnabled = !shuffleEnabled;
  await renderActiveImage();
}

async function maybePrefetchServerPage() {
  if (sourceMode !== "server" || !serverHasMore || serverLoading) {
    return;
  }

  const remainingLoaded = images.length - activeIndex - 1;
  if (remainingLoaded <= PREFETCH_REMAINING) {
    await loadServerPage(images.length);
  }
}

async function toggleFullscreen() {
  if (!images.length) {
    return;
  }

  if (document.fullscreenElement) {
    await exitFullscreenMode();
    return;
  }

  setZoom(100);
  resetFullscreenZoom();
  await renderActiveImage();
  await enterFullscreenMode();
}

async function enterFullscreenMode() {
  if (document.fullscreenElement) {
    return;
  }

  try {
    await document.documentElement.requestFullscreen();
  } catch (error) {
    // Fullscreen can be blocked if the browser no longer considers this a user gesture.
  }
}

async function exitFullscreenMode() {
  if (document.fullscreenElement) {
    await document.exitFullscreen();
  }
}

function updateFullscreenButton() {
  fullscreenButton.setAttribute(
    "aria-label",
    document.fullscreenElement ? "Salir de pantalla completa" : "Pantalla completa",
  );

  if (!document.fullscreenElement) {
    resetFullscreenZoom();
    clearFullscreenSelection();
  }
}

function setZoom(nextZoom) {
  zoom = Math.min(300, Math.max(25, nextZoom));
  if (zoom <= 100) {
    panX = 0;
    panY = 0;
  }

  resetZoomButton.textContent = `${zoom}%`;
  applyImageTransform();
}

function setThemePreference(theme, options = {}) {
  const nextTheme = ["light", "dark", "auto"].includes(theme) ? theme : "auto";
  document.documentElement.dataset.theme = nextTheme;
  themeToggleButton.setAttribute("aria-label", getThemeLabel(nextTheme));

  if (options.persist !== false) {
    localStorage.setItem("imageVisorTheme", nextTheme);
  }
}

function cycleThemePreference() {
  const currentTheme = document.documentElement.dataset.theme || "auto";
  const currentIndex = THEME_SEQUENCE.indexOf(currentTheme);
  const nextTheme = THEME_SEQUENCE[(currentIndex + 1) % THEME_SEQUENCE.length];
  setThemePreference(nextTheme);
}

function getThemeLabel(theme) {
  const labels = {
    auto: "Modo automático",
    light: "Modo claro",
    dark: "Modo oscuro",
  };

  return labels[theme] || labels.auto;
}

function applyImageTransform() {
  if (!activeImage) {
    return;
  }

  const useFullscreenZoom = document.fullscreenElement && fullscreenZoom.active;
  const nextZoom = useFullscreenZoom ? fullscreenZoom.scale : zoom / 100;
  const nextPanX = useFullscreenZoom ? fullscreenZoom.x : panX;
  const nextPanY = useFullscreenZoom ? fullscreenZoom.y : panY;

  activeImage.style.setProperty("--zoom", String(nextZoom));
  activeImage.style.setProperty("--pan-x", `${nextPanX}px`);
  activeImage.style.setProperty("--pan-y", `${nextPanY}px`);
  imageViewport.classList.toggle("is-pannable", images.length > 0 && zoom > 100);
  imageViewport.classList.toggle("is-fullscreen-zoomed", useFullscreenZoom);
}

function updateFrameOrientation() {
  if (!images.length || !activeImage.naturalWidth || !activeImage.naturalHeight) {
    return;
  }

  const isPortrait = activeImage.naturalHeight > activeImage.naturalWidth;
  photoFrame.classList.toggle("is-portrait", isPortrait);
  photoFrame.classList.toggle("is-landscape", !isPortrait);
}

function startImageDrag(event) {
  if (document.fullscreenElement) {
    startFullscreenSelection(event);
    return;
  }

  if (!images.length || zoom <= 100 || document.fullscreenElement) {
    return;
  }

  dragState = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    panX,
    panY,
  };

  imageViewport.classList.add("is-dragging");
  imageViewport.setPointerCapture(event.pointerId);
  event.preventDefault();
}

function dragImage(event) {
  if (fullscreenSelection) {
    updateFullscreenSelection(event);
    return;
  }

  if (!dragState || dragState.pointerId !== event.pointerId) {
    return;
  }

  panX = dragState.panX + event.clientX - dragState.startX;
  panY = dragState.panY + event.clientY - dragState.startY;
  applyImageTransform();
}

function endImageDrag(event) {
  if (fullscreenSelection) {
    endFullscreenSelection(event);
    return;
  }

  if (!dragState || dragState.pointerId !== event.pointerId) {
    return;
  }

  dragState = null;
  imageViewport.classList.remove("is-dragging");
}

function startFullscreenSelection(event) {
  if (!images.length || !document.fullscreenElement || event.button !== 0) {
    return;
  }

  clearFullscreenSelection();
  fullscreenSelection = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    currentX: event.clientX,
    currentY: event.clientY,
  };

  imageViewport.classList.add("is-selecting");
  imageViewport.setPointerCapture(event.pointerId);
  updateZoomSelectionRect();
  event.preventDefault();
}

function updateFullscreenSelection(event) {
  if (!fullscreenSelection || fullscreenSelection.pointerId !== event.pointerId) {
    return;
  }

  fullscreenSelection.currentX = event.clientX;
  fullscreenSelection.currentY = event.clientY;
  updateZoomSelectionRect();
}

function endFullscreenSelection(event) {
  if (!fullscreenSelection || fullscreenSelection.pointerId !== event.pointerId) {
    return;
  }

  fullscreenSelection.currentX = event.clientX;
  fullscreenSelection.currentY = event.clientY;

  const selection = getFullscreenSelectionRect();
  clearFullscreenSelection();

  if (selection.width < 18 || selection.height < 18) {
    return;
  }

  zoomToFullscreenSelection(selection);
}

function updateZoomSelectionRect() {
  const selection = getFullscreenSelectionRect();
  zoomSelection.classList.remove("is-hidden");
  zoomSelection.style.left = `${selection.left}px`;
  zoomSelection.style.top = `${selection.top}px`;
  zoomSelection.style.width = `${selection.width}px`;
  zoomSelection.style.height = `${selection.height}px`;
}

function getFullscreenSelectionRect() {
  const viewportRect = imageViewport.getBoundingClientRect();
  const startX = clamp(fullscreenSelection.startX - viewportRect.left, 0, viewportRect.width);
  const startY = clamp(fullscreenSelection.startY - viewportRect.top, 0, viewportRect.height);
  const currentX = clamp(fullscreenSelection.currentX - viewportRect.left, 0, viewportRect.width);
  const currentY = clamp(fullscreenSelection.currentY - viewportRect.top, 0, viewportRect.height);

  return {
    left: Math.min(startX, currentX),
    top: Math.min(startY, currentY),
    width: Math.abs(currentX - startX),
    height: Math.abs(currentY - startY),
  };
}

function zoomToFullscreenSelection(selection) {
  const viewportRect = imageViewport.getBoundingClientRect();
  const renderedRect = getRenderedImageRect(viewportRect);
  const clippedSelection = intersectRects(selection, renderedRect);

  if (!clippedSelection || clippedSelection.width < 18 || clippedSelection.height < 18) {
    return;
  }

  const scale = Math.min(
    viewportRect.width / clippedSelection.width,
    viewportRect.height / clippedSelection.height,
  );
  const imageCenterX = renderedRect.left + renderedRect.width / 2;
  const imageCenterY = renderedRect.top + renderedRect.height / 2;
  const selectionCenterX = clippedSelection.left + clippedSelection.width / 2;
  const selectionCenterY = clippedSelection.top + clippedSelection.height / 2;

  fullscreenZoom = {
    active: true,
    scale,
    x: (imageCenterX - selectionCenterX) * scale,
    y: (imageCenterY - selectionCenterY) * scale,
  };

  applyImageTransform();
}

function getRenderedImageRect(viewportRect) {
  const imageRatio = activeImage.naturalWidth / activeImage.naturalHeight;
  const viewportRatio = viewportRect.width / viewportRect.height;

  if (imageRatio > viewportRatio) {
    const width = viewportRect.width;
    const height = width / imageRatio;
    return {
      left: 0,
      top: (viewportRect.height - height) / 2,
      width,
      height,
    };
  }

  const height = viewportRect.height;
  const width = height * imageRatio;
  return {
    left: (viewportRect.width - width) / 2,
    top: 0,
    width,
    height,
  };
}

function intersectRects(a, b) {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.left + a.width, b.left + b.width);
  const bottom = Math.min(a.top + a.height, b.top + b.height);

  if (right <= left || bottom <= top) {
    return null;
  }

  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  };
}

function resetFullscreenZoom() {
  fullscreenZoom = {
    active: false,
    scale: 1,
    x: 0,
    y: 0,
  };
  applyImageTransform();
}

function clearFullscreenSelection() {
  fullscreenSelection = null;
  imageViewport.classList.remove("is-selecting");
  zoomSelection.classList.add("is-hidden");
  zoomSelection.removeAttribute("style");
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function handleKeyboard(event) {
  if (!images.length) {
    return;
  }

  const keyMap = {
    ArrowLeft: showPrevious,
    ArrowRight: showNext,
    f: toggleFullscreen,
    F: toggleFullscreen,
    " ": () => (isPlaying ? stopSlideshowAndRender() : startSlideshow()),
    r: toggleShuffle,
    R: toggleShuffle,
    "+": () => setZoom(zoom + 10),
    "=": () => setZoom(zoom + 10),
    "-": () => setZoom(zoom - 10),
    0: () => {
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

function clearActiveObjectUrl() {
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = "";
  }
}
