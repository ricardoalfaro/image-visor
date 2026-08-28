import { COLLECTIONS_FOLDER_PREFIX, FAVORITES_FOLDER_PATH, SLIDESHOW_INTERVAL_MS } from "./constants.js";
import { state, clearActiveObjectUrl, clearFolderThumbnailObjectUrls, clearMediaThumbnailObjectUrls } from "./state.js";
import {
  folderNav,
  mediaStrip,
  placeholderImage,
  imageViewport,
  stage,
  photoFrame,
  fullscreenButton,
  resetZoomButton,
  playButton,
  stopButton,
  shuffleButton,
  favoriteButton,
  deleteButton,
  addToCollectionButton,
  previousButton,
  nextButton,
  activeImage,
  activeVideo,
  activePosition,
} from "./dom.js";
import { setZoom, resetFullscreenZoom, clearFullscreenSelection } from "./zoom-pan.js";
import { getFavoriteKey, isFavorite } from "./favorites.js";
import { applyImageAdjustments, renderImageAdjustmentControls, resetImageAdjustments } from "./image-adjustments.js";
import { canDeleteMedia } from "./delete.js";
import { getCollectionMedia } from "./collections.js";

let renderedMediaItems = [];
let renderedMediaList = null;
let renderedActiveIndex = -1;
const thumbnailItemByElement = new WeakMap();
const thumbnailObserver = "IntersectionObserver" in window
  ? new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) {
        continue;
      }

      const item = thumbnailItemByElement.get(entry.target);
      if (item) {
        loadMediaThumbnail(item);
      }
      thumbnailObserver.unobserve(entry.target);
    }
  }, {
    root: mediaStrip,
    rootMargin: "400px",
  })
  : null;

export function applyFolderFilter(options = {}) {
  const previousItem = options.keepIndex ? state.images[state.activeIndex] : null;
  if (state.activeFolderPath === FAVORITES_FOLDER_PATH) {
    state.images = getAvailableFavorites();
  } else if (state.activeFolderPath.startsWith(COLLECTIONS_FOLDER_PREFIX)) {
    state.images = [...getCollectionMedia(state.activeFolderPath.slice(COLLECTIONS_FOLDER_PREFIX.length))];
  } else {
    state.images = state.activeFolderPath
      ? state.allMedia.filter((item) => isInsideFolder(item, state.activeFolderPath))
      : [...state.allMedia];
  }

  sortMedia();

  if (previousItem) {
    const nextIndex = state.images.findIndex((item) => item.path === previousItem.path);
    state.activeIndex = nextIndex >= 0 ? nextIndex : Math.min(state.activeIndex, state.images.length - 1);
  }

  renderFolderNav();
}

export function sortMedia() {
  state.images.sort((a, b) => {
    if (state.sortBy === "dateDesc") {
      const diff = b.lastModified - a.lastModified;
      return diff !== 0 ? diff : a.path.localeCompare(b.path, undefined, { numeric: true });
    }
    if (state.sortBy === "dateAsc") {
      const diff = a.lastModified - b.lastModified;
      return diff !== 0 ? diff : a.path.localeCompare(b.path, undefined, { numeric: true });
    }
    return a.path.localeCompare(b.path, undefined, { numeric: true });
  });
}

function isInsideFolder(item, folderPath) {
  return item.groupFolder === folderPath;
}

export async function selectFolder(path) {
  state.activeFolderPath = path;
  applyFolderFilter();
  state.activeIndex = state.images.length > 0 ? 0 : -1;
  stopSlideshow();
  setZoom(100);
  resetFullscreenZoom();
  await renderActiveImage();
}

