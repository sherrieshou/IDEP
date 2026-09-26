import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const STORAGE_KEY = 'trace-spatial-prototype-v1';
const DEFAULT_COLORS = {
  research: '#dce1e3',
  exploration: '#e7e5e1',
  prototype: '#d8d6d4',
  final: '#c7c7c7'
};
const LEGACY_COLOR_MAP = {
  '#86cfdd': '#e4e7e8',
  '#93d7e2': '#dce1e3',
  '#f0c399': '#e7e5e1',
  '#bcd4b5': '#dedede',
  '#e9aebc': '#d8d6d4',
  '#c49ac7': '#c7c7c7'
};

const initialData = {
  platforms: [
    { id: 'brief', label: 'Initial brief', note: 'Starting point', depth: 'research', color: '#e4e7e8', position: [-8, -2.5, 2.5] },
    { id: 'research', label: 'AI research', note: 'Search and synthesis', depth: 'research', color: '#dce1e3', position: [-4, 3.2, -1.5] },
    { id: 'explore', label: 'Explorations', note: 'Multiple directions', depth: 'exploration', color: '#e7e5e1', position: [0, .2, 1.7] },
    { id: 'collab', label: 'Collaboration', note: 'Human and AI feedback', depth: 'exploration', color: '#dedede', position: [4.7, 3.1, -1.8] },
    { id: 'prototype', label: 'Prototype v0', note: 'Testing the direction', depth: 'prototype', color: '#d8d6d4', position: [4.4, -3.1, 1.5] },
    { id: 'final', label: 'Final direction', note: 'Selected path', depth: 'final', color: '#c7c7c7', position: [9.2, -.5, -.5] }
  ],
  connections: [
    { id: 'c1', from: 'brief', to: 'research', label: 'AI research' },
    { id: 'c2', from: 'brief', to: 'explore', label: 'Sketching' },
    { id: 'c3', from: 'research', to: 'collab', label: 'Izzy feedback' },
    { id: 'c4', from: 'explore', to: 'prototype', label: 'Prototype' },
    { id: 'c5', from: 'collab', to: 'final', label: 'Learnings merge' },
    { id: 'c6', from: 'prototype', to: 'final', label: 'User test' }
  ]
};

const dom = {
  scene: document.querySelector('#scene'),
  canvasWrap: document.querySelector('#canvas-wrap'),
  add: document.querySelector('#add-platform'),
  connect: document.querySelector('#connect-platforms'),
  connectSelected: document.querySelector('#connect-from-selected'),
  resetView: document.querySelector('#reset-view'),
  toast: document.querySelector('#connect-toast'),
  inspector: document.querySelector('#inspector'),
  empty: document.querySelector('#inspector-empty'),
  form: document.querySelector('#inspector-form'),
  connectionForm: document.querySelector('#connection-form'),
  title: document.querySelector('#selected-title'),
  swatch: document.querySelector('#selected-swatch'),
  label: document.querySelector('#platform-label'),
  note: document.querySelector('#platform-note'),
  depth: document.querySelector('#platform-depth'),
  color: document.querySelector('#platform-color'),
  connections: document.querySelector('#connection-list'),
  delete: document.querySelector('#delete-platform'),
  connectionTitle: document.querySelector('#selected-connection-title'),
  connectionLabel: document.querySelector('#connection-label'),
  connectionFrom: document.querySelector('#connection-from'),
  connectionTo: document.querySelector('#connection-to'),
  deleteConnection: document.querySelector('#delete-connection'),
  search: document.querySelector('#spatial-search'),
  searchInput: document.querySelector('#spatial-search-input'),
  searchResult: document.querySelector('#search-result'),
  searchResultTitle: document.querySelector('#search-result-title'),
  clearSearch: document.querySelector('#clear-search')
};

let data = loadData();
let selectedId = null;
let selectedConnectionId = null;
let connectMode = false;
let connectionStart = null;
let saveTimer = null;
let dragState = null;
let rewireState = null;
let focusState = null;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#ffffff');
scene.fog = new THREE.Fog('#ffffff', 32, 58);

const camera = new THREE.PerspectiveCamera(38, 1, .1, 200);
camera.position.set(2, 14, 29);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.domElement.tabIndex = 0;
dom.scene.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.inset = '0';
labelRenderer.domElement.style.pointerEvents = 'none';
dom.scene.appendChild(labelRenderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = .08;
controls.minDistance = 10;
controls.maxDistance = 55;
controls.target.set(1, 0, 0);
controls.screenSpacePanning = true;
controls.touches.ONE = THREE.TOUCH.ROTATE;
controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;

renderer.domElement.addEventListener('wheel', (event) => {
  if (focusState) clearSearchFocus();
  event.preventDefault();
  event.stopImmediatePropagation();
  const offset = camera.position.clone().sub(controls.target);
  const distance = offset.length();
  if (event.ctrlKey) {
    const nextDistance = THREE.MathUtils.clamp(distance * Math.exp(event.deltaY * .008), controls.minDistance, controls.maxDistance);
    camera.position.copy(controls.target).add(offset.normalize().multiplyScalar(nextDistance));
  } else {
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
    const scale = distance * .00115;
    const pan = right.multiplyScalar(-event.deltaX * scale).add(up.multiplyScalar(event.deltaY * scale));
    camera.position.add(pan);
    controls.target.add(pan);
  }
  controls.update();
}, { capture: true, passive: false });

scene.add(new THREE.HemisphereLight('#ffffff', '#c7c2b7', 2.1));
const keyLight = new THREE.DirectionalLight('#ffffff', 2.4);
keyLight.position.set(-5, 12, 8);
scene.add(keyLight);

const platformLayer = new THREE.Group();
const connectionLayer = new THREE.Group();
scene.add(connectionLayer, platformLayer);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const dragPlane = new THREE.Plane();
const dragIntersection = new THREE.Vector3();
const ANCHOR_POINTS = [
  new THREE.Vector3(-4.25, .16, 0),
  new THREE.Vector3(4.25, .16, 0),
  new THREE.Vector3(0, .16, -2.89),
  new THREE.Vector3(0, .16, 2.89)
];
const platformObjects = new Map();
const connectionObjects = new Map();
const researchArtifacts = [];
const movingAgents = [];
let hoveredArtifact = null;

const artifactTooltip = document.createElement('div');
artifactTooltip.className = 'artifact-tooltip';
artifactTooltip.hidden = true;
artifactTooltip.innerHTML = '<span></span><strong></strong><p></p><small></small>';
dom.canvasWrap.appendChild(artifactTooltip);

const RESEARCH_AUDIO = 'Creativity, the creative craft, is iteration. A sketch invites critique. A creative shift may emerge when a person reframes the constraints.';

function loadData() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (stored?.platforms && stored?.connections) {
      stored.platforms.forEach((platform) => {
        platform.color = LEGACY_COLOR_MAP[platform.color?.toLowerCase()] || platform.color;
      });
      return stored;
    }
  } catch (error) {
    console.warn('Could not load saved map.', error);
  }
  return structuredClone(initialData);
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(data)), 120);
}

