# Image Viewer Pro

Visor de imagenes y videos que puede servirse como app estatica. La app pide permiso al navegador para abrir una carpeta local y muestra los archivos sin subirlos al servidor.

## Uso local

Inicia el servidor estatico local:

```bash
node server.js
```

Luego abre `http://127.0.0.1:5173` y usa `Elegir carpeta`.

## Uso en Vercel

Vercel solo sirve la app (`index.html`, `styles.css`, `app.js` y assets). Las imagenes y videos se leen en tu navegador desde la carpeta local que autorizas, usando `showDirectoryPicker()` cuando esta disponible y `webkitdirectory` como fallback.

Los archivos no se suben a Vercel.

## Formatos soportados

Imagenes: `jpg`, `jpeg`, `png`, `gif`, `webp`, `bmp`, `svg`, `avif`

Videos: `mov`, `mp4`, `m4v`, `mpeg`, `mpg`

## Atajos

- `ArrowLeft` y `ArrowRight`: anterior o siguiente
- `Space`: reproducir o pausar la presentacion en imagenes
- `R`: activar o desactivar modo aleatorio
- `F`: alternar pantalla completa en imagenes
- `+` y `-`: acercar o alejar en imagenes
- `0`: reiniciar zoom
- `Esc`: cerrar el visor cuando no esta en pantalla completa
