# Estructuras de curso

Observadas en capturas de 3 cursos. **Nada de esto está verificado contra el DOM real**
(TODO(verify-real-DOM)). El Diagnóstico de M1 lo confirmará; hasta entonces las fixtures son sintéticas
y siguen el marcado de Moodle 3.10 (renderers del núcleo y `format_onetopic`).

## Detección (`src/moodle/detect-layout.ts`)

1. Clase del `<body>`: `format-onetopic`, `format-topics`, `format-weeks`.
2. Sin clase conocida: pestañas con enlaces `course/view.php?...&section=N` ⇒ onetopic;
   elementos `li#section-N` ⇒ topics; si no, genérico.

La razón elegida se guarda en `detection.evidence` y aparece en el Diagnóstico.

## Estructura A: pestañas en dos niveles (`onetopic`)

- Nivel 1: "Planificación | Desarrollo" u "Organización | Desarrollo | Recursos Bibliográficos".
- Nivel 2 bajo "Desarrollo": "Semana 1 … Semana 18/19". Solo se renderiza la pestaña seleccionada.
- Se aceptan dos marcados para el nivel 2 (ambos con fixture):
  - fila `ul.nav-tabs` aparte, después de la del nivel 1 (pertenece a la pestaña activa);
  - fila anidada dentro del `<li>` de su pestaña padre.
- La subpestaña que repite al padre (mismo número de sección) se descarta.
- Pestañas de otro curso u otra página se ignoran.
- **Atenuada** (`dimmed`, `disabled`, `dimmed_text`, `aria-disabled` o sin enlace) ⇒ `available: false`,
  sin URL. Sin enlace ⇒ número de sección desconocido (`number: null`).
- **Destacada** (★): clase `marker`, `current` o `highlighted` en el enlace o su `<li>`.
- Secciones renderizadas sin pestaña (sección 0 sobre las pestañas) se listan primero.
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