function getPlatform(id) { return data.platforms.find((item) => item.id === id); }

function makeLabel(platform) {
  const element = document.createElement('div');
  element.className = 'platform-label';
  element.innerHTML = `<strong></strong><span></span>`;
  element.querySelector('strong').textContent = platform.label;
  element.querySelector('span').textContent = platform.note || '';
  const label = new CSS2DObject(element);
  label.position.set(0, -.28, 2.35);
  label.userData.element = element;
  return label;
}

function makeResearchTexture(kind, colors) {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 440;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f6f6f6';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#292a28';
  ctx.fillStyle = colors[0];
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (kind === 'shift') {
    ctx.globalAlpha = .88;
    ctx.beginPath();
    ctx.moveTo(70, 335);
    ctx.bezierCurveTo(180, 320, 250, 245, 305, 215);
    ctx.bezierCurveTo(380, 170, 425, 100, 565, 82);
    ctx.stroke();
    ctx.globalAlpha = .3;
    ctx.beginPath();
    ctx.moveTo(70, 335);
    ctx.bezierCurveTo(210, 365, 325, 335, 565, 350);
    ctx.stroke();
    [[70,335],[305,215],[565,82]].forEach(([x,y], i) => {
      ctx.globalAlpha = 1;
      ctx.fillStyle = colors[i % colors.length];
      ctx.beginPath(); ctx.arc(x, y, i === 1 ? 22 : 13, 0, Math.PI * 2); ctx.fill();
    });
  } else if (kind === 'frame') {
    ctx.translate(320, 220);
    [[-118,-84,236,168,0],[-83,-118,166,236,.28],[-48,-62,96,124,-.18]].forEach(([x,y,w,h,r], i) => {
      ctx.save(); ctx.rotate(r); ctx.strokeStyle = i === 2 ? colors[1] : '#292a28'; ctx.globalAlpha = .88 - i * .2;
      ctx.strokeRect(x,y,w,h); ctx.restore();
    });
    ctx.fillStyle = colors[0]; ctx.globalAlpha = .82;
    ctx.beginPath(); ctx.arc(0,0,18,0,Math.PI*2); ctx.fill();
  } else if (kind === 'iteration') {
    for (let i = 0; i < 5; i += 1) {
      const x = 82 + i * 112;
      ctx.globalAlpha = .18 + i * .17;
      ctx.fillStyle = colors[i % colors.length];
      ctx.beginPath();
      ctx.moveTo(x - 42, 290 - i * 15);
      ctx.bezierCurveTo(x - 58, 178, x + 36, 118 + i * 10, x + 44, 284 - i * 13);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = .65;
      ctx.strokeStyle = '#292a28'; ctx.stroke();
    }
  } else if (kind === 'human') {
    const nodes = [[105,280],[190,115],[285,240],[382,85],[520,220],[470,345],[255,350]];
    ctx.strokeStyle = colors[1]; ctx.globalAlpha = .42;
    [[0,1],[1,2],[2,3],[2,4],[4,5],[5,6],[6,2]].forEach(([a,b]) => {
      ctx.beginPath(); ctx.moveTo(...nodes[a]); ctx.lineTo(...nodes[b]); ctx.stroke();
    });
    nodes.forEach(([x,y], i) => {
      ctx.globalAlpha = 1; ctx.fillStyle = i % 2 ? colors[0] : colors[2];
      ctx.beginPath(); ctx.arc(x,y,i === 2 ? 28 : 14,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#292a28'; ctx.stroke();
    });
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}

function tagResearchArtifact(object, platformId, meta) {
  object.userData.platformId = platformId;
  object.userData.researchArtifact = meta;
  researchArtifacts.push(object);
  return object;
}

const SEARCH_ALIASES = {
  shift: 'direction change departure pivot creative shift 转折 转向 改变方向',
  frame: 'constraints perspective stimulus lateral thinking reframe framing 约束 重新定义 换角度 刺激',
  iteration: 'craft sketch critique revision incomplete co creation iterate 迭代 草图 批评 修改 共创',
  human: 'human loop judge meaningful novelty evaluation 人类 判断 意义 新颖 评估',
  ownership: 'authorship participation investment feedback ownership 作者 所有权 参与 反馈 归属',
  audio: 'interview voice recording listen source audio 访谈 音频 声音 录音'
};

function searchableEntries() {
  const entries = [];
  const seen = new Set();
  researchArtifacts.forEach((object) => {
    const meta = object.userData.researchArtifact;
    if (!meta || seen.has(meta.title)) return;
    seen.add(meta.title);
    const alias = Object.entries(SEARCH_ALIASES).find(([key]) => meta.title.toLowerCase().includes(key))?.[1] || '';
    entries.push({
      title: meta.title,
      text: `${meta.title} ${meta.body} ${meta.source} ${alias}`.toLowerCase(),
      object,
      distance: meta.audio ? 4.8 : 5.8
    });
  });
  data.platforms.forEach((platform) => {
    const object = platformObjects.get(platform.id)?.group;
    if (!object) return;
    entries.push({
      title: platform.label,
      text: `${platform.label} ${platform.note} ${platform.depth} platform node 节点 平台`.toLowerCase(),
      object,
      platformId: platform.id,
      distance: 11
    });
  });
  return entries;
}

function scoreSearch(entry, query) {
  const clean = query.toLowerCase().trim();
  if (!clean) return 0;
  const stopWords = new Set(['the','a','an','is','are','was','were','what','how','why','where','which','who','about','does','did','can','could','show','me','find','this','that','of','to','in','on','and','or','it','i','we','you','我','想','找','关于','什么','怎么','如何','的','是','有','可以']);
  const terms = clean.match(/[a-z0-9]+|[\u3400-\u9fff]{1,4}/g)?.filter((term) => !stopWords.has(term)) || [];
  let score = entry.text.includes(clean) ? 12 : 0;
  terms.forEach((term) => {
    if (entry.title.toLowerCase().includes(term)) score += 6;
    else if (entry.text.includes(term)) score += term.length > 2 ? 3 : 1;
  });
  return score;
}

function focusSearchResult(entry) {
  if (!entry?.object) return;
  const target = new THREE.Vector3();
  entry.object.getWorldPosition(target);
  const viewDirection = camera.position.clone().sub(controls.target).normalize();
  const offset = viewDirection.multiplyScalar(entry.distance);
  focusState = {
    object: entry.object,
    title: entry.title,
    offset,
    startPosition: camera.position.clone(),
    startTarget: controls.target.clone(),
    startedAt: performance.now(),
    duration: 900,
    animating: true
  };
  controls.enabled = false;
  dom.searchResultTitle.textContent = entry.title;
  dom.searchResult.hidden = false;
  if (entry.platformId) setSelected(entry.platformId);
}

function clearSearchFocus() {
  focusState = null;
  controls.enabled = true;
  dom.searchResult.hidden = true;
}

function runSpatialSearch(query) {
  const ranked = searchableEntries()
    .map((entry) => ({ entry, score: scoreSearch(entry, query) }))
    .sort((a, b) => b.score - a.score);
  if (!ranked[0]?.score) {
    dom.toast.textContent = 'No matching object found';
    dom.toast.classList.add('visible');
    window.setTimeout(() => dom.toast.classList.remove('visible'), 1500);
    return;
  }
  focusSearchResult(ranked[0].entry);
}

function addResearchCollage(group, platform) {
  const palette = ['#8b8b8b', '#b9b9b9', '#5e5e5e'];
  const cards = [
    { kind: 'shift', position: [-2.15, 1.35, -.25], rotation: [-.12, .1, -.08], size: [2.45, 1.68], meta: { type: 'VISUAL NOTE 01', title: 'Creative shift', body: 'A meaningful moment is the point where the designer changes direction, not only the quality of the final artifact.', source: 'Antonios Liapis interview · creative-shift evaluation' } },
    { kind: 'frame', position: [.15, 2.05, -.7], rotation: [-.06, -.16, .05], size: [2.05, 1.42], meta: { type: 'VISUAL NOTE 02', title: 'Frame and reframe', body: 'A stimulus becomes useful when it changes the constraints through which the problem is understood.', source: 'Antonios Liapis interview · lateral thinking and reframing' } },
    { kind: 'iteration', position: [2.05, 1.25, .25], rotation: [-.1, -.08, .09], size: [2.6, 1.78], meta: { type: 'VISUAL NOTE 03', title: 'Iteration is the craft', body: 'An incomplete sketch invites critique, revision, and ownership. A polished final answer often closes that loop.', source: 'Antonios Liapis interview · sketching and co-creation' } },
    { kind: 'human', position: [-.55, .78, 1.3], rotation: [-.22, .16, -.02], size: [2.25, 1.55], meta: { type: 'VISUAL NOTE 04', title: 'Human in the loop', body: 'Human interpretation is needed to judge whether novelty is meaningful and whether a contribution changed the process.', source: 'Antonios Liapis interview · human evaluation' } }
  ];

  cards.forEach((card, index) => {
    const material = new THREE.MeshBasicMaterial({
      map: makeResearchTexture(card.kind, palette),
      transparent: true,
      opacity: .92,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const mesh = tagResearchArtifact(new THREE.Mesh(new THREE.PlaneGeometry(...card.size), material), platform.id, card.meta);
    mesh.position.set(...card.position);
    mesh.rotation.set(...card.rotation);
    mesh.renderOrder = 5 + index;
    group.add(mesh);
  });

  const steppingMeta = { type: '3D OBJECT', title: 'Stepping stones', body: 'An AI suggestion can be ignored as an answer yet still become a stepping stone toward a later idea.', source: 'Antonios Liapis interview · mixed-initiative co-creativity' };
  for (let i = 0; i < 5; i += 1) {
    const stone = tagResearchArtifact(new THREE.Mesh(
      new THREE.CylinderGeometry(.22 + i * .025, .3, .12 + i * .09, 6),
      new THREE.MeshPhysicalMaterial({ color: i % 2 ? '#a9a9a9' : '#d1d1d1', roughness: .78 })
    ), platform.id, steppingMeta);
    stone.position.set(-2.25 + i * .58, .28 + i * .17, 1.25 - i * .18);
    stone.rotation.y = i * .38;
    group.add(stone);
  }

  const ownershipMeta = { type: '3D OBJECT', title: 'Ownership gap', body: 'Giving feedback can create investment without creating authorship. Participation and ownership are different.', source: 'Antonios Liapis interview · game-in-a-day study' };
  const ownership = tagResearchArtifact(new THREE.Group(), platform.id, ownershipMeta);
  const torusA = new THREE.Mesh(new THREE.TorusGeometry(.48, .075, 12, 50, Math.PI * 1.5), new THREE.MeshStandardMaterial({ color: '#676767', roughness: .55 }));
  const torusB = new THREE.Mesh(new THREE.TorusGeometry(.48, .075, 12, 50, Math.PI * 1.35), new THREE.MeshStandardMaterial({ color: '#b6b6b6', roughness: .55 }));
  torusA.rotation.x = Math.PI / 2; torusB.rotation.x = Math.PI / 2; torusB.rotation.z = Math.PI;
  torusA.position.x = -.25; torusB.position.x = .25;
  ownership.add(torusA, torusB);
  ownership.position.set(2.6, .62, -1.15);
  ownership.rotation.y = -.25;
  ownership.traverse((child) => { if (child.isMesh) { child.userData.platformId = platform.id; child.userData.researchArtifact = ownershipMeta; researchArtifacts.push(child); } });
  group.add(ownership);

  const audioMeta = { type: 'AUDIO SOURCE', title: 'Interview fragment', body: 'Click to hear a short spoken synthesis of the interview segment that anchors this visual cluster.', source: 'Antonios Liapis interview · September 21, 2026' };
  const audio = tagResearchArtifact(new THREE.Mesh(
    new THREE.SphereGeometry(.25, 28, 28),
    new THREE.MeshPhysicalMaterial({ color: '#303030', emissive: '#666666', emissiveIntensity: .18, roughness: .38 })
  ), platform.id, { ...audioMeta, audio: true });
  audio.position.set(-3.05, .48, -.95);
  audio.userData.audioPulse = true;
  group.add(audio);
  const wavePoints = Array.from({ length: 72 }, (_, i) => {
    const x = -2.75 + i * .07;
    const amplitude = .08 + .17 * Math.sin(i * .37) ** 2;
    return new THREE.Vector3(x, .48 + Math.sin(i * .92) * amplitude, -.95);
  });
  const waveform = tagResearchArtifact(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(wavePoints),
    new THREE.LineBasicMaterial({ color: '#555555', transparent: true, opacity: .72 })
  ), platform.id, audioMeta);
  group.add(waveform);
}

function addCollaborationLandscape(group, platform) {
  const accounts = [
    ['@latent_paths', 3, 'Peer'], ['@open_worlds', 8, 'Growing'], ['@agent_sketches', 5, 'Peer'],
    ['@modelgardens', 12, 'Growing'], ['@creative_eval', 6, 'Peer'], ['@worldsim_lab', 17, 'Big thinker'],
    ['@tooluse_notes', 4, 'Peer'], ['@embodiedloops', 9, 'Growing'], ['@cocreate_daily', 7, 'Growing'],
    ['@processnotoutput', 14, 'Big thinker'], ['@spatial_agents', 10, 'Growing'], ['@novelty_trails', 2, 'Peer']
  ];
  const positions = [
    [-2.5,-1.25],[-1.25,-1.65],[.05,-1.4],[1.35,-1.55],[2.5,-1.05],
    [-2.15,.05],[-.85,-.05],[.5,.1],[1.85,.15],
    [-1.5,1.25],[0,1.35],[1.55,1.15]
  ];
  accounts.forEach(([handle, replies, tier], index) => {
    const height = .24 + replies * .045;
    const shade = 0.83 - Math.min(replies, 18) * .018;
    const color = new THREE.Color(shade, shade, shade);
    const meta = {
      type: 'X ACCOUNT · SIMULATED',
      title: handle,
      body: `${replies} replies in the current observation window · ${tier} list`,
      source: 'Prototype placeholder · replace with connected X data'
    };
    const block = tagResearchArtifact(new THREE.Mesh(
      new THREE.BoxGeometry(.52, height, .52),
      new THREE.MeshPhysicalMaterial({ color, roughness: .72, metalness: .03 })
    ), platform.id, meta);
    block.position.set(positions[index][0], .18 + height / 2, positions[index][1]);
    block.rotation.y = (index % 3 - 1) * .09;
    group.add(block);

    const cap = tagResearchArtifact(new THREE.Mesh(
      new THREE.BoxGeometry(.38, .025, .38),
      new THREE.MeshBasicMaterial({ color: replies > 10 ? '#4b4b4b' : '#777777' })
    ), platform.id, meta);
    cap.position.set(block.position.x, block.position.y + height / 2 + .018, block.position.z);
    cap.rotation.y = block.rotation.y;
    group.add(cap);
  });

  const pathPoints = Array.from({ length: 96 }, (_, index) => {
    const angle = index / 96 * Math.PI * 2;
    return new THREE.Vector3(Math.cos(angle) * 3.15, .21, Math.sin(angle) * 1.95);
  });
  const path = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(pathPoints),
    new THREE.LineDashedMaterial({ color: '#8e8e8e', dashSize: .12, gapSize: .13, transparent: true, opacity: .42 })
  );
  path.computeLineDistances();
  group.add(path);

  const personMeta = {
    type: 'BACKGROUND AGENT',
    title: 'Community scout',
    body: 'A lightweight agent moves between followed accounts and observes where conversations are becoming active.',
    source: 'Prototype behavior · simulated community monitoring'
  };
  const person = new THREE.Group();
  person.userData.walkOffset = .7;
  const body = tagResearchArtifact(new THREE.Mesh(
    new THREE.CapsuleGeometry(.15, .34, 5, 12),
    new THREE.MeshStandardMaterial({ color: '#4d4d4d', roughness: .7 })
  ), platform.id, personMeta);
  body.position.y = .52;
  const head = tagResearchArtifact(new THREE.Mesh(
    new THREE.SphereGeometry(.13, 18, 18),
    new THREE.MeshStandardMaterial({ color: '#bcbcbc', roughness: .68 })
  ), platform.id, personMeta);
  head.position.y = .91;
  const leftLeg = tagResearchArtifact(new THREE.Mesh(
    new THREE.CapsuleGeometry(.045, .25, 4, 8),
    new THREE.MeshStandardMaterial({ color: '#656565', roughness: .8 })
  ), platform.id, personMeta);
  const rightLeg = leftLeg.clone();
  rightLeg.userData = { ...leftLeg.userData };
  researchArtifacts.push(rightLeg);
  leftLeg.position.set(-.07, .22, 0);
  rightLeg.position.set(.07, .22, 0);
  person.add(body, head, leftLeg, rightLeg);
  person.position.set(3.15, .13, 0);
  group.add(person);
  movingAgents.push({ group: person, leftLeg, rightLeg, radiusX: 3.15, radiusZ: 1.95, speed: .22, offset: .7 });
}

function buildPlatform(platform) {
  const group = new THREE.Group();
  group.position.fromArray(platform.position);
  group.userData.platformId = platform.id;

  const material = new THREE.MeshPhysicalMaterial({
    color: platform.color,
    transparent: true,
    opacity: .34,
    roughness: .92,
    metalness: 0,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(4.25, 4.25, .12, 80), material);
  disc.scale.z = .68;
  disc.userData.platformId = platform.id;
  group.add(disc);

  const outlineMaterial = new THREE.LineBasicMaterial({ color: new THREE.Color(platform.color).multiplyScalar(.76), transparent: true, opacity: .68 });
  const outline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(
    Array.from({ length: 96 }, (_, index) => {
      const angle = (index / 96) * Math.PI * 2;
      return new THREE.Vector3(Math.cos(angle) * 4.25, .08, Math.sin(angle) * 2.89);
    })
  ), outlineMaterial);
  outline.userData.platformId = platform.id;
  group.add(outline);

  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(.17, .17, .05, 28),
    new THREE.MeshBasicMaterial({ color: '#30302e' })
  );
  core.position.y = .1;
  core.userData.platformId = platform.id;
  group.add(core);

  const selection = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(Array.from({ length: 96 }, (_, index) => {
      const angle = (index / 96) * Math.PI * 2;
      return new THREE.Vector3(Math.cos(angle) * 4.52, .11, Math.sin(angle) * 3.07);
    })),
    new THREE.LineDashedMaterial({ color: '#555555', dashSize: .18, gapSize: .11, transparent: true, opacity: .9 })
  );
  selection.computeLineDistances();
  selection.visible = platform.id === selectedId;
  selection.userData.selectionRing = true;
  group.add(selection);

  const anchorGroup = new THREE.Group();
  const anchorPositions = [
    [-4.25, .14, 0],
    [4.25, .14, 0],
    [0, .14, -2.89],
    [0, .14, 2.89]
  ];
  anchorPositions.forEach((position, index) => {
    const anchor = new THREE.Mesh(
      new THREE.SphereGeometry(.12, 18, 18),
      new THREE.MeshBasicMaterial({ color: '#f8f6f1' })
    );
    anchor.position.fromArray(position);
    anchor.material.depthTest = false;
    anchor.renderOrder = 20;
    anchor.userData.platformId = platform.id;
    anchor.userData.anchorIndex = index;
    anchorGroup.add(anchor);
  });
  anchorGroup.visible = platform.id === selectedId || connectMode;
  group.add(anchorGroup);

  const label = makeLabel(platform);
  group.add(label);
  if (platform.id === 'research') addResearchCollage(group, platform);
  if (platform.id === 'collab') addCollaborationLandscape(group, platform);
  platformLayer.add(group);
  const artifactTargets = [];
  group.traverse((object) => { if (object.userData.researchArtifact) artifactTargets.push(object); });
  platformObjects.set(platform.id, { group, disc, outline, selection, anchorGroup, label, material, outlineMaterial, artifactTargets });
}

