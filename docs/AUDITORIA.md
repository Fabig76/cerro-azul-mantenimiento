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
