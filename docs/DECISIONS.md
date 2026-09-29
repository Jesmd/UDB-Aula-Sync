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

**Consecuencias.** Resultado pendiente de ejecutar en Brave; se registra en `MOODLE-NOTES.md`.

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