function clearGroup(group) {
  [...group.children].forEach((child) => {
    group.remove(child);
    child.traverse?.((object) => {
      object.geometry?.dispose?.();
      if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose?.());
      else object.material?.dispose?.();
      if (object.isCSS2DObject) object.element?.remove?.();
    });
  });
}

function renderPlatforms() {
  clearGroup(platformLayer);
  platformObjects.clear();
  researchArtifacts.length = 0;
  movingAgents.length = 0;
  data.platforms.forEach(buildPlatform);
  if (selectedId && platformObjects.has(selectedId)) {
    platformObjects.get(selectedId).selection.visible = true;
  }
}

function anchorPair(fromObject, toObject) {
  let best = null;
  ANCHOR_POINTS.forEach((fromLocal, fromIndex) => {
    const from = fromObject.localToWorld(fromLocal.clone());
    ANCHOR_POINTS.forEach((toLocal, toIndex) => {
      const to = toObject.localToWorld(toLocal.clone());
      const distance = from.distanceToSquared(to);
      if (!best || distance < best.distance) best = { from, to, fromIndex, toIndex, distance };
    });
  });
  return best;
}

function closestAnchor(object, point) {
  return ANCHOR_POINTS
    .map((local, index) => ({ index, point: object.localToWorld(local.clone()) }))
    .sort((a, b) => a.point.distanceToSquared(point) - b.point.distanceToSquared(point))[0];
}

