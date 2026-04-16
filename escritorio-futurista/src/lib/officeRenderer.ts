// ══════════════════════════════════════════════════════════════════════════
//  OfficeRenderer — pixel-art neon office scene
//  Adapted from agent-world.html  (Canvas 2D, 3× upscale, no smoothing)
// ══════════════════════════════════════════════════════════════════════════

export interface RendererAgent {
  id: string;
  name: string;
  emoji: string;
  color: string;
  visorColor: string;
  x: number;
  y: number;
  state: string;
  walkFrame: number;
  deskIndex: number;
}

export type AgentClickCb = (id: string, x: number, y: number) => void;

const IW = 640;
const IH = 390;
const WH = 65; // wall height

// desk center x positions (6 desks)
const DESK_XS = [162, 244, 326, 408, 490, 574];
const DESK_Y = 155;

// waypoints
const WP_COFFEE = { x: 190, y: 290 };
const WP_SOFA   = { x: 58, y: 235 };
const WP_CHAT   = [{ x: 230, y: 280 }, { x: 270, y: 295 }, { x: 200, y: 310 }];

export class OfficeRenderer {
  private display: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private tick = 0;
  private rafId = 0;
  private agents: RendererAgent[] = [];
  private onAgentClick: AgentClickCb = () => {};
  private hoveredId: string | null = null;
  private _resizeBound: () => void;

  constructor(canvas: HTMLCanvasElement) {
    this.display = canvas;
    this.ctx = canvas.getContext('2d')!;
    this._resizeBound = this.resize.bind(this);
    this.resize();
    window.addEventListener('resize', this._resizeBound);
    canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
    canvas.addEventListener('click', this.onMouseClick.bind(this));
  }

  setAgents(a: RendererAgent[]) { this.agents = a; }
  setOnAgentClick(cb: AgentClickCb) { this.onAgentClick = cb; }

  private resize() {
    const canvas = this.display;
    const dpr = window.devicePixelRatio || 1;
    // Use getBoundingClientRect for reliable CSS dimensions
    const rect = canvas.getBoundingClientRect();
    const w = rect.width  || canvas.offsetWidth  || window.innerWidth  - 275;
    const h = rect.height || canvas.offsetHeight || window.innerHeight - 24;
    canvas.width  = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }

  private setTx() {
    const W = this.display.width;
    const H = this.display.height;
    const sc = Math.min(W / IW, H / IH);
    this.ctx.setTransform(sc, 0, 0, sc, (W - IW * sc) / 2, (H - IH * sc) / 2);
  }

  // ── colour helpers ───────────────────────────────────────────────────────
  private dk(hex: string, a: number) {
    const r = Math.max(0, parseInt(hex.slice(1,3),16) - a);
    const g = Math.max(0, parseInt(hex.slice(3,5),16) - a);
    const b = Math.max(0, parseInt(hex.slice(5,7),16) - a);
    return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
  }
  private lk(hex: string, a: number) { return this.dk(hex, -a); }

  // ── rounded rect ────────────────────────────────────────────────────────
  private rr(x:number,y:number,w:number,h:number,r:number){
    const ctx=this.ctx;
    ctx.moveTo(x+r,y);
    ctx.lineTo(x+w-r,y); ctx.arcTo(x+w,y,x+w,y+r,r);
    ctx.lineTo(x+w,y+h-r); ctx.arcTo(x+w,y+h,x+w-r,y+h,r);
    ctx.lineTo(x+r,y+h); ctx.arcTo(x,y+h,x,y+h-r,r);
    ctx.lineTo(x,y+r); ctx.arcTo(x,y,x+r,y,r);
    ctx.closePath();
  }

