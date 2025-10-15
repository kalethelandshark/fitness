/***** CONFIG *****/
const SHEET_WEBAPP = "/.netlify/functions/gas-proxy";

/* WEEK_TEMPLATE layout from your screenshot:
   Monday rows:     7..14   (7-12 main, 13 Deadhangs, 14 Burpees)
   Wednesday rows: 18..25
   Friday rows:    29..36
   Columns B..I: B=Exercise, C=Variation, D=Sets, E=Reps, F=Weight, G=RPE, H=Notes, I=Done
*/
const DAY_ROW_BASE = { Monday: 7, Wednesday: 18, Friday: 29 }; // slot 1 row for each day
const SLOTS_PER_DAY = 8; // 1-6 regular + 7 Deadhangs + 8 Burpees
const COLS = { exercise:'B', variation:'C', sets:'D', reps:'E', weight:'F', rpe:'G', notes:'H', done:'I' };

// Exercise list (used for slots 1-6)
const EXERCISES = [
  "Pushup","Dip","Pike Pushup","Elevated Pike","Wall HSPU","Pullup","Chinup",
  "Back Row","Back Row Elevated","Tuck Lever","Front Lever","Squat","Assisted Pistol",
  "Pistol Squat","Ab Wheel","Knee Raises","L Raises"
];
// Slots 7-8 fixed:
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
    const json = await res.json();
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
    wrap.textContent = 'Failed to load overview.';
    console.error(err);
  }
}

/***** ENTRY (entry.html) *****/
function initEntryPage(){
  // Default date = most recent Monday
  const today = new Date();
  const monday = new Date(today);
  const day = monday.getDay(); // 0=Sun
  const diffToMon = (day+6)%7;
  monday.setDate(monday.getDate() - diffToMon);
  document.getElementById('week-start').value = toISODate(monday);

  // dropdown of existing weeks
  loadWeeksForEntry();

  // wire actions
  document.getElementById('ensure-week').addEventListener('click', ensureWeek);
  document.getElementById('weight-send').addEventListener('click', sendWeight);

  // Build the 8-row day table
  buildDayTable();

  // Buttons to write/log the whole day
  document.getElementById('write-day-cells').addEventListener('click', writeWholeDayToSheet);
  document.getElementById('log-day').addEventListener('click', logWholeDay);

  // “Use selected week”
  document.getElementById('use-week').addEventListener('click', ()=>{
    const sel = document.getElementById('week-select');
    const name = sel.value;
    if(!name) return;
    document.getElementById('week-start').value = isoFromWeekName(name);
    const status = document.getElementById('ensure-status');
    status.textContent = `selected: ${name}`;
    setTimeout(()=> status.textContent = '', 2000);
  });
  document.getElementById('week-select').addEventListener('change', (e)=>{
    const name = e.target.value;
    if(name) document.getElementById('week-start').value = isoFromWeekName(name);
  });
}

function toISODate(d){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function weekdayLabel(d){ return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()] }
function isoFromWeekName(name){ return name.replace(/^Week\s+/, '').trim(); }