function buildArrow(connection) {
  const fromObject = platformObjects.get(connection.from)?.group;
  const toObject = platformObjects.get(connection.to)?.group;
  if (!fromObject || !toObject) return;
  const snapped = anchorPair(fromObject, toObject);
  const from = rewireState?.connectionId === connection.id && rewireState.endpoint === 'from'
    ? rewireState.previewPoint.clone()
    : snapped.from;
  const to = rewireState?.connectionId === connection.id && rewireState.endpoint === 'to'
    ? rewireState.previewPoint.clone()
    : snapped.to;
  const delta = to.clone().sub(from);
  const midpoint = from.clone().lerp(to, .5);
  midpoint.y += Math.min(2.2, .75 + delta.length() * .08);
  midpoint.z += delta.x >= 0 ? .5 : -.5;
  const curve = new THREE.QuadraticBezierCurve3(from, midpoint, to);
  const selected = connection.id === selectedConnectionId;
  const material = new THREE.MeshBasicMaterial({ color: selected ? '#333333' : '#686868', transparent: true, opacity: selected ? 1 : .75 });
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 34, selected ? .055 : .035, 7, false), material);
  tube.userData.connectionId = connection.id;
  connectionLayer.add(tube);

  const hitTube = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 24, .18, 6, false),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  hitTube.userData.connectionId = connection.id;
  connectionLayer.add(hitTube);

  const tangent = curve.getTangent(1).normalize();
  const cone = new THREE.Mesh(new THREE.ConeGeometry(.14, .48, 16), material.clone());
  cone.position.copy(to);
  cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
  cone.userData.connectionId = connection.id;
  connectionLayer.add(cone);

  let label = null;
  if (connection.label) {
    const element = document.createElement('div');
    element.className = 'connection-label';
    element.textContent = connection.label;
    label = new CSS2DObject(element);
    label.position.copy(curve.getPoint(.5));
    label.position.y += .22;
    connectionLayer.add(label);
  }

  const handles = [];
  if (selected) {
    [['from', from], ['to', to]].forEach(([endpoint, position]) => {
      const handle = new THREE.Mesh(
        new THREE.SphereGeometry(.2, 20, 20),
        new THREE.MeshBasicMaterial({ color: '#f8f6f1', depthTest: false })
      );
      handle.position.copy(position);
      handle.renderOrder = 30;
      handle.userData.connectionId = connection.id;
      handle.userData.endpoint = endpoint;
      connectionLayer.add(handle);
      handles.push(handle);
    });
  }
  connectionObjects.set(connection.id, { tube, hitTube, cone, label, handles });
}

