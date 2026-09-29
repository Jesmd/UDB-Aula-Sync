# Notas de Moodle y del navegador

Estado de cada hipótesis: **sin verificar**, **confirmada** o **refutada**, con fecha y evidencia.
Ninguna se da por hecha en el código.

## Sitio

- `https://www.udbvirtual.edu.sv/auladigital/`, Moodle 2020110908.07 (~3.10.x), tema Klass, interfaz en español.

## Hipótesis

| Id  | Hipótesis                                                                                      | Estado        | Evidencia |
| --- | ---------------------------------------------------------------------------------------------- | ------------- | --------- |
| H1  | `mod/resource/view.php?id=X&redirect=1` redirige a `pluginfile.php`                            | sin verificar |           |
| H2  | La URL de recurso lleva revisión: `/pluginfile.php/<ctx>/mod_resource/content/<rev>/<archivo>` | sin verificar |           |
| H3  | `fetch` desde service worker/offscreen envía la cookie de sesión                               | sin verificar |           |
| H4  | `pluginfile.php` acepta HEAD                                                                   | sin verificar |           |
| H5  | Sección Onetopic: `course/view.php?id=<id>&section=<n>`; pestañas atenuadas = no disponibles   | sin verificar |           |
| H6  | `mod_folder` muestra un árbol con un enlace `pluginfile` por archivo (sin revisión fiable)     | sin verificar |           |

## Checkpoint M1: Diagnóstico en el sitio real

1. Abre un curso de cada estructura: A (pestañas), A con semanas atenuadas y B (página de temas).
2. En cada uno: icono de la extensión > **Diagnóstico de esta página**. Se guarda
   `Descargas/UDB/_diagnostico/diagnostico-curso-<id>-<fecha>.json`.
3. Revisa el archivo y envíalo. Contiene solo estructura: sin scripts, sin menú de usuario, mensajes,
   correos ni `sesskey`; el texto libre se sustituye por `[texto]`.
4. Con cada informe: `pnpm exec tsx scripts/sanitize-fixture.ts <informe.json> tests/fixtures/moodle/real/<nombre>.html`,
   añadir el caso al contract test y ajustar `selectors.ts`.

| Estructura             | Informe recibido | Selectores ajustados |
| ---------------------- | ---------------- | -------------------- |
| A (Onetopic 2 niveles) | no               | no                   |
| A (pestañas atenuadas) | no               | no                   |
| B (temas)              | no               | no                   |

## Compatibilidad del navegador (M0)

Ejecutar en Brave (perfil dedicado, sesión iniciada en el Aula Digital):
Opciones > Diagnóstico. Copiar aquí el JSON de cada botón.

| Prueba                                    | Brave         | Chrome        | Edge          |
| ----------------------------------------- | ------------- | ------------- | ------------- |
| Documento offscreen (DOM_PARSER)          | sin verificar | sin verificar | sin verificar |
| `downloads.open` desde página (gesto)     | sin verificar | sin verificar | sin verificar |
| `downloads.open` desde worker (sin gesto) | sin verificar | sin verificar | sin verificar |
| Sesión en `fetch` del worker (H3)         | sin verificar | sin verificar | sin verificar |
| Sesión en `fetch` del offscreen (H3)      | sin verificar | sin verificar | sin verificar |

Cómo leer el resultado de H3: `sessionSent: true` y `finalUrl` en `/auladigital/my/` indican que la cookie
viajó. `finalUrl` en `/login/index.php` indica que no (plan B: hacer esas peticiones desde el content script).

Verificado en CI solo contra el servidor simulado: offscreen responde; el cableado de H3 funciona.
