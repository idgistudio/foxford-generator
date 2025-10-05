/* ====== ФОНТЫ/ПАРАМЕТРЫ ====== */
let font, otFont;

let bend = 50, bend2 = -80, effectScale = 1.0;
let textImg;
let currentMode = "Flag";
let isAnimating = false;

let animationProgress = 1;
const ANIMATION_SPEED = 0.010, ANIMATION_STAGGER = 0.6;
let segments = 10000, scale = 4;

const SPHERE_COLS = 160, SPHERE_ROWS = 120;
const SPHERE_SPAN_X = Math.PI * 0.90, SPHERE_SPAN_Y = Math.PI * 0.70;
const SPHERE_R_MIN = 0.55, SPHERE_R_MAX = 1.80;

const MAX_DISTORTION  = { Flag:75, Arc:140, Fish:45, Sphere:60, Rise:100 };
const MAX_DISTORTION2 = { Rise:100 };

let lineHeightFactor = 1.2;         // 120%
let textAlignMode = 'center';       // 'left' | 'center' | 'right'

/* единый тумблер */
let isCaps = false, orbitEnabled = false, dragEnabled = false;

let isDraggingEffect = false, dragStartY = 0, bendStart = 0;
let lastMouseX = 0, lastMouseY = 0, rotX = 0, rotY = 0;

let uiScale = 1; // масштаб панели

/* ====== preload / setup ====== */
function preload(){
  font = loadFont('TT Foxford.ttf');
  opentype.load('TT Foxford.ttf', (err, f)=>{ if(!err) otFont = f; });
}
function setup(){
  setAttributes('antialias', true);
  const cnv = createCanvas(windowWidth, windowHeight, WEBGL);
  cnv.style('z-index','0'); cnv.style('position','fixed');

  const cs = getComputedStyle(document.documentElement);
  const panelX = parseInt(cs.getPropertyValue('--panel-x'))||32;
  const panelW = parseInt(cs.getPropertyValue('--panel-w'))||365;
  const gap    = parseInt(cs.getPropertyValue('--gap'))||32;
  cnv.style('left', `${panelX + panelW + gap}px`);
  cnv.style('top', '0');

  textureMode(NORMAL); noStroke();

  bindUI();
  createTextTexture(getCurrentText());
  syncBendSlidersToLimits();
  toggleSecondSliderUI();
  toggleSizeSliderUI();
  updateBendLabel();
  updateRangeDecor(UI.r1);

  relayoutUI();
}
function windowResized(){
  resizeCanvas(windowWidth, windowHeight);
  relayoutUI();
}

/* ====== UI ====== */
const UI = {};
const el = q => document.querySelector(q);