function renderConnections() {
  clearGroup(connectionLayer);
  connectionObjects.clear();
  data.connections.forEach(buildArrow);
}

function renderAll() {
  renderPlatforms();
  renderConnections();
  updateInspector();
}

function setSelected(id) {
  selectedId = id;
  selectedConnectionId = null;
  platformObjects.forEach(({ selection, anchorGroup, label }, platformId) => {
    selection.visible = platformId === id;
    anchorGroup.visible = connectMode || platformId === id;
    label.userData.element.classList.toggle('selected', platformId === id);
  });
  updateInspector();
  if (window.innerWidth <= 680) dom.inspector.classList.toggle('open', Boolean(id));
}

function setSelectedConnection(id) {
  selectedConnectionId = id;
  selectedId = null;
  platformObjects.forEach(({ selection, anchorGroup, label }) => {
    selection.visible = false;
    anchorGroup.visible = false;
    label.userData.element.classList.remove('selected');
  });
  renderConnections();
  updateInspector();
  if (window.innerWidth <= 680) dom.inspector.classList.toggle('open', Boolean(id));
}

function updateInspector() {
  const platform = getPlatform(selectedId);
  const connection = data.connections.find((item) => item.id === selectedConnectionId);
  dom.empty.hidden = Boolean(platform || connection);
  dom.form.hidden = !platform;
  dom.connectionForm.hidden = !connection;
  if (connection) {
    renderConnectionInspector(connection);
    return;
  }
  if (!platform) return;
  dom.title.textContent = platform.label;
  dom.swatch.style.background = platform.color;
  dom.label.value = platform.label;
  dom.note.value = platform.note || '';
  dom.depth.value = platform.depth;
  dom.color.value = platform.color;
  renderConnectionList();
}

