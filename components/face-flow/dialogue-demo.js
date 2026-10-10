/* Local playback example. The application owns audio and reply boundaries. */
if(new URLSearchParams(location.search).get('mode')==='dialogue'){
 (async()=>{
  while(!window.faceReady&&!window.faceError)await new Promise(r=>setTimeout(r,50));
  if(window.faceError)return;
  const flow=window.faceFlow,clip=new Audio('audio/ava.mp3');clip.preload='auto';
  const $=id=>document.getElementById(id),reply=$('reply'),pause=$('pause-reply'),finish=$('finish-reply'),cancel=$('cancel-reply');
  let context,source,id=null,serial=0;
  function stopAudio(){clip.pause();clip.currentTime=0;pause.textContent='Pause voice';pause.disabled=true;}
  function controls(active){finish.disabled=cancel.disabled=!active;}
  reply.disabled=false;
  reply.onclick=async()=>{
   const attempt=++serial;reply.disabled=true;$('dialogue-error').textContent='';
   try{
    if(!context){context=new AudioContext();source=context.createMediaElementSource(clip);source.connect(context.destination);flow.attachAudioNode(source);}
    await context.resume();if(attempt!==serial)return;
    stopAudio();id=flow.beginResponse('demo-'+attempt);controls(true);
    // Audio begins after assembly. Resume happens inside the user's click above.
    await new Promise(r=>setTimeout(r,1350));if(attempt!==serial)return;
    await clip.play();if(attempt!==serial){clip.pause();return;}pause.disabled=false;
   }catch(e){if(attempt!==serial)return;flow.cancelResponse(id);controls(false);$('dialogue-error').textContent='Playback could not start. '+e.message;}
   finally{if(attempt===serial)reply.disabled=false;}
  };
  pause.onclick=async()=>{
   if(clip.paused){try{await context.resume();await clip.play();pause.textContent='Pause voice';}catch(e){$('dialogue-error').textContent=e.message;}}
   else{clip.pause();pause.textContent='Resume voice';}
  };
  clip.onended=()=>{flow.endResponse(id);controls(false);pause.disabled=true;};
  finish.onclick=()=>{++serial;stopAudio();flow.endResponse(id);controls(false);reply.disabled=false;};
  cancel.onclick=()=>{++serial;stopAudio();flow.cancelResponse(id);controls(false);reply.disabled=false;};
 })();
}
