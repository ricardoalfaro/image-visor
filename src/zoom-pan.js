import { state } from "./state.js";
import { imageViewport, activeImage, zoomSelection, resetZoomButton } from "./dom.js";
import { isActiveVideo, getActiveMediaDimensions } from "./viewer.js";
import { clamp, intersectRects } from "./utils.js";

export function setZoom(nextZoom) {
  state.zoom = Math.min(300, Math.max(25, nextZoom));
  if (state.zoom <= 100) {
    state.panX = 0;
    state.panY = 0;
  }

  resetZoomButton.textContent = `${state.zoom}%`;
  applyImageTransform();
}

export function applyImageTransform() {
  if (!activeImage) {
    return;
  }

  if (isActiveVideo()) {
    imageViewport.classList.remove("is-pannable", "is-fullscreen-zoomed");
    return;
  }

  const useFullscreenZoom = document.fullscreenElement && state.fullscreenZoom.active;
  const nextZoom = useFullscreenZoom ? state.fullscreenZoom.scale : state.zoom / 100;
  const nextPanX = useFullscreenZoom ? state.fullscreenZoom.x : state.panX;
  const nextPanY = useFullscreenZoom ? state.fullscreenZoom.y : state.panY;

  activeImage.style.setProperty("--zoom", String(nextZoom));
  activeImage.style.setProperty("--pan-x", `${nextPanX}px`);
  activeImage.style.setProperty("--pan-y", `${nextPanY}px`);
  imageViewport.classList.toggle("is-pannable", state.images.length > 0 && state.zoom > 100);
  imageViewport.classList.toggle("is-fullscreen-zoomed", useFullscreenZoom);
}

export function startImageDrag(event) {
  if (!state.images.length || isActiveVideo() || event.button !== 0) {
    return;
  }

  if (document.fullscreenElement) {
    if (state.fullscreenZoom.active) {
      startFullscreenPan(event);
      return;
    }

    startFullscreenSelection(event);
    return;
  }

  if (state.zoom <= 100) {
    startFullscreenSelection(event);
    return;
  }

  if (document.fullscreenElement) {
    return;
  }

  state.dragState = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    panX: state.panX,
    panY: state.panY,
  };

  imageViewport.classList.add("is-dragging");
  imageViewport.setPointerCapture(event.pointerId);
  event.preventDefault();
}

export function dragImage(event) {
  if (state.fullscreenPan) {
    updateFullscreenPan(event);
    return;
  }

  if (state.fullscreenSelection) {
    updateFullscreenSelection(event);
    return;
  }

  if (!state.dragState || state.dragState.pointerId !== event.pointerId) {
    return;
  }

  state.panX = state.dragState.panX + event.clientX - state.dragState.startX;
  state.panY = state.dragState.panY + event.clientY - state.dragState.startY;
  applyImageTransform();
}

export function endImageDrag(event) {
  if (state.fullscreenPan) {
    endFullscreenPan(event);
    return;
  }

  if (state.fullscreenSelection) {
    endFullscreenSelection(event);
    return;
  }

  if (!state.dragState || state.dragState.pointerId !== event.pointerId) {
    return;
  }

  state.dragState = null;
  imageViewport.classList.remove("is-dragging");
}

function startFullscreenPan(event) {
  if (!state.images.length || isActiveVideo() || !document.fullscreenElement || event.button !== 0) {
    return;
  }

  state.fullscreenPan = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    x: state.fullscreenZoom.x,
    y: state.fullscreenZoom.y,
  };

  imageViewport.classList.add("is-dragging");
  imageViewport.setPointerCapture(event.pointerId);
  event.preventDefault();
}

function updateFullscreenPan(event) {
  if (!state.fullscreenPan || state.fullscreenPan.pointerId !== event.pointerId) {
    return;
  }

  state.fullscreenZoom.x = state.fullscreenPan.x + event.clientX - state.fullscreenPan.startX;
  state.fullscreenZoom.y = state.fullscreenPan.y + event.clientY - state.fullscreenPan.startY;
  applyImageTransform();
}

function endFullscreenPan(event) {
  if (!state.fullscreenPan || state.fullscreenPan.pointerId !== event.pointerId) {
    return;
  }

  state.fullscreenPan = null;
  imageViewport.classList.remove("is-dragging");
}

function startFullscreenSelection(event) {
  if (!state.images.length || isActiveVideo() || event.button !== 0) {
    return;
  }

  clearFullscreenSelection();
  state.fullscreenSelection = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    currentX: event.clientX,
    currentY: event.clientY,
  };

  imageViewport.classList.add("is-selecting");
  imageViewport.setPointerCapture(event.pointerId);
  updateZoomSelectionRect();
  event.preventDefault();
}

