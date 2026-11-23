import * as THREE from 'three';

const $ = (id) => document.getElementById(id);
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const lerp = (a, b, t) => a + (b - a) * t;
const defaults = {
  vehicle: {
    paint: '#a7c96c', mass: 2050, tireRadius: 0.59, tireWidth: 0.32, finalDrive: 3.73,
    cylinders: 8, bore: 96, stroke: 92, compression: 10.2, boost: 5, cam: 42, rpmLimit: 6200, tune: 100,
    springRate: 48, compressionDamping: 2900, reboundDamping: 3900, rideHeight: 0.34, travel: 0.28, swaybar: 32
  },
  graphics: { renderScale: 1, drawDistance: 175, shadowQuality: 1, foliage: 1, textureQuality: 2, frameLimit: 60 }
};
const state = {
  vehicle: { ...defaults.vehicle },
  graphics: { ...defaults.graphics },
  mode: 'home',
  returnToDrive: false,
  paused: false,
  speed: 0,
  yaw: 0,
  rpm: 900,
  gear: 1,
  distance: 0,
  wheelSpin: 0,
  bodyPitch: 0,
  bodyRoll: 0,
  cameraMode: 0,
  lastTime: 0,
  fpsSamples: [],
  input: { left: false, right: false, throttle: false, brake: false, reverse: false, handbrake: false },
  worldReady: false
};
try {
  const saved = JSON.parse(localStorage.getItem('trailforge-save-v1') || 'null');
  if (saved?.vehicle) Object.assign(state.vehicle, saved.vehicle);
  if (saved?.graphics) Object.assign(state.graphics, saved.graphics);
} catch (error) {
  console.warn('Trailforge save could not be read:', error);
}

const renderer = new THREE.WebGLRenderer({ canvas: $('world'), antialias: true, powerPreference: 'high-performance', alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa9c5b2);
scene.fog = new THREE.Fog(0xa9c5b2, 95, 250);
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 550);
camera.position.set(0, 6, 12);
const clock = new THREE.Clock();
const hemi = new THREE.HemisphereLight(0xd9f0df, 0x4d4939, 2.0);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe7c4, 3.1);
sun.position.set(-42, 72, 35);
sun.castShadow = true;
sun.shadow.mapSize.set(1536, 1536);
sun.shadow.camera.left = -90; sun.shadow.camera.right = 90;
sun.shadow.camera.top = 90; sun.shadow.camera.bottom = -90;
sun.shadow.normalBias = 0.04;
scene.add(sun);

function terrainHeight(x, z) {
  return 0.5 * Math.sin(x * 0.035) * Math.cos(z * 0.029)
    + 0.28 * Math.sin((x + z) * 0.061)
    + 0.18 * Math.cos((x - z) * 0.083)
    + 0.08 * Math.sin(z * 0.21 + x * 0.09);
}

function makeDirtTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#806b4d';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9200; i++) {
    const light = Math.random() > .5;
    ctx.fillStyle = light ? 'rgba(192,163,119,.19)' : 'rgba(44,39,29,.23)';
    const s = Math.random() * 2.3 + .3;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, s, s);
  }
  for (let i = 0; i < 95; i++) {
    ctx.strokeStyle = 'rgba(51,43,31,.12)';
    ctx.lineWidth = Math.random() * 1.5 + .3;
    ctx.beginPath();
    const x = Math.random() * 256, y = Math.random() * 256;
    ctx.moveTo(x, y); ctx.lineTo(x + Math.random() * 18, y + Math.random() * 5);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 30);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}

const worldGroup = new THREE.Group();
scene.add(worldGroup);
const terrainGeo = new THREE.PlaneGeometry(390, 390, 110, 110);
terrainGeo.rotateX(-Math.PI / 2);
const terrainPos = terrainGeo.attributes.position;
const terrainColors = [];
for (let i = 0; i < terrainPos.count; i++) {
  const x = terrainPos.getX(i), z = terrainPos.getZ(i);
  const y = terrainHeight(x, z);
  terrainPos.setY(i, y);
  const shade = 0.94 + 0.08 * Math.sin(x * .15) * Math.cos(z * .11);
  const high = clamp((y + .6) / 2.3, 0, .42);
  terrainColors.push(.22 * shade + high * .36, .32 * shade + high * .23, .19 * shade + high * .12);
}
terrainGeo.setAttribute('color', new THREE.Float32BufferAttribute(terrainColors, 3));
terrainGeo.computeVertexNormals();
const terrain = new THREE.Mesh(terrainGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
terrain.receiveShadow = true;
worldGroup.add(terrain);

const roadPoints = [
  new THREE.Vector3(0, 0, 46), new THREE.Vector3(-25, 0, 27), new THREE.Vector3(-36, 0, 0),
  new THREE.Vector3(-25, 0, -29), new THREE.Vector3(1, 0, -43), new THREE.Vector3(28, 0, -30),
  new THREE.Vector3(39, 0, -5), new THREE.Vector3(27, 0, 25)
];
const trailCurve = new THREE.CatmullRomCurve3(roadPoints, true, 'catmullrom', .32);
const roadSamples = [];
const roadGeometry = new THREE.BufferGeometry();
const roadPositions = [], roadUVs = [], roadIndices = [], roadColors = [];
const roadSegments = 460, halfRoad = 5.4;
for (let i = 0; i <= roadSegments; i++) {
  const t = i / roadSegments;
  const p = trailCurve.getPointAt(t);
  const tangent = trailCurve.getTangentAt(t).normalize();
  const side = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
  const left = p.clone().addScaledVector(side, -halfRoad);
  const right = p.clone().addScaledVector(side, halfRoad);
  left.y = terrainHeight(left.x, left.z) + .13;
  right.y = terrainHeight(right.x, right.z) + .13;
  p.y = terrainHeight(p.x, p.z) + .14;
  roadSamples.push(p);
  roadPositions.push(left.x,left.y,left.z, right.x,right.y,right.z);
  roadUVs.push(0,t*14, 1,t*14);
  const edge = Math.abs(Math.sin(i * .37)) * .03;
  roadColors.push(.89+edge,.88+edge,.84+edge, .89+edge,.88+edge,.84+edge);
  if (i < roadSegments) {
    const a = i*2;
    roadIndices.push(a,a+2,a+1, a+1,a+2,a+3);
  }
}
roadGeometry.setAttribute('position', new THREE.Float32BufferAttribute(roadPositions,3));
roadGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(roadUVs,2));
roadGeometry.setAttribute('color', new THREE.Float32BufferAttribute(roadColors,3));
roadGeometry.setIndex(roadIndices);
roadGeometry.computeVertexNormals();
const roadTexture = makeDirtTexture();
const roadMesh = new THREE.Mesh(roadGeometry, new THREE.MeshStandardMaterial({ map: roadTexture, vertexColors: true, roughness: .96 }));
roadMesh.receiveShadow = true;
worldGroup.add(roadMesh);

