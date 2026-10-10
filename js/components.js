/* Общая обёртка и жизненный цикл виджета. */
class UIComponent {
  constructor({ id, title, element, onClose = null }) {
    this.id = id;
    this.title = title;
    this.element = element || document.createElement('section');
    this.element.id = id;
    this.element.classList.add('panel');
    this.onClose = onClose;
    this.listeners = [];
    this.destroyed = false;
  }

  render() {
    if (this.destroyed) throw new Error('Виджет уже удалён');
    return this.element;
  }

  listen(target, type, handler, group = 'controls') {
    target.addEventListener(type, handler);
    this.listeners.push({ target, type, handler, group });
  }

  clearListeners(group) {
    this.listeners = this.listeners.filter(listener => {
      if (group && listener.group !== group) return true;
      listener.target.removeEventListener(listener.type, listener.handler);
      return false;
    });
  }

  minimize() {
    const collapsed = this.element.classList.toggle('minimized');
    this.element.setAttribute('aria-expanded', String(!collapsed));
    return collapsed;
  }

  close() {
    if (this.onClose) this.onClose(this.id);
    else this.destroy();
  }

  destroy() {
    this.clearListeners();
    this.element.remove();
    this.destroyed = true;
  }
}

/* Задачи: операции и обе версии списка используют один класс. */
class ToDoWidget extends UIComponent {
  constructor(config) {
    super(config);
    this.setData(config.data || {tasks: []});
    this.filter = 'all';
    this.onChange = config.onChange || (() => {});
    this.onCompleted = config.onCompleted || (() => {});
    this.bindControls(config.controls);
  }

  setData(data) {
    this.data = data;
    this.tasks = data.tasks;
  }

  bindControls(controls) {
    if (!controls) return;
    this.controls = controls;
    controls.filters.forEach(button => button.classList.toggle('selected', button.dataset.filter === this.filter));
    for (const button of controls.addButtons) {
      this.listen(button, 'click', () => { controls.dialog.showModal(); controls.input.focus(); }, 'task-ui');
    }
    this.listen(controls.form, 'submit', event => {
      event.preventDefault();
      if (!this.addTask(controls.input.value, controls.category.value)) return;
      controls.input.value = '';
      controls.dialog.close();
    }, 'task-ui');
    for (const button of controls.filters) {
      this.listen(button, 'click', () => {
        this.filter = button.dataset.filter;
        controls.filters.forEach(item => item.classList.toggle('selected', item === button));
        this.onChange();
      }, 'task-ui');
    }
    this.listen(controls.showAll, 'click', () => {
      this.renderAll();
      controls.allDialog.showModal();
    }, 'task-ui');
  }

