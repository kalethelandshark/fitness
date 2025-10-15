/***** CONFIG *****/
const SHEET_WEBAPP = "/.netlify/functions/gas-proxy"; // Netlify proxy → GAS /exec
const DEV_VERBOSE_ERRORS = true; // set false to restore silent fallback later

/* Week layout your UI uses:
   Monday rows:     7..14  (7-12 main, 13 Deadhangs, 14 Burpees)
   Wednesday rows:  18..25
   Friday rows:     29..36
   Columns B..I: B=Exercise, C=Variation, D=Sets, E=Reps, F=Weight, G=RPE, H=Notes, I=Done
*/
const DAY_ROW_BASE = { Monday: 7, Wednesday: 18, Friday: 29 };
const SLOTS_PER_DAY = 8;
const COLS = { exercise:'B', variation:'C', sets:'D', reps:'E', weight:'F', rpe:'G', notes:'H', done:'I' };

// Exercise list (slots 1–6). 7=Deadhangs, 8=Burpees fixed.
const EXERCISES = [
  "Pushup","Dip","Pike Pushup","Elevated Pike","Wall HSPU","Pullup","Chinup",
  "Back Row","Back Row Elevated","Tuck Lever","Front Lever","Squat","Assisted Pistol",
  "Pistol Squat","Ab Wheel","Knee Raises","L Raises"
];
const FIXED_SLOT7 = "Deadhangs";
const FIXED_SLOT8 = "Burpees";

/***** THEME *****/
function initTheme(){
  const btn = document.getElementById('dark-toggle');
  const saved = localStorage.getItem('dark') === '1';
  if(saved) document.body.classList.add('dark');
  if(btn){
    btn.addEventListener('click',()=>{
      document.body.classList.toggle('dark');
      localStorage.setItem('dark', document.body.classList.contains('dark') ? '1' : '0');
    });
  }
}

/***** OVERVIEW (index.html) *****/
async function loadOverview(){
  const wrap = document.getElementById('weeks');
  wrap.innerHTML = 'Loading…';
  try{
    const url = `${SHEET_WEBAPP}?fn=overview&limit=8`;
    const res = await fetch(url);
    const json = await ensureJSON(res);
    if(!json.ok) throw new Error(json.error || 'overview error');

    wrap.innerHTML = '';
    json.weeks.forEach(w=>{
      const div = document.createElement('div');
      div.className = 'card';
      div.innerHTML = `
        <div><strong>Week ${w.week_start}</strong></div>
        <div class="small">Exercises logged: ${w.exercises_logged}</div>
        <div class="small">Weight entries: ${w.entries_weight}</div>
        <div class="small">Avg weight: ${w.avg_weight ?? '—'}</div>
      `;
      wrap.appendChild(div);
    });
    if (json.weeks.length === 0){
      wrap.textContent = 'No weeks yet. Head to the entry page to create your first week.';
    }
  }catch(err){
    console.error(err);
    wrap.textContent = 'Failed to load overview.';
  }
}

/***** ENTRY (entry.html) *****/
function initEntryPage(){
  // default the Week input to this week's Monday
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay()+6)%7));
  const wkISO = toISODate(monday);
  const weekInput = document.getElementById('week-start');
  if (weekInput) weekInput.value = wkISO;

  // populate existing weeks
  loadWeeksForEntry();

  // wire actions
  byId('ensure-week').addEventListener('click', ensureWeek);
  byId('weight-send').addEventListener('click', sendWeight);
  byId('write-day-cells').addEventListener('click', writeWholeDayToSheet);
  byId('log-day').addEventListener('click', logWholeDay);

  // Use selected week dropdown → copies date to input
  byId('use-week').addEventListener('click', ()=>{
    const sel = byId('week-select');
    const name = sel.value;
    if(!name) return;
    weekInput.value = isoFromWeekName(name);
    setStatus('ensure-status', `selected: ${name}`, 2000);
  });
  byId('week-select').addEventListener('change', (e)=>{
    const name = e.target.value;
    if(name) weekInput.value = isoFromWeekName(name);
  });

  // Build table
  buildDayTable();

  // optional: console check
  checkConnection().catch(()=>{});
}

