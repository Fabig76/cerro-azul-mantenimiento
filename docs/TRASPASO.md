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

## 1 bis. Propiedad: el software y los datos son cosas distintas

Esta separación es deliberada y conviene mantenerla:

| Qué | De quién es | Dónde está |
| --- | --- | --- |
| **Software**: código, diseño, método, plantillas, sistema visual | De quien lo construyó (el administrador) | Repositorio personal `Fabig76/cerro-azul-mantenimiento` |
| **Información del conjunto**: libro, fotos, actas, historial | De la copropiedad | Cuenta de Google del conjunto, carpeta `/Portal` |

**Por qué así.**
- El administrador puede llevarse la herramienta a otro conjunto, replicarla o cobrarla como
  servicio; el código es su trabajo.
- La información no puede quedarse fuera de la copropiedad: la Ley 675 obliga a entregar los
  documentos de la administración al terminar el encargo, y la Ley 1581 pone en cabeza de la
  copropiedad el tratamiento de los datos de contratistas y de las imágenes.

**El riesgo de invertirlo.** Si el libro y las fotos vivieran en la cuenta personal del
administrador, el conjunto quedaría sin su historial el día que él se vaya, y él quedaría como
custodio de datos ajenos ante cualquier reclamación. Eso no es propiedad: es responsabilidad.

**Cómo dejarlo por escrito.** Un párrafo en el contrato de administración o un acta del consejo:
«el software de control de mantenimientos es del administrador y su uso se concede a la
copropiedad; la información producida es de la copropiedad y se entrega en formato abierto al
finalizar la administración». Con eso, cada parte conserva lo suyo sin discusión posterior.

**Herramienta de entrega.** El panel tiene la acción `entrega.exportar`, que copia el libro completo
a `/Portal/Documentos/Entregas/` con la fecha y devuelve los enlaces a la carpeta de evidencias y a
la de actas. Ese es el paquete que se entrega al saliente o al entrante.

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

## 4 bis. Respaldo del proyecto (el código, no los datos)

El respaldo de los **datos** es la acción `respaldos.crear` del portal. El respaldo del
**proyecto** es un archivo comprimido del repositorio:

```bash
cd cerro-azul-mantenimiento
mkdir -p backup
zip -rq backup/cerro-azul-mantenimiento-$(date +%Y-%m-%d).zip . \
  -x "backup/*" -x "*/node_modules/*" -x "*/.DS_Store"
```

Se sube a Drive en una carpeta por fecha y se comparte con la cuenta personal del administrador,
para que el proyecto no dependa solo de GitHub.

Los `.zip` no se versionan (están en `backup/.gitignore`): el repositorio guarda el código, Drive
guarda las copias fechadas.

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