export function renderFolderNav() {
  const favoriteCount = getAvailableFavorites().length;
  const hasImportedFolders = state.recentFolders.length > 1;
  const hasFolders = state.folders.length > 0 || favoriteCount > 0 || hasImportedFolders;
  clearFolderThumbnailObjectUrls();
  folderNav.classList.toggle("is-hidden", !hasFolders);
  folderNav.innerHTML = "";

  if (!hasFolders) {
    return;
  }

  if (state.allMedia.length > 0) {
    const allButton = createFolderButton({
      title: "Ver todo el contenido",
      isActive: state.activeFolderPath === "",
      path: "",
      thumbnailUrl: getFolderPreviewUrl(""),
    });
    folderNav.append(allButton);
  }

  if (favoriteCount > 0) {
    folderNav.append(createFolderButton({
      title: `Favoritos (${favoriteCount})`,
      isActive: state.activeFolderPath === FAVORITES_FOLDER_PATH,
      path: FAVORITES_FOLDER_PATH,
      thumbnailUrl: getFolderPreviewUrl(FAVORITES_FOLDER_PATH),
    }));
  }

  state.folders.forEach((folder) => {
    folderNav.append(createFolderButton({
      title: `${folder.path} (${folder.count})`,
      isActive: state.activeFolderPath === folder.path,
      path: folder.path,
      thumbnailUrl: getFolderPreviewUrl(folder.path),
    }));
  });

  state.recentFolders
    .filter((folder) => folder.id !== state.activeRecentFolderId)
    .forEach((folder) => {
      folderNav.append(createRecentFolderButton(folder));
    });
}

function createRecentFolderButton(folder) {
  const title = `Abrir ${folder.name}${Number.isInteger(folder.mediaCount) ? ` (${folder.mediaCount})` : ""}`;
  const preview = state.recentFolderPreviews.get(folder.id);
  const thumbnailUrl = preview ? getMediaPreviewUrl(preview) : "";
  const button = document.createElement("button");

  button.className = "folder-button imported-folder-button";
  button.type = "button";
  button.title = title;
  button.setAttribute("aria-label", title);
  button.setAttribute("aria-pressed", "false");
  button.dataset.folderId = folder.id;
  button.classList.toggle("is-placeholder", !thumbnailUrl);
  if (thumbnailUrl) {
    button.style.backgroundImage = `url("${thumbnailUrl}")`;
  } else {
    button.style.backgroundColor = getFolderFallbackColor(folder.id);
    const icon = document.createElement("i");
    icon.className = "iconoir-folder";
    icon.setAttribute("aria-hidden", "true");
    button.append(icon);
  }
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    window.dispatchEvent(new CustomEvent("image-visor:open-recent-folder", { detail: { folderId: folder.id } }));
  });
  return button;
}

function createFolderButton({ title, isActive, path, thumbnailUrl }) {
  const button = document.createElement("button");
  button.className = "folder-button";
  button.type = "button";
  button.title = title;
  button.setAttribute("aria-label", title);
  button.setAttribute("aria-pressed", String(isActive));
  button.classList.toggle("is-active", isActive);
  if (thumbnailUrl) {
    button.style.backgroundImage = `url("${thumbnailUrl}")`;
  } else {
    button.classList.add("is-placeholder");
    button.style.backgroundColor = getFolderFallbackColor(path || title);
  }
  button.addEventListener("click", () => selectFolder(path));
  return button;
}

function getFolderFallbackColor(seed) {
  let hash = 0;

  for (const character of seed) {
    hash = ((hash << 5) - hash) + character.charCodeAt(0);
    hash |= 0;
  }

  return `hsl(${Math.abs(hash) % 360} 52% 58%)`;
}

function getFolderPreviewUrl(folderPath) {
  const preview = folderPath === FAVORITES_FOLDER_PATH
    ? getAvailableFavorites()[0]
    : state.allMedia.find((item) => {
      if (item.type !== "image") {
        return false;
      }

      return folderPath ? item.groupFolder === folderPath : true;
    });

  return preview ? getMediaPreviewUrl(preview) : "";
}

function getMediaPreviewUrl(preview) {

  if (preview.url) {
    return preview.url;
  }

  const objectUrl = URL.createObjectURL(preview.file);
  state.folderThumbnailObjectUrls.push(objectUrl);
  return objectUrl;
}

export function getAvailableFavorites() {
  const favoritesByKey = new Map();

  for (const item of state.favoriteMedia) {
    favoritesByKey.set(item.favoriteKey, item);
  }

  for (const item of state.allMedia) {
    if (item.type === "image" && isFavorite(item)) {
      favoritesByKey.set(getFavoriteKey(item), item);
    }
  }

  return [...favoritesByKey.values()];
}

