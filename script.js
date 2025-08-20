/* ============================
   CONFIGURACIÓN
   ============================ */
// URL de la Web App de Apps Script (termina en /exec)
const APPS_URL = 'https://script.google.com/macros/s/AKfycbzdvegcKreXfYtCVESD7_kftfONWgtUW5fXkuFwT4pcSCY6-v0ONHKddxr38HhKxTbi/exec';

/* ============================
   UTILIDADES
   ============================ */
function qs(sel){ return document.querySelector(sel); }

function getQueryParams(){
  const p = new URLSearchParams(window.location.search);
  return {
    key:       p.get('key')       || '',               
    deviceId:  p.get('deviceId')  || '',               
    patientId: p.get('patientId') || ''               
  };
}

function statusHR(hr){
  if (hr == null || hr === '' || isNaN(hr)) return '–';
  const v = Number(hr);
  if (v < 60 || v > 120) return 'Fuera de rango. Acuda a un médico.';
  if (v < 65 || v > 110) return 'Precaución, vuelva a medir.';
  return 'Todo normal.';
}
function statusSpO2(s){
  if (s == null || s === '' || isNaN(s)) return '–';
  const v = Number(s);
  if (v < 90) return 'Fuera de rango. Acuda a un médico.';
  if (v < 94) return 'Precaución, vuelva a medir.';
  return 'Todo normal.';
}

/* ============================
   RENDER
   ============================ */
function renderConnection(state){
  const el = qs('#md-conn');
  if (state==='ok'){
    el.textContent = 'Conectado';
    el.className = 'md-conn md-conn--ok';
  }else if(state==='err'){
    el.textContent = 'Error de conexión';
    el.className = 'md-conn md-conn--err';
  }else{
    el.textContent = 'Conectando…';
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

  const st = qs('#md-status');
  if (hrMsg.includes('Fuera') || spo2Msg.includes('Fuera')) {
    st.textContent = 'ALERTA: Parámetros fuera de rango';
    st.className   = 'md-status md-status--err';
  } else if (hrMsg.includes('Precaución') || spo2Msg.includes('Precaución')) {
    st.textContent = 'Precaución';
    st.className   = 'md-status md-status--warn';
  } else if (last) {
    st.textContent = 'En rango';
    st.className   = 'md-status md-status--ok';
  } else {
    st.textContent = 'Esperando datos…';
    st.className   = 'md-status md-status--idle';
  }
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
  const url = new URL(APPS_URL);
  url.searchParams.set('action','list');
  if (params.key)      url.searchParams.set('key', params.key);
  if (params.deviceId) url.searchParams.set('deviceId', params.deviceId);
  // Si implementas patientId en Apps Script, también puedes enviarlo
  if (params.patientId) url.searchParams.set('patientId', params.patientId);

  // Fechas (opcional)
  const f = qs('#fld-from')?.value || '';
  const t = qs('#fld-to')?.value   || '';
  if (f) url.searchParams.set('from', f);
  if (t) url.searchParams.set('to', t);

  try{
    renderConnection('idle');
    const res = await fetch(url.toString(), { method:'GET' });
    if (!res.ok) throw new Error('HTTP '+res.status);
    const json = await res.json();

    if (!json.ok) throw new Error('Respuesta no OK');
    renderConnection('ok');

    // Se asume que Apps Script ya ordena por fecha/hora desc
    const rows = json.rows || [];
    renderSummary(rows[0] || null);
    renderTable(rows.slice(0,50)); // recorta tabla a 50
    return rows;
  }catch(e){
    console.warn('Error fetch list:', e);
    renderConnection('err');
    renderSummary(null);
    renderTable([]);
    return [];
  }
}

/* ============================
   INIT
   ============================ */
document.addEventListener('DOMContentLoaded', ()=>{
  const params = getQueryParams();

  // Pinta el deviceId o patientId recibido por URL
  if (params.deviceId) document.getElementById('fld-patient').value = params.deviceId;
  // Si quieres mostrar patientId en lugar de deviceId: ajusta línea superior

  // Botón aplicar
  document.getElementById('btn-apply').addEventListener('click', ()=>{
    const entered = document.getElementById('fld-patient').value.trim();

    const search = new URLSearchParams(window.location.search);
    if (entered) search.set('deviceId', entered); else search.delete('deviceId');
    if (params.key) search.set('key', params.key);  // preserva key en URL

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
