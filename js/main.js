/* Данные дня сохраняются только в этом браузере. */
const widgetElements = new Map();
const $ = selector => document.querySelector(selector) || [...widgetElements.values()].map(element => element.matches(selector) ? element : element.querySelector(selector)).find(Boolean);
const dayKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
let today = dayKey();
const starter = [
  {id:'first',text:'Выбрать главное дело на день',category:'Для себя',done:false},
  {id:'second',text:'Уделить 25 минут своему проекту',category:'Работа',done:false},
  {id:'third',text:'Выйти на небольшую прогулку',category:'Для себя',done:false},
  {id:'fourth',text:'Навести порядок на рабочем столе',category:'Дом',done:false}
];
let state;
try { state = JSON.parse(localStorage.getItem('quiet-garden-v1')); } catch {}
if (!state || !state.days || !state.city) state = {days:{},city:{name:'Санкт-Петербург',latitude:59.9386,longitude:30.3141}};
if (!state.days[today]) state.days[today] = {tasks:structuredClone(starter)};
const components = new Map();
function createComponent(id) {
  const types = {
    'tasks-card': ToDoWidget, 'quote-card': QuoteWidget, 'garden-card': GardenWidget,
    'weather-card': WeatherWidget, 'stats-card': StatisticsWidget,
    'progress-card': ProgressWidget, 'collection-card': CollectionWidget,
    'focus-card': FocusWidget, 'water-card': WaterWidget,
    'finance-card': FinanceWidget, 'plant-card': PlantDiscoveryWidget, 'breath-card': BreathWidget
  };
  const element = document.getElementById(id) || widgetElements.get(id);
  if (!element || !types[id]) return null;
  const component = new types[id]({
    id, title: element.querySelector('h2,h3')?.textContent || id, element,
    data: state.days[today],
    currentIndex: state.quoteIndex,
    controls: id === 'tasks-card' ? {
      form: $('#task-form'), input: $('#task-input'), category: $('#category'), dialog: $('#task-dialog'),
      addButtons: [$('#add-top'), $('#add-task')], filters: [...element.querySelectorAll('[data-filter]')],
      list: $('#task-list'), count: $('#task-count'), showAll: $('#show-all-tasks'),
      allList: $('#all-tasks-list'), allSummary: $('#all-tasks-summary'), allDialog: $('#all-tasks-dialog')
    } : null,
    onChange: value => { if (id === 'quote-card') state.quoteIndex = value; save(); if (id !== 'quote-card') render(); },
    onClose: () => removeWidget(id)
  });
  widgetElements.set(id, element);
  components.set(id, component);
  return component;
}
function getComponent(id) {
  return components.get(id) || createComponent(id);
}
const dashboard = new Dashboard({
  container: $('#dashboard'), factory: createComponent, components,
  onChange: ids => { state.widgets = ids; save(); applyLayout(); }
});
function listen(target, type, handler) {
  const panel = target.closest('.panel');
  const taskControl = ['task-form', 'show-all-tasks', 'add-task', 'add-top'].includes(target.id);
  const component = getComponent(taskControl ? 'tasks-card' : panel?.id);
  if (component) component.listen(target, type, handler);
  else target.addEventListener(type, handler);
}
let view = 'overview', toastTimeout;
function save() {
  try { localStorage.setItem('quiet-garden-v1',JSON.stringify(state)); }
  catch { toast('Браузер не разрешает сохранение. Дела доступны в этой вкладке.'); }
}
function toast(text) {
  $('#toast').textContent = text;
  $('#toast').classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => $('#toast').classList.remove('show'),3500);
}
function tasks() { return getComponent('tasks-card').tasks; }
function completed(day) { return day.tasks.filter(t => t.done).length; }
function hasFlower(day) { return day.tasks.length > 0 && completed(day) === day.tasks.length; }
function render() {
  getComponent('tasks-card').renderPreview();
  const total = tasks().length, done = completed(state.days[today]), progress = total ? done/total : 0, percent = Math.round(progress*100);
  $('#task-count').textContent = total;
  $('#ring').style.setProperty('--progress',`${percent}%`); $('#ring-value').textContent = `${percent}%`; $('#done-value').textContent = `${done} из ${total}`;
  updatePlantGrowth();
  renderChart();
}
function renderChart() {
  const chart = $('#bar-chart'); chart.replaceChildren(); let sum = 0;
  const days = Array.from({length:7},(_,i) => {const d = new Date(); d.setDate(d.getDate()-6+i); const n = state.days[dayKey(d)] ? completed(state.days[dayKey(d)]) : 0; sum += n; return {d,n};});
  const max = Math.max(4,...days.map(d => d.n));
  for (const {d,n} of days) {
    const col = document.createElement('div'); col.className = 'bar-column'; col.title = `${d.toLocaleDateString('ru-RU')}: выполнено ${n}`;
    const value = document.createElement('span'); value.className = 'bar-value'; value.textContent = n;
    const bar = document.createElement('div'); bar.className = `bar ${dayKey(d) === today ? 'today' : ''}`; bar.style.height = `${Math.max(3,n/max*80)}px`;
    const label = document.createElement('small'); label.textContent = d.toLocaleDateString('ru-RU',{weekday:'short'});
    col.append(value,bar,label); chart.append(col);
  }
  $('#week-total').textContent = sum;
}
/* Навигация и формы. */
document.querySelectorAll('nav [data-view]').forEach(button => listen(button,'click',() => setView(button.dataset.view)));
document.querySelectorAll('.close-dialog').forEach(button => listen(button,'click',() => button.closest('dialog').close()));
listen($('#help'),'click',() => $('#info-dialog').showModal());
listen($('#settings'),'click',() => { $('#city-dialog').showModal(); $('#city-input').value = state.city.name; $('#city-input').focus(); });
listen($('#city-button'),'click',() => { $('#city-dialog').showModal(); $('#city-input').value = state.city.name; $('#city-input').focus(); });
/* Погода: реальный прогноз MET Norway, без выдуманных значений при ошибке. */
let weatherRequest = 0;
function weatherKind(code) { return code === 0 ? 'sun' : code <= 3 || code === 45 || code === 48 ? 'cloud' : (code >= 71 && code <= 77) || code === 85 || code === 86 ? 'snow' : 'rain'; }
function applyWeather(current) {
  const kind = weatherKind(current.weather_code);
  const source = $('.weather-source a');
  source.textContent = `Погода: ${current.source}`;
  source.href = current.sourceURL;
  $('#scene').classList.remove('weather-sun','weather-cloud','weather-rain','weather-snow','weather-night');
  $('#scene').classList.add(`weather-${kind}`); if (current.is_day === 0) $('#scene').classList.add('weather-night');
  const labels = {sun:'Ясно',cloud:'Облачно',rain:'Дождь',snow:'Снег'};
  $('#weather-icon').textContent = {sun:current.is_day === 0 ? '☾' : '☀',cloud:'☁',rain:'☂',snow:'❄'}[kind];
  $('#temp').textContent = `${Math.round(current.temperature_2m)}°`;
  $('#feels').textContent = new Date(current.forecastTime).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
  $('#humidity').textContent = Number.isFinite(current.relative_humidity_2m) ? current.relative_humidity_2m+'%' : '—';
  $('#wind').textContent = Number.isFinite(current.wind_speed_10m) ? current.wind_speed_10m+' км/ч' : '—';
  $('#weather-description').textContent = current.description || labels[kind];
  $('#scene-weather').textContent = current.is_day === 0 ? 'Тихий вечер в саду' : {sun:'Солнечный свет в саду',cloud:'Мягкий свет сквозь облака',rain:'В саду идёт дождь',snow:'Сад укрывается снегом'}[kind];
  $('#weather-message').textContent = '' + {sun:'Хороший день для маленькой прогулки. Твой сад тянется к свету.',cloud:'Мягкий свет и спокойный ритм. Можно сосредоточиться на одном деле.',rain:'Дождь поливает сад. А тебе можно сделать чай и заняться чем-то уютным.',snow:'За окном снег. Сад остаётся тёплым местом для твоих маленьких шагов.'}[kind];
  $('#rain').replaceChildren();
  if (kind === 'rain' || kind === 'snow') for (let i=0;i<25;i++) {const drop = document.createElement('i'); drop.className = 'raindrop'; drop.style.left = `${Math.random()*100}%`; drop.style.animationDelay = `${-Math.random()*4}s`; $('#rain').append(drop);}
  $('#weather-updated').textContent = `обновлено ${new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}`;
}
async function loadWeather() {
  const request = ++weatherRequest; $('#temp').textContent='—°'; $('#feels').textContent='—'; $('#humidity').textContent='—'; $('#wind').textContent='—'; $('#city-name').textContent = state.city.name;$('#selected-city').textContent=state.city.name; $('#weather-description').textContent = 'Обновляем погоду…';
  try {
    const current = await WeatherAPI.current(state.city);
    if (request !== weatherRequest) return;
    applyWeather(current);
  } catch (error) {
    if (request !== weatherRequest) return;
    $('#temp').textContent = '—°'; $('#feels').textContent = '—'; $('#humidity').textContent = '—'; $('#wind').textContent = '—';
    $('#weather-description').textContent = 'Погода недоступна'; $('#weather-updated').textContent = 'нет соединения';
    $('#weather-message').textContent = error.message || 'Погода временно недоступна.';
    $('#scene-weather').textContent = 'Погода пока неизвестна'; $('#rain').replaceChildren();
    $('#scene').classList.remove('weather-sun','weather-cloud','weather-rain','weather-snow','weather-night');
  }
}
listen($('#refresh-weather'),'click',loadWeather);
let citySearchId = 0;
listen($('#city-form'),'submit',async event => {
  event.preventDefault(); const name = $('#city-input').value.trim(); if (!name) return;
  const searchId = ++citySearchId;
  $('#city-error').textContent = 'Ищем город…'; $('#city-results').replaceChildren();
  try {
    const data = {results:await WeatherAPI.search(name)};
    if (searchId !== citySearchId) return;
    $('#city-error').textContent = data.results?.length ? 'Выбери подходящий город:' : 'Город не найден. Попробуй другое название.';
    for (const city of data.results || []) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = [city.name,city.admin1,city.country].filter(Boolean).join(', ');
      listen(button,'click',() => { state.city = {name:city.name,latitude:city.latitude,longitude:city.longitude}; save(); $('#city-dialog').close(); loadWeather(); }); $('#city-results').append(button);
    }
  } catch (error) { if (searchId === citySearchId) $('#city-error').textContent = error.message || 'Поиск городов недоступен. Проверь соединение.'; }
});
/* Фокус: отсчёт по времени, а не по числу срабатываний интервала. */
let remainingSeconds = 25*60, deadline = null;
listen($('#focus-button'),'click',() => {
  if (deadline) { remainingSeconds = Math.max(0,Math.ceil((deadline-Date.now())/1000)); deadline = null; $('#focus-button').textContent = '▷'; $('#focus-button').setAttribute('aria-label','Продолжить таймер'); }
  else { if (!remainingSeconds) remainingSeconds = 25*60; deadline = Date.now()+remainingSeconds*1000; $('#focus-button').textContent = 'Ⅱ'; $('#focus-button').setAttribute('aria-label','Приостановить таймер'); }
});
function tick() {
  $('#clock').textContent = new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
  $('#date').textContent = new Date().toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long'}).toUpperCase();
  if (dayKey() !== today) { today = dayKey(); if (!state.days[today]) state.days[today] = {tasks:structuredClone(starter)}; getComponent('tasks-card').setData(state.days[today]); save(); render(); }
  if (deadline) { remainingSeconds = Math.max(0,Math.ceil((deadline-Date.now())/1000)); if (!remainingSeconds) { deadline = null; $('#focus-button').textContent = '▷'; toast('25 минут позади. Сделай небольшую паузу ♡'); } }
  $('#timer').textContent = `${String(Math.floor(remainingSeconds/60)).padStart(2,'0')}:${String(remainingSeconds%60).padStart(2,'0')}`;
}
/* Личная раскладка виджетов и коллекция растений. */
const widgetDefinitions = [
  {id:'garden-card',name:'Живой сад',icon:'❧'},
  {id:'weather-card',name:'Погода',icon:'☁'},
  {id:'tasks-card',name:'План дня',icon:'☑'},
  {id:'stats-card',name:'Ритм недели',icon:'▥'},
  {id:'progress-card',name:'Прогресс дня',icon:'◔'},
  {id:'collection-card',name:'Мои цветы',icon:'✿'},
  {id:'focus-card',name:'Тихий фокус',icon:'◷'},
  {id:'water-card',name:'Стакан воды',icon:'♧'},
  {id:'breath-card',name:'Пауза дыхания',icon:'≈'},
  {id:'finance-card',name:'Курсы валют',icon:'₽'},
  {id:'plant-card',name:'Растение дня',icon:'❀'},
  {id:'quote-card',name:'Цитата дня',icon:'❞'}
];
const defaultWidgets = ['garden-card','weather-card','tasks-card','stats-card','progress-card','collection-card','focus-card'];
if (!Array.isArray(state.widgets)) state.widgets = [...defaultWidgets];
if (!state.plantWidgetAdded) { state.widgets.push('plant-card'); state.plantWidgetAdded = true; }
if (!state.financeWidgetAdded) { state.widgets.push('finance-card'); state.financeWidgetAdded = true; }
state.widgets = [...new Set(state.widgets)].filter(id => widgetDefinitions.some(w => w.id === id));
if (!state.plant) state.plant = 'daisy';
if (!Array.isArray(state.unlocked)) state.unlocked = ['daisy','rose','bell'];
const initialFlower = $('#plant .flower').innerHTML;
const flowers = {
  daisy:initialFlower,
  rose:'<g fill="var(--petal-color)"><path d="M-32 8 C-49-17-31-40-12-34 C-6-49 20-43 24-28 C48-26 48 6 29 16 C18 41-15 39-25 20Z"/><path d="M-24 2 C-20-29 23-26 26-3 C30 20-10 31-23 7Z" fill="var(--center-color)" opacity=".5"/><path d="M-9 4 C-18-13 13-20 17-4 C19 13-8 20-9 4Z" fill="var(--petal-color)"/><path d="M-6 2Q0-9 8 0" fill="none" stroke="var(--center-color)" stroke-width="3"/></g>',
  bell:'<g fill="var(--petal-color)"><path d="M-27 22 Q-29-31 0-33 Q29-31 27 22 Q15 14 10 27 Q0 17-10 27 Q-18 14-27 22Z"/><path d="M-10-27Q-17 0-10 20M10-27Q17 0 10 20" fill="none" stroke="var(--center-color)" stroke-width="2" opacity=".4"/><path d="M-4 20V32M6 20V31" stroke="#cfb767" stroke-width="3"/><circle cy="34" cx="-4" r="3" fill="#cfb767"/></g>'
};
const plantDefinitions = [
  {id:'daisy',name:'Солнечная ромашка',description:'Маленькое солнце для спокойного дня.',shape:'daisy',petal:'#f4e2a5',center:'#c5a756',condition:'Доступна с первого дня',goal:0},
  {id:'rose',name:'Нежная роза',description:'Для дел, которым хочется уделить заботу.',shape:'rose',petal:'#d9a6b3',center:'#b77492',condition:'Доступна с первого дня',goal:0},
  {id:'bell',name:'Лесной колокольчик',description:'Тихий цветок в оттенках лавандового утра.',shape:'bell',petal:'#b5abd9',center:'#877dac',condition:'Доступен с первого дня',goal:0},
  {id:'poppy',name:'Тёплый мак',description:'Награда за маленькие, но уверенные шаги.',shape:'rose',petal:'#d88d6f',center:'#ad6252',condition:'Выполни 8 дел за всё время',goal:8,type:'tasks'},
  {id:'cosmos',name:'Розовая космея',description:'Лёгкий цветок для твоей коллекции.',shape:'daisy',petal:'#dcb6d2',center:'#bb9a53',condition:'Заверши весь план в 3 разных дня',goal:3,type:'days'},
  {id:'moon',name:'Лунный колокольчик',description:'Особенный цветок за неделю маленьких побед.',shape:'bell',petal:'#e8ece4',center:'#aab7a1',condition:'Заверши весь план в 7 разных дней',goal:7,type:'days'}
];
let editing = false, draggedWidget = null, breathingTimer = null;
function createExtraWidgets() {
  const extras = {
    'quote-card':'<div class="eyebrow">СЛОВА ДЛЯ ТВОЕГО ДНЯ</div><h3>Маленькая мысль</h3><blockquote class="quote-text"></blockquote><button class="quote-refresh">Обновить ↻</button>',
    'finance-card':'<div class="eyebrow">ФИНАНСЫ БЕЗ СПЕШКИ</div><h3>Курсы валют</h3><div id="currency-rates" class="currency-rates"></div><p id="currency-status" role="status">Загружаем курсы…</p><div class="currency-convert"><input id="currency-amount" type="number" min="0" max="1000000000" value="100" aria-label="Сумма в валюте"><select id="currency-code" aria-label="Валюта"><option>USD</option><option>EUR</option><option>CNY</option></select></div><p id="currency-result">— ₽</p><div class="currency-footer"><span>Курс за 1 единицу</span><button id="currency-refresh" aria-label="Обновить курсы">↻</button></div>', 
    'plant-card':'<div class="eyebrow">ЖИВОЙ МИР</div><h3 id="discovery-name">Растение дня</h3><div class="discovery-image" id="discovery-image">❀</div><p id="discovery-status" role="status">Загружаем растение…</p><p id="discovery-credit"></p><button class="plant-refresh" id="discovery-next">Другое растение ↻</button>', 
    'water-card':'<div class="eyebrow">НЕБОЛЬШАЯ ЗАБОТА О СЕБЕ</div><h3>Стакан воды</h3><div class="water-count"><span id="water-value">0</span> <small>стаканов сегодня</small></div><div class="water-drops" id="water-drops"></div><div class="water-actions"><span>Стакан</span><button id="water-minus" aria-label="Убрать стакан">−</button><button id="water-plus" aria-label="Добавить стакан">＋</button></div>',
    'breath-card':'<div class="eyebrow">МИНУТА БЕЗ СПЕШКИ</div><h3>Вдох. Выдох.</h3><div class="breath-orb"></div><p id="breath-caption">Четыре секунды вдоха, четыре — выдоха.</p><button id="breath-button">Начать паузу</button>',
  };
  for (const [id,html] of Object.entries(extras)) {
    const card = document.createElement('section'); card.id = id; card.className = `panel extra-card ${id}`; card.innerHTML = html; $('#dashboard').append(card);
  }
  listen($('#water-plus'),'click',() => {getComponent('water-card').change(1);});
  listen($('#water-minus'),'click',() => {getComponent('water-card').change(-1);});
  listen($('#breath-button'),'click',toggleBreathing);
  listen($('#currency-refresh'),'click',loadCurrency);
  listen($('#currency-amount'),'input',convertCurrency);
  listen($('#currency-code'),'change',convertCurrency);
  listen($('#discovery-next'),'click',loadDiscovery);
}
function toggleBreathing() {
  if (breathingTimer) {stopBreathing();return;}
  $('#breath-card').classList.add('breathing');$('#breath-button').textContent='Закончить паузу';let seconds=0;
  $('#breath-caption').textContent='Вдох…';
  breathingTimer=setInterval(() => {seconds++;$('#breath-caption').textContent=seconds%8<4?'Вдох…':'Выдох…';if(seconds>=64){stopBreathing();toast('Маленькая пауза завершена. Возвращайся в своём темпе.');}},1000);
}
function stopBreathing() {clearInterval(breathingTimer);breathingTimer=null;$('#breath-card').classList.remove('breathing');$('#breath-button').textContent='Начать паузу';$('#breath-caption').textContent='Четыре секунды вдоха, четыре — выдоха.';}
function populateTaskSelect(select,value,placeholder) {
  select.replaceChildren();const first=document.createElement('option');first.value='';first.textContent=placeholder;select.append(first);
  for(const task of tasks()){const option=document.createElement('option');option.value=task.id;option.textContent=`${task.done?'✓ ':''}${task.text}`;select.append(option);}select.value=tasks().some(t=>t.id===value)?value:'';
}
function renderExtras() {
  const day=state.days[today];day.water=Math.max(0,Math.min(10,Number(day.water)||0));$('#water-value').textContent=day.water;$('#water-drops').replaceChildren();
  for(let i=0;i<10;i++){const drop=document.createElement('span');drop.className=i<(day.water||0)?'water-drop filled':'water-drop';drop.setAttribute('aria-hidden','true');$('#water-drops').append(drop);}

}
function addWidget(id) {
  if(!widgetDefinitions.some(w=>w.id===id))return;
  if(state.widgets.includes(id)){toast('Этот виджет уже на главной');return;}
  dashboard.addWidget(id);setView('overview');applyLayout();toast('Виджет добавлен. Его можно переместить в режиме настройки.');
}
function removeWidget(id) {
  dashboard.removeWidget(id);toast('Виджет убран. Данные сохранены, его можно добавить снова.');
}
function moveWidget(id,direction) {
  const index=state.widgets.indexOf(id),next=index+direction;if(index<0||next<0||next>=state.widgets.length)return;
  [state.widgets[index],state.widgets[next]]=[state.widgets[next],state.widgets[index]];save();applyLayout();
}
function applyLayout() {
  const board=$('#dashboard');board.querySelector('.empty-board')?.remove();
  for(const widget of widgetDefinitions){const card=getComponent(widget.id).element;card.hidden=!state.widgets.includes(widget.id);}
  for (const id of state.widgets) dashboard.addWidget(id, false);
  dashboard.setOrder(state.widgets);
  if(!state.widgets.length){const empty=document.createElement('p');empty.className='empty-board';empty.textContent='Твоя чистая страница. Добавь виджеты из меню слева.';board.append(empty);}
  $('#widget-catalog').replaceChildren();
  for(const widget of widgetDefinitions){const button=document.createElement('button');button.className=`catalog-widget ${state.widgets.includes(widget.id)?'present':''}`;button.draggable=true;button.title='Добавить или перетащить на главную';button.innerHTML=`<span>${widget.icon}</span><span>${widget.name}</span><small>${state.widgets.includes(widget.id)?'✓':'＋'}</small>`;listen(button,'click',()=>addWidget(widget.id));listen(button,'dragstart',e=>{draggedWidget={id:widget.id,from:'catalog'};e.dataTransfer.setData('text/plain',widget.id);e.dataTransfer.effectAllowed='copy';setView('overview');$('#dashboard').classList.add('drop-ready');});listen(button,'dragend',clearDrag);$('#widget-catalog').append(button);}
  // Карточка рядом с планером занимает оставшуюся треть строки.
  let usedColumns = 0;
  state.widgets.forEach((id, index) => {
    const card = getComponent(id).render();
    card.classList.remove('task-neighbor');
    let span = id === 'garden-card' || id === 'tasks-card' ? 8 : id === 'weather-card' ? 4 : 3;
    if (span === 3 && (usedColumns === 8 && state.widgets[index - 1] === 'tasks-card' || usedColumns === 0 && state.widgets[index + 1] === 'tasks-card')) {
      span = 4;
      card.classList.add('task-neighbor');
    }
    if (usedColumns + span > 12) usedColumns = 0;
    usedColumns = (usedColumns + span) % 12;
  });
  let row=1,col=0;
  for(const id of state.widgets){const width=['garden-card','tasks-card'].includes(id)?2:1;if(col+width>3){row++;col=0;}col+=width;if(col===3){col=0;row++;}}
  if(col===0)row=Math.max(1,row-1);board.style.setProperty('--board-rows',row);
  $('.app').classList.toggle('editing',editing);$('#edit-layout').textContent=editing?'✓ Готово':'↕ Настроить виджеты';
}
function clearDrag(){draggedWidget=null;$('#dashboard').classList.remove('drop-ready');document.querySelectorAll('.drag-target,.dragging').forEach(el=>el.classList.remove('drag-target','dragging'));}
function setupLayout() {
  for(const widget of widgetDefinitions){const card=$(`#${widget.id}`);const controls=document.createElement('div');controls.className='widget-controls';
    controls.innerHTML=`<button class="drag-handle" draggable="true" aria-label="Перетащить ${widget.name}">⠿ <span>${widget.name}</span></button><button class="move-prev" aria-label="Переместить раньше">←</button><button class="move-next" aria-label="Переместить позже">→</button><button class="remove-widget" aria-label="Убрать ${widget.name}">×</button>`;card.prepend(controls);
    listen(controls.querySelector('.move-prev'),'click',()=>moveWidget(widget.id,-1));listen(controls.querySelector('.move-next'),'click',()=>moveWidget(widget.id,1));listen(controls.querySelector('.remove-widget'),'click',()=>getComponent(widget.id).close());
    listen(controls.querySelector('.drag-handle'),'dragstart',e=>{draggedWidget={id:widget.id,from:'board'};e.dataTransfer.setData('text/plain',widget.id);e.dataTransfer.effectAllowed='move';card.classList.add('dragging');$('#dashboard').classList.add('drop-ready');});listen(controls.querySelector('.drag-handle'),'dragend',clearDrag);
    listen(card,'dragover',e=>{if(!draggedWidget)return;e.preventDefault();card.classList.add('drag-target');});listen(card,'dragleave',e=>{if(!card.contains(e.relatedTarget))card.classList.remove('drag-target');});
    listen(card,'drop',e=>{if(!draggedWidget)return;e.preventDefault();e.stopPropagation();const drag=draggedWidget;if(drag.id===widget.id){clearDrag();return;}state.widgets=state.widgets.filter(id=>id!==drag.id);const index=state.widgets.indexOf(widget.id);state.widgets.splice(Math.max(0,index),0,drag.id);save();applyLayout();clearDrag();});
  }
  listen($('#dashboard'),'dragover',e=>{if(draggedWidget)e.preventDefault();});listen($('#dashboard'),'drop',e=>{if(!draggedWidget)return;e.preventDefault();const id=draggedWidget.id;state.widgets=state.widgets.filter(w=>w!==id);state.widgets.push(id);save();applyLayout();clearDrag();});
  listen($('#edit-layout'),'click',()=>{editing=!editing;applyLayout();});
}
function setView(next) {
  view=next;$('#dashboard').hidden=next==='garden';$('.board-toolbar').hidden=next==='garden';$('#garden-page').hidden=next!=='garden';
  document.querySelectorAll('nav [data-view]').forEach(button=>button.classList.toggle('active',button.dataset.view===next));
  $('#view-title').textContent=next==='garden'?'Мой сад':'Главная';if(next==='garden')renderPlants();
}
function plantMetrics() {return {tasks:Object.values(state.days).reduce((sum,day)=>sum+completed(day),0),days:Object.values(state.days).filter(hasFlower).length};}
function applyPlant() {
  const plant=plantDefinitions.find(p=>p.id===state.plant&&state.unlocked.includes(p.id))||plantDefinitions[0];state.plant=plant.id;
  $('#plant').style.setProperty('--petal-color',plant.petal);$('#plant').style.setProperty('--center-color',plant.center);$('#plant .flower').innerHTML=flowers[plant.shape];
}
function renderPlants() {
  const metrics=plantMetrics();for(const plant of plantDefinitions){if(!plant.goal||metrics[plant.type]>=plant.goal){if(!state.unlocked.includes(plant.id))state.unlocked.push(plant.id);}}
  $('#unlocked-count').textContent=`${state.unlocked.length} из 6 открыто`;$('#plant-grid').replaceChildren();
  for(const plant of plantDefinitions){const unlocked=state.unlocked.includes(plant.id);const card=document.createElement('article');card.className=`plant-option ${unlocked?'':'locked'} ${plant.id===state.plant?'selected':''}`;
    const preview=document.createElement('div');preview.className='plant-preview';const svg=$('#plant').cloneNode(true);svg.removeAttribute('id');svg.classList.remove('plant');svg.removeAttribute('aria-label');svg.setAttribute('aria-hidden','true');svg.style.setProperty('--petal-color',plant.petal);svg.style.setProperty('--center-color',plant.center);svg.querySelector('.flower').innerHTML=flowers[plant.shape];
    let markup=svg.innerHTML;for(const el of svg.querySelectorAll('[id]')){const old=el.id;markup=markup.replaceAll(`id="${old}"`,`id="${old}-${plant.id}"`).replaceAll(`url(#${old})`,`url(#${old}-${plant.id})`);}svg.innerHTML=markup;preview.append(svg);card.append(preview);
    if(!unlocked){const lock=document.createElement('span');lock.className='lock-badge';lock.textContent='⌑';lock.setAttribute('aria-label','Закрыто');card.append(lock);}
    const title=document.createElement('h3');title.textContent=plant.name;const description=document.createElement('p');description.textContent=unlocked?plant.description:plant.condition;card.append(title,description);
    if(!unlocked){const progress=document.createElement('div');progress.className='unlock-progress';const fill=document.createElement('i');fill.style.width=`${Math.min(100,metrics[plant.type]/plant.goal*100)}%`;progress.append(fill);card.append(progress);const amount=document.createElement('p');amount.style.minHeight='auto';amount.textContent=`${Math.min(metrics[plant.type],plant.goal)} из ${plant.goal}`;card.append(amount);}
    const button=document.createElement('button');button.disabled=!unlocked;button.textContent=!unlocked?'Пока закрыто':plant.id===state.plant?'✓ Растёт в моём саду':'Выбрать цветок';listen(button,'click',()=>{state.plant=plant.id;save();applyPlant();render();toast(`${plant.name} теперь растёт в твоём саду`);});card.append(button);$('#plant-grid').append(card);
  }
  save();
}
function growthStats() {
  const count=Object.values(state.days).reduce((sum,day)=>sum+completed(day)+(day.archivedDone||0),0);
  const flowers=Math.floor(count/5), steps=count>0&&count%5===0?5:count%5;
  return {count,flowers,steps,progress:steps/5};
}
function updatePlantGrowth() {
  const growth=growthStats();const {count,flowers}=growth;const steps=tasks().length?growth.steps:0,progress=steps/5;
  $('#plant .plant-growth').style.transform=`scale(${.5+progress*.5})`;
  $('#plant .leaf-two').style.opacity=steps>=2?1:0;
  $('#plant .leaf-three').style.opacity=steps>=3?1:0;
  $('#plant .flower').style.opacity=steps===5?1:0;
  $('#scene').classList.toggle('bloom',steps===5);
  $('#stage-label').textContent=steps===5?'Цветок распустился':steps>=3?'Скоро расцветёт':steps?'Растём понемногу':'Первый росток';
  $('#growth-percent').textContent=`${steps} / 5 дел`;$('#garden-progress').style.width=`${steps*20}%`;
  $('#growth-text').textContent=steps===5?'Ещё один цветок в твоём саду':steps?'Каждое дело дарит новый рост':'Начнём с одного маленького дела';
  $('#growth-hint').textContent=steps===5?'Пять дел сделаны! Следующее дело начнёт новый цикл роста.':`До следующего цветка — ${5-steps} дел. Всего выполнено: ${count}.`;
  $('#flowers-value').textContent=`Выросло ${flowers} ${flowers%10===1&&flowers%100!==11?'цветок':flowers%10>=2&&flowers%10<=4&&(flowers%100<12||flowers%100>14)?'цветка':'цветов'}`;
}
createExtraWidgets();setupLayout();
for (const id of state.widgets) dashboard.addWidget(id, false);
applyPlant();applyLayout();renderPlants();
const originalRender=render;
render=function(){originalRender();renderExtras();renderPlants();};

