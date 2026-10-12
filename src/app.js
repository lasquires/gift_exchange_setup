import { parseFamilies, parsePairs, assignExchange, makeTextExport } from './engine.js';
const $ = id => document.getElementById(id);
const fields = ['occasion', 'families', 'avoidPairs', 'fixedPairs', 'allowWithin', 'allowReciprocal'];
const storeKey = 'gather-give-setup-v2';
const TAU = Math.PI * 2;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const palette = ['#efc88b','#b7d5b4','#db9380','#e8deb6','#82bcae','#c5a5ba','#d7a769','#d4dcc5','#b19fc4','#a1c5d0','#f0b8a0','#cdd998'];
let pairs = null;
let people = [];
let groups = [];
let soundEnabled = true;
let previousFocus = null;
let animationId = 0;
let powerStart = 0;
let spinStart = 0;
let spinDuration = 0;
let startAngle = 0;
let endAngle = 0;
let currentAngle = 0;
let lastTick = 0;
let lastSector = -1;
let power = 0;
let revealed = 0;
let stageState = 'idle'; // idle → charging → spinning → result → done
let audioContext = null;

function safeReadSaved() {
  try {
    const data = JSON.parse(localStorage.getItem(storeKey) || 'null');
    if (!data || typeof data !== 'object') return;
    for (const name of fields) {
      if (typeof data[name] === 'string' && $(name).type !== 'checkbox') $(name).value = data[name];
      else if (typeof data[name] === 'boolean' && $(name).type === 'checkbox') $(name).checked = data[name];
    }
  } catch { /* Storage may be blocked in private mode. */ }
}
function saveSetup() {
  const data = {};
  for (const name of fields) data[name] = $(name).type === 'checkbox' ? $(name).checked : $(name).value;
  try { localStorage.setItem(storeKey, JSON.stringify(data)); } catch { /* Local-only app also works without storage. */ }
}
function message(text = '', success = false) {
  $('message').hidden = !text;
  $('message').textContent = text;
  $('message').classList.toggle('success', success);
}
function parseSetup() {
  const { families, people } = parseFamilies($('families').value);
  const avoidPairs = parsePairs($('avoidPairs').value);
  const fixedPairs = parsePairs($('fixedPairs').value);
  return { families, people, avoidPairs, fixedPairs };
}
function refreshStats() {
  try {
    const data = parseSetup();
    $('peopleCount').textContent = `${data.people.length} ${data.people.length === 1 ? 'person' : 'people'}`;
    $('avoidCount').textContent = `${data.avoidPairs.length} excluded ${data.avoidPairs.length === 1 ? 'pair' : 'pairs'}`;
    $('fixedCount').textContent = `${data.fixedPairs.length} fixed ${data.fixedPairs.length === 1 ? 'pair' : 'pairs'}`;
  } catch {
    // Invalid typing is explained on Generate; don't interrupt editing.
    $('peopleCount').textContent = 'Review entries';
  }
}
function invalidateResults() {
  if (!pairs) return;
  pairs = null;
  people = [];
  groups = [];
  $('openStageBtn').disabled = true;
  $('organizerCard').hidden = true;
  $('assignmentsPanel').hidden = true;
  $('toggleAssignments').setAttribute('aria-expanded', 'false');
  $('toggleAssignments').textContent = 'Show assignments';
  message('The setup changed. Generate fresh assignments to use the updated rules.', true);
}

