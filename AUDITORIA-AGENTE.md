# Instrucciones para el agente — Correcciones de la auditoría del 31/10/2026

Repositorio: `fabig76/cerro-azul-mantenimiento` · Commit auditado: `65d819e` · SPEC vigente: `docs/SPEC.md` v1.2

## Cómo trabajar

1. Lee `CLAUDE.md` y `docs/SPEC.md` antes de empezar. El SPEC manda sobre el código.
2. Haz **un bloque por rama y por pull request**, en el orden de este documento. No mezcles bloques.
3. Antes de codificar cada bloque, escribe en el PR un resumen de 5 líneas con lo que vas a cambiar.
4. Cada tarea termina con su verificación (indicada abajo). Si una prueba no se puede automatizar, deja la lista manual en `docs/checklists/verificacion-<tarea>.md`.
5. Crea `docs/tasks.md` con todas las tareas de este documento y márcalas al terminar.
6. Los números de línea son del commit `65d819e`; ubica el código por el nombre de la función si cambiaron.

## Prohibiciones durante este trabajo

- **No ejecutes** contra producción ninguna de las acciones de arranque o diagnóstico (`setup.run`, `demo.crear`, `empresa.inicial`, `empresa.datos`, `usuario.inicial`, `diag.asignacion`, `salud.recalcular`, `snapshot.refrescar`, `disparadores.instalar`, `ajustes.aplicar`). Ejecutarlas cambia datos.
- **No hagas `push --force` ni reescribas el historial de git** sin aprobación escrita del administrador (ver tarea 1.2).
- No escribas en ningún archivo correos, NIT, cédulas, teléfonos ni ids de hojas o carpetas. Tampoco en mensajes de commit ni en descripciones de PR.
- No cambies el modelo de datos ni la API sin actualizar primero `docs/SPEC.md`.

---

## Bloque 1 · Cerrar la superficie pública (prioridad máxima, antes de cualquier otra cosa)

### 1.1 Quitar las acciones administrativas públicas (hallazgo C1)

**Problema:** en `apps-script/Router.gs` (líneas 12 y 55-70) diez acciones tienen `publica: true` y `doGet` (línea 95) ejecuta cualquier acción pública con un GET anónimo.

**Cambio:**
- Elimina del objeto `ACCIONES` estas entradas: `setup.run`, `demo.crear`, `empresa.inicial`, `empresa.datos`, `usuario.inicial`, `diag.asignacion`, `salud.recalcular`, `snapshot.refrescar`, `disparadores.instalar`, `ajustes.aplicar`, `snapshot.ver`.
- Sus funciones quedan solo para ejecutarse desde el editor de Apps Script. Si alguna debe seguir disponible desde el panel, regístrala con `sesion: true, roles: ['ADMIN']` (por ejemplo, `snapshot.regenerar`, que ya existe así).
- En `doGet`, atiende solo una lista explícita: `public.snapshot`, `public.foto` y `ping`. Cualquier otra acción responde `NO_ENCONTRADO`.
- En `doPost`, una acción con `publica: true` solo puede ser `ping` o `auth.*`.

**Verificación:**
- Prueba en `Tests.gs`: para cada una de las 11 acciones retiradas, `doGet({parameter:{action:X}})` y `doPost` responden `NO_ENCONTRADO`.
- Prueba: `doGet` con `auth.google` responde `NO_ENCONTRADO` o `NO_AUTENTICADO`, nunca ejecuta.

### 1.2 Sacar los datos personales del repositorio (hallazgo C2)

**Problema:** `EmpresaInicial.gs` (líneas 22 y 50), `UsuarioInicial.gs` (línea 9) y `Diag.gs` (línea 8) contienen un correo personal y un NIT de persona natural.

**Cambio:**
- Borra los tres archivos y sus referencias en el router (ya retiradas en 1.1). Su trabajo ya se ejecutó en producción.
- Agrega a `.gitignore` un patrón para scripts de uso único: `apps-script/_local*.gs`.
- **Reescritura del historial:** no la ejecutes. Deja en el PR una nota que explique al administrador las dos opciones: (a) reescribir con `git filter-repo` y forzar el push, o (b) aceptar que los datos queden en el historial. Espera su decisión.

