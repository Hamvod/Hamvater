import * as THREE from './vendor/three/build/three.module.js';
import { GLTFLoader } from './vendor/three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from './vendor/three/examples/jsm/libs/meshopt_decoder.module.js';

(() => {
  const $ = (selector) => document.querySelector(selector);
  const state = {
    gender: 'men', heightUnit: 'cm', weightUnit: 'kg', heightCm: 170, weightKg: 68,
    originalUrl: null, displayUrl: null, cropUrl: null, demo: false, measured: null,
    comparing: false, cameraStream: null, yaw: 0, targetYaw: 0,
  };
  const heightInput = $('#height-input');
  const weightInput = $('#weight-input');
  const stage = $('#avatar-stage');
  const canvas = $('#avatar-canvas');
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  let renderer;
  let scene;
  let camera;
  let avatarRoot;
  let modelObject;
  let latestTextureRequest = 0;
  let backgroundRequestId = 0;
  let scanRequestId = 0;
  let requestId = 0;
  let mixer = null;
  let activePointer = null;
  let previousFrame = 0;
  let currentViewLabel = '';
  const modelBox = $('#model-fallback');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function setStatus(message, kind = 'idle') {
    const status = $('#scan-status');
    status.dataset.state = kind;
    status.querySelector('span').textContent = message;
  }

  function setModelStatus(message, kind = 'idle') {
    const status = $('.model-status');
    status.dataset.state = kind;
    $('#model-status').textContent = message;
  }

  function initViewer() {
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(27, 1, .1, 100);
      camera.position.set(0, 1.14, 5.7);
      camera.lookAt(0, 1.1, 0);
      scene.add(new THREE.HemisphereLight(0xffffff, 0xe1d5ca, 2.15));
      const key = new THREE.DirectionalLight(0xffffff, 2.1);
      key.position.set(-2.6, 4.4, 5.0);
      scene.add(key);
      const fill = new THREE.DirectionalLight(0xffe4d5, .55);
      fill.position.set(3, 1.2, -1.5);
      scene.add(fill);
      avatarRoot = new THREE.Group();
      scene.add(avatarRoot);
      resizeViewer();
      new ResizeObserver(resizeViewer).observe(stage);
      window.addEventListener('resize', resizeViewer, { passive: true });
      canvas.addEventListener('pointerdown', onPointerDown);
      canvas.addEventListener('pointermove', onPointerMove);
      canvas.addEventListener('pointerup', onPointerUp);
      canvas.addEventListener('pointercancel', onPointerUp);
      requestAnimationFrame(renderFrame);
      loadModel(state.gender);
    } catch (_error) {
      modelBox.hidden = false;
      setModelStatus('3D view is unavailable in this browser.', 'error');
    }
  }

  function resizeViewer() {
    if (!renderer || !camera) return;
    const width = Math.max(1, stage.clientWidth);
    const height = Math.max(1, stage.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    sizeGarmentPlane();
  }

  function clearRoot() {
    if (!avatarRoot) return;
    avatarRoot.traverse((item) => {
      if (!item.isMesh) return;
      item.geometry?.dispose?.();
      const mats = Array.isArray(item.material) ? item.material : [item.material];
      mats.forEach((material) => {
        if (material) material.dispose?.();
      });
    });
    avatarRoot.clear();
    modelObject = null;
    mixer = null;
  }

  function loadModel(gender) {
    state.gender = gender;
    const thisRequest = ++requestId;
    state.yaw = 0;
    state.targetYaw = 0;
    if (avatarRoot) avatarRoot.rotation.y = 0;
    setGarmentVisible(false);
    if (modelObject) clearRoot();
    modelBox.hidden = true;
    const name = gender === 'women' ? 'FEMALE' : 'MALE';
    $('#stage-model-name').textContent = `${name} FITTING MODEL`;
    document.querySelectorAll('.model-choice').forEach((button) => {
      const active = (gender === 'men' && button.id === 'model-male') || (gender === 'women' && button.id === 'model-female');
      button.classList.toggle('selected', active);
      button.setAttribute('aria-pressed', String(active));
    });
    setModelStatus(`Loading ${name.toLowerCase()} model…`);
    loader.load(`/static/models/${gender}.glb`, (gltf) => {
      if (thisRequest !== requestId) return;
      clearRoot();
      modelObject = gltf.scene;
      modelObject.rotation.y = -Math.PI / 2;
      modelObject.traverse((item) => {
        if (!item.isMesh) return;
        item.castShadow = false;
        item.receiveShadow = false;
        if (Array.isArray(item.material)) item.material.forEach((mat) => { if ('roughness' in mat) mat.roughness = Math.max(.48, mat.roughness || .6); });
        else if (item.material && 'roughness' in item.material) item.material.roughness = Math.max(.48, item.material.roughness || .6);
      });
      let bounds = new THREE.Box3().setFromObject(modelObject);
      const initialSize = bounds.getSize(new THREE.Vector3());
      if (!Number.isFinite(initialSize.y) || initialSize.y < .01) throw new Error('The model has no usable height.');
      modelObject.scale.setScalar(2.16 / initialSize.y);
      bounds = new THREE.Box3().setFromObject(modelObject);
      const center = bounds.getCenter(new THREE.Vector3());
      modelObject.position.x -= center.x;
      modelObject.position.z -= center.z;
      modelObject.position.y -= bounds.min.y;
      avatarRoot.add(modelObject);
      modelObject.updateMatrixWorld(true);
      if (gltf.animations?.length) {
        mixer = new THREE.AnimationMixer(modelObject);
        gltf.animations.forEach((clip) => mixer.clipAction(clip).play());
      }
      modelBox.hidden = true;
      updateProfileShape();
      if (state.displayUrl) setGarment(state.displayUrl);
      $('#model-body-note').textContent = `${gender === 'women' ? 'Female' : 'Male'} form · ${heightLabel()} · ${weightLabel()} · estimate, not a body scan`;
      setModelStatus(`${name[0]}${name.slice(1).toLowerCase()} model ready`);
    }, undefined, () => {
      if (thisRequest !== requestId) return;
      modelBox.hidden = false;
      setModelStatus(`${name[0]}${name.slice(1).toLowerCase()} model unavailable`, 'error');
    });
  }

  function sizeGarmentPlane() {
    const overlay = $('#garment-overlay');
    const userScale = Number($('#garment-size')?.value || 68) / 68;
    const position = Number($('#garment-position')?.value || 52);
    const stageWidth = Math.max(1, stage.clientWidth);
    const stageHeight = Math.max(1, stage.clientHeight);
    const dimensions = state.measured?.status === 'calibrated_estimate' ? state.measured.dimensions : null;
    const imageAspect = overlay.naturalWidth > 0 && overlay.naturalHeight > 0 ? overlay.naturalWidth / overlay.naturalHeight : .45;
    let width = stageWidth * .22 * userScale;
    let height = width / imageAspect;
    if (dimensions?.widthCm > 0 && dimensions?.heightCm > 0 && state.heightCm > 0) {
      height = stageHeight * .8 * (dimensions.heightCm / state.heightCm) * userScale;
      width = height * (dimensions.widthCm / dimensions.heightCm);
    }
    const fitScale = Math.min(1, (stageWidth * .42) / width, (stageHeight * .72) / height);
    width *= fitScale;
    height *= fitScale;
    overlay.style.width = `${width}px`;
    overlay.style.height = `${height}px`;
    overlay.style.top = `${47 + (position - 52) * .24}%`;
    overlay.style.opacity = String(Number($('#garment-opacity')?.value || 92) / 100);
  }

  function setGarment(url) {
    const overlay = $('#garment-overlay');
    if (!overlay || !url) return;
    const thisRequest = ++latestTextureRequest;
    overlay.hidden = true;
    overlay.onload = () => {
      if (thisRequest !== latestTextureRequest) return;
      overlay.hidden = false;
      sizeGarmentPlane();
      updateViewLabel();
    };
    overlay.onerror = () => {
      if (thisRequest === latestTextureRequest) setStatus('Image preview could not be applied to the model. Try another image.', 'error');
    };
    overlay.src = url;
    if (overlay.complete && overlay.naturalWidth > 0) {
      overlay.hidden = false;
      sizeGarmentPlane();
      updateViewLabel();
    }
  }

  function setGarmentVisible(visible) {
    const overlay = $('#garment-overlay');
    const hidden = !visible || state.comparing || !state.displayUrl;
    if (overlay && overlay.hidden !== hidden) overlay.hidden = hidden;
  }

  function setProfileScales(width, height) {
    if (!avatarRoot || !modelObject) return;
    avatarRoot.scale.set(width, height, width);
    sizeGarmentPlane();
  }

  function updateProfileShape() {
    const bmi = state.weightKg / ((state.heightCm / 100) ** 2);
    const boundedBMI = Math.max(15, Math.min(45, bmi));
    const width = Math.max(.78, Math.min(1.32, (boundedBMI / 22) ** .45));
    const heightScale = state.heightCm / 170;
    setProfileScales(width, heightScale);
    updateCameraFraming(heightScale);
  }

  function updateCameraFraming(heightScale) {
    if (!camera) return;
    const distanceScale = Math.max(1, heightScale / 1.12);
    const targetY = 1.1 * heightScale;
    camera.position.set(0, targetY + .04 * heightScale, 5.7 * distanceScale);
    camera.lookAt(0, targetY, 0);
  }

  function onPointerDown(event) {
    if (!modelObject || state.comparing) return;
    activePointer = { id: event.pointerId, x: event.clientX };
    canvas.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event) {
    if (!activePointer || activePointer.id !== event.pointerId) return;
    const deltaX = event.clientX - activePointer.x;
    activePointer.x = event.clientX;
    state.yaw += deltaX * .009;
    state.targetYaw = state.yaw;
    avatarRoot.rotation.y = state.yaw;
    updateViewLabel();
  }

  function onPointerUp(event) {
    if (activePointer?.id !== event.pointerId) return;
    activePointer = null;
  }

  function updateViewLabel() {
    const angle = ((state.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const frontDistance = Math.min(angle, Math.PI * 2 - angle);
    const label = frontDistance < .35 ? 'FRONT VIEW' : (Math.abs(angle - Math.PI) < .4 ? 'BACK VIEW' : 'TURNED VIEW');
    if (label !== currentViewLabel) {
      $('#stage-mode').textContent = label;
      currentViewLabel = label;
    }
    setGarmentVisible(frontDistance < .35);
  }

  function renderFrame(time) {
    requestAnimationFrame(renderFrame);
    if (!renderer || !scene || !camera) return;
    const delta = previousFrame ? Math.min(.05, (time - previousFrame) / 1000) : 0;
    previousFrame = time;
    if (mixer) mixer.update(delta);
    if (avatarRoot && modelObject && !activePointer) {
      const difference = state.targetYaw - state.yaw;
      state.yaw += difference * Math.min(1, delta * 5);
      const idle = reducedMotion ? 0 : Math.sin(time * .00065) * .035;
      avatarRoot.rotation.y = state.yaw + (state.targetYaw === 0 ? idle : 0);
      avatarRoot.position.y = reducedMotion ? 0 : Math.sin(time * .0011) * .004;
      updateViewLabel();
    }
    renderer.render(scene, camera);
  }

  function heightLabel() {
    return state.heightUnit === 'cm' ? `${Math.round(state.heightCm)} cm` : `${(state.heightCm / 30.48).toFixed(2)} ft`;
  }

  function weightLabel() {
    if (state.weightUnit === 'kg') return `${Number(state.weightKg.toFixed(1))} kg`;
    return `${(state.weightKg / .45359237).toFixed(1)} lb`;
  }

  function parseHeight() {
    const value = Number(heightInput.value);
    const min = state.heightUnit === 'cm' ? 100 : 3.3;
    const max = state.heightUnit === 'cm' ? 240 : 7.9;
    if (!Number.isFinite(value) || value < min || value > max) {
      $('#height-error').textContent = state.heightUnit === 'cm' ? 'Use 100–240 cm.' : 'Use 3.3–7.9 ft.';
      heightInput.setAttribute('aria-invalid', 'true');
      return false;
    }
    $('#height-error').textContent = '';
    heightInput.removeAttribute('aria-invalid');
    state.heightCm = state.heightUnit === 'cm' ? value : value * 30.48;
    return true;
  }

  function parseWeight() {
    const value = Number(weightInput.value);
    const min = state.weightUnit === 'kg' ? 25 : 55;
    const max = state.weightUnit === 'kg' ? 300 : 661;
    if (!Number.isFinite(value) || value < min || value > max) {
      $('#weight-error').textContent = state.weightUnit === 'kg' ? 'Use 25–300 kg.' : 'Use 55–661 lb.';
      weightInput.setAttribute('aria-invalid', 'true');
      return false;
    }
    $('#weight-error').textContent = '';
    weightInput.removeAttribute('aria-invalid');
    state.weightKg = state.weightUnit === 'kg' ? value : value * .45359237;
    return true;
  }

  function updateProfile() {
    if (!parseHeight() || !parseWeight()) return;
    updateProfileShape();
    const profile = `${heightLabel()} · ${weightLabel()}`;
    $('#profile-readout').textContent = `${profile} · approximate proportions`;
    $('#model-body-note').textContent = `${state.gender === 'men' ? 'Male' : 'Female'} form · ${profile} · estimate, not a body scan`;
  }

  function updateRangeStyles() {
    $('#size-output').value = `${$('#garment-size').value}%`;
    $('#position-output').value = `${$('#garment-position').value}%`;
    $('#opacity-output').value = `${$('#garment-opacity').value}%`;
    sizeGarmentPlane();
  }

  function plainBackgroundCutout(sourceUrl) {
    return new Promise((resolve) => {
      const skipped = (message) => resolve({ url: sourceUrl, removed: false, message });
      const image = new Image();
      image.onload = () => {
        try {
          const scale = Math.min(1, 900 / Math.max(image.naturalWidth, image.naturalHeight));
          const work = document.createElement('canvas');
          work.width = Math.max(1, Math.round(image.naturalWidth * scale));
          work.height = Math.max(1, Math.round(image.naturalHeight * scale));
          const context = work.getContext('2d', { willReadFrequently: true });
          if (!context) { skipped('Backdrop removal is unavailable; the original image is shown.'); return; }
          context.drawImage(image, 0, 0, work.width, work.height);
          const pixels = context.getImageData(0, 0, work.width, work.height);
          const { data, width, height } = pixels;
          const edgeColors = [];
          let edgeSamples = 0;
          let transparentEdges = 0;
          const edgeStep = Math.max(1, Math.floor(Math.min(width, height) / 95));
          const sampleEdge = (x, y) => {
            edgeSamples++;
            const offset = (y * width + x) * 4;
            if (data[offset + 3] < 32) { transparentEdges++; return; }
            edgeColors.push([data[offset], data[offset + 1], data[offset + 2]]);
          };
          for (let x = 0; x < width; x += edgeStep) {
            sampleEdge(x, 0);
            sampleEdge(x, height - 1);
          }
          for (let y = edgeStep; y < height - 1; y += edgeStep) {
            sampleEdge(0, y);
            sampleEdge(width - 1, y);
          }
          if (edgeSamples && transparentEdges / edgeSamples > .55) {
            skipped('The image already has transparent edges; no backdrop removal was needed.');
            return;
          }
          if (edgeColors.length < 12) {
            skipped('A plain background could not be isolated; the original image is shown.');
            return;
          }
          const median = (values) => {
            const ordered = [...values].sort((a, b) => a - b);
            return ordered[Math.floor(ordered.length / 2)];
          };
          const target = [0, 1, 2].map((channel) => median(edgeColors.map((color) => color[channel])));
          const edgeDistances = edgeColors.map((color) => Math.hypot(color[0] - target[0], color[1] - target[1], color[2] - target[2]));
          const matchingEdges = edgeDistances.filter((distance) => distance <= 42);
          if (matchingEdges.length / edgeColors.length < .62) {
            skipped('Background removal skipped because the image edges are not plain and consistent; the original is shown.');
            return;
          }
          const tolerance = Math.max(25, Math.min(58, 24 + median(matchingEdges) * 2.2));
          const total = width * height;
          const removed = new Uint8Array(total);
          const queue = new Int32Array(total);
          let head = 0;
          let tail = 0;
          const colorDistance = (pixel) => {
            const offset = pixel * 4;
            return Math.hypot(data[offset] - target[0], data[offset + 1] - target[1], data[offset + 2] - target[2]);
          };
          const visit = (pixel) => {
            if (removed[pixel]) return;
            const offset = pixel * 4;
            if (data[offset + 3] > 16 && colorDistance(pixel) > tolerance) return;
            removed[pixel] = 1;
            queue[tail++] = pixel;
          };
          for (let x = 0; x < width; x++) {
            visit(x);
            visit((height - 1) * width + x);
          }
          for (let y = 1; y < height - 1; y++) {
            visit(y * width);
            visit(y * width + width - 1);
          }
          while (head < tail) {
            const pixel = queue[head++];
            const x = pixel % width;
            const y = Math.floor(pixel / width);
            if (x > 0) visit(pixel - 1);
            if (x + 1 < width) visit(pixel + 1);
            if (y > 0) visit(pixel - width);
            if (y + 1 < height) visit(pixel + width);
          }
          if (tail < total * .015) {
            skipped('No clear plain background was found; the original image is shown.');
            return;
          }
          const touchesRemoved = (pixel, x, y) => (x > 0 && removed[pixel - 1]) || (x + 1 < width && removed[pixel + 1]) || (y > 0 && removed[pixel - width]) || (y + 1 < height && removed[pixel + width]);
          for (let pixel = 0; pixel < total; pixel++) {
            const offset = pixel * 4;
            if (removed[pixel]) { data[offset + 3] = 0; continue; }
            const x = pixel % width;
            const y = Math.floor(pixel / width);
            if (!touchesRemoved(pixel, x, y)) continue;
            const distance = colorDistance(pixel);
            if (distance < tolerance * 1.7) {
              const keep = Math.max(.16, Math.min(1, (distance - tolerance * .55) / (tolerance * 1.05)));
              data[offset + 3] = Math.round(data[offset + 3] * keep);
            }
          }
          context.putImageData(pixels, 0, 0);
          resolve({ url: work.toDataURL('image/png'), removed: true, message: 'Plain background removed from the fitting layer; scanning and Compare still use the original photo.' });
        } catch (_error) {
          skipped('Backdrop removal could not process this image; the original is shown.');
        }
      };
      image.onerror = () => skipped('Backdrop removal could not open this image; the original is shown.');
      image.src = sourceUrl;
    });
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function cropImageToBounds(sourceUrl, bounds) {
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => {
        const sourceWidth = image.naturalWidth;
        const sourceHeight = image.naturalHeight;
        const ratioX = sourceWidth / (Number(bounds.imageWidth) || sourceWidth);
        const ratioY = sourceHeight / (Number(bounds.imageHeight) || sourceHeight);
        const x = Number(bounds.x) * ratioX;
        const y = Number(bounds.y) * ratioY;
        const width = Number(bounds.width) * ratioX;
        const height = Number(bounds.height) * ratioY;
        if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) { resolve(sourceUrl); return; }
        const marginX = Math.max(2, width * .025);
        const marginY = Math.max(2, height * .025);
        const left = Math.max(0, Math.floor(x - marginX));
        const top = Math.max(0, Math.floor(y - marginY));
        const right = Math.min(sourceWidth, Math.ceil(x + width + marginX));
        const bottom = Math.min(sourceHeight, Math.ceil(y + height + marginY));
        const cropped = document.createElement('canvas');
        cropped.width = Math.max(1, right - left);
        cropped.height = Math.max(1, bottom - top);
        const context = cropped.getContext('2d');
        if (!context) { resolve(sourceUrl); return; }
        context.drawImage(image, left, top, cropped.width, cropped.height, 0, 0, cropped.width, cropped.height);
        resolve(cropped.toDataURL('image/png'));
      };
      image.onerror = () => resolve(sourceUrl);
      image.src = sourceUrl;
    });
  }

  async function handleFile(file) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { setStatus('Choose a JPG, PNG, or WebP image.', 'error'); return; }
    if (file.size > 12 * 1024 * 1024) { setStatus('This file is over 12 MB. Choose a smaller image.', 'error'); return; }
    try {
      const url = await fileToDataUrl(file);
      await applyGarment(url, file.name, false);
    } catch (_error) { setStatus('This image could not be opened. Try another file.', 'error'); }
  }

  async function applyGarment(url, name, isDemo = false) {
    scanRequestId++;
    const thisBackgroundRequest = ++backgroundRequestId;
    $('#cutout-toggle').disabled = false;
    state.originalUrl = url;
    state.displayUrl = url;
    state.cropUrl = null;
    state.demo = isDemo;
    state.measured = null;
    setGarmentVisible(false);
    $('#dimension-readout').hidden = true;
    $('#confidence-note').innerHTML = '<strong>Approximate preview.</strong> The image layer is flat; no cloth simulation or guaranteed fit.';
    $('#compare-button').disabled = false;
    $('#restart-button').disabled = false;
    $('#comparison-image').src = url;
    $('#garment-caption').textContent = isDemo ? 'Sample garment · not calibrated' : `${name} · not measured`;
    let cutoutResult = null;
    if (isDemo) {
      $('#cutout-toggle').checked = false;
    } else {
      $('#cutout-toggle').checked = true;
      setStatus('Checking for a plain background locally…', 'busy');
      cutoutResult = await plainBackgroundCutout(url);
      if (thisBackgroundRequest !== backgroundRequestId) return;
      state.displayUrl = cutoutResult.url;
    }
    setGarment(state.displayUrl);
    $('#scan-button').disabled = isDemo;
    $('#scan-button').textContent = isDemo ? 'Sample dress · not measurable' : 'Scan garment dimensions';
    const removalNote = cutoutResult?.message ? ` ${cutoutResult.message}` : '';
    setStatus(isDemo ? 'Sample dress loaded; its shape is illustrative only.' : `Dress added. Add marker #0 in the same plane for a size estimate.${removalNote}`, cutoutResult?.removed ? 'success' : 'idle');
    setComparing(false);
  }

  async function scanCurrentImage() {
    if (!state.originalUrl || state.demo) return;
    const scanSourceUrl = state.originalUrl;
    const thisScanRequest = ++scanRequestId;
    $('#scan-button').disabled = true;
    $('#cutout-toggle').disabled = true;
    setStatus('Looking for the 5 cm ArUco marker and garment outline…', 'busy');
    let cutoutResult = null;
    try {
      const response = await fetch('/api/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageBase64: scanSourceUrl }) });
      const result = await response.json();
      if (thisScanRequest !== scanRequestId || scanSourceUrl !== state.originalUrl) return;
      if (!response.ok) throw new Error(result.error || 'Scan failed. Try another image.');
      state.measured = result;
      if (result.status === 'calibrated_estimate' && result.dimensions) {
        const { widthCm, heightCm } = result.dimensions;
        $('#dimension-width').textContent = widthCm.toFixed(1);
        $('#dimension-height').textContent = heightCm.toFixed(1);
        $('#dimension-readout').hidden = false;
        $('#garment-caption').textContent = `${widthCm.toFixed(1)} × ${heightCm.toFixed(1)} cm · contour estimate`;
        $('#confidence-note').innerHTML = `<strong>Marker calibrated, not independently verified.</strong> ${escapeHtml(result.confidenceNote || result.guidance)} The flat layer is scaled against your entered height; this is not a body scan or fit guarantee.`;
        if (result.garmentBounds) {
          const thisBackgroundRequest = ++backgroundRequestId;
          const cropUrl = await cropImageToBounds(scanSourceUrl, result.garmentBounds);
          if (thisScanRequest !== scanRequestId || scanSourceUrl !== state.originalUrl) return;
          state.cropUrl = cropUrl;
          const garmentImage = cropUrl || scanSourceUrl;
          if ($('#cutout-toggle').checked) cutoutResult = await plainBackgroundCutout(garmentImage);
          else cutoutResult = { url: garmentImage, removed: false, message: '' };
          if (thisScanRequest !== scanRequestId || scanSourceUrl !== state.originalUrl) return;
          if (thisBackgroundRequest === backgroundRequestId) {
            state.displayUrl = cutoutResult.url;
            setGarment(state.displayUrl);
          }
        }
      } else {
        $('#dimension-readout').hidden = true;
        $('#garment-caption').textContent = 'Preview only · not calibrated';
        $('#confidence-note').innerHTML = '<strong>No calibrated dimensions.</strong> The marker or garment outline could not be measured.';
      }
      sizeGarmentPlane();
      const cropNote = result.garmentBounds ? ' The fitting layer excludes the separate marker; Compare retains the full scan.' : '';
      const removalNote = cutoutResult?.message ? ` ${cutoutResult.message}` : '';
      setStatus(`${result.message} ${result.guidance}${cropNote}${removalNote}`, result.dimensions ? 'success' : 'error');
    } catch (error) {
      if (thisScanRequest === scanRequestId && scanSourceUrl === state.originalUrl) setStatus(error.message || 'The scan could not reach the measurement service.', 'error');
    } finally {
      if (thisScanRequest === scanRequestId) {
        $('#cutout-toggle').disabled = false;
        $('#scan-button').disabled = state.demo || !state.originalUrl;
      }
    }
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  }

  function setComparing(enabled) {
    state.comparing = enabled;
    stage.dataset.comparing = String(enabled);
    $('#comparison-view').hidden = !enabled;
    $('#compare-button').textContent = enabled ? 'Back to model' : 'Compare';
    canvas.style.visibility = enabled ? 'hidden' : 'visible';
    updateViewLabel();
  }

  async function updateCutout() {
    if (!state.originalUrl || state.demo) return;
    const sourceUrl = state.cropUrl || state.originalUrl;
    const thisBackgroundRequest = ++backgroundRequestId;
    if ($('#cutout-toggle').checked) {
      setStatus('Removing a plain background locally…', 'busy');
      const result = await plainBackgroundCutout(sourceUrl);
      if (thisBackgroundRequest !== backgroundRequestId) return;
      state.displayUrl = result.url;
      setGarment(state.displayUrl);
      setStatus(result.message, result.removed ? 'success' : 'idle');
    } else {
      state.displayUrl = sourceUrl;
      setGarment(state.displayUrl);
      setStatus('Original background restored in the fitting layer. Measurements and Compare still use the original photo.', 'idle');
    }
  }

  function useDemoDress() {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="620" viewBox="0 0 280 620"><path d="M96 30 140 46 184 30 230 72 199 111 178 96 195 185 248 590H32L85 185 102 96 81 111 50 72z" fill="#d98f70" stroke="#183a47" stroke-width="3" stroke-linejoin="round"/><path d="M100 43 140 75 180 43M140 75v110M87 185h106" fill="none" stroke="#f6ded2" stroke-width="4" opacity=".75"/><path d="M39 560h202" stroke="#a75f45" stroke-width="2" stroke-dasharray="5 5"/></svg>`;
    $('#dress-file').value = '';
    $('#cutout-toggle').checked = false;
    applyGarment(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, 'Sample dress', true);
  }

  async function openCamera() {
    $('#camera-error').textContent = '';
    if (!navigator.mediaDevices?.getUserMedia) { $('#camera-error').textContent = 'Camera capture is not available here. Upload a photo instead.'; $('#camera-dialog').showModal(); return; }
    try {
      state.cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      $('#camera-video').srcObject = state.cameraStream;
      $('#camera-dialog').showModal();
    } catch (_error) { $('#camera-error').textContent = 'Allow camera access, or upload a photo instead.'; $('#camera-dialog').showModal(); }
  }

  function closeCamera() {
    if (state.cameraStream) state.cameraStream.getTracks().forEach((track) => track.stop());
    state.cameraStream = null;
    $('#camera-video').srcObject = null;
  }

  function changeHeightUnit(button) {
    if (button.dataset.heightUnit === state.heightUnit) return;
    if (parseHeight()) state.heightUnit = button.dataset.heightUnit;
    else state.heightUnit = button.dataset.heightUnit;
    document.querySelectorAll('[data-height-unit]').forEach((item) => { const active = item === button; item.classList.toggle('active', active); item.setAttribute('aria-pressed', String(active)); });
    $('#height-suffix').textContent = state.heightUnit;
    heightInput.value = state.heightUnit === 'cm' ? Math.round(state.heightCm) : (state.heightCm / 30.48).toFixed(2);
    heightInput.min = state.heightUnit === 'cm' ? '100' : '3.3';
    heightInput.max = state.heightUnit === 'cm' ? '240' : '7.9';
    heightInput.step = state.heightUnit === 'cm' ? '1' : '0.01';
    updateProfile();
  }

  function changeWeightUnit(button) {
    if (button.dataset.weightUnit === state.weightUnit) return;
    parseWeight();
    state.weightUnit = button.dataset.weightUnit;
    document.querySelectorAll('[data-weight-unit]').forEach((item) => { const active = item === button; item.classList.toggle('active', active); item.setAttribute('aria-pressed', String(active)); });
    $('#weight-suffix').textContent = state.weightUnit;
    weightInput.value = state.weightUnit === 'kg' ? state.weightKg.toFixed(1) : (state.weightKg / .45359237).toFixed(1);
    weightInput.min = state.weightUnit === 'kg' ? '25' : '55';
    weightInput.max = state.weightUnit === 'kg' ? '300' : '661';
    updateProfile();
  }

  function resetDress() {
    scanRequestId++;
    backgroundRequestId++;
    $('#cutout-toggle').disabled = false;
    state.originalUrl = null;
    state.displayUrl = null;
    state.cropUrl = null;
    state.demo = false;
    state.measured = null;
    $('#dress-file').value = '';
    $('#cutout-toggle').checked = true;
    $('#garment-size').value = 68;
    $('#garment-position').value = 52;
    $('#garment-opacity').value = 92;
    updateRangeStyles();
    latestTextureRequest++;
    const overlay = $('#garment-overlay');
    overlay.hidden = true;
    overlay.removeAttribute('src');
    $('#dimension-readout').hidden = true;
    $('#confidence-note').innerHTML = '<strong>Approximate preview.</strong> The image layer is flat; no cloth simulation or guaranteed fit.';
    $('#garment-caption').textContent = 'Select a model or add a dress';
    $('#scan-button').disabled = true;
    $('#scan-button').textContent = 'Scan garment dimensions';
    $('#compare-button').disabled = true;
    $('#restart-button').disabled = true;
    setComparing(false);
    setStatus('Add a dress image to begin.', 'idle');
  }

  $('#dress-file').addEventListener('change', (event) => handleFile(event.target.files[0]));
  $('#demo-button').addEventListener('click', useDemoDress);
  $('#scan-button').addEventListener('click', scanCurrentImage);
  $('#height-input').addEventListener('input', updateProfile);
  $('#weight-input').addEventListener('input', updateProfile);
  document.querySelectorAll('[data-height-unit]').forEach((button) => button.addEventListener('click', () => changeHeightUnit(button)));
  document.querySelectorAll('[data-weight-unit]').forEach((button) => button.addEventListener('click', () => changeWeightUnit(button)));
  ['garment-size', 'garment-position', 'garment-opacity'].forEach((id) => $(`#${id}`).addEventListener('input', updateRangeStyles));
  $('#cutout-toggle').addEventListener('change', updateCutout);
  $('#camera-button').addEventListener('click', openCamera);
  $('#capture-button').addEventListener('click', () => {
    const video = $('#camera-video');
    if (!video.videoWidth) { $('#camera-error').textContent = 'Wait for the camera image, then capture again.'; return; }
    const work = document.createElement('canvas');
    work.width = video.videoWidth; work.height = video.videoHeight;
    work.getContext('2d').drawImage(video, 0, 0);
    const url = work.toDataURL('image/jpeg', .9);
    closeCamera(); $('#camera-dialog').close(); $('#dress-file').value = '';
    applyGarment(url, 'Camera capture', false);
  });
  document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => {
    const dialog = $(`#${button.dataset.close}`);
    if (dialog.id === 'camera-dialog') closeCamera();
    dialog.close();
  }));
  $('#camera-dialog').addEventListener('close', closeCamera);
  $('#marker-open').addEventListener('click', () => $('#marker-dialog').showModal());
  $('#print-button').addEventListener('click', () => window.print());
  $('#help-button').addEventListener('click', () => $('#help-dialog').showModal());
  $('#restart-button').addEventListener('click', resetDress);
  $('#compare-button').addEventListener('click', () => { if (state.originalUrl) setComparing(!state.comparing); });
  $('#model-male').addEventListener('click', () => loadModel('men'));
  $('#model-female').addEventListener('click', () => loadModel('women'));
  $('#rotate-button').addEventListener('click', () => {
    state.targetYaw += Math.PI / 2;
    updateViewLabel();
  });
  $('#reset-view-button').addEventListener('click', () => {
    state.targetYaw = 0;
    updateViewLabel();
  });
  $('#camera-dialog').addEventListener('click', (event) => { if (event.target === $('#camera-dialog')) closeCamera(); });

  updateProfile();
  updateRangeStyles();
  initViewer();
})();
