/**
 * propuestas.js — el contratista propone una actividad; el administrador la revisa.
 * Todo va dentro de la pestaña Actividades: no añade pestañas nuevas.
 */
(function () {
  'use strict';

  const ETIQUETAS = {
    PENDIENTE: ['Pendiente de aprobación', 'warn'],
    APROBADA: ['Aprobada', 'ok'],
    RECHAZADA: ['No aprobada', 'danger'],
    RETIRADA: ['Retirada', 'gray'],
  };

  let rolActual = 'CONTRATISTA';
  let cargado = false;
  let propuestas = [];
  let nodos = [];
  let fotosNuevas = [];
  let abierta = null;
  let soloLectura = false;

  function el(tag, clase, texto) {
    const n = document.createElement(tag);
    if (clase) n.className = clase;
    if (texto !== undefined) n.textContent = texto;
    return n;
  }

  function aviso(texto, tipo) {
    let caja = document.getElementById('avisoPropuestas');
    if (!caja) {
      // Nunca dejar un mensaje sin sitio donde verse.
      caja = el('div', 'msg');
      caja.id = 'avisoPropuestas';
      caja.setAttribute('role', 'status');
      const ancla = document.getElementById('tarjetaActividades')
        || document.getElementById('bloquePropuestasContratista');
      if (!ancla) return;
      ancla.parentNode.insertBefore(caja, ancla);
    }
    caja.textContent = texto || '';
    caja.className = texto ? 'msg mostrar ' + (tipo || 'info') : 'msg';
    if (texto) caja.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  /** Lee un archivo como base64 sin el encabezado `data:`. */
  function leerPdfComoBase64(archivo) {
    return new Promise(function (resolver, rechazar) {
      const lector = new FileReader();
      lector.onload = function () {
        const texto = String(lector.result || '');
        resolver(texto.indexOf(',') >= 0 ? texto.split(',')[1] : texto);
      };
      lector.onerror = function () { rechazar(new Error('No se pudo leer el archivo.')); };
      lector.readAsDataURL(archivo);
    });
  }

  /** Abre la cotización. Si el navegador bloquea la vista, la ofrece descargar. */
  async function abrirPdf(propuestaId, boton) {
    boton.disabled = true;
    const antes = boton.textContent;
    boton.textContent = 'Abriendo…';
    try {
      const r = await API.llamar('propuestas.cotizacion.get', { propuesta_id: propuestaId },
        { token: Sesion.token() });
      if (!r.ok) throw new Error(r.message || 'No se pudo abrir la cotización.');

      const binario = atob(r.data.base64);
      const bytes = new Uint8Array(binario.length);
      for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);

      const ventana = window.open(url, '_blank');
      if (!ventana) {
        const enlace = document.createElement('a');
        enlace.href = url;
        enlace.download = r.data.nombre || 'cotizacion.pdf';
        enlace.textContent = 'Descargar ' + (r.data.nombre || 'cotizacion.pdf');
        enlace.className = 'btn-mini';
        boton.parentNode.appendChild(enlace);
        aviso('El navegador no abrió el PDF: use «Descargar».', 'info');
      }
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    } catch (e) {
      aviso(e.message || 'No se pudo abrir la cotización.', 'error');
    }
    boton.disabled = false;
    boton.textContent = antes;
  }

  function formatoPesos(n) {
    return '$ ' + Number(n || 0).toLocaleString('es-CO');
  }

  function campo(etiqueta, control, ayuda) {
    const c = el('div', 'campo');
    const l = el('label', null, etiqueta);
    if (control.id) l.htmlFor = control.id;
    c.appendChild(l);
    c.appendChild(control);
    if (ayuda) c.appendChild(el('p', 'bajada-tarjeta', ayuda));
    return c;
  }

  function textarea(id, placeholder, maximo) {
    const t = el('textarea', 'item-input');
    t.id = id;
    t.rows = 3;
    t.maxLength = maximo || 2000;
    t.placeholder = placeholder;
    return t;
  }

  function boton(texto, clase) {
    const b = el('button', clase || 'btn', texto);
    b.type = 'button';
    return b;
  }

  // ---------- carga ----------

  async function cargar(rol, nodosDelArbol) {
    rolActual = rol || 'CONTRATISTA';
    // Solo el administrador decide. Supervisor y consejo ven la propuesta completa,
    // pero sin campos editables ni botones de aprobar (RN-41 del SPEC v1.7).
    soloLectura = rolActual !== 'ADMIN' && rolActual !== 'CONTRATISTA';
    if (nodosDelArbol) nodos = nodosDelArbol;

    // Cada rol ve su bloque y nada más.
    const bloqueContratista = document.getElementById('bloquePropuestasContratista');
    const tarjetaAdmin = document.getElementById('tarjetaPropuestas');
    if (bloqueContratista) bloqueContratista.classList.toggle('oculto', rolActual !== 'CONTRATISTA');
    if (tarjetaAdmin) tarjetaAdmin.classList.toggle('oculto', rolActual === 'CONTRATISTA');
    cargado = true;

    if (rolActual === 'CONTRATISTA' && !nodos.length && window.App) {
      // Sin árbol cargado no se puede elegir sección: se pide aparte.
      const raiz = await Datos.obtener('nodos.arbol', Sesion.token());
      if (raiz.ok) nodos = raiz.data.nodos || [];
    }

    const r = await API.llamar('propuestas.listar', {}, { token: Sesion.token() });
    propuestas = r.ok ? (r.data.propuestas || []) : [];

    if (rolActual === 'CONTRATISTA') pintarContratista();
    else pintarAdministrador();
  }

  // ---------- contratista ----------

  function pintarContratista() {
    const cont = document.getElementById('bloquePropuestasContratista');
    if (!cont) return;
    cont.textContent = '';

    const caja = el('div', 'bloque');
    caja.appendChild(el('div', 'kicker', 'Propuestas'));
    caja.appendChild(el('p', 'bajada-tarjeta',
      'Si en una visita encuentras algo que hay que hacer, propónlo aquí. La administración lo revisa y decide.'));

    const nuevo = boton('Proponer una actividad', 'btn primary');
    nuevo.addEventListener('click', function () { formulario(); });
    caja.appendChild(nuevo);

    const pendientes = propuestas.filter(function (p) { return p.estado === 'PENDIENTE'; }).length;
    if (pendientes) {
      caja.appendChild(el('p', 'bajada-tarjeta aviso-paso',
        'Tienes ' + pendientes + ' propuesta(s) esperando revisión.'));
    }

    if (propuestas.length) caja.appendChild(tarjetas(false));
    cont.appendChild(caja);
  }

  function tarjetas(sinAcciones) {
    const lista = el('div', 'lista-propuestas');
    propuestas.forEach(function (p) {
      const et = ETIQUETAS[p.estado] || ['', 'gray'];
      const card = el('article', 'propuesta');
      const cab = el('div', 'propuesta-cab');
      cab.appendChild(el('h3', null, p.titulo));
      cab.appendChild(el('span', 'badge ' + et[1], et[0]));
      card.appendChild(cab);

      const meta = el('p', 'propuesta-meta');
      meta.textContent = p.nodo_codigo + ' · ' + p.nodo_nombre +
        ' · inicio ' + p.fecha_inicio_sugerida + ' · ' + p.fotos.length + ' foto(s)';
      card.appendChild(meta);

      // v1.6: el valor y su cotización, cuando el rol puede verlos.
      if (p.valor_cotizado !== undefined && Number(p.valor_cotizado) > 0) {
        const linea = el('p', 'propuesta-valor');
        linea.textContent = 'Cotización: ' + formatoPesos(p.valor_cotizado) +
          (p.cotizacion ? ' · ' + p.cotizacion.nombre +
            ' (' + Math.round((p.cotizacion.bytes || 0) / 1024) + ' KB)' : ' · falta el PDF');
        card.appendChild(linea);
        if (p.cotizacion) {
          const verPdf = boton('Ver PDF', 'btn-mini');
          verPdf.addEventListener('click', function () { abrirPdf(p.id, verPdf); });
          card.appendChild(verPdf);
        }
      }

      if (p.estado === 'RECHAZADA' && p.motivo_rechazo) {
        card.appendChild(el('p', 'propuesta-motivo', 'Motivo: ' + p.motivo_rechazo));
      }
      if (p.estado === 'APROBADA') {
        const ver = boton('Ver la actividad', 'btn-mini');
        ver.addEventListener('click', function () {
          if (window.Actividad) Actividad.abrir(p.actividad_id, rolActual);
        });
        card.appendChild(ver);
      }
      if (p.estado === 'PENDIENTE' && !sinAcciones) {
        const corregir = boton('Corregir', 'btn-mini');
        corregir.addEventListener('click', async function () {
          corregir.disabled = true;
          // Se pide la propuesta completa para tener la versión y los campos actuales.
          const r = await API.llamar('propuestas.get', { id: p.id }, { token: Sesion.token() });
          corregir.disabled = false;
          if (!r.ok) return aviso(r.message || 'No se pudo abrir la propuesta.', 'error');
          formularioPropuesta(r.data.propuesta, r.data.version);
        });
        card.appendChild(corregir);
      }

      if (p.estado === 'PENDIENTE' && !sinAcciones && p.fotos.length < 3) {
        const agregar = Fotos.selector({
          camara: 'Tomar foto',
          galeria: 'Elegir de la galería',
          clase: 'btn-mini',
          alElegir: subirFoto,
        });
        async function subirFoto(file) {
          agregar.ocupar('Subiendo…');
          try {
            const prep = await Fotos.preparar(file);
            const r = await API.llamar('propuestas.foto.subir', {
              propuesta_id: p.id,
              base64: prep.base64,
              base64_mini: prep.base64_mini,
              mime: 'image/jpeg',
            }, { token: Sesion.token(), idempotente: true });
            if (!r.ok) throw new Error(r.message || 'No se pudo subir la foto.');
            aviso('Foto agregada a la propuesta.', 'ok');
            cargar(rolActual);
          } catch (e) {
            aviso(e.message || 'No se pudo subir la foto.', 'error');
            agregar.liberar();
          }
        }
        card.appendChild(agregar.caja);
      }
      if (p.estado === 'PENDIENTE' && !sinAcciones) {
        const retirar = boton('Retirar', 'btn-mini');
        let confirmado = false;
        retirar.addEventListener('click', async function () {
          if (!confirmado) {
            confirmado = true;
            retirar.textContent = 'Confirmar retiro';
            setTimeout(function () { confirmado = false; retirar.textContent = 'Retirar'; }, 6000);
            return;
          }
          const r = await API.llamar('propuestas.retirar', { id: p.id }, { token: Sesion.token(), idempotente: true });
          if (!r.ok) return aviso(r.message || 'No se pudo retirar.', 'error');
          aviso('Propuesta retirada.', 'ok');
          cargar(rolActual);
        });
        card.appendChild(retirar);
      }
      lista.appendChild(card);
    });
    return lista;
  }

  /**
   * Formulario de propuesta. Sin argumento crea una nueva; con una propuesta
   * pendiente, la corrige (P2 de la v1.7).
   */
  /** Abre el formulario con los datos de una propuesta pendiente. */
  function formularioPropuesta(p, version) {
    formulario({ id: p.id, version: version || '', datos: p });
  }

  function formulario(existente) {
    const cont = document.getElementById('bloquePropuestasContratista');
    if (!cont) return;
    cont.textContent = '';
    fotosNuevas = [];
    // Solo cuenta como edición si trae un id: un evento de clic no es una propuesta.
    const editando = (existente && existente.id) ? existente : null;

    let valorNumInicial = 0;
    const previos = (existente && existente.datos) ? existente.datos : null;
    const caja = el('div', 'bloque');
    caja.appendChild(el('div', 'kicker', editando ? 'Corregir propuesta' : 'Nueva propuesta'));

    const sel = el('select', 'item-input');
    sel.id = 'prNodo';
    const minimo = nodos.reduce(function (m, n) {
      const p = Number(n.profundidad) || 0;
      return m === null || p < m ? p : m;
    }, null);

    const vacia = el('option', null, 'Elige la sección…');
    vacia.value = '';
    vacia.selected = nodos.length !== 1;
    vacia.disabled = true;
    sel.appendChild(vacia);

    nodos.forEach(function (n) {
      const sangria = '  '.repeat(Math.max(0, (Number(n.profundidad) || 0) - (minimo || 0)));
      const op = el('option', null, sangria + n.codigo + ' · ' + n.nombre);
      op.value = n.id;
      if (nodos.length === 1) op.selected = true;
      sel.appendChild(op);
    });

    const titulo = el('input', 'item-input');
    titulo.id = 'prTitulo';
    titulo.type = 'text';
    titulo.maxLength = 120;
    titulo.placeholder = 'Impermeabilizar el cuarto de bombas';

    const hallazgo = textarea('prHallazgo', 'Humedad en el muro sur, junto a la bomba 2. Se ve desde hace dos semanas.');
    const alcance = textarea('prAlcance', 'Tareas, materiales, cuántas personas, cuánto tiempo.');
    const inicio = el('input', 'item-input');
    inicio.id = 'prInicio';
    inicio.type = 'date';
    const fin = el('input', 'item-input');
    fin.id = 'prFin';
    fin.type = 'date';

    const prioridad = el('select', 'item-input');
    prioridad.id = 'prPrioridad';
    [['BAJA', 'Baja'], ['MEDIA', 'Media'], ['ALTA', 'Alta'], ['URGENTE', 'Urgente']].forEach(function (o) {
      const op = el('option', null, o[1]);
      op.value = o[0];
      if (o[0] === 'MEDIA') op.selected = true;
      prioridad.appendChild(op);
    });

    const afecta = el('input');
    afecta.type = 'checkbox';
    afecta.id = 'prAfecta';
    const etiquetaAfecta = el('label', 'casilla-datos', null);
    etiquetaAfecta.appendChild(afecta);
    etiquetaAfecta.appendChild(el('span', null, 'Afecta el uso de la zona mientras se trabaja'));

    // v1.6: cuánto cuesta y el PDF de la cotización (opcional, pero con valor).
    const valor = el('input', 'item-input');
    valor.id = 'prValor';
    valor.type = 'text';
    valor.inputMode = 'numeric';
    valor.placeholder = '$ 1.250.000';
    valor.addEventListener('blur', function () {
      const n = Number(String(valor.value).replace(/[^\d]/g, ''));
      if (n > 0) valor.value = '$ ' + n.toLocaleString('es-CO');
    });

    const vigencia = el('input', 'item-input');
    vigencia.id = 'prVigencia';
    vigencia.type = 'date';

    let cotizacion = null;
    const inpPdf = el('input');
    inpPdf.type = 'file';
    inpPdf.accept = 'application/pdf';
    inpPdf.className = 'oculto';
    const btnPdf = boton('Adjuntar cotización (PDF)');
    const nombrePdf = el('p', 'bajada-tarjeta');
    btnPdf.addEventListener('click', function () { inpPdf.click(); });
    inpPdf.addEventListener('change', function () {
      const file = inpPdf.files && inpPdf.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        cotizacion = null;
        nombrePdf.textContent = '';
        inpPdf.value = '';
        return aviso('La cotización pesa más de 5 MB. Guárdela de nuevo en menor calidad o pida una versión liviana.', 'error');
      }
      cotizacion = file;
      nombrePdf.textContent = 'Cotización lista: ' + file.name + ' (' + Math.round(file.size / 1024) + ' KB)';
    });

    const fotos = el('div', 'fotos');
    // La foto de la visita puede ser nueva o una que ya esté en la galería del teléfono.
    const btnFoto = Fotos.selector({
      camara: 'Tomar foto de la visita',
      galeria: 'Elegir de la galería',
      alElegir: agregarFotoVisita,
    });
    async function agregarFotoVisita(file) {
      if (fotosNuevas.length >= cupo) return;
      btnFoto.ocupar('Comprimiendo…');
      try {
        const prep = await Fotos.preparar(file);
        fotosNuevas.push(prep);
        const figura = el('figure', 'foto-item');
        const hueco = el('div', 'foto-hueco');
        const img = document.createElement('img');
        img.className = 'foto-mini';
        img.alt = 'Foto de la visita ' + fotosNuevas.length;
        img.src = 'data:image/jpeg;base64,' + prep.base64_mini;
        hueco.appendChild(img);
        figura.appendChild(hueco);
        figura.appendChild(el('figcaption', 'foto-pie', 'Visita ' + fotosNuevas.length));
        fotos.appendChild(figura);
      } catch (e) {
        aviso('No se pudo preparar la foto.', 'error');
      }
      btnFoto.liberar();
      // El cupo descuenta las fotos ya guardadas: con 2 guardadas solo cabe 1 más.
      if (fotosNuevas.length >= cupo) btnFoto.ocupar('Ya hay 3 fotos');
    }

    const acciones = el('div', 'acciones-form');
    const enviar = boton(editando ? 'Guardar cambios' : 'Enviar propuesta', 'btn primary');
    const volver = boton('Volver');
    volver.addEventListener('click', function () { cargar(rolActual); });
    acciones.appendChild(enviar);
    acciones.appendChild(volver);

    enviar.addEventListener('click', async function () {
      if (!sel.value) return aviso('Elige la sección donde hiciste la visita.', 'error');
      if (!titulo.value.trim()) {
        return aviso('Escribe un título corto, por ejemplo «Cambio de empaque del domo».', 'error');
      }
      if (hallazgo.value.trim().length < 20) return aviso('Cuenta con al menos 20 caracteres qué encontraste.', 'error');
      if (alcance.value.trim().length < 20) return aviso('Cuenta con al menos 20 caracteres qué propones hacer.', 'error');
      if (!inicio.value) return aviso('Indica una fecha de inicio.', 'error');

      const valorNum = Number(String(valor.value).replace(/[^\d]/g, '')) || 0;
      if (cotizacion && !valorNum) {
        return aviso('Escribe el valor de la cotización antes de adjuntar el PDF.', 'error');
      }

      enviar.disabled = true;
      enviar.textContent = editando ? 'Guardando…' : 'Enviando…';
      const campos = {
        nodo_id: sel.value,
        titulo: titulo.value.trim(),
        hallazgo: hallazgo.value.trim(),
        alcance: alcance.value.trim(),
        fecha_inicio_sugerida: inicio.value,
        fecha_fin_sugerida: fin.value || inicio.value,
        prioridad_sugerida: prioridad.value,
        afecta_uso: afecta.checked,
        valor_cotizado: valorNum,
        cotizacion_vigente_hasta: vigencia.value || '',
        archivos_pendientes: !!(cotizacion || fotosNuevas.length),
      };

      const r = editando
        ? await API.llamar('propuestas.editar',
            Object.assign({ id: editando.id, version: existente.version }, campos),
            { token: Sesion.token(), idempotente: true })
        : await API.llamar('propuestas.crear', campos, { token: Sesion.token(), idempotente: true });

      if (!r.ok) {
        enviar.disabled = false;
        enviar.textContent = editando ? 'Guardar cambios' : 'Enviar propuesta';
        return aviso(r.message || 'No se pudo guardar.', 'error');
      }

      if (window.Borrador) Borrador.borrar('propuesta');
      if (editando) existente.version = r.data.version || existente.version;
      const id = r.data.propuesta.id;
      let subidas = 0;
      for (let i = 0; i < fotosNuevas.length; i++) {
        enviar.textContent = 'Subiendo foto ' + (i + 1) + ' de ' + fotosNuevas.length + '…';
        const f = await API.llamar('propuestas.foto.subir', {
          propuesta_id: id,
          base64: fotosNuevas[i].base64,
          base64_mini: fotosNuevas[i].base64_mini,
          mime: 'image/jpeg',
        }, { token: Sesion.token(), idempotente: true });
        if (f.ok) subidas++;
      }

      // La cotización va al final: si falla, la propuesta ya quedó y se puede reintentar.
      let pdfFallo = false;
      if (cotizacion) {
        enviar.textContent = 'Subiendo la cotización…';
        try {
          const base64 = await leerPdfComoBase64(cotizacion);
          const rc = await API.llamar('propuestas.cotizacion.subir', {
            propuesta_id: id,
            base64: base64,
            nombre: cotizacion.name,
            valor_cotizado: valorNum,
            cotizacion_vigente_hasta: vigencia.value || '',
          }, { token: Sesion.token(), idempotente: true });
          pdfFallo = !rc.ok;
        } catch (e) {
          pdfFallo = true;
        }
      }

      enviar.disabled = false;
      enviar.textContent = editando ? 'Guardar cambios' : 'Enviar propuesta';
      // RN-54 · Con los archivos arriba, la propuesta queda completa: ahora sí se avisa.
      if (!editando) {
        API.llamar('propuestas.lista', { id: id }, { token: Sesion.token() }).catch(function () {});
      }

      if (pdfFallo) {
        aviso('La propuesta se envió, pero la cotización no subió. Toca «Corregir» en la tarjeta y adjunta la cotización otra vez para intentarlo otra vez.', 'info');
      } else if (fotosNuevas.length && subidas < fotosNuevas.length) {
        const faltan = fotosNuevas.length - subidas;
        aviso('La propuesta se envió, pero falta ' + faltan + (faltan === 1 ? ' foto' : ' fotos') +
          '. Toca «Agregar foto» en la propuesta para subirla.', 'info');
      } else {
        aviso(editando ? 'Cambios guardados. La administración la revisará.' : 'Propuesta enviada. La administración la revisará.', 'ok');
      }
      cargar(rolActual);
    });

    // Al corregir, los campos arrancan con lo que ya tenía la propuesta.
    if (previos) {
      if (previos.titulo) titulo.value = previos.titulo;
      if (previos.hallazgo) hallazgo.value = previos.hallazgo;
      if (previos.alcance) alcance.value = previos.alcance;
      if (previos.nodo_id) sel.value = previos.nodo_id;
      if (previos.fecha_inicio_sugerida) inicio.value = previos.fecha_inicio_sugerida;
      if (previos.fecha_fin_sugerida) fin.value = previos.fecha_fin_sugerida;
      if (previos.prioridad_sugerida) prioridad.value = previos.prioridad_sugerida;
      afecta.checked = !!previos.afecta_uso;
      if (previos.valor_cotizado) {
        valor.value = '$ ' + Number(previos.valor_cotizado).toLocaleString('es-CO');
        valorNumInicial = Number(previos.valor_cotizado);
      }
      if (previos.cotizacion_vigente_hasta) vigencia.value = previos.cotizacion_vigente_hasta;
    }

    // Lo escrito se guarda mientras se escribe; si el celular recarga, se recupera.
    const CLAVE_BORRADOR = 'propuesta';
    const previo = window.Borrador ? Borrador.leer(CLAVE_BORRADOR) : null;
    if (previo && !previos) {
      if (previo.hallazgo) hallazgo.value = previo.hallazgo;
      if (previo.alcance) alcance.value = previo.alcance;
      if (previo.titulo) titulo.value = previo.titulo;
      if (previo.fecha) inicio.value = previo.fecha;
    }

    const guardarAvance = function () {
      if (!window.Borrador) return;
      Borrador.guardar(CLAVE_BORRADOR, {
        titulo: titulo.value, hallazgo: hallazgo.value,
        alcance: alcance.value, fecha: inicio.value, nodo: sel.value,
      });
    };
    [titulo, hallazgo, alcance, inicio].forEach(function (c) {
      c.addEventListener('input', guardarAvance);
      c.addEventListener('change', guardarAvance);
    });

    caja.appendChild(campo('Sección', sel));
    caja.appendChild(campo('Título', titulo));
    caja.appendChild(campo('¿Qué encontraste en la visita?', hallazgo));
    caja.appendChild(campo('¿Qué propones hacer?', alcance, 'Tareas, materiales, cuántas personas, cuánto tiempo.'));
    const fila = el('div', 'fila-campos');
    fila.appendChild(campo('Inicio sugerido', inicio));
    fila.appendChild(campo('Fin sugerido', fin));
    fila.appendChild(campo('Prioridad', prioridad));
    caja.appendChild(fila);
    caja.appendChild(etiquetaAfecta);
    caja.appendChild(campo('Valor de la cotización (COP, IVA incluido)', valor,
      'Solo el número. Si no hay cotización, déjalo vacío.'));
    caja.appendChild(campo('Vigente hasta (opcional)', vigencia));
    // V3 · Lo que ya está guardado se ve, con su botón para cambiarlo o quitarlo.
    if (previos && previos.cotizacion) {
      const actual = el('p', 'bajada-tarjeta',
        'Cotización actual: ' + previos.cotizacion.nombre + ' (' +
        Math.round((previos.cotizacion.bytes || 0) / 1024) + ' KB)');
      caja.appendChild(actual);
      const ver = boton('Ver PDF', 'btn-mini');
      ver.addEventListener('click', function () { abrirPdf(previos.id, ver); });
      caja.appendChild(ver);
      btnPdf.textContent = 'Cambiar cotización (PDF)';

      // RN-65 · Dejarla sin cotización, no solo reemplazarla.
      const quitarCot = boton('Quitar cotización', 'btn-mini peligro');
      quitarCot.addEventListener('click', async function () {
        if (!window.confirm('¿Quitar la cotización? La propuesta quedará sin PDF.')) return;
        quitarCot.disabled = true;
        const r = await API.llamar('propuestas.cotizacion.quitar',
          { propuesta_id: previos.id }, { token: Sesion.token(), idempotente: true });
        quitarCot.disabled = false;
        if (!r.ok) return aviso(r.message || 'No se pudo quitar la cotización.', 'error');
        aviso('Cotización quitada.', 'ok');
        formularioPropuesta(r.data.propuesta, r.data.version || previos.version);
      });
      caja.appendChild(quitarCot);
    }
    caja.appendChild(btnPdf);
    caja.appendChild(inpPdf);
    caja.appendChild(nombrePdf);

    const yaTiene = previos && previos.fotos ? previos.fotos.length : 0;
    const cupo = Math.max(0, 3 - yaTiene);
    caja.appendChild(campo('Fotos de la visita (máximo 3)', fotos,
      yaTiene
        ? 'Ya tiene ' + yaTiene + ' foto(s). Puede agregar ' + cupo + ' más.'
        : 'Estas fotos no reemplazan la foto de antes.'));

    if (yaTiene) {
      const listaFotos = el('div', 'fotos');
      previos.fotos.forEach(function (fotoId, i) {
        const figura = el('figure', 'foto-item');
        const img = document.createElement('img');
        img.className = 'foto-mini';
        img.alt = 'Foto guardada ' + (i + 1);
        figura.appendChild(img);
        // La miniatura se trae igual que en la tarjeta del administrador: sin esto el
        // recuadro salía vacío y no se sabía qué foto se estaba quitando.
        if (window.FotoCache) {
          FotoCache.configurar(function (tipo, d) {
            return API.llamar('propuestas.foto.get', { propuesta_id: d.propuesta, foto_id: d.id, tam: 'mini' },
              { token: Sesion.token() }).then(function (rf) {
              return rf.ok ? { base64: rf.data.base64, mime: rf.data.mime } : null;
            });
          });
          FotoCache.mostrar(img, { clave: 'propuesta:' + previos.id + ':' + fotoId,
            tipo: 'propuesta', id: fotoId, propuesta: previos.id });
        }
        figura.appendChild(el('figcaption', 'foto-pie', 'Guardada ' + (i + 1)));
        const quitar = boton('Quitar', 'btn-mini peligro');
        quitar.addEventListener('click', async function () {
          quitar.disabled = true;
          const r = await API.llamar('propuestas.foto.quitar',
            { propuesta_id: previos.id, foto_id: fotoId },
            { token: Sesion.token(), idempotente: true });
          quitar.disabled = false;
          if (!r.ok) return aviso(r.message || 'No se pudo quitar la foto.', 'error');
          formularioPropuesta(r.data.propuesta, r.data.version || previos.version);
        });
        figura.appendChild(quitar);
        listaFotos.appendChild(figura);
      });
      caja.appendChild(listaFotos);
    }
    if (cupo === 0) btnFoto.ocultar();
    caja.appendChild(btnFoto.caja);
    caja.appendChild(acciones);
    cont.appendChild(caja);
  }

  // ---------- administrador ----------

  function pintarAdministrador() {
    const cont = document.getElementById('tarjetaPropuestas');
    if (!cont) return;
    cont.textContent = '';
    const pendientes = propuestas.filter(function (p) { return p.estado === 'PENDIENTE'; });

    const cab = el('div', 'cabecera-seccion');
    cab.appendChild(el('h2', null, soloLectura ? 'Propuestas (solo lectura)' : 'Propuestas por aprobar'));
    cab.appendChild(el('span', 'codigo', String(pendientes.length)));
    cont.appendChild(cab);
    cont.appendChild(el('p', 'bajada-tarjeta',
      'Lo que los contratistas proponen después de una visita. Al aprobar se crea la actividad.'));

    if (!pendientes.length) {
      cont.appendChild(el('div', 'vacio', 'No hay propuestas pendientes.'));
      return;
    }

    pendientes.forEach(function (p) {
      const fila = el('article', 'propuesta fila-propuesta');
      fila.tabIndex = 0;
      fila.setAttribute('role', 'button');
      const cab2 = el('div', 'propuesta-cab');
      cab2.appendChild(el('h3', null, p.titulo));
      cab2.appendChild(el('span', 'badge warn', 'Pendiente'));
      fila.appendChild(cab2);
      const meta = el('p', 'propuesta-meta');
      meta.textContent = p.nodo_codigo + ' · ' + p.propuesta_por_nombre +
        (p.empresa_nombre ? ' · ' + p.empresa_nombre : '') + ' · ' + p.fotos.length + ' foto(s)';
      fila.appendChild(meta);
      fila.addEventListener('click', function () { revision(p.id); });
      cont.appendChild(fila);
    });
  }

  async function revision(id) {
    const cont = document.getElementById('tarjetaPropuestas');
    if (!cont) return;
    const r = await API.llamar('propuestas.get', { id: id }, { token: Sesion.token() });
    if (!r.ok) return aviso(r.message || 'No se pudo abrir la propuesta.', 'error');
    abierta = r.data;

    cont.textContent = '';
    const cab = el('div', 'cabecera-seccion');
    cab.appendChild(el('h2', null, soloLectura ? 'Propuesta (solo lectura)' : 'Revisar propuesta'));
    cont.appendChild(cab);
    cont.appendChild(el('p', 'bajada-tarjeta',
      'A cargo de: ' + abierta.propuesta.propuesta_por_nombre +
      (abierta.propuesta.empresa_nombre ? ' · ' + abierta.propuesta.empresa_nombre : '')));

    const original = el('div', 'bloque');
    original.appendChild(el('div', 'kicker', 'Lo que propuso el contratista'));
    original.appendChild(el('p', 'texto-reportado', abierta.propuesta.hallazgo));
    original.appendChild(el('p', 'bajada-tarjeta', 'Propone: ' + abierta.propuesta.alcance));
    const fotos = el('div', 'fotos');
    (abierta.propuesta.fotos || []).forEach(function (fotoId, i) {
      const figura = el('figure', 'foto-item');
      const hueco = el('div', 'foto-hueco');
      const img = document.createElement('img');
      img.className = 'foto-mini';
      img.alt = 'Foto de la visita ' + (i + 1);
      hueco.appendChild(img);
      figura.appendChild(hueco);
      figura.appendChild(el('figcaption', 'foto-pie', 'Visita ' + (i + 1)));
      if (window.FotoCache) {
        FotoCache.configurar(function (tipo, d) {
          return API.llamar('propuestas.foto.get', { propuesta_id: d.propuesta, foto_id: d.id, tam: 'mini' },
            { token: Sesion.token() }).then(function (rf) {
            return rf.ok ? { base64: rf.data.base64, mime: rf.data.mime } : null;
          });
        });
        FotoCache.mostrar(img, { clave: 'propuesta:' + abierta.propuesta.id + ':' + fotoId,
          tipo: 'propuesta', id: fotoId, propuesta: abierta.propuesta.id });
      }
      fotos.appendChild(figura);
    });
    original.appendChild(fotos);
    cont.appendChild(original);

    const ver = abierta.verificacion || {};

    // Lo que impedirá aprobar: recuadro rojo.
    const impedimentos = [];
    if (ver.usuario_activo === false) impedimentos.push('Quien propuso ya no está activo.');
    if (ver.asignacion_vigente === false) impedimentos.push('Quien propuso ya no tiene asignada esa sección.');
    if (ver.empresa_sin_cambios === false) impedimentos.push('El contratista cambió de empresa desde que propuso.');
    if (ver.empresa_vigente === false) impedimentos.push('La empresa tiene el contrato vencido.');

    if (impedimentos.length) {
      const cajaAvisos = el('div', 'aviso-rechazo');
      cajaAvisos.appendChild(el('strong', null, 'No se podrá aprobar'));
      impedimentos.forEach(function (a) { cajaAvisos.appendChild(el('p', null, a)); });
      cajaAvisos.appendChild(el('p', 'aviso-rechazo-fecha',
        'La comprobación definitiva la hace el servidor al aprobar.'));
      cont.appendChild(cajaAvisos);
    }

    // Las actividades abiertas son información, no un impedimento.
    if (ver.actividades_abiertas) {
      const cuantas = Number(ver.actividades_abiertas);
      const texto = cuantas === 1
        ? 'Ya hay 1 actividad abierta en esta sección. Revisa que no sea el mismo trabajo.'
        : 'Ya hay ' + cuantas + ' actividades abiertas en esta sección. Revisa que no sea el mismo trabajo.';
      const info = el('div', 'msg info mostrar');
      info.textContent = texto;
      cont.appendChild(info);
    }

    const form = el('div', 'bloque');
    form.appendChild(el('div', 'kicker', 'La actividad que se va a crear'));

    const titulo = el('input', 'item-input');
    titulo.id = 'rvTitulo';
    titulo.type = 'text';
    titulo.maxLength = 120;
    titulo.value = abierta.propuesta.titulo;

    const sel = el('select', 'item-input');
    sel.id = 'rvNodo';
    const posibles = abierta.secciones_posibles || [];
    const lista = posibles.slice();
    if (!lista.some(function (n) { return String(n.id) === String(abierta.propuesta.nodo_id); })) {
      // La sección original ya no está asignada: se muestra para que se entienda el bloqueo.
      lista.push({
        id: abierta.propuesta.nodo_id,
        codigo: abierta.propuesta.nodo_codigo,
        nombre: abierta.propuesta.nodo_nombre + ' (ya no asignada)',
        profundidad: 0,
      });
    }
    lista.forEach(function (n) {
      const op = el('option', null, n.codigo + ' · ' + n.nombre);
      op.value = n.id;
      if (String(n.id) === String(abierta.propuesta.nodo_id)) op.selected = true;
      sel.appendChild(op);
    });

    const descripcion = textarea('rvDescripcion', '');
    descripcion.value = abierta.propuesta.alcance;

    const inicio = el('input', 'item-input');
    inicio.id = 'rvInicio';
    inicio.type = 'date';
    inicio.value = abierta.propuesta.fecha_inicio_sugerida;
    const fin = el('input', 'item-input');
    fin.id = 'rvFin';
    fin.type = 'date';
    fin.value = abierta.propuesta.fecha_fin_sugerida;

    const prioridad = el('select', 'item-input');
    prioridad.id = 'rvPrioridad';
    [['BAJA', 'Baja'], ['MEDIA', 'Media'], ['ALTA', 'Alta'], ['URGENTE', 'Urgente']].forEach(function (o) {
      const op = el('option', null, o[1]);
      op.value = o[0];
      if (o[0] === abierta.propuesta.prioridad_sugerida) op.selected = true;
      prioridad.appendChild(op);
    });

    form.appendChild(campo('Título', titulo));
    form.appendChild(campo('Sección', sel));
    form.appendChild(campo('Descripción', descripcion));
    const fila = el('div', 'fila-campos');
    fila.appendChild(campo('Inicio', inicio));
    fila.appendChild(campo('Fin', fin));
    fila.appendChild(campo('Prioridad', prioridad));
    form.appendChild(fila);

    // v1.6: la cotización a la vista y el valor que se aprueba.
    let valorAprobado = null;
    if (abierta.propuesta.valor_cotizado !== undefined) {
      const cajaCot = el('div', 'propuesta-cotizacion');
      const cot = abierta.propuesta.cotizacion;
      const texto = 'Cotización: ' + formatoPesos(abierta.propuesta.valor_cotizado) +
        (cot ? ' · ' + cot.nombre + ' (' + Math.round((cot.bytes || 0) / 1024) + ' KB)' : ' · sin PDF');
      cajaCot.appendChild(el('p', 'propuesta-valor', texto));

      if (cot) {
        const verPdf = boton('Ver PDF', 'btn-mini');
        verPdf.addEventListener('click', function () { abrirPdf(abierta.propuesta.id, verPdf); });
        cajaCot.appendChild(verPdf);
      }

      const vence = abierta.propuesta.cotizacion_vigente_hasta;
      if (vence && vence < new Date().toISOString().slice(0, 10)) {
        cajaCot.appendChild(el('p', 'bajada-tarjeta', 'La cotización venció el ' + vence + '.'));
      }

      valorAprobado = el('input', 'item-input');
      valorAprobado.id = 'rvValor';
      valorAprobado.type = 'text';
      valorAprobado.inputMode = 'numeric';
      valorAprobado.value = String(abierta.propuesta.valor_cotizado || '');
      valorAprobado.addEventListener('blur', function () {
        const n = Number(String(valorAprobado.value).replace(/[^\d]/g, ''));
        if (n > 0) valorAprobado.value = String(n);
      });
      cajaCot.appendChild(campo('Valor aprobado (COP)', valorAprobado,
        'Si lo deja igual, se aprueba el valor cotizado.'));
      form.appendChild(cajaCot);
    }

    form.appendChild(el('p', 'bajada-tarjeta',
      'La plantilla, las etapas y la publicación se ajustan después en la actividad, como siempre.'));

    const permisos = abierta.permisos || { decidir: rolActual === 'ADMIN', eliminar: rolActual === 'ADMIN' };
    // RN-50 · Con valor y sin cotización, hay que marcarlo.
    let casillaSinCot = null;
    const hayValor = Number((abierta.propuesta && abierta.propuesta.valor_cotizado) || 0) > 0;
    const hayPdf = !!(abierta.propuesta && abierta.propuesta.cotizacion);
    if (hayValor && !hayPdf) {
      const cajaFalta = el('div', 'aviso-rechazo');
      cajaFalta.appendChild(el('strong', null, 'Falta la cotización'));
      cajaFalta.appendChild(el('p', null,
        'La propuesta tiene valor pero no tiene el PDF. Pídalo antes de aprobar, o marque la casilla para seguir sin él.'));
      const etiqueta = el('label', 'etiqueta-casilla');
      casillaSinCot = el('input');
      casillaSinCot.type = 'checkbox';
      casillaSinCot.id = 'rvSinCotizacion';
      etiqueta.appendChild(casillaSinCot);
      etiqueta.appendChild(el('span', null, 'Apruebo sin cotización'));
      cajaFalta.appendChild(etiqueta);
      form.appendChild(cajaFalta);
    }

    const acciones = el('div', 'acciones-form');
    const aprobar = boton('Aprobar y crear la actividad', 'btn primary');
    const rechazar = boton('No aprobar', 'btn peligro');
    const volver = boton('Volver');
    volver.addEventListener('click', function () { cargar(rolActual); });

    // Quien no decide ve los campos apagados y ningún botón de decisión.
    if (soloLectura || !permisos.decidir) {
      Array.prototype.slice.call(form.querySelectorAll('input, select, textarea'))
        .forEach(function (c) { c.disabled = true; });
      form.appendChild(el('p', 'bajada-tarjeta',
        'Su rol puede ver la propuesta, pero la decisión es de la administración.'));
      acciones.appendChild(volver);
      form.appendChild(acciones);
      cont.appendChild(form);
      return;
    }

    const motivo = textarea('rvMotivo', 'Explica al contratista por qué no se aprueba.');
    motivo.classList.add('oculto');
    form.appendChild(motivo);

    aprobar.addEventListener('click', async function () {
      if (!titulo.value.trim()) {
        return aviso('Escribe un título corto, por ejemplo «Cambio de empaque del domo».', 'error');
      }
      aprobar.disabled = true;
      aprobar.textContent = 'Creando…';
      const res = await API.llamar('propuestas.aprobar', {
        id: abierta.propuesta.id,
        version: abierta && abierta.version,
        titulo: titulo.value.trim(),
        nodo_id: sel.value,
        descripcion: descripcion.value.trim(),
        fecha_inicio_plan: inicio.value,
        fecha_fin_plan: fin.value || inicio.value,
        prioridad: prioridad.value,
        valor_aprobado: valorAprobado
          ? (Number(String(valorAprobado.value).replace(/[^\d]/g, '')) || 0) : undefined,
        apruebo_sin_cotizacion: casillaSinCot ? casillaSinCot.checked : undefined,
      }, { token: Sesion.token(), idempotente: true });
      aprobar.disabled = false;
      aprobar.textContent = 'Aprobar y crear la actividad';
      if (!res.ok) return aviso(res.message || 'No se pudo aprobar.', 'error');
      aviso('Actividad creada.', 'ok');
      if (window.App) App.refrescar();
      cargar(rolActual);
    });

    rechazar.addEventListener('click', async function () {
      if (motivo.classList.contains('oculto')) {
        motivo.classList.remove('oculto');
        motivo.focus();
        return;
      }
      if (motivo.value.trim().length < 10) return aviso('Escribe el motivo (al menos 10 caracteres).', 'error');
      rechazar.disabled = true;
      const res = await API.llamar('propuestas.rechazar', {
        id: abierta.propuesta.id, motivo: motivo.value.trim(),
        version: abierta && abierta.version,
      }, { token: Sesion.token(), idempotente: true });
      rechazar.disabled = false;
      if (!res.ok) return aviso(res.message || 'No se pudo rechazar.', 'error');
      aviso('Propuesta rechazada.', 'ok');
      cargar(rolActual);
    });

    acciones.appendChild(aprobar);

    // V5 · Corregir la actividad sin decidir: la propuesta sigue pendiente.
    if (permisos.editar) {
      const guardar = boton('Guardar cambios', 'btn');
      guardar.addEventListener('click', async function () {
        guardar.disabled = true;
        guardar.textContent = 'Guardando…';
        const r = await API.llamar('propuestas.editar', {
          id: abierta.propuesta.id,
          version: abierta.version,
          titulo: titulo.value.trim(),
          nodo_id: sel.value,
          descripcion: descripcion.value.trim(),
          fecha_inicio_plan: inicio.value,
          fecha_fin_plan: fin.value || inicio.value,
          prioridad: prioridad.value,
          valor_aprobado: valorAprobado
            ? (Number(String(valorAprobado.value).replace(/[^\d]/g, '')) || 0) : undefined,
        }, { token: Sesion.token(), idempotente: true });
        guardar.disabled = false;
        guardar.textContent = 'Guardar cambios';
        if (!r.ok) return aviso(r.message || 'No se pudo guardar.', 'error');
        abierta.version = r.data.version || abierta.version;
        aviso('Cambios guardados. La propuesta sigue pendiente.', 'ok');
      });
      acciones.appendChild(guardar);
    }

    acciones.appendChild(rechazar);

    if (permisos.eliminar) {
      const eliminar = boton('Eliminar', 'btn peligro');
      let armado = false;
      eliminar.addEventListener('click', async function () {
        // Doble confirmación con cuenta atrás: eliminar no se deshace.
        if (!armado) {
          armado = true;
          eliminar.textContent = 'Confirmar eliminación (6 s)';
          eliminar.disabled = true;
          let quedan = 6;
          const reloj = setInterval(function () {
            quedan--;
            eliminar.textContent = 'Confirmar eliminación (' + quedan + ' s)';
            if (quedan <= 0) {
              clearInterval(reloj);
              armado = false;
              eliminar.disabled = false;
              eliminar.textContent = 'Eliminar';
            }
          }, 1000);
          eliminar.disabled = false;
          eliminar.dataset.reloj = String(reloj);
          return;
        }
        const motivo = window.prompt('¿Por qué se elimina? (queda en la auditoría y le llega al contratista)', '');
        if (!motivo || motivo.trim().length < 10) {
          aviso('Escribe al menos 10 caracteres de motivo.', 'error');
          return;
        }
        eliminar.disabled = true;
        const r = await API.llamar('propuestas.eliminar',
          { id: abierta.propuesta.id, motivo: motivo.trim(), version: abierta.version },
          { token: Sesion.token(), idempotente: true });
        eliminar.disabled = false;
        if (!r.ok) { aviso(r.message || 'No se pudo eliminar.', 'error'); return; }
        aviso('Propuesta eliminada.', 'ok');
        cargar(rolActual);
      });
      acciones.appendChild(eliminar);
    }

    acciones.appendChild(volver);
    form.appendChild(acciones);
    cont.appendChild(form);
  }

  /**
   * Al volver a la pestaña de actividades. El cambio de pestaña cierra esta tarjeta y no la
   * abre (error aprendido 8), así que la reabre quien sabe para qué rol es: sin esto, el
   * administrador salía de la pestaña y al volver ya no veía las propuestas por aprobar.
   */
  function alEntrar() {
    if (!cargado || rolActual === 'CONTRATISTA') return;
    const tarjeta = document.getElementById('tarjetaPropuestas');
    if (tarjeta) tarjeta.classList.remove('oculto');
  }

  window.Propuestas = { cargar: cargar, alEntrar: alEntrar };
})();
