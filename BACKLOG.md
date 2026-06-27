# Image Edition Pro Backlog

Este backlog documenta hacia donde evoluciona el proyecto y sirve como contexto para futuras sesiones de Codex u otros modelos. El objetivo es evolucionar el visor actual, no reemplazarlo.

## Norte Del Proyecto

Transformar Image Viewer Pro en Image Edition Pro: un revelador fotografico moderno, local-first, sin build step ni `node_modules`, basado en Vanilla JavaScript ES Modules y edicion no destructiva.

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

## Estado Actual

### Arquitectura

- [x] Estructura base de capas creada: `catalog`, `media`, `develop`, `rendering`, `export`, `plugins`, `persistence`, `application`, `ai`, `ui`.
- [x] `Photo` existe como modelo interno no destructivo.
- [x] Los media items actuales se adaptan a `Photo`.
- [x] `state.photos` se hidrata al cargar carpetas.
- [x] Favoritos mantienen `Photo` interno sin perder compatibilidad con media items existentes.
- [x] `OperationHistory` soporta undo/redo a nivel de modelo.
- [x] Los historiales se persisten localmente por fotografia.
- [x] Los historiales persistidos se rehidratan al cargar carpetas y favoritos.
- [x] Presets existen como colecciones serializables de operaciones.
- [x] Prompt editing existe como instrucciones estructuradas sobre operaciones.
- [x] Contratos iniciales de IA definidos sin proveedores reales ni llamadas externas.
- [x] `RenderingEngine` existe y el visor lo usa para imagenes.
- [x] `ExportEngine` existe como export passthrough normalizado.
- [x] `Application` concentra acciones de edicion, persistencia de historial y solicitudes de render.
- [x] Persistencia de carpetas recientes ya no renderiza UI directamente.

### Producto Tangible

- [x] Sidebar muestra primera UI de revelado.
- [x] Exposicion, contraste y saturacion modifican el modelo `Photo`.
- [x] Reset, undo y redo funcionan sobre historial de operaciones.
- [x] El visor presenta los ajustes iniciales mediante el resultado del `RenderingEngine`.
- [ ] Validar UX del panel de revelado en sidebar.
- [ ] Validar si el set inicial de controles es correcto.
- [ ] Validar comportamiento esperado de reset/undo/redo.
- [ ] Definir indicadores visibles para imagen editada.
- [ ] Definir como se exponen presets en la interfaz.

### Riesgos Y Deuda

- [ ] QA manual completo pendiente tras la primera UI de revelado.
- [ ] El render real aun es CSS filter para ajustes basicos, no pipeline canvas/bitmap.
- [ ] Varios ajustes existen como datos, pero no tienen control visible ni efecto visual real.
- [ ] Presets estan listos como modelo/storage, pero no tienen UI.
- [ ] Prompt editing e IA son contratos; no hay proveedor ni experiencia visible.
- [ ] Export aun es passthrough; no exporta una imagen revelada con ajustes aplicados.

## QA Manual Obligatorio

- [ ] La app abre sin errores.
- [ ] Se puede importar una carpeta con imagenes.
- [ ] Se puede navegar entre imagenes.
- [ ] Se puede reproducir video.
- [ ] Favoritos siguen funcionando.
- [ ] Carpeta Favoritos sigue funcionando.
- [ ] Carpetas recientes: renombrar.
- [ ] Carpetas recientes: reabrir.
- [ ] Carpetas recientes: refrescar.
- [ ] Carpetas recientes: eliminar.
- [ ] Slideshow sigue funcionando.
- [ ] Zoom sigue funcionando.
- [ ] Paneo sigue funcionando.
- [ ] Fullscreen sigue funcionando.
- [ ] Revelado: exposicion.
- [ ] Revelado: contraste.
- [ ] Revelado: saturacion.
- [ ] Revelado: reset.
- [ ] Revelado: undo.
- [ ] Revelado: redo.
- [ ] Revelado: recargar la app y verificar persistencia.
- [ ] No hay regresiones visuales graves en mobile.

## Roadmap

### P0 - Seguridad Del Producto Actual

Estas tareas protegen el comportamiento existente antes de introducir motores nuevos.

- [x] Documentar arquitectura actual y arquitectura objetivo en `ARCHITECTURE.md`.
- [x] Definir criterios minimos de verificacion manual para visor, favoritos, carpetas recientes, slideshow, video, zoom y fullscreen.
- [x] Identificar responsabilidades actuales de `file-loader.js`, `viewer.js`, `favorites.js`, `storage.js`, `zoom-pan.js` y `ui.js`.
- [x] Corregir discrepancias de documentacion sobre dependencias externas/CDN.

### P1 - Reestructuracion Arquitectonica

Preparar capas sin cambiar comportamiento.

