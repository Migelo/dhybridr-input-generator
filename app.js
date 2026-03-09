// dHybridR Input Generator — Main Application

(function() {
  let currentDim = 2;
  let state = {};       // { sectionKey: { field: value } } or { sectionKey: [ {field:value}, ... ] } for perSpecies
  let activeSection = 'node_conf';
  let activeSpeciesIdx = {};  // { sectionKey: speciesIndex }

  // ---- Init ----
  function init() {
    initState();
    buildSidebar();
    buildSections();
    setActiveSection('node_conf');
    updatePreview();

    document.getElementById('dim-select').addEventListener('change', onDimChange);

    // Mobile menu
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobile-overlay');
    document.getElementById('btn-menu').addEventListener('click', () => {
      sidebar.classList.toggle('open');
      overlay.classList.toggle('open');
    });
    const closeMobileMenu = () => { sidebar.classList.remove('open'); overlay.classList.remove('open'); };
    overlay.addEventListener('click', closeMobileMenu);
    document.getElementById('btn-generate').addEventListener('click', onGenerate);
    document.getElementById('btn-copy').addEventListener('click', onCopy);
    document.getElementById('btn-load').addEventListener('click', () => document.getElementById('file-input').click());
    document.getElementById('file-input').addEventListener('change', onFileLoad);
    document.getElementById('btn-preset').addEventListener('click', () => showPresetModal());
    document.querySelector('.modal-close').addEventListener('click', () => hidePresetModal());
    document.getElementById('preset-modal').addEventListener('click', e => {
      if (e.target === e.currentTarget) hidePresetModal();
    });
    buildPresetList();
    enforceIntegerFields();
  }

  // ---- Integer enforcement ----
  function enforceIntegerFields() {
    // Block non-digit keystrokes (allow minus at start, navigation keys)
    document.addEventListener('keydown', e => {
      if (!e.target.classList.contains('int-field')) return;
      // Allow: backspace, delete, tab, escape, enter, arrows, home, end, select-all, copy, paste, cut
      const allow = ['Backspace','Delete','Tab','Escape','Enter',
        'ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'];
      if (allow.includes(e.key)) return;
      if ((e.ctrlKey || e.metaKey) && ['a','c','v','x','z'].includes(e.key.toLowerCase())) return;
      // Allow minus only at position 0
      if (e.key === '-' && e.target.selectionStart === 0 && !e.target.value.includes('-')) return;
      // Allow digits
      if (/^[0-9]$/.test(e.key)) return;
      // Block everything else
      e.preventDefault();
      e.target.classList.add('rejected');
      setTimeout(() => e.target.classList.remove('rejected'), 300);
    });

    // Sanitize paste content
    document.addEventListener('paste', e => {
      if (!e.target.classList.contains('int-field')) return;
      e.preventDefault();
      const pasted = (e.clipboardData || window.clipboardData).getData('text');
      const cleaned = pasted.replace(/[^0-9-]/g, '').replace(/(?!^)-/g, '');
      if (cleaned) {
        const input = e.target;
        const start = input.selectionStart;
        const end = input.selectionEnd;
        const before = input.value.slice(0, start) + cleaned + input.value.slice(end);
        // Validate result is a valid integer string
        const final = before.replace(/[^0-9-]/g, '').replace(/(?!^)-/g, '');
        input.value = final;
        input.selectionStart = input.selectionEnd = start + cleaned.length;
        input.dispatchEvent(new Event('input'));
      } else {
        e.target.classList.add('rejected');
        setTimeout(() => e.target.classList.remove('rejected'), 300);
      }
    });
  }

  let activeInjectorIdx = [0]; // per species

  // ---- State management ----
  function initState() {
    state = {};
    activeInjectorIdx = [0];
    for (const [key, sec] of Object.entries(SCHEMA)) {
      if (sec.multiPerSpecies) {
        // Array of arrays: state.plasma_injector[speciesIdx][injectorIdx]
        state[key] = [[buildDefaults(sec)]];
      } else if (sec.perSpecies) {
        state[key] = [buildDefaults(sec)];
        activeSpeciesIdx[key] = 0;
      } else {
        state[key] = buildDefaults(sec);
      }
    }
  }

  function buildDefaults(sec) {
    const data = {};
    if (sec.enabled === false) data._enabled = false;
    for (const f of sec.fields) {
      const arrSize = getArraySize(f.dim, currentDim);
      if (arrSize > 0) {
        data[f.key] = (f.default || []).slice(0, arrSize);
        // Pad if needed
        while (data[f.key].length < arrSize) data[f.key].push(f.default?.[data[f.key].length] ?? (f.type === 'strarr' ? 'per' : 0));
      } else {
        data[f.key] = f.default;
      }
    }
    return data;
  }

  function getSpeciesCount() {
    return state.particles?.num_species || 1;
  }

  function ensureSpeciesArrays(count) {
    for (const [key, sec] of Object.entries(SCHEMA)) {
      if (!sec.perSpecies) continue;
      if (sec.multiPerSpecies) {
        while (state[key].length < count) {
          state[key].push([buildDefaults(sec)]);
        }
      } else {
        while (state[key].length < count) {
          state[key].push(buildDefaults(sec));
        }
      }
    }
    while (activeInjectorIdx.length < count) activeInjectorIdx.push(0);
  }

  // ---- Sidebar ----
  function buildSidebar() {
    const nav = document.getElementById('nav-list');
    nav.innerHTML = '';
    for (const item of SECTION_ORDER) {
      if (item.header) {
        const li = document.createElement('li');
        li.className = 'section-header';
        li.textContent = item.header;
        nav.appendChild(li);
      } else {
        const sec = SCHEMA[item];
        const li = document.createElement('li');
        li.textContent = sec.label;
        li.dataset.section = item;
        li.addEventListener('click', () => {
          setActiveSection(item);
          document.getElementById('sidebar').classList.remove('open');
          document.getElementById('mobile-overlay').classList.remove('open');
        });
        nav.appendChild(li);
      }
    }
  }

  function setActiveSection(key) {
    activeSection = key;
    document.querySelectorAll('#nav-list li').forEach(li => {
      li.classList.toggle('active', li.dataset.section === key);
    });
    document.querySelectorAll('.section').forEach(sec => {
      sec.classList.toggle('active', sec.dataset.section === key);
    });
    // Rebuild per-species content if needed
    if (SCHEMA[key]?.perSpecies) {
      rebuildSpeciesTabs(key);
      if (SCHEMA[key]?.multiPerSpecies) {
        rebuildInjectorTabs(key);
      }
    }
  }

  // ---- Build sections ----
  function buildSections() {
    const container = document.getElementById('sections');
    container.innerHTML = '';
    for (const item of SECTION_ORDER) {
      if (item.header) continue;
      const sec = SCHEMA[item];
      const div = document.createElement('div');
      div.className = 'section';
      div.dataset.section = item;
      div.innerHTML = buildSectionHTML(item, sec);
      container.appendChild(div);
      bindSectionInputs(div, item, sec);
    }
  }

  function buildSectionHTML(skey, sec) {
    let html = `<h2>${sec.label} <span class="tag ${sec.required ? '' : 'optional'}">${sec.required ? 'Required' : 'Optional'}</span></h2>`;
    html += `<p class="section-desc">${sec.desc}</p>`;

    // Optional toggle
    if (sec.enabled === false) {
      html += `<div class="field-row" style="border-bottom:1px solid var(--border);margin-bottom:12px;padding-bottom:12px">`;
      html += `<div class="field-label"><span class="name">Enable section</span></div>`;
      html += `<div class="field-input"><div class="checkbox-row">`;
      html += `<input type="checkbox" data-key="_enabled" data-section="${skey}">`;
      html += `</div></div></div>`;
    }

    if (sec.perSpecies) {
      html += `<div class="species-tabs" data-section="${skey}"></div>`;
      if (sec.multiPerSpecies) {
        html += `<div class="injector-tabs" data-section="${skey}"></div>`;
        html += `<div class="validation-msg" data-section="${skey}"></div>`;
      }
      html += `<div class="species-content" data-section="${skey}">`;
      html += buildFieldsHTML(skey, sec, 0);
      html += `</div>`;
    } else {
      html += buildFieldsHTML(skey, sec);
    }
    return html;
  }

  function buildFieldsHTML(skey, sec, speciesIdx) {
    let html = '';
    const groups = sec.groups || [{ title: null, keys: sec.fields.map(f => f.key) }];

    for (const group of groups) {
      html += `<div class="field-group">`;
      if (group.title) {
        html += `<div class="field-group-title">${group.title}</div>`;
      }
      for (const fkey of group.keys) {
        const field = sec.fields.find(f => f.key === fkey);
        if (!field) continue;
        html += buildFieldRow(skey, field, speciesIdx);
      }
      html += `</div>`;
    }
    return html;
  }

  function buildFieldRow(skey, field, speciesIdx) {
    const dataAttr = speciesIdx !== undefined
      ? `data-section="${skey}" data-key="${field.key}" data-species="${speciesIdx}"`
      : `data-section="${skey}" data-key="${field.key}"`;
    const arrSize = getArraySize(field.dim, currentDim);
    const dimClass = getDimVisibilityClass(field);

    let inputHTML = '';

    if (arrSize > 0 && field.type !== 'str') {
      inputHTML = buildArrayInput(skey, field, arrSize, speciesIdx);
    } else if (field.type === 'bool' && arrSize === 0) {
      inputHTML = `<div class="checkbox-row">
        <input type="checkbox" ${dataAttr}>
        <span>${field.hint || ''}</span>
      </div>`;
    } else if (field.options && field.type !== 'strarr') {
      inputHTML = `<select ${dataAttr}>`;
      for (const opt of field.options) {
        inputHTML += `<option value="${opt}">${opt}</option>`;
      }
      inputHTML += `</select>`;
    } else if (field.textarea) {
      inputHTML = `<textarea ${dataAttr} rows="2" placeholder="${field.hint || ''}"></textarea>`;
    } else {
      const extra = field.type === 'int' ? ' inputmode="numeric" class="int-field"' : '';
      inputHTML = `<input type="text" ${dataAttr}${extra} placeholder="${field.default ?? ''}">`;
    }

    return `<div class="field-row ${dimClass}">
      <div class="field-label">
        <span class="name">${field.label}</span>
        <span class="hint">${field.hint || ''}</span>
      </div>
      <div class="field-input">${inputHTML}</div>
    </div>`;
  }

  function buildArrayInput(skey, field, arrSize, speciesIdx) {
    const labels = field.dimLabels || [];
    const dataAttr = speciesIdx !== undefined
      ? `data-section="${skey}" data-key="${field.key}" data-species="${speciesIdx}"`
      : `data-section="${skey}" data-key="${field.key}"`;

    if (field.type === 'strarr') {
      let html = '<div class="array-inputs">';
      for (let i = 0; i < arrSize; i++) {
        const dimVis = getArrayElementDimClass(field, i);
        html += `<div class="array-col ${dimVis}">`;
        if (labels[i]) html += `<span class="label">${labels[i]}</span>`;
        html += `<select ${dataAttr} data-index="${i}">`;
        for (const opt of (field.options || [])) {
          html += `<option value="${opt}">${opt}</option>`;
        }
        html += `</select></div>`;
      }
      html += '</div>';
      return html;
    }

    if (field.type === 'bool') {
      let html = '<div class="array-inputs">';
      for (let i = 0; i < arrSize; i++) {
        const dimVis = getArrayElementDimClass(field, i);
        html += `<div class="array-col ${dimVis}">`;
        if (labels[i]) html += `<span class="label">${labels[i]}</span>`;
        html += `<div class="checkbox-row"><input type="checkbox" ${dataAttr} data-index="${i}"></div>`;
        html += `</div>`;
      }
      html += '</div>';
      return html;
    }

    // Numeric arrays - only show arrSize inputs, but for DIM-dependent fields
    // show up to max and hide with CSS
    const maxSize = getMaxArraySize(field.dim);
    let html = '<div class="array-inputs">';
    for (let i = 0; i < maxSize; i++) {
      const dimVis = getArrayElementDimClass(field, i);
      html += `<div class="array-col ${dimVis}">`;
      if (labels[i]) html += `<span class="label">${labels[i]}</span>`;
      const extraAttr = field.type === 'int' ? ' inputmode="numeric" class="int-field"' : '';
      html += `<input type="text" ${dataAttr} data-index="${i}"${extraAttr} style="width:80px">`;
      html += `</div>`;
    }
    html += '</div>';
    return html;
  }

  function getMaxArraySize(dimSpec) {
    if (dimSpec === 'DIM') return 3;
    if (dimSpec === 'DIM2') return 6;
    if (dimSpec === 'VDIM' || dimSpec === 'VDIM_STR') return 3;
    if (typeof dimSpec === 'number') return dimSpec;
    return 0;
  }

  function getDimVisibilityClass(field) {
    // Hide entire row based on dim? Not typically needed
    return '';
  }

  function getArrayElementDimClass(field, idx) {
    // For DIM-dependent arrays, hide elements beyond current dim
    if (field.dim === 'DIM') {
      return idx >= currentDim ? 'dim-hidden' : '';
    }
    if (field.dim === 'DIM2') {
      return idx >= currentDim * 2 ? 'dim-hidden' : '';
    }
    return '';
  }

  // ---- Species tabs ----
  function rebuildSpeciesTabs(skey) {
    const container = document.querySelector(`.species-tabs[data-section="${skey}"]`);
    if (!container) return;
    const count = getSpeciesCount();
    container.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const btn = document.createElement('button');
      btn.textContent = `Species ${i+1}`;
      btn.className = (activeSpeciesIdx[skey] === i) ? 'active' : '';
      btn.addEventListener('click', () => {
        activeSpeciesIdx[skey] = i;
        rebuildSpeciesTabs(skey);
        rebuildSpeciesContent(skey);
      });
      container.appendChild(btn);
    }
  }

  function rebuildSpeciesContent(skey) {
    const container = document.querySelector(`.species-content[data-section="${skey}"]`);
    if (!container) return;
    const sec = SCHEMA[skey];
    const spIdx = activeSpeciesIdx[skey] || 0;
    if (sec.multiPerSpecies) {
      rebuildInjectorTabs(skey);
    }
    container.innerHTML = buildFieldsHTML(skey, sec, spIdx);
    bindSectionInputs(container, skey, sec, spIdx);
    loadStateToUI_section(skey);
    if (sec.multiPerSpecies) {
      validateInjector(skey, spIdx);
    }
  }

  // ---- Injector tabs ----
  function rebuildInjectorTabs(skey) {
    const container = document.querySelector(`.injector-tabs[data-section="${skey}"]`);
    if (!container) return;
    const spIdx = activeSpeciesIdx[skey] || 0;
    const injectors = state[skey]?.[spIdx] || [];
    const injIdx = activeInjectorIdx[spIdx] || 0;
    const maxCount = SCHEMA[skey].maxCount || 10;
    container.innerHTML = '';
    for (let i = 0; i < injectors.length; i++) {
      const btn = document.createElement('button');
      btn.textContent = `Injector ${i+1}`;
      btn.className = (injIdx === i) ? 'active' : '';
      btn.addEventListener('click', () => {
        activeInjectorIdx[spIdx] = i;
        rebuildInjectorTabs(skey);
        rebuildInjectorContent(skey);
      });
      container.appendChild(btn);
    }
    if (injectors.length < maxCount) {
      const addBtn = document.createElement('button');
      addBtn.textContent = '+ Add';
      addBtn.className = 'add';
      addBtn.addEventListener('click', () => {
        const newInj = buildDefaults(SCHEMA[skey]);
        // Inherit _enabled from existing injectors
        if (injectors.length > 0 && injectors[0]._enabled) newInj._enabled = true;
        injectors.push(newInj);
        activeInjectorIdx[spIdx] = injectors.length - 1;
        rebuildInjectorTabs(skey);
        rebuildInjectorContent(skey);
        updatePreview();
      });
      container.appendChild(addBtn);
    }
    if (injectors.length > 1) {
      const rmBtn = document.createElement('button');
      rmBtn.textContent = '\u2212 Remove';
      rmBtn.className = 'remove';
      rmBtn.addEventListener('click', () => {
        const cur = activeInjectorIdx[spIdx];
        injectors.splice(cur, 1);
        if (activeInjectorIdx[spIdx] >= injectors.length) activeInjectorIdx[spIdx] = injectors.length - 1;
        rebuildInjectorTabs(skey);
        rebuildInjectorContent(skey);
        updatePreview();
      });
      container.appendChild(rmBtn);
    }
  }

  function rebuildInjectorContent(skey) {
    const container = document.querySelector(`.species-content[data-section="${skey}"]`);
    if (!container) return;
    const sec = SCHEMA[skey];
    const spIdx = activeSpeciesIdx[skey] || 0;
    container.innerHTML = buildFieldsHTML(skey, sec, spIdx);
    bindSectionInputs(container, skey, sec, spIdx);
    loadStateToUI_section(skey);
    validateInjector(skey, spIdx);
  }

  // ---- Bind inputs ----
  function bindSectionInputs(container, skey, sec, speciesIdx) {
    container.querySelectorAll('input, select, textarea').forEach(el => {
      const elSection = el.dataset.section;
      const elKey = el.dataset.key;
      if (!elSection || !elKey) return;

      const onChange = () => {
        const field = sec.fields.find(f => f.key === elKey);
        if (!field && elKey !== '_enabled') return;
        const spIdx = el.dataset.species !== undefined ? parseInt(el.dataset.species) : undefined;
        const arrIdx = el.dataset.index !== undefined ? parseInt(el.dataset.index) : undefined;

        let target;
        if (spIdx !== undefined && sec.multiPerSpecies) {
          const injIdx = activeInjectorIdx[spIdx] || 0;
          if (!state[elSection][spIdx]) state[elSection][spIdx] = [buildDefaults(sec)];
          if (!state[elSection][spIdx][injIdx]) state[elSection][spIdx][injIdx] = buildDefaults(sec);
          target = state[elSection][spIdx][injIdx];
        } else if (spIdx !== undefined) {
          target = state[elSection][spIdx] = state[elSection][spIdx] || {};
        } else {
          target = state[elSection] = state[elSection] || {};
        }

        if (elKey === '_enabled') {
          if (sec.multiPerSpecies) {
            // Set _enabled on ALL injectors for ALL species
            for (const spArr of state[elSection]) {
              if (Array.isArray(spArr)) {
                for (const inj of spArr) inj._enabled = el.checked;
              }
            }
          } else if (sec.perSpecies && spIdx !== undefined) {
            target._enabled = el.checked;
          } else {
            target._enabled = el.checked;
          }
          updatePreview();
          return;
        }

        if (arrIdx !== undefined) {
          if (!Array.isArray(target[elKey])) target[elKey] = [];
          if (field.type === 'bool') {
            target[elKey][arrIdx] = el.checked;
          } else if (field.type === 'strarr') {
            target[elKey][arrIdx] = el.value;
          } else if (field.type === 'int') {
            target[elKey][arrIdx] = parseInt(el.value) || 0;
          } else {
            target[elKey][arrIdx] = el.value;
          }
        } else {
          if (field.type === 'bool') {
            target[elKey] = el.checked;
          } else if (field.type === 'int') {
            target[elKey] = parseInt(el.value) || 0;
          } else if (field.type === 'real') {
            target[elKey] = el.value; // Keep as string to preserve user formatting
          } else {
            target[elKey] = el.value;
          }
        }

        // Special: num_species changed
        if (elKey === 'num_species') {
          const count = Math.max(1, Math.min(10, parseInt(el.value) || 1));
          state.particles.num_species = count;
          ensureSpeciesArrays(count);
          // Rebuild species tabs for all per-species sections
          for (const [k, s] of Object.entries(SCHEMA)) {
            if (s.perSpecies) rebuildSpeciesTabs(k);
          }
        }

        // Validate injectors on change
        if (sec.multiPerSpecies && spIdx !== undefined) {
          validateInjector(elSection, spIdx);
        }

        updatePreview();
      };

      el.addEventListener('input', onChange);
      el.addEventListener('change', onChange);
    });
  }

  // ---- Load state to UI ----
  function loadStateToUI() {
    for (const item of SECTION_ORDER) {
      if (item.header) continue;
      loadStateToUI_section(item);
    }
  }

  function loadStateToUI_section(skey) {
    const sec = SCHEMA[skey];
    if (!sec) return;

    if (sec.multiPerSpecies) {
      const spIdx = activeSpeciesIdx[skey] || 0;
      const injIdx = activeInjectorIdx[spIdx] || 0;
      const data = state[skey]?.[spIdx]?.[injIdx] || {};
      loadDataToInputs(skey, data, spIdx);
    } else if (sec.perSpecies) {
      const idx = activeSpeciesIdx[skey] || 0;
      const data = state[skey]?.[idx] || {};
      loadDataToInputs(skey, data, idx);
    } else {
      const data = state[skey] || {};
      loadDataToInputs(skey, data);
    }
  }

  function loadDataToInputs(skey, data, speciesIdx) {
    const sec = SCHEMA[skey];
    // Enable toggle
    const enableEl = document.querySelector(`input[data-section="${skey}"][data-key="_enabled"]`);
    if (enableEl) enableEl.checked = !!data._enabled;

    for (const field of sec.fields) {
      const val = data[field.key];
      if (val === undefined) continue;

      const selector = speciesIdx !== undefined
        ? `[data-section="${skey}"][data-key="${field.key}"][data-species="${speciesIdx}"]`
        : `[data-section="${skey}"][data-key="${field.key}"]:not([data-species])`;

      const arrSize = getArraySize(field.dim, currentDim);

      if (arrSize > 0 && Array.isArray(val)) {
        // Array inputs
        for (let i = 0; i < val.length; i++) {
          const el = document.querySelector(`${selector}[data-index="${i}"]`);
          if (!el) continue;
          if (field.type === 'bool') {
            el.checked = !!val[i];
          } else {
            el.value = val[i] ?? '';
          }
        }
      } else {
        // Scalar
        const els = document.querySelectorAll(selector + ':not([data-index])');
        els.forEach(el => {
          if (field.type === 'bool') {
            el.checked = !!val;
          } else {
            el.value = val ?? '';
          }
        });
      }
    }
  }

  // ---- Dimension change ----
  function onDimChange(e) {
    currentDim = parseInt(e.target.value);
    // Update DIM-dependent array sizes in state
    for (const [key, sec] of Object.entries(SCHEMA)) {
      if (sec.multiPerSpecies) {
        for (const spArr of state[key]) {
          if (Array.isArray(spArr)) {
            for (const injData of spArr) {
              adjustDimArrays(sec, injData);
            }
          }
        }
      } else if (sec.perSpecies) {
        for (const spData of state[key]) {
          adjustDimArrays(sec, spData);
        }
      } else {
        adjustDimArrays(sec, state[key]);
      }
    }
    // Update CSS visibility of array elements
    document.querySelectorAll('.array-col').forEach(col => {
      // Re-evaluate visibility based on parent field
      // Simpler: just rebuild everything
    });
    buildSections();
    loadStateToUI();
    setActiveSection(activeSection);
    updatePreview();
  }

  function adjustDimArrays(sec, data) {
    if (!data) return;
    for (const field of sec.fields) {
      const newSize = getArraySize(field.dim, currentDim);
      const maxSize = getMaxArraySize(field.dim);
      if (newSize > 0 && Array.isArray(data[field.key])) {
        // Ensure array is at least newSize
        while (data[field.key].length < newSize) {
          const defVal = field.default?.[data[field.key].length] ?? (field.type === 'strarr' ? 'per' : 0);
          data[field.key].push(defVal);
        }
      }
    }
  }

  // ---- Injector validation ----
  function validateInjector(skey, spIdx) {
    const msgEl = document.querySelector(`.validation-msg[data-section="${skey}"]`);
    if (!msgEl) return;
    const container = document.querySelector(`.species-content[data-section="${skey}"]`);
    const injIdx = activeInjectorIdx[spIdx] || 0;
    const data = state[skey]?.[spIdx]?.[injIdx];
    if (!data) { msgEl.innerHTML = ''; return; }

    const boxsize = state.grid_space?.boxsize || [];
    const warnings = [];
    const plane = (data.plane || 'yz').toLowerCase();

    // Determine which axis planepos refers to and the box limits for boundary
    // Boundary array layout: for N=(DIM-1) in-plane dims, it's [st1, st2, ..., end1, end2, ...]
    // i.e., boundary(1:N) are starts, boundary(N+1:2N) are ends
    // In 2D: 1 in-plane dim → boundary = [start, end] (2 elements)
    // In 3D: 2 in-plane dims → boundary = [st1, st2, end1, end2] (4 elements)
    const nInPlane = currentDim - 1;
    let planeAxis, planeMax, bdAxes = [];
    if (plane === 'yz') {
      planeAxis = 'x'; planeMax = Number(boxsize[0]) || 0;
      if (currentDim >= 2) bdAxes.push({ label: 'y', max: Number(boxsize[1]) || 0, stIdx: 0, endIdx: nInPlane });
      if (currentDim >= 3) bdAxes.push({ label: 'z', max: Number(boxsize[2]) || 0, stIdx: 1, endIdx: nInPlane + 1 });
    } else if (plane === 'xz') {
      planeAxis = 'y'; planeMax = currentDim >= 2 ? (Number(boxsize[1]) || 0) : 0;
      bdAxes.push({ label: 'x', max: Number(boxsize[0]) || 0, stIdx: 0, endIdx: nInPlane });
      if (currentDim >= 3) bdAxes.push({ label: 'z', max: Number(boxsize[2]) || 0, stIdx: 1, endIdx: nInPlane + 1 });
    } else { // xy
      planeAxis = 'z'; planeMax = currentDim >= 3 ? (Number(boxsize[2]) || 0) : 0;
      bdAxes.push({ label: 'x', max: Number(boxsize[0]) || 0, stIdx: 0, endIdx: nInPlane });
      if (currentDim >= 2) bdAxes.push({ label: 'y', max: Number(boxsize[1]) || 0, stIdx: 1, endIdx: nInPlane + 1 });
    }

    // Update planepos hint to show axis and range
    const ppHint = container?.querySelector(`[data-key="planepos"]`);
    if (ppHint) {
      const hintEl = ppHint.closest('.field-row')?.querySelector('.hint');
      if (hintEl) {
        hintEl.textContent = planeMax > 0
          ? `Position along ${planeAxis} axis (0 … ${planeMax})`
          : `Position along ${planeAxis} axis`;
      }
    }

    // Validate planepos
    const pp = Number(data.planepos) || 0;
    if (planeMax > 0) {
      if (pp < 0) warnings.push(`planepos (${pp}) is below 0 — will be clipped to 0`);
      if (pp > planeMax) warnings.push(`planepos (${pp}) exceeds boxsize(${planeAxis})=${planeMax} — will be clipped`);
    }

    // Update boundary array labels and hint to show axis names based on selected plane
    if (container) {
      const bdInput = container.querySelector('[data-key="boundary"]');
      if (bdInput) {
        const fieldRow = bdInput.closest('.field-row');
        const arrayDiv = bdInput.closest('.array-col')?.parentElement;
        if (arrayDiv) {
          const axLabels = bdAxes.map(a => a.label);
          const labelArr = [...axLabels.map(l => `${l}-start`), ...axLabels.map(l => `${l}-end`)];
          const labelEls = arrayDiv.querySelectorAll('.array-col .label');
          labelEls.forEach((el, i) => { if (labelArr[i]) el.textContent = labelArr[i]; });
        }
        // Update boundary hint with in-plane axis info
        const bdHint = fieldRow?.querySelector('.hint');
        if (bdHint) {
          const axDesc = bdAxes.map(a => a.max > 0 ? `${a.label}: 0…${a.max}` : a.label).join(', ');
          bdHint.textContent = `In-plane bounds (${axDesc})`;
        }
      }
    }

    // Validate boundary
    const bd = data.boundary || [];
    for (const ax of bdAxes) {
      if (ax.max <= 0) continue;
      const st = Number(bd[ax.stIdx]) || 0;
      const en = Number(bd[ax.endIdx]) || 0;
      if (st < 0) warnings.push(`boundary ${ax.label}-start (${st}) is below 0 — will be clipped`);
      if (en > ax.max) warnings.push(`boundary ${ax.label}-end (${en}) exceeds boxsize(${ax.label})=${ax.max} — will be clipped`);
      if (st > en && en > 0) warnings.push(`boundary ${ax.label}-start (${st}) > ${ax.label}-end (${en})`);
    }

    if (warnings.length > 0) {
      msgEl.innerHTML = warnings.map(w => `<div class="validation-warn">\u26a0 ${w}</div>`).join('');
    } else {
      msgEl.innerHTML = '';
    }
  }

  // ---- Preview ----
  function updatePreview() {
    const text = generateInputFile(state, currentDim);
    document.getElementById('preview-text').textContent = text;
  }

  // ---- Actions ----
  function onGenerate() {
    const text = generateInputFile(state, currentDim);
    const blob = new Blob([text], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'input';
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Input file downloaded!');
  }

  function onCopy() {
    const text = document.getElementById('preview-text').textContent;
    navigator.clipboard.writeText(text).then(() => toast('Copied to clipboard!'));
  }

  function onFileLoad(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = parseInputFile(ev.target.result);
        applyParsedState(parsed);
        toast(`Loaded ${file.name}`);
      } catch (err) {
        toast('Error parsing file: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset
  }

  function applyParsedState(parsed) {
    if (parsed._dim) {
      currentDim = parsed._dim;
      document.getElementById('dim-select').value = currentDim;
    }

    for (const [key, sec] of Object.entries(SCHEMA)) {
      if (parsed[key]) {
        if (sec.multiPerSpecies) {
          if (Array.isArray(parsed[key])) {
            state[key] = parsed[key].map(spArr => {
              if (Array.isArray(spArr)) {
                return spArr.map(d => ({ ...buildDefaults(sec), ...d, _enabled: true }));
              }
              return [buildDefaults(sec)];
            });
          }
        } else if (sec.perSpecies) {
          if (Array.isArray(parsed[key])) {
            state[key] = parsed[key].map((d, i) => {
              return { ...buildDefaults(sec), ...d };
            });
          }
        } else {
          state[key] = { ...buildDefaults(sec), ...parsed[key] };
        }
      }
    }

    // Ensure species arrays match num_species
    const count = state.particles?.num_species || 1;
    ensureSpeciesArrays(count);

    buildSections();
    loadStateToUI();
    setActiveSection(activeSection);
    for (const [k, s] of Object.entries(SCHEMA)) {
      if (s.perSpecies) rebuildSpeciesTabs(k);
    }
    updatePreview();
  }

  // ---- Presets ----
  function buildPresetList() {
    const list = document.getElementById('preset-list');
    list.innerHTML = '';
    for (const preset of PRESETS) {
      const btn = document.createElement('button');
      btn.innerHTML = `<strong>${preset.name}</strong><span class="preset-desc">${preset.desc}</span>`;
      btn.addEventListener('click', () => {
        applyPreset(preset);
        hidePresetModal();
      });
      list.appendChild(btn);
    }
  }

  function applyPreset(preset) {
    currentDim = preset.dim || 2;
    document.getElementById('dim-select').value = currentDim;
    initState();

    for (const [key, val] of Object.entries(preset.values)) {
      const sec = SCHEMA[key];
      if (!sec) continue;
      if (sec.multiPerSpecies && Array.isArray(val)) {
        for (let i = 0; i < val.length; i++) {
          if (Array.isArray(val[i])) {
            state[key][i] = val[i].map(d => ({ ...buildDefaults(sec), ...d, _enabled: true }));
          }
        }
      } else if (sec.perSpecies && Array.isArray(val)) {
        for (let i = 0; i < val.length; i++) {
          state[key][i] = { ...state[key][i], ...val[i] };
        }
      } else if (!sec.perSpecies && typeof val === 'object' && !Array.isArray(val)) {
        state[key] = { ...state[key], ...val };
      }
    }

    ensureSpeciesArrays(getSpeciesCount());
    buildSections();
    loadStateToUI();
    setActiveSection(activeSection);
    for (const [k, s] of Object.entries(SCHEMA)) {
      if (s.perSpecies) rebuildSpeciesTabs(k);
    }
    updatePreview();
    toast(`Loaded preset: ${preset.name}`);
  }

  function showPresetModal() { document.getElementById('preset-modal').classList.remove('hidden'); }
  function hidePresetModal() { document.getElementById('preset-modal').classList.add('hidden'); }

  // ---- Toast ----
  function toast(msg) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2200);
  }

  // ---- Go ----
  document.addEventListener('DOMContentLoaded', init);
})();
