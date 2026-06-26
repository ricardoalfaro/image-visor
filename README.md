# 👁️ Image Viewer Pro

Visor local de imágenes y videos optimizado para explorar carpetas del sistema directamente desde tu navegador web. Diseñado para ofrecer una experiencia fluida, rápida y ligera, ya sea de forma 100% cliente (local) mediante las APIs modernas del navegador o a través de un servidor local de Node.js.

---

## 🛠️ Stack Tecnológico

El proyecto está diseñado bajo una filosofía **zero-dependencies** (sin librerías externas ni `node_modules`), lo que garantiza portabilidad y tiempos de carga inmediatos.

### Frontend
- **HTML5:** Estructura semántica avanzada utilizando etiquetas como `<main>`, `<section>`, `<figure>`, `<figcaption>` y `<aside>`.
- **CSS3 (Vanilla):**
  - **Variables CSS (Custom Properties):** Gestión de colores y temas (`--bg`, `--accent`, etc.), control reactivo del zoom (`--zoom`), paneo (`--pan-x`, `--pan-y`) y relaciones de aspecto dinámicas (`--image-ratio`).
  - **Diseño Moderno:** Uso exhaustivo de Grid, Flexbox y transiciones suaves (`ease`) para interacciones fluidas.
  - **Temas Dinámicos:** Soporte para modo **Claro**, **Oscuro** y **Auto** (sincronizado con el sistema operativo) mediante el atributo `data-theme` y variables CSS adaptables.
  - **Responsive Design:** Consultas de medios (`@media`) para adaptar la barra lateral, botones y visor en pantallas pequeñas y dispositivos móviles.
  - **Modo Pantalla Completa:** Estilos dinámicos usando el pseudo-selector `:fullscreen`.
- **JavaScript (Vanilla ES Modules):**
  - Modularidad nativa (ES Modules) para estructurar el estado, UI, favoritos, visor y controles.
  - **File System Access API:** Uso de `showDirectoryPicker` para obtener manejadores persistentes de carpetas locales y volver a abrirlas de forma directa.
  - **IndexedDB:** Almacenamiento persistente de favoritos (guardando los archivos como `Blob`) y del historial de carpetas accedidas.
  - **Object URLs** (`URL.createObjectURL`) para renderizar imágenes y reproducir videos pesados con alto rendimiento.
  - **Pointer Events:** Gestión robusta del arrastre (*drag & pan*) y selección de zoom rectangular usando `PointerCapture`.
  - **Fullscreen API & Keyboard Events** nativos.

### Backend (Opcional)
- **Node.js:** Construido exclusivamente sobre módulos nativos:
  - `node:fs` y `node:fs/promises` para lectura asíncrona y recursiva del disco.
  - `node:http` para servir la aplicación y los recursos estáticos.
  - `node:path` y `node:url` para saneamiento y resolución de rutas.
- **Seguridad Integrada:** Validación de rutas mediante `resolveInside` para prevenir ataques de *Directory Traversal* en el acceso de archivos.

---

## 🧠 Arquitectura y Lógica de Operación

La aplicación está dividida en submódulos JavaScript bajo el directorio `src/`, comunicados mediante un estado centralizado reactivo (`src/state.js`).

### 1. Gestión de Estado (`src/state.js` & `src/constants.js`)
Centraliza los datos en ejecución, incluyendo:
- La lista de archivos cargados (`allMedia` e `images`).
- El índice activo, nivel de zoom y compensación de paneo (`panX`, `panY`).
- El estado de la reproducción de diapositivas (`isPlaying`, `shuffleEnabled`).
- Elementos persistentes cargados de IndexedDB (favoritos y carpetas recientes).

### 2. Flujo de Archivos y Carga (`src/file-loader.js` & `server.js`)
Soporta dos flujos independientes:
* **Modo Local (Client-Side Puro):**
  - **File System Access API:** Si el navegador lo soporta, solicita acceso a la carpeta usando `showDirectoryPicker()`. Esto permite almacenar un `FileSystemDirectoryHandle` persistente en IndexedDB para restaurar el acceso al reiniciar la app.
  - **Fallback `webkitdirectory`:** En navegadores que no soportan la API moderna, utiliza el selector de archivos tradicional para leer la estructura completa.
  - **Filtrado y Ordenación (`src/viewer.js`):** Soporta filtrado por subcarpetas (sidebar dinámico) y ordenación flexible por **Nombre**, **Más recientes primero** y **Más antiguas primero** basándose en la propiedad `lastModified` del archivo.