function createDownload(filename, data, type) {
  const blob = new Blob([data], {type});
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
function safeFilename(name) {
  return (name || 'gift-exchange').toLowerCase().normalize('NFKD')
    .replace(/[^a-z0-9-_ ]/gi,'').trim().replace(/\s+/g,'-').slice(0,55) || 'gift-exchange';
}
function occasion() { return $('occasion').value.trim() || 'Gift Exchange'; }
function exportPairs(format) {
  if (!pairs) return;
  const name = `gift-exchange-${safeFilename(occasion())}`;
  if (format === 'txt') createDownload(`${name}.txt`, makeTextExport(pairs, occasion()), 'text/plain;charset=utf-8');
  else createDownload(`${name}.json`, JSON.stringify({occasion: occasion(), exportedAt: new Date().toISOString(), groups, assignments: pairs.map(([giver, recipient]) => ({giver, recipient}))}, null, 2), 'application/json');
}
function showMatches() {
  $('organizerCard').hidden = false;
  $('openStageBtn').disabled = false;
  $('resultsSummary').textContent = `${pairs.length} matches generated`;
  const list = $('assignmentList');
  list.replaceChildren();
  for (const [giver, recipient] of pairs) {
    const li = document.createElement('li');
    li.textContent = `${giver} → ${recipient}`;
    list.appendChild(li);
  }
}

function validateAndGenerate(event) {
  event.preventDefault();
  message();
  try {
    const setup = parseSetup();
    const result = assignExchange({
      people: setup.people, avoidPairs: setup.avoidPairs, fixedPairs: setup.fixedPairs,
      allowWithinGroup: $('allowWithin').checked,
      allowReciprocal: $('allowReciprocal').checked
    });
    people = setup.people;
    groups = setup.families;
    pairs = result;
    showMatches();
    message();
  } catch (error) {
    invalidateResults();
    message(error instanceof Error ? error.message : 'Something went wrong. Please review your setup.');
  }
}
async function importFileText(input, textarea) {
  if (!input.files?.length) return;
  try {
    const texts = await Promise.all([...input.files].map(file => {
      if (!/\.(txt|csv)$/i.test(file.name)) throw new Error('Please import a .txt or .csv file.');
      if (file.size > 1024 * 1024) throw new Error('Each import must be smaller than 1 MB.');
      return file.text();
    }));
    const toAppend = texts.join('\n').trim();
    if (toAppend) {
      textarea.value = [textarea.value.trim(), toAppend].filter(Boolean).join('\n');
      textarea.dispatchEvent(new Event('input', {bubbles: true}));
      $('advancedOptions').open = true;
    }
  } catch (error) { message(error.message); }
  finally { input.value = ''; }
}

// Accessible, deterministic landing: the precomputed recipient is the only possible result.
const wheel = $('wheel');
const ctx = wheel.getContext('2d');
function remainingPairs() { return pairs ? pairs.slice(revealed) : []; }
function currentGiver() { return remainingPairs()[0]?.[0] ?? ''; }
function currentRecipient() { return remainingPairs()[0]?.[1] ?? ''; }
function shortLabel(str, count) {
  if (count > 20) return str.split(/\s+/).slice(0,2).map(word => word[0]).join('').toUpperCase().slice(0,3);
  if (count > 11 && str.length > 11) return `${str.slice(0,9)}…`;
  if (str.length > 19) return `${str.slice(0,17)}…`;
  return str;
}
function drawWheel() {
  const bounds = wheel.getBoundingClientRect();
  const size = Math.max(220, Math.min(bounds.width || 400, bounds.height || 400));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const pixel = Math.round(size * dpr);
  if (wheel.width !== pixel || wheel.height !== pixel) { wheel.width = pixel; wheel.height = pixel; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);
  const current = remainingPairs();
  const labels = current.map(pair => pair[1]);
  const n = labels.length;
  const cx = size/2, cy = size/2, radius = size * .475;
  if (!n) {
    ctx.fillStyle = '#2f5546';
    ctx.beginPath(); ctx.arc(cx,cy,radius,0,TAU); ctx.fill();
    ctx.fillStyle = '#e9d2a1'; ctx.font = `bold ${Math.floor(size*.2)}px Georgia`;
    ctx.textAlign = 'center'; ctx.textBaseline='middle'; ctx.fillText('✳',cx,cy);
    return;
  }
  const wedge = TAU / n;
  ctx.save(); ctx.translate(cx,cy); ctx.rotate(currentAngle);
  for (let i=0; i<n; i++) {
    const first = -Math.PI/2 + i*wedge;
    const last = first+wedge;
    ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0,0,radius,first,last); ctx.closePath();
    ctx.fillStyle = palette[i%palette.length]; ctx.fill();
    ctx.lineWidth=1.2;ctx.strokeStyle='#24453699';ctx.stroke();
    const mid = first + wedge/2;
    const r = n > 24 ? radius*.78 : radius*.65;
    const fontSize = Math.max(8,Math.min(n > 20 ? 11 : 17, Math.floor(size*(n > 16 ? .025 : .043))));
    const label = shortLabel(labels[i],n);
    const x = Math.cos(mid)*r, y = Math.sin(mid)*r;
    ctx.save(); ctx.translate(x,y);
    let rotation=mid+Math.PI/2;
    if (rotation > Math.PI/2 && rotation < 3*Math.PI/2) rotation += Math.PI;
    ctx.rotate(rotation);
    ctx.font = `700 ${fontSize}px system-ui,sans-serif`;
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#23473b';
    ctx.fillText(label,0,0,radius*.9);
    ctx.restore();
  }
  ctx.restore();
  ctx.beginPath();ctx.arc(cx,cy,radius,0,TAU);ctx.strokeStyle='#ecd9ac';ctx.lineWidth=Math.max(5,size*.02);ctx.stroke();
  ctx.beginPath();ctx.arc(cx,cy,radius*.96,0,TAU);ctx.strokeStyle='#26443655';ctx.lineWidth=2;ctx.stroke();
}
function updateProgress() {
  $('progressText').textContent = `${revealed} of ${pairs?.length || 0} revealed`;
  $('progressFill').style.width = `${pairs ? revealed / pairs.length * 100 : 0}%`;
  $('stageStep').textContent = pairs ? `Pair ${Math.min(revealed + 1, pairs.length)} of ${pairs.length}` : '';
}
function setStageState(next) {
  stageState = next;
  $('powerWrap').hidden = next !== 'charging';
  const action = $('spinAction');
  action.disabled = false;
  if (next === 'idle') {
    $('stageTitle').textContent = 'Giver';
    $('giverDisplay').textContent = currentGiver();
    $('stageInstruction').textContent = 'Start the spin';
    action.textContent = 'Charge';
  } else if (next === 'charging') {
    $('stageInstruction').textContent = 'Press Spin to lock power';
    action.textContent = 'Spin';
  } else if (next === 'spinning') {
    $('stageInstruction').textContent = 'Spinning';
    action.textContent = 'Skip';
  } else if (next === 'result') {
    $('stageInstruction').textContent = '';
    action.textContent = revealed + 1 === pairs.length ? 'Finish' : 'Next';
  } else if (next === 'done') {
    $('stageStep').textContent = `${pairs.length} of ${pairs.length}`;
    $('stageTitle').textContent = 'Complete';
    $('giverDisplay').textContent = 'All matches revealed';
    $('stageInstruction').textContent = '';
    action.textContent = 'Replay';
  }
}
function openStage() {
  if (!pairs) return;
  previousFocus = document.activeElement;
  revealed=0;currentAngle=0;lastSector=-1;
  $('stageOccasion').textContent = occasion();
  $('stage').hidden = false;
  document.body.classList.add('stage-open');
  $('resultOverlay').hidden = true;
  setStageState('idle');
  updateProgress();
  requestAnimationFrame(drawWheel);
  $('spinAction').focus();
}
function closeStage() {
  cancelAnimationFrame(animationId);
  animationId=0;
  $('stage').hidden=true;
  document.body.classList.remove('stage-open');
  $('resultOverlay').hidden=true;
  if (document.fullscreenElement === $('stage')) document.exitFullscreen().catch(()=>{});
  if (previousFocus?.focus) previousFocus.focus();
}
function chargeFrame(now) {
  if (stageState !== 'charging') return;
  const phase = ((now-powerStart)*.0008)%2;
  power = Math.round((phase<=1 ? phase : 2-phase)*100);
  $('powerReadout').textContent=`${power}%`;
  $('powerFill').style.width=`${power}%`;
  $('powerDot').style.left=`${power}%`;
  animationId=requestAnimationFrame(chargeFrame);
}
function beginCharge() {
  setStageState('charging');
  powerStart=performance.now();
  power=0;
  animationId=requestAnimationFrame(chargeFrame);
}
function tickSound() {
  if (!soundEnabled) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') audioContext.resume();
    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type='sine';oscillator.frequency.setValueAtTime(770,now);
    oscillator.frequency.exponentialRampToValueAtTime(450,now+.05);
    gain.gain.setValueAtTime(.001,now);
    gain.gain.exponentialRampToValueAtTime(.035,now+.004);
    gain.gain.exponentialRampToValueAtTime(.001,now+.06);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(now);oscillator.stop(now+.065);
  } catch { /* Silent fallback on devices without WebAudio. */ }
}
function animateSpin(now) {
  if (stageState !== 'spinning') return;
  const progress = Math.min(1,(now-spinStart)/spinDuration);
  const ease = 1-Math.pow(1-progress,5);
  currentAngle = startAngle + (endAngle-startAngle)*ease;
  const count = remainingPairs().length;
  const sector = Math.floor(((TAU-(currentAngle%TAU))%TAU)/(TAU/count));
  if (sector!==lastSector && now-lastTick>70) { tickSound();lastTick=now; }
  lastSector=sector;
  drawWheel();
  if (progress>=1) finishSpin();
  else animationId=requestAnimationFrame(animateSpin);
}
function beginSpin() {
  cancelAnimationFrame(animationId);
  const current = remainingPairs();
  const count = current.length;
  const targetIndex = current.findIndex(pair=>pair[1]===currentRecipient());
  if (count < 1 || targetIndex < 0) return;
  const slice = TAU/count;
  const target = (TAU - (targetIndex+.5)*slice)%TAU;
  const normalized = ((currentAngle%TAU)+TAU)%TAU;
  const forward = (target-normalized+TAU)%TAU;
  startAngle = currentAngle;
  endAngle = startAngle+(reduceMotion.matches?0:TAU*(4+Math.floor(power/32)))+forward;
  spinDuration = reduceMotion.matches ? 1 : 3300+Math.floor(power*16);
  spinStart = performance.now();
  lastSector=-1;
  setStageState('spinning');
  animationId=requestAnimationFrame(animateSpin);
}
function finishSpin() {
  cancelAnimationFrame(animationId);
  currentAngle=endAngle;
  drawWheel();
  setStageState('result');
  $('resultGiver').textContent=currentGiver();
  $('resultRecipient').textContent=currentRecipient();
  $('resultOverlay').hidden=false;
  tickSound();
  $('spinAction').focus();
}
function nextReveal() {
  $('resultOverlay').hidden=true;
  revealed++;
  updateProgress();
  if (revealed>=pairs.length) {
    setStageState('done');
  } else {
    currentAngle=0;
    setStageState('idle');
  }
  drawWheel();
}
function stageAction() {
  if ($('stage').hidden) return;
  if (stageState === 'idle') beginCharge();
  else if (stageState === 'charging') beginSpin();
  else if (stageState === 'spinning') finishSpin();
  else if (stageState === 'result') nextReveal();
  else if (stageState === 'done') { revealed=0; currentAngle=0; updateProgress(); setStageState('idle'); drawWheel(); }
}
function toggleFullscreen() {
  if ($('stage').hidden) return;
  if (document.fullscreenElement) document.exitFullscreen().catch(()=>{});
  else $('stage').requestFullscreen?.().catch(()=>{});
}

