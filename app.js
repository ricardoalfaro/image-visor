const IMAGE_TYPES = new Set([
  "image/avif",
  "image/bmp",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/svg+xml",
  "image/webp",
]);
const VIDEO_TYPES = new Set([
  "video/mp4",
  "video/mpeg",
  "video/quicktime",
  "video/x-m4v",
]);
const IMAGE_EXTENSION_PATTERN = /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i;
const VIDEO_EXTENSION_PATTERN = /\.(m4v|mov|mp4|mpe?g)$/i;

const SLIDESHOW_INTERVAL_MS = 4000;
const BROWSER_PICKER_WARNING = "El navegador mostrara su selector de carpeta por seguridad.";
const LOCAL_FOLDER_PICKER_ENDPOINT = "/api/choose-folder";
const THEME_SEQUENCE = ["auto", "light", "dark"];
const RECENT_FOLDERS_KEY = "imageVisorRecentFolders";
const RECENT_FOLDERS_LIMIT = 10;
const RECENT_DB_NAME = "imageVisorFolderHandles";
const RECENT_DB_STORE = "handles";
const RECENT_BROWSER_FILES_STORE = "browserFolders";
const NOTICE_AUTO_HIDE_MS = 10000;

const folderInput = document.querySelector("#folderInput");
const appNotice = document.querySelector("#appNotice");
const appNoticeIcon = document.querySelector("#appNoticeIcon");
const appNoticeText = document.querySelector("#appNoticeText");
const stage = document.querySelector("#stage");
const photoFrame = document.querySelector("#photoFrame");
const placeholderImage = document.querySelector("#placeholderImage");
const imageViewport = document.querySelector("#imageViewport");
const activeImage = document.querySelector("#activeImage");
const activeVideo = document.querySelector("#activeVideo");
const activePosition = document.querySelector("#activePosition");
const zoomSelection = document.querySelector("#zoomSelection");
const folderNav = document.querySelector("#folderNav");
const previousButton = document.querySelector("#previousButton");
const nextButton = document.querySelector("#nextButton");
const serverButton = document.querySelector("#serverButton");
const fullscreenButton = document.querySelector("#fullscreenButton");
const controls = document.querySelector(".controls");
const playButton = document.querySelector("#playButton");
const stopButton = document.querySelector("#stopButton");
const shuffleButton = document.querySelector("#shuffleButton");
const zoomOutButton = document.querySelector("#zoomOutButton");
const zoomInButton = document.querySelector("#zoomInButton");
const resetZoomButton = document.querySelector("#resetZoomButton");
const themeToggleButton = document.querySelector("#themeToggleButton");
const closeViewerButton = document.querySelector("#closeViewerButton");
const menuButton = document.querySelector("#menuButton");
const closeSidebarButton = document.querySelector("#closeSidebarButton");
const recentSidebar = document.querySelector("#recentSidebar");
const sidebarScrim = document.querySelector("#sidebarScrim");
const recentFoldersList = document.querySelector("#recentFoldersList");
const emptyRecentFolders = document.querySelector("#emptyRecentFolders");
const clearRecentFoldersButton = document.querySelector("#clearRecentFoldersButton");

let images = [];
let allMedia = [];
let folders = [];
let activeFolderPath = "";
let activeIndex = -1;
let zoom = 100;
let sourceLabel = "Carpeta local";
let currentObjectUrl = "";
let folderThumbnailObjectUrls = [];
let isPlaying = false;
let shuffleEnabled = false;
let slideshowTimer = 0;
let panX = 0;
let panY = 0;
let dragState = null;
let fullscreenPan = null;
let fullscreenSelection = null;
let fullscreenZoom = {
  active: false,
  scale: 1,
  x: 0,
  y: 0,
};
let recentFolders = [];
let recentDbPromise = null;
let recentFolderFiles = new Map();
let noticeTimer = 0;

