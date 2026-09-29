# Estructuras de curso

Verificado con informes de Diagnóstico reales (fixtures en `tests/fixtures/moodle/real/`):
onetopic de dos niveles (curso 49946) y temas (curso 50454). **Sin verificar** (TODO(verify-real-DOM)):
pestañas atenuadas, secciones o actividades restringidas/ocultas, formato semanas.

## Detección (`src/moodle/detect-layout.ts`)

1. Clase del `<body>`: `format-onetopic`, `format-topics`, `format-weeks`.
2. Sin clase conocida: pestañas con enlaces `course/view.php?...&section=N` ⇒ onetopic;
   elementos `li#section-N` ⇒ topics; si no, genérico.

La razón elegida se guarda en `detection.evidence` y aparece en el Diagnóstico.

## Estructura A: pestañas en dos niveles (`onetopic`)

- Nivel 1: "Planificación | Desarrollo" u "Organización | Desarrollo | Recursos Bibliográficos".
- Nivel 2 bajo "Desarrollo": "Semana 1 … Semana 18/19". Solo se renderiza la pestaña seleccionada.
- Marcado real: `.single-section.onetopic > ul.nav-tabs` (nivel 1) y
  `.content-section > .onetopic-subtabs_body > ul.nav-tabs` (nivel 2), seguido de `ul.topics` con la
  sección mostrada. Se acepta también un nivel 2 anidado dentro del `<li>` padre (prueba en línea).
- Cada pestaña: `a.nav-link[href][title] > innertab.tab_content.tab_level_N > span.sectionname`.
- **La pestaña activa no tiene `href`**: su número sale de `?section=`, de la miga `aria-current` o de la
  única sección renderizada.
- **Nivel 1 con hijos = grupo**: no se lista; su contenido es la primera subpestaña (`tab_initial`,
  p. ej. "Inicio"), que lleva el grupo como padre. Solo se ven los hijos del grupo activo; los demás
  grupos aparecen como una sección hasta que se abran (M5).
- Se quita el sufijo `#tabs-tree-start` de las URL.
- Pestañas de otro curso u otra página se ignoran.
- **Atenuada** (`dimmed`, `disabled`, `dimmed_text`, `aria-disabled` o sin enlace) ⇒ `available: false`,
  sin URL. Sin enlace ⇒ número de sección desconocido (`number: null`).
- **Destacada** (★): clase `marker` (real: en `<innertab>`), `current` o `highlighted` en el enlace, su
  `<li>` o sus descendientes.
- Secciones renderizadas sin pestaña se listan primero (no ocurre en el sitio real: "General" es una
  pestaña).
- Ruta: `{base}/{curso}/{padre}/{sección}/{archivo}`.

## Estructura B: página única (`topics`, `weeks`)

- Todas las secciones `li#section-N` en una página; todas comparten la URL del curso (1 petición).
- No disponible: clase `hidden`, o aviso de restricción sin actividades.
- Destacada: clase `current`.
- Ruta: `{base}/{curso}/{sección}/{archivo}`.

## Genérico

- Agrupa enlaces `/mod/<tipo>/view.php?id=N` bajo el encabezado `h2`-`h5` anterior más cercano.
- Secciones sin actividades se omiten; los números son posiciones.

## Actividades (`src/moodle/activities.ts`)

- Tipo: clase `modtype_<tipo>` y, si falta, el segmento `/mod/<tipo>/` del enlace. **Nunca** el icono.
- `cmid`: `id="module-N"`, `data-id` o el parámetro `id` del enlace.
- Nombre: `.instancename` sin los sufijos `.accesshide` (" Archivo", " Carpeta"…). Etiquetas: su texto,
  máx. 120 caracteres.
- Sin enlace ⇒ `available: false` (restringida u oculta). Aviso `.availabilityinfo` ⇒ `restricted: true`.
- `.resourcelinkdetails` ("1.2MB Documento PDF") se guarda solo como pista (`detailsHint`).
- Candidatas a descarga: `resource` y `folder`.

## Selectores

Todos viven en `src/moodle/selectors.ts`, con alternativas (gana la primera que encuentra algo).
