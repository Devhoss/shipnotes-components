(() => {
  'use strict';
  const $=s=>document.querySelector(s),app=$('#app'),params=new URLSearchParams(location.search);let film=params.get('film')==='1',open=false;
  const words=$('#words');const c=TypeFrost.mount($('#field'),{film,seed:20261014,inputElement:words});window.frost=c;
  function viewport(){app.style.setProperty('--app-height',`${Math.round(visualViewport?.height||innerHeight)}px`);}viewport();visualViewport?.addEventListener('resize',viewport);
  function panel(on){open=on;app.classList.toggle('settings-open',on);$('#settings').inert=!on;$('#settings-toggle').setAttribute('aria-expanded',String(on));if(on)$('#settings-close').focus({preventScroll:true});else $('#settings-toggle').focus({preventScroll:true});}
  function filming(on){film=on;app.classList.toggle('film',on);c.configure({film:on});}
  $('#settings-toggle').addEventListener('click',()=>panel(!open));$('#settings-close').addEventListener('click',()=>panel(false));
  document.addEventListener('keydown',e=>{if(e.isComposing)return;const typing=/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);if(e.key.toLowerCase()==='h'&&(!typing||e.altKey)){e.preventDefault();filming(!film);}if(e.key==='Escape'&&open){e.preventDefault();panel(false);}});
  $('#sound')?.addEventListener('click',async()=>{try{const on=await c.setSound($('#sound').getAttribute('aria-pressed')!=='true');$('#sound').setAttribute('aria-pressed',String(on));$('#sound').setAttribute('aria-label',on?'Turn sound off':'Turn sound on');}catch{$('#status').textContent='Sound could not start. Try the sound button again.';}});
  document.querySelectorAll('[data-theme]').forEach(button=>button.addEventListener('click',()=>{c.setTheme(button.dataset.theme);document.querySelectorAll('[data-theme]').forEach(b=>{const yes=b===button;b.classList.toggle('active',yes);b.setAttribute('aria-pressed',String(yes));});$('#custom-colour').value=TypeFrost.themes[button.dataset.theme];}));
  $('#custom-colour').addEventListener('input',e=>{c.setTheme(e.target.value);document.querySelectorAll('[data-theme]').forEach(b=>{b.classList.remove('active');b.setAttribute('aria-pressed','false');});});
  $('#font').addEventListener('change',async e=>{e.target.disabled=true;try{await c.setFont(e.target.value);}catch{$('#status').textContent='That font could not load. Keep the font files beside the component.';}finally{e.target.disabled=false;}});
  let pending=null,pendingId=0;for(const key of ['growth','density','length','glow'])$('#'+key).addEventListener('input',e=>{$('#'+key+'-value').value=Number(e.target.value).toFixed(1)+'×';pending={...pending,[key]:+e.target.value};clearTimeout(pendingId);pendingId=setTimeout(()=>{c.configure(pending);pending=null;},80);});
  $('#clear').addEventListener('click',()=>c.shatter());
  $('#copy').addEventListener('click',async()=>{const o=c.getOptions(),options={theme:o.theme,font:o.font,growth:o.growth,density:o.density,length:o.length,glow:o.glow,sound:o.sound,seed:o.seed};const code=`<link rel="stylesheet" href="./type-frost.css">\n<div id="frost" style="height:70vh"></div>\n<script src="./type-frost.js"><\/script>\n<script>TypeFrost.mount(document.querySelector('#frost'), ${JSON.stringify(options)});<\/script>`;
    try{await navigator.clipboard.writeText(code);$('#status').textContent='Copied. Keep type-frost.js, type-frost.css and fonts together.';}catch{const box=$('#copy-fallback');box.hidden=false;box.value=code;box.focus();box.select();$('#status').textContent='Select the code below and copy it.';}
  });
  window.__ready=false;window.ready=c.ready.then(()=>{
    words.disabled=false;
    if(film)filming(true);
    if(params.has('script')){const value=params.get('script');c.loadScript(!value||value==='demo'?TypeFrost.script:JSON.parse(value));window.renderAt=t=>c.renderAt(t);}
    else window.renderAt=t=>c.renderAt(t);
    if(!params.has('script')&&matchMedia('(hover: hover) and (pointer: fine)').matches&&document.activeElement===document.body)c.focus();
    window.__ready=true;return true;
  }).catch(error=>{$('#error').hidden=false;$('#error').textContent='The frost could not load. Keep the font files beside this page, then reload.';console.error(error);throw error;});
  addEventListener('pagehide',()=>{clearTimeout(pendingId);c.destroy();visualViewport?.removeEventListener('resize',viewport);},{once:true});
})();
