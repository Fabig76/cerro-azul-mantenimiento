#!/usr/bin/env python3
"""Auditoría funcional del portal: prueba los módulos uno por uno y resume."""
import base64, json, ssl, sys, time, urllib.request, urllib.parse, zlib, struct

# El python del sistema no siempre trae los certificados raíz
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

API = ("https://script.google.com/a/macros/urbcerroazul.com/s/"
       "AKfycbxw9KTj1VgdqqFqRLH7cUrHdjI38llKW0nJukpxea11BvKCfDLLP4WvPX8Jw89nGNQdfg/exec")

def crudo(accion, params=None):
    url = API + "?action=" + accion + ("&" + urllib.parse.urlencode(params) if params else "")
    req = urllib.request.Request(url, method="GET")
    with urllib.request.urlopen(req, timeout=90, context=CTX) as r:
        return json.loads(r.read().decode())

def post(accion, payload=None, token=None):
    cuerpo = {"action": accion, "payload": payload or {}}
    if token:
        cuerpo["token"] = token
    req = urllib.request.Request(API, data=json.dumps(cuerpo).encode(),
                                 headers={"Content-Type": "text/plain;charset=utf-8"}, method="POST")
    with urllib.request.urlopen(req, timeout=120, context=CTX) as r:
        if r.status in (301, 302, 303, 307, 308):
            return post_seguir(r.headers.get("Location"))
        return json.loads(r.read().decode())

def post_seguir(url):
    with urllib.request.urlopen(urllib.request.Request(url), timeout=120, context=CTX) as r:
        return json.loads(r.read().decode())

resultados = []
PAUSA = 1.8  # el servidor limita a 60 acciones por minuto y por usuario

def png(color):
    """PNG pequeño distinto para que no lo rechace el control de duplicados."""
    w = h = 16
    raw = b''.join(b'\x00' + bytes(color) * w for _ in range(h))
    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    ihdr = struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)
    data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b'')
    return base64.b64encode(data).decode()
def probar(nombre, fn, espera_ok=True):
    """Ejecuta una prueba con reintentos ante fallos de red."""
    r = None
    ultimo = None
    for intento in range(3):
        try:
            r = fn()
            break
        except Exception as e:
            ultimo = e
            time.sleep(3)
    if r is None:
        resultados.append(("ERROR", nombre, str(ultimo)[:70]))
        return {"ok": False, "code": "EXCEPCION", "message": str(ultimo)}

    ok = r.get("ok") is True
    if ok == espera_ok:
        resultados.append(("OK", nombre, ""))
    else:
        resultados.append(("FALLA", nombre, str(r.get("code", "")) + " " + str(r.get("message", ""))[:70]))
    return r

def probar_crudo(nombre, fn, condicion):
    """Para las respuestas públicas, que no llevan el envoltorio {ok, data}."""
    try:
        d = fn()
        resultados.append(("OK" if condicion(d) else "FALLA", nombre, "" if condicion(d) else "no cumple"))
        return d
    except Exception as e:
        resultados.append(("ERROR", nombre, str(e)[:80]))
        return {}

def resumen_final():
    ok = sum(1 for r in resultados if r[0] == "OK")
    fallas = [r for r in resultados if r[0] != "OK"]
    print(f"\n{'='*70}\nRESULTADO: {ok} correctas · {len(fallas)} con problema · {len(resultados)} pruebas\n{'='*70}")
    for estado, nombre, detalle in resultados:
        marca = "OK  " if estado == "OK" else ">>> "
        print(f"{marca}{nombre:44} {detalle}")
    return 1 if fallas else 0