export async function renderActiveImage() {
  const hasImages = state.images.length > 0;
  const activeMedia = hasImages ? state.images[state.activeIndex] : null;
  const isVideo = activeMedia?.type === "video";
  if (!hasImages) {
    stopSlideshow();
  }

  renderMediaStrip();

  placeholderImage.classList.toggle("is-hidden", hasImages);
  imageViewport.classList.toggle("is-hidden", !hasImages);
  imageViewport.classList.toggle("has-video", Boolean(isVideo));
  imageViewport.classList.toggle("is-playing", state.isPlaying);
  stage.classList.toggle("is-hidden", !hasImages);
  stage.classList.toggle("has-images", hasImages);
  document.body.classList.toggle("has-loaded-images", hasImages);
  photoFrame.classList.toggle("is-portrait", false);
  photoFrame.classList.toggle("is-landscape", false);

  fullscreenButton.disabled = !hasImages;
  resetZoomButton.disabled = !hasImages || isVideo;
  playButton.disabled = !hasImages || state.isPlaying;
  stopButton.disabled = !hasImages || !state.isPlaying;
  shuffleButton.disabled = !hasImages || state.images.length < 2;
  favoriteButton.disabled = !hasImages || isVideo;
  deleteButton.disabled = !hasImages || !canDeleteMedia(activeMedia);
  addToCollectionButton.disabled = !hasImages || isVideo;
  playButton.setAttribute("aria-pressed", String(state.isPlaying));
  playButton.classList.toggle("is-active", state.isPlaying);
  shuffleButton.setAttribute("aria-pressed", String(state.shuffleEnabled));
  shuffleButton.classList.toggle("is-active", state.shuffleEnabled);
  updateFavoriteButton(activeMedia);
  previousButton.disabled = state.activeIndex <= 0;
  nextButton.disabled = !canMoveNext();

  if (!hasImages) {
    clearActiveObjectUrl();
    activeImage.removeAttribute("src");
    activeImage.alt = "";
    activeImage.style.filter = "";
    activeVideo.pause();
    activeVideo.removeAttribute("src");
    activeVideo.load();
    activePosition.textContent = "";
    resetImageAdjustments();
    return;
  }

  const image = activeMedia;
  const mediaUrl = getImageUrl(image);
  activeImage.classList.toggle("is-hidden", isVideo);
  activeVideo.classList.toggle("is-hidden", !isVideo);

  if (isVideo) {
    activeImage.removeAttribute("src");
    activeImage.alt = "";
    activeImage.style.filter = "";
    resetImageAdjustments();
    activeVideo.autoplay = true;
    activeVideo.loop = false;
    activeVideo.controls = true;
    activeVideo.preload = "auto";
    activeVideo.playsInline = true;
    activeVideo.src = mediaUrl;
    activeVideo.load();
    playActiveVideo();
  } else {
    resetImageAdjustments();
    activeVideo.pause();
    activeVideo.removeAttribute("src");
    activeVideo.load();
    activeImage.src = mediaUrl;
    activeImage.alt = image.name;
    applyImageAdjustments();
  }

  activePosition.textContent = getPositionText();
  resetFullscreenZoom();
  updateFrameOrientation();
  renderImageAdjustmentControls();

  nextButton.disabled = !canMoveNext();
}

