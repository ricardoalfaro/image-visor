# Image Visor Backlog

Este backlog registra las ideas nuevas para evolucionar el visor actual sin convertirlo en el editor fotografico planificado anteriormente.

## Norte Del Proyecto

Mantener Image Viewer Pro como un visor local, rapido y simple, incorporando solo mejoras que hagan mas potente la experiencia de exploracion, seleccion, revision y gestion visual.

El proyecto separado del editor puede servir como referencia o cantera de codigo, pero este visor debe conservar su identidad:

- Visor local-first.
- Sin framework.
- Sin build step.
- Sin `node_modules`.
- Backend local opcional.
- Funciones nuevas solo si mejoran el flujo del visor.
- Cambios pequeños, verificables y reversibles.

## Reglas De Trabajo

- La base de trabajo es `main`.
- Esta rama registra mejoras posibles del visor y rescates selectivos desde ramas previas.
- No mezclar la arquitectura completa de Image Edition Pro.
- Rescatar piezas por valor concreto, no por arrastre historico.
- Cada cambio debe dejar la app funcional.
- Antes de cerrar una sesion importante, actualizar este backlog con el estado real.

## Estado Actual

- [x] Rama nueva creada desde `main`.
- [x] Backlog separado creado para la nueva direccion del visor.
- [ ] Definir lista inicial de mejoras deseadas para el visor.
- [ ] Evaluar que piezas de `continue-on-develop` se pueden reciclar.
- [ ] Priorizar primeras tareas.
- [x] Implementar primera mejora: controles basicos temporales de imagen.

## Ideas Candidatas

Estas ideas estan pendientes de definir. Se iran moviendo a secciones concretas cuando queden claras.

- [ ] Pendiente: usuario definira que funciones del editor quiere traer al visor.
- [ ] Rediseño completo de la interfaz: pendiente de referencias y definicion precisa de alcance. El foco inicial seran los paneles y otras areas que se definiran cuando se aborde la tarea.
- [x] Controles basicos temporales de imagen: habilitar ajustes como brillo, contraste u otros parametros simples mientras se visualiza una imagen. No deben persistir ni modificar archivos; son solo una ayuda momentanea durante la revision.
- [ ] Eliminacion on demand de imagenes: permitir borrar imagenes mientras se revisan en el visor. Debe incluir confirmacion para evitar accidentes y definir claramente si aplica solo a archivos locales con permisos suficientes o tambien a flujos servidos por el backend local.
- [ ] Lectura de archivos desde Google Drive: explorar capacidad para abrir imagenes y videos alojados en Google Drive. Pendiente definir autenticacion, permisos, seleccion de carpetas/archivos, cache local y diferencias frente al flujo local-first actual.
- [ ] Grupos de carpetas en el panel: permitir organizar carpetas dentro del sidebar/panel mediante grupos. Pendiente definir si los grupos seran manuales, automaticos, por origen, por proyecto u otra logica.
- [ ] Estado visible de origen desconectado: indicar en el panel cuando una carpeta ya no tiene conexion con su origen, por ejemplo si estaba en un disco externo o memoria flash que ya no esta conectada. Pendiente definir deteccion, estados visuales y acciones disponibles para reconectar, ocultar o eliminar la referencia.

## Rescate Selectivo Desde Trabajo Anterior

Evaluar solo despues de definir una mejora concreta:

- [ ] Utilidades de media.
- [ ] Separacion de persistencia.
- [ ] Motor de render si aporta una capa simple para el visor.
- [ ] Historial de operaciones si hay acciones reversibles utiles en el visor.
- [ ] Indicadores visuales de estado.

Evitar traer inicialmente:

- [ ] Contratos de IA.
- [ ] Prompt editing.
- [ ] Presets fotograficos.
- [ ] Export engine avanzado.
- [ ] Arquitectura completa de editor.
- [ ] UI de revelado completa.

## QA Minimo Por Cambio

- [ ] La app abre sin errores.
- [ ] Se puede importar una carpeta.
- [ ] Se puede navegar entre imagenes.
- [ ] Videos siguen reproduciendose.
- [ ] Favoritos siguen funcionando.
- [ ] Carpetas recientes siguen funcionando.
- [ ] Zoom y paneo siguen funcionando.
- [ ] Fullscreen sigue funcionando.
- [ ] Slideshow sigue funcionando.
- [ ] No hay regresiones visuales graves en mobile.
