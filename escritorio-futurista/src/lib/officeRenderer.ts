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
const PXSCALE = 3;
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
  private off: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dCtx: CanvasRenderingContext2D;
  private tick = 0;
  private rafId = 0;
  private agents: RendererAgent[] = [];
  private onAgentClick: AgentClickCb = () => {};
  private hoveredId: string | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.display = canvas;
    this.dCtx = canvas.getContext('2d')!;
    this.off = document.createElement('canvas');
    this.ctx = this.off.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', this.resize.bind(this));
    canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
    canvas.addEventListener('click', this.onMouseClick.bind(this));
  }

  setAgents(agents: RendererAgent[]) { this.agents = agents; }
  setOnAgentClick(cb: AgentClickCb) { this.onAgentClick = cb; }

  private resize() {
    const parent = this.display.parentElement;
    if (!parent) return;
    this.display.width = parent.clientWidth;
    this.display.height = parent.clientHeight;
    this.off.width  = Math.max(1, Math.floor(this.display.width  / PXSCALE));
    this.off.height = Math.max(1, Math.floor(this.display.height / PXSCALE));
  }

  private setTx() {
    const sc = Math.min(this.off.width / IW, this.off.height / IH);
    this.ctx.setTransform(
      sc, 0, 0, sc,
      (this.off.width  - IW * sc) / 2,
      (this.off.height - IH * sc) / 2
    );
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
    const R = 14;
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
    ctx.fillStyle='#0C1420'; ctx.beginPath(); this.rr(x,y,34,100,2); ctx.fill();
    ctx.strokeStyle='rgba(0,245,255,0.22)'; ctx.lineWidth=0.6; ctx.beginPath(); this.rr(x,y,34,100,2); ctx.stroke();
    ctx.fillStyle='rgba(255,255,255,0.04)'; ctx.fillRect(x+1,y+1,32,2);
    for(let u=0;u<10;u++){
      const uy=y+4+u*9;
      ctx.fillStyle='#080E1C'; ctx.fillRect(x+2,uy,30,8);
      ctx.strokeStyle='rgba(0,200,255,0.1)'; ctx.lineWidth=0.3; ctx.strokeRect(x+2,uy,30,8);
      // LED
      const on=(tick*0.5+u*17)%60<45;
      ctx.fillStyle=on?`rgba(0,255,136,0.9)`:`rgba(0,60,30,0.5)`;
      ctx.beginPath(); ctx.arc(x+6,uy+4,1.5,0,Math.PI*2); ctx.fill();
      if(on){
        ctx.fillStyle='rgba(0,255,136,0.15)'; ctx.beginPath(); ctx.arc(x+6,uy+4,4,0,Math.PI*2); ctx.fill();
      }
      // disk activity
      const act=(tick*0.8+u*7)%30<8;
      ctx.fillStyle=act?'rgba(255,150,0,0.8)':'rgba(60,30,0,0.4)';
      ctx.beginPath(); ctx.arc(x+11,uy+4,1,0,Math.PI*2); ctx.fill();
    }
    // front panel
    ctx.fillStyle='rgba(0,245,255,0.06)'; ctx.fillRect(x+2,y+96,30,2);
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
    const sw=Math.sin(tick*0.02)*1.5;
    // pot
    ctx.fillStyle='rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(x,y,18,4,0,0,Math.PI*2); ctx.fill();
    const pg=ctx.createLinearGradient(x-14,0,x+14,0);
    pg.addColorStop(0,'#4A1E06'); pg.addColorStop(0.5,'#7A3818'); pg.addColorStop(1,'#4A1E06');
    ctx.fillStyle=pg; ctx.beginPath(); ctx.moveTo(x-12,y-25); ctx.lineTo(x-14,y); ctx.lineTo(x+14,y); ctx.lineTo(x+12,y-25); ctx.closePath(); ctx.fill();
    const rg=ctx.createLinearGradient(0,y-28,0,y-22);
    rg.addColorStop(0,'#9A5830'); rg.addColorStop(1,'#6A3010');
    ctx.fillStyle=rg; ctx.beginPath(); this.rr(x-15,y-28,30,6,2); ctx.fill();
    ctx.fillStyle='rgba(255,180,80,0.12)'; ctx.fillRect(x-13,y-28,26,2);
    // trunk
    ctx.strokeStyle='#4A2E0A'; ctx.lineWidth=5;
    ctx.beginPath(); ctx.moveTo(x,y-24); ctx.bezierCurveTo(x-2,y-50,x+2,y-70,x,y-90); ctx.stroke();
    ctx.strokeStyle='#5A3C14'; ctx.lineWidth=3;
    ctx.beginPath(); ctx.moveTo(x,y-24); ctx.bezierCurveTo(x-2,y-50,x+2,y-70,x,y-90); ctx.stroke();
    // leaves
    const leafDefs:[number,number,string,number][]=[
      [-2.3,38,'#145A06',-1],[-1.7,34,'#1C7A10',1],[-1.1,42,'#12780A',-1],
      [-0.4,37,'#1A7210',1],[0.2,39,'#145A06',-1],[0.9,36,'#1C7A10',1],
      [1.5,41,'#12780A',-1],[2.1,35,'#1A7210',1],
    ];
    leafDefs.forEach(([a,l,c,side],i)=>{
      ctx.save();
      ctx.translate(x+sw*0.2*side,y-10+sw*0.12*(i%2?1:-1));
      ctx.rotate(a+sw*0.035*(i%2?1:-1));
      const lg=ctx.createLinearGradient(0,0,l,0);
      lg.addColorStop(0,c); lg.addColorStop(0.5,this.lk(c,15)); lg.addColorStop(1,this.dk(c,10));
      ctx.fillStyle=lg; ctx.beginPath(); ctx.moveTo(0,0);
      ctx.bezierCurveTo(l*0.25,-8,l*0.7,-10,l,-4);
      ctx.bezierCurveTo(l*0.7,5,l*0.25,4,0,1);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    });
  }

  private drawSmallPlant(x:number,y:number,id:number) {
    const ctx=this.ctx;
    const sw=Math.sin(this.tick*0.03+id*1.8)*1.8;
    ctx.fillStyle='rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(x,y+20,8,2,0,0,Math.PI*2); ctx.fill();
    const pg=ctx.createLinearGradient(x-8,0,x+8,0);
    pg.addColorStop(0,'#5A2A08'); pg.addColorStop(0.5,'#8B4418'); pg.addColorStop(1,'#5A2A08');
    ctx.fillStyle=pg; ctx.beginPath(); ctx.moveTo(x-7,y+8); ctx.lineTo(x-5,y+20); ctx.lineTo(x+5,y+20); ctx.lineTo(x+7,y+8); ctx.closePath(); ctx.fill();
    const rg=ctx.createLinearGradient(0,y+7,0,y+11);
    rg.addColorStop(0,'#A85A20'); rg.addColorStop(1,'#7A3E10');
    ctx.fillStyle=rg; ctx.beginPath(); this.rr(x-8,y+7,16,4,1); ctx.fill();
    ctx.fillStyle='rgba(255,190,100,0.15)'; ctx.fillRect(x-7,y+7,14,1.5);
    ctx.fillStyle='#140E06'; ctx.beginPath(); this.rr(x-7,y+9,14,3,0.5); ctx.fill();
    ctx.strokeStyle='#1A6012'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(x,y+9); ctx.bezierCurveTo(x-1,y+4,x+1,y,x,y-3); ctx.stroke();
    // leaves
    const leaf=(lx:number,ly:number,dx:number,dy:number,baseRot:number,col:string)=>{
      ctx.save(); ctx.translate(lx,ly); ctx.rotate(baseRot+sw*0.055);
      ctx.fillStyle=col; ctx.beginPath(); ctx.moveTo(0,0);
      ctx.bezierCurveTo(dx*0.3,-dy*0.6,dx*0.8,-dy*0.4,dx,0);
      ctx.bezierCurveTo(dx*0.8,dy*0.4,dx*0.3,dy*0.6,0,0);
      ctx.closePath(); ctx.fill(); ctx.restore();
    };
    leaf(x-1,y+2,-11,4,-0.55,'#1A7A14');
    leaf(x+1,y+1, 10,4, 0.48,'#207A18');
    leaf(x-1,y-1, -9,3.5,-0.95,'#1E8818');
    leaf(x+1,y-1,  9,3.5, 0.88,'#1A7020');
    leaf(x,  y-3, -8,3, -0.3, '#24901C');
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
    // cushion
    ctx.fillStyle='rgba(60,30,80,0.6)'; ctx.beginPath(); this.rr(x-18,y+4,36,10,4); ctx.fill();
    ctx.strokeStyle='rgba(120,60,180,0.4)'; ctx.lineWidth=0.5; ctx.strokeRect(x-17,y+5,34,8);
    // sleeping cat body (curled)
    ctx.fillStyle='#B8936A';
    ctx.beginPath(); ctx.ellipse(x,y+2,16,9,0.2,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#C8A880';
    ctx.beginPath(); ctx.ellipse(x-2,y,13,7,0.2,0,Math.PI*2); ctx.fill();
    // head
    ctx.fillStyle='#B8936A';
    ctx.beginPath(); ctx.ellipse(x+10,y-4,7,6,0.4,0,Math.PI*2); ctx.fill();
    // ears
    ctx.fillStyle='#A07850';
    ctx.beginPath(); ctx.moveTo(x+8,y-8); ctx.lineTo(x+6,y-13); ctx.lineTo(x+12,y-10); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x+13,y-7); ctx.lineTo(x+14,y-12); ctx.lineTo(x+18,y-8); ctx.closePath(); ctx.fill();
    // eyes closed (sleeping)
    ctx.strokeStyle='#7A5030'; ctx.lineWidth=0.8;
    ctx.beginPath(); ctx.arc(x+9,y-4,1.5,Math.PI*0.1,Math.PI*0.9); ctx.stroke();
    ctx.beginPath(); ctx.arc(x+13,y-3,1.5,Math.PI*0.1,Math.PI*0.9); ctx.stroke();
    // breathing
    const breathe=Math.sin(tick*0.04)*0.5;
    ctx.fillStyle='rgba(255,255,255,0.08)';
    ctx.beginPath(); ctx.ellipse(x-2,y+breathe,10,5,0.2,0,Math.PI*2); ctx.fill();
    // tail
    ctx.strokeStyle='#B8936A'; ctx.lineWidth=2.5;
    ctx.beginPath(); ctx.moveTo(x-14,y+2); ctx.bezierCurveTo(x-22,y+5,x-20,y+12,x-14,y+10); ctx.stroke();
    // whiskers
    ctx.strokeStyle='rgba(255,240,220,0.5)'; ctx.lineWidth=0.5;
    ctx.beginPath(); ctx.moveTo(x+8,y-2); ctx.lineTo(x+2,y-1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x+8,y); ctx.lineTo(x+2,y+1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x+13,y-2); ctx.lineTo(x+20,y-1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x+13,y); ctx.lineTo(x+20,y+1); ctx.stroke();
  }

  private drawSittingCat(x:number,y:number) {
    const ctx=this.ctx;
    const tick=this.tick;
    const blink=tick%180<5;
    // body
    ctx.fillStyle='#E07830';
    ctx.beginPath(); ctx.ellipse(x,y,10,13,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#F09040';
    ctx.beginPath(); ctx.ellipse(x-1,y-2,8,10,0,0,Math.PI*2); ctx.fill();
    // head
    ctx.fillStyle='#E07830';
    ctx.beginPath(); ctx.ellipse(x,y-18,9,8,0,0,Math.PI*2); ctx.fill();
    // ears
    ctx.fillStyle='#C05A20';
    ctx.beginPath(); ctx.moveTo(x-6,y-23); ctx.lineTo(x-9,y-29); ctx.lineTo(x-2,y-25); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x+5,y-23); ctx.lineTo(x+9,y-29); ctx.lineTo(x+3,y-25); ctx.closePath(); ctx.fill();
    // inner ear
    ctx.fillStyle='rgba(255,160,120,0.5)';
    ctx.beginPath(); ctx.moveTo(x-6,y-24); ctx.lineTo(x-8,y-28); ctx.lineTo(x-3,y-25); ctx.closePath(); ctx.fill();
    // eyes
    if (blink) {
      ctx.strokeStyle='#4A2800'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.arc(x-3,y-19,2,Math.PI*0.1,Math.PI*0.9); ctx.stroke();
      ctx.beginPath(); ctx.arc(x+3,y-19,2,Math.PI*0.1,Math.PI*0.9); ctx.stroke();
    } else {
      ctx.fillStyle='#4A2800'; ctx.beginPath(); ctx.ellipse(x-3,y-19,2,2.5,0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#8B5000'; ctx.beginPath(); ctx.ellipse(x-3,y-19,0.8,2,0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#4A2800'; ctx.beginPath(); ctx.ellipse(x+3,y-19,2,2.5,0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#8B5000'; ctx.beginPath(); ctx.ellipse(x+3,y-19,0.8,2,0,0,Math.PI*2); ctx.fill();
    }
    // nose
    ctx.fillStyle='#FF9090'; ctx.beginPath(); ctx.arc(x,y-16,1.2,0,Math.PI*2); ctx.fill();
    // whiskers
    ctx.strokeStyle='rgba(255,240,220,0.5)'; ctx.lineWidth=0.5;
    ctx.beginPath(); ctx.moveTo(x-2,y-16); ctx.lineTo(x-12,y-17); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x-2,y-15); ctx.lineTo(x-12,y-15); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x+2,y-16); ctx.lineTo(x+12,y-17); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x+2,y-15); ctx.lineTo(x+12,y-15); ctx.stroke();
    // tail
    ctx.strokeStyle='#E07830'; ctx.lineWidth=3;
    ctx.beginPath(); ctx.moveTo(x+9,y+10); ctx.bezierCurveTo(x+18,y+14,x+16,y+5,x+10,y+2); ctx.stroke();
    // paws
    ctx.fillStyle='#C05A20';
    ctx.beginPath(); ctx.ellipse(x-5,y+13,4,2.5,0,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x+5,y+13,4,2.5,0,0,Math.PI*2); ctx.fill();
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
    const sc=Math.min(this.off.width/IW, this.off.height/IH);
    const ox=(this.off.width-IW*sc)/2;
    const oy=(this.off.height-IH*sc)/2;
    // map from display pixels → offCanvas pixels → world coords
    const dpx=ex*(this.off.width/this.display.width);
    const dpy=ey*(this.off.height/this.display.height);
    return { wx:(dpx-ox)/sc, wy:(dpy-oy)/sc };
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
    ctx.clearRect(0,0,this.off.width,this.off.height);
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

    // blit to display (nearest-neighbour = pixel-art look)
    this.dCtx.save();
    this.dCtx.imageSmoothingEnabled=false;
    this.dCtx.clearRect(0,0,this.display.width,this.display.height);
    this.dCtx.drawImage(this.off,0,0,this.off.width,this.off.height,0,0,this.display.width,this.display.height);
    this.dCtx.restore();

    this.rafId=requestAnimationFrame(()=>this.frame());
  }

  start() { this.rafId=requestAnimationFrame(()=>this.frame()); }
  stop()  { cancelAnimationFrame(this.rafId); }

  destroy() {
    this.stop();
    window.removeEventListener('resize',this.resize.bind(this));
  }
}
