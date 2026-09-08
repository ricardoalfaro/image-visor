import { state } from "./state.js";
import { IMAGE_ADJUSTMENTS_KEY } from "./constants.js";
import {
  activeImage,
  adjustmentInputs,
  adjustmentOutputs,
  adjustmentsEmptyState,
  resetAdjustmentsButton,
  sharpenKernel,
  resetToneCurveButton,
  toneCurveCanvas,
  toneCurveFunctions,
} from "./dom.js";

const TONE_CURVE_BASE = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];
const TONE_CURVE_STRENGTH = 0.22;
const TONE_REGION_POINTS = {
  shadows: 1,
  darks: 3,
  lights: 5,
  highlights: 7,
};
const DEFAULT_IMAGE_ADJUSTMENTS = {
  brightness: 100,
  contrast: 100,
  saturate: 100,
  hue: 0,
  exposure: 0,
  sharpen: 0,
  highlights: 0,
  lights: 0,
  darks: 0,
  shadows: 0,
};
const IMAGE_ADJUSTMENT_RANGES = {
  brightness: [50, 150],
  contrast: [50, 180],
  saturate: [0, 200],
  hue: [-180, 180],
  exposure: [-2, 2],
  sharpen: [0, 100],
  highlights: [-100, 100],
  lights: [-100, 100],
  darks: [-100, 100],
  shadows: [-100, 100],
};
let activeToneCurvePoint = null;

export function loadPersistedImageAdjustments() {
  try {
    const stored = JSON.parse(localStorage.getItem(IMAGE_ADJUSTMENTS_KEY) || "null");
    if (stored && typeof stored === "object") {
      state.imageAdjustments = normalizeImageAdjustments(stored);
    }
  } catch (error) {
    state.imageAdjustments = createDefaultImageAdjustments();
  }
}

export function initializeToneCurveControl() {
  if (!toneCurveCanvas) {
    return;
  }

  toneCurveCanvas.addEventListener("pointerdown", (event) => {
    const activeMedia = state.images[state.activeIndex];
    if (!activeMedia || activeMedia.type === "video") {
      return;
    }

    activeToneCurvePoint = getNearestToneCurvePoint(event);
    if (activeToneCurvePoint === null) {
      return;
    }
    toneCurveCanvas.setPointerCapture(event.pointerId);
    updateToneCurveFromPointer(event);
  });
  toneCurveCanvas.addEventListener("pointermove", (event) => {
    if (activeToneCurvePoint === null) {
      return;
    }
    updateToneCurveFromPointer(event);
  });
  toneCurveCanvas.addEventListener("pointerup", stopToneCurveDrag);
  toneCurveCanvas.addEventListener("pointercancel", stopToneCurveDrag);
  toneCurveCanvas.addEventListener("lostpointercapture", stopToneCurveDrag);
  window.addEventListener("resize", drawToneCurve);
}

export function resetImageAdjustments() {
  state.imageAdjustments = createDefaultImageAdjustments();
  try {
    localStorage.removeItem(IMAGE_ADJUSTMENTS_KEY);
  } catch (error) {}
  applyImageAdjustments();
  renderImageAdjustmentControls();
}

export function resetToneCurve() {
  state.imageAdjustments = {
    ...state.imageAdjustments,
    highlights: 0,
    lights: 0,
    darks: 0,
    shadows: 0,
    toneCurve: [...TONE_CURVE_BASE],
  };
  persistImageAdjustments();
  applyImageAdjustments();
  renderImageAdjustmentControls();
}

export function updateImageAdjustment(key, value) {
  if (!(key in DEFAULT_IMAGE_ADJUSTMENTS)) {
    return;
  }

  const nextValue = Number(value);
  const nextAdjustments = {
    ...state.imageAdjustments,
    [key]: nextValue,
  };

  if (key in TONE_REGION_POINTS) {
    const pointIndex = TONE_REGION_POINTS[key];
    const curve = getToneCurve();
    curve[pointIndex] = clampToneCurvePoint(
      curve,
      pointIndex,
      TONE_CURVE_BASE[pointIndex] + ((nextValue / 100) * TONE_CURVE_STRENGTH),
    );
    nextAdjustments.toneCurve = curve;
  }

  state.imageAdjustments = {
    ...nextAdjustments,
  };
  persistImageAdjustments();
  applyImageAdjustments();
  renderImageAdjustmentControls();
}

