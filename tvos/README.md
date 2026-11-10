# Image Viewer Pro · Apple TV prototype

App nativa SwiftUI para tvOS 17 o posterior. Explora galerías de un computador en la misma red, abre fotografías y reproduce una presentación circular con pausa y tiempos de 5, 10 o 15 segundos. No modifica el contenido compartido.

## 1. Servicio en el computador

Requiere Node.js 22+ y `openssl` en PATH. Desde la raíz del repositorio:

```bash
node tv-server.js install-service   # arranca solo al iniciar sesión (macOS)
```

Las galerías son las carpetas que abres en la app de escritorio (`node server.js`, `http://localhost:5173`); se envían a la TV al pulsar «Sincronizar con TV» en el diálogo «Vincular TV». Lo último sincronizado reemplaza lo anterior, venga del navegador o perfil que venga. Solo se comparten carpetas abiertas con el selector del servidor local, porque son las que tienen una ruta real. La versión de producción no puede compartir carpetas.

Para vincular: en la app de escritorio pulsa **Vincular TV** (riel izquierdo). Muestra un código de 8 dígitos (5 minutos, un solo uso) y la huella del certificado. En la TV elige **Fotos locales**, comprueba que la huella coincide y escribe el código. La sesión dura un año y sobrevive a reinicios.

Comandos útiles: `node tv-server.js add <carpeta>` / `remove` / `list` (carpetas manuales), `pair` (código desde la terminal), `revoke` (desvincular todas las TV), `uninstall-service`. Logs: `~/.image-viewer-pro-tv/service.log`. Si mueves el repositorio, vuelve a ejecutar `install-service`.

Puerto predeterminado 5443 (`TV_PORT`). El servicio se anuncia por Bonjour (`_ivp-tv._tcp`). El certificado y la clave están en `~/.image-viewer-pro-tv/` (0700/0600). La app de escritorio habla con el servicio por un socket Unix privado, nunca por la red.

## 2. Ejecutar la app

1. Abrir `tvos/ImageViewerPro.xcodeproj` en Xcode con el SDK de tvOS instalado.
2. Elegir el esquema **ImageViewerPro** y un Apple TV Simulator. Si no aparece, instalar el runtime tvOS en **Xcode → Settings → Components**.
3. Para un Apple TV físico: activarle el modo de desarrollo cuando Xcode lo solicite, vincularlo en **Window → Devices and Simulators**, seleccionar tu **Team** en **Signing & Capabilities**, cambiar el bundle identifier si es necesario y elegir ese Apple TV como destino. La instalación en el dispositivo requiere firma de desarrollo.
4. Ejecutar con Run. Introducir la dirección completa mostrada en el computador, por ejemplo `https://192.168.1.20:5443`. La app admite IPv4 privada, loopback para pruebas y nombres `.local`; todavía no admite IPv6 ni descubrimiento Bonjour.
5. Pulsar **Comprobar computador**. Comparar **toda** la huella con la terminal. Solo si coincide, introducir el código y pulsar **La huella coincide · Vincular**. Si difiere, no continuar.
6. Abrir una carpeta y seleccionar una fotografía.

La app guarda dirección, huella y token en Keychain. Si el servidor se reinicia, se revoca la sesión o cambia de dirección, usar **Desvincular computador** y vincular otra vez. Actualizar la galería al volver a abrirla permite ver archivos añadidos o retirados.

## Control remoto y presentación

- En galerías: navegar con la cruceta/superficie del Siri Remote y seleccionar para abrir.
- En el visor, con la imagen enfocada: izquierda/derecha cambia fotografía; bajar permite acceder a los botones.
- **Play/Pausa** alterna la presentación desde el visor. También hay botones explícitos para reproducir, pausar, avanzar y retroceder.
- El botón de segundos cambia entre 5/10/15; el tiempo se cuenta después de que la imagen se haya cargado.
- **Atrás/Menu** o **Cerrar** vuelve a la galería. La presentación se pausa al abandonar la app y evita el reposo mientras el visor está abierto.
- Orden por subcarpeta/nombre, numérico; al terminar vuelve al inicio. La navegación manual reinicia el tiempo de la diapositiva.

## Seguridad y API

El servicio tvOS es independiente del visor web. `server.js` queda limitado a loopback; rechaza `HOST=0.0.0.0`. Su funcionalidad local existente se conserva.

El servidor tvOS usa TLS 1.2+ y un certificado local. La primera conexión solo obtiene la huella y cancela la autenticación TLS; no transmite el código. Tras compararla físicamente, URLSession acepta únicamente ese certificado. Las solicitudes llevan un token Bearer aleatorio de 256 bits y no siguen redirecciones. No se incluyen tokens en URLs. Las credenciales se guardan en Keychain, no en UserDefaults.

Rutas disponibles:

| Método | Ruta | Acceso |
| --- | --- | --- |
| POST | `/v1/pair` | Código temporal; devuelve token |
| GET | `/v1/galleries` | Token; galerías con identificadores opacos |
| GET | `/v1/galleries/{id}` | Token; fotografías y subcarpetas |
| GET / HEAD | `/v1/images/{id}` | Token; bytes de un archivo indexado |

No hay rutas para borrar, subir, elegir carpetas, servir código del proyecto ni acceder al servidor web. No se exponen rutas absolutas. Se omiten archivos ocultos, enlaces simbólicos y tipos ajenos a imágenes. Cada lectura vuelve a validar su ubicación y usa un descriptor con `O_NOFOLLOW`. Respuestas sin caché y acceso con `Origin` rechazado. El token no autoriza escritura.

Diseñado para una LAN doméstica y carpetas controladas por el usuario. No abrir puertos en el router, publicar mediante túneles ni elegir carpetas que otro proceso no confiable pueda alterar durante la lectura. El acceso autenticado abarca todas las carpetas elegidas; no hay permisos por dispositivo. El pin requiere comparar la huella correctamente. El certificado local no usa una autoridad certificadora pública; la identidad se verifica por su huella. [Referencia Apple sobre evaluación manual de confianza](https://developer.apple.com/documentation/Foundation/performing-manual-server-trust-authentication).

## Comprobaciones reproducibles

Desde la raíz:

```bash
node --test test/tv-server.test.js

# Si xcode-select apunta solo a CommandLineTools:
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
xcodebuild -project tvos/ImageViewerPro.xcodeproj -scheme ImageViewerPro \
  -sdk appletvsimulator -destination 'generic/platform=tvOS Simulator' \
  -derivedDataPath /tmp/image-viewer-pro-build CODE_SIGNING_ALLOWED=NO build
xcodebuild -project tvos/ImageViewerPro.xcodeproj -scheme ImageViewerPro \
  -sdk appletvos -destination 'generic/platform=tvOS' \
  -derivedDataPath /tmp/image-viewer-pro-device CODE_SIGNING_ALLOWED=NO build

# Integración real de URLSession/pinning del cliente Swift con el servidor Node,
# ejecutada en macOS. No equivale a una prueba de la interfaz tvOS.
xcrun swiftc -parse-as-library tvos/ImageViewerPro/Network.swift \
  test/NativeClientSmoke.swift -o /tmp/ivp-native-smoke
NATIVE_SMOKE_BINARY=/tmp/ivp-native-smoke node --test test/tv-server.test.js
```

Las pruebas crean certificados y archivos temporales, escuchan solo en loopback y limpian al terminar. Cubren código erróneo/caducado/de un solo uso, bloqueo de intentos, token ausente/caducado/revocado, catálogo restringido, archivos ocultos, escape mediante enlaces (incluyendo sustituciones después de indexar), lectura/HEAD, rechazo de escritura, rutas antiguas y acceso desde navegador. El smoke Swift comprueba la huella real, rechazo de un pin incorrecto, vinculación y descarga autenticada.

### Prueba manual pendiente en Apple TV

- Vincular; comprobar que no admite código erróneo ni huella distinta.
- Abrir dos carpetas, una vacía y otra con subcarpetas; verificar foco y regreso a la galería.
- Abrir JPEG/PNG/HEIC, avanzar/retroceder, reproducir/pausar desde Siri Remote y botones; verificar intervalos, vuelta al inicio y presentación de una sola imagen.
- Salir al inicio de tvOS y volver; debe estar pausada. Cerrar el visor debe restaurar el reposo normal.
- Desconectar Wi-Fi/apagar servidor: mostrar error, permitir volver y reintentar.
- Ejecutar `revoke`, actualizar y comprobar error de sesión; volver a vincular.
- Sustituir/eliminar una imagen mientras está abierta: error de lectura sin salir de la app.

## Alcance y limitaciones

Implementado: JPEG, PNG y HEIC (hasta 50 MiB por archivo), subcarpetas recursivas, foco nativo, visor ajustado a pantalla y presentación circular. La compatibilidad HEIC depende del decodificador del dispositivo. Se reducen imágenes al tamaño de TV (máximo 3840 px) y miniaturas a 600 px, pero se descargan originales completos: no hay miniaturas de servidor, paginación, precarga ni caché compartida. El indexado es recursivo por petición; bibliotecas grandes pueden tardar o superar el timeout de 20 s. Si una imagen falla, muestra el error; se puede avanzar manualmente. La presentación espera una imagen cargada antes de contar el intervalo.

Pendiente: Google Drive, sincronización de favoritos, videos, GIF animado, zoom, orden aleatorio, Bonjour, reconexión automática, icono/Top Shelf y preparación para App Store. No hay despliegue ni publicación.

Validación en este entorno: compilación para tvOS Simulator y tvOS físico sin firma, pruebas Node e integración Swift de red en macOS. No hay runtime de tvOS instalado ni Apple TV físico disponible: el funcionamiento visual, los permisos del dispositivo y la navegación real con Siri Remote quedan pendientes de la prueba manual anterior.
