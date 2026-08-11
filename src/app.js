/* Sismo CO — monitor sísmico
 *
 * Dos flujos independientes, deliberadamente separados:
 *   1. Catálogo USGS (fdsnws) — revisado, se consulta bajo demanda.
 *   2. Flujo EMSC por WebSocket — preliminar, llega solo.
 *
 * No se mezclan: las magnitudes de una red y otra no son la misma medida,
 * y juntarlas produce duplicados que falsean el conteo de réplicas.
 */
'use strict';

// ---------------------------------------------------------------- constantes

const USGS_API = 'https://earthquake.usgs.gov/fdsnws/event/1/query';
const EMSC_WS  = 'wss://www.seismicportal.eu/standing_order/websocket';

// Recuadro que cubre Colombia continental, el Chocó y el mar adyacente.
const CO_BBOX = { minlat: -5, maxlat: 14, minlon: -82, maxlon: -66 };

const LIVE_MAX = 40;   // eventos que retiene el panel en vivo
const CAT_MAX  = 100;  // eventos que pide al catálogo

// ------------------------------------------------------------------ utilidad

const $ = (sel) => document.querySelector(sel);

function magClass(m) {
  if (m === null || m === undefined) return 'm-unk';
  if (m >= 6) return 'm-6';
  if (m >= 5) return 'm-5';
  if (m >= 4) return 'm-4';
  if (m >= 3) return 'm-3';
  return 'm-lo';
}

function fmtMag(m) {
  return (m === null || m === undefined) ? '—' : Number(m).toFixed(1);
}

function fmtDepth(km) {
  return (km === null || km === undefined) ? '—' : `${Math.round(km)} km`;
}

/** Fecha local legible + "hace X" para el evento reciente. */
function fmtTime(ms) {
  const d = new Date(ms);
  const diff = Date.now() - ms;
  const abs = d.toLocaleString('es-CO', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
  if (diff < 0 || diff > 86400000) return abs;
  const min = Math.floor(diff / 60000);
  if (min < 1) return `${abs} · hace segundos`;
  if (min < 60) return `${abs} · hace ${min} min`;
  return `${abs} · hace ${Math.floor(min / 60)} h`;
}

/** Texto plano en el DOM: nunca innerHTML con datos de un feed remoto. */
function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}

/** Fila de evento compartida por ambos paneles. */
function renderEvent(ev) {
  const li = el('li', 'ev');
  if (ev.isNew) li.classList.add('ev-new');

  const mag = el('span', `mag ${magClass(ev.mag)}`, fmtMag(ev.mag));
  mag.setAttribute('aria-label', `magnitud ${fmtMag(ev.mag)}`);

  const body = el('div', 'ev-body');
  body.appendChild(el('p', 'ev-place', ev.place || 'Ubicación no reportada'));

  const meta = el('p', 'ev-meta');
  meta.appendChild(el('span', null, fmtTime(ev.time)));
  meta.appendChild(el('span', 'sep', ' · '));
  meta.appendChild(el('span', null, `prof. ${fmtDepth(ev.depth)}`));
  if (ev.magType) {
    meta.appendChild(el('span', 'sep', ' · '));
    meta.appendChild(el('span', null, ev.magType));
  }
  body.appendChild(meta);

  if (ev.url) {
    const a = el('a', 'ev-link', 'Detalle oficial');
    a.href = ev.url;
    a.target = '_blank';
    a.rel = 'noopener';
    body.appendChild(a);
  }

  li.appendChild(mag);
  li.appendChild(body);
  return li;
}

function paintList(node, events, emptyMsg) {
  node.replaceChildren();
  if (!events.length) {
    node.appendChild(el('li', 'empty', emptyMsg));
    return;
  }
  for (const ev of events) node.appendChild(renderEvent(ev));
}

// ------------------------------------------------------------ catálogo USGS

/** Normaliza un Feature GeoJSON del USGS al formato interno. */
function fromUsgs(f) {
  return {
    id: f.id,
    mag: f.properties.mag,
    magType: f.properties.magType,
    place: f.properties.place,
    time: f.properties.time,
    depth: f.geometry && f.geometry.coordinates ? f.geometry.coordinates[2] : null,
    url: f.properties.url,
  };
}

let catAbort = null;