function renderConnectionInspector(connection) {
  const from = getPlatform(connection.from);
  const to = getPlatform(connection.to);
  dom.connectionTitle.textContent = `${from?.label || 'Unknown'} → ${to?.label || 'Unknown'}`;
  dom.connectionLabel.value = connection.label || '';
  const options = data.platforms.map((platform) => {
    const option = document.createElement('option');
    option.value = platform.id;
    option.textContent = platform.label;
    return option;
  });
  dom.connectionFrom.replaceChildren(...options.map((option) => option.cloneNode(true)));
  dom.connectionTo.replaceChildren(...options.map((option) => option.cloneNode(true)));
  dom.connectionFrom.value = connection.from;
  dom.connectionTo.value = connection.to;
}

function renderConnectionList() {
  const related = data.connections.filter((connection) => connection.from === selectedId || connection.to === selectedId);
  if (!related.length) {
    dom.connections.innerHTML = '<p class="connection-empty">No connections yet.</p>';
    return;
  }
  dom.connections.replaceChildren(...related.map((connection) => {
    const outgoing = connection.from === selectedId;
    const other = getPlatform(outgoing ? connection.to : connection.from);
    const row = document.createElement('div');
    row.className = 'connection-item';
    const text = document.createElement('span');
    text.textContent = `${outgoing ? '→' : '←'} ${other?.label || 'Unknown'}`;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.setAttribute('aria-label', `Remove connection with ${other?.label || 'platform'}`);
    remove.textContent = '×';
    remove.addEventListener('click', () => {
      data.connections = data.connections.filter((item) => item.id !== connection.id);
      renderConnections();
      renderConnectionList();
      scheduleSave();
    });
    row.append(text, remove);
    return row;
  }));
}

function updateSelectedPlatform(values) {
  const platform = getPlatform(selectedId);
  if (!platform) return;
  Object.assign(platform, values);
  const object = platformObjects.get(platform.id);
  object.label.element.querySelector('strong').textContent = platform.label;
  object.label.element.querySelector('span').textContent = platform.note || '';
  object.material.color.set(platform.color);
  object.outlineMaterial.color.set(new THREE.Color(platform.color).multiplyScalar(.76));
  dom.title.textContent = platform.label;
  dom.swatch.style.background = platform.color;
  scheduleSave();
}

function addPlatform() {
  const id = `platform-${Date.now()}`;
  const depth = 'exploration';
  const spread = data.platforms.length;
  const platform = {
    id,
    label: 'New platform',
    note: 'Add an annotation',
    depth,
    color: DEFAULT_COLORS[depth],
    position: [((spread % 3) - 1) * 4, -5 + Math.floor(spread / 3) * 1.2, ((spread % 2) - .5) * 3]
  };
  data.platforms.push(platform);
  buildPlatform(platform);
  setSelected(id);
  renderConnections();
  scheduleSave();
}

function deleteSelected() {
  if (!selectedId) return;
  data.platforms = data.platforms.filter((platform) => platform.id !== selectedId);
  data.connections = data.connections.filter((connection) => connection.from !== selectedId && connection.to !== selectedId);
  selectedId = null;
  renderAll();
  scheduleSave();
}

function startConnect(fromSelected = false) {
  connectMode = true;
  connectionStart = fromSelected ? selectedId : null;
  platformObjects.forEach(({ anchorGroup }) => { anchorGroup.visible = true; });
  dom.connect.classList.add('active');
  dom.toast.textContent = connectionStart ? 'Choose the destination platform' : 'Choose the starting platform';
  dom.toast.classList.add('visible');
}

function finishConnect(targetId) {
  if (!connectionStart) {
    connectionStart = targetId;
    dom.toast.textContent = 'Choose the destination platform';
    return;
  }
  if (targetId !== connectionStart && !data.connections.some((item) => item.from === connectionStart && item.to === targetId)) {
    data.connections.push({ id: `connection-${Date.now()}`, from: connectionStart, to: targetId, label: '' });
    renderConnections();
    scheduleSave();
  }
  connectMode = false;
  connectionStart = null;
  dom.connect.classList.remove('active');
  dom.toast.classList.remove('visible');
  setSelected(targetId);
}

function setPointerRay(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
}

function platformFromPointer(event) {
  setPointerRay(event);
  const targets = [...platformObjects.values()].flatMap(({ disc, outline, anchorGroup, artifactTargets = [] }) => [disc, outline, ...anchorGroup.children, ...artifactTargets]);
  const hit = raycaster.intersectObjects(targets, false)[0];
  return hit?.object.userData.platformId || null;
}

function connectionHandleFromPointer(event) {
  setPointerRay(event);
  const handles = [...connectionObjects.values()].flatMap((objects) => objects.handles || []);
  const hit = raycaster.intersectObjects(handles, false)[0]?.object;
  return hit ? { connectionId: hit.userData.connectionId, endpoint: hit.userData.endpoint } : null;
}