* **Modo Servidor (Node.js API):**
  - El script `server.js` sirve de endpoint y escanea recursivamente la carpeta proporcionada.
  - Hace streaming seguro de imágenes y videos directamente al cliente mediante `fs.createReadStream`, optimizando el consumo de memoria en el backend.

### 3. Sistema de Favoritos Persistentes (`src/favorites.js`)
Una de las funcionalidades avanzadas es la persistencia de favoritos:
- **Base de Datos IndexedDB:** Cuando agregas una imagen a favoritos, la app extrae su contenido binario (`Blob`) y lo almacena localmente junto con sus metadatos (nombre, ruta original, tipo, fecha de modificación).
- **Acceso Sin Origen:** Esto permite visualizar la galería de favoritos en cualquier momento, incluso si la carpeta de origen no está cargada actualmente en la sesión del navegador.
- **Sincronización Inteligente:** Al cargar una carpeta local, la app empareja y sincroniza los favoritos ya guardados con los archivos disponibles de esa sesión.

### 4. Gestión de Zoom, Paneo y Selección Rectangular (`src/zoom-pan.js`)
- **Zoom Dinámico:** Restringido entre **25%** y **300%**, aplicándose mediante variables CSS transformadas por GPU (`scale(var(--zoom))`).
- **Drag & Pan:** Al superar el 100% de zoom, la imagen se vuelve arrastrable. Los Pointer Events calculan el desplazamiento acumulado (`panX` y `panY`) aplicando `PointerCapture` para evitar perder el foco del ratón fuera del visor.
- **Zoom por Selección Rectangular (Fullscreen):**
  - En pantalla completa o zoom inferior a 100%, arrastrar el ratón dibuja un rectángulo de selección.
  - Al soltar el ratón, la app calcula la relación de aspecto e intersección del recuadro seleccionado respecto al viewport de la imagen original (`getRenderedImageRect` e `intersectRects`), aplicando de forma instantánea el factor de escala y el paneo exacto para centrar y ampliar el área dibujada.

### 5. Reproductor de Video y Presentación (`src/viewer.js`)
- **Soporte Multimedia:** Identifica dinámicamente si el archivo seleccionado es un video (`video/mp4`, `.mov`, etc.) o imagen. Si es video, oculta el visor de imagen y activa un elemento `<video>` con soporte para reproducción automática (*autoplay* con fallback muteado) y avance de reproducción contiguo.
- **Slideshow / Presentación:**
  - Al presionar **Play**, se activa un temporizador de diapositivas (`SLIDESHOW_INTERVAL_MS = 4000`).
  - **Modo Aleatorio (Shuffle):** Permite barajar dinámicamente el orden de reproducción sin alterar la ordenación visual de las carpetas.
  - **Avance Automático de Video:** Si la presentación está activa y el archivo actual es un video, el temporizador de diapositivas se congela y la app espera a que el evento `ended` del video dispare el avance a la siguiente pista, garantizando ver el video completo.

---

## 🔍 Atajos de Teclado Soportados

| Tecla | Acción |
| :--- | :--- |
| `ArrowRight` / `ArrowLeft` | Imagen/Video siguiente / anterior |
| `Space` | Reproducir / Pausar la presentación |
| `R` / `r` | Activar / Desactivar modo aleatorio (Shuffle) |
| `F` / `f` | Alternar pantalla completa |
| `+` / `=` | Acercar zoom (+10%) |
| `-` | Alejar zoom (-10%) |
| `0` | Restablecer zoom al 100% |
| `Esc` | Cerrar el visor / Salir de pantalla completa |

---

## 🚀 Uso e Instrucciones

### Uso Cliente Estático (Local / Vercel)
1. Abre el archivo `index.html` en tu navegador.
2. Haz clic en **Importar una carpeta** (o abre el menú lateral y haz clic en la misma opción).
3. Concede permisos para leer el directorio local. La aplicación procesará y estructurará todo el contenido sin subir nada a internet.

### Uso con Servidor Local Node.js
1. Levanta el servidor especificando la ruta de la carpeta que deseas indexar:
   ```bash
   node server.js /ruta/a/tus/imagenes_o_videos
   ```
2. Accede a `http://127.0.0.1:5173` en tu navegador para interactuar con la galería.

---

## 🖼️ Formatos Multimedia Soportados

- **Imágenes:** `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.bmp`, `.svg`, `.avif`
- **Videos:** `.mov`, `.mp4`, `.m4v`, `.mpeg`, `.mpg`