const foliageGroup = new THREE.Group();
worldGroup.add(foliageGroup);
const trunkGeo = new THREE.CylinderGeometry(.12,.2,2.2,7);
const leafGeo = new THREE.ConeGeometry(1.45,3.7,7);
const trunkMat = new THREE.MeshStandardMaterial({ color: 0x594532, roughness: 1 });
const leafMats = [0x365b3c,0x426b43,0x55784a,0x2e5038].map(color => new THREE.MeshStandardMaterial({ color, roughness: 1 }));
const rockGeo = new THREE.IcosahedronGeometry(1, 1);
const rockMats = [0x6d7068,0x807d70,0x5e625e].map(color => new THREE.MeshStandardMaterial({ color, roughness: .98 }));
function roadDistance(x, z) {
  let min = Infinity;
  for (let i = 0; i < roadSamples.length; i += 5) {
    const p = roadSamples[i];
    const d = (x-p.x)*(x-p.x) + (z-p.z)*(z-p.z);
    if (d < min) min = d;
  }
  return Math.sqrt(min);
}
for (let i = 0; i < 145; i++) {
  const x = (Math.random()-.5)*300, z = (Math.random()-.5)*300;
  if (roadDistance(x,z) < 10 || Math.hypot(x,z) < 9) continue;
  const h = terrainHeight(x,z);
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(trunkGeo,trunkMat); trunk.position.y=1.05; trunk.castShadow=false; tree.add(trunk);
  const leaves = new THREE.Mesh(leafGeo,leafMats[Math.floor(Math.random()*leafMats.length)]);
  leaves.position.y=3.15; leaves.scale.setScalar(.72+Math.random()*.62); leaves.castShadow=false; tree.add(leaves);
  tree.position.set(x,h,z); tree.rotation.y=Math.random()*Math.PI*2; tree.scale.setScalar(.75+Math.random()*.8);
  foliageGroup.add(tree);
}
for (let i = 0; i < 60; i++) {
  const x=(Math.random()-.5)*180, z=(Math.random()-.5)*180;
  if (roadDistance(x,z)<8) continue;
  const rock=new THREE.Mesh(rockGeo,rockMats[Math.floor(Math.random()*rockMats.length)]);
  const s=.3+Math.random()*1.05;
  rock.position.set(x,terrainHeight(x,z)+s*.35,z); rock.scale.set(s*1.4,s*.72,s);
  rock.rotation.set(Math.random(),Math.random()*3,Math.random()); rock.castShadow=false; rock.receiveShadow=true;
  foliageGroup.add(rock);
}

