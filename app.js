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

    // Render dt formula once KaTeX is ready
    autoUpdateDt();
    if (typeof katex !== 'undefined') {
      updateDtRecommendation();
    } else {
      document.querySelector('script[src*="katex"]')?.addEventListener('load', () => updateDtRecommendation());
    }

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
        activeSpeciesIdx[key] = 0;
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
      if (key === 'diag_species') {
        const spIdx = activeSpeciesIdx[key] || 0;
        validateDiagSpecies(key, spIdx);
      }
    }
    if (key === 'time') {
      updateDtRecommendation();
    }
    validateSection(key);
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

    html += `<div class="validation-msg" data-section="${skey}"></div>`;
    if (sec.perSpecies) {
      html += `<div class="species-tabs" data-section="${skey}"></div>`;
      if (sec.multiPerSpecies) {
        html += `<div class="injector-tabs" data-section="${skey}"></div>`;
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
    } else if (field.phaseCheckboxes) {
      inputHTML = buildPhaseCheckboxes(skey, field, speciesIdx);
    } else if (field.textarea) {
      inputHTML = `<textarea ${dataAttr} rows="2" placeholder="${field.hint || ''}"></textarea>`;
    } else {
      const extra = field.type === 'int' ? ' inputmode="numeric" class="int-field"' : '';
      inputHTML = `<input type="text" ${dataAttr}${extra} placeholder="${field.default ?? ''}">`;
    }

    let extraHTML = '';
    if (skey === 'time' && field.key === 'dt') {
      extraHTML = `<div class="dt-formula" id="dt-formula"></div>`;
    }

    return `<div class="field-row ${dimClass}">
      <div class="field-label">
        <span class="name">${field.label}</span>
        <span class="hint">${field.hint || ''}</span>
      </div>
      <div class="field-input">${extraHTML}${inputHTML}</div>
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
        if (field.options) {
          html += `<select ${dataAttr} data-index="${i}">`;
          for (const opt of field.options) {
            html += `<option value="${opt}">${opt}</option>`;
          }
          html += `</select>`;
        } else {
          html += `<input type="text" ${dataAttr} data-index="${i}">`;
        }
        html += `</div>`;
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
      const defVal = Array.isArray(field.default) ? (field.default[i] ?? '') : '';
      html += `<input type="text" ${dataAttr} data-index="${i}"${extraAttr} style="width:80px" placeholder="${defVal}">`;
      html += `</div>`;
    }
    html += '</div>';
    return html;
  }

  function buildPhaseCheckboxes(skey, field, speciesIdx) {
    const dataAttr = speciesIdx !== undefined
      ? `data-section="${skey}" data-key="${field.key}" data-species="${speciesIdx}"`
      : `data-section="${skey}" data-key="${field.key}"`;
    // Group the options
    const groups = {};
    for (const opt of field.phaseOptions) {
      if (!groups[opt.group]) groups[opt.group] = [];
      groups[opt.group].push(opt);
    }
    let html = '<div class="phase-checkbox-grid">';
    for (const [groupName, opts] of Object.entries(groups)) {
      const anyVisible = opts.some(o => o.minDim <= currentDim);
      const groupHidden = anyVisible ? '' : 'dim-hidden';
      html += `<div class="phase-group ${groupHidden}">`;
      html += `<div class="phase-group-label">${groupName}</div>`;
      html += `<div class="phase-group-items">`;
      for (const opt of opts) {
        // minDim 0 or 1 = always visible; 2 = needs DIM>=2; 3 = needs DIM>=3
        const hidden = opt.minDim > currentDim ? 'dim-hidden' : '';
        html += `<label class="phase-cb-label ${hidden}" data-mindim="${opt.minDim}">`;
        html += `<input type="checkbox" ${dataAttr} data-phase="${opt.name}">`;
        html += `<span>${opt.name}</span></label>`;
      }
      html += `</div></div>`;
    }
    html += '</div>';
    return html;
  }

  function getMaxArraySize(dimSpec) {
    if (dimSpec === 'DIM') return 3;
    if (dimSpec === 'DIM2') return 6;
    if (dimSpec === 'BDIM') return 4;
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
    if (field.dim === 'BDIM') {
      return idx >= (currentDim - 1) * 2 ? 'dim-hidden' : '';
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
    if (skey === 'diag_species') {
      validateDiagSpecies(skey, spIdx);
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
        // Snap to right x edge with full boundary span, inherit species vth
        if (skey === 'plasma_injector') {
          const boxsize = (state.grid_space?.boxsize || []).map(Number);
          newInj.plane = 'yz';
          newInj.planepos = boxsize[0] || 0;
          const nInPlane = currentDim - 1;
          const bd = new Array(nInPlane * 2).fill(0);
          if (nInPlane >= 1) bd[nInPlane] = boxsize[1] || 0;
          if (nInPlane >= 2) bd[nInPlane + 1] = boxsize[2] || 0;
          newInj.boundary = bd;
          const spData = state.species?.[spIdx];
          if (spData) newInj.vth = spData.vth ?? newInj.vth;
        }
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
        const oldBoxsize = (state.grid_space?.boxsize || []).map(Number);
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
            const boxsize = (state.grid_space?.boxsize || []).map(Number);
            for (const spArr of state[elSection]) {
              if (Array.isArray(spArr)) {
                for (const inj of spArr) {
                  inj._enabled = el.checked;
                  if (el.checked && elSection === 'plasma_injector') {
                    // Default: yz plane at right x edge, boundary spans full box
                    inj.plane = inj.plane || 'yz';
                    inj.planepos = boxsize[0] || 0;
                    const nInPlane = currentDim - 1;
                    const bd = new Array(nInPlane * 2).fill(0);
                    // ends are at indices [nInPlane .. 2*nInPlane-1]
                    if (nInPlane >= 1) bd[nInPlane] = boxsize[1] || 0;     // end_y
                    if (nInPlane >= 2) bd[nInPlane + 1] = boxsize[2] || 0; // end_z
                    inj.boundary = bd;
                  }
                }
              }
            }
            // Refresh UI if viewing injector section
            if (activeSection === 'plasma_injector') {
              const spIdx2 = activeSpeciesIdx['plasma_injector'] || 0;
              rebuildInjectorContent('plasma_injector', spIdx2);
            }
          } else if (sec.perSpecies && spIdx !== undefined) {
            target._enabled = el.checked;
          } else {
            target._enabled = el.checked;
          }
          updatePreview();
          return;
        }

        // Phase checkbox handling
        if (field && field.phaseCheckboxes && el.dataset.phase) {
          // Collect all checked phase checkboxes for this field
          const cbSelector = speciesIdx !== undefined
            ? `[data-section="${skey}"][data-key="${field.key}"][data-species="${spIdx}"][data-phase]`
            : `[data-section="${skey}"][data-key="${field.key}"][data-phase]`;
          const checked = [];
          container.querySelectorAll(cbSelector).forEach(cb => {
            if (cb.checked) checked.push(cb.dataset.phase);
          });
          target[elKey] = checked.join(',');
          if (elSection === 'diag_species' && spIdx !== undefined) {
            validateDiagSpecies(elSection, spIdx);
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

        // Validate diag_species on change
        if (elSection === 'diag_species' && spIdx !== undefined) {
          validateDiagSpecies(elSection, spIdx);
        }

        updatePreview();

        // Cross-section: if ncells, niter, or ndump changed, update diag_species estimates
        if ((elSection === 'grid_space' && elKey === 'ncells') ||
            (elSection === 'time' && elKey === 'niter') ||
            (elSection === 'global_output' && elKey === 'ndump')) {
          const diagSpIdx = activeSpeciesIdx['diag_species'] || 0;
          if (activeSection === 'diag_species') {
            validateDiagSpecies('diag_species', diagSpIdx);
          }
        }

        // Cross-section: if boxsize, ncells, or c changed, update dt recommendation and auto-set dt
        if ((elSection === 'grid_space' && (elKey === 'boxsize' || elKey === 'ncells')) ||
            (elSection === 'time' && elKey === 'c')) {
          updateDtRecommendation();
          autoUpdateDt();
        }

        // Cross-section: if boxsize changed, move injectors that sit at the old edge
        if (elSection === 'grid_space' && elKey === 'boxsize') {
          syncInjectorsToBoxsize(oldBoxsize);
        }

        // Section validations
        if (elSection === 'grid_space') validateSection('grid_space');
        if (elSection === 'time') {
          validateSection('time');
          validateSection('global_output'); // ndump vs niter
        }
        if (elSection === 'global_output') {
          validateSection('global_output');
          validateSection('raw_diag'); // raw_ndump vs ndump
        }
        if (elSection === 'raw_diag') validateSection('raw_diag');
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
      } else if (field.phaseCheckboxes) {
        // Phase checkboxes: val is a comma-separated string
        const selected = String(val || '').split(',').map(s => s.trim()).filter(s => s);
        document.querySelectorAll(`${selector}[data-phase]`).forEach(cb => {
          cb.checked = selected.includes(cb.dataset.phase);
        });
      } else {
        // Scalar
        const els = document.querySelectorAll(selector + ':not([data-index]):not([data-phase])');
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
    updateDtRecommendation();
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
      // Filter out dim-incompatible phase space selections
      if (field.phaseCheckboxes && typeof data[field.key] === 'string') {
        const selected = data[field.key].split(',').map(s => s.trim()).filter(s => s);
        const filtered = selected.filter(name => {
          const opt = field.phaseOptions.find(o => o.name === name);
          return opt ? opt.minDim <= currentDim : true;
        });
        data[field.key] = filtered.join(',');
      }
    }
  }

  // ---- Sync injector planepos/boundary when boxsize changes ----
  function syncInjectorsToBoxsize(oldBoxsize) {
    const newBoxsize = (state.grid_space?.boxsize || []).map(Number);
    const injectors = state.plasma_injector;
    if (!injectors || !Array.isArray(injectors)) return;

    const eps = 1e-6;
    const planeAxisIdx = { yz: 0, xz: 1, xy: 2 };
    // For boundary: in-plane axes per plane type
    const inPlaneAxes = {
      yz: [1, 2],  // y, z
      xz: [0, 2],  // x, z
      xy: [0, 1],  // x, y
    };

    let changed = false;
    for (const spArr of injectors) {
      if (!Array.isArray(spArr)) continue;
      for (const inj of spArr) {
        if (!inj) continue;
        const plane = (inj.plane || 'yz').toLowerCase();

        // Sync planepos if it was at the old boxsize edge
        const axIdx = planeAxisIdx[plane];
        if (axIdx !== undefined && axIdx < oldBoxsize.length) {
          const oldMax = oldBoxsize[axIdx];
          const pp = Number(inj.planepos) || 0;
          if (Math.abs(pp - oldMax) < eps * Math.max(1, Math.abs(oldMax))) {
            inj.planepos = newBoxsize[axIdx] || 0;
            changed = true;
          }
        }

        // Sync boundary ends if they were at the old boxsize edge
        const axes = (inPlaneAxes[plane] || []).filter(ai => ai < currentDim);
        const bd = inj.boundary;
        if (Array.isArray(bd)) {
          const nInPlane = axes.length;
          for (let i = 0; i < nInPlane; i++) {
            const ai = axes[i];
            if (ai >= oldBoxsize.length) continue;
            const oldMax = oldBoxsize[ai];
            const newMax = newBoxsize[ai] || 0;
            // Check end values (at indices nInPlane + i)
            const endIdx = nInPlane + i;
            if (endIdx < bd.length) {
              const endVal = Number(bd[endIdx]) || 0;
              if (Math.abs(endVal - oldMax) < eps * Math.max(1, Math.abs(oldMax))) {
                bd[endIdx] = newMax;
                changed = true;
              }
            }
          }
        }
      }
    }

    if (changed) {
      // Refresh injector UI if currently viewing it
      if (activeSection === 'plasma_injector') {
        const spIdx = activeSpeciesIdx['plasma_injector'] || 0;
        rebuildInjectorContent('plasma_injector', spIdx);
      }
      updatePreview();
    }
  }

  // ---- Auto-update dt using CFL: dt = 0.5 / (c * sqrt(sum(1/dx_i^2))) ----
  function autoUpdateDt() {
    const ncells = state.grid_space?.ncells || [];
    const boxsize = state.grid_space?.boxsize || [];
    const c = parseFloat(state.time?.c) || 100;
    if (c <= 0) return;

    let sumInvDx2 = 0;
    for (let i = 0; i < currentDim; i++) {
      const L = parseFloat(boxsize[i]) || 1;
      const N = parseInt(ncells[i]) || 1;
      const dx = L / N;
      sumInvDx2 += 1 / (dx * dx);
    }
    if (sumInvDx2 <= 0) return;

    const dt = 0.5 / (c * Math.sqrt(sumInvDx2));
    const dtStr = dt.toPrecision(4);
    state.time.dt = parseFloat(dtStr);

    const dtInput = document.querySelector('[data-section="time"][data-key="dt"]');
    if (dtInput) {
      dtInput.value = dtStr;
    }
    updatePreview();
  }

  // ---- dt recommendation ----
  function updateDtRecommendation() {
    const container = document.getElementById('dt-formula');
    if (!container) return;

    const safetyFactor = 0.5;
    const ncells = state.grid_space?.ncells || [];
    const boxsize = state.grid_space?.boxsize || [];
    const c = parseFloat(state.time?.c) || 100;
    if (c <= 0) { container.innerHTML = ''; return; }

    let sumInvDx2 = 0;
    const dxVals = [];
    const dimNames = ['x', 'y', 'z'];
    for (let i = 0; i < currentDim; i++) {
      const L = parseFloat(boxsize[i]) || 1;
      const N = parseInt(ncells[i]) || 1;
      const dx = L / N;
      dxVals.push(dx);
      sumInvDx2 += 1 / (dx * dx);
    }
    if (sumInvDx2 <= 0) { container.innerHTML = ''; return; }

    const dtRec = safetyFactor / (c * Math.sqrt(sumInvDx2));
    const dtStr = dtRec.toPrecision(4);

    // Build the formula display
    let html = `<div class="dt-formula-content">`;
    html += `<span class="dt-formula-label">CFL limit:</span>`;
    html += `<span class="dt-formula-inline"><span class="dt-formula-tex" id="dt-formula-tex"></span>`;
    html += ` <span class="dt-formula-eq">= ${dtStr}</span>`;
    html += `</span>`;
    html += `</div>`;
    container.innerHTML = html;

    // Build dimension-appropriate LaTeX
    const texEl = document.getElementById('dt-formula-tex');
    let invTerms;
    if (currentDim === 1) {
      invTerms = String.raw`\frac{1}{\Delta x^2}`;
    } else if (currentDim === 2) {
      invTerms = String.raw`\frac{1}{\Delta x^2} + \frac{1}{\Delta y^2}`;
    } else {
      invTerms = String.raw`\frac{1}{\Delta x^2} + \frac{1}{\Delta y^2} + \frac{1}{\Delta z^2}`;
    }
    const texFormula = String.raw`\Delta t \leq \frac{C_{\max}}{c\,\sqrt{${invTerms}}} \quad (C_{\max} = ${safetyFactor})`;

    if (texEl && typeof katex !== 'undefined') {
      katex.render(texFormula, texEl, { throwOnError: false, displayMode: false });
    } else if (texEl) {
      const terms = dxVals.map((_, i) => `1/d${dimNames[i]}²`).join(' + ');
      texEl.textContent = `dt ≤ Cmax / (c · √(${terms}))  (Cmax = ${safetyFactor})`;
    }

  }

  // ---- Diag Species validation, recommendations & size estimates ----
  function validateDiagSpecies(skey, spIdx) {
    if (skey !== 'diag_species') return;
    const container = document.querySelector(`.species-content[data-section="${skey}"]`);
    if (!container) return;
    const data = state[skey]?.[spIdx];
    if (!data) return;

    const ncells = state.grid_space?.ncells || [];
    const xres = data.xres || [];
    const pres = data.pres || [512, 512, 512];
    const dimLabels = ['x', 'y', 'z'];

    // --- xres validation against ncells ---
    let warnContainer = container.querySelector('.xres-validation-msg');
    if (!warnContainer) {
      // Find the xres field row and append after its field-input
      const xresInput = container.querySelector('[data-key="xres"]');
      if (xresInput) {
        const fieldInput = xresInput.closest('.field-input');
        if (fieldInput) {
          warnContainer = document.createElement('div');
          warnContainer.className = 'xres-validation-msg';
          fieldInput.appendChild(warnContainer);
        }
      }
    }
    if (warnContainer) {
      const warnings = [];
      for (let i = 0; i < currentDim; i++) {
        const xr = Number(xres[i]) || 0;
        const nc = Number(ncells[i]) || 0;
        if (nc > 0 && xr > nc) {
          warnings.push(`xres[${dimLabels[i]}]=${xr} exceeds ncells[${dimLabels[i]}]=${nc} — output will be capped at ncells`);
        }
      }
      warnContainer.innerHTML = warnings.map(w => `<div class="validation-warn">\u26a0 ${w}</div>`).join('');
    }

    // --- Recommended xres pill buttons ---
    let recContainer = container.querySelector('.xres-recommendations');
    if (!recContainer) {
      const xresInput = container.querySelector('[data-key="xres"]');
      if (xresInput) {
        const fieldInput = xresInput.closest('.field-input');
        if (fieldInput) {
          recContainer = document.createElement('div');
          recContainer.className = 'xres-recommendations';
          fieldInput.appendChild(recContainer);
        }
      }
    }
    if (recContainer) {
      let recHTML = '';
      const fracs = [
        { label: 'full', div: 1 },
        { label: '\u00bd', div: 2 },
        { label: '\u00bc', div: 4 },
        { label: '\u215b', div: 8 },
      ];
      for (let i = 0; i < currentDim; i++) {
        const nc = Number(ncells[i]) || 128;
        recHTML += `<div class="xres-rec-row">`;
        recHTML += `<span class="rec-label">${dimLabels[i]}:</span>`;
        for (const fr of fracs) {
          const val = Math.max(1, Math.floor(nc / fr.div));
          recHTML += `<button type="button" class="xres-rec-pill" data-dim="${i}" data-val="${val}">`;
          recHTML += `${val}<span class="pill-frac">${fr.label}</span></button>`;
        }
        recHTML += `</div>`;
      }
      recContainer.innerHTML = recHTML;
      // Bind pill clicks
      recContainer.querySelectorAll('.xres-rec-pill').forEach(btn => {
        btn.addEventListener('click', () => {
          const dimIdx = parseInt(btn.dataset.dim);
          const val = parseInt(btn.dataset.val);
          // Update state
          if (!Array.isArray(data.xres)) data.xres = [256, 256, 256];
          data.xres[dimIdx] = val;
          // Update the corresponding input
          const inp = container.querySelector(`[data-key="xres"][data-index="${dimIdx}"]`);
          if (inp) inp.value = val;
          // Re-validate and re-estimate
          validateDiagSpecies(skey, spIdx);
          updatePreview();
        });
      });
    }

    // --- File size estimate panel ---
    buildDiagSizePanel(container, data, spIdx);
  }

  function buildDiagSizePanel(container, data, spIdx) {
    const ncells = state.grid_space?.ncells || [];
    const xres = data.xres || [];
    const pres = data.pres || [512, 512, 512];
    const niter = Number(state.time?.niter) || 2000;
    const ndump = Number(state.global_output?.ndump) || 100;
    const numDumps = ndump > 0 ? Math.floor(niter / ndump) : 0;

    // Parse selected phase spaces
    const psStr = data.phasespaces || '';
    const selectedPS = psStr.split(',').map(s => s.trim()).filter(s => s);

    let panel = container.querySelector('.diag-size-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'diag-size-panel';
      container.appendChild(panel);
    }

    if (selectedPS.length === 0) {
      panel.innerHTML = `<div class="size-panel-header"><span class="size-icon">\ud83d\udcca</span> Estimated Output Size per Dump</div>`
        + `<div class="size-empty">No phase spaces selected</div>`;
      return;
    }

    // Calculate size for each selected phase space
    const BYTES_PER_CELL = 4;
    let totalBytes = 0;
    const rows = [];

    for (const ps of selectedPS) {
      const { cells, dimsStr } = calcPhaseSpaceSize(ps, xres, pres, ncells);
      const bytes = cells * BYTES_PER_CELL;
      totalBytes += bytes;
      rows.push({ name: ps, dims: dimsStr, bytes });
    }

    let html = `<div class="size-panel-header"><span class="size-icon">\ud83d\udcca</span> Estimated Output Size per Dump</div>`;
    for (const row of rows) {
      html += `<div class="size-row">`;
      html += `<span><span class="size-name">${row.name}</span><span class="size-dims">${row.dims}</span></span>`;
      html += `<span class="size-value">${formatBytes(row.bytes)}</span>`;
      html += `</div>`;
    }
    html += `<div class="size-total">`;
    html += `<span>Total per dump (${selectedPS.length} phase spaces)</span>`;
    html += `<span class="size-value">${formatBytes(totalBytes)}</span>`;
    html += `</div>`;
    if (numDumps > 0) {
      const simTotal = totalBytes * numDumps;
      html += `<div class="size-total size-sim">`;
      html += `<span>Total per simulation (${numDumps} dumps \u00d7 niter=${niter}, ndump=${ndump})</span>`;
      html += `<span class="size-value">${formatBytes(simTotal)}</span>`;
      html += `</div>`;
    }
    panel.innerHTML = html;
  }

  function calcPhaseSpaceSize(psName, xres, pres, ncells) {
    // x3x2x1 is the special charge density case: always full grid
    if (psName === 'x3x2x1') {
      const dims = [];
      for (let i = 0; i < currentDim; i++) dims.push(Number(ncells[i]) || 128);
      const cells = dims.reduce((a, b) => a * b, 1);
      return { cells, dimsStr: dims.join(' \u00d7 ') };
    }

    // Parse the name: axes right-to-left
    // e.g. 'p3x2' → axis1=x2, axis2=p3
    // e.g. 'p1x1' → axis1=x1, axis2=p1
    // Name parts: match 2-char tokens like x1, x2, x3, p1, p2, p3, pt, et
    const tokens = [];
    const regex = /(x[123]|p[123]|pt|et)/g;
    let m;
    while ((m = regex.exec(psName)) !== null) tokens.push(m[1]);

    // The name reads right-to-left for axes, so first token in left-to-right = axis2, last = axis1
    // But for size calculation, order doesn't matter—just multiply the resolutions.
    if (tokens.length < 2) return { cells: 0, dimsStr: '?' };

    const sizes = [];
    const labels = [];
    for (const tok of tokens) {
      const { size, label } = resolveAxisSize(tok, xres, pres, ncells);
      sizes.push(size);
      labels.push(label);
    }

    const cells = sizes.reduce((a, b) => a * b, 1);
    // Show in axis order (reversed from name reading): labels are already left-to-right from name
    const dimsStr = labels.map((l, i) => `${sizes[i]}`).join(' \u00d7 ');
    return { cells, dimsStr };
  }

  function resolveAxisSize(tok, xres, pres, ncells) {
    if (tok === 'x1') {
      const v = Math.min(Number(xres[0]) || 256, Number(ncells[0]) || 128);
      return { size: v, label: 'x1' };
    }
    if (tok === 'x2') {
      const v = Math.min(Number(xres[1]) || 256, Number(ncells[1]) || 128);
      return { size: v, label: 'x2' };
    }
    if (tok === 'x3') {
      const v = Math.min(Number(xres[2]) || 256, Number(ncells[2]) || 128);
      return { size: v, label: 'x3' };
    }
    if (tok === 'p1') return { size: Number(pres[0]) || 512, label: 'p1' };
    if (tok === 'p2') return { size: Number(pres[1]) || 512, label: 'p2' };
    if (tok === 'p3') return { size: Number(pres[2]) || 512, label: 'p3' };
    if (tok === 'pt') {
      const avg = Math.round(((Number(pres[0]) || 512) + (Number(pres[1]) || 512) + (Number(pres[2]) || 512)) / 3);
      return { size: avg, label: 'pt' };
    }
    if (tok === 'et') return { size: 256, label: 'et' };
    return { size: 0, label: tok };
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  }

  // ---- Section validation (grid_space, time, global_output) ----
  function validateSection(skey) {
    const msgEl = document.querySelector(`.validation-msg[data-section="${skey}"]`);
    if (!msgEl) return;
    const warnings = [];

    if (skey === 'grid_space') {
      const ncells = state.grid_space?.ncells || [];
      const boxsize = state.grid_space?.boxsize || [];
      const dimLabels = ['x', 'y', 'z'];
      for (let i = 0; i < currentDim; i++) {
        const nc = Number(ncells[i]) || 0;
        const bs = Number(boxsize[i]) || 0;
        if (nc <= 0) warnings.push(`ncells[${dimLabels[i]}] = ${nc} — must be > 0`);
        if (bs <= 0) warnings.push(`boxsize[${dimLabels[i]}] = ${bs} — must be > 0`);
      }
    }

    if (skey === 'time') {
      const c = Number(state.time?.c) || 0;
      const niter = Number(state.time?.niter) || 0;
      const stiter = Number(state.time?.stiter) || 0;
      if (c <= 0) warnings.push(`c = ${c} — speed of light must be > 0`);
      if (niter <= 0) warnings.push(`niter = ${niter} — must be > 0`);
      if (stiter >= niter && stiter > 0) warnings.push(`stiter (${stiter}) ≥ niter (${niter}) — simulation will never start`);
    }

    if (skey === 'global_output') {
      const niter = Number(state.time?.niter) || 0;
      const ndump = Number(state.global_output?.ndump) || 0;
      if (ndump > niter && niter > 0) warnings.push(`ndump (${ndump}) > niter (${niter}) — no diagnostics will be written`);
    }

    if (skey === 'raw_diag') {
      const ndump = Number(state.global_output?.ndump) || 0;
      const spIdx = activeSpeciesIdx['raw_diag'] || 0;
      const rawNdump = Number(state.raw_diag?.[spIdx]?.raw_ndump) || 0;
      if (ndump > 0 && rawNdump > 0 && rawNdump % ndump !== 0) {
        warnings.push(`raw_ndump (${rawNdump}) must be a multiple of ndump (${ndump})`);
      }
    }

    msgEl.innerHTML = warnings.map(w => `<div class="validation-warn">\u26a0 ${w}</div>`).join('');
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

    // Update planepos hint and placeholder to show axis and range
    const ppInput = container?.querySelector(`input[data-key="planepos"]`);
    if (ppInput) {
      ppInput.placeholder = planeMax > 0 ? `0…${planeMax}` : '0';
      const hintEl = ppInput.closest('.field-row')?.querySelector('.hint');
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

    // Update boundary array labels, hints, and placeholders based on selected plane
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
          // Set placeholders showing valid range on each boundary input
          // starts: 0…max, ends: 0…max
          const bdInputs = arrayDiv.querySelectorAll('input[data-key="boundary"]');
          bdInputs.forEach((inp, i) => {
            const axIdx = i < nInPlane ? i : i - nInPlane;
            const ax = bdAxes[axIdx];
            if (ax && ax.max > 0) {
              inp.placeholder = i < nInPlane ? `0…${ax.max}` : `0…${ax.max}`;
            } else {
              inp.placeholder = '0';
            }
          });
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
      if (st === en) warnings.push(`boundary ${ax.label}-start = ${ax.label}-end (${st}) — zero-size injection region`);
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
