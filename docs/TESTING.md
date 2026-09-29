# Pruebas

## Automáticas

```sh
pnpm check       # typecheck + lint + formato + unitarias con cobertura
pnpm test:e2e    # build + Playwright contra el Moodle simulado
```

- **Unitarias** (`tests/unit/`, Vitest): espejo de `src/core` y `src/moodle`. Umbral 90 % en `core/`.
  Las de UI usan `// @vitest-environment jsdom`.
- **Fixtures** (`tests/fixtures/moodle/`): sintéticas, marcadas `TODO(verify-real-DOM)`. Las reales,
  anonimizadas con `scripts/sanitize-fixture.ts`, irán a `tests/fixtures/moodle/real/`.
- **Contract tests** (`tests/unit/moodle/contract.test.ts`): cada adaptador cumple las mismas invariantes
  sobre su fixture. Cada fixture nueva se añade como un caso más.
- **Servidor simulado** (`tests/mock-moodle/`): HTTPS en `127.0.0.1:8443`. `state.requests` registra cada
  petición para comprobar límites y "cero peticiones con la sesión caída".
- **Integración** (`tests/unit/moodle/resolver.test.ts`, `hypotheses.test.ts`): el servidor simulado en
  HTTP y puerto libre (`startMockMoodle({ port: 0, tls: false })`); `fetch` de Node y jsdom como parser.
- **E2E** (`tests/e2e/`): Chromium con la extensión de `dist/`. El host real se mapea al simulador y
  cualquier otro host falla (ADR-002). **Nunca** contra el sitio real. El simulador se reinicia antes de
  cada prueba.
- **Novedades** (`sync-new.spec.ts`, `session-expired.spec.ts`): el simulador añade actividades y abre
  secciones (`/__test/activity`, `/__test/reveal`) y mide cuántas peticiones atiende a la vez
  (`maxInFlight`, nunca más de 2). La alarma se dispara creando `udbsync-sync` con `when` cercano.
- **Accesibilidad**: `@axe-core/playwright` con WCAG 2.1 A/AA en popup, opciones y la UI inyectada
  (`popup-options.spec.ts`, `download-all.spec.ts`).

## Manual (M5)

1. `git pull && pnpm install && pnpm build` y recarga la extensión.
2. **Primero H3:** Opciones > Diagnóstico > "Probar sesión en segundo plano (H3)". Envía el JSON. Si dice
   `"sessionSent": false`, la búsqueda en segundo plano no puede funcionar en Brave.
3. En un curso, pulsa "Descargar todo el curso". El popup debe decir "Sigue 1 cursos".
4. Popup > "Sincronizar ahora": debe decir "Sin novedades en 1 cursos".
5. Cuando el docente publique algo, "Sincronizar ahora" (o esperar 6 h) muestra el contador en el icono, una
   notificación y la marca "Nuevo" en la página.
6. Cierra sesión en el Aula Digital y pulsa "Sincronizar ahora": una sola notificación de sesión caducada.
   Al volver a iniciar sesión y abrir un curso, el aviso del popup desaparece.

## Manual (M4)

1. `git pull && pnpm install && pnpm build` y recarga la extensión en Brave.
2. En un curso, pulsa "Descargas del curso" (abajo a la derecha) y luego "Descargar esta sección". Revisa el
   plan y que los archivos lleguen a `Descargas/UDB/<curso>/...`. Las carpetas del curso conservan subcarpetas.
3. "Descargar todo el curso" en un curso con pestañas atenuadas: no debe pedir esas pestañas. Si el plan pasa
   de 100 archivos o 200 MB, pide confirmación.
4. Vuelve a pulsar "Solo nuevos": debe decir que no hay nada que descargar.
5. Junto a cada archivo aparece su estado. Con Tab sobre un archivo aparece la tarjeta; Esc la cierra.
6. Opciones > General > "Tarjeta de detalles": al pasar el cursor aparece la tarjeta.
7. Opciones > Cursos: escribe "Recursos Bibliográficos" en secciones a omitir y repite "Todo": la sección
   aparece como omitida.
8. Popup: estado de la cola, pausar y reanudar durante una descarga larga, búsqueda y "Abrir".

## Manual (M3)

1. `git pull && pnpm install && pnpm build` y recarga la extensión en Brave.
2. En un curso, pasa el cursor sobre un PDF (medio segundo) y haz clic: debe descargarse en
   `Descargas/UDB/<curso>/<pestaña>/<semana>/<actividad>.pdf` y abrirse. Si no se abre, el aviso muestra "Abrir".
3. Vuelve a hacer clic: no descarga otra vez; abre la copia.
4. Alt+clic: solo descarga. Ctrl+clic: comportamiento normal de Moodle.
5. Si algo falla, Opciones > Diagnóstico > "Exportar registro".

## Manual (M2)

Ver "Checkpoint M2" en `docs/MOODLE-NOTES.md`: "Probar hipótesis" en un curso con recursos y carpeta.

## Manual (M1)

Ver "Checkpoint M1" en `docs/MOODLE-NOTES.md`: Diagnóstico en un curso de cada estructura.

## Manual (M0)

1. `pnpm build` y carga `dist/` descomprimida en Brave (perfil dedicado).
2. Inicia sesión en el Aula Digital y abre un curso: debe aparecer el aviso "UDB Aula Sync está activo".
3. Abre el popup: "Servicio activo (versión 0.0.1)".
4. Opciones > Diagnóstico: pulsa cada botón y copia el JSON en `docs/MOODLE-NOTES.md`.
   - "Probar descarga y apertura" crea `Descargas/UDB/_prueba/udbsync-prueba.txt`.
   - "Probar sesión en segundo plano" hace **una** petición a `/auladigital/my/` desde el worker y otra
     desde el offscreen.
