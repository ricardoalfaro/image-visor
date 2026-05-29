# Image Visor

Visor local de imagenes para explorar una carpeta desde el navegador.

## Uso local

Abre `index.html` en un navegador moderno y selecciona una carpeta con imagenes.

## Uso con servidor local

Tambien puedes servir una carpeta desde un servidor local:

```bash
node server.js /ruta/a/tu/carpeta/de/imagenes
```

Luego abre `http://127.0.0.1:5173` y usa `Cargar servidor`.

El endpoint `/api/images` pagina la lista en bloques de hasta 100 imagenes:

```text
/api/images?offset=0&limit=100
```

El servidor mantiene un manifiesto liviano con rutas y sirve cada imagen desde disco cuando el navegador la pide.

Atajos:

- `ArrowLeft` y `ArrowRight`: imagen anterior o siguiente
- `F`: alternar pantalla completa
- `+` y `-`: acercar o alejar
- `0`: reiniciar zoom
- `Esc`: cerrar pantalla completa

## Formatos soportados

`jpg`, `jpeg`, `png`, `gif`, `webp`, `bmp`, `svg`, `avif`
