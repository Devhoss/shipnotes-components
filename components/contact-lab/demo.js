(() => {
  'use strict';
  const bench = document.getElementById('bench');
  const instrument = document.getElementById('instrument');
  const power = document.getElementById('power');
  const feature = document.getElementById('feature');
  const featureStage = document.getElementById('feature-stage');
  const featureState = document.getElementById('feature-state');
  const trace = document.getElementById('trace');
  const output = document.getElementById('output');
  const patternInputs = bench.querySelectorAll('input[name="pattern"]');
  const controls = window.ContactControls.mount(bench);
  let monitorVisible = true;
  const syncMonitorPlayback = () => {
    instrument.dataset.running = String(monitorVisible && !document.hidden);
  };
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      monitorVisible = entries[0]?.isIntersecting ?? false;
      syncMonitorPlayback();
    });
    observer.observe(instrument);
  }
  document.addEventListener('visibilitychange', syncMonitorPlayback);
  syncMonitorPlayback();

  function updateInstrument() {
    const mode = Array.from(patternInputs).find(input => input.checked)?.value || 'orbit';
    const level = Number(output.value);
    instrument.dataset.mode = mode;
    instrument.dataset.power = power.checked ? 'on' : 'off';
    feature.dataset.power = power.checked ? 'on' : 'off';
    featureState.textContent = power.checked ? 'ON' : 'OFF';
    instrument.dataset.trace = trace.checked ? 'on' : 'off';
    instrument.style.setProperty('--device-speed', `${(4.3 - level * 0.033).toFixed(2)}s`);
    instrument.style.setProperty('--device-level', (level / 100).toFixed(2));
    document.getElementById('readout-mode').textContent = mode.toUpperCase();
    document.getElementById('readout-trace').textContent = trace.checked ? 'ON' : 'OFF';
    document.getElementById('readout-output').textContent = `${level}%`;
  }
  bench.addEventListener('input', updateInstrument);
  bench.addEventListener('change', updateInstrument);
  updateInstrument();

  const releaseFeature = () => featureStage.classList.remove('is-holding');
  power.addEventListener('pointerdown', () => featureStage.classList.add('is-holding'));
  power.addEventListener('keydown', event => {
    if (event.code === 'Space') featureStage.classList.add('is-holding');
  });
  power.addEventListener('keyup', releaseFeature);
  power.addEventListener('blur', releaseFeature);
  window.addEventListener('pointerup', releaseFeature);
  window.addEventListener('pointercancel', releaseFeature);
  power.addEventListener('change', () => {
    featureStage.classList.remove('is-hit');
    void featureStage.offsetWidth;
    featureStage.classList.add('is-hit');
  });
  featureStage.addEventListener('animationend', event => {
    if (event.target.classList.contains('feature__ring--one')) featureStage.classList.remove('is-hit');
  });

  bench.querySelectorAll('[data-profile]').forEach(button => button.addEventListener('click', () => {
    controls.setProfile(button.dataset.profile);
    bench.querySelectorAll('[data-profile]').forEach(choice => choice.setAttribute('aria-pressed', String(choice === button)));
  }));
  bench.querySelectorAll('[data-theme]').forEach(button => button.addEventListener('click', () => {
    controls.setTheme(button.dataset.theme === 'orange' ? null : button.dataset.theme);
    bench.querySelectorAll('[data-theme]').forEach(choice => choice.setAttribute('aria-pressed', String(choice === button)));
  }));
})();