**Verificación:** `git grep -nE "@gmail\.com|[0-9]{8,10}" -- apps-script web` no devuelve correos ni números de documento.

### 1.3 Proteger el arranque

**Cambio:** `setup()` solo se ejecuta desde el editor. En `Codigo.gs`, `arranqueProtegido` debe fallar siempre que `BOOTSTRAP_KEY` no esté definida y el sistema ya esté inicializado (eliminar la tolerancia de 3 ejecuciones de `SETUP_RUNS`).

**Verificación:** prueba con `SHEET_ID` definido y sin `BOOTSTRAP_KEY` que `arranqueProtegido` lanza `PROHIBIDO`.

---

## Bloque 2 · Ley 1581, permisos y pruebas base

### 2.1 Registro con autorización de datos (hallazgo C3)

**Cambio (backend):**
- `asegurarUsuario_` (`Auth.gs`, líneas 238-271) ya no crea usuarios. Si el correo no existe, `auth.google` y `auth.enlace.canjear` responden `{ estado: 'NO_REGISTRADO', registro_token }`. `registro_token` es un token de un solo uso en `CacheService` (30 min), atado al correo verificado.
- Nueva acción `auth.registrar` (pública): `{ registro_token, nombre, telefono, empresa_id | empresa_nueva{razon_social, nit}, acepta_datos: true }`. Valida, exige `acepta_datos === true` y crea el usuario PENDIENTE con `acepto_datos_en = ahora` y `acepto_datos_version = config('version_politica_datos')`. Escribe auditoría y crea una notificación al admin (ver 4.2).
- Se conserva la regla de `ADMIN_EMAILS` (sec. 6.2, punto 8).

**Cambio (frontend):**
- Formulario de registro en `app.html` con los campos y una casilla obligatoria: "Autorizo el tratamiento de mis datos personales según la política de tratamiento de datos de la Urbanización Cerro Azul", con enlace a la política. El botón "Enviar" queda deshabilitado sin la casilla.
- Páginas `web/legal/politica.html` y `web/legal/aviso.html`, con el contenido mínimo del art. 15 del Decreto 1377 de 2013: responsable, finalidades, derechos del titular y canal de atención. Deja marcados con `[COMPLETAR POR LA ADMINISTRACIÓN]` el correo de atención, la dirección y la fecha de vigencia. Enlázalas desde el pie de `index.html` y de `app.html`.

**Verificación:**
- Prueba: `auth.registrar` sin `acepta_datos` responde `VALIDACION`.
- Prueba: un registro válido deja `acepto_datos_en` y `acepto_datos_version` con valor.
- Prueba: un `registro_token` usado dos veces falla.

### 2.2 Las asignaciones se cierran el mismo día (hallazgo A2)

**Problema:** `usuariosAsignar` y `usuariosDesactivar` (`Usuarios.gs`) cierran con `hasta = hoy`, y `nodosAsignados_` (`Auth.gs`, línea 115) acepta `hasta >= hoy`.

**Cambio:** al cerrar una asignación, escribe `activo = false` además de `hasta = hoy`. `nodosAsignados_` exige `activo = true` (ya lo hace) y `hasta` vacío o `hasta > hoy`.

**Verificación:** prueba: asignar el nodo A, reasignar al nodo B el mismo día; `requireNodo_` sobre A lanza `PROHIBIDO`.

### 2.3 Separar "ver" de "ejecutar" (hallazgo M2)

**Problema:** `puedeVerActividad_` (`Actividades.gs`, líneas 18-30) da acceso a supervisores y a cualquier contratista de la misma empresa, y esa función se usa también para iniciar, reportar y subir fotos.

**Cambio:**
- Crea `puedeEjecutarActividad_(ctx, act)`: verdadero solo si el rol es ADMIN, o si el rol es CONTRATISTA y el nodo de la actividad está dentro de sus asignaciones vigentes. El supervisor nunca ejecuta.
- Úsala en `actividadesIniciar`, `reportesCrear` y `evidenciasUpload`. `puedeVerActividad_` queda solo para lectura.

