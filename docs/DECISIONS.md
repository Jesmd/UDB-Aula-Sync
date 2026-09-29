# Decisiones (ADR)

Formato breve: contexto, decisión, consecuencias. Una entrada por decisión; no se reescriben, se sustituyen.

## ADR-001 Stack y dependencias (M0)

**Contexto.** Extensión MV3 con presupuesto de 60 KB gz para el content script, core puro y pruebas sin el sitio real.

**Decisión.** Versiones fijadas (exactas) en `package.json`.

Runtime:

- `preact`: popup y opciones; ~4 KB gz. La UI inyectada no usa framework.
- `valibot`: esquemas de mensajes, ajustes e importaciones. Tree-shakable; mucho más pequeño que zod.
- `idb`: envoltorio de IndexedDB (~1 KB) con promesas y `upgrade` para migraciones.

Desarrollo:

- `typescript` 6.0: modo estricto. **No 7.0**: `typescript-eslint` 8 soporta `<6.1`.
- `vite` + `@crxjs/vite-plugin`: build multi-entrada MV3 desde `manifest.config.ts` tipado.
- `@preact/preset-vite` (+ `@babel/core` 7, dependencia peer): JSX de Preact.
- `@types/chrome`, `@types/node`: tipos.
- `vitest` + `@vitest/coverage-v8`: pruebas unitarias y umbral de cobertura del 90 % en `core/`.
- `jsdom`: DOM fiel para pruebas de UI y, desde M1, de adaptadores.
- `fake-indexeddb`: pruebas de repositorios y migraciones.
- `@playwright/test` 1.56.1: coincide con el Chromium 1194 preinstalado; carga la extensión en E2E.
- `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-config-prettier`, `globals`: lint con tipos.
- `prettier`: formato.
- `tsx`: ejecuta `scripts/*.ts` y el servidor simulado (que usa `node:https`, sin Express).
- `fflate`: zip puro en JS para `build-zip`.
- `@resvg/resvg-js`: rasteriza el SVG del icono a PNG.
- `@axe-core/playwright` se añadirá en M4.

**Consecuencias.** Cada dependencia nueva requiere una línea aquí.

## ADR-002 E2E con el host real mapeado al servidor simulado

**Contexto.** `host_permissions` y `matches` solo cubren `https://www.udbvirtual.edu.sv/auladigital/*`.
Las pruebas nunca deben tocar el sitio real.

**Decisión.** Chromium se lanza con
`--host-resolver-rules=MAP www.udbvirtual.edu.sv 127.0.0.1:8443, MAP * ~NOTFOUND`,
`--ignore-certificate-errors` y `--no-proxy-server`. El servidor simulado sirve HTTPS con un certificado
autofirmado generado con `openssl` en `tests/.cache/`.

**Consecuencias.** El manifest de pruebas es idéntico al de producción. Cualquier otro host falla al resolver,
así que una prueba no puede escaparse a Internet. Requiere `openssl` en la máquina de pruebas.

## ADR-003 Shadow DOM en modo `open`

**Contexto.** La UI inyectada debe aislarse del tema Klass. Con `closed`, Playwright no puede inspeccionarla.

**Decisión.** Host `div#udbsync-root` en `documentElement`, Shadow DOM `open`, estilos por
`adoptedStyleSheets` (no sujetos a `style-src` de la página) con `<style>` como alternativa.

**Consecuencias.** Los scripts de la página pueden leer la UI; no contiene secretos (solo nombres y rutas
que la página ya conoce). Todo texto se escribe con `textContent`; ESLint prohíbe `innerHTML`/`outerHTML`.

## ADR-004 `downloads.open` y el gesto del usuario

**Contexto.** Chrome solo permite `chrome.downloads.open` en respuesta a un gesto del usuario. Un clic en el
content script probablemente no se propaga al service worker.

**Decisión.** Flujo por defecto: la descarga la inicia el worker; la apertura se ofrece con un toast con botón
"Abrir". Si también falla, alternativas en orden: clic en notificación, `downloads.show`.
M0 añade en Opciones > Diagnóstico una prueba: abrir desde la página (con gesto) y desde el worker (sin gesto).
La ruta toast del content script → worker se comprueba en M3.

**Resultado (Brave, 2026-09-29).** La descarga a una subcarpeta funciona. `downloads.open` funcionó desde la
página y desde el worker, pero la prueba del worker se hizo justo después de un clic, así que no demuestra
que el worker pueda abrir sin gesto.