function bindUI(){
  UI.effectBtns = [...document.querySelectorAll('#effect-group .pill')];
  UI.r1   = el('#distortion');
  UI.r2   = el('#distortion2');
  UI.r2w  = el('#distortion2-wrap');
  UI.size = el('#effect-scale');
  UI.sizew= el('#size-wrap');

  UI.text = el('#text');
  UI.caps = el('#caps');

  // интерлиньяж
  UI.leadingIcon = el('#leading-icon');
  UI.leadingEdit = el('#leading-edit');

  // выключка
  UI.align = el('#align');
  UI.alignBtns = [...document.querySelectorAll('#align .align__btn')];

  UI.manual = el('#manual-toggle');
  UI.exportBtn = el('#export');
  UI.hint = el('#distortion-hint');
  UI.foot = el('#foot');

  // эффекты
  UI.effectBtns.forEach(b=>{
    b.addEventListener('click', ()=>{
      UI.effectBtns.forEach(x=>x.classList.remove('is-active'));
      b.classList.add('is-active');
      currentMode = b.dataset.effect;
      isAnimating = false; animationProgress = 1.0;
      if (currentMode === "Rise") { bend = 77; bend2 = -80; effectScale = 1.0; }
      syncBendSlidersToLimits();
      toggleSecondSliderUI(); toggleSizeSliderUI();
      createTextTexture(getCurrentText());
      applyManualToggleBehavior();
      updateBendLabel(); updateRangeDecor(UI.r1);
      relayoutUI();
    });
  });

  // слайдер "Сила искажения"
  UI.r1.addEventListener('input', ()=>{
    bend = +UI.r1.value;
    updateBendLabel(); updateRangeDecor(UI.r1);
  });
  attachRangeDragBehavior(UI.r1);
  attachRangeDragBehavior(UI.r2);

  // вторые диапазоны
  UI.r2.addEventListener('input', ()=>{ bend2 = +UI.r2.value; updateBendLabel(); });
  UI.size.addEventListener('input', ()=>{ effectScale = +UI.size.value; updateBendLabel(); });

  // текст/капс
  UI.text.addEventListener('input', onTextInput);
  UI.caps.addEventListener('click', ()=>{
    isCaps = !isCaps;
    refreshCapsButton();
    createTextTexture(getCurrentText());
  });
  refreshCapsButton();

  // ==== Интерлиньяж: ввод и drag ====
  UI.leadingEdit.value = formatLeadingPct(lineHeightFactor);
  UI.leadingEdit.addEventListener('input', onLeadingEdit);
  UI.leadingEdit.addEventListener('blur',  ()=> UI.leadingEdit.value = formatLeadingPct(lineHeightFactor));
  UI.leadingEdit.addEventListener('keydown', (e)=>{
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown'){
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const dir = e.key === 'ArrowUp' ? +1 : -1;
      setLeadingPercent( clampLeading( getLeadingPercent() + dir*step ) );
    }
    if (e.key === 'Enter'){ e.currentTarget.blur(); }
  });
  UI.leadingIcon?.setAttribute('draggable','false');
  UI.leadingIcon?.addEventListener('dragstart', e => e.preventDefault());
  attachLeadingDrag();

  // выключка (лево/центр/право)
  UI.alignBtns.forEach(btn=>{
    btn.addEventListener('click', ()=>{
      textAlignMode = btn.dataset.align;
      UI.align.dataset.value = textAlignMode;
      createTextTexture(getCurrentText());
    });
  });

  // тумблер
  UI.manual.addEventListener('change', applyManualToggleBehavior);

  // экспорт
  UI.exportBtn.addEventListener('click', exportDeformedSVG);

  // старт
  UI.r1.value = bend; UI.r2.value = bend2; UI.size.value = effectScale;
}

function refreshCapsButton(){
  UI.caps.textContent = isCaps ? 'TT' : 'Tt';
  UI.caps.classList.toggle('btn--active', isCaps);
}

/* ——— кастомный range: анти-лаг при драге ——— */
function attachRangeDragBehavior(rangeEl){
  if (!rangeEl) return;
  const wrap = rangeEl.closest('.range-wrap'); if (!wrap) return;
  let downX = 0, isDown = false;

  rangeEl.addEventListener('pointerdown', e => { isDown = true; downX = e.clientX||0; wrap.classList.remove('range-wrap--dragging'); });
  rangeEl.addEventListener('pointermove', e => {
    if (!isDown) return;
    if (Math.abs((e.clientX||0) - downX) > 3){ wrap.classList.add('range-wrap--dragging'); }
  });
  ['pointerup','pointercancel','pointerleave'].forEach(ev=>{
    rangeEl.addEventListener(ev, ()=>{ isDown = false; wrap.classList.remove('range-wrap--dragging'); });
  });
}
function updateRangeDecor(rangeEl){
  const wrap = rangeEl?.closest('.range-wrap'); if (!wrap) return;
  const min = +rangeEl.min, max = +rangeEl.max, val = +rangeEl.value;
  const pct = (val - min) / (max - min) * 100;
  wrap.style.setProperty('--range-fill', `${pct}%`);
}

