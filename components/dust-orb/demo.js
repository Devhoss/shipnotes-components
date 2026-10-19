addEventListener('DOMContentLoaded',()=>{
  const orb=document.querySelector('#orb'),$=q=>document.querySelector(q);
  const captions={idle:'At rest. Still here.',listening:'Listening. All attention.',thinking:'Following a thought.',speaking:'A thought becomes a voice.',agitated:'Something stirs beneath the surface.'};
  const buttons=[...document.querySelectorAll('[data-state]')];let timers=[],paused=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const syncState=value=>{buttons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.state===value)));$('#state-caption').textContent=captions[value];document.documentElement.style.setProperty('--accent',{idle:'#d9b092',listening:'#88bcd5',thinking:'#e5b76d',speaking:'#87d0af',agitated:'#e77658'}[value]);};
  function stop(){timers.forEach(clearTimeout);timers=[];$('#demo').setAttribute('aria-pressed','false');$('#demo').innerHTML='<span class="play-symbol" aria-hidden="true">▷</span> Watch it change';}
  buttons.forEach(b=>b.addEventListener('click',()=>{stop();orb.setState(b.dataset.state)}));orb.addEventListener('statechange',e=>syncState(e.detail.state));
  $('#energy').addEventListener('input',e=>{orb.setEnergy(e.target.value/100);$('#energy-value').textContent=e.target.value});
  $('#light').addEventListener('input',e=>{orb.setLight(e.target.value/100);$('#light-value').textContent=e.target.value});
  $('#quality').addEventListener('change',e=>orb.setQuality(e.target.value));
  function stats(){const s=orb.stats;$('#performance').textContent=`${s.count.toLocaleString('en-US')} particles · ${s.fallback?'Canvas compatibility':s.fps?s.fps+' fps':'measuring'} · ${s.quality==='auto'?'automatic density':'fixed density'}`;}
  orb.addEventListener('performance',stats);orb.addEventListener('qualitychange',stats);stats();
  $('#details-toggle').addEventListener('click',()=>{const open=$('#details').hidden;$('#details').hidden=!open;$('#details-toggle').setAttribute('aria-expanded',String(open));stats()});
  function syncPause(){$('#pause').setAttribute('aria-pressed',String(paused));$('#pause').setAttribute('aria-label',paused?'Resume motion':'Pause motion');$('#pause-icon').setAttribute('d',paused?'M8 5l10 7-10 7Z':'M9 6v12M15 6v12')}
  $('#pause').addEventListener('click',()=>{paused=!paused;orb.pause(paused);syncPause()});syncPause();
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',e=>{paused=e.matches;syncPause()});
  $('#demo').addEventListener('click',()=>{if(timers.length){stop();return}paused=false;orb.pause(false);syncPause();$('#demo').setAttribute('aria-pressed','true');$('#demo').innerHTML='<span class="play-symbol" aria-hidden="true">□</span> Stop sequence';orb.setState('listening');[['thinking',1800],['speaking',3800],['agitated',5800],['idle',8000]].forEach(([s,t])=>timers.push(setTimeout(()=>orb.setState(s),t)));timers.push(setTimeout(stop,8500));});
  addEventListener('pagehide',stop);
  window.dustDemo={renderAt(t,options={}){stop();orb.setAttribute('recording','');document.body.classList.add('recording');if(Number.isFinite(options.energy)){orb.setEnergy(options.energy);$('#energy').value=Math.round(options.energy*100);$('#energy-value').textContent=$('#energy').value;}if(Number.isFinite(options.light)){orb.setLight(options.light);$('#light').value=Math.round(options.light*100);$('#light-value').textContent=$('#light').value;}const result=orb.renderAt(t,options);const state=options.state||(options.events||[]).filter(e=>e.t<=t).at(-1)?.state||'idle';syncState(state);return result;},live(){orb.removeAttribute('recording');document.body.classList.remove('recording');syncState(orb.state);}};
});
