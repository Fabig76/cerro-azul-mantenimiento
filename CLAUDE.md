# Portal Cerro Azul

Lee `docs/SPEC.md` antes de cualquier tarea. El SPEC manda sobre el código.

## Stack
- `web/`: HTML, CSS y JavaScript sin compilación; se publica en GitHub Pages.
- `apps-script/`: Google Apps Script (V8), sincronizado con `clasp`.

## Reglas no negociables
- Nunca subir al repo ids de hoja, ids de carpetas, CSV/XLSX, credenciales ni datos personales.
- Toda llamada a la API: POST sin cabeceras, cuerpo `{action, token, payload, requestId}`.
- Toda autorización se decide en `Auth.gs`; el frontend solo oculta botones.
- Nada de lógica atada a nombres o códigos de secciones: el árbol es genérico.
- Toda escritura con `LockService` y en lote; toda transición escribe auditoría.
- El portal público solo lee lo precalculado; probar el filtro de privacidad.
- Insertar texto con `textContent`, nunca `innerHTML`.
- Colores solo con variables de `css/tokens.css`; probar claro y oscuro.
- Español de Colombia; fechas en `America/Bogota`.