/* ——— интерлиньяж ——— */
const LEADING_MIN = 80, LEADING_MAX = 200;
function clampLeading(p){ return Math.max(LEADING_MIN, Math.min(LEADING_MAX, p)); }
function getLeadingPercent(){ return Math.round(lineHeightFactor * 100); }
function formatLeadingPct(f){ return `${Math.round(f*100)}%`; }
function onLeadingEdit(){
  const raw = UI.leadingEdit.value.trim().replace(',', '.');
  const num = parseFloat(raw.replace('%',''));
  if (!isNaN(num)){ setLeadingPercent( clampLeading(num) ); }
}
function setLeadingPercent(pct){
  lineHeightFactor = clampLeading(pct) / 100;
  UI.leadingEdit.value = `${Math.round(lineHeightFactor*100)}%`;
  createTextTexture(getCurrentText());
}
function attachLeadingDrag(){
  if (!UI.leadingIcon) return;
  let startY = 0, startPct = getLeadingPercent(), dragging = false;

  UI.leadingIcon.addEventListener('pointerdown', (e)=>{
    e.preventDefault();
    dragging = true; startY = e.clientY||0; startPct = getLeadingPercent();
    document.body.style.userSelect = 'none';
  });
  window.addEventListener('pointermove', (e)=>{
    if (!dragging) return;
    const dy = (e.clientY||0) - startY;
    const speed = (e.shiftKey ? 4 : 1);
    const delta = Math.round(-dy / 4) * speed;
    setLeadingPercent( clampLeading(startPct + delta) );
  });
  ['pointerup','pointercancel','blur'].forEach(ev=>{
    window.addEventListener(ev, ()=>{ dragging = false; document.body.style.userSelect = ''; }, { passive:true });
  });
}

/* ——— адаптивная панель + позиция канваса ——— */
function relayoutUI(){
  const aside = document.querySelector('.panel');
  const card  = document.querySelector('.card');
  const btn   = document.querySelector('#export');
  if(!aside || !card || !btn) return;

  const cs   = getComputedStyle(document.documentElement);
  const padY = parseInt(cs.getPropertyValue('--panel-y')) || 32;

  const total = card.offsetHeight + btn.offsetHeight;
  const maxH  = window.innerHeight - padY*2;

  uiScale = Math.min(1, maxH / total);
  aside.style.transformOrigin = 'top left';
  aside.style.transform = `scale(${uiScale})`;

  const gap  = parseInt(cs.getPropertyValue('--gap')) || 32;
  const rect = aside.getBoundingClientRect();
  const cnv  = document.querySelector('canvas');
  if (cnv){
    cnv.style.left = `${Math.round(rect.left + rect.width + gap)}px`;
  }
}

function applyManualToggleBehavior(){
  const on = el('#manual-toggle').checked;
  if (on){ if (isSphereMode()){ orbitEnabled = true; dragEnabled = false; } else { orbitEnabled = false; dragEnabled = true; } }
  else { orbitEnabled = false; dragEnabled = false; }
  updateBendLabel();
}

function getCurrentText(){ const raw = el('#text')?.value ?? 'учёба\nзатянула'; return isCaps ? raw.toUpperCase() : raw; }
function getCurrentLimit(){  return MAX_DISTORTION[currentMode]  ?? 120; }
function getCurrentLimit2(){ return MAX_DISTORTION2[currentMode] ?? 0; }

function syncBendSlidersToLimits(){
  const limit1 = getCurrentLimit();
  UI.r1.min = -limit1; UI.r1.max = limit1; bend = constrain(bend, -limit1, limit1); UI.r1.value = bend; updateRangeDecor(UI.r1);

  const limit2 = getCurrentLimit2();
  UI.r2w.classList.toggle('hidden', !(limit2 > 0));
  if (limit2 > 0){ UI.r2.min = -limit2; UI.r2.max = limit2; bend2 = constrain(bend2, -limit2, limit2); UI.r2.value = bend2; }
}
function toggleSecondSliderUI(){ UI.r2w.classList.toggle('hidden', !(getCurrentLimit2() > 0)); relayoutUI(); }
function toggleSizeSliderUI(){ UI.sizew.classList.toggle('hidden', currentMode !== 'Fish'); relayoutUI(); }

function updateBendLabel(){
  const limit1 = getCurrentLimit();
  const eff1 = constrain(bend, -limit1, limit1);
  const fishNote = (currentMode === 'Fish') ? ` | size ${effectScale.toFixed(2)}` : '';
  if (getCurrentLimit2() > 0){
    const limit2 = getCurrentLimit2();
    const eff2 = constrain(bend2, -limit2, limit2);
    console.log('[distortion]', `Distortion: ${eff1.toFixed(1)} & ${eff2.toFixed(1)} | limits ${limit1}/${limit2}${fishNote} [${currentMode}]`);
  } else {
    console.log('[distortion]', `${eff1.toFixed(1)} / ${limit1} [${currentMode}]`);
  }
  console.log('[manual]', `Drag:${dragEnabled?'ON':'OFF'} / Orbit:${orbitEnabled?'ON':'OFF'}`);
}

