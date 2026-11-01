# Auditoría funcional del portal

Herramientas para verificar el sistema antes de una entrega o después de un cambio grande.

## 1. Comprobaciones automáticas (sin sesión, se pueden correr siempre)

```bash
node tools/revisar-columnas.mjs     # escrituras del código contra el esquema de la hoja
node tools/probar-puras.js          # lógica de salud, fechas, checklist y ritmo
node tools/auditar-frontend.mjs     # acciones, archivos y campos que el panel espera
python3 tools/auditoria.py          # portal público y superficie de seguridad
```

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