const vehicleRoot = new THREE.Group();
scene.add(vehicleRoot);
const bodyMaterial = new THREE.MeshStandardMaterial({ color: state.vehicle.paint, metalness: .32, roughness: .34 });
const trimMaterial = new THREE.MeshStandardMaterial({ color: 0x171d1b, metalness: .15, roughness: .66 });
const glassMaterial = new THREE.MeshStandardMaterial({ color: 0x1e3435, metalness: .32, roughness: .16 });
const lightMaterial = new THREE.MeshStandardMaterial({ color: 0xf5e8c3, emissive: 0x9b8050, emissiveIntensity: .25 });
const tireMaterial = new THREE.MeshStandardMaterial({ color: 0x111312, roughness: .96 });
const rimMaterial = new THREE.MeshStandardMaterial({ color: 0xa9b4ae, metalness: .82, roughness: .27 });
function box(parent, size, pos, mat, cast = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
  mesh.position.set(...pos); mesh.castShadow=cast; mesh.receiveShadow=true; parent.add(mesh); return mesh;
}
function cylinder(parent, rTop, rBottom, height, pos, mat, segments=16) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop,rBottom,height,segments),mat);
  mesh.position.set(...pos); mesh.castShadow=true; parent.add(mesh); return mesh;
}
const bodyGroup = new THREE.Group();
vehicleRoot.add(bodyGroup);
box(bodyGroup,[2.12,.34,3.72],[0,-.04,0],trimMaterial);
box(bodyGroup,[1.96,.42,1.45],[0,.32,-1.05],bodyMaterial);
box(bodyGroup,[2.03,.85,1.48],[0,.72,-.08],bodyMaterial);
box(bodyGroup,[1.96,.45,1.42],[0,.38,1.28],bodyMaterial);
box(bodyGroup,[2.08,.17,1.52],[0,.61,1.27],trimMaterial);
box(bodyGroup,[2.18,.2,.18],[0,-.12,-1.93],trimMaterial);
box(bodyGroup,[2.18,.2,.18],[0,-.12,1.92],trimMaterial);
box(bodyGroup,[2.06,.14,.12],[0,.1,-1.85],trimMaterial);
box(bodyGroup,[1.86,.08,.07],[0,1.18,-.1],trimMaterial);
const windshield=box(bodyGroup,[1.72,.64,.055],[0,.79,-.86],glassMaterial,false); windshield.rotation.x=-.16;
const rearGlass=box(bodyGroup,[1.65,.58,.05],[0,.77,.67],glassMaterial,false); rearGlass.rotation.x=.15;
box(bodyGroup,[.055,.78,1.25],[-.98,.72,-.08],trimMaterial);
box(bodyGroup,[.055,.78,1.25],[.98,.72,-.08],trimMaterial);
box(bodyGroup,[.16,.18,.08],[-.82,.43,-1.79],lightMaterial,false);
box(bodyGroup,[.16,.18,.08],[.82,.43,-1.79],lightMaterial,false);
box(bodyGroup,[2.28,.25,.22],[0,-.38,-1.98],trimMaterial);
box(bodyGroup,[2.28,.25,.22],[0,-.38,1.98],trimMaterial);
box(bodyGroup,[.12,.5,.12],[-1.1,.1,-1.7],trimMaterial);
box(bodyGroup,[.12,.5,.12],[1.1,.1,-1.7],trimMaterial);
box(bodyGroup,[.12,.5,.12],[-1.1,.1,1.7],trimMaterial);
box(bodyGroup,[.12,.5,.12],[1.1,.1,1.7],trimMaterial);

const wheelGroups = [];
const wheelSpinOffsets = [0,0,0,0];
function createWheel(x, z, index) {
  const group = new THREE.Group();
  group.position.set(x,-.48,z);
  vehicleRoot.add(group);
  const radius = state.vehicle.tireRadius;
  const width = state.vehicle.tireWidth;
  const tire = new THREE.Mesh(new THREE.CylinderGeometry(radius*.87,radius*.87,width,28,1),tireMaterial);
  tire.rotation.z=Math.PI/2; tire.castShadow=true; group.add(tire);
  const sideA = new THREE.Mesh(new THREE.TorusGeometry(radius*.78,radius*.17,9,28),tireMaterial);
  sideA.rotation.y=Math.PI/2; sideA.position.x=-width*.48; group.add(sideA);
  const sideB = sideA.clone(); sideB.position.x=width*.48; group.add(sideB);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(radius*.48,radius*.48,width*1.05,16),rimMaterial);
  hub.rotation.z=Math.PI/2; group.add(hub);
  const hubCap = new THREE.Mesh(new THREE.CylinderGeometry(radius*.16,radius*.16,width*1.1,12),trimMaterial);
  hubCap.rotation.z=Math.PI/2; group.add(hubCap);
  for(let t=0;t<18;t++){
    const tread = new THREE.Mesh(new THREE.BoxGeometry(width*1.02,.075,.11),trimMaterial);
    const a=t/18*Math.PI*2;
    tread.position.set(0,Math.sin(a)*radius*.86,Math.cos(a)*radius*.86);
    tread.rotation.x=a; group.add(tread);
  }
  wheelGroups[index]=group;
}
function rebuildWheels() {
  wheelGroups.forEach(g=>{ if(g){vehicleRoot.remove(g);g.traverse(o=>{if(o.geometry)o.geometry.dispose();});} });
  wheelGroups.length=0;
  createWheel(-1.12,-1.38,0); createWheel(1.12,-1.38,1);
  createWheel(-1.12,1.38,2); createWheel(1.12,1.38,3);
}
rebuildWheels();

const shockGroup = new THREE.Group();
vehicleRoot.add(shockGroup);
function makeShock(x,z) {
  const points=[];
  for(let i=0;i<=34;i++){
    const t=i/34, a=t*Math.PI*8;
    points.push(new THREE.Vector3(x+Math.cos(a)*.09,-.12-t*.55,z+Math.sin(a)*.09));
  }
  const curve=new THREE.CatmullRomCurve3(points);
  const spring=new THREE.Mesh(new THREE.TubeGeometry(curve,60,.018,5,false),new THREE.MeshStandardMaterial({color:0xc4d1c4,metalness:.72,roughness:.35}));
  shockGroup.add(spring);
}
[[-.78,-1.33],[.78,-1.33],[-.78,1.33],[.78,1.33]].forEach(p=>makeShock(p[0],p[1]));

const spawn = trailCurve.getPointAt(.01);
const spawnTangent = trailCurve.getTangentAt(.01).normalize();
state.yaw = Math.atan2(-spawnTangent.x,-spawnTangent.z);
vehicleRoot.position.set(spawn.x,terrainHeight(spawn.x,spawn.z)+.98+state.vehicle.rideHeight,spawn.z);
vehicleRoot.rotation.y=state.yaw;

