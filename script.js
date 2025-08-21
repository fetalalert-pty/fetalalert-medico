/* ============================
   CONFIGURACIÓN
   ============================ */
// Para la demo local, apunta al JSON junto al HTML
const APPS_URL   = './medico_demo.json';
// Clave por defecto (fallback) – no se usa en JSON local, se mantiene por compatibilidad
const DEFAULT_KEY = 'FA-Cloud-2025_vJtF!p03';

// Fecha mínima (arranque del proyecto en demo)
const MIN_DATE_STR = '2025-07-01';

// Etiquetas del estado global (píldora)
const LBL_STATE = {
  ok:   'Dentro de rango',
  warn: 'Bajo observación',
  err:  'Alerta',
  idle: 'Esperando datos…'
};

/* ============================
   UTILIDADES
   ============================ */
function qs(sel){ return document.querySelector(sel); }

function getQueryParams(){
  const p = new URLSearchParams(window.location.search);
  const hadKey = p.has('key');
  return {
    key:       p.get('key')       || DEFAULT_KEY,
    deviceId:  p.get('deviceId')  || '',
    patientId: p.get('patientId') || '',
    hadKey
  };
}

// Etiquetas clínicas por tarjeta
function statusHR(hr){
  if (hr == null || hr === '' || isNaN(hr)) return '–';
  const v = Number(hr);
  if (v < 60 || v > 120) return 'Fuera de umbral establecido';
  if (v < 65 || v > 110) return 'Zona de observación';
  return 'Dentro de umbral';
}
function statusSpO2(s){
  if (s == null || s === '' || isNaN(s)) return '–';
  const v = Number(s);
  if (v < 90) return 'Fuera de umbral establecido';
  if (v < 94) return 'Zona de observación';
  return 'Dentro de umbral';
}

// Fechas
function toYMD(d){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const da = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${da}`;
}
function parseDDMMYYYY(str){ // '04/05/2025'
  if (!str) return null;
  const [dd,mm,yyyy] = str.split('/').map(x=>parseInt(x,10));
  if (!yyyy || !mm || !dd) return null;
  return new Date(yyyy, mm-1, dd);
}
function parseRowDate(r){ // combina fecha + hora
  const d = parseDDMMYYYY(r?.fecha);
  if (!d) return null;
  const [hh,mi] = String(r?.hora||'00:00').split(':').map(x=>parseInt(x,10));
  d.setHours(hh||0, mi||0, 0, 0);
  return d;
}
function diffMinutes(a,b){ return Math.round((a-b)/60000); }
function diffMonths(a,b){
  if (!a || !b) return 0;
  return (b.getFullYear()-a.getFullYear())*12 + (b.getMonth()-a.getMonth()) + 1;
}
function fmtMonthYear(d){
  if (!d) return '--';
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${meses[d.getMonth()]} ${d.getFullYear()}`;
}

/* ============================
   RENDER
   ============================ */
function renderConnection(state){
  const el = qs('#md-conn');
  if (!el) return;
  if (state==='ok'){
    el.textContent = 'Datos recibidos';
    el.className = 'md-conn md-conn--ok';
  }else if(state==='err'){
    el.textContent = 'Sin conexión con FA Cloud';
    el.className = 'md-conn md-conn--err';
  }else{
    el.textContent = 'Conectando a FA Cloud…';
    el.className = 'md-conn md-conn--idle';
  }
}

