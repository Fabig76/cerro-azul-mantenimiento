# Portal Cerro Azul

Lee `docs/SPEC.md` antes de cualquier tarea. El SPEC manda sobre el código.

## Stack
- `web/`: HTML, CSS y JavaScript sin compilación; se publica en GitHub Pages.
- `apps-script/`: Google Apps Script (V8), sincronizado con `clasp`.

## Diseño
- **Lee `docs/UI.md` antes de tocar la interfaz.** Es la referencia obligatoria del sistema visual.
- Los componentes viven en `web/css/{tokens,base,home,app}.css` y se demuestran en `web/estilo.html`.
- Sin librerías, sin compilación, sin estilos en línea (la CSP los bloquea) y sin emoji.
- Toda pantalla nueva se revisa en 390, 768 y 1280 px, en claro y en oscuro.

## Reglas no negociables
- Nunca subir al repo ids de hoja, ids de carpetas, CSV/XLSX, credenciales ni datos personales.
- Toda llamada a la API: POST sin cabeceras, cuerpo `{action, token, payload, requestId}`.
- Toda autorización se decide en `Auth.gs`; el frontend solo oculta botones.
- Nada de lógica atada a nombres o códigos de secciones: el árbol es genérico.
- Toda escritura con `LockService` y en lote; toda transición escribe auditoría.
- El portal público solo lee lo precalculado; probar el filtro de privacidad.
- Insertar texto con `textContent`, nunca `innerHTML`.
- Colores solo con variables de `css/tokens.css`; probar claro y oscuro (claro por defecto).
- Español de Colombia; fechas en `America/Bogota`.
