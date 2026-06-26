# Image Edition Pro Backlog

Este backlog documenta hacia donde evoluciona el proyecto y sirve como contexto para futuras sesiones de Codex u otros modelos. El objetivo es evolucionar el visor actual, no reemplazarlo.

## Norte Del Proyecto

Transformar Image Vision Pro en Image Edition Pro: un revelador fotografico moderno, local-first, zero-dependencies, basado en Vanilla JavaScript ES Modules y edicion no destructiva.

La funcionalidad existente debe mantenerse en todo momento:

- Catalogo local y exploracion de carpetas.
- Persistencia local mediante IndexedDB/localStorage.
- Favoritos.
- Navegacion rapida.
- Visor de imagenes y videos.
- Zoom, paneo, pantalla completa y slideshow.
- Soporte de imagenes y video.

## Principios De Trabajo

- No crear un proyecto nuevo.
- No introducir frameworks.
- No introducir dependencias salvo justificacion fuerte.
- No hacer cambios masivos.
- Cada iteracion debe dejar la app funcional.
- La UI no debe modificar imagenes directamente.
- Toda edicion futura debe ser no destructiva.
- Las operaciones se guardan como datos, nunca como imagenes editadas.
- No introducir cloud sync, autenticacion ni backend obligatorio.

## Flujo De Ramas

- `main` representa la version estable de produccion.
- `develop` es la rama de integracion para el trabajo evolutivo.
- Las tareas deben implementarse en ramas cortas nacidas desde `develop`.
- Los PR se mezclan primero a `develop`.
- `develop` se mezcla a `main` solo cuando haya un cambio evolutivo completo, verificado y listo para produccion.
- Evitar commits directos en `main` salvo hotfixes explicitos.
- Antes de cada push remoto o cierre de sesion, actualizar este backlog con el estado real del trabajo.
- La actualizacion del backlog debe quedar comiteada y pusheada junto con el resto de cambios.

## Prioridades

### P0 - Seguridad Del Producto Actual

Estas tareas protegen el comportamiento existente antes de introducir motores nuevos.

- [x] Documentar arquitectura actual y arquitectura objetivo en `ARCHITECTURE.md`.
- [x] Definir criterios minimos de verificacion manual para visor, favoritos, carpetas recientes, slideshow, video, zoom y fullscreen.
- [x] Identificar responsabilidades actuales de `file-loader.js`, `viewer.js`, `favorites.js`, `storage.js`, `zoom-pan.js` y `ui.js`.
- [ ] Corregir discrepancias de documentacion: el README dice zero-dependencies, pero `index.html` usa Google Fonts y Font Awesome desde CDN.

### P1 - Fase 1: Reestructuracion Arquitectonica

Preparar capas sin cambiar la interfaz ni el comportamiento.

- [x] Crear estructura base de carpetas:
  - `src/catalog/`
  - `src/media/`
  - `src/develop/`
  - `src/rendering/`
  - `src/export/`
  - `src/plugins/`
  - `src/persistence/`
  - `src/ui/`
- [x] Mover constantes y utilidades de media hacia `src/media/` con adaptadores para mantener imports existentes.
- [x] Separar persistencia de favoritos y recientes en `src/persistence/`.
- [x] Crear contratos minimos para:
  - Catalog
  - Media
  - Develop Engine
  - Rendering Engine
  - Export Engine
  - Plugin System
- [x] Mantener `app.js` como composition root temporal mientras se migra la arquitectura.
- [x] Evitar cualquier cambio visual durante esta fase.

### P2 - Fase 2: Modelo Interno De Fotografia

Introducir el modelo de datos no destructivo.

- [ ] Definir `Photo` como entidad interna.
- [ ] Incluir referencia al archivo original.
- [ ] Incluir metadata basica.
- [ ] Incluir rating.
- [ ] Incluir etiquetas.
- [ ] Incluir ajustes de edicion.
- [ ] Incluir historial de operaciones.
- [ ] Incluir versiones virtuales.
- [ ] Migrar favoritos para que sean propiedad del modelo fotografico, sin perder compatibilidad con favoritos existentes.