function updateFullscreenSelection(event) {
  if (!state.fullscreenSelection || state.fullscreenSelection.pointerId !== event.pointerId) {
    return;
  }

  state.fullscreenSelection.currentX = event.clientX;
  state.fullscreenSelection.currentY = event.clientY;
  updateZoomSelectionRect();
}

function endFullscreenSelection(event) {
  if (!state.fullscreenSelection || state.fullscreenSelection.pointerId !== event.pointerId) {
    return;
  }

  state.fullscreenSelection.currentX = event.clientX;
  state.fullscreenSelection.currentY = event.clientY;

  const selection = getFullscreenSelectionRect();
  clearFullscreenSelection();

  if (selection.width < 18 || selection.height < 18) {
    return;
  }

  zoomToFullscreenSelection(selection);
}

function updateZoomSelectionRect() {
  const selection = getFullscreenSelectionRect();
  zoomSelection.classList.remove("is-hidden");
  zoomSelection.style.left = `${selection.left}px`;
  zoomSelection.style.top = `${selection.top}px`;
  zoomSelection.style.width = `${selection.width}px`;
  zoomSelection.style.height = `${selection.height}px`;
}

function getFullscreenSelectionRect() {
  const viewportRect = imageViewport.getBoundingClientRect();
  const startX = clamp(state.fullscreenSelection.startX - viewportRect.left, 0, viewportRect.width);
  const startY = clamp(state.fullscreenSelection.startY - viewportRect.top, 0, viewportRect.height);
  const currentX = clamp(state.fullscreenSelection.currentX - viewportRect.left, 0, viewportRect.width);
  const currentY = clamp(state.fullscreenSelection.currentY - viewportRect.top, 0, viewportRect.height);

  return {
    left: Math.min(startX, currentX),
    top: Math.min(startY, currentY),
    width: Math.abs(currentX - startX),
    height: Math.abs(currentY - startY),
  };
}

function zoomToFullscreenSelection(selection) {
  const viewportRect = imageViewport.getBoundingClientRect();
  const renderedRect = getRenderedImageRect(viewportRect);
  const clippedSelection = intersectRects(selection, renderedRect);

  if (!clippedSelection || clippedSelection.width < 18 || clippedSelection.height < 18) {
    return;
  }

  const scale = Math.min(
    viewportRect.width / clippedSelection.width,
    viewportRect.height / clippedSelection.height,
  );
  const imageCenterX = renderedRect.left + renderedRect.width / 2;
  const imageCenterY = renderedRect.top + renderedRect.height / 2;
  const selectionCenterX = clippedSelection.left + clippedSelection.width / 2;
  const selectionCenterY = clippedSelection.top + clippedSelection.height / 2;

  if (!document.fullscreenElement) {
    const nextScale = Math.min(3, Math.max(0.25, scale));
    state.zoom = Math.round(nextScale * 100);
    state.panX = (imageCenterX - selectionCenterX) * nextScale;
    state.panY = (imageCenterY - selectionCenterY) * nextScale;
    resetZoomButton.textContent = `${state.zoom}%`;
    applyImageTransform();
    return;
  }

  state.fullscreenZoom = {
    active: true,
    scale,
    x: (imageCenterX - selectionCenterX) * scale,
    y: (imageCenterY - selectionCenterY) * scale,
  };

  applyImageTransform();
}

function getRenderedImageRect(viewportRect) {
  const dimensions = getActiveMediaDimensions();
  const imageRatio = dimensions.width / dimensions.height;
  const viewportRatio = viewportRect.width / viewportRect.height;

  if (imageRatio > viewportRatio) {
    const width = viewportRect.width;
    const height = width / imageRatio;
    return {
      left: 0,
      top: (viewportRect.height - height) / 2,
      width,
      height,
    };
  }

  const height = viewportRect.height;
  const width = height * imageRatio;
  return {
    left: (viewportRect.width - width) / 2,
    top: 0,
    width,
    height,
  };
}

export function resetFullscreenZoom() {
  state.fullscreenPan = null;
  state.fullscreenZoom = {
    active: false,
    scale: 1,
    x: 0,
    y: 0,
  };
  applyImageTransform();
}

export function clearFullscreenSelection() {
  state.fullscreenSelection = null;
  imageViewport.classList.remove("is-selecting");
  zoomSelection.classList.add("is-hidden");
  zoomSelection.removeAttribute("style");
}