const targetCamera = new THREE.Vector3();
const lookTarget = new THREE.Vector3();
function engineStats() {
  const v=state.vehicle;
  const liters=(Math.PI/4*v.bore*v.bore*v.stroke*v.cylinders)/1e6;
  const boostFactor=1+v.boost*.042;
  const compressionFactor=clamp(v.compression/10, .78, 1.3);
  const camFactor=.88+v.cam*.0022;
  const tuneFactor=v.tune/100;
  const peakTorque=liters*88*boostFactor*compressionFactor*(.94+v.cam*.0007)*tuneFactor;
  const peakRPM=clamp(v.rpmLimit*(.43+v.cam*.0011),v.rpmLimit*.42,v.rpmLimit*.72);
  const hp=peakTorque*peakRPM/7127;
  const weight=v.mass;
  return { liters, peakTorque, peakRPM, hp, weight };
}
function torqueAt(rpm) {
  const s=engineStats();
  const width=state.vehicle.rpmLimit*.31;
  const bell=Math.exp(-Math.pow((rpm-s.peakRPM)/width,2));
  return s.peakTorque*(.48+.52*bell);
}
function hpAt(rpm) { return torqueAt(rpm)*rpm/7127; }

function setVehiclePaint() {
  bodyMaterial.color.set(state.vehicle.paint);
}
function refreshHomeStats() {
  const s=engineStats();
  $('homePower').textContent=Math.round(s.hp);
  $('homeTorque').textContent=Math.round(s.peakTorque);
  $('homeWeight').textContent=Math.round(s.weight).toLocaleString('en-US');
}
function applyGraphics() {
  const g=state.graphics;
  const dpr=Math.min((window.devicePixelRatio||1)*g.renderScale,2.1);
  renderer.setPixelRatio(dpr);
  renderer.setSize(window.innerWidth,window.innerHeight,false);
  renderer.shadowMap.enabled=g.shadowQuality>0;
  sun.castShadow=g.shadowQuality>0;
  sun.shadow.mapSize.set(g.shadowQuality>=2?2048:1024,g.shadowQuality>=2?2048:1024);
  scene.fog.far=g.drawDistance;
  scene.fog.near=g.drawDistance*.39;
  roadTexture.anisotropy=g.textureQuality>=2?renderer.capabilities.getMaxAnisotropy():1;
  foliageGroup.visible=g.foliage>0;
  foliageGroup.children.forEach((obj,i)=>{obj.visible=g.foliage===2 || g.foliage===1 && i%3!==0;});
  $('fpsText').textContent = g.frameLimit+' FPS TARGET';
}
function saveBuild(showMessage=true) {
  try {
    localStorage.setItem('trailforge-save-v1',JSON.stringify({vehicle:state.vehicle,graphics:state.graphics,savedAt:new Date().toISOString()}));
    $('saveStatus').textContent='SAVED ON DEVICE';
    if(showMessage) toast('BUILD SAVED ON THIS DEVICE');
    refreshHomeStats();
  } catch(error) {
    $('saveStatus').textContent='SAVE UNAVAILABLE';
    toast('DEVICE STORAGE IS UNAVAILABLE');
  }
}
function toast(message) {
  const el=$('toast'); el.textContent=message; el.classList.add('show');
  clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.classList.remove('show'),2100);
}