  // ══════════════════════════════════════════════════════════════════════
  //  CREWMATE
  // ══════════════════════════════════════════════════════════════════════
  private crewBody(R: number) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(0,-3.5*R,1.25*R,Math.PI,0);
    ctx.bezierCurveTo( 1.85*R,-2.0*R, 1.75*R,-0.8*R, 1.5*R,0);
    ctx.arcTo(1.5*R,0.5*R,0,0.5*R,0.5*R);
    ctx.arcTo(-1.5*R,0.5*R,-1.5*R,0,0.5*R);
    ctx.bezierCurveTo(-1.75*R,-0.8*R,-1.85*R,-2.0*R,-1.25*R,-3.5*R);
    ctx.closePath();
  }

  private drawCrewmate(
    cx: number, cy: number,
    bc: string, vc: string,
    wf: number, state: string,
    name: string, hovered: boolean
  ) {
    const ctx = this.ctx;
    const R = 9;
    const dark  = this.dk(bc, 58);
    const shade = this.dk(bc, 28);
    const walking = state.startsWith('walking');
    const sitting  = state === 'sitting' || state === 'on_sofa';

    const lOff = walking ? Math.sin(wf * Math.PI / 2) * R * 0.42 : 0;
    const bOff = walking ? Math.abs(Math.sin(wf * Math.PI / 2)) * R * 0.18 : 0;

    ctx.save();
    ctx.translate(cx, cy - bOff);

    // hovered glow ring
    if (hovered) {
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = bc;
      ctx.beginPath();
      ctx.ellipse(0, 0, R * 1.8, R * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(0, bOff+2, R*1.35, R*0.3, 0, 0, Math.PI*2);
    ctx.fill();

    const leg = (lx:number,ly:number,rw:number,rh:number,rot=0)=>{
      ctx.save(); ctx.translate(lx,ly); ctx.rotate(rot);
      ctx.fillStyle='#111'; ctx.beginPath();
      ctx.ellipse(0,0,rw*1.18,rh*1.18,0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle=dark; ctx.beginPath();
      ctx.ellipse(0,0,rw,rh,0,0,Math.PI*2); ctx.fill();
      ctx.restore();
    };

    if (sitting) {
      leg(-R*0.9,-R*0.1,R*0.72,R*0.38,0.25);
      leg( R*0.2,-R*0.1,R*0.72,R*0.38,-0.25);
    } else {
      leg(-R*0.45,-R*0.5+lOff,R*0.42,R*0.68);
      leg( R*0.45,-R*0.5-lOff,R*0.42,R*0.68);
    }

    // body outline
    ctx.save(); ctx.scale(1.08,1.06);
    this.crewBody(R); ctx.fillStyle='#111'; ctx.fill();
    ctx.restore();

    // body fill
    this.crewBody(R); ctx.fillStyle=bc; ctx.fill();

    // shade
    ctx.save();
    this.crewBody(R); ctx.clip();
    ctx.fillStyle=shade;
    ctx.beginPath();
    ctx.ellipse(-R*0.6,-R*1.8,R*0.9,R*2.2,-0.2,0,Math.PI*2);
    ctx.fill();
    ctx.restore();

    // backpack
    ctx.fillStyle='#111'; ctx.beginPath(); this.rr(-R*2.2,-R*3.0,R*1.05,R*1.75,R*0.22); ctx.fill();
    ctx.fillStyle=dark; ctx.beginPath(); this.rr(-R*2.05,-R*2.86,R*0.75,R*1.48,R*0.16); ctx.fill();
    ctx.fillStyle='rgba(255,255,255,0.12)'; ctx.beginPath(); this.rr(-R*1.98,-R*2.8,R*0.24,R*0.8,R*0.1); ctx.fill();

    // visor outline
    ctx.fillStyle='#111'; ctx.beginPath();
    ctx.ellipse(R*0.42,-R*3.65,R*1.0,R*0.68,0.22,0,Math.PI*2); ctx.fill();
    // visor fill
    ctx.fillStyle=vc; ctx.beginPath();
    ctx.ellipse(R*0.42,-R*3.65,R*0.84,R*0.54,0.22,0,Math.PI*2); ctx.fill();
    // visor inner glow
    ctx.fillStyle=this.lk(vc,35); ctx.beginPath();
    ctx.ellipse(R*0.3,-R*3.75,R*0.6,R*0.38,0.22,0,Math.PI*2); ctx.fill();
    // visor shine
    ctx.fillStyle='rgba(255,255,255,0.55)'; ctx.beginPath();
    ctx.ellipse(R*0.05,-R*3.92,R*0.3,R*0.19,0.22,0,Math.PI*2); ctx.fill();
    // body highlight
    ctx.fillStyle='rgba(255,255,255,0.18)'; ctx.beginPath();
    ctx.ellipse(R*0.45,-R*4.45,R*0.55,R*0.32,-0.4,0,Math.PI*2); ctx.fill();

    ctx.restore();

    // name tag
    ctx.save();
    ctx.font = 'bold 7px "Share Tech Mono"';
    ctx.textAlign = 'center';
    const tw = ctx.measureText(name).width + 6;
    const ny = cy - bOff - R * 5.4;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.beginPath();
    this.rr(cx - tw/2, ny - 6, tw, 9, 1.5);
    ctx.fill();
    ctx.fillStyle = hovered ? '#ffffff' : '#00f5ff';
    ctx.fillText(name, cx, ny);
    ctx.restore();
  }

  // ══════════════════════════════════════════════════════════════════════
  //  ROOM
  // ══════════════════════════════════════════════════════════════════════
  private drawRoom() {
    const ctx = this.ctx;
    const { tick } = this;
    const W = IW, H = IH;

    // dark tech floor
    ctx.fillStyle='#080B16'; ctx.fillRect(0,WH,W,H-WH);
    for (let fy=WH; fy<H; fy+=18) {
      ctx.fillStyle = Math.floor((fy-WH)/18)%2===0 ? '#090D1C' : '#0B1022';
      ctx.fillRect(0,fy,W,18);
      ctx.fillStyle='rgba(0,0,0,0.3)'; ctx.fillRect(0,fy,W,1);
    }
    let stagger=false;
    for (let fy=WH; fy<H; fy+=18) {
      const off = stagger?0:36;
      for (let fx=off; fx<W; fx+=72) {
        ctx.fillStyle='rgba(0,0,0,0.35)'; ctx.fillRect(fx,fy,1,18);
      }
      stagger=!stagger;
    }
    // neon grid
    ctx.strokeStyle='rgba(0,245,255,0.4)'; ctx.lineWidth=0.8;
    for (let x=0; x<W; x+=22) { ctx.beginPath(); ctx.moveTo(x,WH); ctx.lineTo(x,H); ctx.stroke(); }
    for (let y=WH; y<H; y+=22) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
    ctx.strokeStyle='rgba(160,0,255,0.14)'; ctx.lineWidth=0.5;
    for (let x=11; x<W; x+=22) { ctx.beginPath(); ctx.moveTo(x,WH); ctx.lineTo(x,H); ctx.stroke(); }
    for (let y=WH+11; y<H; y+=22) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
    // grid dots
    ctx.fillStyle='rgba(0,245,255,0.6)';
    for (let gx=0; gx<W; gx+=22)
      for (let gy=WH; gy<H; gy+=22) {
        ctx.beginPath(); ctx.arc(gx,gy,1.5,0,Math.PI*2); ctx.fill();
      }
    // scanline
    const scanY = WH + ((tick*1.4)%(H-WH));
    const sg2 = ctx.createLinearGradient(0,scanY-4,0,scanY+4);
    sg2.addColorStop(0,'rgba(0,245,255,0)');
    sg2.addColorStop(0.5,'rgba(0,245,255,0.09)');
    sg2.addColorStop(1,'rgba(0,245,255,0)');
    ctx.fillStyle=sg2; ctx.fillRect(0,scanY-4,W,8);

    // dark wall
    const wg = ctx.createLinearGradient(0,0,0,WH+14);
    wg.addColorStop(0,'#030710'); wg.addColorStop(0.7,'#060C1C'); wg.addColorStop(1,'#0A1628');
    ctx.fillStyle=wg; ctx.fillRect(0,0,W,WH+14);
    ctx.fillStyle='rgba(255,255,255,0.016)';
    for (let wy=6; wy<WH; wy+=8) ctx.fillRect(0,wy,W,1);
    ctx.fillStyle='rgba(0,245,255,0.5)'; ctx.fillRect(0,0,W,1.5);
    ctx.fillStyle='rgba(0,245,255,0.1)'; ctx.fillRect(0,1.5,W,6);
    ctx.fillStyle='rgba(0,245,255,0.75)'; ctx.fillRect(0,WH+9,W,2);
    ctx.fillStyle='rgba(0,245,255,0.18)'; ctx.fillRect(0,WH+11,W,7);
    ctx.fillStyle='rgba(0,245,255,0.05)'; ctx.fillRect(0,WH+18,W,10);

    // windows
    [32,142,256,370,486].forEach((wx,wi) => {
      ctx.fillStyle='rgba(0,160,255,0.05)';
      ctx.beginPath(); ctx.ellipse(wx+17,26,24,28,0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#050C18'; ctx.fillRect(wx-2,2,38,48);
      const grd=ctx.createLinearGradient(0,3,0,46);
      grd.addColorStop(0,'#06101E'); grd.addColorStop(0.25,'#0A1C38');
      grd.addColorStop(0.65,'#0D2850'); grd.addColorStop(1,'#183870');
      ctx.fillStyle=grd; ctx.fillRect(wx,3,34,44);
      if (wi===2) {
        ctx.fillStyle='rgba(220,230,255,0.85)';
        ctx.beginPath(); ctx.arc(wx+24,10,3.5,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='#06101E';
        ctx.beginPath(); ctx.arc(wx+25.5,9,3,0,Math.PI*2); ctx.fill();
      }
      ctx.fillStyle='rgba(220,235,255,0.75)';
      [[wx+5,7],[wx+12,5],[wx+22,8],[wx+8,14],[wx+27,6],[wx+15,11],[wx+29,13]].forEach(([sx,sy],si) => {
        const twinkle=(tick*0.7+si*37+wi*17)%120;
        if(twinkle<85){ctx.globalAlpha=0.4+twinkle*0.006;ctx.beginPath();ctx.arc(sx,sy,0.7,0,Math.PI*2);ctx.fill();}
      });
      ctx.globalAlpha=1;
      // city
      ctx.fillStyle='rgba(5,10,22,0.88)';
      [[0,10],[4,7],[8,13],[13,8],[17,11],[21,6],[25,10],[28,7],[31,14]].forEach(([bx,bh]) =>
        ctx.fillRect(wx+bx,47-bh,3,bh)
      );
      [[wx+1,40],[wx+5,37],[wx+9,38],[wx+14,42],[wx+18,39],[wx+22,41],[wx+26,40],[wx+29,37]].forEach(([lx,ly],li) => {
        const on=(tick*0.4+li*23+wi*11)%100<70;
        ctx.fillStyle=on?'rgba(255,220,100,0.6)':'rgba(255,220,100,0.1)';
        ctx.fillRect(lx,ly,1.5,1.5);
      });
      ctx.fillStyle='#06101C';
      ctx.fillRect(wx,24,34,2); ctx.fillRect(wx+16,3,2,44);
      ctx.fillRect(wx,3,34,1.5); ctx.fillRect(wx,46,34,1.5);
      ctx.fillRect(wx,3,1.5,44); ctx.fillRect(wx+32.5,3,1.5,44);
      ctx.fillStyle='rgba(120,200,255,0.1)'; ctx.fillRect(wx+2,4,13,8);
      ctx.fillStyle='rgba(120,200,255,0.05)'; ctx.fillRect(wx+18,4,13,8);
      ctx.strokeStyle='rgba(0,200,255,0.4)'; ctx.lineWidth=0.8; ctx.strokeRect(wx,3,34,44);
      ctx.strokeStyle='rgba(0,245,255,0.14)'; ctx.lineWidth=0.5; ctx.strokeRect(wx+1,4,32,42);
      const wsg=ctx.createLinearGradient(0,47,0,50);
      wsg.addColorStop(0,'#2A1C0E'); wsg.addColorStop(1,'#1A1008');
      ctx.fillStyle=wsg; ctx.beginPath(); this.rr(wx-3,47,40,4,0.5); ctx.fill();
      ctx.fillStyle='rgba(255,200,120,0.08)'; ctx.fillRect(wx-2,47,38,1.5);
    });

    // wall screen art
    ctx.fillStyle='#060C1A'; ctx.fillRect(556,5,44,34);
    ctx.fillStyle='rgba(0,245,255,0.08)'; ctx.fillRect(557,6,42,32);
    ctx.fillStyle='rgba(0,255,136,0.65)';
    [5,9,6,12,8,10,7,11].forEach((h,i)=>ctx.fillRect(559+i*5,37-h,4,h));
    ctx.strokeStyle='rgba(0,245,255,0.32)'; ctx.lineWidth=0.7; ctx.strokeRect(556,5,44,34);

    // neon pillars
    [90,200,315,445,558].forEach((px,pi) => {
      const fl=0.55+Math.sin(tick*0.06+pi*1.35)*0.25;
      ctx.globalAlpha=fl;
      ctx.fillStyle='#BB00FF'; ctx.fillRect(px-1,0,2,WH+12);
      const pilg=ctx.createLinearGradient(px-14,0,px+14,0);
      pilg.addColorStop(0,'rgba(160,0,255,0)');
      pilg.addColorStop(0.5,'rgba(160,0,255,0.24)');
      pilg.addColorStop(1,'rgba(160,0,255,0)');
      ctx.fillStyle=pilg; ctx.fillRect(px-14,0,28,WH+12);
      ctx.globalAlpha=1;
      ctx.fillStyle=`rgba(140,0,255,${(fl*0.08).toFixed(2)})`;
      ctx.beginPath(); ctx.ellipse(px,WH+18,14,5,0,0,Math.PI*2); ctx.fill();
    });
  }

  // ── Furniture helpers ───────────────────────────────────────────────────
  private drawSofa(x:number,y:number) {
    const ctx=this.ctx;
    ctx.fillStyle='#10181E'; ctx.fillRect(x+3,y+27,5,6); ctx.fillRect(x+44,y+27,5,6);
    const bg=ctx.createLinearGradient(0,y,0,y+13);
    bg.addColorStop(0,'#2A3C58'); bg.addColorStop(1,'#1C2C44');
    ctx.fillStyle=bg; ctx.fillRect(x,y,52,13);
    ctx.fillStyle='rgba(255,255,255,0.07)'; ctx.fillRect(x,y,52,2);
    ctx.fillStyle='#1E2C48'; ctx.fillRect(x,y+13,52,13);
    ctx.fillStyle='rgba(0,245,255,0.1)'; ctx.fillRect(x+26,y+14,1,11);
    const arm=ctx.createLinearGradient(0,y,0,y+26);
    arm.addColorStop(0,'#253244'); arm.addColorStop(1,'#151E2E');
    ctx.fillStyle=arm; ctx.fillRect(x-5,y,6,24); ctx.fillRect(x+51,y,6,24);
    ctx.fillStyle='#3A1E60'; ctx.beginPath(); this.rr(x+3,y+2,12,9,2); ctx.fill();
    ctx.fillStyle='rgba(220,180,255,0.28)'; ctx.fillRect(x+4,y+3,10,2);
    ctx.fillStyle='#1E3A28'; ctx.beginPath(); this.rr(x+37,y+2,12,9,2); ctx.fill();
    ctx.fillStyle='rgba(150,255,180,0.22)'; ctx.fillRect(x+38,y+3,10,2);
    ctx.fillStyle='rgba(0,245,255,0.14)'; ctx.fillRect(x,y,52,1);
  }

  private drawArmchair(x:number,y:number) {
    const ctx=this.ctx;
    // golden armchair
    const gold='#C8860A';
    const goldDk=this.dk(gold,40);
    // legs
    ctx.fillStyle=goldDk;
    ctx.fillRect(x+4,y+30,4,8); ctx.fillRect(x+32,y+30,4,8);
    // back
    const bg=ctx.createLinearGradient(0,y,0,y+28);
    bg.addColorStop(0,this.lk(gold,20)); bg.addColorStop(1,gold);
    ctx.fillStyle=bg; ctx.beginPath(); this.rr(x,y,40,28,4); ctx.fill();
    ctx.fillStyle='rgba(255,255,255,0.12)'; ctx.fillRect(x+2,y+2,36,4);
    // seat
    ctx.fillStyle=gold; ctx.beginPath(); this.rr(x-2,y+22,44,12,3); ctx.fill();
    ctx.fillStyle='rgba(255,220,100,0.22)'; ctx.fillRect(x,y+22,40,3);
    // armrests
    ctx.fillStyle=this.lk(gold,10);
    ctx.beginPath(); this.rr(x-4,y+8,8,18,2); ctx.fill();
    ctx.beginPath(); this.rr(x+36,y+8,8,18,2); ctx.fill();
    // cushion button
    ctx.fillStyle='#8B5E0A'; ctx.beginPath(); ctx.arc(x+20,y+14,2,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='rgba(200,140,40,0.5)'; ctx.lineWidth=0.5; ctx.strokeRect(x,y,40,28);
  }

  private drawDesk(x:number,y:number,idx:number,scr:string) {
    const ctx=this.ctx;
    const tick=this.tick;
    // chair
    ctx.fillStyle='#1C2A38'; ctx.fillRect(x-9,y-11,18,9);
    ctx.fillStyle='#232F40'; ctx.fillRect(x-8,y-10,16,7);
    ctx.fillStyle='#1A2636'; ctx.fillRect(x-9,y-2,18,6);
    // desk surface
    const dg=ctx.createLinearGradient(0,y+5,0,y+17);
    dg.addColorStop(0,'#7A5A30'); dg.addColorStop(1,'#4A3020');
    ctx.fillStyle=dg; ctx.fillRect(x-16,y+5,32,12);
    ctx.fillStyle='rgba(255,255,255,0.1)'; ctx.fillRect(x-16,y+5,32,2);
    ctx.fillStyle='#3A2818'; ctx.fillRect(x-16,y+17,32,5);
    ctx.fillStyle='rgba(0,0,0,0.3)'; ctx.fillRect(x-16,y+22,32,1);
    // monitor stand
    ctx.fillStyle='#070D1A'; ctx.beginPath(); this.rr(x-5,y+3,10,3,1); ctx.fill();
    ctx.fillStyle='#090F1C'; ctx.fillRect(x-1.5,y-3,3,7);
    // monitor body
    ctx.fillStyle='#050B15'; ctx.beginPath(); this.rr(x-12,y-22,24,22,1.5); ctx.fill();
    ctx.strokeStyle=scr+'88'; ctx.lineWidth=0.7; ctx.beginPath(); this.rr(x-12,y-22,24,22,1.5); ctx.stroke();
    // screen
    ctx.fillStyle=scr; ctx.beginPath(); this.rr(x-10,y-20,20,18,1); ctx.fill();
    // screen content
    this.drawScreenContent(x-10,y-20,20,18,idx,tick);
    // monitor top bar
    ctx.fillStyle='rgba(0,245,255,0.08)'; ctx.fillRect(x-10,y-20,20,2);
    // keyboard
    ctx.fillStyle='#101820'; ctx.beginPath(); this.rr(x-8,y+7,16,4,0.7); ctx.fill();
    ctx.fillStyle='rgba(0,245,255,0.1)'; ctx.fillRect(x-7,y+8,14,1);
  }

  private drawScreenContent(sx:number,sy:number,sw:number,sh:number,idx:number,tick:number) {
    const ctx=this.ctx;
    ctx.save();
    ctx.beginPath(); ctx.rect(sx,sy,sw,sh); ctx.clip();
    ctx.font='3px monospace'; ctx.textAlign='left';
    switch(idx){
      case 0:{
        ctx.fillStyle='rgba(200,220,255,0.08)'; ctx.fillRect(sx,sy,sw,sh);
        const lens=[14,10,16,8,12];
        const cols=['rgba(0,245,255,0.7)','rgba(255,160,50,0.7)','rgba(150,255,150,0.7)','rgba(255,100,150,0.7)','rgba(200,200,255,0.6)'];
        lens.forEach((lw,l)=>{ ctx.fillStyle=cols[l]; ctx.fillRect(sx+7,sy+2+l*4,lw,1.5); });
        if(tick%60<30){ctx.fillStyle='rgba(255,255,255,0.9)';ctx.fillRect(sx+7,sy+2,1,6);}
        break;
      }
      case 1:{
        ctx.fillStyle='rgba(255,107,0,0.12)'; ctx.fillRect(sx,sy,sw,sh);
        const bh=[3,6,4,9,5,7,10,6,8,7,11,5];
        bh.forEach((h,i)=>{
          const hh=h+Math.sin(tick*0.08+i)*0.8;
          const g=ctx.createLinearGradient(0,sy+sh-hh,0,sy+sh);
          g.addColorStop(0,'rgba(255,107,0,0.9)'); g.addColorStop(1,'rgba(180,50,0,0.7)');
          ctx.fillStyle=g; ctx.fillRect(sx+1+i*2,sy+sh-hh,1.5,hh);
        });
        break;
      }
      case 2:{
        ctx.fillStyle='rgba(0,255,136,0.07)'; ctx.fillRect(sx,sy,sw,sh);
        ctx.strokeStyle='rgba(0,255,136,0.8)'; ctx.lineWidth=1;
        ctx.beginPath();
        const pts=[sy+sh-3,sy+sh-5,sy+sh-4,sy+sh-7,sy+sh-6,sy+sh-8,sy+sh-7,sy+sh-10,sy+sh-9,sy+sh-11];
        pts.forEach((py2,i)=>{
          const px2=sx+1+i*(sw-2)/9;
          i===0?ctx.moveTo(px2,py2):ctx.lineTo(px2,py2);
        });
        ctx.stroke();
        break;
      }
      case 3:{
        ctx.fillStyle='rgba(200,100,255,0.06)'; ctx.fillRect(sx,sy,sw,sh);
        ['#FF3366','#FF6B00','#FFD700','#00FF88','#00F5FF','#9B59B6'].forEach((c,i)=>{
          ctx.fillStyle=c; ctx.fillRect(sx+1+i*3,sy+1,2.5,4);
        });
        ctx.strokeStyle='rgba(255,255,255,0.1)'; ctx.lineWidth=0.3;
        for(let g=0;g<4;g++) ctx.strokeRect(sx+1+g*5,sy+7,4,4);
        ctx.fillStyle='rgba(255,107,200,0.5)'; ctx.fillRect(sx+6,sy+8,8,3);
        break;
      }
      case 4:{
        ctx.fillStyle='rgba(0,100,120,0.1)'; ctx.fillRect(sx,sy,sw,sh);
        const kws=[['#nutri',9],['saude',7],['supl.',11],['vita',6]] as [string,number][];
        kws.forEach(([kw,bw],i)=>{
          ctx.fillStyle='rgba(0,150,180,0.35)'; ctx.fillRect(sx+1,sy+1+i*4,bw,3);
          ctx.fillStyle='rgba(0,245,255,0.75)'; ctx.fillText(kw,sx+2,sy+3.5+i*4);
        });
        break;
      }
      default:{
        ctx.fillStyle='rgba(255,140,0,0.07)'; ctx.fillRect(sx,sy,sw,sh);
        const steps=[[sw-2,4,'rgba(255,60,60,0.7)'],[sw-6,3,'rgba(255,150,50,0.7)'],[sw-10,3,'rgba(255,220,50,0.7)'],[sw-14,3,'rgba(50,255,100,0.7)']];
        steps.forEach(([fw,fh,fc],i)=>{
          if(typeof fw==='number'&&typeof fh==='number'&&typeof fc==='string')
            ctx.fillStyle=fc,ctx.fillRect(sx+sw/2-fw/2,sy+1+i*4,fw,fh);
        });
        break;
      }
    }
    ctx.restore();
  }

  private drawServerRack(x:number,y:number) {
    const ctx=this.ctx;
    const tick=this.tick;

    // cabinet shadow
    ctx.fillStyle='rgba(0,0,0,0.35)';
    ctx.beginPath(); this.rr(x+3,y+4,34,100,2); ctx.fill();

    // cabinet body
    const cg=ctx.createLinearGradient(x,0,x+34,0);
    cg.addColorStop(0,'#0A1220'); cg.addColorStop(0.15,'#141E2E'); cg.addColorStop(0.85,'#101828'); cg.addColorStop(1,'#080E1A');
    ctx.fillStyle=cg; ctx.beginPath(); this.rr(x,y,34,100,2); ctx.fill();
    // outer frame highlight
    ctx.strokeStyle='rgba(0,245,255,0.3)'; ctx.lineWidth=0.8;
    ctx.beginPath(); this.rr(x,y,34,100,2); ctx.stroke();
    // inner bevel
    ctx.strokeStyle='rgba(0,150,200,0.12)'; ctx.lineWidth=0.4;
    ctx.beginPath(); this.rr(x+1,y+1,32,98,1.5); ctx.stroke();

    // top panel
    ctx.fillStyle='rgba(255,255,255,0.06)'; ctx.fillRect(x+1,y+1,32,3);
    ctx.fillStyle='rgba(0,245,255,0.08)'; ctx.fillRect(x+2,y+2,28,1);

    // 10 rack units
    for(let u=0;u<10;u++){
      const uy=y+5+u*9;
      const uPhase=tick*0.5+u*17;

      // unit background
      const ug=ctx.createLinearGradient(x+2,0,x+32,0);
      ug.addColorStop(0,'#060A14'); ug.addColorStop(0.5,'#0C1422'); ug.addColorStop(1,'#060A14');
      ctx.fillStyle=ug; ctx.fillRect(x+2,uy,30,8);
      // unit border
      ctx.strokeStyle='rgba(0,180,255,0.12)'; ctx.lineWidth=0.3; ctx.strokeRect(x+2,uy,30,8);
      // unit top shine
      ctx.fillStyle='rgba(255,255,255,0.03)'; ctx.fillRect(x+2,uy,30,1.5);

      // left status LED (green = power)
      const pwrOn=uPhase%80<72;
      ctx.fillStyle=pwrOn?'#00FF88':'#003820';
      ctx.beginPath(); ctx.arc(x+5.5,uy+4,1.8,0,Math.PI*2); ctx.fill();
      if(pwrOn){
        ctx.fillStyle='rgba(0,255,136,0.2)';
        ctx.beginPath(); ctx.arc(x+5.5,uy+4,4,0,Math.PI*2); ctx.fill();
      }

      // disk activity LED (amber/orange)
      const diskAct=(tick*1.2+u*11)%25<6;
      ctx.fillStyle=diskAct?'#FFA020':'#3A2000';
      ctx.beginPath(); ctx.arc(x+11,uy+4,1.2,0,Math.PI*2); ctx.fill();
      if(diskAct){
        ctx.fillStyle='rgba(255,160,0,0.15)';
        ctx.beginPath(); ctx.arc(x+11,uy+4,3,0,Math.PI*2); ctx.fill();
      }

      // network LED (blue blink)
      const netAct=(tick*0.9+u*7+13)%40<5;
      ctx.fillStyle=netAct?'#00AAFF':'#001828';
      ctx.beginPath(); ctx.arc(x+16,uy+4,1.2,0,Math.PI*2); ctx.fill();

      // unit label bar (simulated)
      ctx.fillStyle='rgba(0,150,200,0.07)'; ctx.fillRect(x+20,uy+2,10,4);
      ctx.strokeStyle='rgba(0,200,255,0.08)'; ctx.lineWidth=0.3; ctx.strokeRect(x+20,uy+2,10,4);

      // tiny ventilation bars
      ctx.fillStyle='rgba(0,0,0,0.4)';
      for(let v=0;v<3;v++) ctx.fillRect(x+20,uy+1.5+v*2,10,0.6);

      // fan grill (right side)
      ctx.strokeStyle='rgba(30,60,100,0.35)'; ctx.lineWidth=0.4;
      for(let r=0;r<3;r++){
        ctx.beginPath(); ctx.arc(x+29,uy+4,1+r,0,Math.PI*2); ctx.stroke();
      }
    }

    // bottom cable management
    ctx.fillStyle='#060A14'; ctx.fillRect(x+2,y+95,30,3);
    ctx.strokeStyle='rgba(0,245,255,0.1)'; ctx.lineWidth=0.3; ctx.strokeRect(x+2,y+95,30,3);
    // cables
    const cableColors=['#0040A0','#006600','#880000','#505050'];
    cableColors.forEach((cc,i)=>{
      ctx.strokeStyle=cc; ctx.lineWidth=1.2;
      ctx.beginPath(); ctx.moveTo(x+6+i*5,y+98); ctx.bezierCurveTo(x+6+i*5,y+104,x+4+i*5,y+108,x+3+i*5,y+108); ctx.stroke();
    });

    // top vent slots
    ctx.fillStyle='rgba(0,0,0,0.6)';
    for(let vs=0;vs<6;vs++) ctx.fillRect(x+4+vs*4,y+1,2.5,2);

    // ambient glow at base
    const glowA=0.04+Math.sin(tick*0.04)*0.02;
    ctx.fillStyle=`rgba(0,245,255,${glowA.toFixed(3)})`;
    ctx.beginPath(); ctx.ellipse(x+17,y+102,18,4,0,0,Math.PI*2); ctx.fill();
  }

  private drawMoviePoster(x:number,y:number) {
    const ctx=this.ctx;
    // AVATAR poster
    ctx.fillStyle='#050C18'; ctx.beginPath(); this.rr(x,y,36,55,1); ctx.fill();
    const pg=ctx.createLinearGradient(x,y,x,y+55);
    pg.addColorStop(0,'#0A1A2E'); pg.addColorStop(0.4,'#0D2040'); pg.addColorStop(1,'#061018');
    ctx.fillStyle=pg; ctx.beginPath(); this.rr(x+1,y+1,34,53,0.8); ctx.fill();
    // avatar silhouette
    ctx.fillStyle='rgba(0,120,180,0.6)';
    ctx.beginPath(); ctx.ellipse(x+18,y+20,7,9,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='rgba(0,160,220,0.5)';
    ctx.beginPath(); ctx.moveTo(x+10,y+36); ctx.bezierCurveTo(x+10,y+26,x+26,y+26,x+26,y+36); ctx.lineTo(x+26,y+52); ctx.lineTo(x+10,y+52); ctx.closePath(); ctx.fill();
    // glow
    ctx.fillStyle='rgba(0,200,255,0.08)'; ctx.beginPath(); ctx.ellipse(x+18,y+28,14,20,0,0,Math.PI*2); ctx.fill();
    // title text
    ctx.fillStyle='rgba(0,220,255,0.9)'; ctx.font='bold 5px "Share Tech Mono"'; ctx.textAlign='center';
    ctx.fillText('AVATAR',x+18,y+48);
    ctx.strokeStyle='rgba(0,200,255,0.4)'; ctx.lineWidth=0.7; ctx.strokeRect(x,y,36,55);
  }

  private drawFriendsTV(x:number,y:number) {
    const ctx=this.ctx;
    const tick=this.tick;
    // TV stand
    ctx.fillStyle='#0A0F1A'; ctx.beginPath(); this.rr(x+18,y+34,18,4,1); ctx.fill();
    ctx.fillStyle='#0C1220'; ctx.beginPath(); this.rr(x+24,y+38,6,4,1); ctx.fill();
    // TV body
    const tvg=ctx.createLinearGradient(x,y,x,y+36);
    tvg.addColorStop(0,'#12182A'); tvg.addColorStop(1,'#0A0F1E');
    ctx.fillStyle=tvg; ctx.beginPath(); this.rr(x,y,54,36,2); ctx.fill();
    ctx.strokeStyle='rgba(0,245,255,0.2)'; ctx.lineWidth=0.7; ctx.beginPath(); this.rr(x,y,54,36,2); ctx.stroke();
    // screen
    ctx.fillStyle='#000408'; ctx.beginPath(); this.rr(x+3,y+3,48,28,1); ctx.fill();
    // FRIENDS logo
    const sf=0.8+Math.sin(tick*0.05)*0.08;
    ctx.globalAlpha=sf;
    ctx.fillStyle='rgba(255,180,0,0.9)'; ctx.font='bold 8px "Orbitron"'; ctx.textAlign='center';
    ctx.fillText('FRIENDS',x+27,y+19);
    ctx.fillStyle='rgba(255,200,100,0.4)'; ctx.beginPath(); ctx.ellipse(x+27,y+17,22,10,0,0,Math.PI*2); ctx.fill();
    ctx.globalAlpha=1;
    // TV bottom
    ctx.fillStyle='rgba(0,245,255,0.06)'; ctx.fillRect(x+3,y+31,48,1);
    // logo on frame
    ctx.fillStyle='rgba(0,245,255,0.35)'; ctx.font='4px monospace'; ctx.textAlign='left';
    ctx.fillText('◉ HDMI',x+4,y+33.5);
  }

  private drawBigPlant(x:number,y:number) {
    const ctx=this.ctx;
    const tick=this.tick;
    const sw=Math.sin(tick*0.018)*2.2;

    // pot shadow
    ctx.fillStyle='rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.ellipse(x,y+1,17,4,0,0,Math.PI*2); ctx.fill();

    // pot body
    const potG=ctx.createLinearGradient(x-14,0,x+14,0);
    potG.addColorStop(0,'#4A1E06'); potG.addColorStop(0.35,'#8A4820'); potG.addColorStop(0.65,'#7A3810'); potG.addColorStop(1,'#4A1E06');
    ctx.fillStyle=potG;
    ctx.beginPath(); ctx.moveTo(x-11,y-26); ctx.lineTo(x-14,y-1); ctx.lineTo(x+14,y-1); ctx.lineTo(x+11,y-26); ctx.closePath(); ctx.fill();
    // pot highlight
    ctx.fillStyle='rgba(255,180,80,0.1)'; ctx.fillRect(x-9,y-25,5,22);
    // pot rim
    const rimG=ctx.createLinearGradient(0,y-29,0,y-23);
    rimG.addColorStop(0,'#AA6030'); rimG.addColorStop(1,'#6A3010');
    ctx.fillStyle=rimG; ctx.beginPath(); this.rr(x-15,y-29,30,7,2); ctx.fill();
    ctx.fillStyle='rgba(255,200,100,0.18)'; ctx.fillRect(x-13,y-29,26,2);
    // soil
    ctx.fillStyle='#1A100A'; ctx.beginPath(); this.rr(x-13,y-24,26,4,1); ctx.fill();
    ctx.fillStyle='rgba(80,45,15,0.4)';
    for(let s=0;s<5;s++) ctx.fillRect(x-11+s*5,y-24,3,2);

    // trunk (multi-stroke for bark texture)
    [['#3A2008',7],['#5A3814',5],['#6A4820',3],['#7A5828',1.5]].forEach(([c,w])=>{
      ctx.strokeStyle=c as string; ctx.lineWidth=w as number;
      ctx.beginPath(); ctx.moveTo(x+sw*0.1,y-22); ctx.bezierCurveTo(x-3+sw*0.05,y-50,x+4+sw*0.08,y-72,x+sw*0.12,y-92); ctx.stroke();
    });
    // bark detail lines
    ctx.strokeStyle='rgba(30,15,5,0.3)'; ctx.lineWidth=0.6;
    for(let i=0;i<5;i++){
      const ty=y-28-i*12;
      ctx.beginPath(); ctx.moveTo(x-2,ty); ctx.quadraticCurveTo(x+1,ty+3,x+2,ty); ctx.stroke();
    }

    // leaves (back layer first)
    const leafDefs:[number,number,string,number,number][]=[
      [-2.6,36,'#0E4A04',-1,0],[-2.0,32,'#165A0C',1,1],[-1.4,40,'#0C6006',-1,2],
      [-0.7,35,'#127008',1,3],[0.0,38,'#0A5802',-1,4],[0.8,33,'#188014',1,5],
      [1.4,39,'#0E6A08',-1,6],[2.0,34,'#1A7010',1,7],[2.6,37,'#126206',-1,8],
    ];
    // back leaves (darker)
    leafDefs.slice(0,4).forEach(([a,l,c,side,i])=>{
      ctx.save();
      ctx.translate(x+sw*0.18*side,y-12+sw*0.1*(i%2?1:-1));
      ctx.rotate(a+sw*0.03*(i%2?1:-1));
      ctx.globalAlpha=0.7;
      const lg=ctx.createLinearGradient(0,0,l,0);
      lg.addColorStop(0,c); lg.addColorStop(0.6,this.lk(c,10)); lg.addColorStop(1,this.dk(c,15));
      ctx.fillStyle=lg; ctx.beginPath(); ctx.moveTo(0,0);
      ctx.bezierCurveTo(l*0.2,-10,l*0.7,-14,l,-5);
      ctx.bezierCurveTo(l*0.7,6,l*0.25,5,0,1);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha=1; ctx.restore();
    });
    // front leaves
    leafDefs.slice(4).forEach(([a,l,c,side,i])=>{
      ctx.save();
      ctx.translate(x+sw*0.22*side,y-10+sw*0.14*(i%2?1:-1));
      ctx.rotate(a+sw*0.04*(i%2?1:-1));
      const lg=ctx.createLinearGradient(0,0,l,0);
      lg.addColorStop(0,c); lg.addColorStop(0.5,this.lk(c,18)); lg.addColorStop(1,this.dk(c,8));
      ctx.fillStyle=lg; ctx.beginPath(); ctx.moveTo(0,0);
      ctx.bezierCurveTo(l*0.25,-10,l*0.72,-13,l,-5);
      ctx.bezierCurveTo(l*0.72,5,l*0.25,5,0,1);
      ctx.closePath(); ctx.fill();
      // midrib
      ctx.strokeStyle='rgba(0,80,0,0.35)'; ctx.lineWidth=0.7;
      ctx.beginPath(); ctx.moveTo(1,0); ctx.quadraticCurveTo(l*0.55,-3,l-3,-2); ctx.stroke();
      // side veins
      ctx.strokeStyle='rgba(0,90,0,0.18)'; ctx.lineWidth=0.4;
      [0.25,0.5,0.72].forEach(t=>{
        ctx.beginPath(); ctx.moveTo(l*t,-2); ctx.lineTo(l*t-3,-7); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(l*t,-2); ctx.lineTo(l*t+2,4); ctx.stroke();
      });
      ctx.restore();
    });
    // top new unfurling leaf
    ctx.save();
    ctx.translate(x+sw*0.08,y-14+sw*0.06);
    ctx.rotate(-0.15+sw*0.04);
    ctx.fillStyle='#2EBB24';
    ctx.beginPath(); ctx.moveTo(0,0); ctx.bezierCurveTo(-2,-4,1,-9,0,-11); ctx.bezierCurveTo(1,-9,3,-4,0,0); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  private drawSmallPlant(x:number,y:number,id:number) {
    const ctx=this.ctx;
    const sw=Math.sin(this.tick*0.025+id*1.9)*2;

    // shadow
    ctx.fillStyle='rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(x,y+20,9,2.5,0,0,Math.PI*2); ctx.fill();

    // pot body (tapered)
    const pg=ctx.createLinearGradient(x-8,0,x+8,0);
    pg.addColorStop(0,'#4A1E06'); pg.addColorStop(0.4,'#8A4418'); pg.addColorStop(0.7,'#7A3A10'); pg.addColorStop(1,'#4A1E06');
    ctx.fillStyle=pg;
    ctx.beginPath(); ctx.moveTo(x-6,y+8); ctx.lineTo(x-5,y+20); ctx.lineTo(x+5,y+20); ctx.lineTo(x+6,y+8); ctx.closePath(); ctx.fill();
    // pot highlight
    ctx.fillStyle='rgba(255,180,80,0.1)'; ctx.fillRect(x-5,y+9,2.5,9);
    // pot rim
    const rg=ctx.createLinearGradient(0,y+6,0,y+11);
    rg.addColorStop(0,'#AA5A20'); rg.addColorStop(1,'#7A3A10');
    ctx.fillStyle=rg; ctx.beginPath(); this.rr(x-8,y+6,16,5,1.5); ctx.fill();
    ctx.fillStyle='rgba(255,200,100,0.15)'; ctx.fillRect(x-7,y+6,14,2);
    // soil
    ctx.fillStyle='#120C06'; ctx.beginPath(); this.rr(x-7,y+9,14,4,0.5); ctx.fill();
    ctx.fillStyle='rgba(70,40,15,0.4)';
    for(let s=0;s<3;s++) ctx.fillRect(x-5+s*4,y+10,2.5,2);

    // stems
    ctx.strokeStyle='#1A6A12'; ctx.lineWidth=1.4;
    ctx.beginPath(); ctx.moveTo(x,y+9); ctx.bezierCurveTo(x-1.5,y+3,x+1,y-1,x-0.5,y-5); ctx.stroke();
    ctx.strokeStyle='#248A1A'; ctx.lineWidth=0.7;
    ctx.beginPath(); ctx.moveTo(x,y+9); ctx.bezierCurveTo(x-1.5,y+3,x+1,y-1,x-0.5,y-5); ctx.stroke();
    // secondary stem
    ctx.strokeStyle='#1A6A12'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(x,y+11); ctx.bezierCurveTo(x+2,y+6,x+4,y+2,x+3,y-2); ctx.stroke();

    // leaf helper
    const leaf=(lx:number,ly:number,dx:number,dy:number,rot:number,col:string,vein:string)=>{
      ctx.save(); ctx.translate(lx,ly); ctx.rotate(rot+sw*0.05);
      const lg=ctx.createLinearGradient(0,-dy,dx,0);
      lg.addColorStop(0,this.lk(col,12)); lg.addColorStop(0.5,col); lg.addColorStop(1,this.dk(col,10));
      ctx.fillStyle=lg; ctx.beginPath(); ctx.moveTo(0,0);
      ctx.bezierCurveTo(dx*0.3,-dy*0.7,dx*0.8,-dy*0.5,dx,0);
      ctx.bezierCurveTo(dx*0.8,dy*0.5,dx*0.3,dy*0.7,0,0);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle=vein; ctx.lineWidth=0.5;
      ctx.beginPath(); ctx.moveTo(1,0); ctx.quadraticCurveTo(dx*0.5,-1,dx-1,0); ctx.stroke();
      ctx.restore();
    };

    leaf(x-1,y+2,-12,4.5,-0.6,'#1E8A16','rgba(0,90,0,0.3)');
    leaf(x+1,y+1,  11,4,  0.52,'#228C1C','rgba(0,100,0,0.3)');
    leaf(x-1,y-1, -10,3.8,-1.0,'#1A8010','rgba(0,85,0,0.3)');
    leaf(x+1,y-1,  10,3.8, 0.9,'#1E7A18','rgba(0,90,0,0.3)');
    leaf(x,  y-3,  -9,3.2,-0.28,'#289020','rgba(0,100,0,0.3)');
    leaf(x+3,y-1,   8,3,   0.55,'#1E8818','rgba(0,95,0,0.3)');
    // top new leaf (curled/unfurling)
    ctx.save();
    ctx.translate(x-0.5+sw*0.04,y-5+sw*0.05);
    const ng=ctx.createLinearGradient(0,-8,2,0);
    ng.addColorStop(0,'#36C02A'); ng.addColorStop(1,'#1A8A12');
    ctx.fillStyle=ng;
    ctx.beginPath(); ctx.moveTo(0,0); ctx.bezierCurveTo(-1.5,-4,0.5,-7,0,-8); ctx.bezierCurveTo(0.5,-7,2,-4,0,0); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  private drawCactus(x:number,y:number) {
    const ctx=this.ctx;
    // pot
    const pg=ctx.createLinearGradient(x-8,0,x+8,0);
    pg.addColorStop(0,'#5A2A08'); pg.addColorStop(0.5,'#8B4418'); pg.addColorStop(1,'#5A2A08');
    ctx.fillStyle=pg; ctx.beginPath(); ctx.moveTo(x-7,y); ctx.lineTo(x-9,y+14); ctx.lineTo(x+9,y+14); ctx.lineTo(x+7,y); ctx.closePath(); ctx.fill();
    const rg=ctx.createLinearGradient(0,y-3,0,y+1);
    rg.addColorStop(0,'#A85A20'); rg.addColorStop(1,'#7A3E10');
    ctx.fillStyle=rg; ctx.beginPath(); this.rr(x-9,y-3,18,4,1); ctx.fill();
    // main trunk
    ctx.fillStyle='#1E6620'; ctx.beginPath(); this.rr(x-5,y-44,10,44,4); ctx.fill();
    ctx.fillStyle='#24801A'; ctx.fillRect(x-4,y-43,5,42);
    // arms
    ctx.fillStyle='#1E6620'; ctx.beginPath(); this.rr(x+5,y-32,12,8,3); ctx.fill();
    ctx.beginPath(); this.rr(x+13,y-44,8,20,3); ctx.fill();
    ctx.fillStyle='#1E6620'; ctx.beginPath(); this.rr(x-17,y-26,12,8,3); ctx.fill();
    ctx.beginPath(); this.rr(x-17,y-40,8,18,3); ctx.fill();
    // spines
    ctx.strokeStyle='rgba(255,240,180,0.6)'; ctx.lineWidth=0.5;
    [[-3,y-40],[-3,y-30],[-3,y-20],[4,y-38],[4,y-28]].forEach(([sx,sy])=>{
      ctx.beginPath(); ctx.moveTo(x+sx,sy); ctx.lineTo(x+sx-2,sy-3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x+sx,sy); ctx.lineTo(x+sx+2,sy-3); ctx.stroke();
    });
  }

  private drawCat(x:number,y:number) {
    const ctx=this.ctx;
    const tick=this.tick;
    const breathe=Math.sin(tick*0.035)*0.6;

    // cushion (cat bed)
    const cg=ctx.createRadialGradient(x,y+8,2,x,y+8,18);
    cg.addColorStop(0,'rgba(80,30,120,0.7)'); cg.addColorStop(1,'rgba(40,10,70,0.4)');
    ctx.fillStyle=cg; ctx.beginPath(); this.rr(x-20,y+2,40,13,6); ctx.fill();
    ctx.strokeStyle='rgba(150,80,220,0.5)'; ctx.lineWidth=0.7;
    ctx.beginPath(); this.rr(x-20,y+2,40,13,6); ctx.stroke();
    // cushion seam
    ctx.strokeStyle='rgba(120,50,180,0.3)'; ctx.lineWidth=0.4;
    ctx.beginPath(); ctx.moveTo(x,y+3); ctx.lineTo(x,y+14); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x-19,y+8); ctx.lineTo(x+19,y+8); ctx.stroke();

    // tail (behind body)
    ctx.strokeStyle='#9A7355'; ctx.lineWidth=3;
    ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(x-12,y+4); ctx.bezierCurveTo(x-24,y+8,x-22,y+14,x-13,y+12); ctx.stroke();
    ctx.strokeStyle='#BFA080'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(x-12,y+4); ctx.bezierCurveTo(x-24,y+8,x-22,y+14,x-13,y+12); ctx.stroke();
    ctx.lineCap='butt';

    // body (curled, breathing)
    const bg=ctx.createRadialGradient(x-1,y+2+breathe,1,x,y+3,14);
    bg.addColorStop(0,'#D4A87A'); bg.addColorStop(0.6,'#B8936A'); bg.addColorStop(1,'#9A7250');
    ctx.fillStyle=bg;
    ctx.beginPath(); ctx.ellipse(x,y+3+breathe*0.3,15,8.5,0.15,0,Math.PI*2); ctx.fill();
    // belly lighter patch
    ctx.fillStyle='rgba(240,210,170,0.5)';
    ctx.beginPath(); ctx.ellipse(x-1,y+4+breathe*0.3,9,5,0.1,0,Math.PI*2); ctx.fill();
    // fur texture lines
    ctx.strokeStyle='rgba(140,90,50,0.2)'; ctx.lineWidth=0.5;
    for(let i=0;i<4;i++){
      ctx.beginPath(); ctx.moveTo(x-8+i*4,y+1); ctx.quadraticCurveTo(x-6+i*4,y+4,x-7+i*4,y+7); ctx.stroke();
    }

    // head
    const hg=ctx.createRadialGradient(x+10,y-3,1,x+11,y-2,7);
    hg.addColorStop(0,'#D4A87A'); hg.addColorStop(1,'#A8784A');
    ctx.fillStyle=hg;
    ctx.beginPath(); ctx.ellipse(x+11,y-3,6.5,5.5,0.3,0,Math.PI*2); ctx.fill();

    // ears (left closer, right further)
    ctx.fillStyle='#9A6840';
    ctx.beginPath(); ctx.moveTo(x+7,y-6); ctx.lineTo(x+5,y-12); ctx.lineTo(x+11,y-9); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x+13,y-6); ctx.lineTo(x+14,y-11); ctx.lineTo(x+18,y-8); ctx.closePath(); ctx.fill();
    // inner ear pink
    ctx.fillStyle='rgba(255,160,160,0.55)';
    ctx.beginPath(); ctx.moveTo(x+7.5,y-7); ctx.lineTo(x+6,y-11); ctx.lineTo(x+10.5,y-9); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x+13.5,y-7); ctx.lineTo(x+14.5,y-10); ctx.lineTo(x+17,y-8); ctx.closePath(); ctx.fill();

    // eyes closed (z-z sleeping)
    ctx.strokeStyle='#6A4020'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.arc(x+9,y-3,1.8,Math.PI*0.08,Math.PI*0.92); ctx.stroke();
    ctx.beginPath(); ctx.arc(x+13,y-2.5,1.8,Math.PI*0.08,Math.PI*0.92); ctx.stroke();
    // eye lashes
    ctx.strokeStyle='rgba(80,40,10,0.5)'; ctx.lineWidth=0.5;
    ctx.beginPath(); ctx.moveTo(x+7.5,y-3); ctx.lineTo(x+7,y-4.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x+10.5,y-4.5); ctx.lineTo(x+10.5,y-6); ctx.stroke();

    // nose
    ctx.fillStyle='#E08898';
    ctx.beginPath(); ctx.moveTo(x+11,y-0.5); ctx.lineTo(x+10,y+1); ctx.lineTo(x+12,y+1); ctx.closePath(); ctx.fill();

    // mouth
    ctx.strokeStyle='rgba(120,60,60,0.6)'; ctx.lineWidth=0.6;
    ctx.beginPath(); ctx.moveTo(x+11,y+1); ctx.quadraticCurveTo(x+9.5,y+2.5,x+9,y+2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x+11,y+1); ctx.quadraticCurveTo(x+12.5,y+2.5,x+13,y+2); ctx.stroke();

    // whiskers
    ctx.strokeStyle='rgba(255,245,235,0.7)'; ctx.lineWidth=0.6;
    const whi:number[][] = [[x+9,y+0.5,x+2,y-0.5],[x+9,y+1.5,x+2,y+1.5],[x+13,y+0.5,x+21,y-0.5],[x+13,y+1.5,x+21,y+1.5]];
    whi.forEach(([x1,y1,x2,y2])=>{ ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke(); });

    // zzz sleep bubble
    const zf=0.6+Math.sin(tick*0.06)*0.3;
    ctx.globalAlpha=zf*0.7;
    ctx.fillStyle='#A0C8FF'; ctx.font='bold 5px monospace'; ctx.textAlign='left';
    ctx.fillText('z',x+18,y-8);
    ctx.font='bold 4px monospace'; ctx.fillText('z',x+22,y-13);
    ctx.font='bold 3px monospace'; ctx.fillText('z',x+25,y-17);
    ctx.globalAlpha=1; ctx.textAlign='center';
  }

  private drawSittingCat(x:number,y:number) {
    const ctx=this.ctx;
    const tick=this.tick;
    const blink=tick%220<4;
    const tailSwing=Math.sin(tick*0.04)*6;

    // shadow
    ctx.fillStyle='rgba(0,0,0,0.18)';
    ctx.beginPath(); ctx.ellipse(x,y+14,11,3,0,0,Math.PI*2); ctx.fill();

    // tail (behind body)
    ctx.strokeStyle='#C05820'; ctx.lineWidth=3.5; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(x+8,y+10); ctx.bezierCurveTo(x+20+tailSwing,y+16,x+18+tailSwing,y+4,x+9,y); ctx.stroke();
    ctx.strokeStyle='#E8862A'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(x+8,y+10); ctx.bezierCurveTo(x+20+tailSwing,y+16,x+18+tailSwing,y+4,x+9,y); ctx.stroke();
    ctx.lineCap='butt';

    // body
    const bodyG=ctx.createRadialGradient(x-2,y-2,1,x,y+2,12);
    bodyG.addColorStop(0,'#F09A3A'); bodyG.addColorStop(0.5,'#E07830'); bodyG.addColorStop(1,'#B05618');
    ctx.fillStyle=bodyG;
    ctx.beginPath(); ctx.ellipse(x,y,9,12,0,0,Math.PI*2); ctx.fill();
    // belly white patch
    ctx.fillStyle='rgba(255,235,200,0.45)';
    ctx.beginPath(); ctx.ellipse(x,y+2,5,7,0,0,Math.PI*2); ctx.fill();
    // tabby stripes on body
    ctx.strokeStyle='rgba(160,70,10,0.3)'; ctx.lineWidth=0.8;
    [y-6,y-2,y+2].forEach(sy=>{
      ctx.beginPath(); ctx.moveTo(x-7,sy); ctx.quadraticCurveTo(x,sy-1,x+7,sy); ctx.stroke();
    });

    // paws
    const pawG=ctx.createLinearGradient(x-8,y+10,x+8,y+14);
    pawG.addColorStop(0,'#C06020'); pawG.addColorStop(1,'#E07030');
    ctx.fillStyle=pawG;
    ctx.beginPath(); ctx.ellipse(x-5,y+13,4.5,2.8,0,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x+5,y+13,4.5,2.8,0,0,Math.PI*2); ctx.fill();
    // paw toe lines
    ctx.strokeStyle='rgba(100,40,10,0.4)'; ctx.lineWidth=0.5;
    [-2,0,2].forEach(d=>{ ctx.beginPath(); ctx.moveTo(x-5+d,y+11); ctx.lineTo(x-5+d,y+14); ctx.stroke(); });
    [-2,0,2].forEach(d=>{ ctx.beginPath(); ctx.moveTo(x+5+d,y+11); ctx.lineTo(x+5+d,y+14); ctx.stroke(); });

    // neck
    ctx.fillStyle='#D07828';
    ctx.beginPath(); ctx.ellipse(x,y-10,5,4,0,0,Math.PI*2); ctx.fill();

    // head
    const headG=ctx.createRadialGradient(x-1,y-18,1,x,y-17,9);
    headG.addColorStop(0,'#F0A040'); headG.addColorStop(1,'#B86020');
    ctx.fillStyle=headG;
    ctx.beginPath(); ctx.ellipse(x,y-18,8.5,7.5,0,0,Math.PI*2); ctx.fill();
    // cheek puffs
    ctx.fillStyle='rgba(240,160,80,0.5)';
    ctx.beginPath(); ctx.ellipse(x-6,y-16,3.5,3,0,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x+6,y-16,3.5,3,0,0,Math.PI*2); ctx.fill();

    // ears
    ctx.fillStyle='#B05818';
    ctx.beginPath(); ctx.moveTo(x-5,y-23); ctx.lineTo(x-9,y-30); ctx.lineTo(x-1,y-25); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x+5,y-23); ctx.lineTo(x+9,y-30); ctx.lineTo(x+2,y-25); ctx.closePath(); ctx.fill();
    ctx.fillStyle='rgba(255,150,130,0.6)';
    ctx.beginPath(); ctx.moveTo(x-5.5,y-24); ctx.lineTo(x-8,y-29); ctx.lineTo(x-2,y-25.5); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x+5.5,y-24); ctx.lineTo(x+8,y-29); ctx.lineTo(x+2.5,y-25.5); ctx.closePath(); ctx.fill();
    // ear tufts
    ctx.strokeStyle='rgba(80,40,10,0.4)'; ctx.lineWidth=0.5;
    ctx.beginPath(); ctx.moveTo(x-6,y-27); ctx.lineTo(x-5,y-30); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x+6,y-27); ctx.lineTo(x+5,y-30); ctx.stroke();

    // tabby forehead marks
    ctx.strokeStyle='rgba(150,65,10,0.35)'; ctx.lineWidth=0.7;
    ctx.beginPath(); ctx.moveTo(x-3,y-24); ctx.quadraticCurveTo(x,y-25,x+3,y-24); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x-2,y-22); ctx.quadraticCurveTo(x,y-23,x+2,y-22); ctx.stroke();

    // eyes
    if (blink) {
      ctx.strokeStyle='#4A2800'; ctx.lineWidth=1.2;
      ctx.beginPath(); ctx.arc(x-3,y-18,2.2,Math.PI*0.05,Math.PI*0.95); ctx.stroke();
      ctx.beginPath(); ctx.arc(x+3,y-18,2.2,Math.PI*0.05,Math.PI*0.95); ctx.stroke();
    } else {
      // eye whites
      ctx.fillStyle='#1A1000';
      ctx.beginPath(); ctx.ellipse(x-3,y-18,2.4,2.8,0,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x+3,y-18,2.4,2.8,0,0,Math.PI*2); ctx.fill();
      // iris amber
      ctx.fillStyle='#C87A00';
      ctx.beginPath(); ctx.ellipse(x-3,y-18,1.8,2.2,0,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x+3,y-18,1.8,2.2,0,0,Math.PI*2); ctx.fill();
      // pupil slit
      ctx.fillStyle='#0A0800';
      ctx.beginPath(); ctx.ellipse(x-3,y-18,0.6,2,0,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x+3,y-18,0.6,2,0,0,Math.PI*2); ctx.fill();
      // eye shine
      ctx.fillStyle='rgba(255,255,255,0.65)';
      ctx.beginPath(); ctx.ellipse(x-2.2,y-19.2,0.6,0.5,0,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x+3.8,y-19.2,0.6,0.5,0,0,Math.PI*2); ctx.fill();
    }

    // nose
    ctx.fillStyle='#FF7080';
    ctx.beginPath(); ctx.moveTo(x,y-14.5); ctx.lineTo(x-1.5,y-12.5); ctx.lineTo(x+1.5,y-12.5); ctx.closePath(); ctx.fill();
    // mouth
    ctx.strokeStyle='rgba(120,50,50,0.7)'; ctx.lineWidth=0.7;
    ctx.beginPath(); ctx.moveTo(x,y-12.5); ctx.quadraticCurveTo(x-2.5,y-11,x-3,y-10.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x,y-12.5); ctx.quadraticCurveTo(x+2.5,y-11,x+3,y-10.5); ctx.stroke();

    // whiskers
    ctx.strokeStyle='rgba(255,250,240,0.75)'; ctx.lineWidth=0.6;
    [[-2.5,y-13.5,-14,y-14.5],[-2.5,y-12,-14,y-12],
     [2.5,y-13.5,14,y-14.5],[2.5,y-12,14,y-12]].forEach(([x1,y1,x2,y2])=>{
      ctx.beginPath(); ctx.moveTo(x+x1,y1 as number); ctx.lineTo(x+x2,y2 as number); ctx.stroke();
    });
  }

  private drawUVLamp(x:number,y:number) {
    const ctx=this.ctx;
    const tick=this.tick;
    const pulse=0.7+Math.sin(tick*0.05)*0.2;
    // floor cone
    ctx.save();
    const cg=ctx.createRadialGradient(x,y-5,3,x,y+30,35);
    cg.addColorStop(0,`rgba(140,0,255,${(pulse*0.25).toFixed(2)})`);
    cg.addColorStop(1,'rgba(80,0,200,0)');
    ctx.fillStyle=cg;
    ctx.beginPath(); ctx.moveTo(x-18,y-5); ctx.lineTo(x-30,y+32); ctx.lineTo(x+30,y+32); ctx.lineTo(x+18,y-5); ctx.closePath(); ctx.fill();
    ctx.restore();
    // base
    const bg=ctx.createLinearGradient(x-10,0,x+10,0);
    bg.addColorStop(0,'#1A1628'); bg.addColorStop(0.5,'#2A2040'); bg.addColorStop(1,'#1A1628');
    ctx.fillStyle=bg; ctx.beginPath(); this.rr(x-10,y+28,20,6,2); ctx.fill();
    ctx.fillStyle='#0F0C1E'; ctx.beginPath(); this.rr(x-7,y+34,14,3,1); ctx.fill();
    // pole
    const pg=ctx.createLinearGradient(x-2,0,x+2,0);
    pg.addColorStop(0,'#1A1628'); pg.addColorStop(0.5,'#2C2448'); pg.addColorStop(1,'#1A1628');
    ctx.fillStyle=pg; ctx.fillRect(x-2,y-80,4,110);
    // neck joint
    ctx.fillStyle='#2C2040'; ctx.beginPath(); ctx.arc(x,y-80,5,0,Math.PI*2); ctx.fill();
    // lamp head (angled)
    ctx.save(); ctx.translate(x,y-80);
    ctx.fillStyle='#14102A'; ctx.beginPath(); this.rr(-12,-18,24,18,3); ctx.fill();
    ctx.strokeStyle=`rgba(140,0,255,${(pulse*0.6).toFixed(2)})`; ctx.lineWidth=0.8;
    ctx.beginPath(); this.rr(-12,-18,24,18,3); ctx.stroke();
    // UV tube
    ctx.globalAlpha=pulse;
    ctx.fillStyle='rgba(180,0,255,0.9)'; ctx.beginPath(); this.rr(-8,-15,16,12,2); ctx.fill();
    ctx.fillStyle='rgba(220,180,255,0.4)'; ctx.fillRect(-6,-14,12,3);
    ctx.globalAlpha=1;
    // inner glow
    ctx.fillStyle=`rgba(140,0,255,${(pulse*0.35).toFixed(2)})`;
    ctx.beginPath(); ctx.ellipse(0,-9,14,8,0,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }

  private drawCoffeeMachine(x:number,y:number) {
    const ctx=this.ctx;
    const tick=this.tick;
    ctx.fillStyle='rgba(0,120,160,0.07)';
    ctx.beginPath(); ctx.ellipse(x,y-22,26,30,0,0,Math.PI*2); ctx.fill();
    // water tank
    ctx.fillStyle='rgba(18,45,80,0.85)'; ctx.beginPath(); this.rr(x-9,y-56,16,18,2); ctx.fill();
    ctx.fillStyle='rgba(40,100,200,0.28)'; ctx.beginPath(); this.rr(x-8,y-54,14,12,1); ctx.fill();
    ctx.strokeStyle='rgba(0,160,255,0.38)'; ctx.lineWidth=0.6; ctx.beginPath(); this.rr(x-9,y-56,16,18,2); ctx.stroke();
    // body
    const mg=ctx.createLinearGradient(x-17,0,x+17,0);
    mg.addColorStop(0,'#080E1C'); mg.addColorStop(0.45,'#182436'); mg.addColorStop(1,'#080E1C');
    ctx.fillStyle=mg; ctx.beginPath(); this.rr(x-17,y-42,34,42,3); ctx.fill();
    ctx.strokeStyle='rgba(0,245,255,0.18)'; ctx.lineWidth=0.6; ctx.beginPath(); this.rr(x-17,y-42,34,42,3); ctx.stroke();
    // display
    ctx.fillStyle='#020810'; ctx.beginPath(); this.rr(x-12,y-38,18,12,1); ctx.fill();
    const sf=0.75+Math.sin(tick*0.07)*0.12;
    ctx.globalAlpha=sf;
    ctx.fillStyle='rgba(0,220,255,0.9)'; ctx.font='5px monospace'; ctx.textAlign='center';
    ctx.fillText('92°C',x-3,y-30);
    ctx.fillStyle='rgba(0,255,136,0.7)'; ctx.font='3px monospace';
    ctx.fillText('READY',x-3,y-26);
    ctx.globalAlpha=1;
    // cup
    ctx.fillStyle='#F0EAE0';
    ctx.beginPath(); ctx.moveTo(x-8,y-9); ctx.lineTo(x-9,y-3); ctx.lineTo(x-2,y-3); ctx.lineTo(x-2,y-9); ctx.closePath(); ctx.fill();
    ctx.fillStyle='#1E0A00'; ctx.fillRect(x-7.5,y-8.5,5,2.5);
    // steam
    for(let s=0;s<3;s++){
      const phase=(tick*0.8+s*13)%40;
      if(phase<36){
        const alpha=0.32-phase*0.009;
        const ox=Math.sin(phase*0.3+s)*1.2;
        ctx.fillStyle=`rgba(210,225,255,${alpha.toFixed(2)})`;
        ctx.beginPath(); ctx.ellipse(x-5+ox,y-9-phase*0.45,1.1,0.85,0,0,Math.PI*2); ctx.fill();
      }
    }
  }

  private drawShelf(x:number,y:number) {
    const ctx=this.ctx;
    ctx.fillStyle='#18100A';
    ctx.beginPath(); this.rr(x+6,y+21,4,7,0.5); ctx.fill();
    ctx.beginPath(); this.rr(x+46,y+21,4,7,0.5); ctx.fill();
    const sg=ctx.createLinearGradient(0,y,0,y+5);
    sg.addColorStop(0,'#5A3C1A'); sg.addColorStop(1,'#3A2412');
    ctx.fillStyle=sg; ctx.beginPath(); this.rr(x-2,y,60,5,1); ctx.fill();
    ctx.fillStyle='#0E0C08'; ctx.fillRect(x,y+5,56,18);
    const books=[
      {w:6,h:14,c:'#8B1A18'},{w:5,h:10,c:'#1A3E8B'},{w:7,h:15,c:'#1C6B20'},
      {w:5,h:11,c:'#6A1A8B'},{w:6,h:13,c:'#8B5E10'},{w:4,h:12,c:'#106060'},
      {w:5,h:10,c:'#7A2208'},
    ];
    let bx=x+3;
    books.forEach((b,i)=>{
      const by=y+5+(15-b.h);
      const bg2=ctx.createLinearGradient(bx,0,bx+b.w,0);
      bg2.addColorStop(0,this.dk(b.c,30)); bg2.addColorStop(0.5,b.c); bg2.addColorStop(1,this.dk(b.c,40));
      ctx.fillStyle=bg2; ctx.beginPath(); this.rr(bx,by,b.w,b.h,0.4); ctx.fill();
      bx+=b.w+1.5;
    });
    ctx.fillStyle='rgba(0,200,255,0.22)'; ctx.fillRect(x,y+4,56,1);
    ctx.strokeStyle='rgba(0,245,255,0.12)'; ctx.lineWidth=0.5; ctx.strokeRect(x-2,y-1,60,26);
  }

  private drawRug() {
    const ctx=this.ctx;
    ctx.fillStyle='rgba(100,20,160,0.28)'; ctx.fillRect(4,190,110,72);
    ctx.strokeStyle='rgba(180,60,220,0.3)'; ctx.lineWidth=1;
    ctx.strokeRect(6,192,106,68); ctx.strokeRect(9,195,100,62);
    ctx.strokeStyle='rgba(160,0,255,0.18)'; ctx.lineWidth=0.6; ctx.strokeRect(5,191,108,70);
  }

  private drawCoffeeTable(x:number,y:number) {
    const ctx=this.ctx;
    ctx.fillStyle='#1A2030'; ctx.fillRect(x+2,y+13,3,6); ctx.fillRect(x+25,y+13,3,6);
    ctx.fillStyle='rgba(0,20,42,0.78)'; ctx.fillRect(x,y,30,14);
    ctx.strokeStyle='rgba(0,245,255,0.42)'; ctx.lineWidth=0.8; ctx.strokeRect(x,y,30,14);
    ctx.fillStyle='rgba(0,245,255,0.07)'; ctx.fillRect(x+1,y+1,28,4);
    ctx.fillStyle='#8B1E1E'; ctx.beginPath(); this.rr(x+3,y+3,6,8,1); ctx.fill();
    ctx.fillStyle='#0C1520'; ctx.fillRect(x+14,y+2,13,10);
    ctx.fillStyle='rgba(0,180,255,0.3)'; ctx.fillRect(x+15,y+3,11,8);
    ctx.fillStyle='rgba(0,245,255,0.6)';
    ctx.fillRect(x+16,y+5,6,1); ctx.fillRect(x+16,y+7,4,1);
  }

  private drawVignette() {
    const ctx=this.ctx;
    const W=IW, H=IH;
    const vig=ctx.createRadialGradient(W/2,H/2,80,W/2,H/2,W*0.75);
    vig.addColorStop(0,'transparent'); vig.addColorStop(1,'rgba(0,0,0,0.38)');
    ctx.fillStyle=vig; ctx.fillRect(0,0,W,H);
  }

  // ══════════════════════════════════════════════════════════════════════
  //  MOUSE INTERACTION
  // ══════════════════════════════════════════════════════════════════════
  private screenToWorld(ex:number,ey:number):{wx:number,wy:number} {
    const dpr = window.devicePixelRatio || 1;
    const W = this.display.width;
    const H = this.display.height;
    const sc = Math.min(W / IW, H / IH);
    const ox = (W - IW * sc) / 2;
    const oy = (H - IH * sc) / 2;
    return { wx: (ex * dpr - ox) / sc, wy: (ey * dpr - oy) / sc };
  }

  private agentAt(wx:number,wy:number): RendererAgent|null {
    for (const a of this.agents) {
      const dx=wx-a.x, dy=wy-a.y;
      if (Math.sqrt(dx*dx+dy*dy)<20) return a;
    }
    return null;
  }

  private onMouseMove(e:MouseEvent) {
    const rect=this.display.getBoundingClientRect();
    const {wx,wy}=this.screenToWorld(e.clientX-rect.left,e.clientY-rect.top);
    const a=this.agentAt(wx,wy);
    this.hoveredId=a?a.id:null;
    this.display.style.cursor=a?'pointer':'default';
  }

  private onMouseClick(e:MouseEvent) {
    const rect=this.display.getBoundingClientRect();
    const {wx,wy}=this.screenToWorld(e.clientX-rect.left,e.clientY-rect.top);
    const a=this.agentAt(wx,wy);
    if (a) this.onAgentClick(a.id, e.clientX, e.clientY);
  }

  // ══════════════════════════════════════════════════════════════════════
  //  MAIN LOOP
  // ══════════════════════════════════════════════════════════════════════
  private frame() {
    this.tick++;
    const ctx=this.ctx;
    ctx.clearRect(0,0,this.display.width,this.display.height);
    this.setTx();

    // room background
    this.drawRoom();

    // furniture (back items)
    this.drawSofa(14,195);
    this.drawRug();
    this.drawCoffeeTable(26,232);

    // shelves
    this.drawShelf(128,14);
    this.drawShelf(340,14);

    // poster + TV
    this.drawMoviePoster(94,3);
    this.drawFriendsTV(388,134,);

    // armchair
    this.drawArmchair(452,200);

    // desks
    const deskScreenColors=['#002255','#3A0010','#002810','#220040','#001E1E','#2A1200'];
    DESK_XS.forEach((dx,i)=>this.drawDesk(dx,DESK_Y+5,i,deskScreenColors[i]));

    // server racks
    this.drawServerRack(558,268);
    this.drawServerRack(596,268);

    // plants
    this.drawBigPlant(618,272);
    this.drawSmallPlant(7,158,0);
    this.drawSmallPlant(7,348,1);
    this.drawCactus(120,348);

    // lamps
    this.drawUVLamp(52,358);

    // cats
    this.drawCat(58,355);
    this.drawSittingCat(170,292);

    // coffee machine
    this.drawCoffeeMachine(300,372);

    // agents
    for (const a of this.agents) {
      this.drawCrewmate(a.x, a.y, a.color, a.visorColor, a.walkFrame, a.state, a.name, a.id===this.hoveredId);
    }

    // vignette last
    this.drawVignette();

    // (drawing is already on display canvas — nothing to blit)

    this.rafId=requestAnimationFrame(()=>this.frame());
  }

  start() { this.rafId=requestAnimationFrame(()=>this.frame()); }
  stop()  { cancelAnimationFrame(this.rafId); }

  destroy() {
    this.stop();
    window.removeEventListener('resize', this._resizeBound);
  }
}
