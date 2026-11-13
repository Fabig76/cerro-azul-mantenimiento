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

## Errores aprendidos

Cada uno costó un fallo en producción. No repetirlos.

1. **Un estado nuevo en una hoja con listas de exclusión se cuela en todos los cálculos.**
   `Snapshot.gs`, `Kpi.gs` e `Informe.gs` deciden con `!== 'CANCELADA'` o `indexOf(...) < 0`: un estado
   que no conocen pasa el filtro sin avisar y aparece donde no debe. Para flujos **previos a la
   aprobación** (propuestas, borradores), usa una **hoja aparte**, no un estado nuevo.

2. **Reemplazar un rango de texto puede llevarse funciones vecinas.** Un refactor borró
   `bloqueFotos` y el detalle siguió llamándola: la sintaxis era válida y ninguna prueba lo notó,
   pero ningún contratista podía subir una foto. Por eso existe `tools/revisar-funciones.mjs`.

3. **Un mensaje dentro de un contenedor oculto es lo mismo que no tener mensaje.** El aviso de las
   propuestas vivía en la tarjeta del administrador, que el contratista tiene oculta: el botón de
   enviar parecía muerto. Todo mensaje debe vivir donde el rol que lo provoca pueda verlo.

4. **Las pruebas que solo miran la API no ven la pantalla.** `tools/prueba-pantalla.sh` dibuja el
   detalle con dobles de las dependencias y comprueba lo que el usuario ve de verdad. Cuando una
   prueba usa un atajo distinto al camino real, no prueba nada: comparte la función, no la copies.

5. **Las columnas de auditoría no existen en todas las tablas.** Solo las que declaran
   `.concat(CAMPOS_AUDITORIA)`. `notificaciones`, por ejemplo, no tiene `activo`: se descarta con
   `estado = 'ERROR'`. `tools/revisar-columnas.mjs` lo verifica.

6. **`clasp` caduca por política del Workspace** (`invalid_rapt`). Despliega con
   `node google-cerroazul/desplegar.mjs`, que usa el cliente OAuth propio. Ver `docs/AUDITORIA.md`.

7. **Una clase con `display` anula el atributo `hidden`.** `.btn` define `display: inline-flex`, así
   que un botón con `hidden` se seguía viendo y el contratista veía «Nueva actividad». Se usa la clase
   `.oculto` o la regla global `[hidden] { display: none !important; }`.

8. **Una tarjeta con abrir y cerrar propio no puede depender del cambio de pestaña.** `mostrarPestana`
   pone visible **todo** lo que lleve `data-panel` de la pestaña activa. Si una tarjeta debe permanecer
   cerrada hasta que alguien la abra, necesita una marca aparte (`data-propia`) y el cambio de pestaña
   solo puede cerrarla, nunca abrirla.

9. **«Publique y pruebe» es una promesa, no un paso.** Un push no es un despliegue: el flujo de
   GitHub Pages puede fallar (`No artifacts named "github-pages"`), y el CDN sigue sirviendo la versión
   anterior varios minutos. Antes de avisar: `gh run list --limit 1` en verde y comprobar que el archivo
   publicado trae el cambio.

10. **Verificar el código no es verificar la pantalla.** Cuatro fallos seguidos pasaron las pruebas
    estáticas y se veían en el navegador. Hay que medir el **estilo calculado** y, cuando sea posible,
    comparar capturas antes/después (`tools/prueba-pantalla.sh`).

11. **Un cambio a la vez, con vuelta atrás lista.** Mezclar separar tarjetas + colores + visibilidad por
    rol hizo imposible saber qué rompió qué. Cada paso va en su commit y se revierte con `git revert`.

12. **Una lista sin paginación en pantalla es una lista que algún día esconde lo nuevo.** La lista de
    actividades pedía 20 y nunca la página siguiente, ordenadas por fecha de fin ascendente: las
    aprobadas y canceladas ocupaban los primeros puestos y un trabajo de hoy podía no aparecer.
    Toda lista que crezca necesita grupos, búsqueda y «ver más».

13. **Un aviso que se encola dos veces es un correo que se envía dos veces.** `encolar_` solo evita
    duplicados mientras la fila está PENDIENTE; para los avisos diarios hay que buscar en **cualquier
    estado** (`yaAvisado_`). Y todo envío necesita `LockService`: dos ejecuciones simultáneas leen las
    mismas filas y mandan el correo dos veces.
