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

/* ====== helpers (css vars, панель/канвас) ====== */
const css = {
  getNum(name){
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return parseFloat(v || 0);
  },
  set(name, v){ document.documentElement.style.setProperty(name, String(v)); }
};

function setCanvasLeftByPanel(){
  const panelX = css.getNum('--panel-x') || 32;
  const panelW = css.getNum('--panel-w') || 365;
  const gap    = css.getNum('--gap') || 32;
  const s      = css.getNum('--panel-scale') || 1;
  const cnv = document.querySelector('canvas');
  if (cnv){
    cnv.style.left = `${panelX + panelW * s + gap}px`;
  }
}

/** Масштабируем левую панель так, чтобы между верхом/низом были одинаковые отступы, 
 *  причём ширина визуально НЕ «прыгает» между эффектами.
 *  Для расчёта высоты берём «максимальную» конфигурацию — с дополнительным слайдером. */
function fitPanelToViewport(){
  const panel = document.querySelector('.panel');
  if (!panel) return;

  // 1) временно убираем scale, чтобы измерить «натуральную» высоту
  const prevTransform = panel.style.transform;
  panel.style.transform = 'none';

  // 2) показываем оба доп. слайдера "логически", но невидимо — чтобы замерить максимум
  const ghostOn = (el)=>{
    if (!el) return null;
    const wasHidden = el.classList.contains('hidden');
    if (wasHidden) el.classList.remove('hidden');
    el.style.visibility = 'hidden';
    el.style.display = 'block';
    return ()=>{ el.style.visibility=''; el.style.display=''; if (wasHidden) el.classList.add('hidden'); };
  };
  const undo1 = ghostOn(document.querySelector('#distortion2-wrap'));
  const undo2 = ghostOn(document.querySelector('#effect-scale-wrap'));

  // 3) собственно замер
  const naturalH = panel.getBoundingClientRect().height;

  // 4) откаты временных правок
  undo1 && undo1(); undo2 && undo2();
  panel.style.transform = prevTransform;

  // 5) считаем масштаб
  const padY = css.getNum('--panel-y') || 32;
  const avail = window.innerHeight - padY*2;
  const s = Math.min(1, avail / naturalH);

  panel.style.transformOrigin = 'top left';
  panel.style.transform = `scale(${s})`;
  css.set('--panel-scale', s);

  // 6) обновляем позицию канваса
  setCanvasLeftByPanel();
}

/* ====== preload / setup ====== */
function preload(){
  font = loadFont('TT Foxford.ttf');
  opentype.load('TT Foxford.ttf', (err, f)=>{ if(!err) otFont = f; });
}
function setup(){
  setAttributes('antialias', true);
  const cnv = createCanvas(windowWidth, windowHeight, WEBGL);
  cnv.style('z-index','0');
  cnv.style('position','fixed');
  cnv.style('top','0');

  textureMode(NORMAL); noStroke();

  bindUI();
  createTextTexture(getCurrentText());
  syncBendSlidersToLimits();
  toggleSecondSliderUI();
  toggleSizeSliderUI();
  updateBendLabel();
  updateRangeDecor(UI.r1);

  // первой же отрисовкой выставим фон и геометрию
  fitPanelToViewport();
  setCanvasLeftByPanel();
}
function windowResized(){
  resizeCanvas(windowWidth, windowHeight);
  fitPanelToViewport();
}

/* ====== UI ====== */
const UI = {};
const el = q => document.querySelector(q);