function renderMediaStrip() {
  mediaStrip.classList.toggle("is-hidden", state.images.length === 0);

  const mediaListChanged = renderedMediaList !== state.images;
  const activeIndexChanged = mediaListChanged || renderedActiveIndex !== state.activeIndex;

  if (mediaListChanged) {
    thumbnailObserver?.disconnect();
    clearMediaThumbnailObjectUrls();
    mediaStrip.replaceChildren();
    renderedMediaList = state.images;
    const fragment = document.createDocumentFragment();
    renderedMediaItems = state.images.map((media, index) => {
      const button = document.createElement("button");
      const preview = document.createElement(media.type === "video" ? "video" : "img");
      const selector = document.createElement("input");

      button.className = "media-strip-item";
      button.type = "button";
      button.title = media.name;
      button.setAttribute("aria-label", `Abrir ${media.name}`);
      button.setAttribute("aria-pressed", String(index === state.activeIndex));
      button.classList.toggle("is-active", index === state.activeIndex);
      button.classList.toggle("is-selected-for-delete", state.gallerySelectedMedia.has(media));
      preview.alt = "";
      if (media.type === "video") {
        preview.muted = true;
        preview.playsInline = true;
        preview.preload = "metadata";
      } else {
        preview.loading = "lazy";
        preview.decoding = "async";
      }
      selector.className = "media-strip-select";
      selector.type = "checkbox";
      selector.tabIndex = -1;
      selector.checked = state.gallerySelectedMedia.has(media);
      selector.setAttribute("aria-label", `Seleccionar ${media.name} para eliminar`);
      selector.addEventListener("click", (event) => event.stopPropagation());
      selector.addEventListener("change", (event) => {
        state.gallerySelectionMode = true;
        if (event.currentTarget.checked) state.gallerySelectedMedia.add(media);
        else state.gallerySelectedMedia.delete(media);
        button.classList.toggle("is-selected-for-delete", event.currentTarget.checked);
        window.dispatchEvent(new Event("image-visor:gallery-selection-changed"));
      });
      button.append(preview, selector);
      button.addEventListener("click", (event) => {
        if (state.mediaStripExpanded) {
          if (!state.gallerySelectionMode) {
            selectImage(index);
            window.dispatchEvent(new Event("image-visor:gallery-open-image"));
            return;
          }
          if (event.detail > 1) return;
          if (state.gallerySelectedMedia.has(media)) state.gallerySelectedMedia.delete(media);
          else state.gallerySelectedMedia.add(media);
          const selector = button.querySelector(".media-strip-select");
          if (selector) selector.checked = state.gallerySelectedMedia.has(media);
          window.dispatchEvent(new Event("image-visor:gallery-selection-changed"));
          return;
        }
        if (state.gallerySelectedMedia.size > 0) return;
        selectImage(index);
      });
      fragment.append(button);
      const renderedItem = { media, button, preview, url: "" };
      thumbnailItemByElement.set(button, renderedItem);
      if (thumbnailObserver) {
        thumbnailObserver.observe(button);
      } else {
        loadMediaThumbnail(renderedItem);
      }
      return renderedItem;
    });
    mediaStrip.append(fragment);
    renderedActiveIndex = state.activeIndex;
  } else if (renderedActiveIndex !== state.activeIndex) {
    updateRenderedMediaItem(renderedActiveIndex, false);
    updateRenderedMediaItem(state.activeIndex, true);
    renderedActiveIndex = state.activeIndex;
  }

  const activeItem = renderedMediaItems[state.activeIndex];
  if (activeItem) {
    loadMediaThumbnail(activeItem);
  }

  if (activeIndexChanged) {
    const scrollBehavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    activeItem?.button.scrollIntoView({ block: "nearest", inline: "center", behavior: scrollBehavior });
  }
}

function loadMediaThumbnail(item) {
  if (item.url) {
    return;
  }

  item.url = item.media.url || URL.createObjectURL(item.media.file);
  if (!item.media.url) {
    state.mediaThumbnailObjectUrls.push(item.url);
  }
  item.preview.src = item.url;
}

function updateRenderedMediaItem(index, isActive) {
  const item = renderedMediaItems[index];
  if (!item) {
    return;
  }

  item.button.setAttribute("aria-pressed", String(isActive));
  item.button.classList.toggle("is-active", isActive);
}

export function updateFavoriteButton(media = state.images[state.activeIndex]) {
  const activeIsFavorite = Boolean(media && media.type !== "video" && isFavorite(media));
  const favoriteIcon = favoriteButton.querySelector("i");
  favoriteButton.setAttribute("aria-pressed", String(activeIsFavorite));
  favoriteButton.setAttribute("aria-label", activeIsFavorite ? "Quitar de favoritos" : "Agregar a favoritos");
  favoriteButton.title = activeIsFavorite ? "Quitar de favoritos" : "Agregar a favoritos";
  favoriteIcon.classList.toggle("iconoir-star-solid", activeIsFavorite);
  favoriteIcon.classList.toggle("iconoir-star", !activeIsFavorite);
}

function getImageUrl(image) {
  clearActiveObjectUrl();

  if (image.url) {
    return image.url;
  }

  state.currentObjectUrl = URL.createObjectURL(image.file);
  return state.currentObjectUrl;
}

function getPositionText() {
  return `${state.activeIndex + 1}/${state.images.length}`;
}

export async function selectImage(index) {
  if (index < 0 || index >= state.images.length) {
    return;
  }

  state.activeIndex = index;
  setZoom(100);
  await renderActiveImage();
}

export function showPrevious() {
  selectImage(state.activeIndex - 1);
}

export function showNext() {
  selectImage(getNextIndex());
}

export async function playActiveVideo() {
  if (!isActiveVideo()) {
    return;
  }

  try {
    activeVideo.muted = false;
    await activeVideo.play();
  } catch (error) {
    try {
      activeVideo.muted = true;
      await activeVideo.play();
    } catch (mutedError) {
      // Autoplay blocked
    }
  }
}