folderInput.addEventListener("click", handleBrowserFolderIntent);
folderInput.addEventListener("change", handleFolderSelection);
serverButton.addEventListener("click", loadLocalFolder);
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

document.addEventListener("fullscreenchange", updateFullscreenButton);
document.addEventListener("click", handleViewerOutsideClick);
document.addEventListener("keydown", handleKeyboard);
setThemePreference("auto", { persist: false });
loadRecentFolders();
renderRecentFolders();

async function handleBrowserFolderIntent() {
  showNotice(BROWSER_PICKER_WARNING, "warning");
}

async function handleFolderSelection(event) {
  const selectedFiles = Array.from(event.target.files || []);
  const files = selectedFiles.map((file) => ({
    file,
    path: getLocalRelativePath(file),
  }));
  const folderName = getBrowserSelectedFolderName(selectedFiles) || "Carpeta local";
  const recentFolderId = `browser:${folderName}`;
  await loadLocalFiles(files, folderName);
  recentFolderFiles.set(recentFolderId, { files, name: folderName });
  const isPersisted = await storeBrowserFolderFiles(recentFolderId, files, folderName);
  await rememberRecentFolder({
    id: recentFolderId,
    name: folderName,
    canReopen: isPersisted,
    source: "browser",
  });

  if (!isPersisted) {
    showNotice("La carpeta quedo disponible solo hasta que refresques la pagina.", "warning");
  }

  folderInput.value = "";
}

async function loadLocalFolder() {
  hideNotice();
  serverButton.disabled = true;

  try {
    if (isLocalServerHost() && await loadFolderFromLocalServer()) {
      return;
    }

    if ("showDirectoryPicker" in window) {
      await loadFolderFromDirectoryPicker();
      return;
    }

    if (isLocalServerHost()) {
      showNotice("No se pudo abrir el selector local. Reinicia el server y vuelve a intentar.", "warning");
      return;
    }

    showNotice(BROWSER_PICKER_WARNING, "warning");
    folderInput.click();
  } finally {
    serverButton.disabled = false;
  }
}

