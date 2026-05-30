# Image Visor

Visor local de imagenes para explorar una carpeta desde el navegador.

## Uso local

Inicia el servidor local:

```bash
node server.js
```

Luego abre `http://127.0.0.1:5173` y usa `Elegir carpeta`. El servidor abrira el selector de carpetas del sistema y cargara las imagenes de forma paginada.

Tambien puedes iniciar el servidor apuntando a una carpeta especifica, si quieres saltarte el selector:

```bash
node server.js /ruta/a/tu/carpeta/de/imagenes
```

El endpoint `/api/images` pagina la lista en bloques de hasta 100 imagenes:

```text
/api/images?offset=0&limit=100
```

El servidor mantiene un manifiesto liviano con rutas y sirve cada imagen desde disco cuando el navegador la pide.

El boton `Abrir sin servidor` usa solo APIs del navegador. Sirve como alternativa simple, pero el modo recomendado para carpetas grandes es `Elegir carpeta` con el servidor local.

Atajos:

- `ArrowLeft` y `ArrowRight`: imagen anterior o siguiente
- `Space`: reproducir o pausar la presentacion
- `R`: activar o desactivar el modo aleatorio
- `F`: alternar pantalla completa
- `+` y `-`: acercar o alejar
- `0`: reiniciar zoom
- `Esc`: cerrar pantalla completa

## Formatos soportados

`jpg`, `jpeg`, `png`, `gif`, `webp`, `bmp`, `svg`, `avif`