async function loadWeeksForEntry(){
  const sel = byId('week-select');
  try{
    const res = await fetch(`${SHEET_WEBAPP}?fn=overview&limit=200`);
    const json = await ensureJSON(res);

    sel.innerHTML = '';
    if(!json.ok || !json.weeks || json.weeks.length === 0){
      sel.innerHTML = `<option value="">No weeks yet</option>`;
      return;
    }
    const weeks = json.weeks.slice().sort((a,b)=> (a.week_start < b.week_start ? 1 : -1));
    weeks.forEach(w=>{
      const opt = document.createElement('option');
      opt.value = `Week ${w.week_start}`;
      opt.textContent = `Week ${w.week_start}`;
      sel.appendChild(opt);
    });
  }catch(e){
    console.error(e);
    sel.innerHTML = `<option value="">Failed to load weeks</option>`;
  }
}

async function ensureWeek(){
  const wk = byId('week-start').value;
  const status = 'ensure-status';
  if(!wk){ setStatus(status,'pick a Monday date'); return; }
  setStatus(status,'creating…');
  try{
    await postJSON({type:'ensure_week', week_start: wk});
    setStatus(status, `ready: Week ${wk}`, 2000);
    await loadWeeksForEntry();
    // select in dropdown if present
    const sel = byId('week-select');
    [...sel.options].forEach(o => { if (o.value === `Week ${wk}`) sel.value = o.value; });
  }catch(e){
    console.error(e);
    setStatus(status,'error');
  }
}

function buildDayTable(){
  const tbody = document.querySelector('#ex-table tbody');
  tbody.innerHTML = '';
  for(let slot=1; slot<=SLOTS_PER_DAY; slot++){
    const tr = document.createElement('tr');

    const tdSlot = document.createElement('td');
    tdSlot.textContent = slot;
    tr.appendChild(tdSlot);

    const tdEx = document.createElement('td');
    if(slot<=6){
      const sel = document.createElement('select');
      sel.innerHTML = `<option value="">Select</option>` + EXERCISES.map(x=>`<option>${x}</option>`).join('');
      sel.id = `slot${slot}-exercise`;
      tdEx.appendChild(sel);
    }else{
      const inp = document.createElement('input');
      inp.type = 'text'; inp.readOnly = true;
      inp.value = (slot===7? FIXED_SLOT7 : FIXED_SLOT8);
      inp.id = `slot${slot}-exercise`;
      tdEx.appendChild(inp);
    }
    tr.appendChild(tdEx);

    const tdVar = document.createElement('td');
    const varSel = document.createElement('select');
    varSel.innerHTML = `<option>Normal</option><option>Bands</option><option>Elevated</option><option>Assisted</option>`;
    varSel.id = `slot${slot}-variation`;
    tdVar.appendChild(varSel);
    tr.appendChild(tdVar);

    tr.appendChild(simpleCell(`slot${slot}-sets`, 'number'));
    tr.appendChild(simpleCell(`slot${slot}-reps`, 'text'));
    tr.appendChild(simpleCell(`slot${slot}-weight`, 'text'));
    tr.appendChild(simpleCell(`slot${slot}-rpe`, 'number'));
    tr.appendChild(simpleCell(`slot${slot}-notes`, 'text'));

    const tdDone = document.createElement('td');
    const chk = document.createElement('input');
    chk.type='checkbox'; chk.id=`slot${slot}-done`;
    tdDone.appendChild(chk);
    tr.appendChild(tdDone);

    tbody.appendChild(tr);
  }
}

async function writeWholeDayToSheet(){
  const wkISO = byId('week-start').value;
  const dayName = byId('ex-day').value;
  const status = 'ex-status';
  if(!wkISO){ setStatus(status,'set week'); return; }
  const baseRow = DAY_ROW_BASE[dayName];
  if(!baseRow){ setStatus(status,'bad day'); return; }

  const cells = [];
  for(let slot=1; slot<=SLOTS_PER_DAY; slot++){
    const row = baseRow + (slot-1);
    const exercise  = val(`slot${slot}-exercise`);
    const variation = val(`slot${slot}-variation`);
    const sets      = val(`slot${slot}-sets`);
    const reps      = val(`slot${slot}-reps`);
    const weight    = val(`slot${slot}-weight`);
    const rpe       = val(`slot${slot}-rpe`);
    const notes     = val(`slot${slot}-notes`);
    const done      = byId(`slot${slot}-done`).checked;

    const empty = !exercise && !variation && !sets && !reps && !weight && !rpe && !notes && !done;
    if (slot <= 6 && empty) continue;

    cells.push({a1: a1(COLS.exercise, row),  value: exercise});
    cells.push({a1: a1(COLS.variation, row), value: variation});
    cells.push({a1: a1(COLS.sets, row),      value: sets});
    cells.push({a1: a1(COLS.reps, row),      value: reps});
    cells.push({a1: a1(COLS.weight, row),    value: weight});
    cells.push({a1: a1(COLS.rpe, row),       value: rpe});
    cells.push({a1: a1(COLS.notes, row),     value: notes});
    cells.push({a1: a1(COLS.done, row),      value: !!done});
  }

  setStatus(status,'writing…');
  try{
    await postJSON({type:'write_cells', sheet:`Week ${wkISO}`, cells});
    setStatus(status,'day saved ✓', 2000);
  }catch(e){
    console.error(e); setStatus(status,'error');
  }
}