**Verificación:** pruebas: un supervisor que intenta iniciar recibe `PROHIBIDO`; un contratista de la misma empresa sobre un nodo no asignado recibe `PROHIBIDO`.

### 2.4 Transiciones de estado dentro del bloqueo (hallazgo M3)

**Cambio:** en `actividadesIniciar`, `actividadesEditar`, `actividadesCancelar`, `reportesRevisar` y `novedadesResolver`, la lectura del estado, la validación y la escritura ocurren dentro de una sola llamada a `conBloqueo`. Antes de validar, limpia la caché de la hoja para leer el estado real. Las llamadas a Drive o MailApp quedan fuera del bloqueo (RN-16).

**Verificación:** prueba que simule dos inicios seguidos de la misma actividad: el segundo responde `ESTADO_INVALIDO`.

### 2.5 Pruebas base (hallazgo M5)

**Cambio:** crea `apps-script/Tests.gs` con `runAllTests()` sin dependencias externas: un mini `assert` y un resumen de pasadas y fallidas. Incluye desde ya las pruebas de los bloques 1 y 2, y las de la sec. 15.1 del SPEC que apliquen a lo existente: cálculo de salud, transiciones válidas e inválidas y filtro de privacidad del snapshot. Las pruebas no deben tocar la hoja de producción: usa datos en memoria o un libro de pruebas configurado por la propiedad `TEST_SHEET_ID`.

---

## Bloque 3 · Lo que ven los propietarios

### 3.1 Avance por sección con descendientes (hallazgo A1)

**Problema:** en `Snapshot.gs`, `agregadoDe` calcula `propios` con `a.nodo_id === nodo.id`, así que cada sección muestra 0 aunque haya actividades en sus subsecciones.

**Cambio:** filtra las actividades cuyo nodo esté en el subárbol (`ruta_ids + '/' + id` con el prefijo del nodo), igual que ya se hace con los elementos, y solo del mes actual (`fecha_fin_plan`).

**Verificación:** prueba: la suma de `mes.programadas` de las secciones de nivel 1 es igual a `resumen.mes.programadas`.

### 3.2 `public.foto` según RN-23 y miniaturas de 55 KB (hallazgo A3)

**Cambio:**
- `construirSnapshot` agrega `fotos_publicas: [ids]`. Solo incluye fotos con `publicable = true`, `contiene_personas = false` y de nodos no sensibles, como máximo una pareja ANTES/DESPUÉS por actividad.
- `publicFoto` lee el snapshot de caché y, si el id no está en `fotos_publicas`, responde `{"error":"no encontrada"}` sin leer hojas ni Drive.
- Si no hay `mini_file_id`, no sirve la original: responde "no encontrada".
- Contador `pubfoto_fallos:<id>`: si tras 3 intentos no se pudo guardar en caché, responde con `cacheable:false`.
- En `evidenciasUpload` (`Evidencias.gs`, línea 73) el límite de la miniatura pasa de 120 KB a 55 KB, y por encima se rechaza con `ARCHIVO_GRANDE`.
- En `web/js/fotos.js`, la miniatura sale a 640 px y calidad 0,5; si supera 50 KB se recodifica a calidad 0,4 y luego a 560 px (sec. 7.4 del SPEC).

**Verificación:** prueba: un id inexistente o no publicado no llama a `DriveApp`. Usa un doble de prueba que falle si se llama.

### 3.3 Snapshot sin regeneración simultánea (hallazgo M4)

**Cambio:**
- `snapshotPublico_` nunca reconstruye si el visitante no obtiene el bloqueo con `tryLock(0)`; en ese caso devuelve la última copia disponible aunque esté vieja.
- `regenerarSnapshot` escribe con `setValues` sobre la fila 1 existente, sin `clearContents` previo. Si el JSON supera 90 KB, lo parte en varias claves de caché.

### 3.4 Navegación por niveles y centro de alertas