- [x] Crear estructura base de carpetas.
- [x] Mover constantes y utilidades de media hacia `src/media/`.
- [x] Separar persistencia de favoritos y recientes en `src/persistence/`.
- [x] Crear contratos minimos para catalogo, media, develop, rendering, export y plugins.
- [x] Crear capa `application` para acciones de caso de uso.
- [x] Mantener `app.js` como composition root temporal.

### P2 - Modelo Interno De Fotografia

Introducir el modelo de datos no destructivo.

- [x] Definir `Photo` como entidad interna.
- [x] Incluir referencia al archivo original.
- [x] Incluir metadata basica.
- [x] Incluir rating.
- [x] Incluir etiquetas.
- [x] Incluir ajustes de edicion.
- [x] Incluir historial de operaciones.
- [x] Incluir versiones virtuales.
- [x] Crear adaptador desde media items actuales hacia `Photo`.
- [x] Hidratar el modelo fotografico en runtime.
- [x] Migrar favoritos para mantener `Photo` interno.

### P3 - Develop Engine Inicial

Implementar ajustes como operaciones de datos.

- [x] Definir formato comun de operacion.
- [x] Definir estado inicial de ajustes.
- [x] Implementar aplicacion de operaciones `setAdjustment` y `resetAdjustments`.
- [x] Implementar storage e historial para operaciones.
- [x] Exponer UI inicial para exposicion, contraste y saturacion.
- [ ] Exponer UI para highlights, shadows, whites, blacks, temperature, tint y vibrance.
- [ ] Definir interaccion UX para crop, rotate y straighten.
- [ ] Implementar efecto visual real para todos los ajustes visibles.

### P4 - Render Pipeline

Desacoplar renderizado de la interfaz.

- [x] Crear `RenderingEngine`.
- [x] Definir entrada: foto original + operaciones/ajustes.
- [x] Definir salida: request/result normalizados.
- [x] Conectar visor al `RenderingEngine`.
- [x] Mantener compatibilidad con video.
- [x] Evitar que controles visuales modifiquen directamente `img.src`.
- [ ] Reemplazar CSS filters por pipeline canvas/bitmap para ajustes fotografiacos reales.
- [ ] Definir estrategia de performance para carpetas grandes.

### P5 - Historial Completo

Cada cambio debe quedar registrado como operacion reversible o reconstruible.

- [x] Definir `OperationHistory`.
- [x] Agregar undo/redo a nivel de modelo.
- [x] Persistir historial por fotografia.
- [x] Asegurar que sliders, presets y prompt editing reutilicen el mismo formato de operaciones.
- [ ] Definir UI final de historial o acciones visibles.

### P6 - Presets

Los presets son colecciones de operaciones, sin logica propia.

- [x] Definir formato de preset.
- [x] Crear aplicador de presets como wrapper sobre operaciones existentes.
- [x] Persistir presets localmente.
- [x] Preparar import/export local de presets.
- [ ] Disenar UI de presets.
- [ ] Aplicar presets desde la interfaz.
- [ ] Guardar preset desde ajustes actuales.

### P7 - Arquitectura IA

Crear infraestructura intercambiable, sin implementar modelos todavia.

- [x] Definir `AIProvider`.
- [x] Definir `EditIntent`.
- [x] Definir `PhotoAnalysis`.
- [x] Definir `SmartSearch`.
- [x] Definir adaptadores futuros para OpenAI, Gemini, Anthropic, Ollama y LM Studio.
- [x] Asegurar que IA solo produzca parametros estructurados compatibles con el Develop Engine.
- [ ] Definir UX para prompt editing antes de integrar proveedor real.
- [ ] Elegir proveedor inicial solo cuando exista flujo usable sin IA.

### P8 - Prompt Editing

La IA traduce lenguaje natural a operaciones estructuradas.

- [x] Crear parser/aplicador de instrucciones estructuradas.
- [x] Aplicar instrucciones por el mismo camino que sliders y presets.
- [x] Registrar cada instruccion en historial.
- [x] Mantener la restriccion: la IA nunca devuelve imagenes.
- [ ] Disenar entrada de prompt.
- [ ] Disenar preview/confirmacion antes de aplicar operaciones sugeridas.

### P9 - Primera UI De Revelado

Hacer tangible el nuevo enfoque con una interfaz pequena, revisable y reversible.

- [x] Agregar panel inicial de revelado.
- [x] Conectar exposicion, contraste y saturacion al modelo.
- [x] Conectar reset, undo y redo.
- [ ] Validar ubicacion del panel en sidebar.
- [ ] Validar densidad, etiquetas y jerarquia de controles.
- [ ] Definir si los controles deben vivir junto a carpetas o en modo/panel dedicado.
- [ ] Definir estados para imagen sin seleccionar, video y favoritos.
- [ ] Definir indicador de cambios no destructivos.
- [ ] Decidir siguiente set de ajustes visibles.

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
