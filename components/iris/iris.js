/* Iris. GPU-deformed translucent membranes. No network, model or texture assets. */
(()=>{'use strict';const T=window.THREE;
const VS=`
 precision highp float;
 uniform float uTime,uLayer,uListen,uThink,uSpeak,uLevel;
 uniform vec2 uPointer;
 varying vec2 vUv;varying vec3 vPos;varying float vFold;
 const float PI=3.141592653589793;
 void main(){
  vUv=uv;float a=uv.x*2.0*PI;float v=uv.y;float t=uTime;
  float phase=uLayer*1.618;
  float p=mix(.30+uListen*.20-uThink*.14+uSpeak*(.06+uLevel*.12),2.78,v);
  float slow=t*.16;
  float fold=sin(a*5.0+p*2.7+phase+slow)*.055+sin(a*9.0-p*4.0-phase-t*.11)*.025;
  fold+=sin(a*3.0-p*3.5+t*.19+phase)*.065;
  fold*=pow(sin(p),.7);
  float flutter=sin(a*17.0+p*11.0-t*.27+phase)*.009;
  float breath=1.0+.022*sin(t*.68+phase*.27);
  float wave=sin(p*9.0-t*2.8+sin(a*3.0))*uLevel*.028;
  float r=(1.0+fold+flutter+wave)*breath*(1.0-uLayer*.055)*(1.0-uThink*.065+uSpeak*uLevel*.04);
  float polar=p+sin(a*3.0+t*.12+phase)*.075*sin(p);
  a+=.18*sin(p*2.2+phase+t*.1)+uThink*.35*sin(p*3.0-t*.3);
  vec3 pos=vec3(sin(polar)*cos(a),sin(polar)*sin(a),cos(polar)*.68)*r;
  pos.xy*=1.0+.035*sin(p*6.0+a*4.0+t*.22+phase);
  pos.z+=sin(a*4.0+p*6.0+phase-t*.2)*.09*sin(p);
  pos.z+=uListen*.13*exp(-pow((p-.65)*2.5,2.0));
  pos.xy+=uPointer*.055*(1.0-v)*(.7+uLayer*.2);
  pos.z+=uSpeak*uLevel*.08*sin(p*8.0-t*2.0);
  vPos=pos;vFold=fold;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(pos,1.0);
 }`;
const FS=`
 precision highp float;
 uniform float uTime,uLayer,uListen,uThink,uSpeak,uLevel,uWarm;
 varying vec2 vUv;varying vec3 vPos;varying float vFold;
 const float PI=3.141592653589793;
 float strand(float x,float width){float f=abs(fract(x)-.5);float aa=max(fwidth(x),.001);return 1.0-smoothstep(width,width+aa,f);}
 void main(){
  float a=vUv.x*PI*2.0;float v=vUv.y;float t=uTime;float l=uLayer;
  float flow=sin(v*12.0+a*3.0+t*.14+l)*.48+sin(v*25.0-a*2.0-t*.21)*.12;
  float threads=strand(vUv.x*270.0+flow*3.8,.035);
  float hair=strand(vUv.x*610.0+flow*6.1+sin(v*31.0+a*11.0)*.18,.025);
  float weft=strand(v*330.0+sin(a*4.0+v*11.0)*.7,.035)*.13;
  float ribs=pow(.5+.5*sin(a*23.0+v*7.0+flow),16.0);
  vec3 norm=normalize(cross(dFdx(vPos),dFdy(vPos)));
  float rim=pow(1.0-abs(dot(norm,vec3(0,0,1))),2.0);
  float edge=exp(-v*80.0)+exp(-(1.0-v)*80.0);
  float stripe=pow(.5+.5*sin(a*4.0+v*9.0-t*.17+l*1.7),9.0);
  float hot=pow(.5+.5*sin(a*3.0-v*5.0+t*.24+l),8.0)*smoothstep(.18,.55,v)*(1.0-smoothstep(.70,.96,v));
  hot*=.54+uSpeak*.8+uLevel*.34+uWarm*.7;
  float pulse=exp(-pow((v-fract(t*.12+l*.18))/.065,2.0))*uThink*.27;
  vec3 blue=vec3(.006,.055,.34);vec3 ice=vec3(.15,.45,1.0);
  vec3 hue=mix(blue,ice,clamp(rim*.55+stripe*.35+edge*.7,0.,1.));
  hue=mix(hue,vec3(1.0,.075,.24),clamp(hot,0.,.9));
  hue+=vec3(1.0,.45,.12)*pow(hot,3.0)*.65;
  float fade=smoothstep(0.,.015,v)*(1.0-smoothstep(.97,1.,v));
  float veilMask=pow(.5+.5*sin(a*5.0+v*12.0+flow*1.5+l),3.0);
  float density=(.003+threads*.085+hair*.016+ribs*.022)*(.18+veilMask*.82);
  float light=.38+rim*1.1+stripe*.8+edge*1.5+pulse+uLevel*.16;
  float alpha=density*light*fade*(1.0-l*.16);
  gl_FragColor=vec4(hue*1.6,alpha);
 }`;
const lineVS=`precision highp float;uniform float uTime,uLevel;attribute float aSeed;varying float vBright;varying float vArc;varying float vRadius;void main(){float s=position.x;float id=aSeed;float a=s*6.2831853;float phase=id*2.39996;float radius=1.015+.022*sin(a*5.+phase+uTime*.15)+.025*sin(a*3.-phase-uTime*.12);vec3 p=vec3(cos(a)*radius,sin(a)*radius,.12*sin(a*3.+phase)+.05*sin(a*7.-uTime*.2));float tilt=.18*sin(phase);p.xz=mat2(cos(tilt),-sin(tilt),sin(tilt),cos(tilt))*p.xz;p.yz=mat2(cos(phase),-sin(phase),sin(phase),cos(phase))*p.yz;p*=.96+id*.0015;vBright=.3+.7*pow(.5+.5*sin(a*2.+phase-uTime*.32),4.);vArc=s;vRadius=length(p.xy);gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`;
const lineFS=`precision highp float;varying float vBright;varying float vArc;varying float vRadius;uniform float uTime;void main(){float arc=pow(.5+.5*sin(vArc*6.2831853+uTime*.08),2.);gl_FragColor=vec4(.17,.48,1.,vBright*arc*.055*smoothstep(.65,.93,vRadius));}`;
class IrisOrb{
 constructor(host){
  this.host=host;this.disposed=false;this.paused=false;this.state='idle';this.level=0;this.manualLevel=null;this.warm=0;this.time=0;this.last=0;this.target={listening:0,thinking:0,speaking:0};this.pointer=new T.Vector2();this.aim=new T.Vector2();this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  this.renderer=new T.WebGLRenderer({antialias:false,alpha:false,powerPreference:'high-performance'});this.renderer.setClearColor(0x000000);this.renderer.outputColorSpace=T.LinearSRGBColorSpace;host.append(this.renderer.domElement);
  this.scene=new T.Scene();this.camera=new T.PerspectiveCamera(36,1,.1,20);this.camera.position.set(0,0,4.2);
  this.group=new T.Group();this.scene.add(this.group);this.group.rotation.set(.08,-.17,-.10);
  this.uniforms={uTime:{value:0},uListen:{value:0},uThink:{value:0},uSpeak:{value:0},uLevel:{value:0},uPointer:{value:this.pointer},uWarm:{value:0}};
  this.geometry=new T.PlaneGeometry(1,1,224,96);this.materials=[];
  for(let i=2;i>=0;i--){const m=new T.ShaderMaterial({uniforms:{...this.uniforms,uLayer:{value:i}},vertexShader:VS,fragmentShader:FS,transparent:true,depthWrite:false,depthTest:false,side:T.DoubleSide,blending:T.AdditiveBlending});this.materials.push(m);this.group.add(new T.Mesh(this.geometry,m));}
  // Independent luminous fibres, following the folds with slight differences in depth.
  const fp=[],fu=[],fl=[];const lanes=960,steps=68;
  for(let i=0;i<lanes;i++){
   const a=i/lanes,offset=Math.sin(i*127.1)*.5+.5;
   const start=.012+offset*.10,end=.73+(.5+.5*Math.sin(i*37.7))*.25;
   for(let j=0;j<steps;j++)for(const k of [j,j+1]){
    const v=start+(end-start)*k/steps;
    const u=a+.014*Math.sin(v*8+i*.031)+.003*Math.sin(v*25+i*.17);
    fp.push(0,0,0);fu.push(u,v);fl.push(i);
   }
  }
  this.fibreGeo=new T.BufferGeometry();this.fibreGeo.setAttribute('position',new T.Float32BufferAttribute(fp,3));this.fibreGeo.setAttribute('uv',new T.Float32BufferAttribute(fu,2));this.fibreGeo.setAttribute('aLane',new T.Float32BufferAttribute(fl,1));
  const fibreVS=VS.replace('varying vec2 vUv;','attribute float aLane;varying float vLane;varying vec2 vUv;').replace('vUv=uv;','vUv=uv;vLane=aLane;').replace('vPos=pos;','pos*=1.0+.012*sin(aLane*7.17);pos.z+=.013*sin(aLane*1.71);vPos=pos;');
  this.fibreMat=new T.ShaderMaterial({uniforms:{...this.uniforms,uLayer:{value:.2}},vertexShader:fibreVS,fragmentShader:`precision highp float;uniform float uTime,uWarm,uSpeak,uLevel;varying vec2 vUv;varying float vLane;varying vec3 vPos;void main(){float a=vUv.x*6.2831853;float v=vUv.y;float t=uTime;float energy=pow(.5+.5*sin(a*3.0-v*8.0+t*.23),10.0);float wisps=pow(.5+.5*sin(a*7.0+v*5.0-t*.12),4.0);float fade=smoothstep(.02,.16,v)*(1.0-smoothstep(.72,.98,v));float fiber=.25+.75*pow(.5+.5*sin(vLane*78.233),2.);float hot=energy*(.60+uSpeak*.45+uWarm*.6);vec3 hue=mix(vec3(.018,.22,.88),vec3(.25,.64,1.0),wisps*.6);hue=mix(hue,vec3(1.0,.14,.33),min(1.,hot));hue+=vec3(.85,.38,.08)*pow(hot,3.0);float alpha=fade*fiber*(.04+energy*.34+wisps*.06);gl_FragColor=vec4(hue*2.5,alpha);}`,transparent:true,depthWrite:false,depthTest:false,blending:T.AdditiveBlending});this.group.add(new T.LineSegments(this.fibreGeo,this.fibreMat));
  const count=28,seg=256,pts=[],seed=[];
  for(let j=0;j<count;j++)for(let k=0;k<seg;k++){pts.push(k/seg,0,0,(k+1)/seg,0,0);seed.push(j,j);}
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(pts,3));geo.setAttribute('aSeed',new T.Float32BufferAttribute(seed,1));
  this.lineGeo=geo;this.lineMat=new T.ShaderMaterial({uniforms:this.uniforms,vertexShader:lineVS,fragmentShader:lineFS,transparent:true,depthWrite:false,depthTest:false,blending:T.AdditiveBlending});this.group.add(new T.LineSegments(geo,this.lineMat));
  this.setupPost();this.resize=()=>this.setSize();this.observer=new ResizeObserver(this.resize);this.observer.observe(host);
  this.move=e=>{const r=host.getBoundingClientRect();this.aim.set((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2)};this.leave=()=>this.aim.set(0,0);host.addEventListener('pointermove',this.move);host.addEventListener('pointerleave',this.leave);
  this.visibility=()=>{this.last=0;if(!document.hidden&&!this.raf)this.raf=requestAnimationFrame(t=>this.tick(t))};document.addEventListener('visibilitychange',this.visibility);
  this.setSize();this.update(0);this.render();this.raf=requestAnimationFrame(t=>this.tick(t));
 }
 setupPost(){
  const r=this.renderer;const type=r.extensions.has('EXT_color_buffer_float')?T.HalfFloatType:T.UnsignedByteType;
  const opts={type,depthBuffer:false,stencilBuffer:false,minFilter:T.LinearFilter,magFilter:T.LinearFilter};this.targetRT=new T.WebGLRenderTarget(1,1,opts);this.blurA=new T.WebGLRenderTarget(1,1,opts);this.blurB=new T.WebGLRenderTarget(1,1,opts);
  this.postScene=new T.Scene();this.postCamera=new T.OrthographicCamera(-1,1,1,-1,0,1);this.quad=new T.Mesh(new T.PlaneGeometry(2,2));this.postScene.add(this.quad);
  const vs='varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
  this.blurMat=new T.ShaderMaterial({uniforms:{uTex:{value:null},uStep:{value:new T.Vector2()},uThreshold:{value:0}},vertexShader:vs,fragmentShader:`precision highp float;varying vec2 vUv;uniform sampler2D uTex;uniform vec2 uStep;uniform float uThreshold;void main(){vec3 col=texture2D(uTex,vUv).rgb*.227027;col+=(texture2D(uTex,vUv+uStep*1.384615).rgb+texture2D(uTex,vUv-uStep*1.384615).rgb)*.316216;col+=(texture2D(uTex,vUv+uStep*3.230769).rgb+texture2D(uTex,vUv-uStep*3.230769).rgb)*.070270;col=max(vec3(0.),col-vec3(uThreshold));gl_FragColor=vec4(col,1.);}`});
  this.finalMat=new T.ShaderMaterial({uniforms:{uScene:{value:this.targetRT.texture},uBloom:{value:this.blurA.texture}},vertexShader:vs,fragmentShader:`precision highp float;varying vec2 vUv;uniform sampler2D uScene,uBloom;void main(){vec3 c=texture2D(uScene,vUv).rgb;vec3 bloom=texture2D(uBloom,vUv).rgb;c+=bloom*.62;c=vec3(1.)-exp(-c*1.45);c=pow(c,vec3(1./2.2));gl_FragColor=vec4(c,1.);}`});
 }
 setSize(){const w=this.host.clientWidth,h=this.host.clientHeight;this.dpr=Math.min(devicePixelRatio||1,1.5);this.renderer.setPixelRatio(this.dpr);this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.camera.position.z=1.18/(Math.tan(Math.PI/10)*Math.min(this.camera.aspect*.82,.64));this.group.position.y=.14*this.camera.position.z*Math.tan(Math.PI/10);this.targetRT.setSize(Math.round(w*this.dpr),Math.round(h*this.dpr));const bw=Math.max(1,Math.round(w*this.dpr*.35)),bh=Math.max(1,Math.round(h*this.dpr*.35));this.blurA.setSize(bw,bh);this.blurB.setSize(bw,bh);this.render();}
 setState(name){if(!['idle','listening','thinking','speaking'].includes(name))throw new Error('Unknown Iris state');const previous=this.state;this.state=name;for(const key in this.target)this.target[key]=+(key===name);if(previous!==name)this.host.dispatchEvent(new CustomEvent('iris:statechange',{detail:{state:name,previous}}));}
 setLevel(value){this.manualLevel=value===null?null:Math.max(0,Math.min(1,Number(value)||0));}
 beginAnswer(){this.setState('speaking')}
 endAnswer(){this.setLevel(null);this.setState('idle')}
 setPalette(warm){const next=+!!warm;if(next===this.warm)return;this.warm=next;this.host.dispatchEvent(new CustomEvent('iris:palettechange',{detail:{warm:!!next}}))}
 tick(ms){this.raf=0;if(this.disposed||document.hidden)return;const dt=this.last?Math.min((ms-this.last)/1000,.05):0;this.last=ms;if(!this.paused){if(!this.reduced)this.time+=dt;this.update(dt);this.render()}this.raf=requestAnimationFrame(t=>this.tick(t))}
 update(dt){const u=this.uniforms;u.uTime.value=this.reduced?0:this.time;const k=1-Math.exp(-dt/0.65);u.uListen.value+=(this.target.listening-u.uListen.value)*k;u.uThink.value+=(this.target.thinking-u.uThink.value)*k;u.uSpeak.value+=(this.target.speaking-u.uSpeak.value)*k;u.uWarm.value+=(this.warm-u.uWarm.value)*k;this.pointer.lerp(this.aim,1-Math.exp(-dt/0.8));let lev=this.manualLevel;
  if(lev===null)lev=this.state==='speaking'?(Math.pow(.5+.5*Math.sin(this.time*3.2),2)*.44+Math.pow(.5+.5*Math.sin(this.time*7.3),6)*.25):this.state==='listening'?.08:0;
  this.level+=(lev-this.level)*(1-Math.exp(-dt/(lev>this.level?.08:.3)));u.uLevel.value=this.level;
  this.group.rotation.y=-.17+this.pointer.x*.12+Motion.breathe(this.time,2*Math.PI/.17,1)*.035;this.group.rotation.x=.08-this.pointer.y*.09;this.group.rotation.z=-.10+Motion.breathe(this.time,2*Math.PI/.11,1)*.025;
 }
 renderAt(t,state){this.paused=true;this.time=t;if(state)this.setState(state);this.uniforms.uListen.value=this.target.listening;this.uniforms.uThink.value=this.target.thinking;this.uniforms.uSpeak.value=this.target.speaking;this.uniforms.uWarm.value=this.warm;this.pointer.copy(this.aim);this.level=this.manualLevel===null?(this.state==='speaking'?(Math.pow(.5+.5*Math.sin(t*3.2),2)*.44+Math.pow(.5+.5*Math.sin(t*7.3),6)*.25):this.state==='listening'?.08:0):this.manualLevel;this.update(1);this.render()}
 render(){const r=this.renderer;if(!this.targetRT)return;r.setRenderTarget(this.targetRT);r.render(this.scene,this.camera);this.quad.material=this.blurMat;this.blurMat.uniforms.uTex.value=this.targetRT.texture;this.blurMat.uniforms.uStep.value.set(1/this.blurA.width,0);r.setRenderTarget(this.blurB);r.render(this.postScene,this.postCamera);this.blurMat.uniforms.uTex.value=this.blurB.texture;this.blurMat.uniforms.uStep.value.set(0,1/this.blurA.height);r.setRenderTarget(this.blurA);r.render(this.postScene,this.postCamera);this.quad.material=this.finalMat;r.setRenderTarget(null);r.render(this.postScene,this.postCamera)}
 resume(){this.paused=false;this.last=0}
 dispose(){this.disposed=true;cancelAnimationFrame(this.raf);this.observer.disconnect();this.host.removeEventListener('pointermove',this.move);this.host.removeEventListener('pointerleave',this.leave);document.removeEventListener('visibilitychange',this.visibility);this.geometry.dispose();this.lineGeo.dispose();this.fibreGeo.dispose();this.fibreMat.dispose();this.materials.forEach(m=>m.dispose());this.lineMat.dispose();this.quad.geometry.dispose();this.blurMat.dispose();this.finalMat.dispose();[this.targetRT,this.blurA,this.blurB].forEach(r=>r.dispose());this.renderer.dispose();this.renderer.domElement.remove()}
}
window.IrisOrb=IrisOrb;
})();
