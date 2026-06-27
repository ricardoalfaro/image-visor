import { FAVORITES_FOLDER_PATH, SLIDESHOW_INTERVAL_MS } from "./constants.js";
import { state, clearActiveObjectUrl, clearFolderThumbnailObjectUrls } from "./state.js";
import {
  folderNav,
  placeholderImage,
  imageViewport,
  stage,
  photoFrame,
  fullscreenButton,
  zoomOutButton,
  zoomInButton,
  resetZoomButton,
  playButton,
  stopButton,
  shuffleButton,
  favoriteButton,
  previousButton,
  nextButton,
  activeImage,
  activeVideo,
  activePosition,
} from "./dom.js";
import { setZoom, resetFullscreenZoom, clearFullscreenSelection } from "./zoom-pan.js";
import { getFavoriteKey, isFavorite } from "./favorites.js";
import { getPhotoIdFromMediaItem } from "./develop/index.js";
import { RENDER_RESULT_TYPES, renderMedia } from "./rendering/index.js";

export function applyFolderFilter(options = {}) {
  const previousItem = options.keepIndex ? state.images[state.activeIndex] : null;
  if (state.activeFolderPath === FAVORITES_FOLDER_PATH) {
    state.images = getAvailableFavorites();
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

function renderFolderNav() {
  const favoriteCount = getAvailableFavorites().length;
  const hasFolders = state.folders.length > 0 || favoriteCount > 0;
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
  }
  button.addEventListener("click", () => selectFolder(path));
  return button;
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

  if (!preview) {
    return "";
  }

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

  renderFolderNav();
  placeholderImage.classList.toggle("is-hidden", hasImages);
  imageViewport.classList.toggle("is-hidden", !hasImages);
  imageViewport.classList.toggle("has-video", Boolean(isVideo));
  stage.classList.toggle("is-hidden", !hasImages);
  stage.classList.toggle("has-images", hasImages);
  document.body.classList.toggle("has-loaded-images", hasImages);
  photoFrame.classList.toggle("is-portrait", false);
  photoFrame.classList.toggle("is-landscape", false);

  fullscreenButton.disabled = !hasImages;
  zoomOutButton.disabled = !hasImages || isVideo;
  zoomInButton.disabled = !hasImages || isVideo;
  resetZoomButton.disabled = !hasImages || isVideo;
  playButton.disabled = !hasImages || state.isPlaying;
  stopButton.disabled = !hasImages || !state.isPlaying;
  shuffleButton.disabled = !hasImages || state.images.length < 2;
  favoriteButton.disabled = !hasImages || isVideo;
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
    activeVideo.pause();
    activeVideo.removeAttribute("src");
    activeVideo.load();
    activePosition.textContent = "";
    return;
  }

  const image = activeMedia;
  activeImage.classList.toggle("is-hidden", isVideo);
  activeVideo.classList.toggle("is-hidden", !isVideo);

  if (isVideo) {
    const mediaUrl = getImageUrl(image);
    activeImage.removeAttribute("src");
    activeImage.alt = "";
    activeVideo.autoplay = true;
    activeVideo.loop = false;
    activeVideo.src = mediaUrl;
    activeVideo.load();
    playActiveVideo();
  } else {
    activeVideo.pause();
    activeVideo.removeAttribute("src");
    activeVideo.load();
    const mediaUrl = await getRenderedImageUrl(image);
    activeImage.src = mediaUrl;
    activeImage.alt = image.name;
  }

  activePosition.textContent = getPositionText();
  resetFullscreenZoom();
  updateFrameOrientation();

  nextButton.disabled = !canMoveNext();
}

export function updateFavoriteButton(media = state.images[state.activeIndex]) {
  const activeIsFavorite = Boolean(media && media.type !== "video" && isFavorite(media));
  const favoriteIcon = favoriteButton.querySelector("i");
  favoriteButton.setAttribute("aria-pressed", String(activeIsFavorite));
  favoriteButton.setAttribute("aria-label", activeIsFavorite ? "Quitar de favoritos" : "Agregar a favoritos");
  favoriteButton.title = activeIsFavorite ? "Quitar de favoritos" : "Agregar a favoritos";
  favoriteIcon.classList.toggle("fa-solid", activeIsFavorite);
  favoriteIcon.classList.toggle("fa-regular", !activeIsFavorite);
}

function getImageUrl(image) {
  clearActiveObjectUrl();

  if (image.url) {
    return image.url;
  }

  state.currentObjectUrl = URL.createObjectURL(image.file);
  return state.currentObjectUrl;
}

async function getRenderedImageUrl(image) {
  const photo = getPhotoForMediaItem(image);
  const renderResult = await renderMedia({ photo, media: image });

  if (renderResult.type === RENDER_RESULT_TYPES.SOURCE_URL || renderResult.type === RENDER_RESULT_TYPES.OBJECT_URL) {
    clearActiveObjectUrl();
    return renderResult.value;
  }

  if (renderResult.type === RENDER_RESULT_TYPES.SOURCE_FILE && renderResult.value) {
    clearActiveObjectUrl();
    state.currentObjectUrl = URL.createObjectURL(renderResult.value);
    return state.currentObjectUrl;
  }

  return getImageUrl(image);
}

function getPhotoForMediaItem(mediaItem) {
  const photoId = getPhotoIdFromMediaItem(mediaItem);
  return state.photos.find((photo) => photo.id === photoId) || null;
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
    resetFullscreenZoom();
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

  fullscreenIcon.classList.toggle("fa-expand", !isFullscreen);
  fullscreenIcon.classList.toggle("fa-compress", isFullscreen);

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