function isLocalServerHost() {
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

async function loadFolderFromLocalServer() {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 120000);

  try {
    showNotice("Abriendo selector de carpeta del sistema...", "warning");
    const response = await fetch(LOCAL_FOLDER_PICKER_ENDPOINT, { signal: controller.signal });

    if (!response.ok) {
      return false;
    }

    const folder = await response.json();

    if (folder.cancelled) {
      return true;
    }

    await loadServerFolder(folder);
    hideNotice();
    return true;
  } catch (error) {
    return false;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function loadFolderFromDirectoryPicker() {
  if (!("showDirectoryPicker" in window)) {
    return false;
  }

  try {
    const directoryHandle = await window.showDirectoryPicker({ mode: "read" });
    const files = await collectDirectoryFiles(directoryHandle);
    const recentFolderId = await getRecentDirectoryFolderId(directoryHandle);
    await loadLocalFiles(files, directoryHandle.name || "Carpeta local");
    await rememberRecentFolder({
      id: recentFolderId,
      name: directoryHandle.name || "Carpeta local",
      canReopen: true,
      source: "handle",
      handle: directoryHandle,
    });
    return true;
  } catch (error) {
    if (error.name !== "AbortError") {
      showNotice("No se pudo abrir la carpeta local desde el navegador.", "warning");
    }

    return true;
  }
}

async function openRecentFolder(folderId) {
  const recentFolder = recentFolders.find((folder) => folder.id === folderId);

  if (!recentFolder) {
    return;
  }

  if (recentFolderFiles.has(recentFolder.id)) {
    const cachedFolder = recentFolderFiles.get(recentFolder.id);
    closeSidebar();
    hideNotice();
    await loadLocalFiles(cachedFolder.files, cachedFolder.name || recentFolder.name);
    await rememberRecentFolder(recentFolder);
    return;
  }

  if (recentFolder.source === "browser" && recentFolder.canReopen) {
    const storedFolder = await getStoredBrowserFolderFiles(recentFolder.id);

    if (storedFolder?.files?.length) {
      closeSidebar();
      hideNotice();
      recentFolderFiles.set(recentFolder.id, storedFolder);
      await loadLocalFiles(storedFolder.files, storedFolder.name || recentFolder.name);
      await rememberRecentFolder(recentFolder);
      return;
    }

    await markRecentFolderNotReopenable(recentFolder.id);
  }

  if (recentFolder.source === "server" && recentFolder.path) {
    closeSidebar();
    hideNotice();

    try {
      await loadServerFolderByPath(recentFolder.path);
    } catch (error) {
      showNotice("No se pudo abrir esa carpeta reciente. Puede que se haya movido o eliminado.", "error");
    }

    return;
  }

  if (!recentFolder.canReopen) {
    showNotice("Esta carpeta no pudo conservarse despues del refresh. Elige la carpeta nuevamente para actualizarla.", "warning");
    closeSidebar();
    return;
  }

  try {
    const directoryHandle = await getStoredDirectoryHandle(folderId);

    if (!directoryHandle) {
      removeRecentFolder(folderId);
      showNotice("Ya no se encontro el permiso de esa carpeta. Elige la carpeta nuevamente.", "warning");
      return;
    }

    const hasPermission = await ensureDirectoryPermission(directoryHandle);

    if (!hasPermission) {
      showNotice("No se pudo obtener permiso para abrir esa carpeta.", "warning");
      return;
    }

    closeSidebar();
    hideNotice();
    const files = await collectDirectoryFiles(directoryHandle);
    await loadLocalFiles(files, directoryHandle.name || recentFolder.name);
    await rememberRecentFolder({
      ...recentFolder,
      name: directoryHandle.name || recentFolder.name,
      canReopen: true,
      source: "handle",
      handle: directoryHandle,
    });
  } catch (error) {
    showNotice("No se pudo abrir la carpeta reciente.", "error");
  }
}

async function loadServerFolderByPath(folderPath) {
  const response = await fetch(`/api/folder?path=${encodeURIComponent(folderPath)}`);

  if (!response.ok) {
    throw new Error("Could not load folder");
  }

  await loadServerFolder(await response.json());
}

async function loadServerFolder(folder) {
  const media = (folder.files || []).map((item) => ({
    name: item.name,
    path: item.path,
    type: item.type,
    url: item.url,
    folder: getFolderPath(item.path),
    groupFolder: getTopLevelFolder(item.path),
  }));

  await loadMediaItems(media, folder.name || "Carpeta local");
  await rememberRecentFolder({
    id: `server:${folder.path}`,
    name: folder.name || "Carpeta local",
    path: folder.path,
    canReopen: true,
    source: "server",
  });
}

async function collectDirectoryFiles(directoryHandle, parentPath = "") {
  const files = [];

  for await (const [name, handle] of directoryHandle.entries()) {
    if (name.startsWith(".")) {
      continue;
    }

    const path = parentPath ? `${parentPath}/${name}` : name;

    if (handle.kind === "directory") {
      files.push(...await collectDirectoryFiles(handle, path));
      continue;
    }

    if (handle.kind !== "file") {
      continue;
    }

    files.push({
      file: await handle.getFile(),
      path,
    });
  }

  return files;
}

async function loadLocalFiles(files, label) {
  const media = files
    .filter((item) => isSupportedMedia(item.file))
    .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }))
    .map((item) => {
      return {
        file: item.file,
        name: item.file.name,
        path: item.path,
        type: getMediaType(item.file),
        folder: getFolderPath(item.path),
        groupFolder: getTopLevelFolder(item.path),
      };
    });

  await loadMediaItems(media, label);
}

