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

## ADR-016 "Abrir" dentro de un iframe de la extensión

**Contexto.** En Brave, el botón "Abrir" del aviso no abría el archivo. El botón vivía en la página de
Moodle y enviaba un mensaje al worker. `chrome.downloads.open` exige un gesto del usuario y el clic hecho en
la página no llega como gesto al worker. En M0 funcionó porque el clic venía de una página de la extensión.

**Decisión.** "Abrir" y "Mostrar en carpeta" son una pequeña página de la extensión (`src/open/index.html`)
enmarcada en el aviso. Su clic ocurre en contexto de extensión y llama a `chrome.downloads.open` directamente.

- La página solo recibe el id del archivo. Pide al worker su `downloadId` (`files/get`, solo para páginas de
  la extensión) y solo abre archivos del índice.
- Los tipos fuera de la lista blanca se muestran en su carpeta, nunca se abren.
- Se declara en `web_accessible_resources` solo para el origen del Aula Digital (`check-manifest` lo valida).
- El aviso reutiliza el mismo iframe entre actualizaciones (moverlo lo recargaría).

**Consecuencias.** Abrir tras una descarga nueva requiere un clic en "Abrir". Un archivo ya descargado se
intenta abrir al hacer clic en el enlace y, si el navegador lo impide, el aviso trae el mismo botón.

## ADR-017 Ajustes v2

**Contexto.** M4 añade modo del cursor, etiquetas de estado, filtros, intervalo de novedades y ajustes por
curso.

**Decisión.** `settings-schema.ts` pasa a `version: 2`.

- Campos nuevos: `hoverDetails` (`simple` | `tarjeta`), `showStatusBadges`, `filters`
  (`excludedExtensions`, `maxSizeMb`), `syncIntervalHours` (1–48) y `courses` (por id).
- Cada curso puede cambiar plantilla, secciones a omitir, extensiones excluidas y tamaño máximo. `null` o
  vacío hereda el valor general. `courseSettings()` combina ambos.
- `normalizeSettings()` valida campo por campo: un valor roto vuelve al predeterminado sin perder los demás.
  Así también migra los datos v1.
- Opciones guarda al instante y solo valores válidos. Un campo inválido muestra el error y no se guarda.

**Consecuencias.** `autoDownload` ya existe en el esquema, pero no se muestra hasta M5. Los filtros solo
aplican a "Descargar todo" y "Solo nuevos". Un clic sobre un archivo siempre lo descarga.

## ADR-018 Panel del curso en lugar de `section-button.ts`

**Contexto.** El árbol del §7 preveía `content/ui/section-button.ts`: un botón "Descargar sección" junto a
cada sección. En onetopic solo se ve una pestaña a la vez, y un botón por sección metía nodos dentro de la
página de Moodle.

**Decisión.** Se elimina `section-button.ts`. Un botón flotante "Descargas del curso" abre un panel
(`course-panel.ts`) en el host Shadow DOM con cuatro acciones: sección visible, todo el curso, solo nuevos y
reintentar fallidos. El panel también muestra el progreso y el plan.

**Consecuencias.** No se toca el DOM de Moodle, salvo el host de la UI. "Sección" significa las secciones que
muestra la página actual.

## ADR-019 Modos de descarga masiva y plan

**Decisión.**

- **Todo**: descarga `nuevo`, `actualizado` y `perdido_local`.
- **Solo nuevos**: descarga solo `nuevo`. Las actualizaciones esperan a "Todo" o a un clic.
- Antes de descargar hay un simulacro (`download/preview`) por archivo. El plan cuenta nuevos,
  actualizados, faltantes, sin cambios, solo lectura, omitidos, errores y secciones omitidas.
- Por debajo de 100 archivos y 200 MB empieza sin preguntar. Por encima pide confirmación.
- El escaneo pide cada pestaña disponible una sola vez (máximo 200 páginas). Nunca pide pestañas atenuadas
  ni restringidas. Una sesión caducada lo detiene todo antes de descargar nada.
- Las descargas del lote no muestran un aviso por archivo; el panel resume el progreso.

## ADR-020 Detalles al pasar el cursor

**Decisión.** Por defecto (`simple`), el cursor muestra una etiqueta pequeña. En modo `tarjeta` muestra la
tarjeta de detalles: tipo, nombre real, tamaño, destino, estado, "Descargar", "Copiar ruta" y, si ya está
descargado, "Abrir" y "Mostrar en carpeta" (el mismo iframe del ADR-016). Con el teclado, el foco sobre un
archivo abre la tarjeta en ambos modos; Esc la cierra.

**Consecuencias.** La tarjeta y las etiquetas de estado se dibujan en un segundo host con coordenadas del
documento. La página no se desplaza. Desde el teclado, los botones de la tarjeta no están en el orden de
tabulación de la página; Enter sobre el enlace descarga igual.

## ADR-021 Un único limitador en el content script

**Contexto.** La resolución al pasar el cursor y el escaneo del curso piden al mismo servidor.

**Decisión.** Todas las peticiones del content script pasan por un solo `createRateLimiter`: máximo 2 a la
vez, con 300–800 ms entre peticiones. `ResolveCache` usa por dentro un limitador sin límite, porque el
`fetch` que recibe ya está limitado.

**Consecuencias.** Pasar el cursor durante un escaneo espera turno. Nunca hay más de 2 peticiones
simultáneas desde la página.

## ADR-022 Seguimiento de cursos y primera sincronización a mano

**Contexto.** El §2 exige que la primera sincronización de un curso sea siempre manual.

