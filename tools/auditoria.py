#!/usr/bin/env python3
"""Auditoría funcional del portal: prueba los módulos uno por uno y resume."""
import json, ssl, sys, urllib.request, urllib.parse

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
def probar(nombre, fn, espera_ok=True):
    try:
        r = fn()
        ok = r.get("ok") is True
        if ok == espera_ok:
            resultados.append(("OK", nombre, ""))
        else:
            resultados.append(("FALLA", nombre, r.get("code", "") + " " + str(r.get("message", ""))[:70]))
        return r
    except Exception as e:
        resultados.append(("ERROR", nombre, str(e)[:80]))
        return {"ok": False, "code": "EXCEPCION", "message": str(e)}

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

main()
