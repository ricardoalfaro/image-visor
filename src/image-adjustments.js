import { state } from "./state.js";
import {
  activeImage,
  adjustmentInputs,
  adjustmentOutputs,
  adjustmentsEmptyState,
  resetAdjustmentsButton,
  sharpenKernel,
} from "./dom.js";

const DEFAULT_IMAGE_ADJUSTMENTS = {
  brightness: 100,
  contrast: 100,
  saturate: 100,
  hue: 0,
  exposure: 0,
  sharpen: 0,
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
  const { brightness, contrast, saturate, hue, exposure, sharpen } = state.imageAdjustments;
  updateSharpenKernel(sharpen);
  activeImage.style.filter = [
    `brightness(${brightness}%)`,
    `contrast(${contrast}%)`,
    `saturate(${saturate}%)`,
    `hue-rotate(${hue}deg)`,
    `brightness(${Math.pow(2, exposure) * 100}%)`,
    sharpen > 0 ? "url(#sharpenFilter)" : "",
  ].filter(Boolean).join(" ");
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
    const formattedValue = formatAdjustmentValue(key, value, output.dataset.adjustmentUnit || "%");
    output.value = formattedValue;
    output.textContent = formattedValue;
  }
}

function updateSharpenKernel(sharpen) {
  if (!sharpenKernel) {
    return;
  }

  const amount = Number(sharpen) / 250;
  sharpenKernel.setAttribute("kernelMatrix", `0 ${-amount} 0 ${-amount} ${1 + (4 * amount)} ${-amount} 0 ${-amount} 0`);
}

function formatAdjustmentValue(key, value, unit) {
  if (key === "exposure") {
    return `${Number(value) > 0 ? "+" : ""}${Number(value).toFixed(1)} ${unit}`;
  }

  return `${value}${unit}`;
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