async function logWholeDay(){
  const status = 'ex-status';
  const week_start = byId('week-start').value;
  const dayLabel   = byId('ex-day').value;
  const dateISO    = byId('ex-date').value || toISODate(new Date());
  if(!week_start){ setStatus(status,'set week'); return; }

  const rows = [];
  for(let slot=1; slot<=SLOTS_PER_DAY; slot++){
    const exercise  = val(`slot${slot}-exercise`);
    const variation = val(`slot${slot}-variation`);
    const sets      = val(`slot${slot}-sets`);
    const reps      = val(`slot${slot}-reps`);
    const weight    = val(`slot${slot}-weight`);
    const rpe       = val(`slot${slot}-rpe`);
    const notes     = val(`slot${slot}-notes`);
    const done      = byId(`slot${slot}-done`).checked;

    const empty = !exercise && !variation && !sets && !reps && !weight && !rpe && !notes && !done;
    if (slot <= 6 && empty) continue;

    rows.push({ week_start, day: dayLabel, date: dateISO, slot,
      exercise, variation, sets, reps, weight, rpe, notes, done });
  }
  if(rows.length === 0){ setStatus(status,'nothing to log'); return; }

  setStatus(status,'logging…');
  try{
    await postJSON({ type:'exercise_batch', rows });
    setStatus(status,'logged ✓', 2000);
  }catch(e){
    console.error(e); setStatus(status,'error');
  }
}

async function sendWeight(){
  const user   = byId('weight-user').value.trim();
  const day    = byId('weight-day').value.trim() || weekdayLabel(new Date());
  const date   = byId('weight-date').value || toISODate(new Date());
  const weight = byId('weight-value').value;
  const status = 'weight-status';

  if(!weight){ setStatus(status,'enter a weight'); return; }
  setStatus(status,'saving…');
  try{
    await postJSON({ type:'weight', user, day, date, weight });
    setStatus(status,'saved ✓', 2000);
  }catch(e){
    console.error(e); setStatus(status,'error');
  }
}

/***** HELPERS *****/
function byId(id){ return document.getElementById(id); }
function val(id){ const el = byId(id); return el ? (el.value ?? '').trim() : ''; }
function a1(col,row){ return `${col}${row}`; }
function toISODate(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function weekdayLabel(d){ return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()] }
function isoFromWeekName(name){ return name.replace(/^Week\s+/, '').trim(); }
function setStatus(id, msg, clearMs){
  const el = byId(id); if(!el) return;
  el.textContent = msg || '';
  if (clearMs) setTimeout(()=>{ el.textContent=''; }, clearMs);
}

// Strict JSON checker (surfaces 500s instead of hiding them)
async function ensureJSON(res){
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (!ct.includes('application/json')) {
    const text = await res.text();
    throw new Error(`Non-JSON response (status ${res.status}): ${text.slice(0,180)}`);
  }
  return res.json();
}

// Debug-friendly POST (no silent no-cors fallback while we’re fixing writes)
async function postJSON(obj){
  if(!SHEET_WEBAPP) throw new Error('SHEET_WEBAPP not set');

  const res = await fetch(SHEET_WEBAPP, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify(obj),
    credentials: 'omit'
  });

  if (DEV_VERBOSE_ERRORS) {
    const json = await ensureJSON(res);
    if(!json.ok) throw new Error(json.error || `Failed (${res.status})`);
    return json;
  } else {
    try {
      const json = await ensureJSON(res);
      if(!json.ok) throw new Error(json.error || `Failed (${res.status})`);
      return json;
    } catch (_e) {
      // optional: uncomment for silent fire-and-forget in production
      // await fetch(SHEET_WEBAPP, { method:'POST', mode:'no-cors', headers:{'Content-Type':'application/json'}, body: JSON.stringify(obj) });
      throw _e;
    }
  }
}

async function checkConnection(){
  try{
    const res = await fetch(`${SHEET_WEBAPP}?ping=1`);
    const j = await ensureJSON(res);
    console.log('proxy:', j);
  }catch(e){
    console.warn('proxy ping failed', e);
  }
}