**Decisión final (M3).**

- Un archivo ya descargado y al día se abre al momento, dentro del gesto del clic.
- Un archivo nuevo se abre al terminar la descarga. Si el navegador lo impide (`blocked`), el aviso muestra
  "Abrir" y "Mostrar en carpeta"; su clic da un gesto nuevo al worker.
- Solo se abren tipos de la lista blanca. El resto (ejecutables, macros, comprimidos, formatos raros) se
  muestra en su carpeta (`downloads.show`).

## ADR-005 Versión mínima de Chrome 116

**Contexto.** Solo puede existir un documento offscreen; el candado usa `chrome.runtime.getContexts`.

**Decisión.** `minimum_chrome_version: "116"`.

## ADR-006 `web_accessible_resources` generados por CRXJS

**Contexto.** CRXJS carga el content script como módulo ES mediante un cargador y expone esos chunks al
origen `https://www.udbvirtual.edu.sv/*` (origen completo, no la ruta).

**Decisión.** Se acepta; `check-manifest` solo permite ese origen en `web_accessible_resources`.

**Consecuencias.** Una página de ese origen podría detectar que la extensión está instalada. No expone datos.

## ADR-007 Capa `browser-api`

**Decisión.** `src/shared/browser-api.ts` concentra las llamadas `chrome.*` compartidas (mensajería,
manifest). Facilita un posible port a Firefox; Firefox sigue fuera del alcance.

## ADR-008 El Diagnóstico exporta HTML saneado

**Contexto.** El checkpoint de M1 necesita la estructura real del sitio sin datos personales.

**Decisión.** Un único saneador (`src/moodle/sanitize.ts`) sirve al Diagnóstico y a
`scripts/sanitize-fixture.ts`. Sobre una copia del documento:

- elimina scripts, estilos, SVG y subárboles personales (menú de usuario, mensajes, pie con el nombre);
- conserva etiquetas, clases seguras y atributos de una lista blanca, además de los `id` con forma conocida (`section-N`, `module-N`…);
- conserva el texto solo en nombres (encabezados, secciones, actividades, pestañas, migas); el resto pasa a `[texto]`;
- en las URL deja la ruta y los valores numéricos de `id`/`section`/`redirect`, quita `sesskey` y los tokens, y reemplaza las rutas de usuario por `[personal]`;
- borra los correos también dentro del texto conservado.

El informe incluye además el resultado de `parseCoursePage`, para comparar lo detectado con la realidad.

**Consecuencias.** Un informe se convierte en una fixture real con un comando. Una prueba verifica que el
HTML saneado da exactamente el mismo resultado de análisis que el original.

## ADR-009 Diagnóstico desde el popup sin permiso `tabs`

**Contexto.** El popup necesita saber qué pestaña está activa. `tabs` y `activeTab` no están en la lista del §6.

**Decisión.** `chrome.tabs.query` sin `tabs` devuelve la URL solo de pestañas con permiso de host
(el Aula Digital), que es justo lo que hace falta. `chrome.tabs.sendMessage` no requiere permiso.
El content script solo responde a remitentes de la propia extensión que no son pestañas.

**Consecuencias.** Sin permisos nuevos. En cualquier otra pestaña el popup muestra "Abre un curso".

## ADR-010 Resolución de archivos con una sola petición

**Contexto.** Para saber qué archivo hay detrás de un recurso hacen falta su URL real y sus cabeceras
(nombre, tamaño, fecha, revisión), respetando el límite de peticiones.

**Decisión.** `resolveResource` hace `GET mod/resource/view.php?id=X&redirect=1` siguiendo redirecciones (H1).

- Si termina en `pluginfile.php`, esas cabeceras son la sonda y el cuerpo se cancela sin leerlo.
- Si no, busca el archivo dentro de la página: `object`, `iframe`, `embed` o el enlace `.resourceworkaround`. Después hace una sonda HEAD, con respaldo a un GET que se aborta tras las cabeceras (H4).
- Sin URL de archivo, el resultado es `readonly` y no se intenta nada más (§2).
- `mod_folder`: la estructura se toma de la ruta `pluginfile`, no del marcado del árbol (H6).
- El login, 429/503, otros códigos HTTP y los fallos de red se mapean a `session_expired`, `rate_limited`, `http_status` y `network`.

