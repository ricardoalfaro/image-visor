export const CATALOG_SORT_MODES = Object.freeze({
  NAME: "name",
  DATE_DESC: "dateDesc",
  DATE_ASC: "dateAsc",
});

export function createCatalogSelection({ folderPath = "", activeIndex = -1 } = {}) {
  return {
    folderPath,
    activeIndex,
  };
}

export function createCatalogSnapshot({
  allMedia = [],
  visibleMedia = [],
  folders = [],
  selection = createCatalogSelection(),
  sortBy = CATALOG_SORT_MODES.NAME,
} = {}) {
  return {
    allMedia,
    visibleMedia,
    folders,
    selection,
    sortBy,
  };
}
