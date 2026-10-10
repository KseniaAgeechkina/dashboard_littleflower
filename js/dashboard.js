/* Коллекция активных экземпляров и общая сетка. */
class Dashboard {
  constructor({container, factory, components = new Map(), onChange = () => {}}) {
    this.container = container;
    this.factory = factory;
    this.components = components;
    this.widgets = [];
    this.onChange = onChange;
    this.bindings = new Map();
  }

  addWidget(widgetType, notify = true) {
    const id = {ToDo: 'tasks-card', Quote: 'quote-card'}[widgetType] || widgetType;
    if (this.widgets.some(widget => widget.id === id)) return this.components.get(id);
    let widget = this.components.get(id);
    if (!widget || widget.destroyed) {
      widget = this.factory(id);
      if (!widget) return null;
      this.components.set(id, widget);
      for (const binding of this.bindings.get(id) || []) {
        widget.listen(binding.target, binding.type, binding.handler, binding.group);
      }
      this.bindings.delete(id);
    }
    widget.element.hidden = false;
    this.widgets.push(widget);
    this.render();
    if (notify) this.onChange(this.ids);
    return widget;
  }

  removeWidget(widgetId) {
    const widget = this.widgets.find(item => item.id === widgetId);
    if (!widget) return;
    this.bindings.set(widgetId, widget.listeners.filter(binding => binding.group === 'controls'));
    widget.destroy();
    this.widgets = this.widgets.filter(item => item.id !== widgetId);
    this.render();
    this.onChange(this.ids);
  }

  setOrder(ids) {
    const positions = new Map(ids.map((id, index) => [id, index]));
    this.widgets.sort((a, b) => (positions.get(a.id) ?? Infinity) - (positions.get(b.id) ?? Infinity));
    this.render();
  }

  get ids() {
    return this.widgets.map(widget => widget.id);
  }

  render() {
    for (const widget of this.widgets) this.container.append(widget.render());
    return this.container;
  }
}