/* Полный список остаётся доступным даже при компактной карточке. */
/* Личный профиль: информация остаётся в браузере. */
function renderProfile(){
  const profile=state.profile||{};
  $('#profile-name').textContent=profile.name||'Мой маленький мир';
  $('#profile-about').textContent=profile.about||'Растём в своём темпе';
  $('#profile-button').textContent=(profile.name||'К').trim().charAt(0).toUpperCase();
}
listen($('#profile-button'),'click',()=>{
  const profile=state.profile||{};
  $('#user-name').value=profile.name||'';$('#user-birthday').value=profile.birthday||'';$('#user-about').value=profile.about||'';
  $('#user-birthday').max=dayKey();$('#profile-dialog').showModal();$('#user-name').focus();
});
listen($('#profile-form'),'submit',event=>{
  event.preventDefault();state.profile={name:$('#user-name').value.trim(),birthday:$('#user-birthday').value,about:$('#user-about').value.trim()};save();renderProfile();$('#profile-dialog').close();toast('Профиль сохранён');
});
renderProfile();
/* Меню виджетов на узком экране. */
function closeWidgetMenu(){
  $('.sidebar').classList.remove('widgets-open');
  $('#widget-menu-toggle').setAttribute('aria-expanded','false');
  $('#widget-menu-toggle').setAttribute('aria-label','Открыть список виджетов');
  $('#widget-menu-toggle').textContent='＋';
}
listen($('#widget-menu-toggle'),'click',()=>{
  const open=$('.sidebar').classList.toggle('widgets-open');
  $('#widget-menu-toggle').setAttribute('aria-expanded',String(open));
  $('#widget-menu-toggle').setAttribute('aria-label',open?'Закрыть список виджетов':'Открыть список виджетов');
  $('#widget-menu-toggle').textContent=open?'−':'＋';
});
listen($('#widget-catalog'),'click',event=>{if(event.target.closest('.catalog-widget'))closeWidgetMenu();});
addEventListener('keydown',event=>{if(event.key==='Escape')closeWidgetMenu();});
document.addEventListener('pointerdown',event=>{if(!event.target.closest('#widget-library')&&!event.target.closest('#widget-menu-toggle'))closeWidgetMenu();});
addEventListener('resize',()=>{if(innerWidth>820)closeWidgetMenu();});
loadDiscovery();
loadCurrency();
render(); save(); tick(); setInterval(tick,1000); loadWeather(); setInterval(loadWeather,30*60*1000);