function renderSummary(last){
  qs('#last-date').textContent = last?.fecha || '--';
  qs('#last-time').textContent = last?.hora || '--';
  qs('#last-hr').textContent   = (last?.fc   ?? '--');
  qs('#last-spo2').textContent = (last?.spo2 ?? '--');
  qs('#last-mov').textContent  = (last?.patadas ?? '--');

  const hrMsg   = statusHR(last?.fc);
  const spo2Msg = statusSpO2(last?.spo2);

  qs('#last-hr-status').textContent   = hrMsg;
  qs('#last-spo2-status').textContent = spo2Msg;

  // Estado global (píldora)
  const st = qs('#md-status');
  if (hrMsg === 'Fuera de umbral establecido' || spo2Msg === 'Fuera de umbral establecido') {
    st.textContent = LBL_STATE.err;
    st.className   = 'md-status md-status--err';
  } else if (hrMsg === 'Zona de observación' || spo2Msg === 'Zona de observación') {
    st.textContent = LBL_STATE.warn;
    st.className   = 'md-status md-status--warn';
  } else if (last) {
    st.textContent = LBL_STATE.ok;
    st.className   = 'md-status md-status--ok';
  } else {
    st.textContent = LBL_STATE.idle;
    st.className   = 'md-status md-status--idle';
  }
}

// Detalle compacto del estado
function renderStateDetails(rows){
  const extra = qs('#md-state-extra');
  if (!extra) return;

  if (!rows || !rows.length){
    extra.innerHTML = 'Sin datos en el rango seleccionado.';
    return;
  }

  const now = new Date();
  const lastDT = parseRowDate(rows[0]);
  let agoTxt = '--';
  if (lastDT){
    const mins = diffMinutes(now, lastDT);
    if (mins < 60) agoTxt = `${mins} min`;
    else {
      const h = Math.floor(mins/60), m = mins%60;
      agoTxt = `${h} h ${m} min`;
    }
  }

  const cut1h  = new Date(now.getTime() - 60*60000);
  const cut30m = new Date(now.getTime() - 30*60000);
  let lowSp = 0, zeroMov = 0;

  const dates = [];
  for (const r of rows){
    const dt = parseRowDate(r);
    if (!dt) continue;
    dates.push(dt);
    if (dt >= cut1h  && Number(r.spo2) < 90) lowSp++;
    if (dt >= cut30m && Number(r.patadas) === 0) zeroMov++;
  }
  dates.sort((a,b)=>a-b);
  const start = dates[0], end = dates[dates.length-1];

  extra.innerHTML = `
    Última actualización: ${rows[0]?.hora ?? '--'} (hace ${agoTxt}).<br>
    SpO₂ &lt; 90% en 1 h: ${lowSp}. Movimientos en 30 min: ${zeroMov === 0 ? 'OK' : zeroMov + ' sin movimientos'}.<br>
    Cobertura en base de datos: ${fmtMonthYear(start)} – ${fmtMonthYear(end)} (${diffMonths(start,end)} meses).
  `;
}

