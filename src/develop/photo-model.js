import { createDevelopAdjustments } from "./adjustments.js";

export const PHOTO_SOURCE_TYPES = Object.freeze({
  LOCAL_FILE: "local-file",
  SERVER_FILE: "server-file",
  FAVORITE: "favorite",
  UNKNOWN: "unknown",
});

export function createPhotoModel({
  id,
  source = {},
  metadata = {},
  rating = 0,
  tags = [],
  adjustments = createDevelopAdjustments(),
  history = [],
  virtualCopies = [],
} = {}) {
  if (!id) {
    throw new Error("Photo id is required");
  }

  return {
    id,
    source: createPhotoSource(source),
    metadata: createPhotoMetadata(metadata),
    rating: normalizeRating(rating),
    tags: normalizeTags(tags),
    adjustments: createDevelopAdjustments(adjustments),
    history: normalizeHistory(history),
    virtualCopies: Array.isArray(virtualCopies) ? [...virtualCopies] : [],
  };
}

export function createPhotoSource({
  type = PHOTO_SOURCE_TYPES.UNKNOWN,
  file = null,
  url = "",
  path = "",
  name = "",
} = {}) {
  return {
    type,
    file,
    url,
    path,
    name,
  };
}

export function createPhotoMetadata({
  name = "",
  path = "",
  folder = "",
  groupFolder = "",
  mediaType = "image",
  mimeType = "",
  size = 0,
  lastModified = 0,
} = {}) {
  return {
    name,
    path,
    folder,
    groupFolder,
    mediaType,
    mimeType,
    size,
    lastModified,
  };
}

export function createPhotoModelFromMediaItem(mediaItem) {
  if (!mediaItem) {
    throw new Error("Media item is required");
  }

  const sourceType = getPhotoSourceType(mediaItem);
  const name = mediaItem.name || mediaItem.file?.name || "";
  const path = mediaItem.path || name;
  const lastModified = mediaItem.lastModified || mediaItem.file?.lastModified || 0;

  return createPhotoModel({
    id: getPhotoIdFromMediaItem(mediaItem),
    source: {
      type: sourceType,
      file: mediaItem.file || null,
      url: mediaItem.url || "",
      path,
      name,
    },
    metadata: {
      name,
      path,
      folder: mediaItem.folder || "",
      groupFolder: mediaItem.groupFolder || "",
      mediaType: mediaItem.type || "image",
      mimeType: mediaItem.file?.type || "",
      size: mediaItem.file?.size || 0,
      lastModified,
    },
  });
}

export function createPhotoModelsFromMediaItems(mediaItems) {
  return Array.isArray(mediaItems)
    ? mediaItems.filter((item) => item?.type === "image").map(createPhotoModelFromMediaItem)
    : [];
}

export function getPhotoIdFromMediaItem(mediaItem) {
  if (!mediaItem) {
    return "";
  }

  const name = mediaItem.name || mediaItem.file?.name || "";
  const path = mediaItem.path || name;
  const lastModified = mediaItem.lastModified || mediaItem.file?.lastModified || 0;

  return mediaItem.id || mediaItem.favoriteKey || createPhotoId({ path, name, lastModified });
}

function createPhotoId({ path, name, lastModified }) {
  return `photo:${path || name}:${lastModified || 0}`;
}

function getPhotoSourceType(mediaItem) {
  if (mediaItem.source === "favorite") {
    return PHOTO_SOURCE_TYPES.FAVORITE;
  }

  if (mediaItem.file) {
    return PHOTO_SOURCE_TYPES.LOCAL_FILE;
  }

  if (mediaItem.url) {
    return PHOTO_SOURCE_TYPES.SERVER_FILE;
  }

  return PHOTO_SOURCE_TYPES.UNKNOWN;
}

function normalizeRating(rating) {
  const numericRating = Number(rating);

  if (!Number.isFinite(numericRating)) {
    return 0;
  }

  return Math.min(5, Math.max(0, Math.trunc(numericRating)));
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) {
    return [];
  }

  return [...new Set(tags.map((tag) => String(tag).trim()).filter(Boolean))];
}

function normalizeHistory(history) {
  if (Array.isArray(history)) {
    return {
      past: history.filter((operation) => operation?.type),
      future: [],
    };
  }

  return {
    past: Array.isArray(history?.past) ? history.past.filter((operation) => operation?.type) : [],
    future: Array.isArray(history?.future) ? history.future.filter((operation) => operation?.type) : [],
  };
}