function bindUI(){
  UI.effectBtns = [...document.querySelectorAll('#effect-group .pill')];
  UI.r1   = el('#distortion');
  UI.r2   = el('#distortion2');
  UI.r2w  = el('#distortion2-wrap');     // теперь под заголовком "Сила искажения"
  UI.size = el('#effect-scale');
  UI.sizew= el('#effect-scale-wrap');     // тоже под тем же заголовком

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

      // смена набора контролов не должна «подпрыгивать» ширину — масштаб не меняем,
      // но позицию канваса обновим на всякий
      setCanvasLeftByPanel();
    });
  });

  // слайдер "Сила искажения"
  UI.r1.addEventListener('input', ()=>{
    bend = +UI.r1.value;
    updateBendLabel(); updateRangeDecor(UI.r1);
  });
  attachRangeDragBehavior(UI.r1);
  attachRangeDragBehavior(UI.r2);

  // вторые диапазоны (под первым)
  UI.r2?.addEventListener('input', ()=>{ bend2 = +UI.r2.value; updateBendLabel(); });
  UI.size?.addEventListener('input', ()=>{ effectScale = +UI.size.value; updateBendLabel(); });

  // текст/капс
  UI.text.addEventListener('input', onTextInput);
  UI.caps.addEventListener('click', ()=>{
    isCaps = !isCaps;
    refreshCapsButton();
    createTextTexture(getCurrentText());
  });
  refreshCapsButton(); // начальная надпись и заливка

  // ==== Интерлиньяж: ввод и drag по иконке ====
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

  // пересчёт масштаба панели при первом рендере шрифтов/иконок
  setTimeout(fitPanelToViewport, 0);
}

function refreshCapsButton(){
  UI.caps.textContent = isCaps ? 'TT' : 'Tt';
  UI.caps.classList.toggle('btn--active', isCaps);
}

/* ——— кастомный range: отключение анимации заполнения при drag ——— */
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