**Consecuencias.** El caso normal cuesta dos peticiones HTTP (vista + redirección), sin descargar el
archivo. El limitador y los reintentos llegan en M3 y envuelven al `fetch` inyectado.

## ADR-011 Adjuntos de la descripción de tareas: pospuesto

**Contexto.** `assign-intro.ts` es opcional en el §7. El Diagnóstico real no mostró adjuntos en tareas.

**Decisión.** Se deja el módulo vacío; la fixture explica el motivo. Se retomará si un informe real lo pide.

## ADR-012 Nombres de archivo

**Decisión.**

- `:` `/` `\` `|` pasan a " - " ("Guia 1: X" → "Guia 1 - X"); `<>"?*` y los caracteres de control o bidi se eliminan.
- NFC; sin punto ni espacio final; los nombres reservados de Windows reciben "_".
- Máximo 120 caracteres por segmento y 180 en la ruta. Se acortan primero las carpetas más largas; la extensión y el sufijo se conservan.
- La extensión sale del nombre en Content-Disposition, después de la URL y, si el tipo no es genérico, de Content-Type.
- Moodle envía UTF-8 sin codificar en `filename=`, que JS lee como Latin-1; se re-decodifica cuando los bytes forman UTF-8 válido. `filename*` tiene prioridad.
- Colisión: sufijo estable " (<cmid>)".
- Archivos de `mod_folder`: se conserva el nombre original, bajo una carpeta con el nombre de la actividad y sus subcarpetas.

## ADR-013 Cola de descargas persistente

**Contexto.** El service worker puede morir en cualquier momento. Una descarga de Chrome sigue viva aunque
el worker muera.

**Decisión.**

- Cada tarea se guarda en IndexedDB antes de cada acción. Estados: `en_cola` → `descargando` →
  `verificando` → `hecha` | `fallida` | `omitida`.
- Todo el trabajo (peticiones nuevas y eventos de `chrome.downloads`) pasa por una única cadena de
  promesas, para que nunca se intercale.
- `recover()` corre en cada arranque del worker:
  - sigue las descargas que el navegador conoce: las terminadas se verifican, las interrumpidas fallan;
  - reencola lo demás.
- Los reintentos esperan con backoff y `Retry-After`, y despiertan al worker con `chrome.alarms`.
- Límites: 2 descargas a la vez y 300-800 ms entre inicios.
- Verificación al terminar:
  - el archivo existe;
  - el tamaño coincide con `Content-Length`;
  - no es HTML si se esperaba otra cosa. Moodle manda la página de login cuando la sesión caducó; esa
    página se borra, porque la escribió la extensión, y la cola se pausa.
- Con la sesión caducada se avisa una sola vez. El siguiente clic resuelto la reanuda.
- La resolución la hace el content script (mismo origen, con cookies); el worker recibe la tarea ya resuelta.
  Así M3 no depende de H3.

**Consecuencias.** El E2E `sw-restart` mata el worker con 2 descargas en curso y 1 en cola, y comprueba que
terminan las 3 sin duplicados.

## ADR-014 Política de actualización por defecto: conservar ambas

**Contexto.** Un estudiante puede haber anotado el PDF. "Sobrescribir" perdería esas notas.

**Decisión.** Por defecto `conservar_ambas`: la versión nueva se guarda como "<nombre> (rev N).<ext>".

- "omitir" no descarga nada y abre la copia existente.
- "sobrescribir" reemplaza solo la descarga anterior de la propia extensión.
- Un archivo nuevo nunca pisa uno con el mismo nombre que la extensión no descargó (`uniquify`).

## ADR-015 Descargas en E2E y nombres con acentos

**Contexto.**

- Playwright intercepta las descargas (nombres GUID en su carpeta) e ignora la ruta que pide la extensión.
- En Linux con locale POSIX, Chromium rechaza nombres no ASCII ("Invalid filename").

**Decisión.**

- El E2E crea un perfil con `download.default_directory` apuntando a una carpeta temporal.
- Devuelve las descargas a Chromium con `Browser.setDownloadBehavior({ behavior: 'default' })`.
- Lanza Chromium con `LANG=C.UTF-8`.
- En la extensión, "Invalid filename" se trata como `file_rejected`: es final y no se reintenta.

**Consecuencias.** En Windows y macOS no aplica. En un Linux sin locale UTF-8 los nombres con acentos
fallarían con un mensaje claro. Si hiciera falta, se añadiría una opción de transliteración.
