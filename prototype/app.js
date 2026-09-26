import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const STORAGE_KEY = 'trace-spatial-prototype-v1';
const DEFAULT_COLORS = {
  research: '#93d7e2',
  exploration: '#f0c399',
  prototype: '#e9aebc',
  final: '#c49ac7'
};

const initialData = {
  platforms: [
    { id: 'brief', label: 'Initial brief', note: 'Starting point', depth: 'research', color: '#86cfdd', position: [-8, -2.5, 2.5] },
    { id: 'research', label: 'AI research', note: 'Search and synthesis', depth: 'research', color: '#93d7e2', position: [-4, 3.2, -1.5] },
    { id: 'explore', label: 'Explorations', note: 'Multiple directions', depth: 'exploration', color: '#f0c399', position: [0, .2, 1.7] },
    { id: 'collab', label: 'Collaboration', note: 'Human and AI feedback', depth: 'exploration', color: '#bcd4b5', position: [4.7, 3.1, -1.8] },
    { id: 'prototype', label: 'Prototype v0', note: 'Testing the direction', depth: 'prototype', color: '#e9aebc', position: [4.4, -3.1, 1.5] },
    { id: 'final', label: 'Final direction', note: 'Selected path', depth: 'final', color: '#c49ac7', position: [9.2, -.5, -.5] }
  ],
  connections: [
    { id: 'c1', from: 'brief', to: 'research' },
    { id: 'c2', from: 'brief', to: 'explore' },
    { id: 'c3', from: 'research', to: 'collab' },
    { id: 'c4', from: 'explore', to: 'prototype' },
    { id: 'c5', from: 'collab', to: 'final' },
    { id: 'c6', from: 'prototype', to: 'final' }
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
  title: document.querySelector('#selected-title'),
  swatch: document.querySelector('#selected-swatch'),
  label: document.querySelector('#platform-label'),
  note: document.querySelector('#platform-note'),
  depth: document.querySelector('#platform-depth'),
  color: document.querySelector('#platform-color'),
  connections: document.querySelector('#connection-list'),
  delete: document.querySelector('#delete-platform'),
  filters: [...document.querySelectorAll('.rail-button')]
};

let data = loadData();
let selectedId = null;
let connectMode = false;
let connectionStart = null;
let activeFilter = 'all';
let saveTimer = null;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#f8f6f1');
scene.fog = new THREE.Fog('#f8f6f1', 32, 58);

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

const transform = new TransformControls(camera, renderer.domElement);
transform.setMode('translate');
transform.setSize(.72);
transform.addEventListener('dragging-changed', (event) => { controls.enabled = !event.value; });
transform.addEventListener('objectChange', () => {
  const group = transform.object;
  if (!group?.userData.platformId) return;
  const platform = getPlatform(group.userData.platformId);
  platform.position = group.position.toArray().map((value) => Number(value.toFixed(2)));
  renderConnections();
  scheduleSave();
});
scene.add(transform.getHelper());

scene.add(new THREE.HemisphereLight('#ffffff', '#c7c2b7', 2.1));
const keyLight = new THREE.DirectionalLight('#ffffff', 2.4);
keyLight.position.set(-5, 12, 8);
scene.add(keyLight);

const platformLayer = new THREE.Group();
const connectionLayer = new THREE.Group();
scene.add(connectionLayer, platformLayer);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const platformObjects = new Map();
const connectionObjects = new Map();

function loadData() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (stored?.platforms && stored?.connections) return stored;
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
    new THREE.LineDashedMaterial({ color: '#a43b4a', dashSize: .18, gapSize: .11, transparent: true, opacity: .9 })
  );
  selection.computeLineDistances();
  selection.visible = platform.id === selectedId;
  selection.userData.selectionRing = true;
  group.add(selection);

  const label = makeLabel(platform);
  group.add(label);
  platformLayer.add(group);
  platformObjects.set(platform.id, { group, disc, outline, selection, label, material, outlineMaterial });
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
  transform.detach();
  clearGroup(platformLayer);
  platformObjects.clear();
  data.platforms.forEach(buildPlatform);
  applyFilter();
  if (selectedId && platformObjects.has(selectedId)) {
    platformObjects.get(selectedId).selection.visible = true;
    transform.attach(platformObjects.get(selectedId).group);
  }
}

