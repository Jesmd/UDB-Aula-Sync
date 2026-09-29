# Estructuras de curso

Observadas en capturas de 3 cursos. **Nada de esto está verificado contra el DOM real**
(TODO(verify-real-DOM)); el Diagnóstico de M1 lo confirmará.

## Estructura A: pestañas en dos niveles (probable formato Onetopic)

- Nivel 1: "Planificación | Desarrollo" u "Organización | Desarrollo | Recursos Bibliográficos".
- Nivel 2 bajo "Desarrollo": "Semana 1 … Semana 18/19".
- Solo se renderiza la pestaña seleccionada: 1 petición por pestaña.
- Una semana con ★ (probablemente la actual). Futuras atenuadas y en cursiva (no disponibles).
- Migas: "Página Principal / Mis asignaturas / <código> / <sección>".
- Ruta: `{base}/{curso}/{padre}/{sección}/{archivo}`.

## Estructura B: página única por temas

- "General" (foro "Avisos" + "Planificación") y "Tema 1 … Tema 12".
- Ruta: `{base}/{curso}/{sección}/{archivo}`.

## Común

- Panel izquierdo con el índice del curso.
- Tipos: PDF, PowerPoint, ZIP, .pkt, tareas, foros, etiquetas. El tipo **nunca** se decide por el icono.
