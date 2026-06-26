export const DEVELOP_OPERATION_TYPES = Object.freeze({
  SET_ADJUSTMENT: "develop.setAdjustment",
  RESET_ADJUSTMENTS: "develop.resetAdjustments",
});

export function createDevelopOperation({ type, payload = {}, createdAt = Date.now() }) {
  if (!type) {
    throw new Error("Develop operation type is required");
  }

  return {
    type,
    payload,
    createdAt,
  };
}