/* ====== РЕНДЕР ====== */
function createTextTexture(str){
  let tsBase=150, ts=tsBase*scale, pad=ts*1, lines=str.split('\n'), maxTextureSize=16384;
  let g=createGraphics(10,10); g.textFont(font);
  for(let i=0;i<10;i++){
    g.textSize(ts); let maxW=0; for(const L of lines) maxW=max(maxW,g.textWidth(L));
    let wC=maxW+pad*2; if(wC<=maxTextureSize) break;
    const s=(maxTextureSize-pad*2)/maxW; ts*=max(0.5,min(1.0,s*0.98)); pad=ts*1;
  }
  let maxW=0; g.textSize(ts); for(const L of lines) maxW=max(maxW,g.textWidth(L));
  let w=min(maxW+pad*2,maxTextureSize), lineH=ts*lineHeightFactor, h=min(lines.length*lineH+pad*2,maxTextureSize);

  textImg=createGraphics(w,h); textImg.background(255,0); textImg.textFont(font); textImg.textSize(ts);
  let x;
  if (textAlignMode==='left'){ textImg.textAlign(LEFT,TOP);  x = pad; }
  else if (textAlignMode==='right'){ textImg.textAlign(RIGHT,TOP); x = w - pad; }
  else { textImg.textAlign(CENTER,TOP); x = w/2; }
  textImg.fill(0);
  for(let i=0;i<lines.length;i++){ let yTop=pad+i*lineH; textImg.text(lines[i], x, yTop); }
}
function easeInOutCubic(x){ return x<0.5 ? 4*x*x*x : 1 - pow(-2*x+2,3)/2; }
function startAnimation(){ if(!getCurrentText().trim()) return; createTextTexture(getCurrentText()); animationProgress=0; isAnimating=true; }

function draw(){
  background(240); // #f0f0f0

  if (!isSphereMode() && dragEnabled && isDraggingEffect){
    let dY=(mouseY-dragStartY)*0.5; bend=constrain(bendStart+dY,-getCurrentLimit(),getCurrentLimit());
    UI.r1.value=bend; updateRangeDecor(UI.r1); updateBendLabel();
  }

  if (isAnimating){ animationProgress+=ANIMATION_SPEED; if (animationProgress>=1.0){ animationProgress=1.0; isAnimating=false; } }

  if (textImg && textImg.width>1){
    let display_w=textImg.width/scale, display_h=textImg.height/scale;

    const cs=getComputedStyle(document.documentElement);
    const panelX=parseInt(cs.getPropertyValue('--panel-x'))||32;
    const panelW=parseInt(cs.getPropertyValue('--panel-w'))||365;
    const gap=parseInt(cs.getPropertyValue('--gap'))||32;
    const max_w=(windowWidth - (panelX+panelW+gap))*0.9;

    let view_scale=1; if(display_w>max_w){ view_scale=max_w/display_w; display_w*=view_scale; display_h*=view_scale; }

    translate(-display_w/2, -display_h/2 - 50);
    if(isSphereMode()) drawSphereMapped(display_w, display_h); else drawSheetDeform(display_w, display_h);
  }
}
function isSphereMode(){ return currentMode==='Sphere'; }