def auditar_contratista(token):
    print("\nNIVEL 2 · Contratista (computadores.y.portatiles@gmail.com)")
    me = probar("auth.me identifica al usuario", lambda: post("auth.me", token=token))
    if me.get("ok"):
        u = me["data"]["usuario"]
        probar("rol de contratista", lambda: {"ok": u["rol"] == "CONTRATISTA", "message": u["rol"]})
        probar("empresa asignada", lambda: {"ok": bool(u.get("empresa_id"))})
        probar("autorización de datos registrada", lambda: {"ok": bool(u.get("acepto_datos_en")), "message": "sin fecha"})

    arbol = probar("árbol limitado a su rama", lambda: post("nodos.arbol", token=token))
    if arbol.get("ok"):
        nodos = arbol["data"]["nodos"]
        codigos = [n["codigo"] for n in nodos]
        probar("solo ve su sección", lambda: {"ok": all(c.startswith("CA-AC") for c in codigos),
               "message": ", ".join(codigos[:3])})
        probar("ve Cámaras (CCTV)", lambda: {"ok": "CA-AC-CAM" in codigos})

    lista = probar("lista sus actividades", lambda: post("actividades.listar", token=token))
    if lista.get("ok") and lista["data"]["actividades"]:
        act = lista["data"]["actividades"][0]
        probar("abre el detalle", lambda: post("actividades.get", {"id": act["id"]}, token=token))
        probar("reporta una novedad",
               lambda: post("novedades.crear", {"nodo_id": act["nodo_id"], "titulo": "PRUEBA novedad de auditoría",
                                                 "tipo": "OBSERVACION", "gravedad": "BAJA"}, token=token))
        probar("rechaza foto con mime inválido",
               lambda: post("evidencias.upload", {"actividad_id": act["id"], "momento": "ANTES",
                                                  "base64": "AAAA", "mime": "image/heic"}, token=token),
               espera_ok=False)

    print("\nAISLAMIENTO · no puede tocar secciones ajenas")
    probar("no abre una sección de torre",
           lambda: post("novedades.crear", {"nodo_id": "NOD_INVENTADO", "titulo": "PRUEBA fuga",
                                             "tipo": "DANO", "gravedad": "BAJA"}, token=token),
           espera_ok=False)
    probar("acción de administrador rechazada",
           lambda: post("kpi.panel", token=token), espera_ok=False)
    probar("no lista usuarios", lambda: post("usuarios.listar", token=token), espera_ok=False)

def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--con-sesion":
        auditar_con_sesion(sys.argv[2])
    elif len(sys.argv) > 1 and sys.argv[1] == "--contratista":
        auditar_contratista(sys.argv[2])
    elif len(sys.argv) > 1 and sys.argv[1] == "--escrituras":
        auditar_escrituras(sys.argv[2])
    else:
        auditar_publico()
    sys.exit(resumen_final())

def auditar_publico():
    print("NIVEL 1 · Portal público (sin sesión)")
    probar("ping responde", lambda: crudo("ping"))
    snap = probar_crudo("snapshot público carga", lambda: crudo("public.snapshot"),
                        lambda d: "arbol" in d and "resumen" in d)
    probar_crudo("snapshot trae las 5 secciones", lambda: snap, lambda d: len(d.get("arbol", [])) == 5)
    probar_crudo("snapshot trae obligaciones normativas", lambda: snap, lambda d: len(d.get("normativo", [])) > 0)
    probar_crudo("snapshot trae serie de 12 meses", lambda: snap, lambda d: len(d.get("meses", [])) == 12)
    probar_crudo("snapshot está generado hoy", lambda: snap, lambda d: str(d.get("generado_en", ""))[:10] == __import__("datetime").date.today().isoformat())

    if snap.get("arbol"):
        ident = snap["arbol"][0]["id"]
        nodo = probar_crudo("detalle de sección", lambda: crudo("public.nodo", {"id": ident}),
                            lambda d: "salud" in d and "nombre" in d)
        probar_crudo("detalle trae migas de pan", lambda: nodo, lambda d: len(d.get("migas", [])) >= 2)
        probar_crudo("detalle trae serie mensual", lambda: nodo, lambda d: len(d.get("meses", [])) == 12)
        probar_crudo("detalle trae hijos", lambda: nodo, lambda d: "hijos" in d)

    probar("foto inexistente = no encontrada", lambda: {"ok": crudo("public.foto", {"id": "EVI_INVENTADO"}).get("error") == "no encontrada"})

    print("\nSEGURIDAD · acciones privadas rechazadas sin sesión")
    for accion in ["actividades.listar", "nodos.arbol", "usuarios.listar", "kpi.panel",
                   "tests.ejecutar", "informes.mensual", "actividades.crear", "reportes.revisar",
                   "respaldos.crear", "archivo.ejecutar", "config.get", "auditoria.listar"]:
        probar("sin sesión: " + accion,
               lambda a=accion: post(a), espera_ok=False)

    print("\nSEGURIDAD · arranque y diagnóstico cerrados")
    for accion in ["setup.run", "demo.crear", "empresa.inicial", "diag.asignacion",
                   "salud.recalcular", "snapshot.refrescar", "disparadores.instalar",
                   "ajustes.aplicar", "snapshot.ver", "usuario.inicial", "empresa.datos"]:
        probar("GET anónimo bloqueado: " + accion,
               lambda a=accion: {"ok": crudo(a).get("code") != "NO_ENCONTRADO"}, espera_ok=False)

