# Notas de Moodle y del navegador

Estado de cada hipótesis: **sin verificar**, **confirmada** o **refutada**, con fecha y evidencia.
Ninguna se da por hecha en el código.

## Sitio

- `https://www.udbvirtual.edu.sv/auladigital/`, Moodle 2020110908.07 (~3.10.x), tema Klass, interfaz en español.

## Hipótesis

| Id  | Hipótesis                                                                                      | Estado        | Evidencia                                                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| H1  | `mod/resource/view.php?id=X&redirect=1` redirige a `pluginfile.php`                            | confirmada    | Curso 49946, cmid 2229872, 2026-09-29: termina en `pluginfile.php` (Brave, "Probar hipótesis")                                              |
| H2  | La URL de recurso lleva revisión: `/pluginfile.php/<ctx>/mod_resource/content/<rev>/<archivo>` | parcial       | El segmento existe pero vale **0** (curso 49946). No sirve sola para detectar cambios: la huella debe usar tamaño, `Last-Modified` y `ETag` |
| H3  | `fetch` desde service worker/offscreen envía la cookie de sesión                               | sin verificar | Pendiente de Opciones > Diagnóstico en Brave (M0)                                                                                           |
| H4  | `pluginfile.php` acepta HEAD                                                                   | confirmada    | HEAD 200 con `Content-Length` 341955, `application/pdf` y nombre en Content-Disposition (curso 49946)                                       |
| H5  | Sección Onetopic: `course/view.php?id=<id>&section=<n>`; pestañas atenuadas = no disponibles   | parcial       | URL confirmada (curso 49946): 10 pestañas, sufijo `#tabs-tree-start`. Pestañas atenuadas sin verificar (0 en ese curso)                     |
| H6  | `mod_folder` muestra un árbol con un enlace `pluginfile` por archivo (sin revisión fiable)     | sin verificar | Sin carpetas en el curso probado. Confirmada solo contra el simulador                                                                       |

## Checkpoint M2: hipótesis en el sitio real

Resultado (Brave, curso 49946, 2026-09-29, 2 peticiones): H1, H4 confirmadas; H2 parcial (revisión 0);
H5 confirmada para las URL; H6 sin datos. El Diagnóstico sin `?section=` identificó la sección
mostrada por la miga de pan, como se esperaba.

Pendiente: repetir en un curso con carpeta (H6) y con semanas atenuadas (H5).

En un curso con recursos (y, si es posible, una carpeta): icono de la extensión > **Probar hipótesis
(H1, H2, H4-H6)** > Continuar. Hace como máximo 4 peticiones, con pausas, y guarda
`Descargas/UDB/_diagnostico/hipotesis-<fecha>.json`. Copiar aquí el resultado de cada hipótesis.

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
| A (Onetopic 2 niveles) | sí (49946)       | sí                   |
| A (pestañas atenuadas) | no               | no                   |
| B (temas)              | sí (50454)       | sí (sin cambios)     |

Hallazgos del sitio real (2026-09-29):

- Onetopic: fila de nivel 1 y fila de nivel 2 **separadas** (`.onetopic-subtabs_body`), no anidadas.
- La pestaña activa (de cada nivel) **no tiene `href`**. Su número sale de `?section=`, de la miga
  `aria-current` o de la única sección renderizada.
- El nivel 1 con hijos ("Contenido") es un grupo; su contenido es la primera subpestaña (`tab_initial`,
  "Inicio").
- Nombre en `innertab > span.sectionname`; la marca ★ es la clase `marker` en `<innertab>`.
- `href` de pestaña con `#tabs-tree-start`; la miga del curso apunta a `section=0`.
- Recursos sin `.resourcelinkdetails` (no hay pista de tamaño/tipo en la página).
- El saneador no dejó datos personales en ninguno de los dos informes.

## Compatibilidad del navegador (M0)

Ejecutar en Brave (perfil dedicado, sesión iniciada en el Aula Digital):
Opciones > Diagnóstico. Copiar aquí el JSON de cada botón.

| Prueba                                       | Brave         | Chrome        | Edge          |
| -------------------------------------------- | ------------- | ------------- | ------------- |
| Documento offscreen (DOM_PARSER)             | sin verificar | sin verificar | sin verificar |
| Descarga con `chrome.downloads` a subcarpeta | confirmada    | sin verificar | sin verificar |
| `downloads.open` desde página (gesto)        | sin verificar | sin verificar | sin verificar |
| `downloads.open` desde worker (sin gesto)    | sin verificar | sin verificar | sin verificar |
| Sesión en `fetch` del worker (H3)            | sin verificar | sin verificar | sin verificar |
| Sesión en `fetch` del offscreen (H3)         | sin verificar | sin verificar | sin verificar |

Cómo leer el resultado de H3: `sessionSent: true` y `finalUrl` en `/auladigital/my/` indican que la cookie
viajó. `finalUrl` en `/login/index.php` indica que no (plan B: hacer esas peticiones desde el content script).

Verificado en CI solo contra el servidor simulado: offscreen responde; el cableado de H3 funciona.