/* Растение дня: запрос отменяется при смене карточки. */
async function loadDiscovery() {
  const widget=getComponent('plant-card');
  widget.request?.abort(); widget.request=new AbortController();
  const controller=widget.request;
  const timer=setTimeout(()=>controller.abort(),15000);
  const species=['Rosa gallica','Leucanthemum vulgare','Campanula rotundifolia','Papaver rhoeas','Cosmos bipinnatus'];
  const candidates=species.filter(name=>name!==widget.lastSpecies);
  widget.lastSpecies=candidates[Math.floor(Math.random()*candidates.length)];
  $('#discovery-status').textContent='Загружаем растение…'; $('#discovery-credit').replaceChildren();
  try {
    const plant=await PlantsAPI.search(widget.lastSpecies,controller.signal);
    if(widget.request!==controller)return;
    $('#discovery-image').replaceChildren();
    if(!plant){$('#discovery-status').textContent='Растение не найдено. Попробуй другое.';return;}
    $('#discovery-name').textContent=plant.name;
    $('#discovery-status').textContent=plant.scientificName;
    if(plant.photo?.startsWith('https://')){
      const img=document.createElement('img'); img.src=plant.photo; img.alt=plant.name;
      img.addEventListener('error',()=>{img.remove();$('#discovery-image').textContent='❀';},{once:true}); $('#discovery-image').append(img);
    }else $('#discovery-image').textContent='❀';
    const link=document.createElement('a');link.href=`https://www.inaturalist.org/taxa/${Number(plant.id)}`;link.target='_blank';link.rel='noopener';link.textContent=plant.credit || 'Источник: iNaturalist';$('#discovery-credit').append(link); $('#discovery-next').title = `${plant.name} · ${plant.credit || 'iNaturalist'}`;
  }catch{if(widget.request===controller)$('#discovery-status').textContent='Растение не загрузилось. Нажми «Другое растение».';}
  finally{clearTimeout(timer);}
}