function renderTable(rows){
  const tb = document.getElementById('tbl-body');
  tb.innerHTML = '';
  if (!rows || rows.length === 0){
    tb.innerHTML = `<tr><td colspan="5" class="md-empty">Sin datos…</td></tr>`;
    return;
  }
  rows.forEach(r=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.fecha || ''}</td>
      <td>${r.hora || ''}</td>
      <td>${r.fc ?? ''}</td>
      <td>${r.spo2 ?? ''}</td>
      <td>${r.patadas ?? ''}</td>
    `;
    tb.appendChild(tr);
  });
}

/* Exportar CSV del lado del navegador */
function exportCSV(rows){
  if(!rows || !rows.length){ alert('No hay datos para exportar'); return; }
  const header = ['FECHA','HORA','FC','SpO2','PATADAS'];
  const lines  = rows.map(r => [r.fecha||'', r.hora||'', r.fc??'', r.spo2??'', r.patadas??''].join(','));
  const csv    = [header.join(','), ...lines].join('\n');
  const blob   = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url    = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'historial_fetalalert.csv';
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

/* ============================
   FETCH
   ============================ */
async function fetchList(params){
  const isLocal = APPS_URL.endsWith('.json');

  let urlStr;
  if (isLocal){
    urlStr = APPS_URL; // no agregamos query params al JSON local
  } else {
    const url = new URL(APPS_URL);
    url.searchParams.set('action','list');
    if (params.key)       url.searchParams.set('key', params.key);
    if (params.deviceId)  url.searchParams.set('deviceId', params.deviceId);
    if (params.patientId) url.searchParams.set('patientId', params.patientId);
    const f = qs('#fld-from')?.value || '';
    const t = qs('#fld-to')?.value   || '';
    if (f) url.searchParams.set('from', f);
    if (t) url.searchParams.set('to', t);
    urlStr = url.toString();
  }

  try{
    renderConnection('idle');
    const res = await fetch(urlStr, { method:'GET' });
    if (!res.ok) throw new Error('HTTP '+res.status);
    const json = await res.json();
    if (!json.ok) throw new Error('Respuesta no OK');
    renderConnection('ok');

    let rows = json.rows || [];

    // En modo local, filtramos por fecha en el cliente y nos aseguramos del orden
    if (isLocal){
      const fVal = qs('#fld-from')?.value || '';
      const tVal = qs('#fld-to')?.value   || '';
      const fromDate = fVal ? new Date(fVal) : null;
      const toDate   = tVal ? new Date(tVal) : null;

      rows = rows.filter(r=>{
        const d = parseDDMMYYYY(r.fecha);
        if (!d) return false;
        let ok = true;
        if (fromDate) ok = ok && (d >= fromDate);
        if (toDate)   ok = ok && (d <= toDate);
        return ok;
      });
      // Orden descendente por fecha+hora
      rows.sort((a,b)=> parseRowDate(b) - parseRowDate(a));
    }

    renderSummary(rows[0] || null);
    renderStateDetails(rows);
    renderTable(rows.slice(0,50)); // recorta tabla a 50
    return rows;
  }catch(e){
    console.warn('Error fetch list:', e);
    renderConnection('err');
    renderSummary(null);
    renderStateDetails([]);
    renderTable([]);
    return [];
  }
}

/* ============================
   INIT
   ============================ */
document.addEventListener('DOMContentLoaded', ()=>{
  const params = getQueryParams();

  // Pinta el deviceId recibido por URL
  if (params.deviceId) document.getElementById('fld-patient').value = params.deviceId;

  // Inicializa límites y valores por defecto del datepicker
  const fromEl = document.getElementById('fld-from');
  const toEl   = document.getElementById('fld-to');
  const today  = new Date();

  // límites inferiores fijos
  fromEl.setAttribute('min', MIN_DATE_STR);
  toEl.setAttribute('min',   MIN_DATE_STR);

  // valores por defecto (jul 2025 → hoy)
  if (!fromEl.value) fromEl.value = MIN_DATE_STR;
  if (!toEl.value)   toEl.value   = toYMD(today);

  // coherencia: 'to' no puede ser menor que 'from'
  fromEl.addEventListener('change', ()=>{
    if (toEl.value < fromEl.value) toEl.value = fromEl.value;
    toEl.setAttribute('min', fromEl.value || MIN_DATE_STR);
  });

  // Botón aplicar
  document.getElementById('btn-apply').addEventListener('click', ()=>{
    const entered = document.getElementById('fld-patient').value.trim();

    const search = new URLSearchParams(window.location.search);
    if (entered) search.set('deviceId', entered); else search.delete('deviceId');

    // Si la clave venía en la URL, la conservamos; si no, no la escribimos.
    if (params.hadKey) search.set('key', params.key); else search.delete('key');

    history.replaceState({},'', `${location.pathname}?${search.toString()}`);
    fetchList(getQueryParams());
  });

  // Exportar CSV con los datos filtrados actuales
  document.getElementById('btn-export').addEventListener('click', async ()=>{
    const rows = await fetchList(getQueryParams());
    exportCSV(rows);
  });

  // Primera carga
  fetchList(params);

  // Auto-refresh cada 60s (opcional)
  setInterval(()=> fetchList(getQueryParams()), 60000);
});