async function loadCatalog() {
  const list = $('#catList');
  const meta = $('#catMeta');

  // Cancela la consulta anterior si el usuario cambia un filtro rápido.
  if (catAbort) catAbort.abort();
  catAbort = new AbortController();

  const days = Number($('#daysSel').value);
  const params = new URLSearchParams({
    format: 'geojson',
    starttime: new Date(Date.now() - days * 86400000).toISOString(),
    minmagnitude: $('#magSel').value,
    orderby: 'time',
    limit: String(CAT_MAX),
  });

  if ($('#regionSel').value === 'co') {
    params.set('minlatitude',  String(CO_BBOX.minlat));
    params.set('maxlatitude',  String(CO_BBOX.maxlat));
    params.set('minlongitude', String(CO_BBOX.minlon));
    params.set('maxlongitude', String(CO_BBOX.maxlon));
  }

  meta.textContent = 'cargando…';

  try {
    const res = await fetch(`${USGS_API}?${params}`, {
      signal: catAbort.signal,
      cache: 'no-store', // un sismo viejo servido de caché es peor que un error
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

    const json = await res.json();
    const events = (json.features || []).map(fromUsgs);

    paintList(list, events, 'Sin eventos para estos filtros.');
    meta.textContent = `${events.length} evento${events.length === 1 ? '' : 's'}`;
  } catch (err) {
    if (err.name === 'AbortError') return;
    console.error('[USGS] fallo la consulta:', err);
    paintList(list, [], `No se pudo consultar el USGS: ${err.message}`);
    meta.textContent = 'error';
  }
}

// -------------------------------------------------------- flujo en vivo EMSC

const live = new Map(); // unid -> evento (Map preserva orden de inserción)

/** Normaliza el payload del EMSC. Su unid identifica el evento entre revisiones. */
function fromEmsc(data) {
  const p = data.properties || {};
  return {
    id: p.unid || p.source_id,
    mag: p.mag,
    magType: p.magtype,
    place: p.flynn_region,
    time: p.time ? Date.parse(p.time) : Date.now(),
    depth: p.depth,
    url: p.unid ? `https://www.emsc-csem.org/Earthquake_information/earthquake.php?id=${p.unid}` : null,
    isNew: true,
  };
}

function paintLive() {
  const events = [...live.values()].sort((a, b) => b.time - a.time);
  paintList($('#liveList'), events, 'Esperando el primer evento del flujo en vivo…');
}

function upsertLive(ev) {
  if (!ev.id) return;
  // Un "update" del EMSC revisa un evento ya recibido: se reemplaza, no se duplica.
  live.delete(ev.id);
  live.set(ev.id, ev);
  while (live.size > LIVE_MAX) live.delete(live.keys().next().value);
  paintLive();
}

// -- conexión con backoff exponencial ---------------------------------------

let ws = null;
let retries = 0;
let retryTimer = null;

function setBadge(state, text) {
  const b = $('#wsBadge');
  if (!b) return;
  b.className = `badge badge-${state}`;
  b.textContent = `EMSC: ${text}`;
}

function connectEmsc() {
  clearTimeout(retryTimer);
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  setBadge('off', retries ? `reconectando (intento ${retries})…` : 'conectando…');

  try {
    ws = new WebSocket(EMSC_WS);
  } catch (err) {
    console.error('[EMSC] no se pudo abrir el WebSocket:', err);
    scheduleReconnect();
    return;
  }

  ws.addEventListener('open', () => {
    retries = 0;
    setBadge('on', 'en vivo');
    console.info('[EMSC] WebSocket conectado');
  });

  ws.addEventListener('message', (msg) => {
    try {
      const payload = JSON.parse(msg.data);
      if (payload && payload.data) upsertLive(fromEmsc(payload.data));
    } catch (err) {
      console.warn('[EMSC] mensaje ilegible, se ignora:', err);
    }
  });

  ws.addEventListener('close', (e) => {
    setBadge('off', 'desconectado');
    console.warn(`[EMSC] cerrado (código ${e.code})`);
    scheduleReconnect();
  });

  ws.addEventListener('error', () => {
    setBadge('err', 'error de conexión');
    // 'close' llega siempre después de 'error': la reconexión se agenda allí.
  });
}

function scheduleReconnect() {
  if (document.hidden) return; // se reintenta al volver a la pestaña
  retries += 1;
  const delay = Math.min(30000, 1000 * 2 ** Math.min(retries, 5));
  retryTimer = setTimeout(connectEmsc, delay);
}

// La pestaña oculta no necesita el socket abierto: gasta batería en móvil.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    clearTimeout(retryTimer);
    if (ws) ws.close(1000, 'pestaña oculta');
  } else {
    retries = 0;
    connectEmsc();
  }
});

// ---------------------------------------------------------------- arranque

function init() {
  for (const id of ['#regionSel', '#magSel', '#daysSel']) {
    $(id).addEventListener('change', loadCatalog);
  }
  $('#refreshBtn').addEventListener('click', loadCatalog);

  loadCatalog();
  connectEmsc();

  // El service worker solo cachea el armazón; los datos nunca. Requiere HTTPS
  // o localhost, así que en file:// simplemente no se registra.
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js')
        .then((r) => console.info('[SW] registrado, alcance:', r.scope))
        .catch((err) => console.error('[SW] fallo el registro:', err));
    });
  }
}

init();