function buildArrow(connection) {
  const fromObject = platformObjects.get(connection.from)?.group;
  const toObject = platformObjects.get(connection.to)?.group;
  if (!fromObject || !toObject) return;
  const from = fromObject.position.clone();
  const to = toObject.position.clone();
  const delta = to.clone().sub(from);
  const direction = delta.clone().normalize();
  from.add(direction.clone().multiplyScalar(2.5));
  to.add(direction.clone().multiplyScalar(-2.8));
  from.y += .35;
  to.y += .35;
  const midpoint = from.clone().lerp(to, .5);
  midpoint.y += Math.min(2.2, 1 + delta.length() * .08);
  midpoint.z += delta.x >= 0 ? .5 : -.5;
  const curve = new THREE.QuadraticBezierCurve3(from, midpoint, to);
  const material = new THREE.MeshBasicMaterial({ color: '#a43b4a', transparent: true, opacity: .85 });
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 34, .035, 7, false), material);
  tube.userData.connectionId = connection.id;
  connectionLayer.add(tube);

  const tangent = curve.getTangent(1).normalize();
  const cone = new THREE.Mesh(new THREE.ConeGeometry(.14, .48, 16), material.clone());
  cone.position.copy(to);
  cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
  cone.userData.connectionId = connection.id;
  connectionLayer.add(cone);
  connectionObjects.set(connection.id, { tube, cone });
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
  platformObjects.forEach(({ selection, label }, platformId) => {
    selection.visible = platformId === id;
    label.userData.element.classList.toggle('selected', platformId === id);
  });
  transform.detach();
  if (id && platformObjects.has(id) && !connectMode) transform.attach(platformObjects.get(id).group);
  updateInspector();
  if (window.innerWidth <= 680) dom.inspector.classList.toggle('open', Boolean(id));
}

function updateInspector() {
  const platform = getPlatform(selectedId);
  dom.empty.hidden = Boolean(platform);
  dom.form.hidden = !platform;
  if (!platform) return;
  dom.title.textContent = platform.label;
  dom.swatch.style.background = platform.color;
  dom.label.value = platform.label;
  dom.note.value = platform.note || '';
  dom.depth.value = platform.depth;
  dom.color.value = platform.color;
  renderConnectionList();
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
  transform.detach();
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
    data.connections.push({ id: `connection-${Date.now()}`, from: connectionStart, to: targetId });
    renderConnections();
    scheduleSave();
  }
  connectMode = false;
  connectionStart = null;
  dom.connect.classList.remove('active');
  dom.toast.classList.remove('visible');
  setSelected(targetId);
}

function applyFilter() {
  platformObjects.forEach(({ group }, id) => {
    const platform = getPlatform(id);
    group.visible = activeFilter === 'all' || platform.depth === activeFilter;
  });
  connectionLayer.visible = activeFilter === 'all';
}

function platformFromPointer(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const targets = [...platformObjects.values()].flatMap(({ disc, outline }) => [disc, outline]);
  const hit = raycaster.intersectObjects(targets, false)[0];
  return hit?.object.userData.platformId || null;
}

renderer.domElement.addEventListener('pointerdown', (event) => {
  if (transform.dragging) return;
  const id = platformFromPointer(event);
  if (connectMode && id) finishConnect(id);
  else if (id) setSelected(id);
  else if (!connectMode) setSelected(null);
});

dom.add.addEventListener('click', addPlatform);
dom.delete.addEventListener('click', deleteSelected);
dom.connect.addEventListener('click', () => connectMode ? finishConnect(selectedId) : startConnect(false));
dom.connectSelected.addEventListener('click', () => startConnect(true));
dom.resetView.addEventListener('click', () => {
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
  applyFilter();
});
dom.color.addEventListener('input', (event) => updateSelectedPlatform({ color: event.target.value }));
dom.filters.forEach((button) => button.addEventListener('click', () => {
  activeFilter = button.dataset.view;
  dom.filters.forEach((item) => item.classList.toggle('active', item === button));
  applyFilter();
}));

function resize() {
  const { width, height } = dom.scene.getBoundingClientRect();
  renderer.setSize(width, height, false);
  labelRenderer.setSize(width, height);
  camera.aspect = width / Math.max(height, 1);
  camera.updateProjectionMatrix();
}

new ResizeObserver(resize).observe(dom.scene);
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && connectMode) {
    connectMode = false;
    connectionStart = null;
    dom.connect.classList.remove('active');
    dom.toast.classList.remove('visible');
    if (selectedId) transform.attach(platformObjects.get(selectedId).group);
  }
  if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) deleteSelected();
});

renderAll();
resize();

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}
animate();