export function applyImageAdjustments() {
  const { brightness, contrast, saturate, hue, exposure, sharpen } = state.imageAdjustments;
  updateSharpenKernel(sharpen);
  updateToneCurveFilter();
  activeImage.style.filter = [
    `brightness(${brightness}%)`,
    `contrast(${contrast}%)`,
    `saturate(${saturate}%)`,
    `hue-rotate(${hue}deg)`,
    `brightness(${Math.pow(2, exposure) * 100}%)`,
    hasToneCurveAdjustments() ? "url(#toneCurveFilter)" : "",
    sharpen > 0 ? "url(#sharpenFilter)" : "",
  ].filter(Boolean).join(" ");
}

export function renderImageAdjustmentControls() {
  const activeMedia = state.images[state.activeIndex];
  const canAdjust = Boolean(activeMedia && activeMedia.type !== "video");
  adjustmentsEmptyState.textContent = getAdjustmentStateText(activeMedia);
  adjustmentsEmptyState.classList.toggle("is-hidden", canAdjust);
  resetAdjustmentsButton.disabled = !canAdjust || !hasTemporaryAdjustments();
  resetToneCurveButton.disabled = !canAdjust || !hasToneCurveAdjustments();
  toneCurveCanvas.classList.toggle("is-disabled", !canAdjust);
  toneCurveCanvas.setAttribute("aria-disabled", String(!canAdjust));

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

  drawToneCurve();
}

function createDefaultImageAdjustments() {
  return {
    ...DEFAULT_IMAGE_ADJUSTMENTS,
    toneCurve: [...TONE_CURVE_BASE],
  };
}

function normalizeImageAdjustments(stored) {
  const normalized = createDefaultImageAdjustments();

  for (const [key, [minimum, maximum]] of Object.entries(IMAGE_ADJUSTMENT_RANGES)) {
    const value = Number(stored[key]);
    if (Number.isFinite(value)) {
      normalized[key] = Math.min(maximum, Math.max(minimum, value));
    }
  }

  if (Array.isArray(stored.toneCurve) && stored.toneCurve.length === TONE_CURVE_BASE.length) {
    const curve = stored.toneCurve.map(Number);
    if (curve.every(Number.isFinite)) {
      const minimumGap = 0.018;
      const sanitizedCurve = [0];
      for (let index = 1; index < curve.length - 1; index += 1) {
        const lower = sanitizedCurve[index - 1] + minimumGap;
        const upper = 1 - ((curve.length - 1 - index) * minimumGap);
        sanitizedCurve.push(Math.min(upper, Math.max(lower, Math.min(1, Math.max(0, curve[index])))));
      }
      normalized.toneCurve = [...sanitizedCurve, 1];
    }
  }

  return normalized;
}

function persistImageAdjustments() {
  try {
    localStorage.setItem(IMAGE_ADJUSTMENTS_KEY, JSON.stringify(state.imageAdjustments));
  } catch (error) {}
}

function getToneCurve() {
  const current = state.imageAdjustments.toneCurve;
  return Array.isArray(current) && current.length === TONE_CURVE_BASE.length
    ? [...current]
    : [...TONE_CURVE_BASE];
}

function updateToneCurveFilter() {
  const tableValues = getToneCurve().map((point) => point.toFixed(4)).join(" ");
  for (const curveFunction of toneCurveFunctions) {
    curveFunction.setAttribute("tableValues", tableValues);
  }
}

function hasToneCurveAdjustments() {
  return getToneCurve().some((point, index) => Math.abs(point - TONE_CURVE_BASE[index]) > 0.001);
}

function getNearestToneCurvePoint(event) {
  const rect = toneCurveCanvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width;
  const nearestIndex = Object.values(TONE_REGION_POINTS).reduce((closest, index) => {
    return Math.abs(TONE_CURVE_BASE[index] - x) < Math.abs(TONE_CURVE_BASE[closest] - x) ? index : closest;
  }, 1);

  return Math.abs(TONE_CURVE_BASE[nearestIndex] - x) <= 0.11 ? nearestIndex : null;
}

function updateToneCurveFromPointer(event) {
  const rect = toneCurveCanvas.getBoundingClientRect();
  const y = 1 - ((event.clientY - rect.top) / rect.height);
  const curve = getToneCurve();
  curve[activeToneCurvePoint] = clampToneCurvePoint(curve, activeToneCurvePoint, y);
  const region = Object.entries(TONE_REGION_POINTS)
    .find(([, index]) => index === activeToneCurvePoint)?.[0];
  const nextValue = region
    ? Math.round(((curve[activeToneCurvePoint] - TONE_CURVE_BASE[activeToneCurvePoint]) / TONE_CURVE_STRENGTH) * 100)
    : 0;

  state.imageAdjustments = {
    ...state.imageAdjustments,
    ...(region ? { [region]: nextValue } : {}),
    toneCurve: curve,
  };
  persistImageAdjustments();
  applyImageAdjustments();
  renderImageAdjustmentControls();
}

