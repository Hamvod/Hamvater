(() => {
  const $ = (selector) => document.querySelector(selector);
  const state = {
    heightUnit: 'cm', weightUnit: 'kg', heightCm: 170, weightKg: 68,
    file: null, originalUrl: null, displayUrl: null, demo: false,
    measured: null, rotation: 0, comparing: false, cameraStream: null,
  };

  const heightInput = $('#height-input');
  const weightInput = $('#weight-input');
  const rig = $('#avatar-rig');
  const overlay = $('#garment-overlay');
  const layer = $('#garment-layer');
  const stage = $('#avatar-stage');
  const scanStatus = $('#scan-status');
  const reader = new FileReader();

  function setStatus(message, kind = 'idle') {
    scanStatus.dataset.state = kind;
    scanStatus.querySelector('span:last-child').textContent = message;
  }

  function heightValueInInput() {
    if (state.heightUnit === 'cm') return `${Math.round(state.heightCm)} cm`;
    return `${(state.heightCm / 30.48).toFixed(2)} ft`;
  }

  function parseHeight() {
    const value = Number(heightInput.value);
    const min = state.heightUnit === 'cm' ? 100 : 3.3;
    const max = state.heightUnit === 'cm' ? 240 : 7.9;
    if (!Number.isFinite(value) || value < min || value > max) {
      $('#height-error').textContent = state.heightUnit === 'cm' ? 'Enter a height between 100 and 240 cm.' : 'Enter a height between 3.3 and 7.9 ft.';
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
      $('#weight-error').textContent = state.weightUnit === 'kg' ? 'Enter a weight between 25 and 300 kg.' : 'Enter a weight between 55 and 661 lb.';
      weightInput.setAttribute('aria-invalid', 'true');
      return false;
    }
    $('#weight-error').textContent = '';
    weightInput.removeAttribute('aria-invalid');
    state.weightKg = state.weightUnit === 'kg' ? value : value * 0.45359237;
    return true;
  }

  function updateProfile() {
    const heightOk = parseHeight();
    const weightOk = parseWeight();
    if (!heightOk || !weightOk) return;
    const bmi = state.weightKg / ((state.heightCm / 100) ** 2);
    const widthScale = Math.max(.88, Math.min(1.22, 1 + (bmi - 22) * .009));
    const heightScale = Math.max(.9, Math.min(1.1, state.heightCm / 170));
    rig.style.setProperty('--shape-width', widthScale.toFixed(3));
    rig.style.setProperty('--shape-height', heightScale.toFixed(3));
    updateAvatarTransform();
    const unitLabel = state.heightUnit === 'cm' ? `${Math.round(state.heightCm)} cm` : heightValueInInput();
    $('#profile-readout').textContent = `Approximate proportions · ${unitLabel} · not saved`;
  }

  function updateAvatarTransform() {
    const width = rig.style.getPropertyValue('--shape-width') || '1';
    const height = rig.style.getPropertyValue('--shape-height') || '1';
    rig.style.transform = `translate(-50%,-50%) scaleX(${width}) scaleY(${height}) rotateY(${state.rotation}deg)`;
  }

  function updateRangeStyles() {
    $('#garment-overlay').style.opacity = `${$('#garment-opacity').value / 100}`;
    layer.style.setProperty('--garment-width', `${$('#garment-size').value}%`);
    layer.style.setProperty('--garment-top', `${$('#garment-position').value}%`);
    $('#size-output').value = `${$('#garment-size').value}%`;
    $('#position-output').value = `${$('#garment-position').value}%`;
    $('#opacity-output').value = `${$('#garment-opacity').value}%`;
  }

  function lightBackgroundCutout(sourceUrl, enabled) {
    if (!enabled) return Promise.resolve(sourceUrl);
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => {
        const scale = Math.min(1, 900 / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const { data, width, height } = pixels;
        const edge = Math.max(1, Math.min(5, Math.round(Math.min(width, height) * .025)));
        const corners = [];
        for (const [cx, cy] of [[0, 0], [width - edge, 0], [0, height - edge], [width - edge, height - edge]]) {
          let r = 0, g = 0, b = 0, count = 0;
          for (let y = cy; y < Math.min(height, cy + edge); y++) for (let x = cx; x < Math.min(width, cx + edge); x++) {
            const i = (y * width + x) * 4; r += data[i]; g += data[i + 1]; b += data[i + 2]; count++;
          }
          corners.push([r / count, g / count, b / count]);
        }
        const target = corners.reduce((acc, c) => acc.map((v, i) => v + c[i] / corners.length), [0, 0, 0]);
        const cornerSpread = Math.max(...corners.map((c) => Math.hypot(c[0] - target[0], c[1] - target[1], c[2] - target[2])));
        const isLight = (target[0] + target[1] + target[2]) / 3 > 145;
        const tolerance = cornerSpread < 35 ? 48 : 30;
        if (cornerSpread > 90 || !isLight) {
          setStatus('Backdrop cutout was skipped: image corners do not look like one light, plain background.', 'idle');
          resolve(sourceUrl);
          return;
        }
        for (let i = 0; i < data.length; i += 4) {
          const distance = Math.hypot(data[i] - target[0], data[i + 1] - target[1], data[i + 2] - target[2]);
          const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
          if (distance < tolerance && brightness > 130) data[i + 3] = 0;
          else if (distance < tolerance * 1.35 && brightness > 165) data[i + 3] = Math.round(data[i + 3] * .65);
        }
        ctx.putImageData(pixels, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      image.onerror = () => resolve(sourceUrl);
      image.src = sourceUrl;
    });
  }

  async function applyGarment(url, name, isDemo = false) {
    state.originalUrl = url;
    state.displayUrl = url;
    state.demo = isDemo;
    state.measured = null;
    $('#dimension-readout').hidden = true;
    $('#stage-dimension').hidden = true;
    $('#calibration-legend').innerHTML = '<i class="legend-dot dot-unmeasured"></i> Not calibrated';
    $('#confidence-note').innerHTML = '<span class="confidence-mark">i</span><p><strong>A visual approximation.</strong> This avatar uses height and weight only. It doesn\'t model full body shape, depth, fabric drape or stretch, tailoring, comfort, or guaranteed real-world fit.</p>';
    $('#compare-button').disabled = false;
    $('#comparison-image').src = url;
    $('#garment-caption').textContent = isDemo ? 'Sample silhouette · not measured' : `${name} · not measured yet`;
    $('#stage-mode').textContent = 'AVATAR STUDY · FRONT';
    overlay.src = url;
    overlay.hidden = false;
    $('#scan-button').disabled = isDemo;
    if (isDemo) {
      $('#scan-button').textContent = 'Sample garment · not measurable';
      setStatus('Sample dress loaded. Its illustrative shape is not calibrated or measured.', 'idle');
    } else {
      $('#scan-button').textContent = '⌕  Scan garment dimensions';
      setStatus('Dress added. Add marker #0 in the same plane for calibrated dimensions.', 'idle');
    }
    if ($('#cutout-toggle').checked && !isDemo) {
      state.displayUrl = await lightBackgroundCutout(url, true);
      overlay.src = state.displayUrl;
    }
    updateRangeStyles();
    $('#compare-button').disabled = false;
    setComparing(false);
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
  }

  async function handleFile(file) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      setStatus('Choose a JPG, PNG, or WebP image.', 'error');
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setStatus('This file is over 12 MB. Choose a smaller image.', 'error');
      return;
    }
    try {
      state.file = file;
      const url = await fileToDataUrl(file);
      await applyGarment(url, file.name, false);
    } catch (_error) {
      setStatus('This image could not be opened. Try another file.', 'error');
    }
  }

  async function scanCurrentImage() {
    if (!state.originalUrl || state.demo) return;
    $('#scan-button').disabled = true;
    setStatus('Looking for the printed 5 cm ArUco marker and garment outline…', 'busy');
    try {
      const response = await fetch('/api/scan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: state.originalUrl }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Scan failed. Try another image.');
      state.measured = result;
      if (result.status === 'calibrated_estimate' && result.dimensions) {
        const { widthCm, heightCm } = result.dimensions;
        $('#dimension-width').textContent = widthCm.toFixed(1);
        $('#dimension-height').textContent = heightCm.toFixed(1);
        $('#dimension-readout').hidden = false;
        $('#stage-dimension-value').textContent = `${widthCm.toFixed(1)} × ${heightCm.toFixed(1)} cm`;
        $('#stage-dimension').hidden = false;
        $('#garment-caption').textContent = `${widthCm.toFixed(1)} cm wide · ${heightCm.toFixed(1)} cm long · contour estimate`;
        $('#calibration-legend').innerHTML = '<i class="legend-dot dot-measured"></i> Marker-calibrated estimate';
        $('#confidence-note').innerHTML = `<span class="confidence-mark">i</span><p><strong>Marker calibrated; not independently verified.</strong> ${escapeHtml(result.confidenceNote || result.guidance)} Perspective and same-plane alignment may affect the estimate. This is not a fit guarantee.</p>`;
      } else {
        $('#dimension-readout').hidden = true;
        $('#stage-dimension').hidden = true;
        $('#garment-caption').textContent = 'Preview only · garment size not calibrated';
        $('#calibration-legend').innerHTML = '<i class="legend-dot dot-unmeasured"></i> Not calibrated';
      }
      setStatus(result.message + ' ' + result.guidance, result.dimensions ? 'success' : 'error');
    } catch (error) {
      setStatus(error.message || 'The scan could not reach the measurement service.', 'error');
    } finally {
      $('#scan-button').disabled = !state.originalUrl || state.demo;
    }
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  function setComparing(enabled) {
    state.comparing = enabled;
    stage.dataset.comparing = enabled ? 'true' : 'false';
    $('#comparison-view').hidden = !enabled;
    $('#compare-button').textContent = enabled ? 'Back to avatar' : 'Compare image';
    $('#stage-mode').textContent = enabled ? 'GARMENT IMAGE · BEFORE' : 'AVATAR STUDY · FRONT';
  }

  function updateCutout() {
    if (!state.originalUrl || state.demo) return;
    if ($('#cutout-toggle').checked) {
      lightBackgroundCutout(state.originalUrl, true).then((url) => {
        state.displayUrl = url;
        overlay.src = url;
      });
    } else {
      state.displayUrl = state.originalUrl;
      overlay.src = state.originalUrl;
    }
  }

  function useDemoDress() {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 460"><path d="M92 28 140 42 188 28l39 34-35 42-21-14 44 97 49 230H64l49-230 44-97-21 14-35-42z" fill="#d98f70" stroke="#183a47" stroke-width="3" stroke-linejoin="round"/><path d="m102 44 38 31 38-31M140 75v61M112 171h56" fill="none" stroke="#f6ded2" stroke-width="4" opacity=".75"/><path d="M72 418h136" stroke="#a75f45" stroke-width="2" stroke-dasharray="5 5"/></svg>`;
    state.file = null;
    $('#dress-file').value = '';
    $('#cutout-toggle').checked = false;
    applyGarment(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, 'Sample dress', true);
  }

  async function openCamera() {
    $('#camera-error').textContent = '';
    if (!navigator.mediaDevices?.getUserMedia) {
      $('#camera-error').textContent = 'Camera capture is not available in this browser. Upload a photo instead.';
      $('#camera-dialog').showModal();
      return;
    }
    try {
      state.cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      $('#camera-video').srcObject = state.cameraStream;
      $('#camera-dialog').showModal();
    } catch (_error) {
      $('#camera-error').textContent = 'Camera access was unavailable. Allow camera permission or upload a photo instead.';
      $('#camera-dialog').showModal();
    }
  }

  function closeCamera() {
    if (state.cameraStream) state.cameraStream.getTracks().forEach((track) => track.stop());
    state.cameraStream = null;
    $('#camera-video').srcObject = null;
  }

  $('#dress-file').addEventListener('change', (event) => handleFile(event.target.files[0]));
  $('#demo-button').addEventListener('click', useDemoDress);
  $('#scan-button').addEventListener('click', scanCurrentImage);
  $('#height-input').addEventListener('input', updateProfile);
  $('#weight-input').addEventListener('input', updateProfile);
  document.querySelectorAll('[data-height-unit]').forEach((button) => button.addEventListener('click', () => {
    if (button.dataset.heightUnit === state.heightUnit) return;
    parseHeight();
    state.heightUnit = button.dataset.heightUnit;
    document.querySelectorAll('[data-height-unit]').forEach((item) => { item.classList.toggle('active', item === button); item.setAttribute('aria-pressed', item === button ? 'true' : 'false'); });
    $('#height-unit-label').textContent = state.heightUnit === 'cm' ? 'cm' : 'decimal ft';
    $('#height-suffix').textContent = state.heightUnit === 'cm' ? 'cm' : 'ft';
    heightInput.value = state.heightUnit === 'cm' ? Math.round(state.heightCm) : (state.heightCm / 30.48).toFixed(2);
    heightInput.min = state.heightUnit === 'cm' ? '100' : '3.3';
    heightInput.max = state.heightUnit === 'cm' ? '240' : '7.9';
    heightInput.step = state.heightUnit === 'cm' ? '1' : '0.01';
    updateProfile();
  }));
  document.querySelectorAll('[data-weight-unit]').forEach((button) => button.addEventListener('click', () => {
    if (button.dataset.weightUnit === state.weightUnit) return;
    parseWeight();
    state.weightUnit = button.dataset.weightUnit;
    document.querySelectorAll('[data-weight-unit]').forEach((item) => { item.classList.toggle('active', item === button); item.setAttribute('aria-pressed', item === button ? 'true' : 'false'); });
    $('#weight-unit-label').textContent = state.weightUnit;
    $('#weight-suffix').textContent = state.weightUnit;
    weightInput.value = state.weightUnit === 'kg' ? state.weightKg.toFixed(1) : (state.weightKg / .45359237).toFixed(1);
    weightInput.min = state.weightUnit === 'kg' ? '25' : '55';
    weightInput.max = state.weightUnit === 'kg' ? '300' : '661';
    updateProfile();
  }));
  ['garment-size', 'garment-position', 'garment-opacity'].forEach((id) => $(`#${id}`).addEventListener('input', updateRangeStyles));
  $('#cutout-toggle').addEventListener('change', updateCutout);
  $('#camera-button').addEventListener('click', openCamera);
  $('#capture-button').addEventListener('click', () => {
    const video = $('#camera-video');
    if (!video.videoWidth) { $('#camera-error').textContent = 'Wait for the camera image, then capture again.'; return; }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', .9);
    closeCamera(); $('#camera-dialog').close();
    $('#dress-file').value = '';
    state.file = null;
    applyGarment(dataUrl, 'Camera capture', false);
  });
  document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => {
    const dialog = $(`#${button.dataset.close}`);
    if (dialog.id === 'camera-dialog') closeCamera();
    dialog.close();
  }));
  $('#camera-dialog').addEventListener('close', closeCamera);
  $('#marker-open').addEventListener('click', () => $('#marker-dialog').showModal());
  $('#print-button').addEventListener('click', () => window.print());
  $('#restart-button').addEventListener('click', () => {
    state.file = null; state.originalUrl = null; state.displayUrl = null; state.demo = false; state.measured = null;
    state.rotation = 0; updateAvatarTransform();
    $('#dress-file').value = ''; $('#cutout-toggle').checked = false;
    $('#garment-size').value = 68; $('#garment-position').value = 52; $('#garment-opacity').value = 92;
    updateRangeStyles(); overlay.removeAttribute('src'); overlay.hidden = true;
    $('#dimension-readout').hidden = true; $('#stage-dimension').hidden = true;
    $('#calibration-legend').innerHTML = '<i class=\"legend-dot dot-unmeasured\"></i> Not calibrated';
    $('#confidence-note').innerHTML = '<span class=\"confidence-mark\">i</span><p><strong>A visual approximation.</strong> This avatar uses height and weight only. It doesn\'t model full body shape, depth, fabric drape or stretch, tailoring, comfort, or guaranteed real-world fit.</p>';
    $('#garment-caption').textContent = 'Neutral form · no garment added';
    $('#compare-button').disabled = true; $('#restart-button').disabled = true;
    setComparing(false); setStatus('Add a dress image to begin.', 'idle');
  });
  $('#compare-button').addEventListener('click', () => { if (state.originalUrl) setComparing(!state.comparing); });
  $('#rotate-button').addEventListener('click', () => {
    state.rotation = state.rotation >= 360 ? 0 : state.rotation + 28;
    updateAvatarTransform();
    $('#stage-mode').textContent = `AVATAR STUDY · ${state.rotation % 56 ? 'TURN' : 'FRONT'}`;
  });

  // Allow direct manipulation of the dress layer inside the stage.
  let dragStart = null;
  layer.addEventListener('pointerdown', (event) => {
    if (!overlay.src || overlay.hidden || state.comparing) return;
    dragStart = { y: event.clientY, top: Number($('#garment-position').value) };
    layer.setPointerCapture(event.pointerId);
  });
  layer.addEventListener('pointermove', (event) => {
    if (!dragStart) return;
    const delta = (event.clientY - dragStart.y) / stage.clientHeight * 100;
    const next = Math.max(28, Math.min(76, Math.round(dragStart.top + delta)));
    $('#garment-position').value = next;
    updateRangeStyles();
  });
  layer.addEventListener('pointerup', () => { dragStart = null; });
  layer.addEventListener('pointercancel', () => { dragStart = null; });

  updateProfile();
  updateRangeStyles();
})();
