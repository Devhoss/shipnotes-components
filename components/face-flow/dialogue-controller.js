/* Event-driven response lifecycle. Silence is mouth movement, not an end event. */
(function(global){
 'use strict';
 class FaceFlowController {
  constructor({onFrame,clock=()=>performance.now()/1000,assembleSeconds=1.25,releaseSeconds=1.15,holdSeconds=.65,reducedMotion=false}={}){
   if(typeof onFrame!=='function')throw new TypeError('onFrame is required');
   this.clock=clock;this.onFrame=onFrame;this.assembleSeconds=Math.max(.01,assembleSeconds);this.releaseSeconds=Math.max(.01,releaseSeconds);this.holdSeconds=Math.max(0,holdSeconds);this.reducedMotion=reducedMotion;
   this.form=0;this.level=0;this.targetLevel=0;this.state='idle';this.activeId=null;this.sequence=0;this.lastTime=clock();this.lastLevel=-Infinity;this.holdUntil=Infinity;this.dead=false;this.binding=null;
  }
  beginResponse(id){
   this.assertAlive();id=id??++this.sequence;
   if(this.activeId===id&&['assembling','speaking'].includes(this.state))return id;
   this.targetLevel=0;this.lastLevel=-Infinity;this.activeId=id;this.holdUntil=Infinity;this.state=this.form>.999?'speaking':'assembling';return id;
  }
  setLevel(value,id=this.activeId){
   this.assertAlive();if(id!==this.activeId||!['assembling','speaking'].includes(this.state))return;
   if(!Number.isFinite(value))throw new TypeError('Audio level must be finite');
   this.targetLevel=Math.min(1,Math.max(0,value));this.lastLevel=this.clock();
  }
  endResponse(id=this.activeId){
   this.assertAlive();if(id!==this.activeId||!['assembling','speaking'].includes(this.state))return;
   this.state='holding';this.holdUntil=this.clock()+this.holdSeconds;this.targetLevel=0;
  }
  cancelResponse(id=this.activeId){
   this.assertAlive();if(id!==this.activeId||this.activeId===null)return;
   this.state='dissolving';this.holdUntil=this.clock();this.targetLevel=0;
  }
  tick(now=this.clock()){
   if(this.dead)return;
   const dt=Math.max(0,Math.min(.10,now-this.lastTime));this.lastTime=now;
   if(this.binding)this.binding.sample();
   if(now-this.lastLevel>.12)this.targetLevel=0;
   this.level+=(this.targetLevel-this.level)*(1-Math.exp(-dt/(this.targetLevel>this.level?.025:.075)));
   if(this.state==='holding'&&now>=this.holdUntil)this.state='dissolving';
   const target=['assembling','speaking','holding'].includes(this.state)?1:0;
   if(this.reducedMotion)this.form=target;
   else this.form=target?Math.min(1,this.form+dt/this.assembleSeconds):Math.max(0,this.form-dt/this.releaseSeconds);
   if(this.state==='assembling'&&this.form===1)this.state='speaking';
   if(this.state==='dissolving'&&this.form===0){this.state='idle';this.activeId=null;this.level=0;}
   const snapshot={time:now,form:this.form,level:this.level,state:this.state,responseId:this.activeId};this.onFrame(snapshot);return snapshot;
  }
  /** Analyse an existing Web Audio node without changing its audible routing. */
  attachAudioNode(node,{context=node?.context,gain=5}={}){
   this.assertAlive();if(!node||!context)throw new TypeError('An AudioNode and its context are required');
   this.detachAudio();const analyser=context.createAnalyser();analyser.fftSize=1024;analyser.smoothingTimeConstant=0;const data=new Float32Array(analyser.fftSize);
   node.connect(analyser);
   this.binding={sample:()=>{analyser.getFloatTimeDomainData(data);let power=0;for(const v of data)power+=v*v;this.setLevel(Math.min(1,Math.pow(Math.sqrt(power/data.length)*gain,.72)));},dispose:()=>{node.disconnect(analyser);analyser.disconnect();}};
   const attached=this.binding;return ()=>{if(this.binding===attached)this.detachAudio();};
  }
  detachAudio(){if(this.binding){this.binding.dispose();this.binding=null;}this.targetLevel=0;}
  destroy(){if(this.dead)return;this.detachAudio();this.dead=true;this.state='destroyed';}
  assertAlive(){if(this.dead)throw new Error('FaceFlow controller was destroyed');}
 }
 global.FaceFlowController=FaceFlowController;
 if(typeof module!=='undefined'&&module.exports)module.exports=FaceFlowController;
})(globalThis);
