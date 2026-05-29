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

const folderInput = document.querySelector("#folderInput");
const folderSummary = document.querySelector("#folderSummary");
const emptyState = document.querySelector("#emptyState");
const stage = document.querySelector("#stage");
const activeImage = document.querySelector("#activeImage");
const activeName = document.querySelector("#activeName");
const activePosition = document.querySelector("#activePosition");
const previousButton = document.querySelector("#previousButton");
const nextButton = document.querySelector("#nextButton");
const serverButton = document.querySelector("#serverButton");
const fullscreenButton = document.querySelector("#fullscreenButton");
const zoomOutButton = document.querySelector("#zoomOutButton");
const zoomInButton = document.querySelector("#zoomInButton");
const resetZoomButton = document.querySelector("#resetZoomButton");
const zoomRange = document.querySelector("#zoomRange");

let images = [];
let activeIndex = -1;
let zoom = 100;
let sourceLabel = "Carpeta local";
let sourceMode = "local";
let currentObjectUrl = "";
let serverTotal = 0;
let serverHasMore = false;
let serverLoading = false;

folderInput.addEventListener("change", handleFolderSelection);
serverButton.addEventListener("click", loadServerImages);
previousButton.addEventListener("click", showPrevious);
nextButton.addEventListener("click", showNext);
fullscreenButton.addEventListener("click", toggleFullscreen);
zoomOutButton.addEventListener("click", () => setZoom(zoom - 10));
zoomInButton.addEventListener("click", () => setZoom(zoom + 10));
resetZoomButton.addEventListener("click", () => setZoom(100));
zoomRange.addEventListener("input", (event) => setZoom(Number(event.target.value)));

document.addEventListener("fullscreenchange", updateFullscreenButton);
document.addEventListener("keydown", handleKeyboard);

function handleFolderSelection(event) {
  clearActiveObjectUrl();
  sourceMode = "local";
  sourceLabel = "Carpeta local";
  serverTotal = 0;
  serverHasMore = false;

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
  renderActiveImage();
}

async function loadServerImages() {
  clearActiveObjectUrl();
  sourceMode = "server";
  sourceLabel = "Servidor local";
  images = [];
  activeIndex = -1;
  serverTotal = 0;
  serverHasMore = false;
  serverButton.disabled = true;
  folderSummary.textContent = "Cargando primeras imagenes desde el servidor local...";

  try {
    await loadServerPage(0);
    activeIndex = images.length > 0 ? 0 : -1;
    setZoom(100);
    renderActiveImage();
  } catch (error) {
    images = [];
    activeIndex = -1;
    renderActiveImage();
    folderSummary.textContent = "No se pudo cargar /api/images. Inicia el servidor local con node server.js.";
  } finally {
    serverButton.disabled = false;
  }
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
  emptyState.classList.toggle("is-hidden", hasImages);
  stage.classList.toggle("is-hidden", !hasImages);

  fullscreenButton.disabled = !hasImages;
  zoomOutButton.disabled = !hasImages;
  zoomInButton.disabled = !hasImages;
  resetZoomButton.disabled = !hasImages;
  zoomRange.disabled = !hasImages;
  previousButton.disabled = activeIndex <= 0;
  nextButton.disabled = !canMoveNext();

  if (!hasImages) {
    clearActiveObjectUrl();
    activeImage.removeAttribute("src");
    activeImage.alt = "";
    activeName.textContent = "";
    activePosition.textContent = "";
    updateSummary();
    return;
  }

  const image = images[activeIndex];
  activeImage.src = getImageUrl(image);
  activeImage.alt = image.name;
  activeName.textContent = image.name;
  activeName.title = image.path;
  activePosition.textContent = getPositionText();
  updateSummary();

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
  return `${activeIndex + 1} / ${total}`;
}

function updateSummary() {
  if (!images.length) {
    folderSummary.textContent = "No se encontraron imagenes en la carpeta seleccionada.";
    return;
  }

  if (sourceMode === "server" && serverTotal) {
    folderSummary.textContent = `${sourceLabel} · ${activeIndex + 1} de ${serverTotal} · ${images.length} cargadas`;
    return;
  }

  folderSummary.textContent = `${sourceLabel} · ${activeIndex + 1} de ${images.length}`;
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
  selectImage(activeIndex + 1);
}

function canMoveNext() {
  return activeIndex < images.length - 1 || (sourceMode === "server" && serverHasMore);
}

async function maybePrefetchServerPage() {
  if (sourceMode !== "server" || !serverHasMore || serverLoading) {
    return;
  }

  const remainingLoaded = images.length - activeIndex - 1;
  if (remainingLoaded <= PREFETCH_REMAINING) {
    await loadServerPage(images.length);
    updateSummary();
  }
}

async function toggleFullscreen() {
  if (!images.length) {
    return;
  }

  if (document.fullscreenElement) {
    await document.exitFullscreen();
    return;
  }

  await document.documentElement.requestFullscreen();
}

function updateFullscreenButton() {
  fullscreenButton.textContent = document.fullscreenElement ? "Salir" : "Pantalla completa";
}

function setZoom(nextZoom) {
  zoom = Math.min(300, Math.max(25, nextZoom));
  zoomRange.value = String(zoom);
  resetZoomButton.textContent = `${zoom}%`;
  activeImage.style.setProperty("--zoom", String(zoom / 100));
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
    "+": () => setZoom(zoom + 10),
    "=": () => setZoom(zoom + 10),
    "-": () => setZoom(zoom - 10),
    0: () => setZoom(100),
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
