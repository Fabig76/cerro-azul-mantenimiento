# tools/probar-puras.js

Ejecuta con Node las funciones puras del backend (fechas, salud, semáforo, checklist y ritmo)
sin conexión a Google. Sirve para comprobar la lógica antes de desplegar.

```bash
node tools/probar-puras.js
```

Si sale `FALLIDAS: 0`, la aritmética del sistema está bien. Lo que depende de la hoja
(permisos, transiciones, snapshot) se prueba con `runAllTests()` desde el editor de Apps Script.
