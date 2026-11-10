# Sistema visual del Portal Cerro Azul

Este documento es la referencia obligatoria de la interfaz. Si algo no está aquí, se resuelve
copiando el patrón más parecido de `web/estilo.html`, no inventando uno nuevo.

Referencia de origen: el plan del Consultorio Jurídico (`consultorio-juridico-2026-3.html`).
De ahí vienen la paleta índigo/cian, los halos del hero, los chips de vidrio y las tarjetas.

## 1. Reglas que no se negocian

1. **Tema claro por defecto.** El oscuro existe (conmutador `Claro / Oscuro`) pero es secundario;
   toda pantalla nueva se revisa primero en claro.
2. **Cero estilos en línea.** Ni `style="..."` ni bloques `<style>`. La CSP los bloquea: un estilo
   en línea simplemente no se aplica. Todo va en `web/css/`.
3. **Cero emoji.** En equipos sin fuente de color salen como cuadros. Se usan iconos SVG de trazo
   (`stroke-width` 1.8, `currentColor`) o nada.
4. **Cero `innerHTML` con datos.** El texto se inserta con `textContent`.
5. **Cero librerías nuevas** sin justificarlo: el sitio es HTML, CSS y JS sin compilación.
   Excepción legítima: los valores dinámicos (ancho de una barra de avance) se fijan con
   `elemento.style.width` desde JavaScript. Eso es CSSOM y la CSP no lo bloquea; lo prohibido es el
   atributo `style=""` escrito en el HTML.
6. **Todo color sale de un token.** Si un tono no existe en `tokens.css`, se agrega allí con nombre
   semántico; nunca un hexadecimal suelto en `base.css` o `app.css`.
7. **Español de Colombia**, fechas en `America/Bogota`, cifras con separador de miles.

## 2. Paleta

| Token | Claro | Uso |
| --- | --- | --- |
| `--ink` | `#0f172a` | Texto principal |
| `--muted` | `#5b6b84` | Texto secundario, descripciones |
| `--line` | `#e3e8f0` | Bordes y separadores |
| `--bg` | `#f5f7fb` | Fondo de página |
| `--card` | `#ffffff` | Superficie de tarjetas |
| `--card-2` | `#f8fafc` | Superficie interior (inputs, filas) |
| `--brand` | `#4f46e5` | Índigo: enlaces, kicker, foco |
| `--brand2` | `#0ea5e9` | Cian: extremo del degradado |
| `--brand-soft` | `#eef2ff` | Fondo de insignias y notas |
| `--ok` | `#0ea371` | Cumple, al día |
| `--warn` | `#d97706` | Atención, próximo a vencer |
| `--danger` | `#dc2626` | Crítico, rechazado |

Cada estado tiene su par `-soft` (fondo) e `-ink` (texto): `--ok-soft` / `--ok-ink`.

**Degradados permitidos**

- Marca y botón primario: `linear-gradient(135deg, #6366f1, #06b6d4)`.
- Texto del hero: `linear-gradient(90deg, var(--hero-grad-1), var(--hero-grad-2))`.
- Barra de progreso: `linear-gradient(90deg, #10b981, #22d3ee)`.

## 3. Tipografía

Sin fuentes externas: `-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, ...`.

| Rol | Tamaño | Peso | Notas |
| --- | --- | --- | --- |
| Título del hero | `clamp(30px, 5vw, 52px)` | 800 | `line-height 1.06`, `letter-spacing -.02em` |
| Título de sección (`h2`) | `clamp(22px, 2.6vw, 29px)` | 800 | Con `kicker` encima |
| Título de tarjeta (`h3`) | 16.5px | 750 | |
| Cuerpo | 15–17px | 400 | `line-height 1.6` |
| Texto de tarjeta | 13.8px | 400 | Color `--muted` |
| Etiqueta / kicker | 12px | 700 | Mayúsculas, `letter-spacing .16em`, `--brand` |
| Insignia | 11.5px | 700 | Mayúsculas, `letter-spacing .04em` |
| Código | 11.5px mono | 400 | En una píldora con borde `--line` |

El **kicker** (rótulo en versalitas sobre el título) es la firma del sistema: toda sección nueva
lleva uno.

## 4. Estructura de página

```
<header class="hero">            degradado índigo→cian, halos y marca
  <div class="wrap"> … topbar, h1, lead, chips, stats
<div class="navwrap">            pegajosa, translúcida, con píldoras
  <nav class="barra">
<main>
  <section id="…">               padding 44px 0 8px
    <div class="wrap">
      <div class="sec-head">       kicker + h2 + p
      <div class="grid g2|g3|g4">  tarjetas
<footer class="pie">
```

- Contenedor: `.wrap` (máx. 1120px, 20px de margen lateral).
- Rejilla: `.grid` + `g2 g3 g4`; colapsa a 2 columnas en 900px y a 1 en 640px.
- El hero **no** lleva desvanecido hacia el fondo: termina en corte limpio.

## 5. Componentes

### Tarjeta
```html
<article class="card">
  <div class="icono"><svg …></svg></div>
  <h3>Título</h3>
  <p>Descripción en <code>--muted</code>.</p>
</article>
```
Radio 18px, borde 1px `--line`, sombra `--shadow`.

