/* CONTACT: small controls with weight. MIT, Ship Notes. */
(() => {
  'use strict';

  const PROFILES = Object.freeze({
    precise: { stiffness: 980, damping: 64, press: 0.065 },
    cushioned: { stiffness: 390, damping: 38, press: 0.11 },
    springy: { stiffness: 560, damping: 23, press: 0.14 }
  });

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const mounted = new WeakMap();

  function mount(root = document.documentElement) {
    const profileRoot = root?.nodeType === 9 ? root.documentElement : root;
    if (!root?.querySelectorAll || !profileRoot?.setAttribute) {
      throw new TypeError('ContactControls.mount expects an Element or Document');
    }
    if (mounted.has(profileRoot)) return mounted.get(profileRoot);
    const initialProfile = profileRoot.getAttribute('data-ct-profile');
    let profileName = Object.hasOwn(PROFILES, initialProfile) ? initialProfile : 'cushioned';
    const animations = [];
    const listeners = [];
    const refreshers = [];
    let destroyed = false;
    const on = (node, event, handler, options) => {
      node.addEventListener(event, handler, options);
      listeners.push(() => node.removeEventListener(event, handler, options));
    };

    function spring(initial, paint) {
      let position = initial;
      let velocity = 0;
      let target = initial;
      let frameId = 0;
      let previous = 0;
      paint(position, velocity);

      function frame(now) {
        if (!previous) previous = now;
        let remaining = Math.min((now - previous) / 1000, 0.05);
        previous = now;
        const { stiffness, damping } = PROFILES[profileName];
        while (remaining > 0) {
          const step = Math.min(remaining, 1 / 120);
          velocity += ((target - position) * stiffness - velocity * damping) * step;
          position += velocity * step;
          remaining -= step;
        }
        paint(position, velocity);
        if (Math.abs(target - position) < 0.001 && Math.abs(velocity) < 0.015) {
          position = target;
          velocity = 0;
          paint(position, velocity);
          frameId = 0;
          previous = 0;
        } else {
          frameId = requestAnimationFrame(frame);
        }
      }

      function set(value) {
        target = value;
        if (reduceMotion.matches) {
          if (frameId) cancelAnimationFrame(frameId);
          frameId = 0;
          previous = 0;
          position = value;
          velocity = 0;
          paint(position, velocity);
        } else if (!frameId) {
          frameId = requestAnimationFrame(frame);
        }
      }

      const api = {
        set,
        stop() { if (frameId) cancelAnimationFrame(frameId); frameId = 0; },
        settle() { set(target); }
      };
      animations.push(api);
      return api;
    }

    root.querySelectorAll('[data-contact-switch]').forEach(wrapper => {
      const input = wrapper.querySelector('input[type="checkbox"]');
      const track = wrapper.querySelector('.ct-switch__track');
      if (!input || !track) return;
      let pressed = false;
      const animator = spring(Number(input.checked), (position, velocity) => {
        const stretch = clamp(Math.abs(velocity) * 0.9, 0, 10);
        track.style.setProperty('--ct-x', `${(38 * position - stretch / 2).toFixed(2)}px`);
        track.style.setProperty('--ct-stretch', `${stretch.toFixed(2)}px`);
      });
      const sync = () => animator.set(Number(input.checked));
      refreshers.push(sync);
      const press = () => {
        pressed = true;
        wrapper.classList.add('is-pressed');
        animator.set(clamp(Number(input.checked) + (input.checked ? -1 : 1) * PROFILES[profileName].press, 0, 1));
      };
      const release = () => {
        if (!pressed) return;
        pressed = false;
        wrapper.classList.remove('is-pressed');
        sync();
      };
      on(input, 'pointerdown', press);
      on(input, 'pointerup', release);
      on(input, 'pointercancel', release);
      on(window, 'pointerup', release);
      on(window, 'pointercancel', release);
      on(input, 'change', sync);
      on(input, 'keydown', event => { if (event.code === 'Space' && !event.repeat) press(); });
      on(input, 'keyup', event => { if (event.code === 'Space') release(); });
      on(input, 'blur', release);
      on(window, 'blur', release);
    });

    root.querySelectorAll('[data-contact-check]').forEach(wrapper => {
      const input = wrapper.querySelector('input[type="checkbox"]');
      if (!input) return;
      const press = () => wrapper.classList.add('is-pressed');
      const release = () => wrapper.classList.remove('is-pressed');
      on(input, 'pointerdown', press);
      on(input, 'pointerup', release);
      on(input, 'pointercancel', release);
      on(window, 'pointerup', release);
      on(window, 'pointercancel', release);
      on(input, 'keydown', event => { if (event.code === 'Space') press(); });
      on(input, 'keyup', event => { if (event.code === 'Space') release(); });
      on(input, 'blur', release);
      on(window, 'blur', release);
    });

    root.querySelectorAll('[data-contact-segment]').forEach(wrapper => {
      const inputs = Array.from(wrapper.querySelectorAll('input[type="radio"]'));
      const plate = wrapper.querySelector('.ct-segment__plate');
      if (!inputs.length || !plate) return;
      const currentIndex = () => Math.max(0, inputs.findIndex(input => input.checked));
      const animator = spring(currentIndex(), (position, velocity) => {
        plate.style.setProperty('--ct-index', position.toFixed(4));
        plate.style.setProperty('--ct-lean', `${clamp(velocity * 0.75, -10, 10).toFixed(2)}deg`);
      });
      wrapper.style.setProperty('--ct-segments', String(inputs.length));
      refreshers.push(() => animator.set(currentIndex()));
      inputs.forEach((input, index) => on(input, 'change', () => {
        if (input.checked) animator.set(index);
      }));
    });

    root.querySelectorAll('[data-contact-range]').forEach(wrapper => {
      const input = wrapper.querySelector('input[type="range"]');
      const output = wrapper.querySelector('output');
      if (!input) return;
      const sync = () => {
        const min = input.min === '' ? 0 : Number(input.min);
        const max = input.max === '' ? 100 : Number(input.max);
        const value = Number(input.value);
        const fill = max > min ? clamp((value - min) / (max - min), 0, 1) * 100 : 0;
        wrapper.style.setProperty('--ct-fill', `${fill}%`);
        if (output) output.value = String(value).padStart(2, '0');
      };
      sync();
      refreshers.push(sync);
      on(input, 'input', sync);
      on(input, 'change', sync);
    });

    function setProfile(name) {
      if (!Object.hasOwn(PROFILES, name)) return false;
      profileName = name;
      profileRoot.setAttribute('data-ct-profile', name);
      animations.forEach(animation => animation.settle());
      return true;
    }

    function refresh() { refreshers.forEach(sync => sync()); }
    const forms = new Set(Array.from(root.querySelectorAll('input'), input => input.form).filter(Boolean));
    forms.forEach(form => on(form, 'reset', () => requestAnimationFrame(() => { if (!destroyed) refresh(); })));
    setProfile(profileName);
    const api = {
      setProfile,
      getProfile: () => profileName,
      refresh,
      destroy() {
        if (destroyed) return;
        destroyed = true;
        listeners.forEach(remove => remove());
        animations.forEach(animation => animation.stop());
        mounted.delete(profileRoot);
      }
    };
    mounted.set(profileRoot, api);
    return api;
  }

  window.ContactControls = { mount, profiles: Object.keys(PROFILES) };
})();
