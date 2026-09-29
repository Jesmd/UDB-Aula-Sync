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
  cualquier otro host falla (ADR-002). **Nunca** contra el sitio real.

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
