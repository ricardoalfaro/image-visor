import {
  createDevelopAdjustments,
  setDevelopAdjustment,
} from "./adjustments.js";

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

export function applyDevelopOperation(adjustments, operation) {
  if (!operation?.type) {
    return createDevelopAdjustments(adjustments);
  }

  if (operation.type === DEVELOP_OPERATION_TYPES.RESET_ADJUSTMENTS) {
    return createDevelopAdjustments();
  }

  if (operation.type === DEVELOP_OPERATION_TYPES.SET_ADJUSTMENT) {
    return setDevelopAdjustment(
      adjustments,
      operation.payload?.key,
      operation.payload?.value,
    );
  }

  throw new Error(`Unknown develop operation type: ${operation.type}`);
}

export function applyDevelopOperations(adjustments, operations = []) {
  return operations.reduce(applyDevelopOperation, createDevelopAdjustments(adjustments));
}