/* Валюты: курс за одну единицу, дата и ручной пересчёт. */
function convertCurrency() {
  const widget=getComponent('finance-card');
  const amount=Number($('#currency-amount').value);
  const rate=widget.data?.rates[$('#currency-code').value]?.value;
  $('#currency-result').textContent=Number.isFinite(rate)&&Number.isFinite(amount)&&amount>=0&&amount<=1e9 ? (amount*rate).toLocaleString('ru-RU',{maximumFractionDigits:2})+' ₽' : '— ₽';
}
async function loadCurrency() {
  const widget=getComponent('finance-card');
  if(widget.loading)return;
  widget.loading=true;widget.request=new AbortController();
  const timer=setTimeout(()=>widget.request.abort(),15000);
  $('#currency-refresh').disabled=true;$('#currency-status').textContent='Загружаем курсы…';
  try {
    widget.data=await CurrencyAPI.load(widget.request.signal);
    $('#currency-rates').replaceChildren();
    for(const [code,rate] of Object.entries(widget.data.rates)) {
      const row=document.createElement('div');const label=document.createElement('span');label.textContent=code;
      const value=document.createElement('b');value.textContent=rate.value.toLocaleString('ru-RU',{maximumFractionDigits:2})+' ₽';row.append(label,value);$('#currency-rates').append(row);
    }
    $('#currency-status').textContent='Курс ЦБ на '+new Date(widget.data.date).toLocaleDateString('ru-RU');convertCurrency();
  }catch{
    $('#currency-status').textContent=widget.data?'Показаны ранее загруженные курсы. Обновление недоступно.':'Курсы не загрузились. Попробуй обновить.';
  }finally{clearTimeout(timer);widget.loading=false;$('#currency-refresh').disabled=false;}
}

