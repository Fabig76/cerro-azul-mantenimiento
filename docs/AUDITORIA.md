# Auditoría funcional del portal

Herramientas para verificar el sistema antes de una entrega o después de un cambio grande.

## 1. Comprobaciones automáticas (sin sesión, se pueden correr siempre)

```bash
node tools/revisar-columnas.mjs     # escrituras del código contra el esquema de la hoja
node tools/revisar-funciones.mjs    # llamadas a funciones que no existen
node tools/probar-puras.js          # lógica de salud, fechas, checklist y ritmo
node tools/auditar-frontend.mjs     # acciones, archivos y campos que el panel espera
./tools/prueba-pantalla.sh          # dibuja el detalle en cada estado y comprueba que haya input[type=file]
python3 tools/auditoria.py          # portal público y superficie de seguridad
```

```bash
node tools/prueba-api.mjs          # límites de tiempo y reintentos del cliente
node tools/prueba-datos.mjs        # listas compartidas: una sola llamada
node tools/contar-llamadas.mjs     # llamadas al entrar, por rol (meta: 6 y 4)
```

`revisar-funciones` y `prueba-pantalla` se agregaron después de que un refactor borrara
`bloqueFotos`: la sintaxis era válida y ninguna otra prueba lo notó, pero ningún contratista
podía subir una foto. La prueba de pantalla abre el detalle en PROGRAMADA, EN_EJECUCION,
RECHAZADA, REPORTADA y APROBADA con dobles de las dependencias, sin sesión.

Las cuatro deben terminar sin problemas. La última prueba también confirma que ninguna
acción privada responda sin sesión y que las de arranque sigan cerradas.

## 2. Niveles del sistema

| Nivel | Quién | Cómo se prueba |
| --- | --- | --- |
| Público | cualquier visitante | `tools/auditoria.py` |
| Contratista | cuenta activa | `tools/auditoria.py --contratista <token>` |
| Administrador | panel | `tools/auditoria.py --con-sesion <token>` |

Los dos últimos necesitan un token de sesión válido. Se obtienen ingresando al portal.

## 3. Módulos que cubre la auditoría

- Autenticación y sesiones (alta, validación, expiración, consentimiento de datos).
- Árbol de secciones y permisos por rama.
- Actividades: crear, editar, cancelar, iniciar, reportar, aprobar, acta.
- Etapas y checklist; avance reportado y aprobado.
- Evidencias: subida, rechazo de formatos, filtro de privacidad, fotos públicas.
- Novedades, alertas, lecturas de estado.
- Catálogo: tipos y plantillas con etapas sugeridas.
- Usuarios, empresas, KPIs, informes y respaldos.
- Portal público: snapshot, detalle por sección, fotos y semáforo.

## 4. Regla

Ninguna entrega se da por buena con una sola capa verde: hacen falta las cuatro
comprobaciones estáticas **y** el recorrido del nivel que se tocó.

## 5. Resultados de la auditoría del 1 de noviembre de 2026

| Nivel | Pruebas | Resultado |
| --- | --- | --- |
| Portal público y seguridad | 34 | 34 correctas |
| Administrador (lecturas) | 13 | 13 correctas |
| Administrador (ciclo completo) | 33 | 33 correctas |
| Contratista | 14 | 13 correctas, 1 hallazgo corregido |
| Escrituras contra el esquema | 81 | 0 inválidas |
| Frontend estático | 52 | 0 problemas |
| Lógica pura | 31 | 31 correctas |

### Hallazgos corregidos en esa auditoría

1. **El limitador de frecuencia podía bloquear de forma indefinida.** Su ventana se renovaba
   con cada llamada; ahora usa ventana fija por minuto.
2. **Una sesión podía existir sin autorización de datos.** Ahora `autenticar_` la exige en cada
   petición, no solo al ingresar.
3. **Había una cuenta pendiente con el correo del conjunto** (`admin@urbcerroazul.com`) que no
   correspondía a ninguna persona; se desactivó.
4. Las cuentas de prueba y los datos creados por la auditoría se retiraron al terminar.

### Cómo se ejecuta una auditoría con sesión

Las acciones `auditoria.sesion` y `auditoria.limpiar` **no quedan desplegadas**: se agregan al
router solo durante la auditoría y se retiran al terminar. El respaldo de ese código está en
`tools/auditoria-servidor.gs.bak`.

## 5 bis. Propuestas (v1.3)

El contratista propone y el administrador aprueba. Lo que hay que vigilar:

- **Portal público, KPI e informes no cambian** al crear propuestas pendientes: nada de eso lee la
  hoja `propuestas`. Comparar las cifras antes y después.
- **Al aprobar**, la actividad nace PROGRAMADA y `publicable`, así que aparece en el portal público
  en «próximos 30 días» **si su fecha de inicio cae dentro de esa ventana**. Si la fecha es lejana,
  la actividad existe pero el portal aún no la lista.
- **Una foto de la visita no vale como evidencia**: el control es por SHA-256 contra `evidencias` y
  contra las demás propuestas.
- **Purga**: solo se retiran las fotos a los 15 días; el texto se conserva.

## 5 ter. Antes de avisar que algo está publicado

El despliegue del frontend es un flujo de GitHub Actions (`Publicar portal`) y **puede fallar** sin
que el `git push` avise. Pasó el 10/11/2026: el flujo no adjuntó el artefacto y el sitio siguió
sirviendo la versión anterior durante minutos mientras el mensaje decía «publicado».

```bash
gh run list --limit 1                 # tiene que decir success
curl -s "$SITIO/css/app.css" | grep "texto que acabo de añadir"
curl -s "$SITIO/app.html" | grep -o 'app.css?v=[0-9]*'   # el número nuevo
```

Si el flujo falló: `gh run rerun <id>`. Si el CDN sirve la versión vieja, esperar y volver a consultar
con un parámetro distinto (`?q=$RANDOM`).

## 6. Desplegar el servidor sin el token caducable

`clasp` depende de un token que la política del Workspace de `urbcerroazul.com` invalida cada
pocos días (`invalid_rant`). La vía estable es el cliente OAuth propio:

```bash
cd ~/Documents/deepseek-harness/default-workspace/google-cerroazul
node desplegar.mjs          # sube apps-script/ y actualiza el despliegue del Web App
node desplegar.mjs --estado # solo comprueba el acceso
```

Requiere tres cosas, una sola vez:

1. `~/.config/dsh/google/oauth-client.json` con el cliente de escritorio.
2. Token con los alcances `script.projects` y `script.deployments`:
   `./pedir-permisos.sh` (pide también Drive y Gmail).
3. La **API de Google Apps Script habilitada** en el proyecto de Cloud
   `37422559984` (Consola → APIs y servicios → Biblioteca → Google Apps Script API).

Si falta el punto 3, la API responde `Apps Script API has not been used in project ... or it is disabled`.
