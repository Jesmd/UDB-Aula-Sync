<p align="center">
  <img src="docs/logo.svg" width="160" height="160" alt="Carpeta azul con un birrete y una flecha amarilla que entra en ella, con las letras UDB">
</p>

<h1 align="center">UDB Aula Sync</h1>

<p align="center">
  Guarda el material de tus cursos del Aula Digital de la UDB en carpetas ordenadas, sin descargar
  lo mismo dos veces.
</p>

<p align="center">
  <img alt="Manifest V3" src="https://img.shields.io/badge/Manifest-V3-0b5cad">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178c6">
  <img alt="Navegadores" src="https://img.shields.io/badge/Brave%20%7C%20Chrome%20%7C%20Edge-116%2B-555">
  <img alt="Licencia MIT" src="https://img.shields.io/badge/licencia-MIT-green">
</p>

> Versión 1.0.0. Es un proyecto personal de un estudiante, no una herramienta oficial de la UDB, y no
> está en la Chrome Web Store.

## Qué hace

Cada semana el Aula Digital acumula presentaciones, guías y PDF, y al final del ciclo terminan todos
revueltos en la carpeta de Descargas con nombres como `archivo(3).pdf`. Esta extensión los guarda
con el nombre de la actividad, dentro de una carpeta por curso y por semana:

```text
Descargas/
└─ UDB/
   └─ Estadística Aplicada ESA501 G01T/
      └─ Desarrollo/
         └─ Semana 12/
            └─ Presentación Semana 12.pptx
```

Lo que puedes hacer con ella:

- Hacer clic en un archivo del curso: se descarga en su carpeta y se abre. Si ya lo tenías, lo abre
  sin volver a bajarlo.
- Pasar el cursor por encima para ver qué es, cuánto pesa y dónde se va a guardar.
- Bajar de una vez una sección o el curso entero. Antes de empezar te dice cuántos archivos son y
  cuánto pesan.
- Enterarte de lo que el docente sube. Revisa tus cursos cada 6 horas, pone un número en el icono y
  te avisa con una notificación. Si quieres, también lo descarga solo.
- Ver en cada archivo si es nuevo, si ya lo tienes o si cambió desde la última vez.

Funciona con la sesión que ya tienes abierta en el navegador. No guarda tu contraseña ni tus cookies,
no envía nada a ningún servidor y solo entra en `www.udbvirtual.edu.sv/auladigital`. Lo que el Aula
solo deja ver en su visor (sin archivo para descargar) queda marcado como "Solo lectura" y no se
toca. Más detalles en [privacidad](docs/PRIVACY.md) y [seguridad](docs/SECURITY.md).

## Instalar

La extensión no está en la tienda de Chrome, así que se instala a mano. Son dos minutos.

1. Descarga `udb-aula-sync-1.0.0.zip` desde la página de
   [versiones](https://github.com/Jesmd/UDB-Aula-Sync/releases/latest).
2. Descomprímelo en una carpeta que no vayas a borrar, por ejemplo `Documentos\UDB-Aula-Sync`. El
   navegador carga la extensión desde ahí cada vez que se abre.
3. En la barra de direcciones escribe `brave://extensions` (en Chrome `chrome://extensions`, en Edge
   `edge://extensions`).
4. Activa el "Modo de desarrollador", arriba a la derecha.
5. Pulsa "Cargar descomprimida" (según la versión se llama "Cargar extensión sin empaquetar"; en
   inglés, "Load unpacked") y elige la carpeta donde está el archivo `manifest.json`.
6. Fija el icono en la barra: pulsa la pieza de rompecabezas y luego el alfiler junto a UDB Aula Sync.

Antes del primer uso, en los ajustes de descargas del navegador desactiva "Preguntar dónde guardar
cada archivo". Si no, el navegador te preguntará por cada archivo y las carpetas no se crearán solas.

## Primeros pasos

1. Inicia sesión en el Aula Digital y abre un curso. Abajo a la derecha verás "UDB Aula Sync está
   activo" y el botón "Descargas del curso".
2. Haz clic en cualquier PDF del curso para probar: debería aparecer en `Descargas/UDB/<curso>/...`.
3. Abre "Descargas del curso" y pulsa "Descargar todo el curso". Hazlo una vez por curso: desde
   ese momento la extensión revisa ese curso sola.
4. Si algo no sale como esperas, en el icono de la extensión tienes la cola de descargas y un buscador
   de lo que ya bajaste.

Todo lo demás está en "Opciones" (clic derecho en el icono): cómo se nombran las carpetas, qué hacer
cuando un archivo cambia, qué tipos de archivo no bajar, cada cuánto revisar novedades y una copia de
seguridad de tus ajustes.

## Actualizar

1. Descarga el zip nuevo desde [versiones](https://github.com/Jesmd/UDB-Aula-Sync/releases/latest).
2. Descomprímelo encima de la carpeta anterior (reemplaza los archivos).
3. En `brave://extensions` pulsa el botón de recargar de UDB Aula Sync.

No hace falta quitar la extensión: tus ajustes y la lista de lo descargado se conservan. Si la quitas,
se borran; para no perderlos, usa antes Opciones > General > "Exportar".

## Preguntas frecuentes

### ¿Por qué pide activar el modo de desarrollador?

Es la única forma de instalar una extensión que no está en la tienda. Activarlo solo añade la opción de cargar extensiones desde una carpeta de tu equipo.

### ¿Puede ver mis notas, mensajes o contraseña?

No. Solo lee las páginas de los cursos para encontrar los archivos, y solo mientras tienes la sesión iniciada. Nunca inicia sesión por ti.

### Borré un archivo y quiero que vuelva

Pulsa "Descargar todo el curso" otra vez: baja lo que falta. Para que la extensión note los borrados por su cuenta, elige tu carpeta `Descargas/UDB` en Opciones > Carpeta. En Brave, primero activa `brave://flags/#file-system-access-api`.

### Un archivo aparece como "Solo lectura"

El Aula solo lo muestra en su visor y no ofrece un archivo para descargar. La extensión no intenta saltarse eso.

### Mi sesión caducó

La extensión se detiene y te avisa una sola vez. Vuelve a iniciar sesión y sigue donde quedó.

## Para desarrolladores

Requisitos: Node 22 y pnpm 10. En PowerShell de Windows usa `pnpm.cmd` si `pnpm` da un error de
ejecución de scripts. Después de `pnpm install` y `pnpm build`, carga la carpeta `dist/` como en el
paso 5 de la instalación.

| Comando         | Qué hace                                                   |
| --------------- | ---------------------------------------------------------- |
| `pnpm dev`      | Compila en modo observación a `dist/`                      |
| `pnpm build`    | Compila, audita el manifest y el tamaño del content script |
| `pnpm check`    | Typecheck, lint, formato y tests unitarios con cobertura   |
| `pnpm test:e2e` | Compila y ejecuta Playwright contra el Moodle simulado     |
| `pnpm mock`     | Arranca el Moodle simulado en `https://127.0.0.1:8443`     |
| `pnpm zip`      | Empaqueta `dist/` en `release/`                            |

Para publicar una versión, sube un tag `v<versión>` o ejecuta el workflow "Release" desde la pestaña
Actions: compila, pasa las pruebas y adjunta el zip a la página de versiones.

Documentación técnica: [arquitectura](docs/ARCHITECTURE.md), [decisiones](docs/DECISIONS.md),
[notas de Moodle](docs/MOODLE-NOTES.md), [estructuras de curso](docs/LAYOUTS.md) y
[pruebas](docs/TESTING.md).

## Licencia

MIT.