function connectionFromPointer(event) {
  setPointerRay(event);
  const hitTargets = [...connectionObjects.values()].map((objects) => objects.hitTube);
  return raycaster.intersectObjects(hitTargets, false)[0]?.object.userData.connectionId || null;
}

function artifactFromPointer(event) {
  setPointerRay(event);
  raycaster.params.Line.threshold = .08;
  return raycaster.intersectObjects(researchArtifacts.filter((object) => object.isMesh || object.isLine), false)[0]?.object || null;
}

function showArtifactTooltip(event, artifact) {
  const meta = artifact?.userData.researchArtifact;
  if (!meta) {
    artifactTooltip.hidden = true;
    hoveredArtifact = null;
    renderer.domElement.style.cursor = '';
    return;
  }
  hoveredArtifact = artifact;
  artifactTooltip.querySelector('span').textContent = meta.type;
  artifactTooltip.querySelector('strong').textContent = meta.title;
  artifactTooltip.querySelector('p').textContent = meta.body;
  artifactTooltip.querySelector('small').textContent = meta.source;
  artifactTooltip.hidden = false;
  const bounds = dom.canvasWrap.getBoundingClientRect();
  const tooltipWidth = 270;
  const x = Math.min(event.clientX - bounds.left + 18, bounds.width - tooltipWidth - 16);
  const y = Math.min(event.clientY - bounds.top + 18, bounds.height - 170);
  artifactTooltip.style.transform = `translate(${Math.max(12, x)}px, ${Math.max(12, y)}px)`;
  renderer.domElement.style.cursor = meta.audio ? 'pointer' : 'help';
}

function speakResearchAudio() {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(RESEARCH_AUDIO);
  utterance.rate = .9;
  utterance.pitch = .92;
  utterance.volume = .82;
  window.speechSynthesis.speak(utterance);
  dom.toast.textContent = 'Playing interview synthesis';
  dom.toast.classList.add('visible');
  utterance.addEventListener('end', () => dom.toast.classList.remove('visible'));
}

function startRewire(event, handle) {
  const connection = data.connections.find((item) => item.id === handle.connectionId);
  if (!connection) return;
  setSelectedConnection(connection.id);
  const fromObject = platformObjects.get(connection.from)?.group;
  const toObject = platformObjects.get(connection.to)?.group;
  if (!fromObject || !toObject) return;
  const snapped = anchorPair(fromObject, toObject);
  const currentPoint = handle.endpoint === 'from' ? snapped.from : snapped.to;
  const fixedPoint = handle.endpoint === 'from' ? snapped.to : snapped.from;
  const cameraNormal = new THREE.Vector3();
  camera.getWorldDirection(cameraNormal);
  dragPlane.setFromNormalAndCoplanarPoint(cameraNormal, currentPoint);
  rewireState = {
    connectionId: connection.id,
    endpoint: handle.endpoint,
    pointerId: event.pointerId,
    previewPoint: currentPoint.clone(),
    fixedPoint: fixedPoint.clone()
  };
  platformObjects.forEach(({ anchorGroup }) => { anchorGroup.visible = true; });
  controls.enabled = false;
  renderer.domElement.setPointerCapture(event.pointerId);
  dom.toast.textContent = `Drag the ${handle.endpoint} endpoint onto a platform`;
  dom.toast.classList.add('visible');
  renderConnections();
}

function updateRewire(event) {
  setPointerRay(event);
  if (!raycaster.ray.intersectPlane(dragPlane, dragIntersection)) return;
  rewireState.previewPoint.copy(dragIntersection);
  const connection = data.connections.find((item) => item.id === rewireState.connectionId);
  const targetId = platformFromPointer(event);
  const otherId = rewireState.endpoint === 'from' ? connection?.to : connection?.from;
  if (targetId && targetId !== otherId) {
    const target = platformObjects.get(targetId)?.group;
    if (target) rewireState.previewPoint.copy(closestAnchor(target, rewireState.fixedPoint).point);
  }
  renderConnections();
}

function endRewire(event) {
  if (!rewireState || event.pointerId !== rewireState.pointerId) return false;
  const connection = data.connections.find((item) => item.id === rewireState.connectionId);
  const targetId = platformFromPointer(event);
  const otherId = rewireState.endpoint === 'from' ? connection?.to : connection?.from;
  if (connection && targetId && targetId !== otherId) connection[rewireState.endpoint] = targetId;
  if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
  rewireState = null;
  controls.enabled = true;
  platformObjects.forEach(({ anchorGroup }) => { anchorGroup.visible = false; });
  dom.toast.classList.remove('visible');
  renderConnections();
  updateInspector();
  scheduleSave();
  return true;
}

renderer.domElement.addEventListener('pointerdown', (event) => {
  if (focusState) clearSearchFocus();
  const handle = connectionHandleFromPointer(event);
  if (handle) {
    startRewire(event, handle);
    return;
  }
  const id = platformFromPointer(event);
  if (connectMode && id) {
    finishConnect(id);
    return;
  }
  if (!id) {
    const connectionId = connectionFromPointer(event);
    if (connectionId) setSelectedConnection(connectionId);
    else setSelected(null);
    return;
  }
  setSelected(id);
  const group = platformObjects.get(id).group;
  const cameraNormal = new THREE.Vector3();
  camera.getWorldDirection(cameraNormal);
  dragPlane.setFromNormalAndCoplanarPoint(cameraNormal, group.position);
  raycaster.ray.intersectPlane(dragPlane, dragIntersection);
  dragState = {
    id,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    moved: false,
    offset: group.position.clone().sub(dragIntersection)
  };
  controls.enabled = false;
  renderer.domElement.setPointerCapture(event.pointerId);
});

renderer.domElement.addEventListener('pointermove', (event) => {
  if (rewireState && event.pointerId === rewireState.pointerId) {
    updateRewire(event);
    return;
  }
  if (!dragState || event.pointerId !== dragState.pointerId) {
    showArtifactTooltip(event, artifactFromPointer(event));
    return;
  }
  artifactTooltip.hidden = true;
  const distance = Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY);
  if (distance > 3) dragState.moved = true;
  if (!dragState.moved) return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  if (!raycaster.ray.intersectPlane(dragPlane, dragIntersection)) return;
  const object = platformObjects.get(dragState.id)?.group;
  const platform = getPlatform(dragState.id);
  if (!object || !platform) return;
  object.position.copy(dragIntersection).add(dragState.offset);
  platform.position = object.position.toArray().map((value) => Number(value.toFixed(2)));
  renderConnections();
  scheduleSave();
});