async function loadMediaItems(media, label) {
  clearActiveObjectUrl();
  clearFolderThumbnailObjectUrls();
  sourceLabel = label || "Carpeta local";
  stopSlideshow();

  allMedia = media;
  folders = getFoldersFromMedia(allMedia);
  activeFolderPath = "";
  applyFolderFilter();

  activeIndex = images.length > 0 ? 0 : -1;
  setZoom(100);
  resetFullscreenZoom();
  await renderActiveImage();
}

async function closeViewer() {
  stopSlideshow();
  clearActiveObjectUrl();
  clearFolderThumbnailObjectUrls();
  resetFullscreenZoom();
  sourceLabel = "Carpeta local";
  images = [];
  allMedia = [];
  folders = [];
  activeFolderPath = "";
  activeIndex = -1;
  folderInput.value = "";
  setZoom(100);
  await renderActiveImage();
}

function isSupportedMedia(file) {
  if (IMAGE_TYPES.has(file.type)) {
    return true;
  }

  if (VIDEO_TYPES.has(file.type)) {
    return true;
  }

  return IMAGE_EXTENSION_PATTERN.test(file.name) || VIDEO_EXTENSION_PATTERN.test(file.name);
}

function getMediaType(file) {
  if (VIDEO_TYPES.has(file.type) || VIDEO_EXTENSION_PATTERN.test(file.name)) {
    return "video";
  }

  return "image";
}

function getDisplayPath(file) {
  return file.webkitRelativePath || file.name;
}

function getLocalRelativePath(file) {
  const displayPath = getDisplayPath(file);
  const normalizedPath = displayPath.replace(/\\/g, "/");
  const firstSlashIndex = normalizedPath.indexOf("/");

  if (!file.webkitRelativePath || firstSlashIndex === -1) {
    return normalizedPath;
  }

  return normalizedPath.slice(firstSlashIndex + 1);
}

function getFolderPath(filePath) {
  const normalizedPath = filePath.replace(/\\/g, "/");
  const lastSlashIndex = normalizedPath.lastIndexOf("/");
  return lastSlashIndex === -1 ? "" : normalizedPath.slice(0, lastSlashIndex);
}

function getTopLevelFolder(filePath) {
  const normalizedPath = filePath.replace(/\\/g, "/");
  const firstSlashIndex = normalizedPath.indexOf("/");
  return firstSlashIndex === -1 ? "" : normalizedPath.slice(0, firstSlashIndex);
}

function getFoldersFromMedia(media) {
  const counts = new Map();

  for (const item of media) {
    if (!item.groupFolder) {
      continue;
    }

    counts.set(item.groupFolder, (counts.get(item.groupFolder) || 0) + 1);
  }

  return Array.from(counts, ([path, count]) => ({ path, count }))
    .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
}

function applyFolderFilter(options = {}) {
  const previousItem = options.keepIndex ? images[activeIndex] : null;
  images = activeFolderPath ? allMedia.filter((item) => isInsideFolder(item, activeFolderPath)) : [...allMedia];

  if (previousItem) {
    const nextIndex = images.findIndex((item) => item.path === previousItem.path);
    activeIndex = nextIndex >= 0 ? nextIndex : Math.min(activeIndex, images.length - 1);
  }

  renderFolderNav();
}

function isInsideFolder(item, folderPath) {
  return item.groupFolder === folderPath;
}

async function selectFolder(path) {
  activeFolderPath = path;
  applyFolderFilter();
  activeIndex = images.length > 0 ? 0 : -1;
  stopSlideshow();
  setZoom(100);
  resetFullscreenZoom();
  await renderActiveImage();
}

