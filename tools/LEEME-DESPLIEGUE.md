# Desplegar sin que el navegador sirva la versión vieja

Los archivos `web/*.js` y `web/*.css` se cargan con `?v=N`. El navegador guarda esa
dirección en caché y no vuelve a pedirla mientras el número no cambie; GitHub Pages
además la retiene unos minutos. Por eso un cambio puede verse en el computador (que se
recargó en duro) y no en el celular.

Antes de publicar:

```bash
node tools/subir-version.mjs   # sube ?v= en app.html, index.html y el archivo VERSION
```

El número vive en `web/VERSION`. En el celular, después del despliegue, basta recargar:
la dirección de los recursos ya cambió y no hay caché que valga.