export async function handleVideoEnded() {
  if (!isActiveVideo()) {
    return;
  }

  if (canMoveNext()) {
    await selectImage(getNextIndex());
    return;
  }

  activeVideo.currentTime = 0;
  await playActiveVideo();
}

function canMoveNext() {
  return state.activeIndex < state.images.length - 1;
}

function getNextIndex() {
  if (!state.shuffleEnabled || state.images.length < 2) {
    if (!canMoveNext() && state.images.length > 0) {
      return 0;
    }

    return state.activeIndex + 1;
  }

  let nextIndex = state.activeIndex;
  while (nextIndex === state.activeIndex) {
    nextIndex = Math.floor(Math.random() * state.images.length);
  }

  return nextIndex;
}

export async function startSlideshow() {
  if (!state.images.length) {
    return;
  }

  stopSlideshow();
  state.isPlaying = true;
  playButton.setAttribute("aria-pressed", "true");
  playButton.classList.add("is-active");
  state.slideshowTimer = window.setInterval(playNextSlide, SLIDESHOW_INTERVAL_MS);
  await renderActiveImage();
}

export function stopSlideshow() {
  if (state.slideshowTimer) {
    window.clearInterval(state.slideshowTimer);
    state.slideshowTimer = 0;
  }

  state.isPlaying = false;
}

export async function stopSlideshowAndRender() {
  stopSlideshow();
  await renderActiveImage();
}

async function playNextSlide() {
  if (!state.images.length) {
    stopSlideshow();
    await renderActiveImage();
    return;
  }

  if (isActiveVideo() && !activeVideo.ended) {
    return;
  }

  await selectImage(getNextIndex());
}

export async function toggleShuffle() {
  state.shuffleEnabled = !state.shuffleEnabled;
  await renderActiveImage();
}

export async function toggleFullscreen() {
  if (!state.images.length) {
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

export async function handleImageDoubleClick(event) {
  event.preventDefault();
  event.stopPropagation();

  if (!state.images.length || isActiveVideo()) {
    return;
  }

  if (document.fullscreenElement) {
    if (state.fullscreenZoom.active) {
      resetFullscreenZoom();
      return;
    }

    await toggleFullscreen();
    return;
  }

  if (state.zoom !== 100) {
    setZoom(100);
    return;
  }

  await toggleFullscreen();
}

async function enterFullscreenMode() {
  if (document.fullscreenElement) {
    return;
  }

  try {
    await document.documentElement.requestFullscreen();
  } catch (error) {}
}

export async function exitFullscreenMode() {
  if (document.fullscreenElement) {
    await document.exitFullscreen();
  }
}

export function updateFullscreenButton() {
  const fullscreenIcon = fullscreenButton.querySelector("i");
  const isFullscreen = Boolean(document.fullscreenElement);

  fullscreenButton.setAttribute(
    "aria-label",
    isFullscreen ? "Salir de pantalla completa" : "Pantalla completa",
  );

  fullscreenIcon.classList.toggle("iconoir-expand", !isFullscreen);
  fullscreenIcon.classList.toggle("iconoir-compress", isFullscreen);

  if (!isFullscreen) {
    resetFullscreenZoom();
    clearFullscreenSelection();
  }
}

export function updateFrameOrientation() {
  if (!state.images.length) {
    return;
  }

  const dimensions = getActiveMediaDimensions();
  if (!dimensions.width || !dimensions.height) {
    return;
  }

  const isPortrait = dimensions.height > dimensions.width;
  const imageRatioValue = dimensions.width / dimensions.height;
  photoFrame.style.setProperty("--image-ratio", `${dimensions.width} / ${dimensions.height}`);
  photoFrame.style.setProperty("--image-ratio-value", String(imageRatioValue));
  photoFrame.style.setProperty("--image-inverse-aspect", String(dimensions.height / dimensions.width));
  photoFrame.classList.toggle("is-portrait", isPortrait);
  photoFrame.classList.toggle("is-landscape", !isPortrait);
}

export function getActiveMediaDimensions() {
  if (isActiveVideo()) {
    return {
      width: activeVideo.videoWidth,
      height: activeVideo.videoHeight,
    };
  }

  return {
    width: activeImage.naturalWidth,
    height: activeImage.naturalHeight,
  };
}

export function isActiveVideo() {
  return state.images[state.activeIndex]?.type === "video";
}