function renderFolderNav() {
  const hasFolders = folders.length > 0;
  clearFolderThumbnailObjectUrls();
  folderNav.classList.toggle("is-hidden", !hasFolders);
  folderNav.innerHTML = "";

  if (!hasFolders) {
    return;
  }

  const allButton = createFolderButton({
    title: "Ver todo el contenido",
    isActive: activeFolderPath === "",
    path: "",
    thumbnailUrl: getFolderPreviewUrl(""),
  });
  folderNav.append(allButton);

  folders.forEach((folder, index) => {
    folderNav.append(createFolderButton({
      title: `${folder.path} (${folder.count})`,
      isActive: activeFolderPath === folder.path,
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
  const preview = allMedia.find((item) => {
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
  folderThumbnailObjectUrls.push(objectUrl);
  return objectUrl;
}

function clearFolderThumbnailObjectUrls() {
  for (const objectUrl of folderThumbnailObjectUrls) {
    URL.revokeObjectURL(objectUrl);
  }

  folderThumbnailObjectUrls = [];
}

async function renderActiveImage() {
  const hasImages = images.length > 0;
  const activeMedia = hasImages ? images[activeIndex] : null;
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
    activeVideo.pause();
    activeVideo.removeAttribute("src");
    activeVideo.load();
    activePosition.textContent = "";
    return;
  }

  const image = activeMedia;
  const mediaUrl = getImageUrl(image);
  activeImage.classList.toggle("is-hidden", isVideo);
  activeVideo.classList.toggle("is-hidden", !isVideo);

  if (isVideo) {
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
    activeImage.src = mediaUrl;
    activeImage.alt = image.name;
  }

  activePosition.textContent = getPositionText();
  resetFullscreenZoom();
  updateFrameOrientation();

  nextButton.disabled = !canMoveNext();
}

function getImageUrl(image) {
  clearActiveObjectUrl();

  if (image.url) {
    return image.url;
  }

  currentObjectUrl = URL.createObjectURL(image.file);
  return currentObjectUrl;
}

function getPositionText() {
  return `${activeIndex + 1}/${images.length}`;
}

async function selectImage(index) {
  if (index < 0) {
    return;
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

async function playActiveVideo() {
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
      // Autoplay can still be blocked by the browser.
    }
  }
}

async function handleVideoEnded() {
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
  return activeIndex < images.length - 1;
}

function getNextIndex() {
  if (!shuffleEnabled || images.length < 2) {
    if (!canMoveNext() && images.length > 0) {
      return 0;
    }

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

  await selectImage(getNextIndex());
}

async function toggleShuffle() {
  shuffleEnabled = !shuffleEnabled;
  await renderActiveImage();
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

async function handleImageDoubleClick(event) {
  event.preventDefault();
  event.stopPropagation();

  if (!images.length || isActiveVideo()) {
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

function showNotice(message, type = "info") {
  const noticeType = ["info", "warning", "error"].includes(type) ? type : "info";
  const icons = {
    info: "fa-circle-info",
    warning: "fa-triangle-exclamation",
    error: "fa-circle-exclamation",
  };

  window.clearTimeout(noticeTimer);
  noticeTimer = 0;
  appNotice.classList.remove("notice-info", "notice-warning", "notice-error");
  appNotice.classList.add("is-visible", `notice-${noticeType}`);
  appNotice.setAttribute("aria-hidden", "false");
  appNotice.setAttribute("role", noticeType === "error" ? "alert" : "status");
  appNoticeText.textContent = message;
  appNoticeIcon.className = `fa-solid ${icons[noticeType]}`;

  if (noticeType !== "error") {
    noticeTimer = window.setTimeout(hideNotice, NOTICE_AUTO_HIDE_MS);
  }
}

function hideNotice() {
  window.clearTimeout(noticeTimer);
  noticeTimer = 0;
  appNotice.classList.remove("is-visible");
  appNotice.setAttribute("aria-hidden", "true");
}

function openSidebar() {
  document.body.classList.add("has-open-sidebar");
  recentSidebar.setAttribute("aria-hidden", "false");
  menuButton.setAttribute("aria-expanded", "true");
  sidebarScrim.hidden = false;
}

function closeSidebar() {
  document.body.classList.remove("has-open-sidebar");
  recentSidebar.setAttribute("aria-hidden", "true");
  menuButton.setAttribute("aria-expanded", "false");
  sidebarScrim.hidden = true;
}

function loadRecentFolders() {
  try {
    const storedFolders = JSON.parse(localStorage.getItem(RECENT_FOLDERS_KEY) || "[]");
    recentFolders = Array.isArray(storedFolders)
      ? storedFolders.filter(isValidRecentFolder).filter(isPersistentRecentFolder).slice(0, RECENT_FOLDERS_LIMIT)
      : [];
    saveRecentFolders();
  } catch (error) {
    recentFolders = [];
  }
}

function isValidRecentFolder(folder) {
  return Boolean(folder && typeof folder.id === "string" && typeof folder.name === "string");
}

function isPersistentRecentFolder(folder) {
  return folder.canReopen || folder.source === "server" || folder.source === "handle";
}

async function rememberRecentFolder(folder) {
  if (!folder?.id || !folder?.name) {
    return;
  }

  const nextFolder = {
    id: folder.id,
    name: folder.name,
    canReopen: Boolean(folder.canReopen),
    path: folder.path || "",
    source: folder.source || "browser",
    visitedAt: Date.now(),
  };
  recentFolders = [
    nextFolder,
    ...recentFolders.filter((recentFolder) => recentFolder.id !== nextFolder.id),
  ].slice(0, RECENT_FOLDERS_LIMIT);
  saveRecentFolders();
  renderRecentFolders();

  if (folder.handle) {
    await storeDirectoryHandle(nextFolder.id, folder.handle);
  }
}

async function removeRecentFolder(folderId) {
  recentFolders = recentFolders.filter((folder) => folder.id !== folderId);
  recentFolderFiles.delete(folderId);
  saveRecentFolders();
  await removeStoredBrowserFolder(folderId);
  renderRecentFolders();
}

async function markRecentFolderNotReopenable(folderId) {
  const recentFolder = recentFolders.find((folder) => folder.id === folderId);

  if (!recentFolder) {
    return;
  }

  recentFolder.canReopen = false;
  saveRecentFolders();
  renderRecentFolders();
}

async function clearRecentFolders() {
  recentFolders = [];
  recentFolderFiles = new Map();
  localStorage.removeItem(RECENT_FOLDERS_KEY);
  await clearStoredBrowserFolders();
  renderRecentFolders();
}

function saveRecentFolders() {
  localStorage.setItem(RECENT_FOLDERS_KEY, JSON.stringify(recentFolders));
}

function renderRecentFolders() {
  recentFoldersList.innerHTML = "";
  emptyRecentFolders.classList.toggle("is-hidden", recentFolders.length > 0);
  clearRecentFoldersButton.classList.toggle("is-hidden", recentFolders.length === 0);

  recentFolders.forEach((folder) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    const removeButton = document.createElement("button");
    const icon = document.createElement("i");
    const removeIcon = document.createElement("i");
    const label = document.createElement("span");
    const meta = document.createElement("span");

    item.className = "recent-folder-item";
    button.className = "recent-folder-button";
    button.type = "button";
    button.title = folder.name;
    icon.className = "fa-solid fa-folder";
    icon.setAttribute("aria-hidden", "true");
    label.className = "recent-folder-name";
    label.textContent = folder.name;
    meta.className = "recent-folder-meta";
    meta.textContent = getRecentFolderMeta(folder);
    removeButton.className = "remove-recent-button";
    removeButton.type = "button";
    removeButton.title = `Quitar ${folder.name}`;
    removeButton.setAttribute("aria-label", `Quitar ${folder.name} de recientes`);
    removeIcon.className = "fa-solid fa-xmark";
    removeIcon.setAttribute("aria-hidden", "true");

    button.append(icon, label, meta);
    button.addEventListener("click", () => openRecentFolder(folder.id));
    removeButton.append(removeIcon);
    removeButton.addEventListener("click", () => removeRecentFolder(folder.id));
    item.append(button, removeButton);
    recentFoldersList.append(item);
  });
}

function getRecentFolderMeta(folder) {
  if (recentFolderFiles.has(folder.id)) {
    return "Abrir en esta sesión";
  }

  if (folder.source === "browser" && folder.canReopen) {
    return "Abrir copia guardada";
  }

  if (folder.source === "server") {
    return "Abrir carpeta";
  }

  if (folder.source === "handle") {
    return "Abrir con permiso";
  }

  return "Requiere elegir de nuevo";
}

function getBrowserSelectedFolderName(files) {
  const firstPath = files[0]?.webkitRelativePath || "";
  const normalizedPath = firstPath.replace(/\\/g, "/");
  const firstSlashIndex = normalizedPath.indexOf("/");

  if (firstSlashIndex <= 0) {
    return "";
  }

  return normalizedPath.slice(0, firstSlashIndex);
}

async function getRecentDirectoryFolderId(directoryHandle) {
  if (directoryHandle.isSameEntry) {
    for (const recentFolder of recentFolders) {
      if (!recentFolder.canReopen) {
        continue;
      }

      const storedHandle = await getStoredDirectoryHandle(recentFolder.id);

      if (storedHandle && await directoryHandle.isSameEntry(storedHandle)) {
        return recentFolder.id;
      }
    }
  }

  return `fs:${directoryHandle.name || "Carpeta local"}:${createRecentFolderToken()}`;
}

function createRecentFolderToken() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function ensureDirectoryPermission(directoryHandle) {
  if (!directoryHandle.queryPermission || !directoryHandle.requestPermission) {
    return true;
  }

  const permission = await directoryHandle.queryPermission({ mode: "read" });

  if (permission === "granted") {
    return true;
  }

  return await directoryHandle.requestPermission({ mode: "read" }) === "granted";
}

async function openRecentDatabase() {
  if (!("indexedDB" in window)) {
    return null;
  }

  if (!recentDbPromise) {
    recentDbPromise = new Promise((resolve) => {
      const request = indexedDB.open(RECENT_DB_NAME, 2);

      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(RECENT_DB_STORE)) {
          request.result.createObjectStore(RECENT_DB_STORE);
        }

        if (!request.result.objectStoreNames.contains(RECENT_BROWSER_FILES_STORE)) {
          request.result.createObjectStore(RECENT_BROWSER_FILES_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    });
  }

  return recentDbPromise;
}

async function storeDirectoryHandle(folderId, directoryHandle) {
  const db = await openRecentDatabase();

  if (!db) {
    return;
  }

  await runStoreRequest(db, RECENT_DB_STORE, "readwrite", (store) => store.put(directoryHandle, folderId));
}

async function getStoredDirectoryHandle(folderId) {
  const db = await openRecentDatabase();

  if (!db) {
    return null;
  }

  return await runStoreRequest(db, RECENT_DB_STORE, "readonly", (store) => store.get(folderId));
}

async function storeBrowserFolderFiles(folderId, files, name) {
  const db = await openRecentDatabase();

  if (!db) {
    return false;
  }

  const payload = {
    name,
    files,
    storedAt: Date.now(),
  };
  const result = await runStoreRequest(
    db,
    RECENT_BROWSER_FILES_STORE,
    "readwrite",
    (store) => store.put(payload, folderId),
  );

  return result !== null;
}

async function getStoredBrowserFolderFiles(folderId) {
  const db = await openRecentDatabase();

  if (!db) {
    return null;
  }

  return await runStoreRequest(db, RECENT_BROWSER_FILES_STORE, "readonly", (store) => store.get(folderId));
}

async function clearStoredBrowserFolders() {
  const db = await openRecentDatabase();

  if (!db) {
    return;
  }

  await runStoreRequest(db, RECENT_BROWSER_FILES_STORE, "readwrite", (store) => store.clear());
}

async function removeStoredBrowserFolder(folderId) {
  const db = await openRecentDatabase();

  if (!db) {
    return;
  }

  await runStoreRequest(db, RECENT_BROWSER_FILES_STORE, "readwrite", (store) => store.delete(folderId));
}

function runStoreRequest(db, storeName, mode, createRequest) {
  return new Promise((resolve) => {
    try {
      const transaction = db.transaction(storeName, mode);
      const request = createRequest(transaction.objectStore(storeName));

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      transaction.onerror = () => resolve(null);
      transaction.onabort = () => resolve(null);
    } catch (error) {
      resolve(null);
    }
  });
}

function applyImageTransform() {
  if (!activeImage) {
    return;
  }

  if (isActiveVideo()) {
    imageViewport.classList.remove("is-pannable", "is-fullscreen-zoomed");
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
  if (!images.length) {
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

function getActiveMediaDimensions() {
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

function isActiveVideo() {
  return images[activeIndex]?.type === "video";
}

function startImageDrag(event) {
  if (!images.length || isActiveVideo() || event.button !== 0) {
    return;
  }

  if (document.fullscreenElement) {
    if (fullscreenZoom.active) {
      startFullscreenPan(event);
      return;
    }

    startFullscreenSelection(event);
    return;
  }

  if (zoom <= 100) {
    startFullscreenSelection(event);
    return;
  }

  if (document.fullscreenElement) {
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
  if (fullscreenPan) {
    updateFullscreenPan(event);
    return;
  }

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
  if (fullscreenPan) {
    endFullscreenPan(event);
    return;
  }

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

function startFullscreenPan(event) {
  if (!images.length || isActiveVideo() || !document.fullscreenElement || event.button !== 0) {
    return;
  }

  fullscreenPan = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    x: fullscreenZoom.x,
    y: fullscreenZoom.y,
  };

  imageViewport.classList.add("is-dragging");
  imageViewport.setPointerCapture(event.pointerId);
  event.preventDefault();
}

function updateFullscreenPan(event) {
  if (!fullscreenPan || fullscreenPan.pointerId !== event.pointerId) {
    return;
  }

  fullscreenZoom.x = fullscreenPan.x + event.clientX - fullscreenPan.startX;
  fullscreenZoom.y = fullscreenPan.y + event.clientY - fullscreenPan.startY;
  applyImageTransform();
}

function endFullscreenPan(event) {
  if (!fullscreenPan || fullscreenPan.pointerId !== event.pointerId) {
    return;
  }

  fullscreenPan = null;
  imageViewport.classList.remove("is-dragging");
}

function startFullscreenSelection(event) {
  if (!images.length || isActiveVideo() || event.button !== 0) {
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

  if (!document.fullscreenElement) {
    const nextScale = Math.min(3, Math.max(0.25, scale));
    zoom = Math.round(nextScale * 100);
    panX = (imageCenterX - selectionCenterX) * nextScale;
    panY = (imageCenterY - selectionCenterY) * nextScale;
    resetZoomButton.textContent = `${zoom}%`;
    applyImageTransform();
    return;
  }

  fullscreenZoom = {
    active: true,
    scale,
    x: (imageCenterX - selectionCenterX) * scale,
    y: (imageCenterY - selectionCenterY) * scale,
  };

  applyImageTransform();
}

function getRenderedImageRect(viewportRect) {
  const dimensions = getActiveMediaDimensions();
  const imageRatio = dimensions.width / dimensions.height;
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
  fullscreenPan = null;
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

function handleViewerOutsideClick(event) {
  if (!images.length || document.fullscreenElement || document.body.classList.contains("has-open-sidebar")) {
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

  if (!images.length) {
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
    " ": () => (isPlaying ? stopSlideshowAndRender() : startSlideshow()),
    r: toggleShuffle,
    R: toggleShuffle,
    "+": () => {
      if (!isActiveVideo()) setZoom(zoom + 10);
    },
    "=": () => {
      if (!isActiveVideo()) setZoom(zoom + 10);
    },
    "-": () => {
      if (!isActiveVideo()) setZoom(zoom - 10);
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

function clearActiveObjectUrl() {
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = "";
  }
}
