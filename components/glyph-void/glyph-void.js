/* Ship Notes: Glyph Void. A word cut out of a moving field of real glyphs.
   Zero dependencies. Canvas rendering is time based and can be sought with renderAt(t). */
(() => {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const smooth = v => { v = clamp(v); return v * v * (3 - 2 * v); };
  const hash = n => { let x = (n ^ 0x45d9f3b) >>> 0; x = Math.imul(x ^ (x >>> 16), 0x45d9f3b); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };

  class GlyphVoid extends HTMLElement {
    static get observedAttributes() { return ['text', 'density', 'color', 'accent', 'paused']; }
    constructor() {
      super();
      this.root = this.attachShadow({mode: 'open'});
      this.root.innerHTML = `<style>:host{display:block;position:relative;overflow:hidden;background:#05090b;contain:layout paint size}canvas{display:block;width:100%;height:100%}</style><canvas aria-hidden="true"></canvas>`;
      this.canvas = this.root.querySelector('canvas');
      this.ctx = this.canvas.getContext('2d', {alpha:false});
      this.t = 0; this.started = 0; this.last = 0; this.scripted = false;
      this.pointer = {x:-9999,y:-9999,at:-10,power:0};
      this._move = this.onMove.bind(this);
      this._down = this.onDown.bind(this);
      this._tick = this.tick.bind(this);
    }
    connectedCallback() {
      this.setAttribute('role','img');
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this);
      this.addEventListener('pointermove',this._move);
      this.addEventListener('pointerdown',this._down);
      Promise.all([
        document.fonts.load('900 120px VoidDisplay'),
        document.fonts.load('900 120px VoidNarrow'),
        document.fonts.load('400 24px VoidMono')
      ]).then(() => this.resize());
      if(!this.hasAttribute('paused') && !matchMedia('(prefers-reduced-motion: reduce)').matches){this.started=performance.now();this.raf=requestAnimationFrame(this._tick);}
    }
    disconnectedCallback() {
      this.resizeObserver?.disconnect(); cancelAnimationFrame(this.raf);
      this.removeEventListener('pointermove',this._move);this.removeEventListener('pointerdown',this._down);
    }
    attributeChangedCallback(name) {
      if(name==='text'){this.setAttribute('aria-label',this.text);if(this.w){this.makeMask();this.makeGlyphs();}}
      if(name==='density'&&this.w)this.makeGlyphs();
      if((name==='color'||name==='accent')&&this.w)this.makeAtlas();
      if(name==='paused') {cancelAnimationFrame(this.raf);if(!this.hasAttribute('paused')&&this.isConnected){this.started=performance.now()-this.t*1000;this.raf=requestAnimationFrame(this._tick);}}
      if(this.w)this.renderAt(this.t);
    }
    get text(){return (this.getAttribute('text')||'MAKE').trim().slice(0,14).toUpperCase();}
    setText(v){this.setAttribute('text',v);}
    get density(){return clamp(Number(this.getAttribute('density')||1),.35,1.6);}
    onMove(e){const r=this.getBoundingClientRect();this.pointer={x:(e.clientX-r.left)*this.w/r.width,y:(e.clientY-r.top)*this.h/r.height,at:this.t,power:.68};}
    onDown(e){this.onMove(e);this.pointer.power=1.35;}
    resize(){
      const r=this.getBoundingClientRect();if(r.width<2||r.height<2)return;
      // Work in CSS pixels. A capped internal scale keeps old laptops responsive.
      this.w=Math.round(r.width);this.h=Math.round(r.height);
      const dpr=Math.min(devicePixelRatio||1,1.5),cap=Math.min(1,1700/Math.max(this.w,this.h));this.pixelRatio=dpr*cap;
      this.canvas.width=Math.max(1,Math.round(this.w*this.pixelRatio));this.canvas.height=Math.max(1,Math.round(this.h*this.pixelRatio));
      this.ctx.setTransform(this.pixelRatio,0,0,this.pixelRatio,0,0);
      this.layer=document.createElement('canvas');this.layer.width=this.canvas.width;this.layer.height=this.canvas.height;
      this.layerCtx=this.layer.getContext('2d');this.layerCtx.setTransform(this.pixelRatio,0,0,this.pixelRatio,0,0);
      this.makeMask();this.makeGlyphs();this.makeAtlas();this.renderAt(this.t);
    }
    makeMask(){
      if(!this.w)return;
      const w=this.w,h=this.h;
      const c=document.createElement('canvas');c.width=w;c.height=h;
      const x=c.getContext('2d',{willReadFrequently:true});
      x.fillStyle='#fff';x.textAlign='center';x.textBaseline='alphabetic';
      const limit=Math.min(w*.52,h*.33),maxWidth=w*.91;
      let size=limit,total=0,widths=[],gap=0;
      const family='VoidDisplay, Arial Black, sans-serif';
      do{x.font=`900 ${Math.round(size)}px ${family}`;widths=[...this.text].map(ch=>x.measureText(ch).width);gap=size*.10;total=widths.reduce((a,b)=>a+b,0)+gap*Math.max(0,widths.length-1);if(total<=maxWidth)break;size-=3;}while(size>32);
      const m=x.measureText('H'),baseline=h*.506+(m.actualBoundingBoxAscent-m.actualBoundingBoxDescent)*.5;
      let at=(w-total)*.5;x.textAlign='left';x.strokeStyle='#fff';x.lineWidth=Math.max(10,w*.014);x.lineJoin='round';
      for(let i=0;i<widths.length;i++){x.strokeText(this.text[i],at,baseline);x.fillText(this.text[i],at,baseline);at+=widths[i]+gap;}
      const ctx2=document.createElement('canvas');ctx2.width=w;ctx2.height=h;
      const g=ctx2.getContext('2d',{willReadFrequently:true});g.filter=`blur(${Math.max(13,Math.round(w*.026))}px)`;g.drawImage(c,0,0);g.filter='none';
      this.maskCanvas=c;this.mask=x.getImageData(0,0,w,h).data;this.halo=g.getImageData(0,0,w,h).data;
      this.wordSize=size;
    }
    makeGlyphs(){
      if(!this.w)return;
      const w=this.w,h=this.h,target=w>900?4500:6200,step=Math.max(5.5,Math.sqrt(w*h*.6/(target*this.density)));
      const glyphs=[];let i=0;
      for(let y=h*.20;y<h*.80;y+=step)for(let x=w*.025;x<w*.975;x+=step){
        const a=hash(i*29+7),b=hash(i*47+13),c=hash(i*89+71);
        glyphs.push({x:x+(a-.5)*step*.95,y:y+(b-.5)*step*.95,seed:c,angle:(hash(i*17+9)-.5)*.5,index:Math.floor(hash(i*53+2)*6),sz:.78+hash(i*41+5)*.65});i++;
      }
      // More marks gather along the cut edge. The word remains an actual hole.
      const extra=Math.round(glyphs.length*.08);for(let j=0;j<extra*18&&glyphs.length<Math.round(i+extra);j++){
        const x=w*(.03+hash(j*41+233)*.94),y=h*(.26+hash(j*83+761)*.48),v=this.sample(this.halo,x,y);
        if(v<.045||v>.48||this.sample(this.mask,x,y)>.3)continue;
        glyphs.push({x,y,seed:hash(j*17+199),angle:(hash(j*67+91)-.5)*.5,index:Math.floor(hash(j*53+37)*6),sz:.80+hash(j*31+331)*.64});
      }
      this.glyphs=glyphs;
    }
    makeAtlas(){
      const symbols=['+','/','·','0','1','∗'];this.atlas=[];this.accentAtlas=[];
      for(const [i,s] of symbols.entries()){
        for(const [list,color] of [[this.atlas,this.getAttribute('color')||'#d5dfdd'],[this.accentAtlas,this.getAttribute('accent')||'#8bcfc7']]){
          const c=document.createElement('canvas');c.width=32;c.height=32;const g=c.getContext('2d');
          g.textAlign='center';g.textBaseline='middle';g.fillStyle=color;g.font=`${i===2?700:500} 25px VoidMono, monospace`;
          g.fillText(s,16,17);list.push(c);
        }
      }
    }
    sample(data,x,y){const ix=Math.round(x),iy=Math.round(y);return ix<0||iy<0||ix>=this.w||iy>=this.h?0:data[(iy*this.w+ix)*4+3]/255;}
    tick(now){this.t=(now-this.started)/1000;this.renderAt(this.t);this.raf=requestAnimationFrame(this._tick);}
    renderAt(t,scriptedPointer){
      if(!this.w||!this.mask)return;this.t=t;
      const ctx=this.layerCtx,w=this.w,h=this.h;
      ctx.clearRect(0,0,w,h);
      const accent=this.getAttribute('accent')||'#8bcfc7';
      const ptr=scriptedPointer||this.pointer,age=Math.max(0,t-ptr.at),power=ptr.power*Math.exp(-age/1.05),rx=w*.185;
      const fsize=Math.max(5,Math.min(14,w/80));
      for(let i=0;i<this.glyphs.length;i++){
        const q=this.glyphs[i],phase=q.seed*TAU;
        const waveX=Math.sin(q.y*.012+t*.74+phase)*8+Math.sin((q.x+q.y)*.006-t*.48)*7;
        const waveY=Math.cos(q.x*.01-t*.54+phase)*7+Math.sin((q.x-q.y)*.008+t*.37)*7;
        let x=q.x+waveX,y=q.y+waveY;
        const dx=x-ptr.x,dy=y-ptr.y,d=Math.hypot(dx,dy)||1,inf=power*Math.exp(-(d*d)/(rx*rx));
        if(inf>.001){const swirl=56*inf;x+=dx/d*38*inf-dy/d*swirl;y+=dy/d*38*inf+dx/d*swirl;}
        const inside=this.sample(this.mask,x,y);if(inside>.55)continue;
        const halo=this.sample(this.halo,x,y);
        const nx=(x-w*.5)/(w*.59),ny=(y-h*.5)/(h*.29),fall=clamp((1-Math.hypot(nx,ny))/.26);
        if(fall<=0||q.seed<.055)continue;
        const near=clamp(halo*2.15),alpha=(.30+q.seed*.53+near*.50)*fall*(1-inside);
        if(alpha<.018)continue;
        const gx=this.sample(this.halo,x+10,y)-this.sample(this.halo,x-10,y);
        const gy=this.sample(this.halo,x,y+10)-this.sample(this.halo,x,y-10);
        const tang=Math.atan2(gx,-gy);
        const angle=q.angle+Math.sin(t*.31+phase)*.11+tang*near*.73;
        const cs=Math.cos(angle)*this.pixelRatio,sn=Math.sin(angle)*this.pixelRatio;
        ctx.setTransform(cs,sn,-sn,cs,x*this.pixelRatio,y*this.pixelRatio);ctx.globalAlpha=alpha;
        const size=fsize*q.sz*(1+near*.07);const sprite=near>.25&&q.seed>.85?this.accentAtlas[q.index]:this.atlas[q.index];ctx.drawImage(sprite,-size*.7,-size*.7,size*1.4,size*1.4);
      }
      ctx.setTransform(this.pixelRatio,0,0,this.pixelRatio,0,0);ctx.globalAlpha=1;
      ctx.globalCompositeOperation='destination-out';ctx.drawImage(this.maskCanvas,0,0,w,h);ctx.globalCompositeOperation='source-over';
      this.ctx.fillStyle='#05090b';this.ctx.fillRect(0,0,w,h);this.ctx.drawImage(this.layer,0,0,w,h);
      // A single light event, attached to the interaction instead of a background halo.
      if(power>.015){const r=12+power*22;this.ctx.strokeStyle=accent;this.ctx.globalAlpha=clamp(power*.38);this.ctx.lineWidth=1;this.ctx.beginPath();this.ctx.arc(ptr.x,ptr.y,r,0,TAU);this.ctx.stroke();this.ctx.globalAlpha=1;}
      this.last=t;return {time:t,text:this.text,glyphs:this.glyphs.length,wordSize:this.wordSize};
    }
  }
  customElements.define('glyph-void',GlyphVoid);
})();