### Insignia de estado
```html
<span class="badge ok">Al día</span>
<span class="badge warn">Atención</span>
<span class="badge danger">Crítico</span>
<span class="badge info">Programada</span>
<span class="badge curso">En ejecución</span>
<span class="badge gray">Cancelada</span>
<span class="badge">Interno</span>
```

**Cada estado de una actividad tiene su color**, para no confundirlos de un vistazo:

| Estado | Clase | Color |
| --- | --- | --- |
| Programada | `info` | azul índigo |
| En ejecución | `curso` | violeta |
| Reportada | `warn` | ámbar |
| Aprobada / Cerrada | `ok` | verde |
| Rechazada | `danger` | rojo |
| Cancelada | `gray` | gris |

El gris queda reservado para lo que ya no está vivo. Las actividades borradas no se listan
(`actividadesListar` filtra `activo`), así que no necesitan color.

### Tarjeta de sección con acento

Cada tarjeta del panel tiene **su propio color**, no el de la pestaña: dos tarjetas del mismo
panel deben distinguirse. El color se declara por id en `css/app.css`:

```css
#tarjetaActividades { --acento: #4f46e5; --acento-suave: rgba(79, 70, 229, .12); }
[data-theme="dark"] #tarjetaActividades { --acento: #818cf8; }
```

La tarjeta toma `--acento` para el borde izquierdo (6 px), el contorno matizado y el título.
En oscuro **hay que declarar el tono claro**: los mismos colores sobre fondo negro pierden
contraste.

### Bloque de creación

El formulario de una tarjeta se separa con un bloque propio —borde verde, fondo verdoso y
título grande— para que no se confunda con la lista de lo ya creado:

```css
.form-actividad {
  border: 2px solid color-mix(in srgb, var(--ok) 40%, var(--line));
  border-top: 6px solid var(--ok);
  border-radius: var(--radius-m);
  background: color-mix(in srgb, var(--ok) 5%, var(--card-2));
}
.form-actividad .kicker { font-size: 17px; font-weight: 800; color: var(--ok-ink); text-transform: none; }
```

### Botones
```html
<button class="btn primary">Acción principal</button>
<button class="btn">Acción secundaria</button>
<button class="btn ghost">Terciaria</button>
<button class="btn primary bloque">Ancho completo</button>
```
Alto mínimo 40px (44px en móvil), radio 11px. Un solo `primary` por pantalla.

### Chip y cifra (banda del hero)
```html
<div class="chips"><span class="chip">Texto <b>destacado</b></span></div>
<div class="stats"><div class="stat"><div class="n">5</div><div class="l">secciones</div></div></div>
```

### Formulario
```html
<div class="campo">
  <label for="x">Correo electrónico</label>
  <input id="x" type="email" placeholder="nombre@correo.com">
</div>
```
La etiqueta va en mayúsculas de 12px `#64748b`. El foco pinta borde índigo y halo `--brand-soft`.

### Aviso
```html
<div class="msg ok|error|info" role="status">…</div>
```
Empieza oculto; se muestra agregando `.mostrar`. Nunca se usa solo el color: el texto dice qué pasó.

### Árbol
`ul.arbol` con `li > .fila-nodo` (`.nombre` + `.codigo` + `.pill`). Las ramas hijas van en un `ul`
anidado con línea guía a la izquierda.

### Estado vacío
`<div class="vacio">…</div>`: centrado, `--muted`, una frase corta.

## 6. Accesibilidad

- Contraste mínimo 4.5:1 en texto y 3:1 en elementos gráficos.
- Foco visible siempre (`outline` o halo); nunca `outline: none` sin reemplazo.
- Objetivos táctiles de 44px en móvil.
- El estado nunca depende solo del color: lleva texto o icono.
- `role="status"` y `aria-live="polite"` en los mensajes de resultado.

## 7. Cómo agregar una pantalla nueva

1. Parta de `web/estilo.html`: copie los bloques que necesite.
2. Si necesita un componente nuevo, primero hágalo con tokens existentes; si no alcanza, agregue el
   token en `tokens.css` y su bloque en el CSS de la página.
3. Revise en 390, 768 y 1280 px, en claro y oscuro.
4. Agregue el ejemplo del componente nuevo a `web/estilo.html`.
5. Actualice este documento con el componente.

## 8. Verificación rápida

```bash
# ningún estilo en línea, ni emoji, ni versión despareja
node tools/auditar-frontend.mjs
# llamadas a funciones que no existen
node tools/revisar-funciones.mjs
# lo que el navegador pinta de verdad (detalle de actividad, por estado)
./tools/prueba-pantalla.sh
```

Y antes de decir «publique y pruebe»: **comprobar que el despliegue terminó bien**.

```bash
gh run list --limit 1          # debe decir success
curl -s "$URL/css/app.css" | grep "lo que acabo de cambiar"
```

Una clase con `display` propio **anula el atributo `hidden`**: para ocultar algo se usa la clase
`.oculto`, o la regla global `[hidden] { display: none !important; }` de `base.css`.