function stopToneCurveDrag(event) {
  if (activeToneCurvePoint === null) {
    return;
  }
  if (toneCurveCanvas.hasPointerCapture?.(event.pointerId)) {
    toneCurveCanvas.releasePointerCapture(event.pointerId);
  }
  activeToneCurvePoint = null;
}

function clampToneCurvePoint(curve, index, value) {
  const lower = curve[index - 1] + 0.018;
  const upper = curve[index + 1] - 0.018;
  return Math.min(upper, Math.max(lower, Math.min(1, Math.max(0, value))));
}

function drawToneCurve() {
  if (!toneCurveCanvas) {
    return;
  }

  const rect = toneCurveCanvas.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return;
  }

  const ratio = window.devicePixelRatio || 1;
  const width = Math.round(rect.width * ratio);
  const height = Math.round(rect.height * ratio);
  if (toneCurveCanvas.width !== width || toneCurveCanvas.height !== height) {
    toneCurveCanvas.width = width;
    toneCurveCanvas.height = height;
  }

  const context = toneCurveCanvas.getContext("2d");
  if (!context) {
    return;
  }

  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, rect.width, rect.height);
  context.fillStyle = "rgba(255, 255, 255, 0.035)";
  context.fillRect(0, 0, rect.width, rect.height);

  context.strokeStyle = "rgba(255, 255, 255, 0.12)";
  context.lineWidth = 1;
  for (let step = 1; step < 4; step += 1) {
    const positionX = (rect.width / 4) * step;
    const positionY = (rect.height / 4) * step;
    context.beginPath();
    context.moveTo(positionX, 0);
    context.lineTo(positionX, rect.height);
    context.moveTo(0, positionY);
    context.lineTo(rect.width, positionY);
    context.stroke();
  }

  drawHistogram(context, rect.width, rect.height);

  const curve = getToneCurve();
  context.strokeStyle = "rgba(245, 247, 250, 0.95)";
  context.lineWidth = 1.5;
  context.beginPath();
  curve.forEach((point, index) => {
    const x = TONE_CURVE_BASE[index] * rect.width;
    const y = (1 - point) * rect.height;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.stroke();

  for (const index of Object.values(TONE_REGION_POINTS)) {
    const x = TONE_CURVE_BASE[index] * rect.width;
    const y = (1 - curve[index]) * rect.height;
    context.fillStyle = "#dfe4eb";
    context.strokeStyle = "rgba(0, 0, 0, 0.72)";
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(x, y, 4, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  }
}

function drawHistogram(context, width, height) {
  const histogram = [0.98, 0.93, 0.88, 0.76, 0.64, 0.56, 0.5, 0.42, 0.37, 0.31, 0.26, 0.22, 0.2, 0.17, 0.15, 0.13, 0.1, 0.09, 0.08, 0.07, 0.06, 0.055, 0.05, 0.04, 0.03];
  context.fillStyle = "rgba(214, 221, 230, 0.12)";
  context.beginPath();
  context.moveTo(0, height);
  histogram.forEach((value, index) => {
    const x = (index / (histogram.length - 1)) * width;
    const y = height - (value * height * 0.92);
    context.lineTo(x, y);
  });
  context.lineTo(width, height);
  context.closePath();
  context.fill();
}

function updateSharpenKernel(sharpen) {
  if (!sharpenKernel) {
    return;
  }

  const amount = Number(sharpen) / 250;
  sharpenKernel.setAttribute("kernelMatrix", `0 ${-amount} 0 ${-amount} ${1 + (4 * amount)} ${-amount} 0 ${-amount} 0`);
}

function formatAdjustmentValue(key, value, unit) {
  if (key in TONE_REGION_POINTS) {
    return `${Number(value) > 0 ? "+" : ""}${value}`;
  }

  if (key === "exposure") {
    return `${Number(value) > 0 ? "+" : ""}${Number(value).toFixed(1)} ${unit}`;
  }

  return `${value}${unit}`;
}

function hasTemporaryAdjustments() {
  return Object.entries(DEFAULT_IMAGE_ADJUSTMENTS).some(([key, defaultValue]) => {
    return Number(state.imageAdjustments[key]) !== Number(defaultValue);
  }) || hasToneCurveAdjustments();
}

function getAdjustmentStateText(activeMedia) {
  if (activeMedia?.type === "video") {
    return "Los ajustes temporales estan disponibles solo para imagenes.";
  }

  return "Selecciona una imagen para ajustar su vista.";
}
