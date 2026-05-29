const IMAGE_TYPES = new Set([
  "image/avif",
  "image/bmp",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/svg+xml",
  "image/webp",
]);

const folderInput = document.querySelector("#folderInput");
const folderSummary = document.querySelector("#folderSummary");
const imageCount = document.querySelector("#imageCount");
const thumbnailList = document.querySelector("#thumbnailList");
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
  releaseImageUrls();
  sourceLabel = "Carpeta local";

  const files = Array.from(event.target.files || []);
  images = files
    .filter(isSupportedImage)
    .sort((a, b) => getDisplayPath(a).localeCompare(getDisplayPath(b), undefined, { numeric: true }))
    .map((file) => ({
      file,
      name: file.name,
      path: getDisplayPath(file),
      url: URL.createObjectURL(file),
      isObjectUrl: true,
    }));

  activeIndex = images.length > 0 ? 0 : -1;
  setZoom(100);
  renderThumbnails();
  renderActiveImage();
}

async function loadServerImages() {
  releaseImageUrls();
  serverButton.disabled = true;
  folderSummary.textContent = "Cargando imagenes desde el servidor local...";

  try {
    const response = await fetch("/api/images");
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    sourceLabel = payload.root || "Servidor local";
    images = payload.images.map((image) => ({
      name: image.name,
      path: image.path,
      url: image.url,
      isObjectUrl: false,
    }));

    activeIndex = images.length > 0 ? 0 : -1;
    setZoom(100);
    renderThumbnails();
    renderActiveImage();
  } catch (error) {
    images = [];
    activeIndex = -1;
    renderThumbnails();
    renderActiveImage();
    folderSummary.textContent = "No se pudo cargar /api/images. Inicia el servidor local con node server.js.";
  } finally {
    serverButton.disabled = false;
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

function renderThumbnails() {
  thumbnailList.replaceChildren();
  imageCount.textContent = String(images.length);

  folderSummary.textContent = images.length
    ? `${sourceLabel} · ${images.length} imagenes`
    : "No se encontraron imagenes en la carpeta seleccionada.";

  images.forEach((image, index) => {
    const button = document.createElement("button");
    button.className = "thumbnail";
    button.type = "button";
    button.dataset.index = String(index);
    button.setAttribute("aria-label", `Abrir ${image.name}`);
    button.addEventListener("click", () => selectImage(index));

    const thumbnail = document.createElement("img");
    thumbnail.src = image.url;
    thumbnail.alt = "";
    thumbnail.loading = "lazy";

    const label = document.createElement("span");
    label.textContent = image.name;
    label.title = image.path;

    button.append(thumbnail, label);
    thumbnailList.append(button);
  });
}

function renderActiveImage() {
  const hasImages = images.length > 0;
  emptyState.classList.toggle("is-hidden", hasImages);
  stage.classList.toggle("is-hidden", !hasImages);

  fullscreenButton.disabled = !hasImages;
  zoomOutButton.disabled = !hasImages;
  zoomInButton.disabled = !hasImages;
  resetZoomButton.disabled = !hasImages;
  zoomRange.disabled = !hasImages;
  previousButton.disabled = activeIndex <= 0;
  nextButton.disabled = activeIndex >= images.length - 1;

  if (!hasImages) {
    activeImage.removeAttribute("src");
    activeImage.alt = "";
    activeName.textContent = "";
    activePosition.textContent = "";
    return;
  }

  const image = images[activeIndex];
  activeImage.src = image.url;
  activeImage.alt = image.name;
  activeName.textContent = image.name;
  activeName.title = image.path;
  activePosition.textContent = `${activeIndex + 1} / ${images.length}`;

  document.querySelectorAll(".thumbnail").forEach((thumbnail) => {
    const isActive = Number(thumbnail.dataset.index) === activeIndex;
    thumbnail.classList.toggle("is-active", isActive);
    thumbnail.setAttribute("aria-current", isActive ? "true" : "false");
  });

  document.querySelector(".thumbnail.is-active")?.scrollIntoView({
    block: "nearest",
    inline: "nearest",
  });
}

function selectImage(index) {
  if (index < 0 || index >= images.length) {
    return;
  }

  activeIndex = index;
  setZoom(100);
  renderActiveImage();
}

function showPrevious() {
  selectImage(activeIndex - 1);
}

function showNext() {
  selectImage(activeIndex + 1);
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

function releaseImageUrls() {
  images.forEach((image) => {
    if (image.isObjectUrl) {
      URL.revokeObjectURL(image.url);
    }
  });
}
