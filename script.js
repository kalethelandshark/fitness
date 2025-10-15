async function loadData(){
  const res = await fetch('data.json');
  const data = await res.json();
  renderAll(data);
}

function renderAll(data){
  document.getElementById('week-start').textContent = data.week_start;

  // Days
  const daysHolder = document.getElementById('days');
  daysHolder.innerHTML = '';
  ['Monday','Wednesday','Friday'].forEach(dayName=>{
    const day = data.days[dayName];
    const card = document.createElement('div');
    card.className = 'day-card';
    const h = document.createElement('h3');
    h.textContent = `${dayName} — ${day.date} (${day.session})`;
    card.appendChild(h);

    if(day.exercises && day.exercises.length){
      day.exercises.forEach(ex=>{
        const exEl = document.createElement('div');
        exEl.className = 'exercise';
        exEl.innerHTML = `<strong>${ex.name}</strong><div class="small">${ex.sets} sets · ${ex.reps} reps ${ex.notes? '· ' + ex.notes:''}</div>`;
        card.appendChild(exEl);
      });
    } else {
      const p = document.createElement('div');
      p.className = 'small';
      p.textContent = 'No exercises listed';
      card.appendChild(p);
    }
    daysHolder.appendChild(card);
  });

  // Weight table
  const tbody = document.querySelector('#weight-table tbody');
  tbody.innerHTML = '';
  data.weight_tracker.forEach(row=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${row.day}</td><td>${row.date}</td><td>${row.weight || ''}</td>`;
    tbody.appendChild(tr);
  });

  // Exercise list
  const ul = document.getElementById('exercise-list-ul');
  ul.innerHTML = '';
  data.exercise_list.forEach(ex=>{
    const li = document.createElement('li');
    li.textContent = ex;
    ul.appendChild(li);
  });
}

// dark mode toggle
document.addEventListener('DOMContentLoaded',()=>{
  const btn = document.getElementById('dark-toggle');
  const saved = localStorage.getItem('dark') === '1';
  if(saved) document.body.classList.add('dark');
  btn.addEventListener('click',()=>{
    document.body.classList.toggle('dark');
    localStorage.setItem('dark', document.body.classList.contains('dark') ? '1' : '0');
  });
  loadData();
});