const field = (key,label,min,max,step,unit='',full=false,group='vehicle') => {
  const value=state[group][key];
  const display=(typeof value==='number'?(Number.isInteger(step)?Math.round(value):Number(value).toFixed(step<1?2:0)):value)+unit;
  return '<div class="field '+(full?'full':'')+'"><div class="field-top"><label for="f-'+key+'">'+label+'</label><output id="o-'+key+'">'+display+'</output></div><input id="f-'+key+'" type="range" min="'+min+'" max="'+max+'" step="'+step+'" value="'+value+'" data-group="'+group+'" data-key="'+key+'"></div>';
};
const selectField = (key,label,options,group='vehicle',full=false) => {
  const value=state[group][key];
  return '<div class="field '+(full?'full':'')+'"><div class="field-top"><label for="f-'+key+'">'+label+'</label></div><select id="f-'+key+'" data-group="'+group+'" data-key="'+key+'">'+options.map(o=>'<option value="'+o[0]+'" '+(String(o[0])===String(value)?'selected':'')+'>'+o[1]+'</option>').join('')+'</select></div>';
};
function renderPanel(tab='build') {
  document.querySelectorAll('.garage-tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
  let html='';
  if(tab==='build') {
    html='<div class="panel-section-title">CHASSIS & EXTERIOR <small>MODULAR BUILD</small></div><div class="field-grid">'+
      '<div class="field full"><div class="field-top"><label for="f-paint">BODY COLOUR</label><output>LIVE PREVIEW</output></div><input id="f-paint" type="color" value="'+state.vehicle.paint+'" data-group="vehicle" data-key="paint"></div>'+
      field('mass','Vehicle mass',1350,3300,10,' kg',false)+
      field('tireRadius','Tire radius',.43,.82,.01,' m')+
      field('tireWidth','Tire width',.22,.48,.01,' m')+
      field('finalDrive','Final drive ratio',2.7,5.4,.01,' : 1')+
      '</div><div class="info-strip"><strong>LIVE ENGINEERING:</strong> Tire dimensions, vehicle mass and gearing feed directly into the driving model. Save a build to keep your settings on this device.</div>';
  } else if(tab==='engine') {
    html='<div class="panel-section-title">ENGINE ARCHITECTURE <small>DESIGN YOUR POWERBAND</small></div><div class="field-grid">'+
      selectField('cylinders','Cylinder count',[[4,'Inline 4'],[6,'Inline / V6'],[8,'V8'],[10,'V10'],[12,'V12']])+
      field('bore','Cylinder bore',70,112,1,' mm')+
      field('stroke','Crank stroke',65,115,1,' mm')+
      field('compression','Compression ratio',7.5,14.5,.1,' : 1')+
      field('boost','Boost pressure',0,32,.5,' PSI')+
      field('cam','Cam aggressiveness',0,100,1,' %')+
      field('rpmLimit','Rev limiter',4200,9000,100,' RPM')+
      field('tune','ECU calibration',80,120,1,' %',true)+
      '</div><div class="metric-row"><div class="metric"><strong id="engineLiters">5.3 L</strong><small>DISPLACEMENT</small></div><div class="metric"><strong id="engineHP">350</strong><small>EST. HORSEPOWER</small></div><div class="metric"><strong id="engineTorque">480</strong><small>PEAK TORQUE NM</small></div></div>'+
      '<div class="dyno-wrap"><div class="dyno-head"><span>ENGINE DYNO</span><span id="dynoPeak">PEAK POWER</span></div><canvas id="dynoCanvas" width="620" height="220"></canvas><div class="dyno-legend"><span class="legend-hp">HORSEPOWER</span><span class="legend-torque">TORQUE</span></div></div>'+
      '<div class="info-strip"><strong>SIMULATED ENGINE:</strong> Bore, stroke, cylinder count, boost, compression, cam profile and ECU tune reshape the estimated torque and power curves. These are game-model estimates, not real engine calibration software.</div>';
  } else if(tab==='suspension') {
    html='<div class="panel-section-title">SUSPENSION GEOMETRY <small>FOUR-CORNER TUNING</small></div><div class="field-grid">'+
      field('rideHeight','Ride height / lift',.12,.75,.01,' m')+
      field('travel','Suspension travel',.12,.48,.01,' m')+
      field('springRate','Spring rate',20,100,1,' kN/m')+
      field('compressionDamping','Compression damping',600,6500,50,' N·s/m')+
      field('reboundDamping','Rebound damping',700,8000,50,' N·s/m')+
      field('swaybar','Anti-roll stiffness',0,100,1,' %',true)+
      '</div><div class="info-strip"><strong>FEEL THE DIFFERENCE:</strong> Spring rate and damping influence how quickly the body settles and how much it rolls. Ride height and travel change the visual wheel articulation and chassis clearance in this prototype.</div><div class="metric-row"><div class="metric"><strong id="suspensionTravel">'+(state.vehicle.travel*100).toFixed(0)+' cm</strong><small>TRAVEL</small></div><div class="metric"><strong id="suspensionLift">'+(state.vehicle.rideHeight*100).toFixed(0)+' cm</strong><small>RIDE HEIGHT</small></div><div class="metric"><strong id="suspensionSpring">'+state.vehicle.springRate+'</strong><small>SPRING kN/m</small></div></div>';
  } else {
    html='<div class="panel-section-title">VISUAL QUALITY <small>DEVICE PERFORMANCE</small></div><div class="field-grid">'+
      field('renderScale','Render resolution scale',.65,1.5,.05,'×',true,'graphics')+
      field('drawDistance','World draw distance',80,260,10,' m',true,'graphics')+
      selectField('shadowQuality','Shadow quality',[[0,'Off'],[1,'High'],[2,'Ultra']],'graphics')+
      selectField('foliage','Foliage density',[[0,'Off'],[1,'Balanced'],[2,'Dense']],'graphics')+
      selectField('textureQuality','Texture filtering',[[0,'Low'],[1,'High'],[2,'Ultra']],'graphics')+
      selectField('frameLimit','Frame-rate target',[[30,'30 FPS'],[60,'60 FPS']],'graphics')+
      '</div><div class="info-strip"><strong>PERFORMANCE TIP:</strong> On iPhone, start with Balanced foliage, High shadows and a render scale near 0.9×. Raise settings one at a time and watch frame rate and device temperature.</div>';
  }
  $('panelContent').innerHTML=html;
  if(tab==='engine') { updateDynoMetrics(); requestAnimationFrame(drawDyno); }
  if(tab==='suspension') updateSuspensionMetrics();
  applyGraphics();
}
function updateDynoMetrics() {
  const s=engineStats();
  if($('engineLiters')) $('engineLiters').textContent=s.liters.toFixed(1)+' L';
  if($('engineHP')) $('engineHP').textContent=Math.round(s.hp);
  if($('engineTorque')) $('engineTorque').textContent=Math.round(s.peakTorque);
  if($('dynoPeak')) $('dynoPeak').textContent='PEAK '+Math.round(s.hp)+' HP @ '+Math.round(s.peakRPM)+' RPM';
}
function updateSuspensionMetrics() {
  if($('suspensionTravel')) $('suspensionTravel').textContent=(state.vehicle.travel*100).toFixed(0)+' cm';
  if($('suspensionLift')) $('suspensionLift').textContent=(state.vehicle.rideHeight*100).toFixed(0)+' cm';
  if($('suspensionSpring')) $('suspensionSpring').textContent=state.vehicle.springRate;
}
function drawDyno() {
  const canvas=$('dynoCanvas'); if(!canvas) return;
  const ctx=canvas.getContext('2d'), w=canvas.width, h=canvas.height;
  ctx.clearRect(0,0,w,h);
  const pad={l:37,r:12,t:12,b:27}, iw=w-pad.l-pad.r, ih=h-pad.t-pad.b;
  ctx.strokeStyle='rgba(218,235,220,.12)'; ctx.lineWidth=1;
  ctx.fillStyle='#84978a'; ctx.font='11px monospace';
  for(let i=0;i<=4;i++) {
    const y=pad.t+i*ih/4;
    ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(w-pad.r,y);ctx.stroke();
    ctx.fillText(String(100-i*25)+'%',2,y+4);
  }
  for(let i=0;i<=4;i++) {
    const x=pad.l+i*iw/4;
    ctx.beginPath();ctx.moveTo(x,pad.t);ctx.lineTo(x,h-pad.b);ctx.stroke();
    ctx.fillText(String(Math.round(i*state.vehicle.rpmLimit/4)),x-14,h-7);
  }
  const maxHp=Math.max(250,engineStats().hp*1.25), maxTq=Math.max(500,engineStats().peakTorque*1.25);
  const hpPts=[], tqPts=[];
  for(let i=0;i<=100;i++) {
    const rpm= i/100*state.vehicle.rpmLimit;
    hpPts.push({x:pad.l+i/100*iw,y:pad.t+ih-(hpAt(rpm)/maxHp)*ih});
    tqPts.push({x:pad.l+i/100*iw,y:pad.t+ih-(torqueAt(rpm)/maxTq)*ih});
  }
  function line(points,color,width) {
    ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
    ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();
  }
  line(hpPts,'#ff9252',3);line(tqPts,'#8ac7ff',2.4);
}
$('panelContent').addEventListener('input',(event)=>{
  const el=event.target; if(!el.dataset.key) return;
  const group=el.dataset.group||'vehicle', key=el.dataset.key;
  const value=el.type==='color'?el.value:(el.tagName==='SELECT'?Number(el.value):Number(el.value));
  state[group][key]=value;
  const output=$('o-'+key);
  if(output) output.textContent=(key==='mass'?Math.round(value).toLocaleString('en-US'):Number(value).toFixed((key==='rideHeight'||key==='travel'||key==='tireRadius'||key==='tireWidth')?2:(key==='compression'||key==='boost'||key==='finalDrive'?1:0)))+(key==='mass'?' kg':key==='tireRadius'||key==='tireWidth'||key==='rideHeight'||key==='travel'?' m':key==='springRate'?' kN/m':key==='compression'?' : 1':key==='boost'?' PSI':key==='finalDrive'?' : 1':key==='rpmLimit'?' RPM':key==='compressionDamping'||key==='reboundDamping'?' N·s/m':key==='cam'||key==='swaybar'||key==='tune'?' %':'');
  if(key==='paint') setVehiclePaint();
  if(key==='tireRadius'||key==='tireWidth') rebuildWheels();
  if(group==='graphics') applyGraphics();
  if($('dynoCanvas')) { updateDynoMetrics(); drawDyno(); }
  if($('suspensionTravel')) updateSuspensionMetrics();
  refreshHomeStats();
  $('saveStatus').textContent='UNSAVED CHANGES';
});
$('panelContent').addEventListener('change',(event)=>{
  if(event.target.dataset.key==='shadowQuality'||event.target.dataset.key==='foliage'||event.target.dataset.key==='textureQuality'||event.target.dataset.key==='frameLimit') {
    state.graphics[event.target.dataset.key]=Number(event.target.value);applyGraphics();$('saveStatus').textContent='UNSAVED CHANGES';
  }
});

let previousPanel='build';
function openGarage() {
  state.returnToDrive=state.mode==='drive';
  state.paused=true; state.mode='garage';
  $('homeScreen').classList.add('hidden'); $('driveHud').classList.add('hidden'); $('pauseScreen').classList.add('hidden');
  $('garagePanel').classList.remove('hidden'); renderPanel(previousPanel);
}
function closeGarage() {
  $('garagePanel').classList.add('hidden');
  if(state.returnToDrive) { state.mode='drive'; state.paused=false; $('driveHud').classList.remove('hidden'); }
  else { state.mode='home'; $('homeScreen').classList.remove('hidden'); }
}
function startDrive() {
  state.mode='drive';state.paused=false;
  $('homeScreen').classList.add('hidden');$('garagePanel').classList.add('hidden');$('pauseScreen').classList.add('hidden');
  $('driveHud').classList.remove('hidden');
  toast('LOW RANGE READY — FIND YOUR LINE');
}
function pauseDrive() { state.paused=true;$('pauseScreen').classList.remove('hidden'); }
function resumeDrive() { state.paused=false;$('pauseScreen').classList.add('hidden'); }
$('driveButton').addEventListener('click',startDrive);
$('garageButton').addEventListener('click',()=>{state.mode='home';openGarage();});
$('quickTuneButton').addEventListener('click',()=>{state.mode='home';openGarage();});
$('menuButton').addEventListener('click',openGarage);
$('closeGarageButton').addEventListener('click',closeGarage);
$('pauseGarageButton').addEventListener('click',()=>{state.returnToDrive=false;closeGarage();state.mode='home';$('homeScreen').classList.remove('hidden');});
$('pauseButton').addEventListener('click',pauseDrive);
$('resumeButton').addEventListener('click',resumeDrive);
$('cameraButton').addEventListener('click',()=>{state.cameraMode=(state.cameraMode+1)%2;toast(state.cameraMode?'COCKPIT CAMERA':'CHASE CAMERA');});
$('saveButton').addEventListener('click',()=>saveBuild(true));
$('resetButton').addEventListener('click',()=>{
  Object.assign(state.vehicle,defaults.vehicle);Object.assign(state.graphics,defaults.graphics);
  setVehiclePaint();rebuildWheels();renderPanel(previousPanel);applyGraphics();refreshHomeStats();saveBuild(false);toast('DEFAULT SETUP RESTORED');
});
document.querySelectorAll('.garage-tab').forEach(button=>button.addEventListener('click',()=>{previousPanel=button.dataset.tab;renderPanel(previousPanel);}));

function setInput(name,value) { state.input[name]=value; }
document.querySelectorAll('[data-control]').forEach(button=>{
  const name=button.dataset.control;
  const down=(event)=>{event.preventDefault();setInput(name,true);button.classList.add('pressed');if(button.setPointerCapture && event.pointerId!==undefined)button.setPointerCapture(event.pointerId);};
  const up=(event)=>{event.preventDefault();setInput(name,false);button.classList.remove('pressed');};
  button.addEventListener('pointerdown',down);
  button.addEventListener('pointerup',up);
  button.addEventListener('pointercancel',up);
  button.addEventListener('lostpointercapture',up);
});
window.addEventListener('pointerup',()=>{for(const key of Object.keys(state.input))state.input[key]=false;document.querySelectorAll('[data-control]').forEach(b=>b.classList.remove('pressed'));});
window.addEventListener('blur',()=>{for(const key of Object.keys(state.input))state.input[key]=false;});
window.addEventListener('keydown',(e)=>{
  const k=e.key.toLowerCase();
  const map={arrowleft:'left',a:'left',arrowright:'right',d:'right',arrowup:'throttle',w:'throttle',arrowdown:'brake',s:'brake',shift:'handbrake',r:'reverse'};
  if(map[k]){state.input[map[k]]=true;e.preventDefault();}
  if(k==='escape'&&state.mode==='drive')pauseDrive();
});
window.addEventListener('keyup',(e)=>{
  const k=e.key.toLowerCase();
  const map={arrowleft:'left',a:'left',arrowright:'right',d:'right',arrowup:'throttle',w:'throttle',arrowdown:'brake',s:'brake',shift:'handbrake',r:'reverse'};
  if(map[k]){state.input[map[k]]=false;e.preventDefault();}
});

function updatePhysics(dt) {
  const v=state.vehicle, inp=state.input, stats=engineStats();
  const throttle=inp.throttle?1:0, reverse=inp.reverse?1:0, brake=inp.brake?1:0;
  const steer=(inp.left?-1:0)+(inp.right?1:0);
  const mph=Math.abs(state.speed)*2.23694;
  const thresholds=[0,19,34,52,72,96];
  state.gear=1;
  for(let i=1;i<thresholds.length;i++) if(mph>thresholds[i]) state.gear=i+1;
  state.gear=clamp(state.gear,1,6);
  const rpmBase=900+(mph/Math.max(.7,[3.25,2.18,1.54,1.16,.88,.69][state.gear-1]))*62*(v.finalDrive/3.73)*(.59/v.tireRadius);
  state.rpm=clamp(rpmBase+throttle*340,850,v.rpmLimit);
  const nearTrail=roadDistance(vehicleRoot.position.x,vehicleRoot.position.z);
  const baseTraction=nearTrail<6.5?.9:nearTrail<18?.7:.56;
  const tireGrip=clamp(.78+(v.tireWidth-.22)*1.2,.78,1.08);
  const traction=baseTraction*tireGrip;
  const surface=nearTrail<6.5?'PACKED DIRT':nearTrail<18?'LOOSE GRAVEL':'SOFT GROUND';
  $('surfaceValue').textContent=surface;
  $('tractionValue').textContent='GRIP '+Math.round(traction*100)+'%';
  let acceleration=0;
  const currentHP=hpAt(state.rpm);
  if(throttle) {
    const driveForce=currentHP*745.7*.82/Math.max(5,Math.abs(state.speed));
    acceleration=Math.min(traction*7.2,driveForce/v.mass);
  }
  if(reverse) acceleration-=state.speed>0?Math.min(8,state.speed*2.2+1):Math.min(3.3,Math.abs(state.speed)*1.7+1);
  if(brake) acceleration-=Math.sign(state.speed)*Math.min(11,Math.abs(state.speed)*3+1);
  if(!throttle&&!reverse&&!brake) acceleration-=Math.sign(state.speed)*Math.min(1.5,Math.abs(state.speed)*.4);
  if(inp.handbrake) acceleration-=Math.sign(state.speed)*Math.min(4,Math.abs(state.speed)*1.8);
  state.speed+=acceleration*dt;
  state.speed=clamp(state.speed,-10,55);
  const speedFactor=clamp(Math.abs(state.speed)/3.2,.12,1);
  const steerRate=(.24+Math.abs(state.speed)*.034)*(1+(inp.handbrake ? .8 : 0));
  state.yaw+=steer*steerRate*speedFactor*dt*(state.speed<-.2?-1:1);
  const forwardX=-Math.sin(state.yaw), forwardZ=-Math.cos(state.yaw);
  vehicleRoot.position.x+=forwardX*state.speed*dt;
  vehicleRoot.position.z+=forwardZ*state.speed*dt;
  vehicleRoot.position.x=clamp(vehicleRoot.position.x,-178,178);
  vehicleRoot.position.z=clamp(vehicleRoot.position.z,-178,178);
  state.distance+=Math.abs(state.speed)*dt;
  state.wheelSpin+=state.speed*dt/Math.max(.25,v.tireRadius);
  const c=Math.cos(state.yaw), s=Math.sin(state.yaw);
  const wheelGround=[];
  const wheelLocal=[[-1.12,-1.38],[1.12,-1.38],[-1.12,1.38],[1.12,1.38]];
  for(const [lx,lz] of wheelLocal) {
    const wx=vehicleRoot.position.x+lx*c+lz*s;
    const wz=vehicleRoot.position.z-lx*s+lz*c;
    wheelGround.push(terrainHeight(wx,wz));
  }
  const front=(wheelGround[0]+wheelGround[1])*.5, rear=(wheelGround[2]+wheelGround[3])*.5;
  const left=(wheelGround[0]+wheelGround[2])*.5, right=(wheelGround[1]+wheelGround[3])*.5;
  const average=wheelGround.reduce((a,b)=>a+b,0)/4;
  const springFactor=clamp(v.springRate/48,.55,1.8);
  const targetPitch=Math.atan2(front-rear,2.76)*(.78/springFactor);
  const targetRoll=Math.atan2(left-right,2.24)*(.75/springFactor)*(v.swaybar===0?1.25:1.0-v.swaybar/180);
  const damping=clamp((v.compressionDamping+v.reboundDamping)/6800,.25,2.0);
  const settle=1-Math.exp(-dt*(1.6+damping*.75));
  state.bodyPitch=lerp(state.bodyPitch,targetPitch,settle);
  state.bodyRoll=lerp(state.bodyRoll,targetRoll,settle);
  vehicleRoot.position.y=average+.98+v.rideHeight;
  vehicleRoot.rotation.set(state.bodyPitch, state.yaw, state.bodyRoll);
  wheelGround.forEach((height,i)=>{
    const localDelta=(height-average);
    wheelGroups[i].position.y=-.48+clamp(localDelta*.62,-v.travel*.48,v.travel*.48);
    wheelGroups[i].rotation.x=state.wheelSpin;
  });
  $('speedValue').textContent=Math.round(Math.abs(state.speed)*2.23694);
  $('gearValue').textContent=reverse?'R':state.speed<.5&&state.speed>-.5?'1':String(state.gear);
  $('rpmValue').textContent=Math.round(state.rpm).toLocaleString('en-US');
  $('rpmBar').style.width=(state.rpm/v.rpmLimit*100)+'%';
  $('distanceValue').textContent=(state.distance/1609.34).toFixed(2)+' MI';
}

function updateCamera(dt) {
  const yaw=state.yaw;
  if(state.cameraMode===0) {
    const local=new THREE.Vector3(0,3.55,8.2);
    local.applyAxisAngle(new THREE.Vector3(0,1,0),yaw);
    targetCamera.set(vehicleRoot.position.x+local.x,vehicleRoot.position.y+local.y,vehicleRoot.position.z+local.z);
    lookTarget.set(vehicleRoot.position.x,vehicleRoot.position.y+.45,vehicleRoot.position.z);
  } else {
    const local=new THREE.Vector3(0,.8,-.08);
    local.applyAxisAngle(new THREE.Vector3(0,1,0),yaw);
    targetCamera.set(vehicleRoot.position.x+local.x,vehicleRoot.position.y+local.y,vehicleRoot.position.z+local.z);
    const forward=new THREE.Vector3(-Math.sin(yaw),.1,-Math.cos(yaw));
    lookTarget.copy(vehicleRoot.position).addScaledVector(forward,18).add(new THREE.Vector3(0,.3,0));
  }
  const smooth=1-Math.pow(.001,dt);
  camera.position.lerp(targetCamera,smooth);
  const targetLook=lookTarget.clone();
  camera.lookAt(targetLook);
}

function resize() {
  camera.aspect=window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  applyGraphics();
}
window.addEventListener('resize',resize);
document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.mode==='drive')pauseDrive();});

function animate(time) {
  requestAnimationFrame(animate);
  const dt=Math.min(clock.getDelta(),.04);
  if(state.mode==='drive'&&!state.paused) updatePhysics(dt);
  else {
    // Keep a gentle idle RPM and a small suspension settle while viewing the build.
    state.rpm=lerp(state.rpm,900,.025);
  }
  updateCamera(dt);
  if(state.graphics.frameLimit===30 && Math.floor(time/16.67)%2===0) { renderer.render(scene,camera); }
  else if(state.graphics.frameLimit===60) renderer.render(scene,camera);
  state.fpsSamples.push(1/Math.max(dt,.001));
  if(state.fpsSamples.length>40)state.fpsSamples.shift();
  const fps=state.fpsSamples.reduce((a,b)=>a+b,0)/state.fpsSamples.length;
  if(time%900<20 && $('fpsText')) $('fpsText').textContent=Math.round(fps)+' FPS';
}
function init() {
  setVehiclePaint();applyGraphics();refreshHomeStats();
  $('statusText').textContent='WORLD READY';
  state.worldReady=true;
  requestAnimationFrame(animate);
}
init();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
}