/* ——— интерлиньяж как в Фигме ——— */
const LEADING_MIN = 80, LEADING_MAX = 200; // %, 0.8–2.0
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
    const delta = Math.round(-dy / 4) * speed;  // ~1% на 4px
    setLeadingPercent( clampLeading(startPct + delta) );
  });
  ['pointerup','pointercancel','blur'].forEach(ev=>{
    window.addEventListener(ev, ()=>{ dragging = false; document.body.style.userSelect = ''; }, { passive:true });
  });
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
  if (limit2 > 0){ UI.r2.min = -limit2; UI.r2.max = limit2; bend2 = constrain(bend2, -limit2, limit2); UI.r2.value = bend2; }
}
function toggleSecondSliderUI(){ 
  // показываем второй «силы искажения» только для Rise
  UI.r2w?.classList.toggle('hidden', currentMode !== 'Rise'); 
}
function toggleSizeSliderUI(){ 
  // показываем «Размер эффекта» только для Fish
  UI.sizew?.classList.toggle('hidden', currentMode !== 'Fish'); 
}

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
  // фон страницы — #F0F0F0
  background(240);

  if (!isSphereMode() && dragEnabled && isDraggingEffect){
    let dY=(mouseY-dragStartY)*0.5; bend=constrain(bendStart+dY,-getCurrentLimit(),getCurrentLimit());
    UI.r1.value=bend; updateRangeDecor(UI.r1); updateBendLabel();
  }

  if (isAnimating){ animationProgress+=ANIMATION_SPEED; if (animationProgress>=1.0){ animationProgress=1.0; isAnimating=false; } }

  if (textImg && textImg.width>1){
    let display_w=textImg.width/scale, display_h=textImg.height/scale;

    const panelX=css.getNum('--panel-x')||32;
    const panelW=css.getNum('--panel-w')||365;
    const gap   =css.getNum('--gap')||32;
    const s     =css.getNum('--panel-scale')||1;
    const leftOffset = panelX + panelW*s + gap;

    const max_w=(windowWidth - leftOffset) * 0.96; // чуть-чуть воздух
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
function exportDeformedSVG() {
  if (!otFont) { alert("Font not loaded!"); return; }

  const lines = getCurrentText().split('\n');

  const fontSize = 150;
  const pad = fontSize * 1;
  const lineHeight = fontSize * lineHeightFactor;

  const unitsPerEm = otFont.unitsPerEm || 1000;
  const ascent  = (otFont.ascender  || 0) / unitsPerEm * fontSize;

  let maxAdvance = 0;
  for (const line of lines) {
    const adv = otFont.getAdvanceWidth(line, fontSize);
    if (adv > maxAdvance) maxAdvance = adv;
  }
  const svgW = maxAdvance + pad * 2;
  const svgH = lines.length * lineHeight + pad * 2;

  // масштаб предпросмотра (как в draw)
  let display_w = textImg.width / scale;
  let display_h = textImg.height / scale;

  const panelX = css.getNum('--panel-x') || 32;
  const panelW = css.getNum('--panel-w') || 365;
  const gap    = css.getNum('--gap') || 32;
  const s      = css.getNum('--panel-scale') || 1;
  const max_w = (windowWidth - (panelX + panelW*s + gap)) * 0.96;

  let view_scale = 1;
  if (display_w > max_w) {
    view_scale = max_w / display_w;
    display_w *= view_scale;
    display_h *= view_scale;
  }

  const texW = svgW * view_scale;
  const texH = svgH * view_scale;

  const lerpN = (a, b, t) => a + (b - a) * t;
  const segLen = (x0,y0,x1,y1) => Math.hypot(x1-x0, y1-y0);
  const cubicPoint = (p0, p1, p2, p3, t) => {
    const mt = 1 - t;
    return mt*mt*mt*p0 + 3*mt*mt*t*p1 + 3*mt*t*t*p2 + t*t*t*p3;
  };
  const quadPoint = (p0, p1, p2, t) => {
    const mt = 1 - t;
    return mt*mt*p0 + 2*mt*t*p1 + t*t*p2;
  };
  const samplesForLength = (pxLenRaw, min=6, max=200) => {
    const pxLen = pxLenRaw * view_scale;
    const basePix = 6;
    return Math.max(min, Math.min(max, Math.ceil(pxLen / basePix)));
  };

  const deform2D = (x, y) => {
    const normX = map(x, 0, texW, -1, 1);
    const nx = (currentMode === "Fish") ? (normX / effectScale) : normX;

    const limit1 = getCurrentLimit();
    const local1 = Math.max(-limit1, Math.min(limit1, bend));
    const limit2 = getCurrentLimit2();
    const local2 = Math.max(-limit2, Math.min(limit2, bend2));

    let upperDist = 0, lowerDist = 0;

    if (currentMode === "Fish") {
      const N = 2;
      upperDist = Math.sin(nx * Math.PI * N) * (local1 / 65.0);
      lowerDist = Math.sin(nx * Math.PI * N + Math.PI) * (local1 / 65.0);
    } else if (currentMode === "Flag") {
      const d = Math.sin(nx * Math.PI) * (local1 / 100.0);
      upperDist = lowerDist = d;
    } else if (currentMode === "Arc") {
      const d = -Math.pow(nx, 2) * (local1 / 80.0);
      upperDist = lowerDist = d;
    } else if (currentMode === "Rise") {
      const { upper, lower } = applyRiseFishAI(nx, local1, local2);
      upperDist = upper;
      lowerDist = lower;
    }

    const yTopNew = -upperDist * texH * 0.5;
    const yBotNew =  texH - lowerDist * texH * 0.5;
    const newY = map(y, 0, texH, yTopNew, yBotNew);
    return [x, newY];
  };

  /* ---- Плоскость ---- */
  if (!isSphereMode()) {
    let svgPaths = [];
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];

      const adv = otFont.getAdvanceWidth(line, fontSize);

      let originX;
      if (textAlignMode==='left')  originX = pad;
      else if (textAlignMode==='right') originX = svgW - pad - adv;
      else originX = (svgW - adv) * 0.5;

      const originY = pad + li * lineHeight + ascent;
      const path = otFont.getPath(line, originX, originY, fontSize);

      let out = [];
      let cx = 0, cy = 0, sx = 0, sy = 0;

      const toScreen = (x,y) => [x * view_scale, y * view_scale];

      for (let i = 0; i < path.commands.length; i++) {
        const cmd = path.commands[i];

        if (cmd.type === 'M') {
          let [mx,my] = toScreen(cmd.x, cmd.y);
          [mx,my] = deform2D(mx,my);
          out.push(`M${mx},${my}`);
          cx = sx = cmd.x; cy = sy = cmd.y;

        } else if (cmd.type === 'L') {
          const x1 = cx, y1 = cy, x2 = cmd.x, y2 = cmd.y;
          const n = samplesForLength(segLen(x1,y1,x2,y2));
          for (let k = 1; k <= n; k++) {
            const t = k / n;
            let px = lerpN(x1,x2,t), py = lerpN(y1,y2,t);
            [px,py] = toScreen(px,py);
            const [dx,dy] = deform2D(px,py);
            out.push(`L${dx},${dy}`);
          }
          cx = x2; cy = y2;

        } else if (cmd.type === 'C') {
          const p0x = cx, p0y = cy;
          const p1x = cmd.x1, p1y = cmd.y1;
          const p2x = cmd.x2, p2y = cmd.y2;
          const p3x = cmd.x,  p3y = cmd.y;
          const n = samplesForLength(
            segLen(p0x,p0y,p1x,p1y) + segLen(p1x,p1y,p2x,p2y) + segLen(p2x,p2y,p3x,p3y)
          );
          for (let k = 1; k <= n; k++) {
            const t = k / n;
            let px = cubicPoint(p0x,p1x,p2x,p3x,t);
            let py = cubicPoint(p0y,p1y,p2y,p3y,t);
            [px,py] = toScreen(px,py);
            const [dx,dy] = deform2D(px,py);
            out.push(`L${dx},${dy}`);
          }
          cx = p3x; cy = p3y;

        } else if (cmd.type === 'Q') {
          const p0x = cx, p0y = cy;
          const p1x = cmd.x1, p1y = cmd.y1;
          const p2x = cmd.x,  p2y = cmd.y;
          const n = samplesForLength(segLen(p0x,p0y,p1x,p1y) + segLen(p1x,p1y,p2x,p2y));
          for (let k = 1; k <= n; k++) {
            const t = k / n;
            let px = quadPoint(p0x,p1x,p2x,t);
            let py = quadPoint(p0y,p1y,p2y,t);
            [px,py] = toScreen(px,py);
            const [dx,dy] = deform2D(px,py);
            out.push(`L${dx},${dy}`);
          }
          cx = p2x; cy = p2y;

        } else if (cmd.type === 'Z') {
          const x1 = cx, y1 = cy, x2 = sx, y2 = sy;
          const n = samplesForLength(segLen(x1,y1,x2,y2));
          for (let k = 1; k <= n; k++) {
            const t = k / n;
            let px = lerpN(x1,x2,t), py = lerpN(y1,y2,t);
            [px,py] = toScreen(px,py);
            const [dx,dy] = deform2D(px,py);
            out.push(`L${dx},${dy}`);
          }
          out.push('Z');
          cx = x2; cy = y2;
        }
      }

      svgPaths.push(`<path d="${out.join('')}" fill="black" stroke="none"/>`);
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <g transform="translate(${width/2 - texW/2}, ${height/2 - texH/2 - 50})">
        ${svgPaths.join("\n")}
      </g>
    </svg>`;

    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'deformed-text.svg';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }

  /* ---- Сфера ---- */
  const limit = getCurrentLimit();
  const wrap = constrain(Math.abs(bend) / limit, 0, 1);
  const baseR = Math.min(display_w, display_h) * 0.5;
  const r = baseR * (SPHERE_R_MIN + (SPHERE_R_MAX - SPHERE_R_MIN) * wrap);
  const spanX = SPHERE_SPAN_X, spanY = SPHERE_SPAN_Y;

  const srx = Math.sin(rotX), crx = Math.cos(rotX);
  const sry = Math.sin(rotY), cry = Math.cos(rotY);
  const rotXY = (x,y,z) => {
    let y1 = y*crx - z*srx;
    let z1 = y*srx + z*crx;
    let x1 = x;
    let x2 =  x1*cry + z1*sry;
    let z2 = -x1*sry + z1*cry;
    return [x2, y1, z2];
  };

  const FOV = Math.PI / 3;
  const CAM_Z = (height / 2) / Math.tan(FOV / 2);

  const projectSphere2D = (x, y) => {
    const u = x / (svgW * view_scale);
    const v = y / (svgH * view_scale);
    const alpha = (u - 0.5) * spanX;
    const beta  = (v - 0.5) * spanY;

    const ca = Math.cos(alpha), sa = Math.sin(alpha);
    const cb = Math.cos(beta),  sb = Math.sin(beta);

    const X = r * sa * cb;
    const Y = r * sb;
    const Z = r * ca * cb;

    const [xr, yr, zr] = rotXY(X, Y, Z);
    const s = CAM_Z / ((CAM_Z - zr) || 1e-6);
    return [xr * s, yr * s];
  };

  let svgPaths = [];
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];

    const adv = otFont.getAdvanceWidth(line, fontSize);

    let originX;
    if (textAlignMode==='left')  originX = pad;
    else if (textAlignMode==='right') originX = svgW - pad - adv;
    else originX = (svgW - adv) * 0.5;

    const originY = pad + li * lineHeight + ascent;
    const path = otFont.getPath(line, originX, originY, fontSize);

    let out = [];
    let cx = 0, cy = 0, sx = 0, sy = 0;
    const toScreen = (x,y) => [x * view_scale, y * view_scale];

    for (let i = 0; i < path.commands.length; i++) {
      const cmd = path.commands[i];

      if (cmd.type === 'M') {
        let [mx,my] = toScreen(cmd.x,cmd.y);
        [mx,my] = projectSphere2D(mx,my);
        out.push(`M${mx},${my}`);
        cx = sx = cmd.x; cy = sy = cmd.y;

      } else if (cmd.type === 'L') {
        const x1 = cx, y1 = cy, x2 = cmd.x, y2 = cmd.y;
        const n = samplesForLength(segLen(x1,y1,x2,y2));
        for (let k = 1; k <= n; k++) {
          const t = k / n;
          let px = lerpN(x1,x2,t), py = lerpN(y1,y2,t);
          [px,py] = toScreen(px,py);
          const [dx,dy] = projectSphere2D(px,py);
          out.push(`L${dx},${dy}`);
        }
        cx = x2; cy = y2;

      } else if (cmd.type === 'C') {
        const p0x = cx, p0y = cy;
        const p1x = cmd.x1, p1y = cmd.y1;
        const p2x = cmd.x2, p2y = cmd.y2;
        const p3x = cmd.x,  p3y = cmd.y;
        const n = samplesForLength(
          segLen(p0x,p0y,p1x,p1y) + segLen(p1x,p1y,p2x,p2y) + segLen(p2x,p2y,p3x,p3y)
        );
        for (let k = 1; k <= n; k++) {
          const t = k / n;
          let px = cubicPoint(p0x,p1x,p2x,p3x,t);
          let py = cubicPoint(p0y,p1y,p2y,p3y,t);
          [px,py] = toScreen(px,py);
          const [dx,dy] = projectSphere2D(px,py);
          out.push(`L${dx},${dy}`);
        }
        cx = p3x; cy = p3y;

      } else if (cmd.type === 'Q') {
        const p0x = cx, p0y = cy;
        const p1x = cmd.x1, p1y = cmd.y1;
        const p2x = cmd.x,  p2y = cmd.y;
        const n = samplesForLength(segLen(p0x,p0y,p1x,p1y) + segLen(p1x,p1y,p2x,p2y));
        for (let k = 1; k <= n; k++) {
          const t = k / n;
          let px = quadPoint(p0x,p1x,p2x,t);
          let py = quadPoint(p0y,p1y,p2y,t);
          [px,py] = toScreen(px,py);
          const [dx,dy] = projectSphere2D(px,py);
          out.push(`L${dx},${dy}`);
        }
        cx = p2x; cy = p2y;

      } else if (cmd.type === 'Z') {
        const x1 = cx, y1 = cy, x2 = sx, y2 = sy;
        const n = samplesForLength(segLen(x1,y1,x2,y2));
        for (let k = 1; k <= n; k++) {
          const t = k / n;
          let px = lerpN(x1,x2,t), py = lerpN(y1,y2,t);
          [px,py] = toScreen(px,py);
          const [dx,dy] = projectSphere2D(px,py);
          out.push(`L${dx},${dy}`);
        }
        out.push('Z');
        cx = x2; cy = y2;
      }
    }
    svgPaths.push(`<path d="${out.join('')}" fill="black" stroke="none"/>`);
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <g transform="translate(${width/2}, ${height/2 - 50})">
      ${svgPaths.join("\n")}
    </g>
  </svg>`;

  const blob = new Blob([svg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'deformed-text.svg';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
