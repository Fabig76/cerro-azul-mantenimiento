# Traspaso del portal — Cerro Azul

Documento para que el sistema sobreviva a un cambio de administrador, de empresa o de
computador. Está escrito para que otra persona pueda hacerse cargo sin ayuda.

## 1. Qué es el sistema

| Pieza | Dónde vive | Quién es el dueño |
| --- | --- | --- |
| Portal público y panel | GitHub Pages: `Fabig76/cerro-azul-mantenimiento` | cuenta GitHub `Fabig76` |
| API | Google Apps Script (proyecto «Portal Cerro Azul») | cuenta `admin@urbcerroazul.com` |
| Datos | Google Sheets «Cerro Azul — Portal de Mantenimientos» | misma cuenta |
| Fotos, actas y respaldos | Google Drive, carpeta `/Portal` | misma cuenta |
| Correo del portal | `admin@urbcerroazul.com` | Google Workspace del dominio |

**Todo el sistema cabe en dos cuentas.** Si se pierde el acceso a alguna, se pierde el portal.

## 2. Traspaso en cinco pasos

1. **Entregar la cuenta de Google.** Transferir la contraseña y el segundo factor de
   `admin@urbcerroazul.com`, no solo cambiar el correo de recuperación. Sin entrar a esa cuenta no se
   ven ni los datos ni el código.
2. **Entregar el repositorio.** Agregar a la persona como colaborador con permisos de escritura en
   `Fabig76/cerro-azul-mantenimiento`, o transferir el repositorio a una cuenta institucional.
3. **Entregar la consola de Google Cloud.** El proyecto tiene el cliente OAuth del botón de Google.
   Agregar a la persona como propietario del proyecto en `console.cloud.google.com`.
4. **Leer este documento y el `docs/UF.md`** (sistema visual) antes de tocar nada.
5. **Hacer un respaldo y verificar que se puede restaurar** (sección 4).

## 3. Operación diaria

- **Ingreso:** `https://fabig76.github.io/cerro-azul-mantenimiento/app.html`
- **Portal público:** la raíz del mismo dominio.
- **Publicar un cambio:** hacer push a `main`. GitHub Actions republica en un minuto.
- **Cambiar el código del servidor:** `clasp push` desde `apps-script/` y luego
  `clasp update-deployment <id>`. El id del despliegue está en este repositorio, en el historial.
- **Regenerar la portada pública:** se hace sola cuando alguien entra y el dato tiene más de una
  hora.

## 4. Respaldo y restauración

- El respaldo es una **copia del libro** en `/Portal/Backups`, con fecha en el nombre. Se conservan
  las últimas ocho.
- Para restaurar: abrir la copia, y si el libro original se dañó, renombrar la copia y actualizar el
  valor `SHEET_ID` en las propiedades del script.
- **Prueba obligatoria:** una vez al año, restaurar una copia en un libro nuevo y confirmar que el
  portal abre con esos datos.
- Las fotos no se respaldan aparte: viven en Drive y siguen el ciclo de vida de la cuenta. Si se
  quiere una copia externa, se descarga la carpeta `/Portal/Evidencias`.

## 5. Qué NO está en el repositorio, a propósito

- El `SHEET_ID`, los ids de carpetas y las credenciales: están en las **propiedades del script**.
- Los datos de propietarios y contratistas: solo en el libro y en Drive.
- El archivo `.clasp.json` con el id del proyecto: está en la máquina del administrador, no en GitHub.

## 6. Riesgos conocidos

| Riesgo | Mitigación |
| --- | --- |
| Se pierde la cuenta `admin@urbcerroazul.com` | Segundo factor con teléfono de la copropiedad y una cuenta de respaldo con acceso al libro |
| Se llena la hoja de actividades | Archivo anual de actividades cerradas (acción `archivo.ejecutar`) |
| Google cambia una cuota | El sistema es de bajo volumen; el límite real es el tiempo de ejecución de la cuenta |
| El administrador cambia | Este documento y el respaldo con fecha |

## 7. Contactos técnicos

- Repositorio: `https://github.com/Fabig76/cerro-azul-mantenimiento`
- Especificación completa: `docs/SPEC.md` (v1.2)
- Sistema visual: `docs/UI.md`
