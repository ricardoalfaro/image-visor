export const state = {
  images: [],
  allMedia: [],
  folders: [],
  activeFolderPath: "",
  activeDirectoryHandle: null,
  pendingDeleteMedia: null,
  pendingDeleteMediaBatch: null,
  sortBy: "name",
  activeIndex: -1,
  zoom: 100,
  sourceLabel: "Carpeta local",
  activeRecentFolderId: "",
  recentFolderPreviews: new Map(),
  recentFolderCoverObjectUrls: new Map(),
  collectionCoverObjectUrls: new Map(),
  mediaStripExpanded: false,
  gallerySelectedMedia: new Set(),
  gallerySelectionMode: false,
  currentObjectUrl: "",
  folderThumbnailObjectUrls: [],
  mediaThumbnailObjectUrls: [],
  isPlaying: false,
  shuffleEnabled: false,
  slideshowTimer: 0,
  panX: 0,
  panY: 0,
  imageAdjustments: {
    brightness: 100,
    contrast: 100,
    saturate: 100,
    hue: 0,
    exposure: 0,
    sharpen: 0,
  },
  activeSidebarPanel: "folders",
  dragState: null,
  fullscreenPan: null,
  fullscreenSelection: null,
  fullscreenZoom: {
    active: false,
    scale: 1,
    x: 0,
    y: 0,
  },
  recentFolders: [],
  favoriteKeys: new Set(),
  favoriteMedia: [],
  favoriteDbPromise: null,
  collections: [],
  collectionsDbPromise: null,
  recentDbPromise: null,
  recentFolderFiles: new Map(),
  noticeTimer: 0,
};

export function clearActiveObjectUrl() {
  if (state.currentObjectUrl) {
    URL.revokeObjectURL(state.currentObjectUrl);
    state.currentObjectUrl = "";
  }
}

export function clearFolderThumbnailObjectUrls() {
  for (const objectUrl of state.folderThumbnailObjectUrls) {
    URL.revokeObjectURL(objectUrl);
  }
  state.folderThumbnailObjectUrls = [];
}

export function clearMediaThumbnailObjectUrls() {
  for (const objectUrl of state.mediaThumbnailObjectUrls) {
    URL.revokeObjectURL(objectUrl);
  }
  state.mediaThumbnailObjectUrls = [];
}