  renderPreview() {
    if (!this.controls) return;
    const visible = this.tasks.filter(task => this.filter === 'all' || (this.filter === 'done' ? task.done : !task.done));
    this.renderTasks(this.controls.list, visible.slice(0, 3), 'task');
    if (!visible.length) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = this.tasks.length ? 'Здесь пока нет дел. Можно переключить фильтр.' : 'Чистый лист. Добавь первое дело для своего сада.';
      this.controls.list.append(empty);
    }
    this.controls.showAll.hidden = this.tasks.length <= 3;
    this.controls.showAll.textContent = `Посмотреть все дела (${this.tasks.length})`;
    this.controls.count.textContent = this.tasks.length;
    this.renderAll();
  }

  renderAll() {
    if (!this.controls) return;
    this.controls.allSummary.textContent = `Выполнено ${this.tasks.filter(task => task.done).length} из ${this.tasks.length}`;
    this.renderTasks(this.controls.allList, this.tasks, 'all-task');
    if (!this.tasks.length) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = 'Все задачи удалены. Можно начать с нового маленького шага.';
      this.controls.allList.append(empty);
    }
  }

  addTask(text, category) {
    text = text.trim();
    if (!text) return false;
    this.tasks.push({ id: crypto.randomUUID(), text, category, done: false });
    this.onChange();
    return true;
  }

  removeTask(id) {
    const day = this.data;
    const task = day.tasks.find(task => task.id === id);
    if (!task) return;
    if (task.done) day.archivedDone = (day.archivedDone || 0) + 1;
    this.tasks.splice(this.tasks.findIndex(task => task.id === id), 1);
    this.onChange();
  }

  toggleTask(id, done) {
    const task = this.tasks.find(task => task.id === id);
    if (!task) return;
    task.done = done;
    this.onChange();
    this.onCompleted(task);
  }

  renderTasks(list, tasks, prefix) {
    this.clearListeners(prefix);
    list.replaceChildren();
    for (const task of tasks) {
      const row = document.createElement('div');
      row.className = `task ${task.done ? 'done' : ''}`;
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = `${prefix}-${task.id}`;
      checkbox.checked = task.done;
      const label = document.createElement('label');
      label.htmlFor = checkbox.id;
      label.textContent = task.text;
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = task.category;
      const remove = document.createElement('button');
      remove.className = 'task-delete';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Удалить: ${task.text}`);
      if (!this.destroyed) {
        this.listen(checkbox, 'change', () => this.toggleTask(task.id, checkbox.checked), prefix);
        this.listen(remove, 'click', () => this.removeTask(task.id), prefix);
      }
      row.append(checkbox, label, tag, remove);
      list.append(row);
    }
  }
}

/* Конкретные типы сохраняют существующий интерфейс и данные. */
class GardenWidget extends UIComponent {}
class WeatherWidget extends UIComponent {}
class StatisticsWidget extends UIComponent {}
class ProgressWidget extends UIComponent {}
class CollectionWidget extends UIComponent {}
class FocusWidget extends UIComponent {
  destroy() {
    deadline = null;
    super.destroy();
  }
}
class BreathWidget extends UIComponent {
  destroy() {
    stopBreathing();
    super.destroy();
  }
}
class WaterWidget extends UIComponent {
  change(amount) {
    const day = state.days[today];
    day.water = Math.max(0, Math.min(10, (day.water || 0) + amount));
    save();
    renderExtras();
  }
}

class PlantDiscoveryWidget extends UIComponent {
  destroy() { this.request?.abort(); super.destroy(); }
}

class FinanceWidget extends UIComponent {
  destroy() { this.request?.abort(); super.destroy(); }
}

/* Каждый экземпляр цитаты хранит свой массив и текущий индекс. */
class QuoteWidget extends UIComponent {
  constructor(config) {
    super(config);
    this.quotes = config.quotes || [
      'Большой путь начинается с маленького шага.',
      'Сегодня достаточно сделать чуть больше, чем вчера.',
      'Пауза — тоже часть движения.',
      'Расти в своём темпе.',
      'Небольшая забота каждый день приносит плоды.'
    ];
    this.currentIndex = Number.isInteger(config.currentIndex) ? config.currentIndex : -1;
    if (!this.element.querySelector('.quote-text')) {
      this.element.innerHTML = '<div class="eyebrow">СЛОВА ДЛЯ ТВОЕГО ДНЯ</div><h3>Маленькая мысль</h3><blockquote class="quote-text"></blockquote><button class="quote-refresh">Обновить ↻</button>';
    }
    this.onChange = config.onChange || (() => {});
    this.listen(this.element.querySelector('.quote-refresh'), 'click', () => this.refresh(), 'quote-ui');
    if (this.currentIndex < 0) this.refresh();
    else this.showQuote();
  }

  refresh() {
    const choices = this.quotes.map((_, index) => index).filter(index => index !== this.currentIndex);
    this.currentIndex = choices[Math.floor(Math.random() * choices.length)] ?? 0;
    this.showQuote();
    this.onChange(this.currentIndex);
  }

  showQuote() {
    this.element.querySelector('.quote-text').textContent = this.quotes[this.currentIndex] || '';
  }
}
