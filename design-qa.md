# Design QA — Biblioteca fotográfica oscura

## Comparison target

- Source visual truth: `/Users/ricardoalfaro/Library/CloudStorage/GoogleDrive-ricardoalfarog@gmail.com/Mi unidad/Capturas de pantalla/Captura de pantalla 2026-06-26 a la(s) 10.52.46 a.m..png`
- Source dimensions: 3360 × 2046 px.
- Implementation screenshots: `/private/tmp/image-visor-library-redesign.png` and `/private/tmp/image-visor-split-panels-light.png`
- Implementation dimensions / viewport: 1800 × 1015 px / 1800 × 1015 CSS px, device scale factor 1.
- Density normalization: compared by layout proportions and regions rather than pixel-for-pixel because the source has different desktop dimensions and app chrome.
- State: desktop library view with folder and editing panels expanded independently; light-theme state also verified.

## Full-view comparison evidence

The reference and implementation were reviewed together in the same conversation visual context. Both present a dark photography workspace with a library panel, an uncluttered centered photo canvas, and a horizontal thumbnail strip at the bottom. The implementation adds collapsible icon rails to maximize the canvas.

## Focused region comparison evidence

- Left panel: implementation uses the app’s real imported-folder list, favorites, sort control, and import action, and collapses to a folder icon. The reference’s Cloud/Local and community modules are intentionally omitted because they do not exist in Image Viewer Pro’s local-first flow.
- Right panel: editing controls sit independently on the right and collapse to a settings icon.
- Photo canvas and filmstrip: implementation displays real loaded media, selection border, and click-to-switch thumbnails. The source has a wider image canvas; the implementation preserves the current media aspect ratio rather than cropping it.

## Fidelity surfaces

- Fonts and typography: compact sans-serif hierarchy, small uppercase section labels, and muted metadata align with the desktop-library direction. The existing Google Sans remains intentionally used for product consistency.
- Spacing and layout rhythm: 52 px icon rails, 292 px expanded panels, a central canvas, and a 112 px filmstrip establish the desktop composition. Borders are square/minimal and elevation was removed from the canvas.
- Colors and visual tokens: dark graphite panels (`#292929`, `#171717`, `#141414`) match the reference’s dark direction; light mode now uses white panels and soft neutral grays (`#ffffff`, `#f3f4f6`, `#dfe2e6`) rather than inheriting dark workspace colors.
- Image quality and asset fidelity: the viewer renders original user media and thumbnails directly; no reference imagery, logo, or decorative asset was recreated.
- Copy and content: library labels retain the existing Spanish product terminology and real folder counts; reference-only cloud/community copy is intentionally not copied.

## Findings

- [P3] The reference includes a top search that Image Viewer Pro does not currently provide.
  Location: top workspace edge.
  Evidence: search is visible in the reference but outside this viewer’s local media-browsing scope.
  Impact: minor visual difference; core library hierarchy and photo-review workflow are unaffected.
  Fix: add these only if search or editor tooling becomes an approved product requirement.

## Comparison history

1. Initial loaded-view check showed the inherited floating folder dock overlapping the central photo canvas. It was removed from desktop layout, leaving folders in the left panel and photos in the bottom strip.
2. The workspace was split into independent collapsible folder and editing panels, with icon rails at each outer edge and an application header.
3. Post-fix screenshot confirms visible header/theme control, independent panels, and no console errors.
4. A light-theme pass confirmed the header and panels render in white and soft grays. Selecting a folder closes only the folder panel; the editing panel stays open.
5. Panel rails now stay behind the expanded sidebars. Each expanded panel includes its own matching icon beside the title, while image controls remain unavailable until a gallery is open.

## Primary interactions tested

- Opened the persisted `Surtido` folder from the left library panel.
- Confirmed the active photo and its `1/435` position display.
- Confirmed a 435-item thumbnail strip renders with an active item.
- Checked browser console errors: none.
- Confirmed light theme workspace background is `rgb(243, 244, 246)` and header is white.
- Reloaded with the light preference persisted; it remains `light` after startup.
- Confirmed a folder selection leaves the independently open editing panel visible.
- Confirmed controls remain closed without an open gallery and open normally after loading `Surtido` (435 thumbnails).

## Implementation checklist

1. Keep the left folder and right editing panels independently collapsible on desktop.
2. Keep folders and favorites as real interactive entries.
3. Keep the bottom strip synchronized with the selected photo.
4. Preserve the original compact/off-canvas behavior on mobile.

## Follow-up polish

- Consider a real local search feature before adding a search field.

final result: passed

---

## Navegación circular por scroll — 2026-09-07

**Findings**

- [P1] Falta una captura del visor con una colección local activa.
  Location: marco central.
  Evidence: la referencia capturada en `/tmp/image-visor-infinite-scroll-qa/source-reference-desktop.png` y `/tmp/image-visor-infinite-scroll-qa/source-reference-mobile.png` muestra navegación por una colección de fotos. La única captura de la implementación disponible, `/tmp/image-visor-infinite-scroll-qa/implementation-empty-desktop.png`, muestra el estado vacío: las carpetas recientes persistidas no conservan archivos accesibles entre sesiones y el selector de carpeta nativo no puede automatizarse desde este navegador.
  Impact: no es posible comparar visualmente el ciclo en una colección real.
  Fix: cargar una carpeta local con tres o más fotos y repetir la captura en escritorio y móvil; comprobar también rueda/trackpad hacia ambos sentidos, el salto de la última a la primera foto y la vista de vídeo.