safeReadSaved();
refreshStats();
for (const name of fields) {
  $(name).addEventListener('input', () => { saveSetup();refreshStats();invalidateResults(); });
  $(name).addEventListener('change', () => { saveSetup();refreshStats();invalidateResults(); });
}
$('exchangeForm').addEventListener('submit', validateAndGenerate);
$('exampleBtn').addEventListener('click', () => {
  $('occasion').value='The Family Gift Exchange';
  $('families').value='Andersons: Harper, Owen, Mia\nParkers: Emma, Noah, Ava\nRiveras: Luca, Sofia, Mateo';
  $('avoidPairs').value='';$('fixedPairs').value='';
  $('allowWithin').checked=false;$('allowReciprocal').checked=false;
  saveSetup();refreshStats();invalidateResults();message();
});
$('clearBtn').addEventListener('click', () => {
  const any = fields.some(name => $(name).type==='checkbox' ? $(name).checked : Boolean($(name).value.trim()));
  if (any && !confirm('Clear the current setup and all generated matches?')) return;
  for (const name of fields) { if ($(name).type==='checkbox') $(name).checked=false; else $(name).value=''; }
  invalidateResults();saveSetup();refreshStats();message();
});
$('avoidFile').addEventListener('change',()=>importFileText($('avoidFile'),$('avoidPairs')));
$('fixedFile').addEventListener('change',()=>importFileText($('fixedFile'),$('fixedPairs')));
$('toggleAssignments').addEventListener('click',()=>{
  const show=$('assignmentsPanel').hidden;
  $('assignmentsPanel').hidden=!show;
  $('toggleAssignments').setAttribute('aria-expanded',String(show));
  $('toggleAssignments').textContent=show?'Hide assignments':'Show assignments';
});
$('exportText').addEventListener('click',()=>exportPairs('txt'));
$('exportJson').addEventListener('click',()=>exportPairs('json'));
$('openStageBtn').addEventListener('click',openStage);
$('closeStageBtn').addEventListener('click',closeStage);
$('spinAction').addEventListener('click',stageAction);
wheel.addEventListener('click',stageAction);
$('fullscreenBtn').addEventListener('click',toggleFullscreen);
$('soundBtn').addEventListener('click',()=>{
  soundEnabled=!soundEnabled;
  $('soundBtn').setAttribute('aria-pressed',String(soundEnabled));
  $('soundBtn').innerHTML=soundEnabled?'♫ <span>Sound on</span>':'♪ <span>Sound off</span>';
});
window.addEventListener('keydown', event=>{
  if ($('stage').hidden) return;
  if (event.key==='Escape') { event.preventDefault();closeStage();return; }
  if (event.key.toLowerCase()==='f' && !event.repeat && !event.altKey && !event.ctrlKey && !event.metaKey) {
    event.preventDefault();toggleFullscreen();return;
  }
  if (event.code==='Space' && !event.repeat) {
    const tag=event.target?.tagName;
    if (['BUTTON','INPUT','TEXTAREA','SELECT','A'].includes(tag)) return;
    event.preventDefault();stageAction();
  }
});
window.addEventListener('resize',()=>{if (!$('stage').hidden) drawWheel();});
if ('serviceWorker' in navigator && (location.protocol==='https:' || location.hostname==='localhost')) {
  window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(()=>{}));
}