function drawSheetDeform(display_w, display_h){
  texture(textImg); textureWrap(CLAMP);
  let stepX=display_w/segments;
  const limit1=getCurrentLimit(), local1=constrain(bend,-limit1,limit1);
  const limit2=getCurrentLimit2(), local2=constrain(bend2,-limit2,limit2);

  beginShape(TRIANGLE_STRIP);
  for(let i=0;i<=segments;i++){
    const u=i/segments, targetX=i*stepX, flyFrom=display_w*1.2;
    let progress=map(animationProgress,u*ANIMATION_STAGGER,1.0,0,1); progress=constrain(progress,0,1);
    const currentX=lerp(flyFrom,targetX,easeInOutCubic(progress));
    let normX=map(currentX,0,display_w,-1,1), nx=(currentMode==="Fish")?(normX/effectScale):normX;
    let up=0,dn=0;
    if(currentMode==="Fish"){ const N=2; up=sin(nx*PI*N)*(local1/65.0); dn=sin(nx*PI*N+PI)*(local1/65.0); }
    else if(currentMode==="Flag"){ const d=sin(nx*PI)*(local1/100.0); up=dn=d; }
    else if(currentMode==="Arc"){ const d=-pow(nx,2)*(local1/80.0); up=dn=d; }
    else if(currentMode==="Rise"){ const v=applyRiseFishAI(nx,local1,local2); up=v.upper; dn=v.lower; }
    vertex(currentX, 0 - up*display_h*0.5, u,0);
    vertex(currentX, display_h - dn*display_h*0.5, u,1);
  }
  endShape();
}
function applyRiseFishAI(nx, riseB, fishH){
  const riseH=-0.50, fishV=0.10;
  const t0=(nx+1)*0.5, tRise=(t0-0.5)*(1+riseH)+0.5;
  const flagD=Math.sin(Math.PI*(tRise*2-1))*(riseB/100.0);
  const amp=(fishH/100.0);
  const up=Math.sin(2*Math.PI*(t0-0.5))*amp + fishV;
  const dn=Math.sin(2*Math.PI*(t0-0.5)+Math.PI)*amp - fishV;
  return { upper: flagD+up, lower: flagD+dn };
}
function drawSphereMapped(display_w, display_h){
  const limit=getCurrentLimit(), wrap=constrain(abs(bend)/limit,0,1);
  const baseR=Math.min(display_w,display_h)*0.5, r=baseR*lerp(SPHERE_R_MIN,SPHERE_R_MAX,wrap);
  const spanX=SPHERE_SPAN_X, spanY=SPHERE_SPAN_Y;

  push(); translate(display_w/2, display_h/2, 0);
  if(orbitEnabled){ rotateX(rotX); rotateY(rotY); }
  texture(textImg); textureWrap(CLAMP);

  beginShape(TRIANGLES);
  for(let j=0;j<SPHERE_ROWS;j++){
    const v0=j/SPHERE_ROWS, v1=(j+1)/SPHERE_ROWS, b0=(v0-0.5)*spanY, b1=(v1-0.5)*spanY;
    for(let i=0;i<SPHERE_COLS;i++){
      const u0=i/SPHERE_COLS, u1=(i+1)/SPHERE_COLS, a0=(u0-0.5)*spanX, a1=(u1-0.5)*spanX;
      const p00=spherePoint(r,a0,b0), p10=spherePoint(r,a1,b0), p01=spherePoint(r,a0,b1), p11=spherePoint(r,a1,b1);
      vertex(p00.x,p00.y,p00.z,u0,v0); vertex(p10.x,p10.y,p10.z,u1,v0); vertex(p01.x,p01.y,p01.z,u0,v1);
      vertex(p10.x,p10.y,p10.z,u1,v0); vertex(p11.x,p11.y,p11.z,u1,v1); vertex(p01.x,p01.y,p01.z,u0,v1);
    }
  }
  endShape(); pop();
}
function spherePoint(r,a,b){ const ca=cos(a), sa=sin(a), cb=cos(b), sb=sin(b); return { x:r*sa*cb, y:r*sb, z:r*ca*cb }; }

/* мышь: drag / orbit */
function mousePressed(){
  lastMouseX=mouseX; lastMouseY=mouseY;
  if(!isSphereMode() && dragEnabled && mouseX>0 && mouseY>0 && mouseX<width && mouseY<height){
    isDraggingEffect=true; dragStartY=mouseY; bendStart=bend;
  }
}
function mouseDragged(){
  if(orbitEnabled && isSphereMode()){
    const dx=mouseX-lastMouseX, dy=mouseY-lastMouseY;
    lastMouseX=mouseX; lastMouseY=mouseY;
    rotY += dx*0.01; rotX -= dy*0.01; return false;
  }
  if(!isSphereMode() && dragEnabled && isDraggingEffect) return false;
}
function mouseReleased(){ isDraggingEffect=false; }

function onTextInput(){ createTextTexture(getCurrentText()); isAnimating=false; animationProgress=1.0; }

/* ====== EXPORT SVG ====== */
/* (без изменений функционально) */