**Open Questions**

- El patrón se implementó solo para fotos. Los vídeos conservan el visor previo y no participan en el ciclo, para no modificar sus controles ni reproducción.

**Implementation Checklist**

1. La foto activa conserva el tamaño completo del marco, sin márgenes añadidos.
2. La rueda o trackpad navega hacia delante y atrás en ciclo, omitiendo vídeos.
3. Zoom y pantalla completa conservan sus interacciones existentes.
4. `node --check src/viewer.js`, `node --check app.js` y `git diff --check` pasaron; la consola del estado vacío no registra errores.

**Follow-up Polish**

- Evaluar con fotos horizontales, verticales y panorámicas reales para comprobar el ciclo continuo.

Source visual truth: `/tmp/image-visor-infinite-scroll-qa/source-reference-desktop.png` and `/tmp/image-visor-infinite-scroll-qa/source-reference-mobile.png`.

Implementation screenshot: `/tmp/image-visor-infinite-scroll-qa/implementation-empty-desktop.png`.

Viewport: reference desktop 1280 × 720 CSS px, reference mobile 390 × 844 CSS px; implementation initial desktop 1280 × 720 CSS px, device scale factor 1.

State: reference gallery visible; implementation empty due unavailable local files.

Full-view comparison evidence: blocked because the implementation capture does not contain an active multi-photo collection.

Focused region comparison evidence: not applicable until the central image is rendered with local media.

Comparison history: initial code review and empty-state browser check completed; no visual iteration can begin until media is loaded.

Primary interactions tested: static syntax checks, empty state, and console error check. The file-import interaction requires a native folder choice and was not automated.

final result: blocked

---

## Curva de tonos — 2026-08-30

### Comparison target

- Source visual truth: `/var/folders/7q/h1hcpn9s3710gwq4zd3y0jwm0000gn/T/codex-clipboard-3492a8c9-f75f-45ed-a330-7645bb368af9.png`
- Source dimensions: 333 × 358 px.
- Implementation screenshot: `/tmp/image-visor-tone-curve.png`
- Comparison image: `/tmp/image-visor-tone-curve-comparison.png`
- Implementation viewport: 1280 × 720 CSS px, device scale factor 1.
- Comparison normalization: source and the extracted left controls panel were scaled into 320 × 344 px regions for side-by-side review.
- State: dark theme, a local image selected, image-adjustments panel open, curve reset to its diagonal default.

### Full-view comparison evidence

The implementation preserves the reference control’s compact dark module: a tonal title, histogram-backed grid, neutral diagonal, four visible draggable points, and four region sliders in the matching high-to-low luminance order. It uses the product’s existing typography, spacing and dark panel tokens so it belongs with the existing viewer rather than reproducing legacy editor chrome literally.

### Focused region comparison evidence

The graph and region controls were compared from `/tmp/image-visor-tone-curve-comparison.png`. The plotted histogram, four-by-four grid, linear curve and regional slider density all remain legible at the compact panel size. Direct dragging of the shadow point changed the control value to `+49` and updated the active image filter; the reset action restored all tonal values to `0` and the neutral curve table.

### Fidelity surfaces

- Fonts and typography: uses the application’s Google Sans hierarchy; the small uppercase “Luz” kicker and 14 px title preserve the compact inspector rhythm of the reference.
- Spacing and layout rhythm: the graph, 12 px internal intervals and four compact sliders fit above the existing adjustment controls without altering the viewer canvas.
- Colors and visual tokens: graphite panel, subdued grid, low-opacity histogram, white curve and muted labels follow both the dark reference and the app’s current tokens.
- Image quality and asset fidelity: the histogram and curve are rendered by the interactive canvas control, not substituted product imagery; the selected photograph remains the original local media.
- Copy and content: Spanish labels mirror the intended tonal regions: Altas luces, Claros, Oscuros and Sombras.

### Findings

No actionable P0, P1 or P2 differences. The reference’s legacy panel chevrons and corner affordances were intentionally omitted because the app already has a modern sidebar and reset pattern.

### Primary interactions tested

1. Opened the persisted `Own` gallery and selected the image adjustment panel.
2. Changed Altas luces to `+20`; the curve table and `url(#toneCurveFilter)` on the active image updated.
3. Dragged the shadow point directly in the graph; Sombras changed to `+49`.
4. Restored the curve; all tone adjustments returned to neutral.
5. Checked browser console errors and warnings: none.

### Implementation checklist

1. Added a compact interactive tonal curve with histogram, grid and draggable points.
2. Added four synchronized regional tone sliders and a curve reset action.
3. Applied the generated tone curve through an SVG component-transfer filter on the active image.

final result: passed
