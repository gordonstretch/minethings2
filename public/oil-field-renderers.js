(() => {
  'use strict';

  const parseTransform = (value) => {
    const source = String(value ?? '');
    const translate = /t\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)/i.exec(source);
    const rotate = /r\s*(-?[\d.]+)(?:\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+))?/i.exec(source);
    return {
      translateX: translate ? Number(translate[1]) : 0,
      translateY: translate ? Number(translate[2]) : 0,
      rotate: rotate ? Number(rotate[1]) : 0,
      originX: rotate?.[2] === undefined ? 0 : Number(rotate[2]),
      originY: rotate?.[3] === undefined ? 0 : Number(rotate[3])
    };
  };

  const transformAttribute = (value) => {
    const transform = parseTransform(value);
    return `translate(${transform.translateX} ${transform.translateY}) rotate(${transform.rotate} ${
      transform.originX} ${transform.originY})`;
  };

  class SvgJsElement {
    constructor(paper, element) {
      this.paper = paper;
      this.element = element;
      this.node = element.node;
      this.removed = false;
      this.values = new Map();
      this.runners = [];
    }

    attr(name, value) {
      if (typeof name === 'string' && value === undefined) {
        if (name === 'text') return this.node.textContent;
        return this.element.attr(name);
      }
      const attributes = typeof name === 'string' ? { [name]: value } : { ...(name ?? {}) };
      if (Object.hasOwn(attributes, 'text')) {
        this.element.text(String(attributes.text));
        delete attributes.text;
      }
      if (Object.hasOwn(attributes, 'transform')) {
        this.transform(attributes.transform);
        delete attributes.transform;
      }
      if (attributes['stroke-dasharray'] === '- ') attributes['stroke-dasharray'] = '6 3';
      if (attributes['text-align'] === 'left') attributes['text-anchor'] = 'start';
      delete attributes['text-align'];
      if (Object.keys(attributes).length) this.element.attr(attributes);
      return this;
    }

    data(name, value) {
      if (value === undefined) return this.values.get(name);
      this.values.set(name, value);
      return this;
    }

    on(type, handler) {
      this.node.addEventListener(type, (event) => handler.call(this, event));
      return this;
    }

    click(handler) { return this.on('click', handler); }
    mouseover(handler) { return this.on('mouseover', handler); }

    hover(enter, leave = null) {
      if (enter) this.on('mouseenter', enter);
      if (leave) this.on('mouseleave', leave);
      return this;
    }

    transform(value) {
      this.element.attr('transform', transformAttribute(value));
      return this;
    }

    animate(animation, duration = 0, easing = 'linear', callback = null) {
      const specification = animation?.__oilAnimation
        ? animation : { attributes: animation ?? {}, duration, easing, callback, repeat: 1 };
      const attributes = { ...(specification.attributes ?? {}) };
      const transform = attributes.transform;
      delete attributes.transform;
      const runner = this.element.animate(Number(specification.duration) || 0);
      if (Object.keys(attributes).length) runner.attr(attributes);
      if (transform !== undefined) {
        const parsed = parseTransform(transform);
        runner.transform({
          translate: [parsed.translateX, parsed.translateY],
          rotate: parsed.rotate,
          origin: [parsed.originX, parsed.originY]
        });
      }
      if (specification.repeatCount === Infinity) runner.loop(true);
      else if (Number(specification.repeatCount) > 1) runner.loop(Number(specification.repeatCount));
      const completed = specification.callback ?? callback;
      if (typeof completed === 'function') runner.after(() => completed.call(this));
      this.runners.push(runner);
      return this;
    }

    stop() {
      for (const runner of this.runners.splice(0)) {
        try { runner.finish(); } catch {}
      }
      return this;
    }

    hide() {
      this.node.style.display = 'none';
      return this;
    }

    show() {
      this.node.style.removeProperty('display');
      return this;
    }

    remove() {
      if (!this.removed) this.element.remove();
      this.removed = true;
      return this;
    }

    toFront() {
      if (this.node.parentNode) this.node.parentNode.appendChild(this.node);
      return this;
    }

    toBack() {
      if (this.node.parentNode) this.node.parentNode.prepend(this.node);
      return this;
    }

    getBBox() {
      const box = this.element.bbox();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    }
  }

  class SvgJsSet {
    constructor(paper, elements = []) {
      this.paper = paper;
      this.elements = [];
      this.push(...elements);
    }

    syncIndexes() {
      for (const key of Object.keys(this)) {
        if (/^\d+$/.test(key)) delete this[key];
      }
      this.elements.forEach((element, index) => { this[index] = element; });
      this.length = this.elements.length;
    }

    push(...elements) {
      this.elements.push(...elements.filter(Boolean));
      this.syncIndexes();
      return this;
    }

    forEach(callback) {
      this.elements.forEach(callback);
      return this;
    }

    attr(attributes, value) {
      return this.forEach((element) => element.attr(attributes, value));
    }

    transform(value) {
      return this.forEach((element) => element.transform(value));
    }

    animate(animation, duration, easing, callback) {
      return this.forEach((element) => element.animate(animation, duration, easing, callback));
    }

    hide() { return this.forEach((element) => element.hide()); }
    show() { return this.forEach((element) => element.show()); }
    remove() { return this.forEach((element) => element.remove()); }

    clear() {
      this.elements.length = 0;
      this.syncIndexes();
      return this;
    }

    getBBox() {
      const boxes = this.elements.filter((element) => !element.removed).map((element) => element.getBBox());
      if (!boxes.length) return { x: 0, y: 0, width: 0, height: 0 };
      const x = Math.min(...boxes.map((box) => box.x));
      const y = Math.min(...boxes.map((box) => box.y));
      const right = Math.max(...boxes.map((box) => box.x + box.width));
      const bottom = Math.max(...boxes.map((box) => box.y + box.height));
      return { x, y, width: right - x, height: bottom - y };
    }

    drag(move, start, end) {
      for (const element of this.elements) {
        element.node.addEventListener('pointerdown', (event) => {
          if (event.button !== 0 && event.pointerType !== 'touch') return;
          event.preventDefault();
          const origin = { x: event.clientX, y: event.clientY };
          const bounds = this.paper.canvas.getBoundingClientRect();
          const scaleX = this.paper.width / Math.max(1, bounds.width);
          const scaleY = this.paper.height / Math.max(1, bounds.height);
          start?.call(this, event.clientX, event.clientY, event);
          const pointerMove = (pointerEvent) => {
            if (pointerEvent.pointerId !== event.pointerId) return;
            move?.call(this,
              (pointerEvent.clientX - origin.x) * scaleX,
              (pointerEvent.clientY - origin.y) * scaleY,
              pointerEvent.clientX, pointerEvent.clientY, pointerEvent);
          };
          const pointerEnd = (pointerEvent) => {
            if (pointerEvent.pointerId !== event.pointerId) return;
            window.removeEventListener('pointermove', pointerMove);
            window.removeEventListener('pointerup', pointerEnd);
            window.removeEventListener('pointercancel', pointerEnd);
            end?.call(this, pointerEvent);
          };
          window.addEventListener('pointermove', pointerMove);
          window.addEventListener('pointerup', pointerEnd);
          window.addEventListener('pointercancel', pointerEnd);
        });
      }
      return this;
    }
  }

  class SvgJsPaper {
    constructor(container, width, height) {
      const target = typeof container === 'string' ? document.getElementById(container) : container;
      if (!target) throw new Error('SVG.js Oil Field container not found.');
      target.replaceChildren();
      this.width = Number(width);
      this.height = Number(height);
      this.draw = window.SVG().addTo(target).size(this.width, this.height)
        .viewbox(0, 0, this.width, this.height);
      this.canvas = this.draw.node;
      this.canvas.dataset.renderer = 'svgjs';
      this.captureStack = [];
    }

    record(element) {
      const wrapper = new SvgJsElement(this, element);
      if (this.captureStack.length) this.captureStack.at(-1).push(wrapper);
      return wrapper;
    }

    path(value = '') {
      return this.record(this.draw.path(value).attr({ fill: 'none', stroke: '#000' }));
    }

    circle(x = 0, y = 0, radius = 0) {
      return this.record(this.draw.circle(Number(radius) * 2).center(Number(x), Number(y))
        .attr({ fill: 'none', stroke: '#000' }));
    }

    ellipse(x = 0, y = 0, radiusX = 0, radiusY = 0) {
      return this.record(this.draw.ellipse(Number(radiusX) * 2, Number(radiusY) * 2)
        .center(Number(x), Number(y)).attr({ fill: 'none', stroke: '#000' }));
    }

    rect(x = 0, y = 0, width = 0, height = 0, radius = 0) {
      const element = this.draw.rect(Number(width), Number(height)).move(Number(x), Number(y))
        .attr({ fill: 'none', stroke: '#000' });
      if (radius) element.radius(Number(radius));
      return this.record(element);
    }

    text(x = 0, y = 0, value = '') {
      const element = this.draw.text(String(value)).attr({
        x: Number(x), y: Number(y), fill: '#000', stroke: 'none',
        'text-anchor': 'middle', 'dominant-baseline': 'middle'
      });
      return this.record(element);
    }

    image(source, x = 0, y = 0, width = 0, height = 0) {
      return this.record(this.draw.image(source).move(Number(x), Number(y))
        .size(Number(width), Number(height)));
    }

    set(...elements) { return new SvgJsSet(this, elements); }

    setStart() {
      this.captureStack.push([]);
      return this;
    }

    setFinish() {
      return new SvgJsSet(this, this.captureStack.pop() ?? []);
    }
  }

  const SvgJsRenderer = (container, width, height) => new SvgJsPaper(container, width, height);
  SvgJsRenderer.animation = (attributes, duration, easing, callback) => {
    const animation = {
      __oilAnimation: true,
      attributes: { ...(attributes ?? {}) },
      duration: Number(duration) || 0,
      easing,
      callback,
      repeatCount: 1,
      repeat(times) {
        this.repeatCount = times;
        return this;
      }
    };
    return animation;
  };
  SvgJsRenderer.version = 'SVG.js 3.2.7';

  const available = {
    raphael: typeof window.Raphael === 'function' ? window.Raphael : null,
    svgjs: typeof window.SVG === 'function' ? SvgJsRenderer : null
  };
  let requested = 'svgjs';
  try {
    const preference = localStorage.getItem('oil-field-renderer');
    if (preference === 'raphael' || preference === 'svgjs') requested = preference;
  } catch {}
  const selected = available[requested] ? requested : available.svgjs ? 'svgjs' : 'raphael';
  window.OilFieldRenderers = available;
  window.OilVectorRenderer = available[selected];
  window.oilRendererMode = selected;
  document.documentElement.dataset.oilRenderer = selected;
})();
