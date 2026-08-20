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