function endPlatformDrag(event) {
  if (endRewire(event)) return;
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
  dragState = null;
  controls.enabled = true;
}

renderer.domElement.addEventListener('pointerup', endPlatformDrag);
renderer.domElement.addEventListener('pointercancel', endPlatformDrag);
renderer.domElement.addEventListener('pointerleave', () => showArtifactTooltip(null, null));
renderer.domElement.addEventListener('click', (event) => {
  const artifact = artifactFromPointer(event);
  if (artifact?.userData.researchArtifact?.audio) speakResearchAudio();
});

dom.add.addEventListener('click', addPlatform);
dom.delete.addEventListener('click', deleteSelected);
dom.connect.addEventListener('click', () => connectMode ? finishConnect(selectedId) : startConnect(false));
dom.connectSelected.addEventListener('click', () => startConnect(true));
dom.resetView.addEventListener('click', () => {
  clearSearchFocus();
  camera.position.set(2, 14, 29);
  controls.target.set(1, 0, 0);
  controls.update();
});
dom.label.addEventListener('input', (event) => updateSelectedPlatform({ label: event.target.value || 'Untitled platform' }));
dom.note.addEventListener('input', (event) => updateSelectedPlatform({ note: event.target.value }));
dom.depth.addEventListener('change', (event) => {
  const depth = event.target.value;
  updateSelectedPlatform({ depth, color: DEFAULT_COLORS[depth] });
  dom.color.value = DEFAULT_COLORS[depth];
});
dom.color.addEventListener('input', (event) => updateSelectedPlatform({ color: event.target.value }));
dom.connectionLabel.addEventListener('input', (event) => {
  const connection = data.connections.find((item) => item.id === selectedConnectionId);
  if (!connection) return;
  connection.label = event.target.value;
  renderConnections();
  scheduleSave();
});
dom.connectionFrom.addEventListener('change', (event) => {
  const connection = data.connections.find((item) => item.id === selectedConnectionId);
  if (!connection || event.target.value === connection.to) return renderConnectionInspector(connection);
  connection.from = event.target.value;
  renderConnections();
  renderConnectionInspector(connection);
  scheduleSave();
});
dom.connectionTo.addEventListener('change', (event) => {
  const connection = data.connections.find((item) => item.id === selectedConnectionId);
  if (!connection || event.target.value === connection.from) return renderConnectionInspector(connection);
  connection.to = event.target.value;
  renderConnections();
  renderConnectionInspector(connection);
  scheduleSave();
});
dom.deleteConnection.addEventListener('click', () => {
  if (!selectedConnectionId) return;
  data.connections = data.connections.filter((item) => item.id !== selectedConnectionId);
  selectedConnectionId = null;
  renderConnections();
  updateInspector();
  scheduleSave();
});
dom.search.addEventListener('submit', (event) => {
  event.preventDefault();
  runSpatialSearch(dom.searchInput.value);
});
dom.clearSearch.addEventListener('click', () => {
  clearSearchFocus();
  dom.searchInput.value = '';
  dom.searchInput.focus();
});

function resize() {
  const { width, height } = dom.scene.getBoundingClientRect();
  renderer.setSize(width, height, false);
  labelRenderer.setSize(width, height);
  camera.aspect = width / Math.max(height, 1);
  camera.updateProjectionMatrix();
}

new ResizeObserver(resize).observe(dom.scene);
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && focusState) clearSearchFocus();
  if (event.key === 'Escape' && connectMode) {
    connectMode = false;
    connectionStart = null;
    dom.connect.classList.remove('active');
    dom.toast.classList.remove('visible');
    platformObjects.forEach(({ anchorGroup }, id) => { anchorGroup.visible = id === selectedId; });
  }
  if (event.key === 'Escape' && rewireState) {
    rewireState = null;
    controls.enabled = true;
    platformObjects.forEach(({ anchorGroup }) => { anchorGroup.visible = false; });
    dom.toast.classList.remove('visible');
    renderConnections();
  }
  if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) deleteSelected();
  if ((event.key === 'Delete' || event.key === 'Backspace') && selectedConnectionId && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) dom.deleteConnection.click();
});

renderAll();
resize();

function animate() {
  requestAnimationFrame(animate);
  const time = performance.now() * .001;
  researchArtifacts.forEach((artifact) => {
    if (!artifact.userData.audioPulse) return;
    const pulse = 1 + Math.sin(time * 3.2) * .08;
    artifact.scale.setScalar(pulse);
    if (artifact.material?.emissiveIntensity !== undefined) artifact.material.emissiveIntensity = .28 + Math.sin(time * 3.2) * .12;
  });
  movingAgents.forEach((agent) => {
    const angle = time * agent.speed + agent.offset;
    agent.group.position.x = Math.cos(angle) * agent.radiusX;
    agent.group.position.z = Math.sin(angle) * agent.radiusZ;
    agent.group.rotation.y = -angle + Math.PI / 2;
    agent.group.position.y = .13 + Math.abs(Math.sin(time * 4.6)) * .025;
    agent.leftLeg.rotation.x = Math.sin(time * 4.6) * .48;
    agent.rightLeg.rotation.x = -Math.sin(time * 4.6) * .48;
  });
  if (focusState?.object?.parent) {
    const target = new THREE.Vector3();
    focusState.object.getWorldPosition(target);
    if (focusState.animating) {
      const elapsed = performance.now() - focusState.startedAt;
      const raw = THREE.MathUtils.clamp(elapsed / focusState.duration, 0, 1);
      const eased = 1 - Math.pow(1 - raw, 3);
      controls.target.lerpVectors(focusState.startTarget, target, eased);
      camera.position.lerpVectors(focusState.startPosition, target.clone().add(focusState.offset), eased);
      if (raw >= 1) focusState.animating = false;
    } else {
      controls.target.copy(target);
      camera.position.copy(target).add(focusState.offset);
    }
  } else if (focusState) {
    clearSearchFocus();
  }
  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}
animate();
