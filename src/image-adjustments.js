import { state } from "./state.js";
import {
  activeImage,
  adjustmentInputs,
  adjustmentOutputs,
  adjustmentsEmptyState,
  resetAdjustmentsButton,
} from "./dom.js";

const DEFAULT_IMAGE_ADJUSTMENTS = {
  brightness: 100,
  contrast: 100,
  saturate: 100,
};

export function resetImageAdjustments() {
  state.imageAdjustments = { ...DEFAULT_IMAGE_ADJUSTMENTS };
  applyImageAdjustments();
  renderImageAdjustmentControls();
}

export function updateImageAdjustment(key, value) {
  if (!(key in DEFAULT_IMAGE_ADJUSTMENTS)) {
    return;
  }

  state.imageAdjustments = {
    ...state.imageAdjustments,
    [key]: Number(value),
  };
  applyImageAdjustments();
  renderImageAdjustmentControls();
}

export function applyImageAdjustments() {
  const { brightness, contrast, saturate } = state.imageAdjustments;
  activeImage.style.filter = [
    `brightness(${brightness}%)`,
    `contrast(${contrast}%)`,
    `saturate(${saturate}%)`,
  ].join(" ");
}

export function renderImageAdjustmentControls() {
  const activeMedia = state.images[state.activeIndex];
  const canAdjust = Boolean(activeMedia && activeMedia.type !== "video");
  adjustmentsEmptyState.textContent = getAdjustmentStateText(activeMedia);
  adjustmentsEmptyState.classList.toggle("is-hidden", canAdjust);
  resetAdjustmentsButton.disabled = !canAdjust || !hasTemporaryAdjustments();

  for (const input of adjustmentInputs) {
    const key = input.dataset.imageAdjustment;
    const value = state.imageAdjustments[key] ?? DEFAULT_IMAGE_ADJUSTMENTS[key];
    input.disabled = !canAdjust;
    input.value = String(value);
  }

  for (const output of adjustmentOutputs) {
    const key = output.dataset.adjustmentOutput;
    const value = state.imageAdjustments[key] ?? DEFAULT_IMAGE_ADJUSTMENTS[key];
    output.value = `${value}%`;
    output.textContent = `${value}%`;
  }
}

function hasTemporaryAdjustments() {
  return Object.entries(DEFAULT_IMAGE_ADJUSTMENTS).some(([key, defaultValue]) => {
    return Number(state.imageAdjustments[key]) !== Number(defaultValue);
  });
}

function getAdjustmentStateText(activeMedia) {
  if (activeMedia?.type === "video") {
    return "Los ajustes temporales estan disponibles solo para imagenes.";
  }

  return "Selecciona una imagen para ajustar su vista.";
}
