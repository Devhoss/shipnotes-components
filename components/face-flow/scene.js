/* AI Face Flow. Ice + Ava edition, all particle positions seekable on the GPU.
   Surface source: Lee Perry-Smith, Infinite head scan, CC BY 3.0.
   No camera input, no AI endpoint. Reel timeline and event-driven dialogue modes share the same renderer. */
(async()=>{
const T=THREE,M=Motion,params=new URLSearchParams(location.search);
const live=params.get('mode')==='dialogue';if(live)document.body.classList.add('dialogue');
const capture=params.has('capture');if(capture)document.body.classList.add('capture');
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
let amber=params.get('palette')==='amber',time=Number(params.get('t')||(reduced?5.3:0)),playing=!capture&&!reduced,voice=params.get('text')!=='subtitles';
const renderer=new T.WebGLRenderer({canvas:document.querySelector('#scene'),antialias:false,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});
renderer.setPixelRatio(1);renderer.setSize(innerWidth,innerHeight);renderer.setClearColor(0x020405);renderer.outputColorSpace=T.LinearSRGBColorSpace;
renderer.info.autoReset=false;
const scene=new T.Scene(),camera=new T.PerspectiveCamera(34,innerWidth/innerHeight,.1,80);
camera.position.set(0,.3,12.2);camera.lookAt(0,.3,0);
const group=new T.Group();scene.add(group);
const narration=await fetch('audio/voice.json').then(r=>r.json());
function speechAt(t){const x=t*narration.envelopeFps,i=Math.floor(x),f=x-i;return M.mix(narration.envelope[i]||0,narration.envelope[i+1]||0,f)}
const [buffer,head]=await Promise.all([fetch('assets/particles-f16.bin').then(r=>r.arrayBuffer()),fetch('assets/head.json').then(r=>r.json())]);
// Decode particle attributes on the CPU; texture paths stay HalfFloat on the GPU.
function decodeHalf(buffer){const bits=new Uint16Array(buffer),out=new Float32Array(bits.length);for(let i=0;i<bits.length;i++){const h=bits[i],e=(h>>10)&31,m=h&1023;out[i]=(h&32768?-1:1)*(e===0?m*5.960464477539063e-8:e===31?(m?NaN:Infinity):(1+m/1024)*2**(e-15));}return out;}
const raw=decodeHalf(buffer),count=raw.length/9;
const uniforms={uSurfaceExposure:{value:6.35},uLive:{value:0},uForm:{value:0},uTime:{value:time},uYaw:{value:0},uSpeech:{value:0},uGaze:{value:0},uBreath:{value:0},uFlash:{value:0},uAccent:{value:new T.Vector3()},uResolution:{value:new T.Vector2(innerWidth,innerHeight)},uRatio:{value:innerHeight/1920}};
const pathInfo=await fetch('assets/runtime-info.json').then(r=>r.json());
const [pathPos,pathNorm,pathIds]=await Promise.all(['paths-position-f16.bin','paths-normal-f16.bin','path-ids-mobile.bin'].map(n=>fetch('assets/'+n).then(r=>r.arrayBuffer())));
for(const [key,buf] of [['uPaths',pathPos],['uPathNormals',pathNorm]]){const tx=new T.DataTexture(new Uint16Array(buf),pathInfo.width,pathInfo.height,T.RGBAFormat,T.HalfFloatType);tx.minFilter=tx.magFilter=T.LinearFilter;tx.needsUpdate=true;uniforms[key]={value:tx};}
const deformation=`
float eyeX(float side){return side<0.?-.49:.445;}
vec2 eyeLocal(vec3 p){return vec2(p.x-eyeX(sign(p.x)),p.y-.965);}
float mouthLine(float x){return .267-.060*pow(clamp(abs(x)/.40,0.,1.),2.);}
uniform float uTime,uYaw,uSpeech,uGaze,uBreath,uFlash,uLive,uForm;
mat3 yaw(float a){float c=cos(a),s=sin(a);return mat3(c,0.,-s,0.,1.,0.,s,0.,c);}
vec3 face(vec3 p){
 float mid=mouthLine(p.x);
 float mouth=exp(-pow(p.x/.44,4.)-pow((p.y-mid)/.20,2.))*smoothstep(.9,1.15,p.z);
 float jaw=exp(-pow(p.x/.73,4.)-pow((p.y-.02)/.44,2.))*smoothstep(.7,1.1,p.z);
 float lower=1.-smoothstep(mid-.008,mid+.008,p.y);
 float separation=uSpeech*.14*mouth;
 p.y+=separation*(.20-.96*lower)-uSpeech*.04*jaw;
 p.z+=uSpeech*mouth*.025;
 return p;
}
`;
const geom=new T.InstancedBufferGeometry();
geom.setAttribute('position',new T.Float32BufferAttribute([-1,-1,0,1,-1,0,1,1,0,-1,1,0],3));geom.setIndex([0,1,2,0,2,3]);
const data=new T.InstancedInterleavedBuffer(raw,9);
geom.setAttribute('aTarget',new T.InterleavedBufferAttribute(data,3,0));geom.setAttribute('aNormal',new T.InterleavedBufferAttribute(data,3,3));geom.setAttribute('aSeed',new T.InterleavedBufferAttribute(data,3,6));geom.instanceCount=count;
geom.setAttribute('aPath',new T.InstancedBufferAttribute(new Float32Array(pathIds),2));
const vs=`
precision highp float;
attribute vec3 aTarget,aNormal,aSeed;
attribute vec2 aPath;uniform sampler2D uPaths,uPathNormals;
uniform vec2 uResolution;uniform float uRatio,uSurfaceExposure;
varying vec2 vUv;varying float vAlpha,vHeat,vLife;
${deformation}
float sm(float a,float b,float x){return smoothstep(a,b,x);}
vec3 river(float t){
 float ph=6.2831853*t/12.;
 float lane=floor(aSeed.x*14.);float k=aSeed.y*6.2831853+ph;
 float width=pow(aSeed.z,2.8);
 float r=1.02+.46*sin(lane*1.7+k*2.)+width*.34;
 float a=k+.64*sin(k*2.+lane*.24)+lane*.11;
 vec3 p=vec3(r*cos(a),r*sin(a)*1.85,.7*sin(k*2.+lane*.6));
 p.x+=.67*sin(k*2.+lane*.17);p.y+=.34*cos(k*2.+lane*.12);
 p.xy+=vec2(.025*sin(aSeed.x*987.+ph),.025*cos(aSeed.x*743.-ph));
 p.z+=.45*cos(lane+ph)+.7*(aSeed.z-.5);
 // Feather the lower stream into wisps instead of a straight-sided stem.
 float tail=1.-smoothstep(-1.85,-.70,p.y);
 p.x+=tail*(.16*sin(lane*1.93+k*3.)+.11*sin(aSeed.x*117.+ph));
 p.y+=tail*.16*sin(aSeed.x*81.+k*2.);
 return p;
}
vec2 pathUV(float t){float mouth=exp(-pow(aTarget.x/.6,2.)-pow((aTarget.y-.267)/.4,2.));return vec2(fract(aPath.y+t*.026+mouth*uSpeech*.0015),aPath.x);}
vec3 surface(float t){return mix(aTarget,texture2D(uPaths,pathUV(t)).xyz,step(.25,aSeed.z));}
vec3 surfNormal(float t){return normalize(mix(aNormal,texture2D(uPathNormals,pathUV(t)).xyz,step(.25,aSeed.z)));}
float assembly(float t){
 if(uLive>.5)return sm(aSeed.x*.14,.86+aSeed.x*.14,uForm)*step(.025,aSeed.z);
 float front=clamp((aTarget.z+.6)/2.,0.,1.);
 float region=.7*(1.-front)+.25*(aTarget.y+2.35)/4.7;
 float start=1.25+region+aSeed.x*.85;
 float k=sm(start,start+1.9,t);
 float age=max(0.,t-start-1.55);
 k+=.075*exp(-age*4.)*sin(age*8.);
 return k*(1.-sm(10.35+aSeed.x*.25,11.85,t))*step(.025,aSeed.z);
}
vec3 at(float t){
 float k=assembly(t);vec3 p=face(surface(t));vec3 sn=surfNormal(t);
 vec3 tangent=normalize(cross(sn,vec3(.15,1.,.25))+.0001);
 float drift=sin(t*1.4+aSeed.x*37.+aTarget.y*2.);
 // Offset each fibre across its contour by less than one path spacing.
 vec3 across=normalize(cross(sn,tangent));
 p+=across*.013*sin(aSeed.x*173.+.7*sin(t*.8+aSeed.y*13.));
 p+=tangent*.003*drift+sn*(.014+.004*sin(t*2.1+aSeed.y*27.));
 p*=1.+.004*uBreath;
 p=yaw(uYaw)*p;
 vec3 flow=river(t);
 vec3 pos=mix(flow,p,k);
 pos+=sin(k*3.14159265)*vec3(.7*sin(aSeed.x*6.28+t),.45*cos(aSeed.y*6.28+t),.9*sin(aSeed.z*6.28));
 return pos+vec3(0.,-.35,0.);
}
void main(){
 float k=assembly(uTime);
 vec3 p=at(uTime),previous=at(uTime-.018);
 vec4 clip=projectionMatrix*modelViewMatrix*vec4(p,1.);
 vec4 old=projectionMatrix*modelViewMatrix*vec4(previous,1.);
 vec2 velocity=(clip.xy/clip.w-old.xy/old.w)*uResolution*.5;
 float speed=length(velocity);vec2 dir=speed>.01?velocity/speed:vec2(1.,0.);
 vec2 normal=vec2(-dir.y,dir.x);
 float size=mix(.68,1.25,pow(aSeed.z,7.))*uRatio*mix(1.,1.38,k);
 float len=size+min(18.*uRatio,speed*.75);
 vec2 offset=dir*position.x*len+normal*position.y*size;
 clip.xy+=offset*2./uResolution*clip.w;
 gl_Position=clip;
 vec3 surf=surface(uTime);vec3 n=yaw(uYaw)*surfNormal(uTime);
 float facing=sm(-.15,.45,n.z);
 // A high, lateral key reveals the brow, nose and cheek planes.
 float key=pow(max(0.,dot(n,normalize(vec3(-1.2,1.1,.5)))),2.0);
 float rim=pow(1.-abs(n.z),3.)*.32;
 float twinkle=.62+.38*sin(aSeed.x*98.+uTime*2.);
 float fill=pow(max(0.,dot(n,normalize(vec3(.25,.18,1.)))),1.15);
 float light=(.22+key*6.5+fill*.45+rim*.3)*facing*mix(1.,uSurfaceExposure,pow(clamp(k,0.,1.),256.));
 float articulation=exp(-pow(surf.x/.7,2.)-pow((surf.y-.267)/.40,2.))*sm(.6,1.,surf.z);
 light+=articulation*uSpeech*.36;
 float wake=exp(-pow((length(surf.xy-vec2(0.,.95))-(uTime-9.5)*3.)/.25,2.))*uFlash;
 light+=wake*facing*.7;
 // Clear the original closed scan lids, including their asymmetric crease.
 vec2 el=eyeLocal(surf);
 float eye=1.-sm(.40,1.25,pow(el.x/.265,2.)+pow(el.y/.105,2.));
 light*=1.-eye*uGaze*sm(.7,.93,surf.z);
 // A real dark aperture separates the lips when the jaw opens.
 vec3 spoken=face(surf);
 float mx=abs(spoken.x)/.345;
 float mid=mouthLine(spoken.x)-uSpeech*.042;
 float aperture=(.0015+uSpeech*.055)*pow(max(0.,1.-mx*mx),.8);
 float inside=(1.-sm(.94,1.,mx))*(1.-sm(aperture,aperture+.010,abs(spoken.y-mid)))*sm(.9,1.17,spoken.z);
 light*=1.-inside*.99;
 float hem=sm(-2.0,-.55,surf.y);
 light*=hem;
 float pathFade=mix(1.,.55+.45*sm(0.,.018,pathUV(uTime).x)*(1.-sm(.982,1.,pathUV(uTime).x)),step(.25,aSeed.z));
 float tailFade=mix(1.,.60+.40*sm(.03,.92,aSeed.x),1.-sm(-1.9,-.8,p.y));
 vAlpha=mix((.19+.48*pow(aSeed.z,4.))*tailFade,light,k)*twinkle*mix(1.,pathFade,k);
 vHeat=mix(.04+.3*aSeed.z,key*.5+rim,k);
 vLife=k;vUv=position.xy;
}
`;
const fs=`precision highp float;uniform vec3 uAccent;varying vec2 vUv;varying float vAlpha,vHeat,vLife;
void main(){float d=length(vUv);if(d>1.)discard;float a=pow(1.-d,.8);vec3 color=mix(uAccent,vec3(.88,.97,1.),vHeat);gl_FragColor=vec4(color*1.35,vAlpha*a);}`;
const mat=new T.ShaderMaterial({uniforms,vertexShader:vs,fragmentShader:fs,transparent:true,blending:T.AdditiveBlending,depthWrite:false,depthTest:true});
const particles=new T.Mesh(geom,mat);particles.frustumCulled=false;particles.renderOrder=2;group.add(particles);
const headGeo=new T.BufferGeometry();headGeo.setAttribute('position',new T.Float32BufferAttribute(head.positions,3));headGeo.setAttribute('normal',new T.Float32BufferAttribute(head.normals,3));headGeo.setIndex(head.indices);
const depthMat=new T.ShaderMaterial({uniforms,vertexShader:`${deformation}\nvoid main(){vec3 p=yaw(uYaw)*face(position-normal*.025)*(1.+.004*uBreath);p+=vec3(0.,-.35,0.);gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,fragmentShader:'void main(){gl_FragColor=vec4(0.);}',colorWrite:false,depthWrite:true});
const occluder=new T.Mesh(headGeo,depthMat);occluder.renderOrder=1;group.add(occluder);
// Identical forward-facing iris frames inside independently fitted eyelids.
const eyeCount=12000,ep=new Float32Array(eyeCount*3),es=new Float32Array(eyeCount),ek=new Float32Array(eyeCount);
for(let i=0;i<eyeCount;i++){
 const side=i<eyeCount/2?-1:1,k=i%(eyeCount/2),rim=k>=4700;
 const a=k*2.3999632297,r=rim?1:Math.sqrt((k+.5)/4700);
 const dx=Math.cos(a)*r*.235,dy=Math.sin(a)*r*.101*Math.pow(Math.max(.01,1-Math.pow(Math.cos(a)*r,2)),.22);
 const center=side<0?-.49:.445;
 ep[i*3]=center+dx;ep[i*3+1]=.965+dy;ep[i*3+2]=1.105+.030*(1-r*r);
 es[i]=r;ek[i]=rim?1:0;
}
const eg=new T.BufferGeometry();eg.setAttribute('position',new T.BufferAttribute(ep,3));eg.setAttribute('aEye',new T.BufferAttribute(es,1));eg.setAttribute('aRim',new T.BufferAttribute(ek,1));
const em=new T.ShaderMaterial({uniforms,transparent:true,depthWrite:false,depthTest:false,blending:T.AdditiveBlending,vertexShader:`${deformation}
attribute float aEye,aRim;uniform float uRatio;varying float vA;varying float vI;
void main(){vec3 p=position;vec2 local=eyeLocal(p);float dx=local.x,dy=local.y;float rad=length(local);
float iris=(1.-smoothstep(.067,.077,rad))*smoothstep(.029,.036,rad);
float pupil=1.-smoothstep(.026,.032,rad);
float fibres=.68+.32*sin(atan(dy,dx)*53.+rad*290.);
float glint=exp(-pow((dx+.021)/.010,2.)-pow((dy-.026)/.012,2.));
float lid=.008*aRim;
vA=uGaze*((.045+.07*(1.-aEye))*(1.-pupil)*(1.-aRim)+iris*fibres*20.+glint*7.+lid);vI=max(iris,glint);
p.y=.965+dy*(.16+.84*uGaze);p*=1.+.004*uBreath;p=yaw(uYaw)*p+vec3(0.,-.35,0.);gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);gl_PointSize=(aRim>.5?1.35:1.55)*uRatio;
}`,fragmentShader:`uniform vec3 uAccent;varying float vA,vI;void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;gl_FragColor=vec4(mix(uAccent,vec3(.86,.96,1.),vI*.55),vA*(1.-d));}`});
const eyes=new T.Points(eg,em);eyes.renderOrder=3;scene.add(eyes);
// Clear crossing face streaks inside the open eye, not only at particle centres.
for(const side of [-1,1]){
 const socketMat=new T.ShaderMaterial({uniforms:{...uniforms,uSide:{value:side}},transparent:true,depthWrite:false,depthTest:false,vertexShader:`${deformation}
uniform float uSide;varying vec2 vSocket;void main(){vSocket=position.xy;vec3 p=vec3(eyeX(uSide)+position.x*.64,.965+position.y*.34*(.16+.84*uGaze),1.10);p*=1.+.004*uBreath;p=yaw(uYaw)*p+vec3(0.,-.35,0.);gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,fragmentShader:`uniform float uGaze;varying vec2 vSocket;void main(){float d=pow(vSocket.x/.41,2.)+pow(vSocket.y/.31,2.);gl_FragColor=vec4(0.,0.,0.,(1.-smoothstep(.32,1.,d))*uGaze*.92);}`});
 const socket=new T.Mesh(new T.PlaneGeometry(1,1),socketMat);socket.renderOrder=2.8;scene.add(socket);
}
// A local annular halo belongs to the iris, so the pupil stays dark.
for(const side of [-1,1]){
 const haloMat=new T.ShaderMaterial({uniforms:{...uniforms,uSide:{value:side}},transparent:true,depthWrite:false,depthTest:false,blending:T.AdditiveBlending,vertexShader:`${deformation}
uniform float uSide;varying vec2 vHalo;void main(){vHalo=position.xy*.38;vec3 p=vec3(eyeX(uSide)+vHalo.x,.965+vHalo.y,1.14);p*=1.+.004*uBreath;p=yaw(uYaw)*p+vec3(0.,-.35,0.);gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,fragmentShader:`uniform vec3 uAccent;uniform float uGaze;varying vec2 vHalo;void main(){float r=length(vHalo);float halo=exp(-pow((r-.064)/.047,2.))*smoothstep(.022,.042,r);gl_FragColor=vec4(mix(uAccent,vec3(.70,.91,1.),.35),halo*1.35*uGaze);}`});
 const halo=new T.Mesh(new T.PlaneGeometry(1,1),haloMat);halo.renderOrder=3.1;scene.add(halo);
}
// A small separable optical glow leaves the individual fibres sharp.
const targetType=renderer.extensions.has("EXT_color_buffer_float")?T.HalfFloatType:T.UnsignedByteType;
const mainTarget=new T.WebGLRenderTarget(innerWidth,innerHeight,{type:targetType});
const glowA=new T.WebGLRenderTarget(Math.ceil(innerWidth/4),Math.ceil(innerHeight/4),{type:targetType}),glowB=glowA.clone();
const postScene=new T.Scene(),postCamera=new T.OrthographicCamera(-1,1,1,-1,0,1);
const postV='varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
const blur=new T.ShaderMaterial({uniforms:{map:{value:null},direction:{value:new T.Vector2()},uTexel:{value:new T.Vector2(1/innerWidth,1/innerHeight)},uFilter:{value:0},uEye0:{value:new T.Vector2()},uEye1:{value:new T.Vector2()},uGaze:uniforms.uGaze,uRatio:uniforms.uRatio},vertexShader:postV,fragmentShader:`
uniform sampler2D map;uniform vec2 direction,uTexel,uEye0,uEye1;
uniform float uFilter,uGaze,uRatio;varying vec2 vUv;
vec3 sampleGlow(vec2 uv){
 vec3 original=texture2D(map,uv).rgb;
 if(direction.x==0.||uFilter==0.)return original;
 // Integrate the complete 4x4 source footprint before decimation.
 // Sparse fibres must not become low-frequency patches in the glow buffer.
 vec2 d=uTexel;
 vec3 average=vec3(0.);
 for(int y=0;y<4;y++){for(int x=0;x<4;x++){average+=texture2D(map,uv+(vec2(float(x),float(y))-1.5)*d).rgb;}}
 average*=.0625;
 float eyeDistance=min(length((uv-uEye0)/d),length((uv-uEye1)/d));
 float preserveEye=(1.-smoothstep(65.*uRatio,90.*uRatio,eyeDistance))*uGaze;
 return mix(original,average,uFilter*(1.-preserveEye));
}
void main(){vec3 c=sampleGlow(vUv)*.227027;c+=(sampleGlow(vUv+direction*1.384615)+sampleGlow(vUv-direction*1.384615))*.316216;c+=(sampleGlow(vUv+direction*3.230769)+sampleGlow(vUv-direction*3.230769))*.070270;gl_FragColor=vec4(c,1.);}`});
const composite=new T.ShaderMaterial({uniforms:{base:{value:mainTarget.texture},glow:{value:glowB.texture}},vertexShader:postV,fragmentShader:`uniform sampler2D base,glow;varying vec2 vUv;void main(){vec3 c=texture2D(base,vUv).rgb,g=texture2D(glow,vUv).rgb;vec3 light=c+g*.72;gl_FragColor=vec4(.985*light/(vec3(1.)+light),1.);}`});
const quad=new T.Mesh(new T.PlaneGeometry(2,2),blur);postScene.add(quad);
function draw(){
 const b=blur.uniforms,t=uniforms.uTime.value;
 b.uFilter.value=uniforms.uLive.value>.5?M.gate(uniforms.uForm.value,.7,.98):M.gate(t,3.5,4.55)*(1-M.gate(t,10.35,11.85));
 b.uTexel.value.set(1/innerWidth,1/innerHeight);
 const centres=window.eyeCenters();for(let i=0;i<2;i++)b['uEye'+i].value.set(centres[i].x/innerWidth,1-centres[i].y/innerHeight);
 renderer.info.reset();renderer.setRenderTarget(mainTarget);renderer.render(scene,camera);quad.material=blur;blur.uniforms.map.value=mainTarget.texture;blur.uniforms.direction.value.set(3/innerWidth,0);renderer.setRenderTarget(glowA);renderer.render(postScene,postCamera);blur.uniforms.map.value=glowA.texture;blur.uniforms.direction.value.set(0,3/innerHeight);renderer.setRenderTarget(glowB);renderer.render(postScene,postCamera);quad.material=composite;renderer.setRenderTarget(null);renderer.render(postScene,postCamera)
}
if(params.has('solid')){const solid=new T.Mesh(headGeo,new T.MeshNormalMaterial());scene.add(solid);particles.visible=false;occluder.visible=false;window.solid=solid;}
const caption=document.querySelector('#caption'),title=document.querySelector('h1');
const setPalette=()=>{uniforms.uAccent.value.set(...(amber?[1.,.40,.10]:[.20,.74,.95]));document.documentElement.style.setProperty('--accent',amber?'#f8b970':'#89e2ee')};setPalette();
window.renderAt=(t)=>{
 uniforms.uLive.value=0;time=((t%12)+12)%12;uniforms.uTime.value=time;
 const turn=M.gate(time,8.65,9.9);
 uniforms.uYaw.value=M.mix(-.57+.035*Math.sin(time*1.1),0.,turn);
 uniforms.uGaze.value=M.gate(time,9.35,9.85)*(1-M.gate(time,10.35,10.8));
 uniforms.uBreath.value=M.breathe(time,12,4);
 uniforms.uFlash.value=M.flash(time,9.5,.55);
 camera.position.z=M.mix(12.2,10.8,M.gate(time,4.5,9.9))+(12.2-10.8)*M.gate(time,10.35,11.85);
 camera.updateMatrixWorld();
 uniforms.uSpeech.value=speechAt(time);
 occluder.visible=!params.has('solid')&&time>4.55&&time<10.45;
 if(window.solid)window.solid.rotation.y=uniforms.uYaw.value;
 title.style.opacity=String(1-M.gate(time,2.,3.)+M.gate(time,11.4,12.));
 const word=narration.words.find(w=>time>=w.start&&time<w.start+w.duration+.10);
 caption.textContent=!voice&&word?word.text.toLowerCase()+(word===narration.words.at(-1)?'.':''):'';
 caption.style.opacity=word?String(M.blurIn(time-word.start,.10).o):'0';
 document.querySelector('#time').value=time;
 draw();renderer.getContext().flush();
 return {t:time,count,palette:amber?'amber':'ice',yaw:uniforms.uYaw.value,speech:uniforms.uSpeech.value,gaze:uniforms.uGaze.value,voiceMode:voice?'voice':'subtitles',drawCalls:renderer.info.render.calls};
};
window.setPalette=(name)=>{amber=name==='amber';setPalette();window.renderAt(time)};
window.setTextMode=(mode)=>{voice=mode!=='subtitles';window.renderAt(time)};
window.eyeCenters=()=>[-1,1].map(side=>{const p=new T.Vector3(side<0?-.49:.445,.965,1.12);p.multiplyScalar(1+.004*uniforms.uBreath.value);p.applyAxisAngle(new T.Vector3(0,1,0),uniforms.uYaw.value);p.y-=.35;p.project(camera);return {x:(p.x*.5+.5)*innerWidth,y:(-.5*p.y+.5)*innerHeight}});
const audio=document.querySelector('#voice');
let sound=false;
function syncAudio(){if(!sound||!playing){audio.pause();return}if(Math.abs(audio.currentTime-time)>.12)audio.currentTime=time;if(audio.paused)audio.play().catch(()=>{})}
let lastSnapshot;
window.renderDialogue=(snapshot)=>{
 lastSnapshot=snapshot;
 const form=M.gate(snapshot.form,0,1),t=reduced?0:snapshot.time;
 uniforms.uLive.value=1;uniforms.uForm.value=snapshot.form;uniforms.uTime.value=t;
 uniforms.uYaw.value=M.mix(-.57,0,form);
 uniforms.uGaze.value=M.gate(form,.65,.98);
 uniforms.uSpeech.value=snapshot.level*form;
 uniforms.uBreath.value=reduced?0:M.breathe(t,12,4);uniforms.uFlash.value=0;
 camera.position.z=M.mix(12.2,10.8,form);camera.updateMatrixWorld();
 occluder.visible=form>.97;title.style.opacity='0';caption.style.opacity='0';
 const status=document.querySelector('#dialogue-status');
 const labels={idle:'Waiting for a reply',assembling:'Taking shape',speaking:'Reply in progress',holding:'Reply complete',dissolving:'Returning to the flow'};
 const label=labels[snapshot.state]||snapshot.state;if(status.textContent!==label)status.textContent=label;
 document.querySelector('#level').value=snapshot.level;
 draw();return { ...snapshot, gaze:uniforms.uGaze.value, speech:uniforms.uSpeech.value };
};
if(live){
 window.faceFlow=new FaceFlowController({onFrame:window.renderDialogue,reducedMotion:reduced});
 window.faceFlow.tick();
}else window.renderAt(time);
if(capture)window.setSurfaceExposure=value=>{uniforms.uSurfaceExposure.value=value;};
window.faceReady=true;
document.querySelector('#play').textContent=playing?'Pause':'Play';
document.querySelector('#palette').onclick=()=>{amber=!amber;setPalette();window.renderAt(time)};
document.querySelector('#time').oninput=e=>{playing=false;window.renderAt(+e.target.value);document.querySelector('#play').textContent='Play';syncAudio()};
document.querySelector('#play').onclick=()=>{playing=!playing;document.querySelector('#play').textContent=playing?'Pause':'Play';syncAudio()};
document.querySelector('#sound').onclick=()=>{sound=!sound;document.querySelector('#sound').textContent=sound?'Voice on':'Voice off';document.querySelector('#sound').setAttribute('aria-pressed',String(sound));syncAudio()};
let prev=performance.now();function loop(now){if(live&&!capture&&!document.hidden){window.faceFlow.tick(now/1000)}else if(!live&&playing&&!document.hidden){window.renderAt(time+Math.min(.05,(now-prev)/1000));syncAudio()}prev=now;requestAnimationFrame(loop)}requestAnimationFrame(loop);
addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);mainTarget.setSize(innerWidth,innerHeight);glowA.setSize(Math.ceil(innerWidth/4),Math.ceil(innerHeight/4));glowB.setSize(Math.ceil(innerWidth/4),Math.ceil(innerHeight/4));camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();uniforms.uResolution.value.set(innerWidth,innerHeight);uniforms.uRatio.value=innerHeight/1920;if(live)window.renderDialogue(lastSnapshot);else window.renderAt(time)});
})().catch(e=>{console.error(e);const el=document.querySelector('#error');el.style.display='block';el.textContent='The preview could not start. '+e.message;window.faceError=e.message});



