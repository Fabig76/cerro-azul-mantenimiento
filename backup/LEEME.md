# Copia de seguridad del proyecto

**Archivo:** `cerro-azul-mantenimiento-2026-11-01.zip`
**Contenido:** el repositorio completo —portal público, panel, Apps Script, especificación,
sistema visual y herramientas— con su historial de git.
**No incluye:** `node_modules` de clasp (se reinstala con `npm install`).

## Cómo restaurar

```bash
unzip cerro-azul-mantenimiento-2026-11-01.zip -d cerro-azul-mantenimiento
cd cerro-azul-mantenimiento
git log --oneline | head        # comprobar el historial
```

Para volver a desplegar el servidor:

```bash
cd apps-script
~/Documents/deepseek-harness/default-workspace/google-cerroazul/node_modules/.bin/clasp push --force
```

Y republicar el portal: hacer push a `main` del repositorio de GitHub.

## Lo que NO está aquí y no puede estar

- **Los datos**: viven en el libro de Google Sheets del conjunto. Su respaldo es la acción
  `respaldos.crear` del portal (carpeta `/Portal/Backups` del Drive de la copropiedad).
- **Las credenciales**: el token de `clasp` y el cliente OAuth no se copian nunca a un archivo.
- **Las fotos**: están en `/Portal/Evidencias` del Drive del conjunto.

## Frecuencia recomendada

Una copia por cada entrega importante o, como mínimo, una al mes.
