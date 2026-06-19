export const IMAGE_TYPES = new Set([
  "image/avif",
  "image/bmp",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/svg+xml",
  "image/webp",
]);
export const VIDEO_TYPES = new Set([
  "video/mp4",
  "video/mpeg",
  "video/quicktime",
  "video/x-m4v",
]);
export const IMAGE_EXTENSION_PATTERN = /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i;
export const VIDEO_EXTENSION_PATTERN = /\.(m4v|mov|mp4|mpe?g)$/i;

export const SLIDESHOW_INTERVAL_MS = 4000;
export const BROWSER_PICKER_WARNING = "El navegador mostrara su selector de carpeta por seguridad.";
export const LOCAL_FOLDER_PICKER_ENDPOINT = "/api/choose-folder";
export const THEME_SEQUENCE = ["auto", "light", "dark"];
export const RECENT_FOLDERS_KEY = "imageVisorRecentFolders";
export const FAVORITES_KEY = "imageVisorFavorites";
export const FAVORITES_FOLDER_PATH = "__image_visor_favorites__";
export const FAVORITES_DB_NAME = "imageVisorFavorites";
export const FAVORITES_DB_STORE = "media";
export const HOME_CTA_SEEN_KEY = "imageVisorHomeCtaSeen";
export const RECENT_FOLDERS_LIMIT = 10;
export const RECENT_DB_NAME = "imageVisorFolderHandles";
export const RECENT_DB_STORE = "handles";
export const RECENT_BROWSER_FILES_STORE = "browserFolders";
export const NOTICE_AUTO_HIDE_MS = 10000;
