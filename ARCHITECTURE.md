# Image Edition Pro Architecture

Este documento describe la arquitectura objetivo para evolucionar Image Vision Pro hacia Image Edition Pro sin reescribir el proyecto ni romper la funcionalidad existente.

## Objetivo Arquitectonico

Image Edition Pro debe pasar de ser un visor local a un revelador fotografico no destructivo. La arquitectura debe mantener:

- Vanilla JavaScript ES Modules.
- Filosofia local-first.
- Backend opcional.
- Persistencia local con IndexedDB/localStorage.
- Rendimiento suficiente para carpetas grandes.
- Compatibilidad con el visor, videos, favoritos, zoom, paneo, fullscreen y slideshow actuales.

## Estado Actual

La aplicacion ya esta separada en modulos, pero varios archivos mezclan responsabilidades:

- `app.js`: composition root, wiring de eventos, teclado y arranque.
- `src/file-loader.js`: carga de carpetas, modo server/browser, recientes, construccion de media items y cierre del visor.
- `src/viewer.js`: seleccion, navegacion, slideshow, render DOM, estado de controles, favoritos, fullscreen y carpetas.
- `src/zoom-pan.js`: zoom visual, paneo y seleccion rectangular.
- `src/favorites.js`: claves de favoritos, persistencia IndexedDB y sincronizacion con media cargada.
- `src/storage.js`: recientes, handles de carpetas, copias de carpetas browser e IndexedDB.
- `src/ui.js`: sidebar, tema, notices, render de recientes y favoritos.
- `src/constants.js` y `src/utils.js`: constantes globales y utilidades mixtas.

Esta estructura funciona, por lo que la migracion debe hacerse mediante capas nuevas y fachadas temporales.

## Capas Objetivo

### Catalog

Responsable de colecciones y navegacion logica.

- Carpetas.
- Filtros.
- Orden.
- Seleccion activa.
- Recientes como concepto de catalogo, no como detalle de UI.

No debe renderizar DOM ni manipular imagenes.

### Media

Responsable de describir archivos multimedia.

- Tipos MIME soportados.
- Extensiones soportadas.
- Deteccion de imagen/video.
- Rutas relativas.
- Metadata tecnica basica.
- Construccion de media items desde `File`, handles o server payloads.

No debe conocer favoritos, UI ni motores de edicion.

### Develop Engine

Responsable de edicion no destructiva.

- Ajustes.
- Operaciones.
- Historial.
- Versiones virtuales.
- Aplicacion deterministica de operaciones sobre el estado de una fotografia.

No debe tocar DOM ni generar UI.

### Rendering Engine

Responsable de convertir una foto + operaciones en una representacion visible.

- Entrada: fotografia original y estado de revelado.
- Salida: render target, canvas, bitmap u object URL segun el caso.
- Debe estar desacoplado de controles visuales.

La UI solicita render; no modifica pixeles directamente.

### Export Engine

Responsable de generar salidas persistibles.

- Exportar una version revelada.
- Preparar formatos futuros.
- Mantener separada la exportacion del render interactivo.

### Plugin System

Responsable de extensibilidad controlada.

- Registrar capacidades.
- Resolver proveedores.
- Aislar integraciones futuras.

La IA futura debe entrar por interfaces intercambiables, no por imports directos en UI o Develop Engine.

### AI

Responsable de contratos para capacidades inteligentes futuras.

- Proveedores intercambiables.
- Intenciones de edicion.
- Analisis de fotografias.
- Busqueda inteligente.
- Normalizacion de operaciones estructuradas compatibles con Develop Engine.

No debe llamar APIs externas directamente desde UI ni producir imagenes. Las respuestas de edicion deben convertirse en operaciones de revelado.

### UI

Responsable de interaccion y DOM.

- Botones.
- Sidebar.
- Tema.
- Notices.
- Visor.
- Atajos.

La UI modifica estado o invoca servicios. No debe editar imagenes directamente.

### Application

Responsable de acciones de caso de uso entre UI, Develop Engine, Rendering Engine y Persistence.

- Aplicar ajustes a fotos.
- Persistir historiales.
- Solicitar render.
- Devolver resultados para que la UI decida como presentarlos.

No debe contener layout ni decisiones visuales.

### Persistence

Responsable de almacenamiento local.

- IndexedDB.
- localStorage.
- Migraciones.
- Favoritos actuales.
- Carpetas recientes actuales.

No debe renderizar UI.

## Reglas De Migracion

- Mantener los archivos historicos como fachadas mientras sea util.
- Migrar una responsabilidad por vez.
- Evitar cambios visuales durante Fase 1.
- Evitar contratos especulativos con implementaciones complejas.
- No introducir dependencias.
- Mantener `app.js` como composition root hasta que exista una razon concreta para dividirlo.
- Cada cambio debe dejar la app usable.

## Estrategia De Ramas

- `main` es la rama estable de produccion.
- `develop` es la rama de integracion para la evolucion hacia Image Edition Pro.
- Cada cambio debe entrar mediante una rama corta creada desde `develop`.
- Los PR se revisan y mezclan a `develop`.
- `develop` se mezcla a `main` solo cuando el corte evolutivo este completo y verificado.
- No trabajar directamente sobre `main` para features evolutivas.
- Antes de cada push remoto o cierre de sesion, actualizar `BACKLOG.md` con el estado real del trabajo.
- La actualizacion de `BACKLOG.md` debe quedar comiteada y pusheada con los cambios de la sesion.

## Flujo Objetivo

```text
UI event
  -> application/controller action
  -> catalog/media/develop state update
  -> rendering engine request
  -> UI receives render result
```

Para video, el flujo inicial puede seguir siendo directo al elemento `<video>`, porque el revelador fotografico aplica primero a imagenes.

## Contratos Iniciales

Los contratos agregados en Fase 1 son intencionalmente pequenos. Su funcion es fijar limites de arquitectura, no implementar funciones futuras.

- `src/develop/`: estado y operaciones de revelado.
- `src/rendering/`: solicitud y resultado de render.
- `src/export/`: solicitud y resultado de exportacion.
- `src/plugins/`: registro minimo de plugins.
- `src/catalog/`: helpers de catalogo.
- `src/media/`: tipos y utilidades multimedia.

## Verificacion Minima

Despues de cada iteracion:

- La app carga sin errores de modulo.
- Se puede importar una carpeta.
- Se puede navegar entre imagenes.
- Favoritos siguen funcionando.
- Carpetas recientes siguen funcionando.
- Zoom, paneo y fullscreen siguen funcionando.
- Slideshow sigue funcionando.
- Videos siguen reproduciendose.
