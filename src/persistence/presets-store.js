import { DEVELOP_PRESETS_KEY } from "../constants.js";
import { createDevelopPreset } from "../develop/index.js";

export function loadDevelopPresets() {
  try {
    const storedPresets = JSON.parse(localStorage.getItem(DEVELOP_PRESETS_KEY) || "[]");
    return Array.isArray(storedPresets)
      ? storedPresets.map(safeCreateDevelopPreset).filter(Boolean)
      : [];
  } catch (error) {
    return [];
  }
}

export function saveDevelopPresets(presets) {
  const nextPresets = Array.isArray(presets) ? presets.map(createDevelopPreset) : [];
  localStorage.setItem(DEVELOP_PRESETS_KEY, JSON.stringify(nextPresets));
  return nextPresets;
}

export function upsertDevelopPreset(preset) {
  const nextPreset = createDevelopPreset({
    ...preset,
    updatedAt: Date.now(),
  });
  const presets = loadDevelopPresets();
  const nextPresets = [
    ...presets.filter((item) => item.id !== nextPreset.id),
    nextPreset,
  ];

  return saveDevelopPresets(nextPresets);
}

export function removeDevelopPreset(presetId) {
  return saveDevelopPresets(loadDevelopPresets().filter((preset) => preset.id !== presetId));
}

function safeCreateDevelopPreset(preset) {
  try {
    return createDevelopPreset(preset);
  } catch (error) {
    return null;
  }
}
