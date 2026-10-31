# Portal de Control de Mantenimientos — Cerro Azul

Portal para registrar, verificar con evidencia y publicar el estado del mantenimiento de la
Urbanización Cerro Azul. Los propietarios ven avances por sección y por mes; la administración
controla a las empresas contratistas; cada actividad queda con fotos antes y después.

- **Sitio:** https://fabig76.github.io/cerro-azul-mantenimiento/
- **Backend:** Google Apps Script (`apps-script/`), datos en Google Sheets y fotos en Drive.
- **Especificación:** `docs/SPEC.md` (v1.2).

## Estructura

```
web/            sitio estático que publica GitHub Pages
apps-script/    API (Router, Auth, Db, Nodos, Setup, Seed)
docs/           especificación y decisiones
```

## Cómo se publica

Cada push a `main` ejecuta `.github/workflows/pages.yml`, que publica el contenido de `web/`.

## Seguridad

El repositorio es público y no contiene secretos: ni identificadores de hojas, ni ids de Drive,
ni datos de residentes. Los secretos viven en las propiedades del script de Apps Script.
