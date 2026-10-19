/* Dust Orb by Ship Notes (@shipnotesai). Public edition 1.0.1, MIT.
   Bundled Three.js r180 on window.THREE. See LICENSE and vendor/THREE-LICENSE.txt. */
(() => {
  'use strict';
  const MAX=200000,STATES=['idle','listening','thinking','speaking','agitated'];
  const ALIAS={alert:'agitated',error:'agitated',talking:'speaking',processing:'thinking',waiting:'idle'};
  const TIERS=[16000,40000,80000,140000,200000];
  const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,Number(n)||0));
  const mix=(a,b,t)=>a+(b-a)*t;
  const rand=seed=>{let s=seed>>>0;return()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return(s>>>0)/4294967296}};
  const VERTEX=`
    precision highp float;
    precision highp sampler3D;
    uniform mat4 modelViewMatrix,projectionMatrix;
    uniform sampler3D uNoise;
    uniform float uTime,uEnergy,uLight,uRatio,uDensity,uGas,uPulse,uVoice;
    uniform vec4 uModes;
    uniform vec2 uPointer,uRotate;
    in vec3 position;
    in vec4 aSeed;
    out vec3 vColor;
    out float vAlpha;
    out float vGas;
    const float TAU=6.28318530718;
    vec3 field(vec3 p,float t){
      vec3 a=p*1.85+vec3(t*.34,-t*.27,t*.21);
      return vec3(sin(a.z)*cos(a.y)-cos(a.z)*sin(a.x),
                  sin(a.x)*cos(a.z)-cos(a.x)*sin(a.y),
                  sin(a.y)*cos(a.x)-cos(a.y)*sin(a.z))*.65;
    }
    mat2 rotate(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
    void main(){
      float t=uTime;
      float listen=uModes.x,think=uModes.y,speak=uModes.z,anger=uModes.w;
      vec3 q=position;
      vec3 n=texture(uNoise,q*.17+vec3(t*.011,-t*.014,t*.009)).rgb*2.-1.;
      vec3 fine=texture(uNoise,q*.51+n*.065+vec3(-t*.018,t*.009,t*.012)).rgb*2.-1.;
      float fold=sin(q.y*5.8+n.y*2.8+t*.27)*sin(q.x*4.2+n.z*1.7-t*.19);
      float breath=sin(t*.85)*.023;
      float syllable=pow(.5+.5*sin(t*8.2+sin(t*3.9)),3.)*.65+uVoice*.7;
      float expansion=1.+breath+uPulse*.16+speak*syllable*.09-anger*.085;
      vec3 flow=mix(field(q,t),field(q*1.8,t*2.3),anger*.72);
      vec3 p=q*(expansion+n.x*.22+fold*(.13+think*.06))+flow*(.17+uEnergy*.20+anger*.17);
      p+=fine*(.065+anger*.07);
      // Thin folded layers provide high-density wisps while every seed keeps its identity.
      p.y+=sin(q.x*3.2+q.z*2.5+t*.4)*(.075+think*.055);
      p.xz=rotate(.17*sin(q.y*2.7+t*.19)+think*.13*sin(t*.31+q.y))*p.xz;
      float fringe=smoothstep(.87,1.,aSeed.w);
      p+=normalize(q)*(fringe*.18*sin(t*.6+aSeed.x*TAU)+speak*syllable*.045);
      vec2 delta=p.xy-uPointer*1.18;
      float proximity=exp(-dot(delta,delta)*2.5);
      p.xy+=delta*proximity*(.07+uPulse*.20);
      p.xz=rotate(t*.035+uRotate.x)*p.xz;p.yz=rotate(.12*sin(t*.16)+uRotate.y)*p.yz;
      vec3 emberA=vec3(.28*sin(t*.42),-.18+.18*cos(t*.36),.35);
      vec3 emberB=vec3(-.36,.30*sin(t*.53),-.10);
      float heat=exp(-dot(p-emberA,p-emberA)*2.9)+.55*exp(-dot(p-emberB,p-emberB)*5.);
      float flicker=.72+.16*sin(t*2.6+sin(t*1.1))+.08*sin(t*6.7);
      heat*=uLight*(.65+anger*1.6+speak*syllable*.9+uPulse*.8)*flicker;
      vec3 dust=vec3(.52,.56,.57);
      dust=mix(dust,vec3(.42,.64,.71),listen*.55);
      dust=mix(dust,vec3(.63,.56,.46),think*.35);
      dust=mix(dust,vec3(.44,.65,.60),speak*.45);
      vec3 ember=mix(vec3(1.,.23,.075),vec3(.14,.55,.92),listen);
      ember=mix(ember,vec3(1.,.55,.12),think);ember=mix(ember,vec3(.20,.94,.63),speak);ember=mix(ember,vec3(1.,.055,.024),anger);
      float front=smoothstep(-1.5,1.2,p.z);
      float edge=.55+.45*pow(abs(normalize(q).z),.65);
      vColor=dust*(.48+front*.53)*edge+ember*heat*(uGas>.5?2.3:.30);
      float size=mix(.70,1.70,aSeed.z);
      vAlpha=(.22+aSeed.y*.22)*mix(.48,1.,front)*(1.-fringe*.53)*uDensity;
      if(uGas>.5){size=mix(18.,42.,aSeed.z);vColor=ember*heat*2.3;vAlpha=.027*uDensity;}
      vec4 mv=modelViewMatrix*vec4(p,1.);
      gl_Position=projectionMatrix*mv;
      gl_PointSize=clamp(size*uRatio*(4.3/-mv.z),uGas>.5?4.:.8,uGas>.5?52.:3.8);
      vGas=uGas;
    }
  `;
  const FRAGMENT=`
    precision highp float;
    in vec3 vColor;
    in float vAlpha,vGas;
    out vec4 outColor;
    void main(){
      vec2 uv=gl_PointCoord*2.-1.;float r=dot(uv,uv);if(r>1.)discard;
      float mask=vGas>.5?exp(-r*4.)*(1.-smoothstep(.65,1.,r)):1.-smoothstep(.12,1.,r);
      outColor=vec4(vColor,vAlpha*mask);
    }
  `;
  class DustOrb extends HTMLElement{
    static get observedAttributes(){return ['recording'];}
    constructor(){super();this._events=[];this._state='idle';this._quality='auto';this._count=80000;this._tier=2;this._energy=.52;this._light=.67;this._time=0;this._last=0;this._frame=0;this._fps=null;this._samples=[];this._autoWait=0;this._paused=false;this._rotation={x:0,y:0};this._target={x:0,y:0};this._pointer={x:0,y:0};this._press=-100;this._destroyed=false;this._raf=this._raf.bind(this);}
    connectedCallback(){
      if(this.shadowRoot&&!this._destroyed){this._schedule();return;}
      this._destroyed=false;this._frame=0;this._last=0;this._fallback=false;this._lost=false;
      (this.shadowRoot||this.attachShadow({mode:'open'})).innerHTML=`<style>:host{display:block;position:relative;width:100%;height:100%;min-height:200px;contain:layout style}canvas{width:100%;height:100%;display:block;touch-action:pan-y;outline:none}canvas:focus-visible{outline:1px solid #b7b3a3;outline-offset:-8px;border-radius:8px}.message{position:absolute;bottom:10px;left:20px;right:20px;text-align:center;font:12px/1.5 system-ui;color:#b0aba0;pointer-events:none}</style><canvas tabindex="0" role="img" aria-label="Living dust cloud. Drag to rotate. Press Space to send a pulse."></canvas><div class="message" role="status"></div>`;
      this._canvas=this.shadowRoot.querySelector('canvas');this._message=this.shadowRoot.querySelector('.message');
      this._motion=matchMedia('(prefers-reduced-motion: reduce)');this._paused=this._motion.matches;
      this._abort=new AbortController();const signal=this._abort.signal;
      this._build();
      this._motion.addEventListener('change',()=>{this._paused=this._motion.matches;this._last=0;this._schedule()},{signal});
      document.addEventListener('visibilitychange',()=>{this._last=0;if(document.hidden){cancelAnimationFrame(this._frame);this._frame=0}else this._schedule()},{signal});
      this._canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this._lost=true;cancelAnimationFrame(this._frame);this._frame=0;this._message.textContent='Graphics paused. Waiting for the browser to restore them.'},{signal});
      this._canvas.addEventListener('webglcontextrestored',()=>{this._lost=false;this._message.textContent='';this._resize();this._schedule()},{signal});
      this._canvas.addEventListener('pointerdown',e=>{this._drag={id:e.pointerId,x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,moved:false};this._canvas.setPointerCapture(e.pointerId)},{signal});
      this._canvas.addEventListener('pointermove',e=>{
        const r=this.getBoundingClientRect();this._target={x:(e.clientX-r.x)/r.width*2-1,y:1-(e.clientY-r.y)/r.height*2};
        if(this._drag){const dx=e.clientX-this._drag.lastX,dy=e.clientY-this._drag.lastY;this._rotation.x+=dx*.005;this._rotation.y=clamp(this._rotation.y+dy*.003,-.7,.7);this._drag.lastX=e.clientX;this._drag.lastY=e.clientY;if(Math.hypot(e.clientX-this._drag.x,e.clientY-this._drag.y)>7)this._drag.moved=true;}this._schedule();
      },{signal});
      this._canvas.addEventListener('pointerup',e=>{if(this._drag&&!this._drag.moved)this.pulse();this._drag=null;if(this._canvas.hasPointerCapture(e.pointerId))this._canvas.releasePointerCapture(e.pointerId)},{signal});
      this._canvas.addEventListener('pointercancel',()=>{this._drag=null},{signal});
      this._canvas.addEventListener('pointerleave',()=>{if(!this._drag)this._target={x:0,y:0}},{signal});
      this._canvas.addEventListener('keydown',e=>{if(e.code==='Space'||e.code==='Enter'){e.preventDefault();this.pulse()}},{signal});
      this._observer=new ResizeObserver(()=>this._resize());this._observer.observe(this);this._resize();this._schedule();
    }
    disconnectedCallback(){this.destroy()}
    attributeChangedCallback(){if(this.hasAttribute('recording')){cancelAnimationFrame(this._frame);this._frame=0;}else{this._last=0;this._schedule();}}
    _build(){
      try{
        const T=window.THREE;if(!T)throw Error('Three.js is unavailable');
        this._renderer=new T.WebGLRenderer({canvas:this._canvas,alpha:true,antialias:false,powerPreference:'low-power',preserveDrawingBuffer:true});
        this._renderer.setClearColor(0x000000,0);this._renderer.setPixelRatio(1);this._renderer.outputColorSpace=T.LinearSRGBColorSpace;
        this._scene=new T.Scene();this._camera=new T.PerspectiveCamera(43,1,.1,30);this._camera.position.z=4.9;
        const random=rand(1729),edge=32,data=new Uint8Array(edge*edge*edge*4);
        for(let i=0;i<data.length;i+=4){data[i]=random()*255;data[i+1]=random()*255;data[i+2]=random()*255;data[i+3]=255;}
        this._noise=new T.Data3DTexture(data,edge,edge,edge);this._noise.format=T.RGBAFormat;this._noise.type=T.UnsignedByteType;this._noise.minFilter=this._noise.magFilter=T.LinearFilter;this._noise.wrapS=this._noise.wrapT=this._noise.wrapR=T.RepeatWrapping;this._noise.unpackAlignment=1;this._noise.needsUpdate=true;
        const make=(count,gas)=>{
          const geometry=new T.BufferGeometry(),positions=new Float32Array(count*3),seeds=new Float32Array(count*4),random=rand(gas?9723:3481);
          for(let i=0;i<count;i++){
            const z=random()*2-1,a=random()*Math.PI*2,s=Math.sqrt(1-z*z),layer=random();
            let radius=gas?Math.pow(random(),.65)*.96:layer<.80?1.02+(random()-.5)*.14:layer<.94?Math.pow(random(),.4)*1.07:1.1+random()*.22;
            radius+=gas?0:.10*Math.sin(a*3+z*4)*Math.cos(z*5);
            positions.set([s*Math.cos(a)*radius,z*radius,s*Math.sin(a)*radius],i*3);seeds.set([random(),random(),random(),layer],i*4);
          }
          geometry.setAttribute('position',new T.BufferAttribute(positions,3));geometry.setAttribute('aSeed',new T.BufferAttribute(seeds,4));
          const uniforms={uNoise:{value:this._noise},uTime:{value:0},uEnergy:{value:.52},uLight:{value:.67},uRatio:{value:1},uDensity:{value:1},uGas:{value:gas?1:0},uModes:{value:new T.Vector4()},uPointer:{value:new T.Vector2()},uRotate:{value:new T.Vector2()},uPulse:{value:0},uVoice:{value:0}};
          const material=new T.RawShaderMaterial({glslVersion:T.GLSL3,vertexShader:VERTEX,fragmentShader:FRAGMENT,uniforms,transparent:true,depthTest:false,depthWrite:false,blending:T.AdditiveBlending});
          const points=new T.Points(geometry,material);points.frustumCulled=false;points.renderOrder=gas?0:1;this._scene.add(points);return {geometry,material,uniforms,points};
        };
        this._dust=make(MAX,false);this._gas=make(1400,true);this._dust.geometry.setDrawRange(0,this._count);this._gas.geometry.setDrawRange(0,this._count<=40000?650:1400);
        this._renderer.compile(this._scene,this._camera);
        const gl=this._renderer.getContext(),extension=gl.getExtension('WEBGL_debug_renderer_info');this._device=extension?gl.getParameter(extension.UNMASKED_RENDERER_WEBGL):'WebGL 2';
        if(/swiftshader|llvmpipe|software/i.test(this._device)){this._tier=0;this._setCount(TIERS[0]);}
      }catch(error){
        this._fallback=true;this._device='Canvas 2D fallback';this._count=5000;
        const old=this._canvas,fresh=old.cloneNode();old.replaceWith(fresh);this._canvas=fresh;this._ctx=fresh.getContext('2d');
        const random=rand(774);this._cpu=Array.from({length:5000},()=>{const z=random()*2-1,a=random()*Math.PI*2,r=1+(random()-.5)*.25;return{x:Math.sqrt(1-z*z)*Math.cos(a)*r,y:z*r,z:Math.sqrt(1-z*z)*Math.sin(a)*r,seed:random()}});
        this._message.textContent='Compatibility mode · 5,000 particles';console.warn('Dust Orb: using Canvas 2D compatibility mode.',error.message);
      }
    }
    _resize(){
      if(!this._canvas||this._destroyed)return;
      const r=this.getBoundingClientRect();if(!r.width||!r.height)return;this._w=r.width;this._h=r.height;
      if(this._fallback){this._canvas.width=r.width;this._canvas.height=r.height;}
      else{const ratio=Math.min(devicePixelRatio||1,this._count<=40000?1:1.35);this._ratio=ratio;this._renderer.setPixelRatio(ratio);this._renderer.setSize(r.width,r.height,false);this._camera.aspect=r.width/r.height;const aspect=r.width/r.height;this._camera.position.z=Math.max(r.width<500?4.7:4.35,1.5/(.394*aspect));this._camera.updateProjectionMatrix();}
      if(this.hasAttribute('recording')&&this._snapshot)this.renderAt(this._snapshot.time,this._snapshot.options);
      else this.renderAt(this._time,{events:this._events});
    }
    _schedule(){if(!this._frame&&!this._destroyed&&!this._lost&&!document.hidden&&!this.hasAttribute('recording'))this._frame=requestAnimationFrame(this._raf)}
    _raf(now){
      this._frame=0;if(this.hasAttribute('recording')||this._destroyed||this._lost||document.hidden)return;
      const elapsed=this._last?(now-this._last)/1000:1/60,dt=Math.min(.08,elapsed);this._last=now;
      if(!this._paused)this._time+=dt;
      const follow=1-Math.exp(-dt*5);this._pointer.x=mix(this._pointer.x,this._target.x,follow);this._pointer.y=mix(this._pointer.y,this._target.y,follow);
      this.renderAt(this._time,{events:this._events});
      if(!this._paused){this._samples.push(elapsed*1000);if(this._samples.length>=90)this._performance();this._schedule()}
    }
    _performance(){
      const sorted=this._samples.slice().sort((a,b)=>a-b),median=sorted[Math.floor(sorted.length/2)];this._fps=Math.round(1000/median);this._samples=[];
      if(this._quality==='auto'&&!this._fallback){
        this._autoWait++;
        if(this._autoWait>=2&&median>23&&this._tier>0){this._tier--;this._setCount(TIERS[this._tier]);this._autoWait=0;}
        else if(this._autoWait>=5&&median<17.7&&this._tier<TIERS.length-1&&!/swiftshader|software/i.test(this._device)){this._tier++;this._setCount(TIERS[this._tier]);this._autoWait=0;}
      }
      this.dispatchEvent(new CustomEvent('performance',{detail:this.stats}));
    }
    _setCount(count){this._count=count;if(this._dust){this._dust.geometry.setDrawRange(0,count);this._gas.geometry.setDrawRange(0,count<=40000?650:1400);this._resize();}this.dispatchEvent(new CustomEvent('qualitychange',{detail:this.stats}));}
    get stats(){return {count:this._count,fps:this._fps,quality:this._quality,device:this._device||'initializing',fallback:!!this._fallback};}
    get state(){return this._state;}
    set state(value){this.setState(value)}
    setState(value){value=ALIAS[value]||value;if(!STATES.includes(value))throw new RangeError('Unknown orb state: '+value);if(value===this._state)return;this._state=value;this._events.push({t:this._time,state:value});if(this._paused){this._events=[{t:0,state:value}];this._time=Math.max(this._time,2);}this._schedule();this.dispatchEvent(new CustomEvent('statechange',{detail:{state:value}}));}
    setEnergy(value){this._energy=clamp(value);this._schedule()}
    setLight(value){this._light=clamp(value);this._schedule()}
    setVoiceLevel(value){this._voice=clamp(value);this._schedule()}
    setVoice(value){this.setVoiceLevel(value)}
    setQuality(value){
      if(value!=='auto'&&![16000,40000,80000,140000,200000].includes(+value))throw new RangeError('Unsupported particle count');
      this._quality=value==='auto'?'auto':+value;this._autoWait=0;this._samples=[];
      if(!this._fallback){if(value==='auto'){this._tier=2;this._setCount(TIERS[this._tier])}else this._setCount(+value);}return this.stats;
    }
    pause(value=true){this._paused=!!value;this._last=0;this._schedule();return this._paused;}
    pulse(){this._press=this._time;this._schedule()}
    _weights(t,events){
      let weights=[1,0,0,0,0],start=weights.slice(),target=0,at=0;
      const sample=time=>start.map((v,i)=>mix(v,+(i===target),1-Math.exp(-Math.max(0,time-at)/.32)));
      for(const e of [...events].sort((a,b)=>a.t-b.t)){if(e.t>t)break;const index=STATES.indexOf(e.state);if(index<0)continue;weights=sample(e.t);start=weights;target=index;at=e.t;}
      return sample(t);
    }
    renderAt(time,{state,events,energy=this._energy,light=this._light,rotation=this._rotation,pointer=this._pointer,pulse,voice=this._voice||0}={}){
      if(this._destroyed||!this._w||this._lost)return;
      this._snapshot={time,options:{state,events,energy,light,rotation:{...rotation},pointer:{...pointer},pulse,voice}};
      const t=Math.max(0,+time||0),weights=state?STATES.map(s=>+(s===state)):this._weights(t,events??this._events);
      const age=t-this._press,impulse=pulse??(age>=0&&age<2?Math.sin(Math.min(age/.12,1)*Math.PI/2)*Math.exp(-age*2.8):0);
      if(this._fallback){this._renderCPU(t,weights,energy,light);return {weights,count:5000,fallback:true};}
      const density=Math.pow(200000/this._count,.43);
      for(const layer of [this._dust,this._gas]){
        const u=layer.uniforms;u.uTime.value=t;u.uEnergy.value=clamp(energy);u.uLight.value=clamp(light);u.uRatio.value=this._ratio||1;u.uDensity.value=layer===this._dust?density:1;u.uModes.value.set(...weights.slice(1));u.uPointer.value.set(pointer.x,pointer.y);u.uRotate.value.set(rotation.x,rotation.y);u.uPulse.value=impulse;u.uVoice.value=clamp(voice);
      }
      this._renderer.render(this._scene,this._camera);
      if(this.hasAttribute('recording'))this._renderer.getContext().flush();
      return {weights,count:this._count,fallback:false};
    }
    _renderCPU(t,weights,energy,light){
      const c=this._ctx,w=this._w,h=this._h,scale=Math.min(w,h)*.33;c.clearRect(0,0,w,h);
      const warm=weights[2]+weights[4],r=warm>0.3?220:155,g=weights[4]>.5?85:180,b=weights[4]>.5?65:193;
      const glow=c.createRadialGradient(w*.5,h*.5,0,w*.5,h*.5,scale);glow.addColorStop(0,`rgba(${r},${g},${b},${light*.08})`);glow.addColorStop(1,'rgba(0,0,0,0)');c.fillStyle=glow;c.fillRect(0,0,w,h);
      c.fillStyle=`rgba(${r},${g},${b},.34)`;
      for(const q of this._cpu){const n=Math.sin(q.y*5+t*.3)*Math.cos(q.z*4-t*.2)*(.12+energy*.10),a=t*.035+this._rotation.x,x=q.x*Math.cos(a)+q.z*Math.sin(a),z=-q.x*Math.sin(a)+q.z*Math.cos(a),perspective=3.5/(3.5-z);c.fillRect(w*.5+x*(1+n)*scale*perspective,h*.5+q.y*(1+n)*scale*perspective,1.1,1.1);}
    }
    destroy(){if(this._destroyed)return;this._destroyed=true;cancelAnimationFrame(this._frame);this._observer?.disconnect();this._abort?.abort();for(const item of [this._dust,this._gas]){item?.geometry.dispose();item?.material.dispose();}this._noise?.dispose();this._renderer?.dispose();}
  }
  customElements.define('dust-orb',DustOrb);
})();
