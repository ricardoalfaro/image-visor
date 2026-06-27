export const DEFAULT_DEVELOP_ADJUSTMENTS = Object.freeze({
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  temperature: 0,
  tint: 0,
  vibrance: 0,
  saturation: 0,
  crop: null,
  rotate: 0,
  straighten: 0,
});

export const DEVELOP_ADJUSTMENT_KEYS = Object.freeze(Object.keys(DEFAULT_DEVELOP_ADJUSTMENTS));

export function createDevelopAdjustments(overrides = {}) {
  return {
    ...DEFAULT_DEVELOP_ADJUSTMENTS,
    ...overrides,
  };
}

export function isDevelopAdjustmentKey(key) {
  return DEVELOP_ADJUSTMENT_KEYS.includes(key);
}

export function setDevelopAdjustment(adjustments, key, value) {
  if (!isDevelopAdjustmentKey(key)) {
    throw new Error(`Unknown develop adjustment: ${key}`);
  }

  return {
    ...createDevelopAdjustments(adjustments),
    [key]: value,
  };
}