**Decisión.** Un curso entra en seguimiento solo cuando el usuario usa "Descargar todo el curso" o "Solo
nuevos" en su página. Ese escaneo completo guarda la foto del curso (`snapshot/save`). "Descargar esta
sección" no cuenta. La búsqueda periódica y "Sincronizar ahora" solo revisan cursos con foto.

**Consecuencias.** Un curso nuevo del ciclo no se vigila hasta que el usuario lo abre y lo descarga una vez.
La foto guarda ids, nombres y disponibilidad, nunca HTML (`snapshots` en IndexedDB).

## ADR-023 Qué cuenta como novedad

**Decisión.**

- Un recurso o carpeta disponible que no estaba en la foto, o que estaba pero no se podía abrir.
- Una sección atenuada o restringida que se abre. Cuenta como una novedad propia solo si no trae nada
  descargable; si trae archivos, cuentan los archivos.
- No cuentan: renombres, actividades borradas, foros, tareas ni archivos que ya están en el índice.
- Una novedad dura hasta que se descarga o el usuario pulsa "Marcar como visto".
- **No** se revisa si cambió un archivo ya conocido. Haría 2 peticiones por archivo en cada búsqueda
  (unas 400 en un curso de 19 semanas). Los cambios de un archivo se detectan con "Descargar todo" o al
  pasar el cursor.

**Consecuencias.** Cada búsqueda cuesta 1 petición por pestaña disponible más 2 por actividad nueva.

## ADR-024 Búsqueda en segundo plano

**Decisión.**

- Alarma `udbsync-sync` cada `syncIntervalHours` (6 h por defecto). Se recrea solo si cambia el periodo.
- No corre sin red (`navigator.onLine`), con la pantalla bloqueada (`chrome.idle`) ni con descargas en
  curso. Queda pendiente y corre al desbloquear, al volver la red o al terminar las descargas.
- El worker no tiene DOM: pide cada curso al documento offscreen (`offscreen/sync-course`), que descarga y
  parsea con el mismo `moodle/scan.ts` del content script. Los cursos van de uno en uno.
- Todas las peticiones de segundo plano pasan por un limitador (2 a la vez, 300–800 ms) con reintento
  ante 429 y 5xx que respeta `Retry-After` (`core/http/polite-fetch.ts`). El content script usa el mismo.
- Una notificación agrupada por búsqueda, contador en el icono y marca "Nuevo" en la página.
- "Descargar novedades automáticamente" (por curso, apagado por defecto) encola solo las novedades y nunca
  las abre.

**Consecuencias.** La página y el segundo plano tienen limitadores separados. Si el usuario escanea un curso
justo durante una búsqueda periódica podría haber hasta 4 peticiones a la vez; es raro y breve. Depende de
H3 (la cookie de sesión viaja en el `fetch` del offscreen), aún sin verificar en Brave.

## ADR-025 Sesión caducada en segundo plano

**Decisión.** Si una búsqueda llega al login, se detiene en esa petición y muestra una sola notificación.
La cola de descargas comparte el mismo aviso. Desde entonces la búsqueda periódica no hace ninguna
petición hasta que una página del Aula Digital (que no sea el login) carga con la extensión activa.
"Sincronizar ahora" sí lo intenta, porque lo pidió el usuario.

## ADR-026 Verificador de carpeta (opcional)

**Contexto.** Una extensión no puede listar una carpeta cualquiera. `chrome.downloads.search` solo conoce lo
que ella descargó y su campo `exists` puede estar desactualizado (spec §5).

**Decisión.**

- En Opciones > Carpeta el usuario elige **una vez** la carpeta base (Descargas/UDB) con
  `showDirectoryPicker({ mode: 'read' })`. Chromium no deja elegir Descargas ni la carpeta personal, pero sí
  sus subcarpetas. Solo lectura: nunca se pide escritura.
- El handle se guarda en un almacén propio (`handles`, migración 1 → 2). El worker nunca lo lee: lee `meta`
  en bloque y quizá no pueda deserializar un handle. Solo sabe que hay carpeta por `folder:info`.
- El documento offscreen lee la carpeta (`offscreen/folder-scan`). Si el permiso vuelve a "preguntar" (el
  navegador puede pedirlo en cada sesión), no puede pedirlo sin un clic: devuelve `folder_permission` y
  Opciones muestra "Autorizar de nuevo".
- El worker guarda el listado un minuto (`FolderVerifier`) y lo usa así:
  - **Borrado:** un archivo del índice que falta en la carpeta queda "Falta en disco". No cuenta si la
    descarga es posterior al listado, si la ruta no está bajo la base o si el recorrido se cortó
    (20 000 elementos, 12 niveles).
  - **Adopción:** un archivo nuevo cuya ruta de destino ya existe con el mismo tamaño se indexa como
    "ya_existe" sin descargarlo. Con tamaño desconocido nunca se adopta.
- Sin carpeta, sin permiso o con cualquier error, todo sigue como antes (`chrome.downloads.search`).

**Consecuencias.** Un archivo adoptado no tiene descarga del navegador: "Abrir" no está disponible para él.
Brave trae la File System Access API desactivada; hay que activar `brave://flags/#file-system-access-api`.

## ADR-027 E2E de la carpeta con OPFS

**Contexto.** Playwright no puede manejar el diálogo nativo de elegir carpeta.

**Decisión.** El E2E usa una carpeta del sistema de archivos privado del origen (OPFS,
`navigator.storage.getDirectory()`). Es un `FileSystemDirectoryHandle` real con permiso de lectura concedido,
y se guarda donde Opciones guardaría la carpeta elegida. Así el offscreen, el worker y Opciones se prueban
con un handle de verdad. Las pruebas unitarias usan handles falsos. Elegir una carpeta real se prueba a mano.