async function loadWeeksForEntry(){
  const sel = document.getElementById('week-select');
  try{
    const res = await fetch(`${SHEET_WEBAPP}?fn=overview&limit=200`);
    const json = await res.json();
    if(!json.ok) throw new Error(json.error || 'overview failed');

    sel.innerHTML = '';
    if(!json.weeks || json.weeks.length === 0){
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
  const wk = document.getElementById('week-start').value;
  const status = document.getElementById('ensure-status');
  if(!wk){ status.textContent='pick a Monday date'; return; }
  status.textContent = 'creating…';
  try{
    await postJSON({type:'ensure_week', week_start: wk});
    const name = `Week ${wk}`;
    status.textContent = `ready: ${name}`;
    await loadWeeksForEntry();
    const sel = document.getElementById('week-select');
    Array.from(sel.options).forEach(opt=>{
      if(opt.value === name) sel.value = name;
    });
  }catch(e){
    status.textContent = 'error';
    console.error(e);
  } finally {
    setTimeout(()=> status.textContent='', 2500);
  }
}

/***** DAY TABLE (8 slots) *****/
function buildDayTable(){
  const tbody = document.querySelector('#ex-table tbody');
  tbody.innerHTML = '';
  for(let slot=1; slot<=SLOTS_PER_DAY; slot++){
    const tr = document.createElement('tr');

    // Slot
    const tdSlot = document.createElement('td');
    tdSlot.textContent = slot;
    tr.appendChild(tdSlot);

    // Exercise (dropdown for 1-6, fixed for 7-8)
    const tdEx = document.createElement('td');
    if(slot<=6){
      const sel = document.createElement('select');
      sel.innerHTML = `<option value="">Select</option>` + EXERCISES.map(x=>`<option>${x}</option>`).join('');
      sel.id = `slot${slot}-exercise`;
      tdEx.appendChild(sel);
    }else{
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.readOnly = true;
      inp.value = (slot===7? FIXED_SLOT7 : FIXED_SLOT8);
      inp.id = `slot${slot}-exercise`;
      tdEx.appendChild(inp);
    }
    tr.appendChild(tdEx);

    // Variation
    const tdVar = document.createElement('td');
    const varSel = document.createElement('select');
    varSel.innerHTML = `<option>Normal</option><option>Bands</option><option>Elevated</option><option>Assisted</option>`;
    varSel.id = `slot${slot}-variation`;
    tdVar.appendChild(varSel);
    tr.appendChild(tdVar);

    // Sets, Reps, Weight, RPE, Notes, Done
    tr.appendChild(simpleCell(`slot${slot}-sets`, 'number'));
    tr.appendChild(simpleCell(`slot${slot}-reps`, 'text'));
    tr.appendChild(simpleCell(`slot${slot}-weight`, 'text'));
    tr.appendChild(simpleCell(`slot${slot}-rpe`, 'number'));
    tr.appendChild(simpleCell(`slot${slot}-notes`, 'text'));
    const tdDone = document.createElement('td');
    const chk = document.createElement('input');
    chk.type = 'checkbox'; chk.id = `slot${slot}-done`;
    tdDone.appendChild(chk); tr.appendChild(tdDone);

    tbody.appendChild(tr);
  }
}
function simpleCell(id, type){
  const td = document.createElement('td');
  const inp = document.createElement('input');
  inp.type = type; inp.id = id;
  td.appendChild(inp);
  return td;
}

/***** WRITE WHOLE DAY TO SHEET *****/
async function writeWholeDayToSheet(){
  const wkISO = document.getElementById('week-start').value;
  const sheet = `Week ${wkISO}`;
  const dayName = document.getElementById('ex-day').value; // Monday/Wednesday/Friday
  const status = document.getElementById('ex-status');

  if(!wkISO){ status.textContent='set week'; return; }

  const baseRow = DAY_ROW_BASE[dayName];
  if(!baseRow){ status.textContent='bad day'; return; }

  // Build A1 cell writes for all 8 slots
  const cells = [];
  for(let slot=1; slot<=SLOTS_PER_DAY; slot++){
    const row = baseRow + (slot-1);
    const exercise = getVal(`slot${slot}-exercise`);
    const variation = getVal(`slot${slot}-variation`);
    const sets = getVal(`slot${slot}-sets`);
    const reps = getVal(`slot${slot}-reps`);
    const weight = getVal(`slot${slot}-weight`);
    const rpe = getVal(`slot${slot}-rpe`);
    const notes = getVal(`slot${slot}-notes`);
    const done = document.getElementById(`slot${slot}-done`).checked;

    // skip totally empty rows except fixed 7/8 (we still write their name + notes if any)
    const isEmpty = !exercise && !variation && !sets && !reps && !weight && !rpe && !notes && !done;
    if(isEmpty && slot<=6) continue;

    cells.push({a1: a1(COLS.exercise, row),  value: exercise});
    cells.push({a1: a1(COLS.variation, row), value: variation});
    cells.push({a1: a1(COLS.sets, row),      value: sets});
    cells.push({a1: a1(COLS.reps, row),      value: reps});
    cells.push({a1: a1(COLS.weight, row),    value: weight});
    cells.push({a1: a1(COLS.rpe, row),       value: rpe});
    cells.push({a1: a1(COLS.notes, row),     value: notes});
    cells.push({a1: a1(COLS.done, row),      value: done ? true : false});
  }

  status.textContent = 'writing…';
  try{
    await postJSON({type:'write_cells', sheet, cells});
    status.textContent = 'day saved ✓';
  }catch(e){
    console.error(e);
    status.textContent = 'error';
  }finally{
    setTimeout(()=> status.textContent='', 2500);
  }
}

/***** LOG WHOLE DAY TO EXERCISE LOG (BATCH) *****/
async function logWholeDay(){
  const status = document.getElementById('ex-status');
  const week_start = document.getElementById('week-start').value; // Monday ISO, e.g. 2025-10-13
  const dayLabel   = document.getElementById('ex-day').value;     // Monday | Wednesday | Friday
  const dateISO    = document.getElementById('ex-date').value || toISODate(new Date());

  if(!week_start){ status.textContent = 'set week'; return; }

  const rows = [];
  for(let slot=1; slot<=SLOTS_PER_DAY; slot++){
    const exercise  = getVal(`slot${slot}-exercise`);
    const variation = getVal(`slot${slot}-variation`);
    const sets      = getVal(`slot${slot}-sets`);
    const reps      = getVal(`slot${slot}-reps`);
    const weight    = getVal(`slot${slot}-weight`);
    const rpe       = getVal(`slot${slot}-rpe`);
    const notes     = getVal(`slot${slot}-notes`);
    const done      = document.getElementById(`slot${slot}-done`).checked;

    // For slots 1-6, skip totally empty rows
    const empty = !exercise && !variation && !sets && !reps && !weight && !rpe && !notes && !done;
    if (slot <= 6 && empty) continue;

    rows.push({
      week_start, day: dayLabel, date: dateISO, slot,
      exercise, variation, sets, reps, weight, rpe, notes, done
    });
  }

  if(rows.length === 0){ status.textContent = 'nothing to log'; return; }

  status.textContent = 'logging…';
  try{
    await postJSON({ type: 'exercise_batch', rows });
    status.textContent = 'logged ✓';
  }catch(e){
    console.error(e);
    status.textContent = 'error';
  }finally{
    setTimeout(()=> status.textContent = '', 2500);
  }
}


/*** Weight logging (append to Weights) ***/
async function sendWeight(){
  const user = document.getElementById('weight-user').value.trim();
  const day = document.getElementById('weight-day').value.trim() || weekdayLabel(new Date());
  const date = document.getElementById('weight-date').value || toISODate(new Date());
  const weight = document.getElementById('weight-value').value;
  const status = document.getElementById('weight-status');

  if(!weight){ status.textContent='enter a weight'; return; }
  status.textContent = 'logging…';
  try{
    await postJSON({type:'weight', user, day, date, weight});
    status.textContent = 'saved ✓';
  }catch(e){
    status.textContent = 'error';
    console.error(e);
  }finally{
    setTimeout(()=> status.textContent='', 2500);
  }
}

/*** helpers ***/
function getVal(id){ const el = document.getElementById(id); return el ? (el.value ?? '').trim() : ''; }
function a1(col, row){ return `${col}${row}`; }

/*** MERGED robust POST with fallback ***/
async function postJSON(obj){
  if(!SHEET_WEBAPP || SHEET_WEBAPP.startsWith('PASTE_')) throw new Error('SHEET_WEBAPP not set');

  try {
    const res = await fetch(SHEET_WEBAPP, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(obj),
      credentials: 'omit' // safer when running from file://
    });

    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('application/json')) {
      const json = await res.json();
      if(!json.ok) throw new Error(json.error || 'request failed');
      return json;
    }
    // Non-JSON (often a login page) -> use fallback
    throw new Error('Non-JSON response');
  } catch (_) {
    // Fire-and-forget fallback for local usage / opaque responses
    await fetch(SHEET_WEBAPP, {
      method: 'POST',
      mode: 'no-cors',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(obj),
      credentials: 'omit'
    });
    return { ok: true, via: 'no-cors' };
  }
}