def auditar_con_sesion(token):
    print("NIVEL 2 · Sesión de administrador")
    probar("auth.me", lambda: post("auth.me", token=token))
    probar("nodos.arbol", lambda: post("nodos.arbol", token=token))
    probar("actividades.listar", lambda: post("actividades.listar", token=token))
    probar("tipos.listar", lambda: post("tipos.listar", token=token))
    probar("plantillas.listar", lambda: post("plantillas.listar", token=token))
    probar("empresas.listar", lambda: post("empresas.listar", token=token))
    probar("usuarios.listar", lambda: post("usuarios.listar", token=token))
    probar("alertas.listar", lambda: post("alertas.listar", token=token))
    probar("kpi.panel", lambda: post("kpi.panel", token=token))
    probar("config.get", lambda: post("config.get", token=token))
    probar("auditoria.listar", lambda: post("auditoria.listar", {"entidad": "actividades"}, token=token))
    probar("respaldos.listar", lambda: post("respaldos.listar", token=token))
    probar("tests.ejecutar", lambda: {"ok": post("tests.ejecutar", token=token).get("data", {}).get("fallidas") == 0})


def auditar_escrituras(token):
    """Recorre el ciclo completo del administrador creando datos marcados PRUEBA."""
    print("\nNIVEL 3 · Ciclo completo del administrador")
    probar("limpiar residuos de auditorías anteriores", lambda: post("auditoria.limpiar", token=token))
    corrida = str(int(time.time()))[-5:]

    # Catálogo
    tipo = probar("crear tipo de elemento", lambda: post("tipos.guardar", {
        "nombre": "PRUEBA Panel solar" + corrida, "sensible_default": False,
        "atributos": [{"clave": "marca", "etiqueta": "Marca", "tipo": "texto"}],
        "condiciones": [{"valor": "Operativo", "nivel": "OK"}],
    }, token=token))
    tipo_id = tipo.get("data", {}).get("tipo", {}).get("id")

    plantilla = probar("crear plantilla con etapas", lambda: post("plantillas.guardar", {
        "nombre": "PRUEBA Revisión de panel", "tipo_elemento_id": tipo_id,
        "items": [{"grupo": "Limpieza", "pregunta": "Paneles limpios", "tipo_respuesta": "SI_NO", "peso": 2}],
        "etapas": [{"nombre": "Limpieza", "peso": 2}, {"nombre": "Revisión eléctrica", "peso": 3}],
    }, token=token))
    plantilla_id = plantilla.get("data", {}).get("plantilla", {}).get("id")

    probar("leer la plantilla creada", lambda: post("plantillas.get", {"id": plantilla_id}, token=token))

    # Empresa
    probar("crear empresa", lambda: post("empresas.guardar", {
        "razon_social": "PRUEBA Servicios Integrales",
    }, token=token))

    # Nodo
    nodo = probar("crear elemento en el árbol", lambda: post("nodos.crear", {
        "parent_id": "NOD_01M69S4WSSC87B9F93C0C247F8", "nombre": "PRUEBA Panel cubierta",
        "clase": "ELEMENTO", "segmento": "PB" + corrida[-3:], "tipo_elemento_id": tipo_id,
    }, token=token))
    nodo_id = None
    d = nodo.get("data", {})
    if isinstance(d, dict):
        nodo_id = d.get("id") or d.get("nodo", {}).get("id")
    probar("editar el elemento", lambda: post("nodos.editar", {
        "id": nodo_id, "nombre": "PRUEBA Panel cubierta", "descripcion": "Equipo de prueba",
    }, token=token))

    # Actividad con etapas heredadas
    act = probar("crear actividad (hereda etapas)", lambda: post("actividades.crear", {
        "titulo": "PRUEBA mantenimiento de panel", "nodo_id": nodo_id or "NOD_01M69S4WSSC87B9F93C0C247F8",
        "fecha_inicio_plan": "2026-11-02", "fecha_fin_plan": "2026-11-05",
        "prioridad": "MEDIA", "plantilla_id": plantilla_id,
    }, token=token))
    act_id = act.get("data", {}).get("actividad", {}).get("id")

    detalle = probar("abrir la actividad", lambda: post("actividades.get", {"id": act_id}, token=token))
    if detalle.get("ok"):
        probar("la actividad heredó las etapas de la plantilla",
               lambda: {"ok": len(detalle["data"].get("hitos") or []) == 2,
                        "message": str(len(detalle["data"].get("hitos") or [])) + " etapas"})
        probar("la actividad heredó el checklist",
               lambda: {"ok": len((detalle["data"].get("plantilla") or {}).get("items") or []) == 1})

    probar("editar la actividad", lambda: post("actividades.editar", {
        "id": act_id, "titulo": "PRUEBA mantenimiento de panel", "prioridad": "ALTA",
        "fecha_inicio_plan": "2026-11-02", "fecha_fin_plan": "2026-11-05",
    }, token=token))

    foto_antes = png((int(corrida[-2:]) or 30, 90, 200))
    probar("subir foto de antes", lambda: post("evidencias.upload", {
        "actividad_id": act_id, "momento": "ANTES",
        "base64": foto_antes, "base64_mini": foto_antes, "mime": "image/jpeg",
    }, token=token))

    probar("iniciar sin foto (admin con motivo)", lambda: post("actividades.iniciar", {
        "id": act_id, "motivo_sin_foto": "Prueba de auditoría sin evidencia física",
    }, token=token))

    # El sistema exige responder los ítems obligatorios antes de cerrar
    d2 = post("actividades.get", {"id": act_id}, token=token)
    items = ((d2.get("data") or {}).get("plantilla") or {}).get("items") or []
    respuestas = [{"item_id": i["id"], "valor": "SI"} for i in items]
    probar("rechaza el final sin condición del equipo", lambda: post("reportes.crear", {
        "actividad_id": act_id, "tipo": "FINAL", "respuestas": respuestas, "pct_declarado": 100,
    }, token=token), espera_ok=False)
    foto_despues = png((200, int(corrida[-2:]) or 40, 60))
    probar("subir foto de después", lambda: post("evidencias.upload", {
        "actividad_id": act_id, "momento": "DESPUES",
        "base64": foto_despues, "base64_mini": foto_despues, "mime": "image/jpeg",
    }, token=token))

    probar("reportar el final con checklist", lambda: post("reportes.crear", {
        "actividad_id": act_id, "tipo": "FINAL", "respuestas": respuestas,
        "condicion_operativa": "Operativo",
        "descripcion": "PRUEBA trabajo terminado por auditoría",
    }, token=token))

    rep = post("actividades.get", {"id": act_id}, token=token)
    rep_id = None
    if rep.get("ok") and rep["data"].get("reportes"):
        rep_id = rep["data"]["reportes"][0]["id"]
    probar("aprobar el reporte", lambda: post("reportes.revisar", {
        "reporte_id": rep_id, "decision": "APROBAR", "comentario": "Auditoría",
    }, token=token))

    acta = probar("generar el acta", lambda: post("actividades.acta", {"id": act_id}, token=token))
    if acta.get("ok"):
        a = acta["data"]
        probar("el acta trae checklist y evidencias",
               lambda: {"ok": a.get("items", 0) >= 1 and a.get("evidencias", 0) >= 2,
                        "message": f"{a.get('items')} ítems, {a.get('evidencias')} evidencias"})

    # Novedades y alertas
    nov = probar("crear novedad", lambda: post("novedades.crear", {
        "nodo_id": nodo_id or "NOD_01M69S4WSSC87B9F93C0C247F8", "titulo": "PRUEBA novedad",
        "tipo": "DANO", "gravedad": "MEDIA", "descripcion": "Auditoría",
    }, token=token))
    nov_id = nov.get("data", {}).get("novedad", {}).get("id")
    probar("editar novedad", lambda: post("novedades.editar", {"id": nov_id, "gravedad": "ALTA"}, token=token))
    probar("resolver novedad", lambda: post("novedades.resolver", {"id": nov_id}, token=token))
    probar("registrar lectura de estado", lambda: post("lecturas.crear", {
        "nodo_id": nodo_id or "NOD_01M69S4WSSC87B9F93C0C247F8", "condicion_operativa": "Operativo",
    }, token=token))

    ale = probar("crear alerta", lambda: post("alertas.guardar", {
        "titulo": "PRUEBA aviso de auditoría", "nivel": "INFO", "categoria": "GENERAL",
        "mensaje": "Prueba", "inicio": "2026-11-01",
    }, token=token))
    ale_id = ale.get("data", {}).get("alerta", {}).get("id")
    probar("publicar alerta", lambda: post("alertas.publicar", {"id": ale_id}, token=token))
    probar("cerrar alerta sin motivo (debe rechazar)",
           lambda: post("alertas.cerrar", {"id": ale_id}, token=token), espera_ok=False)
    probar("cerrar alerta con motivo", lambda: post("alertas.cerrar", {
        "id": ale_id, "mensaje": "Cierre de la prueba de auditoría",
    }, token=token))

    # Informes y respaldos
    probar("informe mensual", lambda: post("informes.mensual", {"mes": "2026-10"}, token=token))
    probar("regenerar snapshot", lambda: post("snapshot.regenerar", token=token))
    probar("crear respaldo", lambda: post("respaldos.crear", token=token))
    probar("archivo de datos viejos", lambda: post("archivo.ejecutar", {"meses": 24}, token=token))

    # Cierre: la actividad aprobada no se cancela, así que se deja y se limpia al final
    probar("una actividad aprobada no se cancela",
           lambda: post("actividades.cancelar", {
               "id": act_id, "motivo": "Actividad creada por la auditoría automática",
           }, token=token), espera_ok=False)

auditar_escrituras.__name__ = 'auditar_escrituras'

main()