### P3 - Fase 3: Develop Engine Inicial

Implementar ajustes como operaciones de datos, no como manipulaciones directas de UI.

- [ ] Definir formato comun de operacion.
- [ ] Definir estado inicial de ajustes.
- [ ] Implementar Exposure.
- [ ] Implementar Contrast.
- [ ] Implementar Highlights.
- [ ] Implementar Shadows.
- [ ] Implementar Whites.
- [ ] Implementar Blacks.
- [ ] Implementar Temperature.
- [ ] Implementar Tint.
- [ ] Implementar Vibrance.
- [ ] Implementar Saturation.
- [ ] Implementar Crop.
- [ ] Implementar Rotate.
- [ ] Implementar Straighten.

### P4 - Fase 4: Render Pipeline

Desacoplar renderizado de la interfaz.

- [ ] Crear `RenderingEngine`.
- [ ] Definir entrada: foto original + operaciones/ajustes.
- [ ] Definir salida: bitmap/canvas/object URL/render target segun necesidad.
- [ ] Hacer que la UI modifique estado y solicite render.
- [ ] Evitar que controles visuales modifiquen directamente `img.src` para ediciones.
- [ ] Mantener compatibilidad con video, que no pasa por el revelador fotografico inicial.

### P5 - Fase 5: Historial Completo

Cada cambio debe quedar registrado como operacion reversible o reconstruible.

- [ ] Definir `OperationHistory`.
- [ ] Agregar undo/redo a nivel de modelo.
- [ ] Persistir historial por fotografia.
- [ ] Asegurar que presets y prompt editing reutilicen el mismo formato de operaciones.

### P6 - Fase 6: Presets

Los presets son colecciones de operaciones, sin logica propia.

- [ ] Definir formato de preset.
- [ ] Crear aplicador de presets como wrapper sobre operaciones existentes.
- [ ] Persistir presets localmente.
- [ ] Preparar import/export local de presets.

### P7 - Fase 7: Arquitectura IA

Crear infraestructura intercambiable, sin implementar modelos todavia.

- [ ] Definir `AIProvider`.
- [ ] Definir `EditIntent`.
- [ ] Definir `PhotoAnalysis`.
- [ ] Definir `SmartSearch`.
- [ ] Definir adaptadores futuros para OpenAI, Gemini, Anthropic, Ollama y LM Studio.
- [ ] Asegurar que IA solo produzca parametros estructurados compatibles con el Develop Engine.

### P8 - Fase 8: Prompt Editing

La IA traduce lenguaje natural a operaciones estructuradas.

- [ ] Crear parser/aplicador de instrucciones estructuradas.
- [ ] Aplicar instrucciones por el mismo camino que sliders y presets.
- [ ] Registrar cada instruccion en historial.
- [ ] Mantener la restriccion: la IA nunca devuelve imagenes.

## Primeras Iteraciones Recomendadas

1. [x] Crear `ARCHITECTURE.md` con mapa actual, mapa objetivo y reglas de migracion.
2. [x] Crear carpetas nuevas sin mover logica todavia.
3. [x] Extraer `constants.js` y partes de `utils.js` relacionadas con media hacia `src/media/`.
4. [x] Separar storage en modulos de persistencia mas claros.
5. [x] Crear contratos minimos de `develop`, `rendering`, `export` y `plugins`.
6. [ ] Verificar manualmente que el visor funciona igual.

## Definicion De Hecho Para Cada Cambio

- La app abre.
- Se puede importar una carpeta.
- Se puede navegar entre imagenes.
- Favoritos siguen funcionando.
- Carpetas recientes no se rompen.
- Zoom y fullscreen siguen funcionando.
- Videos siguen reproduciendose.
- No hay cambios visuales no solicitados.
- No se introducen dependencias sin decision explicita.