**Cambio:**
- Nueva acción GET pública `public.nodo&id=` que devuelve un detalle precalculado del nodo: sus hijos con salud, su serie mensual, sus próximos y recientes. Un nodo sensible devuelve solo su fila agregada.
- En `index.html`/`publico.js`, ruta `#/nodo/:id` con migas de pan; las tarjetas de sección enlazan a ella.
- Ruta `#/alertas` con la lista de alertas vigentes, su línea de tiempo y el historial de 90 días plegado. La campana del encabezado lleva un contador de no vistas guardado en `localStorage` dentro de try/catch (sec. 8.2 del SPEC).

**Verificación:** manual en 390 px y 1280 px, en tema claro y oscuro: entrar a Áreas comunes, luego a una subsección, y volver.

---

## Bloque 4 · Operación

### 4.1 Editores de tipos y plantillas (hallazgo A5)

Implementa `tipos.guardar`, `plantillas.get`, `plantillas.guardar` (con versionado según RN-12) y `nodos.desactivar` (desactiva el subárbol, con confirmación y auditoría), con sus pantallas de la sec. 7.2. **Criterio:** el administrador crea un tipo "Panel solar" con su plantilla y un elemento de ese tipo sin tocar código.

### 4.2 Cola de correos (hallazgo A4)

Implementa RN-20:
- Las acciones escriben en `notificaciones` (estado PENDIENTE) y un disparador cada 5 minutos envía en lote, agrupando por usuario.
- Eventos: registro nuevo (al admin), cuenta activada, actividad asignada, recordatorio `config.recordatorio_dias` antes de `fecha_fin_plan`, reporte rechazado y avisos de vencimiento de contratos y pólizas (`config.dias_aviso_poliza`).
- El enlace de ingreso sigue enviándose en la misma petición.

### 4.3 Foto ANTES verificada en el tiempo (hallazgo M1)

- `evidenciasUpload` acepta momento ANTES solo con la actividad en PROGRAMADA.
- `actividadesIniciar` exige que las fotos ANTES se hayan subido como máximo `config.minutos_inicio_antes` (por defecto 30) antes, según la hora del servidor.
- En la pantalla de revisión, muestra la diferencia entre `fecha_captura` (EXIF) y `fecha_subida`.

### 4.4 Resto del SPEC

Implementa `empresas.panel` y la pantalla Empresas, `actividades.acta` (acta PDF), `lecturas.crear`, `auditoria.listar`, `config.get`, `novedades.editar` y `web/guia-contratistas.html`. Para la guía, deja espacios marcados para las fotos de ejemplo de un buen y un mal ANTES, que tomará la administración.

### 4.5 Hallazgos bajos

- **B1:** en `Router.gs`, la clave de idempotencia es `req:<hash del token>:<requestId>` y se consulta después de autenticar.
- **B2:** en `Evidencias.gs`, el SHA-256 se calcula siempre en el servidor con `Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes)` (sin el argumento de charset); se ignora el valor del cliente.
- **B3:** en `Utils.gs`, `tokenAleatorioHex` se construye solo con `Utilities.getUuid()` concatenados (mínimo 2), sin `Math.random`.
- **B4:** en `web/js/sesion.js`, todas las lecturas y escrituras de almacenamiento van en try/catch.
- **B5:** en `web/app.html`, reemplaza `'unsafe-inline'` de `style-src` por `https://accounts.google.com/gsi/style`; si el botón de Google deja de verse, revierte y documenta la excepción en `CLAUDE.md`.

---

## Al terminar cada bloque

- `runAllTests()` sin fallas.
- Despliegue de prueba: nueva versión del **mismo** despliegue del Web App (la URL `/exec` no cambia) y publicación de `web/`.
- Verificación manual en un celular en 4G, en tema claro y oscuro.
- Resumen en el PR: qué se cambió, qué pruebas se agregaron y qué queda pendiente.
- Agrega a la sección "Errores aprendidos" de `CLAUDE.md` la regla que habría evitado el hallazgo. Por ejemplo: "Nunca exponer en el router acciones de arranque o diagnóstico; esas funciones se ejecutan solo desde el editor".
