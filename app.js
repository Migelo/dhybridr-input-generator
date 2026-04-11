// dHybridR Input Generator — Main Application

(function() {
  let currentDim = 2;
  let state = {};       // { sectionKey: { field: value } } or { sectionKey: [ {field:value}, ... ] } for perSpecies
  let activeSection = 'node_conf';
  let activeSpeciesIdx = {};  // { sectionKey: speciesIndex }
  let lastMeaningfulBoxsize = [0, 0, 0]; // tracks last non-zero boxsize for injector snapping

  // ---- Init ----
  function init() {
    initState();
    lastMeaningfulBoxsize = (state.grid_space?.boxsize || []).map(Number);
    buildSidebar();
    buildSections();
    loadStateToUI();
    setActiveSection('node_conf');
    updatePreview();

    // Render dt formula once KaTeX is ready
    autoUpdateDt();
    autoCapXres();
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
    initSearch();
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
    if (key === 'node_conf') {
      renderNodeOptimizer();
    }
    if (key === 'time') {
      updateDtRecommendation();
    }
    if (key === 'ext_emf') {
      updateBMagnitude();
      updateEMagnitude();
    }
    if (key === 'species') {
      debouncedRenderNspPlot();
      debouncedRenderVspPlot();
    }
    if (key === 'raw_diag') {
      debouncedRenderSelectrulePlot();
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
      // Bind colormap selector for ext_emf
      if (item === 'ext_emf') {
        const cmapSel = div.querySelector('#b-field-cmap');
        if (cmapSel) {
          cmapSel.addEventListener('change', () => {
            selectedColormap = cmapSel.value;
            renderBFieldPlot();
            renderEFieldPlot();
            debouncedRenderNspPlot();
            debouncedRenderVspPlot();
            debouncedRenderSelectrulePlot();
          });
        }
        const compSel = div.querySelector('#b-field-component');
        if (compSel) {
          compSel.addEventListener('change', () => {
            selectedBComponent = compSel.value;
            renderBFieldPlot();
          });
        }
        const eCompSel = div.querySelector('#e-field-component');
        if (eCompSel) {
          eCompSel.addEventListener('change', () => {
            selectedEComponent = eCompSel.value;
            renderEFieldPlot();
          });
        }
        // 3D slice controls for B-field
        const bSliceAxisSel = div.querySelector('#b-field-slice-axis');
        if (bSliceAxisSel) {
          bSliceAxisSel.addEventListener('change', () => {
            bFieldSliceAxis = parseInt(bSliceAxisSel.value);
            renderBFieldPlot();
          });
        }
        const bSlicePosRange = div.querySelector('#b-field-slice-pos');
        if (bSlicePosRange) {
          bSlicePosRange.addEventListener('input', () => {
            bFieldSlicePos = parseFloat(bSlicePosRange.value);
            renderBFieldPlot();
          });
        }
        // 3D slice controls for E-field
        const eSliceAxisSel = div.querySelector('#e-field-slice-axis');
        if (eSliceAxisSel) {
          eSliceAxisSel.addEventListener('change', () => {
            eFieldSliceAxis = parseInt(eSliceAxisSel.value);
            renderEFieldPlot();
          });
        }
        const eSlicePosRange = div.querySelector('#e-field-slice-pos');
        if (eSlicePosRange) {
          eSlicePosRange.addEventListener('input', () => {
            eFieldSlicePos = parseFloat(eSlicePosRange.value);
            renderEFieldPlot();
          });
        }
      }
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
      // Insert |E| magnitude panel and heatmap after the Electric Field group
      if (skey === 'ext_emf' && group.title === 'Electric Field') {
        html += `<div id="e-magnitude"></div>`;
        html += `<div id="e-field-plot">`;
        html += `<div id="e-field-controls">`;
        html += `<label>Field: <select id="e-field-component">`;
        html += `<option value="mag" selected>|E|</option>`;
        html += `<option value="Ex">Ex</option>`;
        html += `<option value="Ey">Ey</option>`;
        html += `<option value="Ez">Ez</option>`;
        html += `</select></label>`;
        html += ` <span class="plot-3d-controls">`;
        html += `<label>Slice: <select id="e-field-slice-axis">`;
        html += `<option value="2" selected>z</option>`;
        html += `<option value="1">y</option>`;
        html += `<option value="0">x</option>`;
        html += `</select></label>`;
        html += `<input type="range" id="e-field-slice-pos" min="0" max="1" step="0.005" value="0.5">`;
        html += `<span id="e-field-slice-val"></span>`;
        html += `</span>`;
        html += `</div>`;
        html += `<canvas id="e-field-canvas"></canvas><div id="e-field-plot-msg"></div></div>`;
      }
      // Insert vsp velocity plot after the Velocity group in species section
      if (skey === 'species' && group.title === 'Velocity') {
        html += `<div id="vsp-plot">`;
        html += `<div id="vsp-controls">`;
        html += `<label>Field: <select id="vsp-component">`;
        html += `<option value="mag" selected>|v|</option>`;
        html += `<option value="vx">vx</option>`;
        html += `<option value="vy">vy</option>`;
        html += `<option value="vz">vz</option>`;
        html += `</select></label>`;
        html += ` <span class="plot-3d-controls">`;
        html += `<label>Slice: <select id="vsp-slice-axis">`;
        html += `<option value="2" selected>z</option>`;
        html += `<option value="1">y</option>`;
        html += `<option value="0">x</option>`;
        html += `</select></label>`;
        html += `<input type="range" id="vsp-slice-pos" min="0" max="1" step="0.005" value="0.5">`;
        html += `<span id="vsp-slice-val"></span>`;
        html += `</span>`;
        html += `</div>`;
        html += `<canvas id="vsp-canvas"></canvas><div id="vsp-plot-msg"></div></div>`;
      }
      // Insert nsp density heatmap after the Density group in species section
      if (skey === 'species' && group.title === 'Density') {
        html += `<div id="nsp-plot">`;
        html += `<div id="nsp-controls" style="font-size:12px;color:var(--muted);">`;
        html += `<span class="plot-3d-controls">`;
        html += `<label>Slice: <select id="nsp-slice-axis">`;
        html += `<option value="2" selected>z</option>`;
        html += `<option value="1">y</option>`;
        html += `<option value="0">x</option>`;
        html += `</select></label>`;
        html += `<input type="range" id="nsp-slice-pos" min="0" max="1" step="0.005" value="0.5">`;
        html += `<span id="nsp-slice-val"></span>`;
        html += `</span>`;
        html += `</div>`;
        html += `<canvas id="nsp-canvas"></canvas><div id="nsp-plot-msg"></div></div>`;
      }
      // Insert selectrule spatial plot after raw_diag fields
      if (skey === 'raw_diag') {
        html += `<div id="selectrule-plot">`;
        html += `<div id="selectrule-controls">`;
        html += `<span class="plot-3d-controls">`;
        html += `<label>Slice: <select id="selectrule-slice-axis">`;
        html += `<option value="2" selected>z</option>`;
        html += `<option value="1">y</option>`;
        html += `<option value="0">x</option>`;
        html += `</select></label>`;
        html += `<input type="range" id="selectrule-slice-pos" min="0" max="1" step="0.005" value="0.5">`;
        html += `<span id="selectrule-slice-val"></span>`;
        html += `</span>`;
        html += `</div>`;
        html += `<canvas id="selectrule-canvas"></canvas><div id="selectrule-plot-msg"></div></div>`;
      }
      // Insert node optimizer panel after node_conf fields
      if (skey === 'node_conf') {
        html += `<div id="node-optimizer-panel" class="node-optimizer-panel">`;
        html += `<div class="node-optimizer-header">Node Optimizer</div>`;
        html += `<p class="node-optimizer-desc">Finds MPI decompositions that balance subdomain sizes across processors. `;
        html += `Enter the desired particles per processor — the optimizer estimates total particles from ncells, num_species, and num_par, `;
        html += `then searches for nearby processor counts with the most square (balanced) domain decomposition.</p>`;
        html += `<div class="node-optimizer-body">`;
        html += `<div class="node-optimizer-input-row">`;
        html += `<label>Target particles/proc:</label>`;
        html += `<input type="range" id="node-optimizer-slider" min="4" max="8" step="0.1" value="6">`;
        html += `<span id="node-optimizer-target-label" class="node-opt-target-label">1,000,000</span>`;
        html += `</div>`;
        html += `<div id="node-optimizer-results"></div>`;
        html += `</div>`;
        html += `</div>`;
      }
      // Insert |B| magnitude panel and heatmap after the Magnetic Field group
      if (skey === 'ext_emf' && group.title === 'Magnetic Field') {
        html += `<div id="b-magnitude"></div>`;
        html += `<div id="b-field-plot">`;
        html += `<div id="b-field-controls">`;
        html += `<label>Field: <select id="b-field-component">`;
        html += `<option value="mag" selected>|B|</option>`;
        html += `<option value="Bx">Bx</option>`;
        html += `<option value="By">By</option>`;
        html += `<option value="Bz">Bz</option>`;
        html += `</select></label>`;
        html += ` <label>Colormap: <select id="b-field-cmap">`;
        html += `<option value="coolwarm">Coolwarm</option>`;
        html += `<option value="viridis" selected>Viridis</option>`;
        html += `<option value="inferno">Inferno</option>`;
        html += `<option value="grayscale">Grayscale</option>`;
        html += `</select></label>`;
        html += ` <span class="plot-3d-controls">`;
        html += `<label>Slice: <select id="b-field-slice-axis">`;
        html += `<option value="2" selected>z</option>`;
        html += `<option value="1">y</option>`;
        html += `<option value="0">x</option>`;
        html += `</select></label>`;
        html += `<input type="range" id="b-field-slice-pos" min="0" max="1" step="0.005" value="0.5">`;
        html += `<span id="b-field-slice-val"></span>`;
        html += `</span>`;
        html += `</div>`;
        html += `<canvas id="b-field-canvas"></canvas><div id="b-field-plot-msg"></div></div>`;
      }
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

    const fparserBtn = field.fparser
      ? ` <span class="fparser-help" tabindex="0" title="Function parser syntax&#10;&#10;Variables: x, y, z` +
        (field.key === 'selectrule' ? `, vx, vy, vz` : '') +
        `&#10;Constants: ct(1)..ct(16), pi&#10;&#10;Functions:&#10;  abs, sin, cos, tan, htan (tanh)&#10;  hsec (sech), exp, log, tenlog (log10)&#10;  sqrt, asin, acos, atan, atan2&#10;  pow(a,b), not(a), neg(a)&#10;&#10;Operators: + - * / ^ **&#10;Logic: && || == != >= <= > <&#10;Conditional: if(cond, true, false)">?</span>`
      : '';

    return `<div class="field-row ${dimClass}">
      <div class="field-label">
        <span class="name">${field.label}${fparserBtn}</span>
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
    if (skey === 'raw_diag') {
      // Bind selectrule 3D slice controls
      const srSliceAxisSel = container.querySelector('#selectrule-slice-axis');
      if (srSliceAxisSel) {
        srSliceAxisSel.value = String(selectruleSliceAxis);
        srSliceAxisSel.addEventListener('change', () => {
          selectruleSliceAxis = parseInt(srSliceAxisSel.value);
          renderSelectrulePlot();
        });
      }
      const srSlicePosRange = container.querySelector('#selectrule-slice-pos');
      if (srSlicePosRange) {
        srSlicePosRange.value = String(selectruleSlicePos);
        srSlicePosRange.addEventListener('input', () => {
          selectruleSlicePos = parseFloat(srSlicePosRange.value);
          renderSelectrulePlot();
        });
      }
      debouncedRenderSelectrulePlot();
    }
    if (skey === 'species') {
      // Bind nsp 3D slice controls
      const nspSliceAxisSel = container.querySelector('#nsp-slice-axis');
      if (nspSliceAxisSel) {
        nspSliceAxisSel.value = String(nspSliceAxis);
        nspSliceAxisSel.addEventListener('change', () => {
          nspSliceAxis = parseInt(nspSliceAxisSel.value);
          renderNspPlot();
        });
      }
      const nspSlicePosRange = container.querySelector('#nsp-slice-pos');
      if (nspSlicePosRange) {
        nspSlicePosRange.value = String(nspSlicePos);
        nspSlicePosRange.addEventListener('input', () => {
          nspSlicePos = parseFloat(nspSlicePosRange.value);
          renderNspPlot();
        });
      }
      debouncedRenderNspPlot();

      // Bind vsp velocity plot controls
      const vspCompSel = container.querySelector('#vsp-component');
      if (vspCompSel) {
        vspCompSel.value = selectedVspComponent;
        vspCompSel.addEventListener('change', () => {
          selectedVspComponent = vspCompSel.value;
          renderVspPlot();
        });
      }
      const vspSliceAxisSel = container.querySelector('#vsp-slice-axis');
      if (vspSliceAxisSel) {
        vspSliceAxisSel.value = String(vspSliceAxis);
        vspSliceAxisSel.addEventListener('change', () => {
          vspSliceAxis = parseInt(vspSliceAxisSel.value);
          renderVspPlot();
        });
      }
      const vspSlicePosRange = container.querySelector('#vsp-slice-pos');
      if (vspSlicePosRange) {
        vspSlicePosRange.value = String(vspSlicePos);
        vspSlicePosRange.addEventListener('input', () => {
          vspSlicePos = parseFloat(vspSlicePosRange.value);
          renderVspPlot();
        });
      }
      debouncedRenderVspPlot();
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

        // Cross-section: if ncells changed, cap xres to ncells for all species
        if (elSection === 'grid_space' && elKey === 'ncells') {
          autoCapXres();
        }

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
          syncInjectorsToBoxsize(lastMeaningfulBoxsize);
          // Update lastMeaningfulBoxsize: only overwrite components that are > 0
          const newBs = (state.grid_space?.boxsize || []).map(Number);
          for (let i = 0; i < newBs.length; i++) {
            if (newBs[i] > 0) lastMeaningfulBoxsize[i] = newBs[i];
          }
          debouncedRenderBFieldPlot();
          debouncedRenderEFieldPlot();
          debouncedRenderNspPlot();
          debouncedRenderVspPlot();
          debouncedRenderSelectrulePlot();
        }

        // Cross-section: if ext_emf fields changed, update |B| and |E| magnitude and plots
        if (elSection === 'ext_emf') {
          if (elKey === 'Bx' || elKey === 'By' || elKey === 'Bz') updateBMagnitude();
          if (elKey === 'Bx' || elKey === 'By' || elKey === 'Bz' || elKey === 'ct') debouncedRenderBFieldPlot();
          if (elKey === 'Ex' || elKey === 'Ey' || elKey === 'Ez') updateEMagnitude();
          if (elKey === 'Ex' || elKey === 'Ey' || elKey === 'Ez' || elKey === 'ct') debouncedRenderEFieldPlot();
        }

        // Species: if nsp, nsp_domain, domain_boundary, or ct changed, update density plot
        if (elSection === 'species' && (elKey === 'nsp' || elKey === 'nsp_domain' || elKey === 'domain_boundary' || elKey === 'ct')) {
          debouncedRenderNspPlot();
        }

        // Species: if vsp, vdrift, or ct changed, update velocity plot
        if (elSection === 'species' && (elKey === 'vsp' || elKey === 'vdrift' || elKey === 'ct')) {
          debouncedRenderVspPlot();
        }

        // Raw diag: if selectrule or ct changed, update selectrule plot
        if (elSection === 'raw_diag' && (elKey === 'selectrule' || elKey === 'ct')) {
          debouncedRenderSelectrulePlot();
        }

        // Cross-section: if ncells, num_species, or num_par changed, update node optimizer
        if ((elSection === 'grid_space' && elKey === 'ncells') ||
            (elSection === 'particles' && elKey === 'num_species') ||
            (elSection === 'species' && elKey === 'num_par')) {
          renderNodeOptimizer();
        }

        // Section validations
        if (elSection === 'grid_space') validateSection('grid_space');
        if (elSection === 'time') {
          validateSection('time');
          validateSection('global_output'); // ndump vs niter, adaptive_dt
          validateSection('raw_diag'); // adaptive_dt
        }
        if (elSection === 'global_output') {
          validateSection('global_output');
          validateSection('raw_diag'); // raw_ndump vs ndump
        }
        if (elSection === 'raw_diag') validateSection('raw_diag');
      };

      el.addEventListener('input', onChange);
      el.addEventListener('change', onChange);

      // Restore current state value on blur if field is empty
      if (el.tagName === 'INPUT' && el.type === 'text' || el.tagName === 'TEXTAREA') {
        el.addEventListener('blur', () => {
          const field = sec.fields.find(f => f.key === elKey);
          if (!field) return;
          if (el.value.trim() === '') {
            const spIdx = el.dataset.species !== undefined ? parseInt(el.dataset.species) : undefined;
            const arrIdx = el.dataset.index !== undefined ? parseInt(el.dataset.index) : undefined;
            // Get current value from state, fall back to schema default
            let target;
            if (spIdx !== undefined && sec.multiPerSpecies) {
              const injIdx = activeInjectorIdx[spIdx] || 0;
              target = state[elSection]?.[spIdx]?.[injIdx];
            } else if (spIdx !== undefined) {
              target = state[elSection]?.[spIdx];
            } else {
              target = state[elSection];
            }
            let restoreVal;
            if (target && target[elKey] !== undefined) {
              restoreVal = arrIdx !== undefined && Array.isArray(target[elKey]) ? target[elKey][arrIdx] : target[elKey];
            }
            if (restoreVal === undefined || restoreVal === '') {
              restoreVal = arrIdx !== undefined && Array.isArray(field.default) ? field.default[arrIdx] : field.default;
            }
            if (restoreVal !== undefined && restoreVal !== '') {
              el.value = restoreVal;
              el.dispatchEvent(new Event('input', { bubbles: true }));
            }
          }
        });
      }
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
    renderNodeOptimizer();
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

        // Sync planepos if it was at the old boxsize edge (skip if old edge was 0 — transient from empty input)
        const axIdx = planeAxisIdx[plane];
        if (axIdx !== undefined && axIdx < oldBoxsize.length) {
          const oldMax = oldBoxsize[axIdx];
          const pp = Number(inj.planepos) || 0;
          const newPlaneMax = newBoxsize[axIdx] || 0;
          if (oldMax > eps && newPlaneMax > 0 && Math.abs(pp - oldMax) < eps * Math.max(1, Math.abs(oldMax))) {
            inj.planepos = newPlaneMax;
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
              if (newMax > eps && Math.abs(endVal - oldMax) < eps * Math.max(1, Math.abs(oldMax))) {
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

  // ---- Auto-cap xres to ncells when ncells changes ----
  function autoCapXres() {
    const ncells = state.grid_space?.ncells || [];
    const diagArr = state.diag_species;
    if (!Array.isArray(diagArr)) return;

    let changed = false;
    for (const diag of diagArr) {
      if (!diag || !Array.isArray(diag.xres)) continue;
      for (let i = 0; i < currentDim; i++) {
        const nc = parseInt(ncells[i]) || 0;
        const xr = parseInt(diag.xres[i]) || 0;
        if (nc > 0 && xr > nc) {
          diag.xres[i] = nc;
          changed = true;
        }
      }
    }
    if (changed) {
      // Refresh UI if viewing diag_species
      if (activeSection === 'diag_species') {
        const spIdx = activeSpeciesIdx['diag_species'] || 0;
        rebuildSpeciesContent('diag_species', spIdx);
      }
      updatePreview();
    }
  }

  // ---- Auto-update dt using CFL: dt = 0.5 / (c * sqrt(sum(1/dx_i^2))) ----
  function autoUpdateDt() {
    // Skip auto-update when adaptive_dt is enabled — Fortran manages dt
    if (state.time?.adaptive_dt) return;
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

  // ---- |B| magnitude display ----
  function updateBMagnitude() {
    const container = document.getElementById('b-magnitude');
    if (!container) return;

    const bx = (state.ext_emf?.Bx || '0.').trim();
    const by = (state.ext_emf?.By || '0.').trim();
    const bz = (state.ext_emf?.Bz || '0.').trim();

    // Try to parse each as a pure number
    const bxNum = parseFloat(bx);
    const byNum = parseFloat(by);
    const bzNum = parseFloat(bz);
    const bxIsNum = !isNaN(bxNum) && isFinite(bxNum) && String(bxNum) !== '' && bx.match(/^[+-]?(\d+\.?\d*|\.\d+)([eEdD][+-]?\d+)?$/);
    const byIsNum = !isNaN(byNum) && isFinite(byNum) && String(byNum) !== '' && by.match(/^[+-]?(\d+\.?\d*|\.\d+)([eEdD][+-]?\d+)?$/);
    const bzIsNum = !isNaN(bzNum) && isFinite(bzNum) && String(bzNum) !== '' && bz.match(/^[+-]?(\d+\.?\d*|\.\d+)([eEdD][+-]?\d+)?$/);

    let html = `<div class="dt-formula-content">`;
    html += `<span class="dt-formula-label">|B| magnitude:</span>`;

    if (bxIsNum && byIsNum && bzIsNum) {
      // All numeric — compute the result
      const mag = Math.sqrt(bxNum * bxNum + byNum * byNum + bzNum * bzNum);
      const magStr = mag === 0 ? '0' : mag.toPrecision(4);
      html += `<span class="dt-formula-inline">`;
      html += `<span class="dt-formula-eq">|B| = sqrt(${bx}\u00b2 + ${by}\u00b2 + ${bz}\u00b2) = ${magStr}</span>`;
      html += `</span>`;
    } else {
      // At least one is a symbolic expression
      const fmtTerm = (expr) => {
        const num = parseFloat(expr);
        if (!isNaN(num) && isFinite(num) && expr.match(/^[+-]?(\d+\.?\d*|\.\d+)([eEdD][+-]?\d+)?$/)) {
          return String(num) + '\u00b2';
        }
        // Wrap in parens if it contains operators (except leading sign)
        const inner = expr.replace(/^[+-]/, '');
        if (/[+\-*/^]/.test(inner) || /\s/.test(inner)) {
          return '(' + expr + ')\u00b2';
        }
        return expr + '\u00b2';
      };
      html += `<span class="dt-formula-inline">`;
      html += `<span class="dt-formula-eq">|B| = sqrt(${fmtTerm(bx)} + ${fmtTerm(by)} + ${fmtTerm(bz)})</span>`;
      html += `</span>`;
    }
    html += `</div>`;
    container.innerHTML = html;

    debouncedRenderBFieldPlot();
  }

  // ---- |B| field heatmap plot ----
  let _bFieldPlotTimer = null;

  function translateExpr(expr, ctValsOverride) {
    if (!expr || !expr.trim()) return '0';
    let s = expr.trim();
    // Replace Fortran d/D scientific notation: 1.0d-3 -> 1.0e-3
    s = s.replace(/(\d)([dD])([+-]?\d)/g, '$1e$3');
    // Replace ct(N) with actual values from state (1-indexed -> 0-indexed)
    const ctVals = ctValsOverride || state.ext_emf?.ct || [];
    s = s.replace(/ct\((\d+)\)/gi, (_, n) => {
      const idx = parseInt(n) - 1;
      const v = parseFloat(ctVals[idx]) || 0;
      return '(' + v + ')';
    });
    // Replace if(cond, true, false) → JS ternary ((cond) > 0 ? (true) : (false))
    // Handle nested if() by replacing innermost first, repeatedly
    const ifRegex = /\bif\(([^(),]+(?:\([^()]*\))?[^(),]*),([^(),]+(?:\([^()]*\))?[^(),]*),([^(),]+(?:\([^()]*\))?[^(),]*)\)/gi;
    let prev = '';
    while (prev !== s) {
      prev = s;
      s = s.replace(ifRegex, '(($1) > 0 ? ($2) : ($3))');
    }
    // Replace ^ with ** (some Fortran parsers use ^)
    s = s.replace(/\^/g, '**');
    // Replace math functions with Math. equivalents
    // dHybridR fparser aliases — replace before general fn mapping
    s = s.replace(/\bhtan\b/gi, 'tanh');
    s = s.replace(/\btenlog\b/gi, 'log10');
    s = s.replace(/\bhsec\b/gi, 'sech');
    // sech(expr) → 1/Math.cosh(expr)
    s = s.replace(/\bsech\(/gi, '1/Math.cosh(');
    // pow(a,b) → Math.pow(a,b)
    s = s.replace(/\bpow\b/gi, 'Math.pow');
    // not(a) → (a > 0 ? 0 : 1) — use arrow fn that self-closes
    s = s.replace(/\bnot\(/gi, '((_n_)=>(_n_>0?0:1))(');
    // neg(a) → -(a)
    s = s.replace(/\bneg\(/gi, '-(');
    // dHybridR fparser supported functions → Math.*
    const fns = ['cos','sin','sqrt','exp','log','abs','tan','atan','acos','asin','atan2','tanh','log10'];
    for (const fn of fns) {
      s = s.replace(new RegExp('\\b' + fn + '\\b', 'gi'), 'Math.' + fn);
    }
    // Replace pi
    // pi: Fortran fparser does NOT support pi — replace with numeric value
    // so that preview heatmaps work if a user types pi, but warn via hint
    s = s.replace(/\bpi\b/gi, '3.14159265358979');
    // Fortran parser uses x, y, z for coordinates — map to x1, x2, x3 params
    // (must come after Math. replacements to avoid mangling e.g. Math.exp)
    s = s.replace(/\bx\b/g, 'x1');
    s = s.replace(/\by\b/g, 'x2');
    s = s.replace(/\bz\b/g, 'x3');
    return s;
  }

  // ---- Colormaps ----
  const COLORMAPS = {
    coolwarm(t) {
      t = Math.max(0, Math.min(1, t));
      // blue (59,76,192) → white (221,221,221) → red (180,4,38)
      let r, g, b;
      if (t < 0.5) {
        const s = t / 0.5;
        r = Math.round(59 + s * (221 - 59));
        g = Math.round(76 + s * (221 - 76));
        b = Math.round(192 + s * (221 - 192));
      } else {
        const s = (t - 0.5) / 0.5;
        r = Math.round(221 + s * (180 - 221));
        g = Math.round(221 - s * (221 - 4));
        b = Math.round(221 - s * (221 - 38));
      }
      return [r, g, b];
    },
    viridis(t) {
      t = Math.max(0, Math.min(1, t));
      // purple (68,1,84) → teal (33,145,140) → yellow (253,231,37)
      let r, g, b;
      if (t < 0.5) {
        const s = t / 0.5;
        r = Math.round(68 + s * (33 - 68));
        g = Math.round(1 + s * (145 - 1));
        b = Math.round(84 + s * (140 - 84));
      } else {
        const s = (t - 0.5) / 0.5;
        r = Math.round(33 + s * (253 - 33));
        g = Math.round(145 + s * (231 - 145));
        b = Math.round(140 - s * (140 - 37));
      }
      return [r, g, b];
    },
    inferno(t) {
      t = Math.max(0, Math.min(1, t));
      // black (0,0,4) → purple (120,28,109) → orange (229,120,17) → yellow (252,255,164)
      let r, g, b;
      if (t < 0.33) {
        const s = t / 0.33;
        r = Math.round(s * 120); g = Math.round(s * 28); b = Math.round(4 + s * 105);
      } else if (t < 0.66) {
        const s = (t - 0.33) / 0.33;
        r = Math.round(120 + s * 109); g = Math.round(28 + s * 92); b = Math.round(109 - s * 92);
      } else {
        const s = (t - 0.66) / 0.34;
        r = Math.round(229 + s * 23); g = Math.round(120 + s * 135); b = Math.round(17 + s * 147);
      }
      return [r, g, b];
    },
    grayscale(t) {
      t = Math.max(0, Math.min(1, t));
      const v = Math.round(t * 255);
      return [v, v, v];
    },
  };

  let selectedColormap = 'viridis';
  let selectedBComponent = 'mag';
  let bFieldSliceAxis = 2;   // 0=x, 1=y, 2=z
  let bFieldSlicePos = 0.5;  // normalized 0..1

  function renderBFieldPlot() {
    const container = document.getElementById('b-field-plot');
    if (!container) return;
    const canvas = document.getElementById('b-field-canvas');
    const msgEl = document.getElementById('b-field-plot-msg');
    if (!canvas || !msgEl) return;

    if (currentDim === 1) {
      // --- 1D line plot ---
      container.style.display = '';
      const c3d = container.querySelector('.plot-3d-controls');
      if (c3d) c3d.style.display = 'none';

      const boxsize = state.grid_space?.boxsize || [];
      const Lx = parseFloat(boxsize[0]) || 1;

      const bxExpr = translateExpr(state.ext_emf?.Bx || '0.');
      const byExpr = translateExpr(state.ext_emf?.By || '0.');
      const bzExpr = translateExpr(state.ext_emf?.Bz || '0.');

      const NX = 200;
      const plotW = 300, plotH = 200;
      const marginLeft = 50, marginTop = 10, marginBottom = 30, marginRight = 10;
      const canvasW = marginLeft + plotW + marginRight;
      const canvasH = marginTop + plotH + marginBottom;

      canvas.width = canvasW;
      canvas.height = canvasH;
      canvas.style.width = canvasW + 'px';
      canvas.style.height = canvasH + 'px';

      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvasW, canvasH);

      const comp = selectedBComponent;
      try {
        const evalExpr = new Function('x1', 'x2', 'x3', `return [${bxExpr}, ${byExpr}, ${bzExpr}];`);
        const data = new Float64Array(NX);
        let bmin = Infinity, bmax = -Infinity;
        for (let ix = 0; ix < NX; ix++) {
          const x = Lx * (ix + 0.5) / NX;
          const [vx, vy, vz] = evalExpr(x, 0, 0);
          let val;
          if (comp === 'Bx') val = vx;
          else if (comp === 'By') val = vy;
          else if (comp === 'Bz') val = vz;
          else val = Math.sqrt(vx * vx + vy * vy + vz * vz);
          data[ix] = val;
          if (val < bmin) bmin = val;
          if (val > bmax) bmax = val;
        }

        msgEl.textContent = '';
        msgEl.style.display = 'none';

        // Y-axis range
        if (bmin === bmax) {
          if (bmin === 0) { bmin = 0; bmax = 1; }
          else { const pad = Math.abs(bmin) * 0.1; bmin -= pad; bmax += pad; }
        }
        const range = bmax - bmin;

        const fmtVal = (v) => {
          if (v === 0) return '0';
          if (Math.abs(v) >= 1000 || Math.abs(v) < 0.01) return v.toExponential(1);
          return v.toPrecision(3);
        };

        // Grid lines
        ctx.strokeStyle = '#21262d';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
          const gx = marginLeft + (plotW * i / 4);
          ctx.beginPath(); ctx.moveTo(gx, marginTop); ctx.lineTo(gx, marginTop + plotH); ctx.stroke();
          const gy = marginTop + (plotH * i / 4);
          ctx.beginPath(); ctx.moveTo(marginLeft, gy); ctx.lineTo(marginLeft + plotW, gy); ctx.stroke();
        }

        // Axes border
        ctx.strokeStyle = '#30363d';
        ctx.lineWidth = 1;
        ctx.strokeRect(marginLeft, marginTop, plotW, plotH);

        // Draw line
        ctx.beginPath();
        ctx.strokeStyle = '#58a6ff';
        ctx.lineWidth = 2;
        for (let ix = 0; ix < NX; ix++) {
          const px = marginLeft + (ix + 0.5) / NX * plotW;
          const py = marginTop + plotH - ((data[ix] - bmin) / range) * plotH;
          if (ix === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();

        // X-axis labels
        ctx.fillStyle = '#8b949e';
        ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('x', marginLeft + plotW / 2, canvasH - 2);
        ctx.textAlign = 'left';
        ctx.fillText('0', marginLeft, canvasH - 16);
        ctx.textAlign = 'right';
        ctx.fillText(Lx % 1 === 0 ? String(Lx) : Lx.toFixed(1), marginLeft + plotW, canvasH - 16);

        // Y-axis labels
        const plotLabel = comp === 'mag' ? '|B|' : comp;
        ctx.save();
        ctx.translate(10, marginTop + plotH / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.fillText(plotLabel, 0, 0);
        ctx.restore();
        ctx.textAlign = 'right';
        ctx.fillText(fmtVal(bmin), marginLeft - 4, marginTop + plotH);
        ctx.fillText(fmtVal(bmax), marginLeft - 4, marginTop + 10);

      } catch (e) {
        ctx.clearRect(0, 0, canvasW, canvasH);
        canvas.width = 0;
        canvas.height = 0;
        msgEl.textContent = 'Cannot evaluate B-field expression';
        msgEl.style.display = '';
      }
      return;
    }

    // Show for 2D and 3D
    if (currentDim < 2) {
      container.style.display = 'none';
      return;
    }
    container.style.display = '';

    // Show/hide 3D controls
    const controls3d = container.querySelector('.plot-3d-controls');
    if (controls3d) controls3d.style.display = currentDim === 3 ? '' : 'none';

    const boxsize = state.grid_space?.boxsize || [];
    const Lx = parseFloat(boxsize[0]) || 1;
    const Ly = parseFloat(boxsize[1]) || 1;
    const Lz = parseFloat(boxsize[2]) || 1;
    const axisNames = ['x', 'y', 'z'];

    const bxExpr = translateExpr(state.ext_emf?.Bx || '0.');
    const byExpr = translateExpr(state.ext_emf?.By || '0.');
    const bzExpr = translateExpr(state.ext_emf?.Bz || '0.');

    // Determine axes for heatmap
    let hAxisLabel, vAxisLabel, La, Lb;
    let buildCoords; // function(a, b) -> [x, y, z]
    if (currentDim === 3) {
      const L = [Lx, Ly, Lz];
      const sa = bFieldSliceAxis;
      const freeAxes = [0, 1, 2].filter(i => i !== sa);
      La = L[freeAxes[0]]; Lb = L[freeAxes[1]];
      const fixedCoord = bFieldSlicePos * L[sa];
      hAxisLabel = axisNames[freeAxes[0]];
      vAxisLabel = axisNames[freeAxes[1]];
      buildCoords = (a, b) => {
        const c = [0, 0, 0];
        c[freeAxes[0]] = a; c[freeAxes[1]] = b; c[sa] = fixedCoord;
        return c;
      };
      // Update slider label
      const sliceValEl = document.getElementById('b-field-slice-val');
      if (sliceValEl) sliceValEl.textContent = axisNames[sa] + ' = ' + fixedCoord.toFixed(1);
    } else {
      La = Lx; Lb = Ly;
      hAxisLabel = 'x'; vAxisLabel = 'y';
      buildCoords = (a, b) => [a, b, 0];
    }

    // Computation grid
    const NX = 200, NY = 200;
    const plotW = 300, plotH = Math.round(plotW * (Lb / La));
    const barW = 16, barGap = 8, labelW = 50;
    const marginLeft = 40, marginTop = 10, marginBottom = 30, marginRight = barGap + barW + labelW;
    const canvasW = marginLeft + plotW + marginRight;
    const canvasH = marginTop + plotH + marginBottom;

    canvas.width = canvasW;
    canvas.height = canvasH;
    canvas.style.width = canvasW + 'px';
    canvas.style.height = canvasH + 'px';

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvasW, canvasH);

    const comp = selectedBComponent;
    let bmag;
    try {
      bmag = new Float64Array(NX * NY);
      const evalExpr = new Function('x1', 'x2', 'x3', `return [${bxExpr}, ${byExpr}, ${bzExpr}];`);
      let bmin = Infinity, bmax = -Infinity;
      for (let ib = 0; ib < NY; ib++) {
        const b = Lb * (ib + 0.5) / NY;
        for (let ia = 0; ia < NX; ia++) {
          const a = La * (ia + 0.5) / NX;
          const [cx, cy, cz] = buildCoords(a, b);
          const [vx, vy, vz] = evalExpr(cx, cy, cz);
          let val;
          if (comp === 'Bx') val = vx;
          else if (comp === 'By') val = vy;
          else if (comp === 'Bz') val = vz;
          else val = Math.sqrt(vx * vx + vy * vy + vz * vz);
          bmag[ib * NX + ia] = val;
          if (val < bmin) bmin = val;
          if (val > bmax) bmax = val;
        }
      }

      msgEl.textContent = '';
      msgEl.style.display = 'none';

      const colorMap = COLORMAPS[selectedColormap] || COLORMAPS.coolwarm;

      const imgData = ctx.createImageData(NX, NY);
      const range = bmax - bmin || 1;
      for (let iy = 0; iy < NY; iy++) {
        for (let ix = 0; ix < NX; ix++) {
          const t = (bmag[(NY - 1 - iy) * NX + ix] - bmin) / range;
          const [r, g, b] = colorMap(t);
          const idx = (iy * NX + ix) * 4;
          imgData.data[idx] = r;
          imgData.data[idx + 1] = g;
          imgData.data[idx + 2] = b;
          imgData.data[idx + 3] = 255;
        }
      }

      const offscreen = document.createElement('canvas');
      offscreen.width = NX;
      offscreen.height = NY;
      offscreen.getContext('2d').putImageData(imgData, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(offscreen, marginLeft, marginTop, plotW, plotH);

      ctx.strokeStyle = '#30363d';
      ctx.lineWidth = 1;
      ctx.strokeRect(marginLeft, marginTop, plotW, plotH);

      // Axis labels
      ctx.fillStyle = '#8b949e';
      ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(hAxisLabel, marginLeft + plotW / 2, canvasH - 2);
      ctx.textAlign = 'left';
      ctx.fillText('0', marginLeft, canvasH - 16);
      ctx.textAlign = 'right';
      ctx.fillText(La % 1 === 0 ? String(La) : La.toFixed(1), marginLeft + plotW, canvasH - 16);
      ctx.save();
      ctx.translate(10, marginTop + plotH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center';
      ctx.fillText(vAxisLabel, 0, 0);
      ctx.restore();
      ctx.textAlign = 'right';
      ctx.fillText('0', marginLeft - 4, marginTop + plotH);
      ctx.fillText(Lb % 1 === 0 ? String(Lb) : Lb.toFixed(1), marginLeft - 4, marginTop + 10);

      // Colorbar
      const barX = marginLeft + plotW + barGap;
      const barTop = marginTop;
      const barH = plotH;
      for (let iy = 0; iy < barH; iy++) {
        const t = 1 - iy / barH;
        const [r, g, b] = colorMap(t);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(barX, barTop + iy, barW, 1);
      }
      ctx.strokeStyle = '#30363d';
      ctx.strokeRect(barX, barTop, barW, barH);

      ctx.fillStyle = '#8b949e';
      ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'left';
      const fmtVal = (v) => {
        if (v === 0) return '0';
        if (Math.abs(v) >= 1000 || Math.abs(v) < 0.01) return v.toExponential(1);
        return v.toPrecision(3);
      };
      ctx.fillText(fmtVal(bmax), barX + barW + 3, barTop + 9);
      ctx.fillText(fmtVal(bmin), barX + barW + 3, barTop + barH);
      const bmid = (bmin + bmax) / 2;
      ctx.fillText(fmtVal(bmid), barX + barW + 3, barTop + barH / 2 + 4);

      ctx.fillStyle = '#8b949e';
      ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'right';
      const plotLabel = comp === 'mag' ? '|B|' : comp;
      ctx.fillText(plotLabel, barX + barW, barTop - 2 > 0 ? barTop - 2 : barTop);

    } catch (e) {
      ctx.clearRect(0, 0, canvasW, canvasH);
      canvas.width = 0;
      canvas.height = 0;
      msgEl.textContent = 'Cannot evaluate B-field expression for heatmap';
      msgEl.style.display = '';
    }
  }

  function debouncedRenderBFieldPlot() {
    if (_bFieldPlotTimer) clearTimeout(_bFieldPlotTimer);
    _bFieldPlotTimer = setTimeout(renderBFieldPlot, 100);
  }

  // ---- |E| magnitude display ----
  function updateEMagnitude() {
    const container = document.getElementById('e-magnitude');
    if (!container) return;

    const ex = (state.ext_emf?.Ex || '0.').trim();
    const ey = (state.ext_emf?.Ey || '0.').trim();
    const ez = (state.ext_emf?.Ez || '0.').trim();

    const exNum = parseFloat(ex);
    const eyNum = parseFloat(ey);
    const ezNum = parseFloat(ez);
    const exIsNum = !isNaN(exNum) && isFinite(exNum) && String(exNum) !== '' && ex.match(/^[+-]?(\d+\.?\d*|\.\d+)([eEdD][+-]?\d+)?$/);
    const eyIsNum = !isNaN(eyNum) && isFinite(eyNum) && String(eyNum) !== '' && ey.match(/^[+-]?(\d+\.?\d*|\.\d+)([eEdD][+-]?\d+)?$/);
    const ezIsNum = !isNaN(ezNum) && isFinite(ezNum) && String(ezNum) !== '' && ez.match(/^[+-]?(\d+\.?\d*|\.\d+)([eEdD][+-]?\d+)?$/);

    let html = `<div class="dt-formula-content">`;
    html += `<span class="dt-formula-label">|E| magnitude:</span>`;

    if (exIsNum && eyIsNum && ezIsNum) {
      const mag = Math.sqrt(exNum * exNum + eyNum * eyNum + ezNum * ezNum);
      const magStr = mag === 0 ? '0' : mag.toPrecision(4);
      html += `<span class="dt-formula-inline">`;
      html += `<span class="dt-formula-eq">|E| = sqrt(${ex}\u00b2 + ${ey}\u00b2 + ${ez}\u00b2) = ${magStr}</span>`;
      html += `</span>`;
    } else {
      const fmtTerm = (expr) => {
        const num = parseFloat(expr);
        if (!isNaN(num) && isFinite(num) && expr.match(/^[+-]?(\d+\.?\d*|\.\d+)([eEdD][+-]?\d+)?$/)) {
          return String(num) + '\u00b2';
        }
        const inner = expr.replace(/^[+-]/, '');
        if (/[+\-*/^]/.test(inner) || /\s/.test(inner)) {
          return '(' + expr + ')\u00b2';
        }
        return expr + '\u00b2';
      };
      html += `<span class="dt-formula-inline">`;
      html += `<span class="dt-formula-eq">|E| = sqrt(${fmtTerm(ex)} + ${fmtTerm(ey)} + ${fmtTerm(ez)})</span>`;
      html += `</span>`;
    }
    html += `</div>`;
    container.innerHTML = html;

    debouncedRenderEFieldPlot();
  }

  // ---- |E| field heatmap plot ----
  let _eFieldPlotTimer = null;
  let selectedEComponent = 'mag';
  let eFieldSliceAxis = 2;
  let eFieldSlicePos = 0.5;

  function renderEFieldPlot() {
    const container = document.getElementById('e-field-plot');
    if (!container) return;
    const canvas = document.getElementById('e-field-canvas');
    const msgEl = document.getElementById('e-field-plot-msg');
    if (!canvas || !msgEl) return;

    if (currentDim === 1) {
      // --- 1D line plot ---
      container.style.display = '';
      const c3d = container.querySelector('.plot-3d-controls');
      if (c3d) c3d.style.display = 'none';

      const boxsize = state.grid_space?.boxsize || [];
      const Lx = parseFloat(boxsize[0]) || 1;

      const exExpr = translateExpr(state.ext_emf?.Ex || '0.');
      const eyExpr = translateExpr(state.ext_emf?.Ey || '0.');
      const ezExpr = translateExpr(state.ext_emf?.Ez || '0.');

      const NX = 200;
      const plotW = 300, plotH = 200;
      const marginLeft = 50, marginTop = 10, marginBottom = 30, marginRight = 10;
      const canvasW = marginLeft + plotW + marginRight;
      const canvasH = marginTop + plotH + marginBottom;

      canvas.width = canvasW;
      canvas.height = canvasH;
      canvas.style.width = canvasW + 'px';
      canvas.style.height = canvasH + 'px';

      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvasW, canvasH);

      const comp = selectedEComponent;
      try {
        const evalExpr = new Function('x1', 'x2', 'x3', `return [${exExpr}, ${eyExpr}, ${ezExpr}];`);
        const data = new Float64Array(NX);
        let emin = Infinity, emax = -Infinity;
        for (let ix = 0; ix < NX; ix++) {
          const x = Lx * (ix + 0.5) / NX;
          const [vx, vy, vz] = evalExpr(x, 0, 0);
          let val;
          if (comp === 'Ex') val = vx;
          else if (comp === 'Ey') val = vy;
          else if (comp === 'Ez') val = vz;
          else val = Math.sqrt(vx * vx + vy * vy + vz * vz);
          data[ix] = val;
          if (val < emin) emin = val;
          if (val > emax) emax = val;
        }

        msgEl.textContent = '';
        msgEl.style.display = 'none';

        // Y-axis range
        if (emin === emax) {
          if (emin === 0) { emin = 0; emax = 1; }
          else { const pad = Math.abs(emin) * 0.1; emin -= pad; emax += pad; }
        }
        const range = emax - emin;

        const fmtVal = (v) => {
          if (v === 0) return '0';
          if (Math.abs(v) >= 1000 || Math.abs(v) < 0.01) return v.toExponential(1);
          return v.toPrecision(3);
        };

        // Grid lines
        ctx.strokeStyle = '#21262d';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
          const gx = marginLeft + (plotW * i / 4);
          ctx.beginPath(); ctx.moveTo(gx, marginTop); ctx.lineTo(gx, marginTop + plotH); ctx.stroke();
          const gy = marginTop + (plotH * i / 4);
          ctx.beginPath(); ctx.moveTo(marginLeft, gy); ctx.lineTo(marginLeft + plotW, gy); ctx.stroke();
        }

        // Axes border
        ctx.strokeStyle = '#30363d';
        ctx.lineWidth = 1;
        ctx.strokeRect(marginLeft, marginTop, plotW, plotH);

        // Draw line
        ctx.beginPath();
        ctx.strokeStyle = '#58a6ff';
        ctx.lineWidth = 2;
        for (let ix = 0; ix < NX; ix++) {
          const px = marginLeft + (ix + 0.5) / NX * plotW;
          const py = marginTop + plotH - ((data[ix] - emin) / range) * plotH;
          if (ix === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();

        // X-axis labels
        ctx.fillStyle = '#8b949e';
        ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('x', marginLeft + plotW / 2, canvasH - 2);
        ctx.textAlign = 'left';
        ctx.fillText('0', marginLeft, canvasH - 16);
        ctx.textAlign = 'right';
        ctx.fillText(Lx % 1 === 0 ? String(Lx) : Lx.toFixed(1), marginLeft + plotW, canvasH - 16);

        // Y-axis labels
        const plotLabel = comp === 'mag' ? '|E|' : comp;
        ctx.save();
        ctx.translate(10, marginTop + plotH / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.fillText(plotLabel, 0, 0);
        ctx.restore();
        ctx.textAlign = 'right';
        ctx.fillText(fmtVal(emin), marginLeft - 4, marginTop + plotH);
        ctx.fillText(fmtVal(emax), marginLeft - 4, marginTop + 10);

      } catch (e) {
        ctx.clearRect(0, 0, canvasW, canvasH);
        canvas.width = 0;
        canvas.height = 0;
        msgEl.textContent = 'Cannot evaluate E-field expression';
        msgEl.style.display = '';
      }
      return;
    }

    // Show for 2D and 3D
    if (currentDim < 2) {
      container.style.display = 'none';
      return;
    }
    container.style.display = '';

    // Show/hide 3D controls
    const controls3d = container.querySelector('.plot-3d-controls');
    if (controls3d) controls3d.style.display = currentDim === 3 ? '' : 'none';

    const boxsize = state.grid_space?.boxsize || [];
    const Lx = parseFloat(boxsize[0]) || 1;
    const Ly = parseFloat(boxsize[1]) || 1;
    const Lz = parseFloat(boxsize[2]) || 1;
    const axisNames = ['x', 'y', 'z'];

    const exExpr = translateExpr(state.ext_emf?.Ex || '0.');
    const eyExpr = translateExpr(state.ext_emf?.Ey || '0.');
    const ezExpr = translateExpr(state.ext_emf?.Ez || '0.');

    let hAxisLabel, vAxisLabel, La, Lb;
    let buildCoords;
    if (currentDim === 3) {
      const L = [Lx, Ly, Lz];
      const sa = eFieldSliceAxis;
      const freeAxes = [0, 1, 2].filter(i => i !== sa);
      La = L[freeAxes[0]]; Lb = L[freeAxes[1]];
      const fixedCoord = eFieldSlicePos * L[sa];
      hAxisLabel = axisNames[freeAxes[0]];
      vAxisLabel = axisNames[freeAxes[1]];
      buildCoords = (a, b) => {
        const c = [0, 0, 0];
        c[freeAxes[0]] = a; c[freeAxes[1]] = b; c[sa] = fixedCoord;
        return c;
      };
      const sliceValEl = document.getElementById('e-field-slice-val');
      if (sliceValEl) sliceValEl.textContent = axisNames[sa] + ' = ' + fixedCoord.toFixed(1);
    } else {
      La = Lx; Lb = Ly;
      hAxisLabel = 'x'; vAxisLabel = 'y';
      buildCoords = (a, b) => [a, b, 0];
    }

    const NX = 200, NY = 200;
    const plotW = 300, plotH = Math.round(plotW * (Lb / La));
    const barW = 16, barGap = 8, labelW = 50;
    const marginLeft = 40, marginTop = 10, marginBottom = 30, marginRight = barGap + barW + labelW;
    const canvasW = marginLeft + plotW + marginRight;
    const canvasH = marginTop + plotH + marginBottom;

    canvas.width = canvasW;
    canvas.height = canvasH;
    canvas.style.width = canvasW + 'px';
    canvas.style.height = canvasH + 'px';

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvasW, canvasH);

    const comp = selectedEComponent;
    let emag;
    try {
      emag = new Float64Array(NX * NY);
      const evalExpr = new Function('x1', 'x2', 'x3', `return [${exExpr}, ${eyExpr}, ${ezExpr}];`);
      let emin = Infinity, emax = -Infinity;
      for (let ib = 0; ib < NY; ib++) {
        const b = Lb * (ib + 0.5) / NY;
        for (let ia = 0; ia < NX; ia++) {
          const a = La * (ia + 0.5) / NX;
          const [cx, cy, cz] = buildCoords(a, b);
          const [vx, vy, vz] = evalExpr(cx, cy, cz);
          let val;
          if (comp === 'Ex') val = vx;
          else if (comp === 'Ey') val = vy;
          else if (comp === 'Ez') val = vz;
          else val = Math.sqrt(vx * vx + vy * vy + vz * vz);
          emag[ib * NX + ia] = val;
          if (val < emin) emin = val;
          if (val > emax) emax = val;
        }
      }

      msgEl.textContent = '';
      msgEl.style.display = 'none';

      const colorMap = COLORMAPS[selectedColormap] || COLORMAPS.coolwarm;

      const imgData = ctx.createImageData(NX, NY);
      const range = emax - emin || 1;
      for (let iy = 0; iy < NY; iy++) {
        for (let ix = 0; ix < NX; ix++) {
          const t = (emag[(NY - 1 - iy) * NX + ix] - emin) / range;
          const [r, g, b] = colorMap(t);
          const idx = (iy * NX + ix) * 4;
          imgData.data[idx] = r;
          imgData.data[idx + 1] = g;
          imgData.data[idx + 2] = b;
          imgData.data[idx + 3] = 255;
        }
      }

      const offscreen = document.createElement('canvas');
      offscreen.width = NX;
      offscreen.height = NY;
      offscreen.getContext('2d').putImageData(imgData, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(offscreen, marginLeft, marginTop, plotW, plotH);

      ctx.strokeStyle = '#30363d';
      ctx.lineWidth = 1;
      ctx.strokeRect(marginLeft, marginTop, plotW, plotH);

      ctx.fillStyle = '#8b949e';
      ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(hAxisLabel, marginLeft + plotW / 2, canvasH - 2);
      ctx.textAlign = 'left';
      ctx.fillText('0', marginLeft, canvasH - 16);
      ctx.textAlign = 'right';
      ctx.fillText(La % 1 === 0 ? String(La) : La.toFixed(1), marginLeft + plotW, canvasH - 16);
      ctx.save();
      ctx.translate(10, marginTop + plotH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center';
      ctx.fillText(vAxisLabel, 0, 0);
      ctx.restore();
      ctx.textAlign = 'right';
      ctx.fillText('0', marginLeft - 4, marginTop + plotH);
      ctx.fillText(Lb % 1 === 0 ? String(Lb) : Lb.toFixed(1), marginLeft - 4, marginTop + 10);

      const barX = marginLeft + plotW + barGap;
      const barTop = marginTop;
      const barH = plotH;
      for (let iy = 0; iy < barH; iy++) {
        const t = 1 - iy / barH;
        const [r, g, b] = colorMap(t);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(barX, barTop + iy, barW, 1);
      }
      ctx.strokeStyle = '#30363d';
      ctx.strokeRect(barX, barTop, barW, barH);

      ctx.fillStyle = '#8b949e';
      ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'left';
      const fmtVal = (v) => {
        if (v === 0) return '0';
        if (Math.abs(v) >= 1000 || Math.abs(v) < 0.01) return v.toExponential(1);
        return v.toPrecision(3);
      };
      ctx.fillText(fmtVal(emax), barX + barW + 3, barTop + 9);
      ctx.fillText(fmtVal(emin), barX + barW + 3, barTop + barH);
      const emid = (emin + emax) / 2;
      ctx.fillText(fmtVal(emid), barX + barW + 3, barTop + barH / 2 + 4);

      ctx.fillStyle = '#8b949e';
      ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'right';
      const plotLabel = comp === 'mag' ? '|E|' : comp;
      ctx.fillText(plotLabel, barX + barW, barTop - 2 > 0 ? barTop - 2 : barTop);

    } catch (e) {
      ctx.clearRect(0, 0, canvasW, canvasH);
      canvas.width = 0;
      canvas.height = 0;
      msgEl.textContent = 'Cannot evaluate E-field expression for heatmap';
      msgEl.style.display = '';
    }
  }

  function debouncedRenderEFieldPlot() {
    if (_eFieldPlotTimer) clearTimeout(_eFieldPlotTimer);
    _eFieldPlotTimer = setTimeout(renderEFieldPlot, 100);
  }

  // ---- nsp density heatmap plot ----
  let _nspPlotTimer = null;
  let nspSliceAxis = 2;
  let nspSlicePos = 0.5;

  function renderNspPlot() {
    const container = document.getElementById('nsp-plot');
    if (!container) return;
    const canvas = document.getElementById('nsp-canvas');
    const msgEl = document.getElementById('nsp-plot-msg');
    if (!canvas || !msgEl) return;

    if (currentDim === 1) {
      // --- 1D line plot with domain_boundary clipping and nsp_domain masking ---
      container.style.display = '';
      const c3d = container.querySelector('.plot-3d-controls');
      if (c3d) c3d.style.display = 'none';

      const boxsize = state.grid_space?.boxsize || [];
      const Lx = parseFloat(boxsize[0]) || 1;

      const spIdx = activeSpeciesIdx['species'] || 0;
      const speciesData = state.species?.[spIdx];
      if (!speciesData) return;

      const ctVals = speciesData.ct || [];
      const nspExpr = translateExpr(speciesData.nsp || '1.', ctVals);

      const domBd = speciesData.domain_boundary || [];
      const xlo = (Number(domBd[0]) >= 0) ? Number(domBd[0]) : 0;
      const xhi = (Number(domBd[1]) >= 0) ? Number(domBd[1]) : Lx;

      const nspDomainStr = (speciesData.nsp_domain || '').trim();
      const nspDomainExpr = nspDomainStr ? translateExpr(nspDomainStr, ctVals) : null;

      const NX = 200;
      const plotW = 300, plotH = 200;
      const marginLeft = 50, marginTop = 10, marginBottom = 30, marginRight = 10;
      const canvasW = marginLeft + plotW + marginRight;
      const canvasH = marginTop + plotH + marginBottom;

      canvas.width = canvasW;
      canvas.height = canvasH;
      canvas.style.width = canvasW + 'px';
      canvas.style.height = canvasH + 'px';

      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvasW, canvasH);

      try {
        const evalNsp = new Function('x1', 'x2', 'x3', 'return (' + nspExpr + ');');
        const evalDomain = nspDomainExpr ? new Function('x1', 'x2', 'x3', 'return (' + nspDomainExpr + ');') : null;
        const data = new Float64Array(NX);
        const mask = new Uint8Array(NX);
        let vmin = Infinity, vmax = -Infinity;
        for (let ix = 0; ix < NX; ix++) {
          const x = Lx * (ix + 0.5) / NX;
          if (x < xlo || x > xhi) { data[ix] = 0; mask[ix] = 0; continue; }
          if (evalDomain && evalDomain(x, 0, 0) <= 0) { data[ix] = 0; mask[ix] = 0; continue; }
          const val = evalNsp(x, 0, 0);
          data[ix] = val; mask[ix] = 1;
          if (val < vmin) vmin = val;
          if (val > vmax) vmax = val;
        }
        if (!isFinite(vmin)) { vmin = 0; vmax = 1; }

        msgEl.textContent = '';
        msgEl.style.display = 'none';

        // Y-axis range
        if (vmin === vmax) {
          if (vmin === 0) { vmin = 0; vmax = 1; }
          else { const pad = Math.abs(vmin) * 0.1; vmin -= pad; vmax += pad; }
        }
        const range = vmax - vmin;

        const fmtVal = (v) => {
          if (v === 0) return '0';
          if (Math.abs(v) >= 1000 || Math.abs(v) < 0.01) return v.toExponential(1);
          return v.toPrecision(3);
        };

        // Grid lines
        ctx.strokeStyle = '#21262d';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
          const gx = marginLeft + (plotW * i / 4);
          ctx.beginPath(); ctx.moveTo(gx, marginTop); ctx.lineTo(gx, marginTop + plotH); ctx.stroke();
          const gy = marginTop + (plotH * i / 4);
          ctx.beginPath(); ctx.moveTo(marginLeft, gy); ctx.lineTo(marginLeft + plotW, gy); ctx.stroke();
        }

        // Axes border
        ctx.strokeStyle = '#30363d';
        ctx.lineWidth = 1;
        ctx.strokeRect(marginLeft, marginTop, plotW, plotH);

        // Draw line segments (gaps where masked)
        ctx.strokeStyle = '#58a6ff';
        ctx.lineWidth = 2;
        let inSegment = false;
        for (let ix = 0; ix < NX; ix++) {
          if (!mask[ix]) { if (inSegment) { ctx.stroke(); inSegment = false; } continue; }
          const px = marginLeft + (ix + 0.5) / NX * plotW;
          const py = marginTop + plotH - ((data[ix] - vmin) / range) * plotH;
          if (!inSegment) { ctx.beginPath(); ctx.moveTo(px, py); inSegment = true; }
          else { ctx.lineTo(px, py); }
        }
        if (inSegment) ctx.stroke();

        // X-axis labels
        ctx.fillStyle = '#8b949e';
        ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('x', marginLeft + plotW / 2, canvasH - 2);
        ctx.textAlign = 'left';
        ctx.fillText('0', marginLeft, canvasH - 16);
        ctx.textAlign = 'right';
        ctx.fillText(Lx % 1 === 0 ? String(Lx) : Lx.toFixed(1), marginLeft + plotW, canvasH - 16);

        // Y-axis labels
        ctx.save();
        ctx.translate(10, marginTop + plotH / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.fillText('n', 0, 0);
        ctx.restore();
        ctx.textAlign = 'right';
        ctx.fillText(fmtVal(vmin), marginLeft - 4, marginTop + plotH);
        ctx.fillText(fmtVal(vmax), marginLeft - 4, marginTop + 10);

      } catch (e) {
        ctx.clearRect(0, 0, canvasW, canvasH);
        canvas.width = 0;
        canvas.height = 0;
        msgEl.textContent = 'Cannot evaluate density expression';
        msgEl.style.display = '';
      }
      return;
    }

    // Show for 2D and 3D
    if (currentDim < 2) {
      container.style.display = 'none';
      return;
    }
    container.style.display = '';

    // Show/hide 3D controls
    const nspControls3d = container.querySelector('.plot-3d-controls');
    if (nspControls3d) nspControls3d.style.display = currentDim === 3 ? '' : 'none';

    const boxsize = state.grid_space?.boxsize || [];
    const Lx = parseFloat(boxsize[0]) || 1;
    const Ly = parseFloat(boxsize[1]) || 1;
    const Lz = parseFloat(boxsize[2]) || 1;
    const axisNames = ['x', 'y', 'z'];

    const spIdx = activeSpeciesIdx['species'] || 0;
    const speciesData = state.species?.[spIdx];
    if (!speciesData) return;

    const ctVals = speciesData.ct || [];
    const nspExpr = translateExpr(speciesData.nsp || '1.', ctVals);

    // domain_boundary: [x_l, x_r, y_l, y_r, z_l, z_r]
    const domBd = speciesData.domain_boundary || [];
    const fullL = [Lx, Ly, Lz];

    let hAxisLabel, vAxisLabel, La, Lb;
    let buildCoords;
    let domLoA, domHiA, domLoB, domHiB;
    let fixedAxisMasked = false;

    if (currentDim === 3) {
      const sa = nspSliceAxis;
      const freeAxes = [0, 1, 2].filter(i => i !== sa);
      La = fullL[freeAxes[0]]; Lb = fullL[freeAxes[1]];
      const fixedCoord = nspSlicePos * fullL[sa];
      hAxisLabel = axisNames[freeAxes[0]];
      vAxisLabel = axisNames[freeAxes[1]];
      buildCoords = (a, b) => {
        const c = [0, 0, 0];
        c[freeAxes[0]] = a; c[freeAxes[1]] = b; c[sa] = fixedCoord;
        return c;
      };
      const sliceValEl = document.getElementById('nsp-slice-val');
      if (sliceValEl) sliceValEl.textContent = axisNames[sa] + ' = ' + fixedCoord.toFixed(1);

      // Check if fixed coordinate is outside domain_boundary for slice axis
      const fixLo = Number(domBd[2 * sa]);
      const fixHi = Number(domBd[2 * sa + 1]);
      if ((fixLo >= 0 && fixedCoord < fixLo) || (fixHi >= 0 && fixedCoord > fixHi)) {
        fixedAxisMasked = true;
      }

      domLoA = (Number(domBd[2 * freeAxes[0]]) >= 0) ? Number(domBd[2 * freeAxes[0]]) : 0;
      domHiA = (Number(domBd[2 * freeAxes[0] + 1]) >= 0) ? Number(domBd[2 * freeAxes[0] + 1]) : La;
      domLoB = (Number(domBd[2 * freeAxes[1]]) >= 0) ? Number(domBd[2 * freeAxes[1]]) : 0;
      domHiB = (Number(domBd[2 * freeAxes[1] + 1]) >= 0) ? Number(domBd[2 * freeAxes[1] + 1]) : Lb;
    } else {
      La = Lx; Lb = Ly;
      hAxisLabel = 'x'; vAxisLabel = 'y';
      buildCoords = (a, b) => [a, b, 0];
      domLoA = (Number(domBd[0]) >= 0) ? Number(domBd[0]) : 0;
      domHiA = (Number(domBd[1]) >= 0) ? Number(domBd[1]) : Lx;
      domLoB = (currentDim >= 2 && Number(domBd[2]) >= 0) ? Number(domBd[2]) : 0;
      domHiB = (currentDim >= 2 && Number(domBd[3]) >= 0) ? Number(domBd[3]) : Ly;
    }

    // nsp_domain: spatial mask expression
    const nspDomainStr = (speciesData.nsp_domain || '').trim();
    const nspDomainExpr = nspDomainStr ? translateExpr(nspDomainStr, ctVals) : null;

    const NX = 200, NY = 200;
    const plotW = 300, plotH = Math.round(plotW * (Lb / La));
    const barW = 16, barGap = 8, labelW = 50;
    const marginLeft = 40, marginTop = 10, marginBottom = 30, marginRight = barGap + barW + labelW;
    const canvasW = marginLeft + plotW + marginRight;
    const canvasH = marginTop + plotH + marginBottom;

    canvas.width = canvasW;
    canvas.height = canvasH;
    canvas.style.width = canvasW + 'px';
    canvas.style.height = canvasH + 'px';

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvasW, canvasH);

    try {
      const vals = new Float64Array(NX * NY);
      const mask = new Uint8Array(NX * NY);
      const evalNsp = new Function('x1', 'x2', 'x3', 'return (' + nspExpr + ');');
      const evalDomain = nspDomainExpr ? new Function('x1', 'x2', 'x3', 'return (' + nspDomainExpr + ');') : null;
      let vmin = Infinity, vmax = -Infinity;
      for (let ib = 0; ib < NY; ib++) {
        const b = Lb * (ib + 0.5) / NY;
        for (let ia = 0; ia < NX; ia++) {
          const a = La * (ia + 0.5) / NX;
          const idx = ib * NX + ia;
          // If fixed axis is outside domain_boundary, entire slice is masked
          if (fixedAxisMasked) {
            vals[idx] = 0; mask[idx] = 0;
            continue;
          }
          // Apply domain_boundary clipping for free axes
          if (a < domLoA || a > domHiA || b < domLoB || b > domHiB) {
            vals[idx] = 0; mask[idx] = 0;
            continue;
          }
          const [cx, cy, cz] = buildCoords(a, b);
          // Apply nsp_domain mask
          if (evalDomain && evalDomain(cx, cy, cz) <= 0) {
            vals[idx] = 0; mask[idx] = 0;
            continue;
          }
          const val = evalNsp(cx, cy, cz);
          vals[idx] = val; mask[idx] = 1;
          if (val < vmin) vmin = val;
          if (val > vmax) vmax = val;
        }
      }
      if (!isFinite(vmin)) { vmin = 0; vmax = 1; }

      msgEl.textContent = '';
      msgEl.style.display = 'none';

      const colorMap = COLORMAPS[selectedColormap] || COLORMAPS.viridis;

      const imgData = ctx.createImageData(NX, NY);
      const range = vmax - vmin || 1;
      for (let iy = 0; iy < NY; iy++) {
        for (let ix = 0; ix < NX; ix++) {
          const srcIdx = (NY - 1 - iy) * NX + ix;
          const pxIdx = (iy * NX + ix) * 4;
          if (!mask[srcIdx]) {
            imgData.data[pxIdx] = 13;
            imgData.data[pxIdx + 1] = 17;
            imgData.data[pxIdx + 2] = 23;
            imgData.data[pxIdx + 3] = 255;
          } else {
            const t = (vals[srcIdx] - vmin) / range;
            const [r, g, b] = colorMap(t);
            imgData.data[pxIdx] = r;
            imgData.data[pxIdx + 1] = g;
            imgData.data[pxIdx + 2] = b;
            imgData.data[pxIdx + 3] = 255;
          }
        }
      }

      const offscreen = document.createElement('canvas');
      offscreen.width = NX;
      offscreen.height = NY;
      offscreen.getContext('2d').putImageData(imgData, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(offscreen, marginLeft, marginTop, plotW, plotH);

      ctx.strokeStyle = '#30363d';
      ctx.lineWidth = 1;
      ctx.strokeRect(marginLeft, marginTop, plotW, plotH);

      ctx.fillStyle = '#8b949e';
      ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(hAxisLabel, marginLeft + plotW / 2, canvasH - 2);
      ctx.textAlign = 'left';
      ctx.fillText('0', marginLeft, canvasH - 16);
      ctx.textAlign = 'right';
      ctx.fillText(La % 1 === 0 ? String(La) : La.toFixed(1), marginLeft + plotW, canvasH - 16);
      ctx.save();
      ctx.translate(10, marginTop + plotH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center';
      ctx.fillText(vAxisLabel, 0, 0);
      ctx.restore();
      ctx.textAlign = 'right';
      ctx.fillText('0', marginLeft - 4, marginTop + plotH);
      ctx.fillText(Lb % 1 === 0 ? String(Lb) : Lb.toFixed(1), marginLeft - 4, marginTop + 10);

      const barX = marginLeft + plotW + barGap;
      const barTop = marginTop;
      const barH = plotH;
      for (let iy = 0; iy < barH; iy++) {
        const t = 1 - iy / barH;
        const [r, g, b] = colorMap(t);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(barX, barTop + iy, barW, 1);
      }
      ctx.strokeStyle = '#30363d';
      ctx.strokeRect(barX, barTop, barW, barH);

      ctx.fillStyle = '#8b949e';
      ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'left';
      const fmtVal = (v) => {
        if (v === 0) return '0';
        if (Math.abs(v) >= 1000 || Math.abs(v) < 0.01) return v.toExponential(1);
        return v.toPrecision(3);
      };
      ctx.fillText(fmtVal(vmax), barX + barW + 3, barTop + 9);
      ctx.fillText(fmtVal(vmin), barX + barW + 3, barTop + barH);
      const vmid = (vmin + vmax) / 2;
      ctx.fillText(fmtVal(vmid), barX + barW + 3, barTop + barH / 2 + 4);

      ctx.fillStyle = '#8b949e';
      ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('n', barX + barW, barTop - 2 > 0 ? barTop - 2 : barTop);

    } catch (e) {
      ctx.clearRect(0, 0, canvasW, canvasH);
      canvas.width = 0;
      canvas.height = 0;
      msgEl.textContent = 'Cannot evaluate density expression';
      msgEl.style.display = '';
    }
  }

  function debouncedRenderNspPlot() {
    if (_nspPlotTimer) clearTimeout(_nspPlotTimer);
    _nspPlotTimer = setTimeout(renderNspPlot, 100);
  }

  // ---- vsp velocity spatial plot ----
  let selectedVspComponent = 'mag';
  let vspSliceAxis = 2;
  let vspSlicePos = 0.5;
  let _vspPlotTimer = null;

  function renderVspPlot() {
    const container = document.getElementById('vsp-plot');
    if (!container) return;
    const canvas = document.getElementById('vsp-canvas');
    const msgEl = document.getElementById('vsp-plot-msg');
    if (!canvas || !msgEl) return;

    const boxsize = state.grid_space?.boxsize || [];
    const Lx = parseFloat(boxsize[0]) || 1;
    const Ly = parseFloat(boxsize[1]) || 1;
    const Lz = parseFloat(boxsize[2]) || 1;

    const spIdx = activeSpeciesIdx['species'] || 0;
    const speciesData = state.species?.[spIdx];
    if (!speciesData) return;

    const ctVals = speciesData.ct || [];
    const vsp = speciesData.vsp || ['', '', ''];
    const vdrift = speciesData.vdrift || [0, 0, 0];

    // Check if ALL vsp components are empty — uniform velocity
    const allEmpty = vsp.every(s => !s || !s.trim());
    if (allEmpty) {
      canvas.width = 0;
      canvas.height = 0;
      const vd = vdrift.map(v => Number(v) || 0);
      msgEl.textContent = 'Uniform velocity: vdrift = [' + vd.join(', ') + ']';
      msgEl.style.display = '';
      const c3d = container.querySelector('.plot-3d-controls');
      if (c3d) c3d.style.display = 'none';
      return;
    }

    // Build expression for each component: if vsp[i] non-empty, use it; else use vdrift[i] constant
    const compExprs = [];
    for (let i = 0; i < 3; i++) {
      const s = (vsp[i] || '').trim();
      if (s) {
        compExprs.push(translateExpr(s, ctVals));
      } else {
        compExprs.push(String(Number(vdrift[i]) || 0));
      }
    }

    // Build an eval function that returns the selected component value at (x1, x2, x3)
    let evalBody;
    const comp = selectedVspComponent;
    if (comp === 'vx') {
      evalBody = 'return (' + compExprs[0] + ');';
    } else if (comp === 'vy') {
      evalBody = 'return (' + compExprs[1] + ');';
    } else if (comp === 'vz') {
      evalBody = 'return (' + compExprs[2] + ');';
    } else {
      // magnitude
      evalBody = 'var _vx=(' + compExprs[0] + '),_vy=(' + compExprs[1] + '),_vz=(' + compExprs[2] + '); return Math.sqrt(_vx*_vx+_vy*_vy+_vz*_vz);';
    }

    const compLabel = comp === 'mag' ? '|v|' : comp;

    if (currentDim === 1) {
      // --- 1D line plot ---
      container.style.display = '';
      const c3d = container.querySelector('.plot-3d-controls');
      if (c3d) c3d.style.display = 'none';

      const NX = 200;
      const plotW = 300, plotH = 200;
      const marginLeft = 50, marginTop = 10, marginBottom = 30, marginRight = 10;
      const canvasW = marginLeft + plotW + marginRight;
      const canvasH = marginTop + plotH + marginBottom;

      canvas.width = canvasW;
      canvas.height = canvasH;
      canvas.style.width = canvasW + 'px';
      canvas.style.height = canvasH + 'px';

      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvasW, canvasH);

      try {
        const evalFn = new Function('x1', 'x2', 'x3', evalBody);
        const data = new Float64Array(NX);
        let vmin = Infinity, vmax = -Infinity;
        for (let ix = 0; ix < NX; ix++) {
          const x = Lx * (ix + 0.5) / NX;
          const val = evalFn(x, 0, 0);
          data[ix] = val;
          if (val < vmin) vmin = val;
          if (val > vmax) vmax = val;
        }
        if (!isFinite(vmin)) { vmin = 0; vmax = 1; }

        msgEl.textContent = '';
        msgEl.style.display = 'none';

        if (vmin === vmax) {
          if (vmin === 0) { vmin = 0; vmax = 1; }
          else { const pad = Math.abs(vmin) * 0.1; vmin -= pad; vmax += pad; }
        }
        const range = vmax - vmin;

        const fmtVal = (v) => {
          if (v === 0) return '0';
          if (Math.abs(v) >= 1000 || Math.abs(v) < 0.01) return v.toExponential(1);
          return v.toPrecision(3);
        };

        // Grid lines
        ctx.strokeStyle = '#21262d';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
          const gx = marginLeft + (plotW * i / 4);
          ctx.beginPath(); ctx.moveTo(gx, marginTop); ctx.lineTo(gx, marginTop + plotH); ctx.stroke();
          const gy = marginTop + (plotH * i / 4);
          ctx.beginPath(); ctx.moveTo(marginLeft, gy); ctx.lineTo(marginLeft + plotW, gy); ctx.stroke();
        }

        // Axes border
        ctx.strokeStyle = '#30363d';
        ctx.lineWidth = 1;
        ctx.strokeRect(marginLeft, marginTop, plotW, plotH);

        // Draw line
        ctx.strokeStyle = '#58a6ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let ix = 0; ix < NX; ix++) {
          const px = marginLeft + (ix + 0.5) / NX * plotW;
          const py = marginTop + plotH - ((data[ix] - vmin) / range) * plotH;
          if (ix === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();

        // X-axis labels
        ctx.fillStyle = '#8b949e';
        ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('x', marginLeft + plotW / 2, canvasH - 2);
        ctx.textAlign = 'left';
        ctx.fillText('0', marginLeft, canvasH - 16);
        ctx.textAlign = 'right';
        ctx.fillText(Lx % 1 === 0 ? String(Lx) : Lx.toFixed(1), marginLeft + plotW, canvasH - 16);

        // Y-axis labels
        ctx.save();
        ctx.translate(10, marginTop + plotH / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.fillText(compLabel, 0, 0);
        ctx.restore();
        ctx.textAlign = 'right';
        ctx.fillText(fmtVal(vmin), marginLeft - 4, marginTop + plotH);
        ctx.fillText(fmtVal(vmax), marginLeft - 4, marginTop + 10);

      } catch (e) {
        ctx.clearRect(0, 0, canvasW, canvasH);
        canvas.width = 0;
        canvas.height = 0;
        msgEl.textContent = 'Cannot evaluate velocity expression';
        msgEl.style.display = '';
      }
      return;
    }

    // --- 2D/3D heatmap ---
    if (currentDim < 2) {
      container.style.display = 'none';
      return;
    }
    container.style.display = '';

    const vspControls3d = container.querySelector('.plot-3d-controls');
    if (vspControls3d) vspControls3d.style.display = currentDim === 3 ? '' : 'none';

    const axisNames = ['x', 'y', 'z'];
    const fullL = [Lx, Ly, Lz];

    let hAxisLabel, vAxisLabel, La, Lb;
    let buildCoords;

    if (currentDim === 3) {
      const sa = vspSliceAxis;
      const freeAxes = [0, 1, 2].filter(i => i !== sa);
      La = fullL[freeAxes[0]]; Lb = fullL[freeAxes[1]];
      const fixedCoord = vspSlicePos * fullL[sa];
      hAxisLabel = axisNames[freeAxes[0]];
      vAxisLabel = axisNames[freeAxes[1]];
      buildCoords = (a, b) => {
        const c = [0, 0, 0];
        c[freeAxes[0]] = a; c[freeAxes[1]] = b; c[sa] = fixedCoord;
        return c;
      };
      const sliceValEl = document.getElementById('vsp-slice-val');
      if (sliceValEl) sliceValEl.textContent = axisNames[sa] + ' = ' + fixedCoord.toFixed(1);
    } else {
      La = Lx; Lb = Ly;
      hAxisLabel = 'x'; vAxisLabel = 'y';
      buildCoords = (a, b) => [a, b, 0];
    }

    const NX = 200, NY = 200;
    const plotW = 300, plotH = Math.round(plotW * (Lb / La));
    const barW = 16, barGap = 8, labelW = 50;
    const marginLeft = 40, marginTop = 10, marginBottom = 30, marginRight = barGap + barW + labelW;
    const canvasW = marginLeft + plotW + marginRight;
    const canvasH = marginTop + plotH + marginBottom;

    canvas.width = canvasW;
    canvas.height = canvasH;
    canvas.style.width = canvasW + 'px';
    canvas.style.height = canvasH + 'px';

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvasW, canvasH);

    try {
      const evalFn = new Function('x1', 'x2', 'x3', evalBody);
      const vals = new Float64Array(NX * NY);
      let vmin = Infinity, vmax = -Infinity;
      for (let ib = 0; ib < NY; ib++) {
        const b = Lb * (ib + 0.5) / NY;
        for (let ia = 0; ia < NX; ia++) {
          const a = La * (ia + 0.5) / NX;
          const idx = ib * NX + ia;
          const [cx, cy, cz] = buildCoords(a, b);
          const val = evalFn(cx, cy, cz);
          vals[idx] = val;
          if (val < vmin) vmin = val;
          if (val > vmax) vmax = val;
        }
      }
      if (!isFinite(vmin)) { vmin = 0; vmax = 1; }

      msgEl.textContent = '';
      msgEl.style.display = 'none';

      const colorMap = COLORMAPS[selectedColormap] || COLORMAPS.viridis;

      const imgData = ctx.createImageData(NX, NY);
      const range = vmax - vmin || 1;
      for (let iy = 0; iy < NY; iy++) {
        for (let ix = 0; ix < NX; ix++) {
          const srcIdx = (NY - 1 - iy) * NX + ix;
          const pxIdx = (iy * NX + ix) * 4;
          const t = (vals[srcIdx] - vmin) / range;
          const [r, g, b] = colorMap(t);
          imgData.data[pxIdx] = r;
          imgData.data[pxIdx + 1] = g;
          imgData.data[pxIdx + 2] = b;
          imgData.data[pxIdx + 3] = 255;
        }
      }

      const offscreen = document.createElement('canvas');
      offscreen.width = NX;
      offscreen.height = NY;
      offscreen.getContext('2d').putImageData(imgData, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(offscreen, marginLeft, marginTop, plotW, plotH);

      ctx.strokeStyle = '#30363d';
      ctx.lineWidth = 1;
      ctx.strokeRect(marginLeft, marginTop, plotW, plotH);

      ctx.fillStyle = '#8b949e';
      ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(hAxisLabel, marginLeft + plotW / 2, canvasH - 2);
      ctx.textAlign = 'left';
      ctx.fillText('0', marginLeft, canvasH - 16);
      ctx.textAlign = 'right';
      ctx.fillText(La % 1 === 0 ? String(La) : La.toFixed(1), marginLeft + plotW, canvasH - 16);
      ctx.save();
      ctx.translate(10, marginTop + plotH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center';
      ctx.fillText(vAxisLabel, 0, 0);
      ctx.restore();
      ctx.textAlign = 'right';
      ctx.fillText('0', marginLeft - 4, marginTop + plotH);
      ctx.fillText(Lb % 1 === 0 ? String(Lb) : Lb.toFixed(1), marginLeft - 4, marginTop + 10);

      // Colorbar
      const barX = marginLeft + plotW + barGap;
      const barTop = marginTop;
      const barH = plotH;
      for (let iy = 0; iy < barH; iy++) {
        const t = 1 - iy / barH;
        const [r, g, b] = colorMap(t);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(barX, barTop + iy, barW, 1);
      }
      ctx.strokeStyle = '#30363d';
      ctx.strokeRect(barX, barTop, barW, barH);

      ctx.fillStyle = '#8b949e';
      ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'left';
      const fmtVal = (v) => {
        if (v === 0) return '0';
        if (Math.abs(v) >= 1000 || Math.abs(v) < 0.01) return v.toExponential(1);
        return v.toPrecision(3);
      };
      ctx.fillText(fmtVal(vmax), barX + barW + 3, barTop + 9);
      ctx.fillText(fmtVal(vmin), barX + barW + 3, barTop + barH);
      const vmid = (vmin + vmax) / 2;
      ctx.fillText(fmtVal(vmid), barX + barW + 3, barTop + barH / 2 + 4);

      ctx.fillStyle = '#8b949e';
      ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(compLabel, barX + barW, barTop - 2 > 0 ? barTop - 2 : barTop);

    } catch (e) {
      ctx.clearRect(0, 0, canvasW, canvasH);
      canvas.width = 0;
      canvas.height = 0;
      msgEl.textContent = 'Cannot evaluate velocity expression';
      msgEl.style.display = '';
    }
  }

  function debouncedRenderVspPlot() {
    if (_vspPlotTimer) clearTimeout(_vspPlotTimer);
    _vspPlotTimer = setTimeout(renderVspPlot, 100);
  }

  // ---- Selectrule spatial plot ----
  let selectruleSliceAxis = 2;
  let selectruleSlicePos = 0.5;
  let _selectrulePlotTimer = null;

  function renderSelectrulePlot() {
    const container = document.getElementById('selectrule-plot');
    if (!container) return;
    const canvas = document.getElementById('selectrule-canvas');
    const msgEl = document.getElementById('selectrule-plot-msg');
    if (!canvas || !msgEl) return;

    const spIdx = activeSpeciesIdx['raw_diag'] || 0;
    const rawData = state.raw_diag?.[spIdx];
    if (!rawData) return;

    const selectruleStr = (rawData.selectrule || '1.').trim();

    // Default: all particles selected
    if (selectruleStr === '1.' || selectruleStr === '1' || selectruleStr === '1.0') {
      canvas.width = 0;
      canvas.height = 0;
      msgEl.textContent = 'Default: all particles selected';
      msgEl.style.display = '';
      const c3d = container.querySelector('.plot-3d-controls');
      if (c3d) c3d.style.display = 'none';
      return;
    }

    const ctVals = rawData.ct || [];
    const expr = translateExpr(selectruleStr, ctVals);

    const boxsize = state.grid_space?.boxsize || [];
    const Lx = parseFloat(boxsize[0]) || 1;
    const Ly = parseFloat(boxsize[1]) || 1;
    const Lz = parseFloat(boxsize[2]) || 1;
    const axisNames = ['x', 'y', 'z'];

    if (currentDim === 1) {
      // --- 1D line plot ---
      container.style.display = '';
      const c3d = container.querySelector('.plot-3d-controls');
      if (c3d) c3d.style.display = 'none';

      const NX = 200;
      const plotW = 300, plotH = 200;
      const marginLeft = 50, marginTop = 10, marginBottom = 30, marginRight = 10;
      const canvasW = marginLeft + plotW + marginRight;
      const canvasH = marginTop + plotH + marginBottom;

      canvas.width = canvasW;
      canvas.height = canvasH;
      canvas.style.width = canvasW + 'px';
      canvas.style.height = canvasH + 'px';

      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvasW, canvasH);

      try {
        const evalExpr = new Function('x1', 'x2', 'x3', 'vx', 'vy', 'vz', 'return (' + expr + ');');
        const data = new Float64Array(NX);
        for (let ix = 0; ix < NX; ix++) {
          const x = Lx * (ix + 0.5) / NX;
          const val = evalExpr(x, 0, 0, 0, 0, 0);
          data[ix] = val > 0 ? 1 : 0;
        }

        msgEl.textContent = '';
        msgEl.style.display = 'none';

        const vmin = 0, vmax = 1;

        // Grid lines
        ctx.strokeStyle = '#21262d';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
          const gx = marginLeft + (plotW * i / 4);
          ctx.beginPath(); ctx.moveTo(gx, marginTop); ctx.lineTo(gx, marginTop + plotH); ctx.stroke();
          const gy = marginTop + (plotH * i / 4);
          ctx.beginPath(); ctx.moveTo(marginLeft, gy); ctx.lineTo(marginLeft + plotW, gy); ctx.stroke();
        }

        // Axes border
        ctx.strokeStyle = '#30363d';
        ctx.lineWidth = 1;
        ctx.strokeRect(marginLeft, marginTop, plotW, plotH);

        // Draw line segments
        ctx.strokeStyle = '#58a6ff';
        ctx.lineWidth = 2;
        let inSegment = false;
        for (let ix = 0; ix < NX; ix++) {
          const px = marginLeft + (ix + 0.5) / NX * plotW;
          const py = marginTop + plotH - data[ix] * plotH;
          if (!inSegment) { ctx.beginPath(); ctx.moveTo(px, py); inSegment = true; }
          else { ctx.lineTo(px, py); }
        }
        if (inSegment) ctx.stroke();

        // X-axis labels
        ctx.fillStyle = '#8b949e';
        ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('x', marginLeft + plotW / 2, canvasH - 2);
        ctx.textAlign = 'left';
        ctx.fillText('0', marginLeft, canvasH - 16);
        ctx.textAlign = 'right';
        ctx.fillText(Lx % 1 === 0 ? String(Lx) : Lx.toFixed(1), marginLeft + plotW, canvasH - 16);

        // Y-axis labels
        ctx.save();
        ctx.translate(10, marginTop + plotH / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.fillText('select', 0, 0);
        ctx.restore();
        ctx.textAlign = 'right';
        ctx.fillText('0', marginLeft - 4, marginTop + plotH);
        ctx.fillText('1', marginLeft - 4, marginTop + 10);

      } catch (e) {
        ctx.clearRect(0, 0, canvasW, canvasH);
        canvas.width = 0;
        canvas.height = 0;
        msgEl.textContent = 'Cannot evaluate selectrule expression';
        msgEl.style.display = '';
      }
      return;
    }

    // 2D and 3D modes
    if (currentDim < 2) {
      container.style.display = 'none';
      return;
    }
    container.style.display = '';

    // Show/hide 3D controls and ensure slider is bound
    const srControls3d = container.querySelector('.plot-3d-controls');
    if (srControls3d) srControls3d.style.display = currentDim === 3 ? '' : 'none';
    const srSlider = document.getElementById('selectrule-slice-pos');
    if (srSlider && !srSlider._bound) {
      srSlider._bound = true;
      srSlider.addEventListener('input', () => {
        selectruleSlicePos = parseFloat(srSlider.value);
        renderSelectrulePlot();
      });
    }
    const srAxisSel = document.getElementById('selectrule-slice-axis');
    if (srAxisSel && !srAxisSel._bound) {
      srAxisSel._bound = true;
      srAxisSel.addEventListener('change', () => {
        selectruleSliceAxis = parseInt(srAxisSel.value);
        renderSelectrulePlot();
      });
    }

    const fullL = [Lx, Ly, Lz];
    let hAxisLabel, vAxisLabel, La, Lb;
    let buildCoords;

    if (currentDim === 3) {
      const sa = selectruleSliceAxis;
      const freeAxes = [0, 1, 2].filter(i => i !== sa);
      La = fullL[freeAxes[0]]; Lb = fullL[freeAxes[1]];
      const fixedCoord = selectruleSlicePos * fullL[sa];
      hAxisLabel = axisNames[freeAxes[0]];
      vAxisLabel = axisNames[freeAxes[1]];
      buildCoords = (a, b) => {
        const c = [0, 0, 0];
        c[freeAxes[0]] = a; c[freeAxes[1]] = b; c[sa] = fixedCoord;
        return c;
      };
      const sliceValEl = document.getElementById('selectrule-slice-val');
      if (sliceValEl) sliceValEl.textContent = axisNames[sa] + ' = ' + fixedCoord.toFixed(1);
    } else {
      La = Lx; Lb = Ly;
      hAxisLabel = 'x'; vAxisLabel = 'y';
      buildCoords = (a, b) => [a, b, 0];
    }

    const NX = 200, NY = 200;
    const plotW = 300, plotH = Math.round(plotW * (Lb / La));
    const barW = 16, barGap = 8, labelW = 50;
    const marginLeft = 40, marginTop = 10, marginBottom = 30, marginRight = barGap + barW + labelW;
    const canvasW = marginLeft + plotW + marginRight;
    const canvasH = marginTop + plotH + marginBottom;

    canvas.width = canvasW;
    canvas.height = canvasH;
    canvas.style.width = canvasW + 'px';
    canvas.style.height = canvasH + 'px';

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvasW, canvasH);

    try {
      const evalExpr = new Function('x1', 'x2', 'x3', 'vx', 'vy', 'vz', 'return (' + expr + ');');
      const vals = new Uint8Array(NX * NY);
      for (let ib = 0; ib < NY; ib++) {
        const b = Lb * (ib + 0.5) / NY;
        for (let ia = 0; ia < NX; ia++) {
          const a = La * (ia + 0.5) / NX;
          const [cx, cy, cz] = buildCoords(a, b);
          const val = evalExpr(cx, cy, cz, 0, 0, 0);
          vals[ib * NX + ia] = val > 0 ? 1 : 0;
        }
      }

      msgEl.textContent = '';
      msgEl.style.display = 'none';

      const colorMap = COLORMAPS[selectedColormap] || COLORMAPS.viridis;

      const imgData = ctx.createImageData(NX, NY);
      for (let iy = 0; iy < NY; iy++) {
        for (let ix = 0; ix < NX; ix++) {
          const srcIdx = (NY - 1 - iy) * NX + ix;
          const pxIdx = (iy * NX + ix) * 4;
          if (!vals[srcIdx]) {
            // Dark background where not selected
            imgData.data[pxIdx] = 13;
            imgData.data[pxIdx + 1] = 17;
            imgData.data[pxIdx + 2] = 23;
            imgData.data[pxIdx + 3] = 255;
          } else {
            const [r, g, b] = colorMap(1.0);
            imgData.data[pxIdx] = r;
            imgData.data[pxIdx + 1] = g;
            imgData.data[pxIdx + 2] = b;
            imgData.data[pxIdx + 3] = 255;
          }
        }
      }

      const offscreen = document.createElement('canvas');
      offscreen.width = NX;
      offscreen.height = NY;
      offscreen.getContext('2d').putImageData(imgData, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(offscreen, marginLeft, marginTop, plotW, plotH);

      ctx.strokeStyle = '#30363d';
      ctx.lineWidth = 1;
      ctx.strokeRect(marginLeft, marginTop, plotW, plotH);

      ctx.fillStyle = '#8b949e';
      ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(hAxisLabel, marginLeft + plotW / 2, canvasH - 2);
      ctx.textAlign = 'left';
      ctx.fillText('0', marginLeft, canvasH - 16);
      ctx.textAlign = 'right';
      ctx.fillText(La % 1 === 0 ? String(La) : La.toFixed(1), marginLeft + plotW, canvasH - 16);
      ctx.save();
      ctx.translate(10, marginTop + plotH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center';
      ctx.fillText(vAxisLabel, 0, 0);
      ctx.restore();
      ctx.textAlign = 'right';
      ctx.fillText('0', marginLeft - 4, marginTop + plotH);
      ctx.fillText(Lb % 1 === 0 ? String(Lb) : Lb.toFixed(1), marginLeft - 4, marginTop + 10);

      // Colorbar (binary: 0 = not selected, 1 = selected)
      const barX = marginLeft + plotW + barGap;
      const barTop = marginTop;
      const barH = plotH;
      for (let iy = 0; iy < barH; iy++) {
        const t = 1 - iy / barH;
        if (t > 0.5) {
          const [r, g, b] = colorMap(1.0);
          ctx.fillStyle = `rgb(${r},${g},${b})`;
        } else {
          ctx.fillStyle = 'rgb(13,17,23)';
        }
        ctx.fillRect(barX, barTop + iy, barW, 1);
      }
      ctx.strokeStyle = '#30363d';
      ctx.strokeRect(barX, barTop, barW, barH);

      ctx.fillStyle = '#8b949e';
      ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('1', barX + barW + 3, barTop + 9);
      ctx.fillText('0', barX + barW + 3, barTop + barH);

      ctx.fillStyle = '#8b949e';
      ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('select', barX + barW, barTop - 2 > 0 ? barTop - 2 : barTop);

    } catch (e) {
      ctx.clearRect(0, 0, canvasW, canvasH);
      canvas.width = 0;
      canvas.height = 0;
      msgEl.textContent = 'Cannot evaluate selectrule expression';
      msgEl.style.display = '';
    }
  }

  function debouncedRenderSelectrulePlot() {
    if (_selectrulePlotTimer) clearTimeout(_selectrulePlotTimer);
    _selectrulePlotTimer = setTimeout(renderSelectrulePlot, 100);
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
      for (let i = 0; i < currentDim; i++) {
        dims.push(Math.min(Number(xres[i]) || 256, Number(ncells[i]) || 128));
      }
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
      const niter = Number(state.time?.niter);
      const tend = parseFloat(state.time?.tend);
      const stiter = Number(state.time?.stiter) || 0;
      const adaptiveDt = state.time?.adaptive_dt;
      const niterDisabled = isNaN(niter) || niter < 0;
      const tendDisabled = isNaN(tend) || tend < 0;

      if (c <= 0) warnings.push(`c = ${c} — speed of light must be > 0`);
      if (niterDisabled && tendDisabled) {
        warnings.push('Both niter and tend are disabled (-1) — one must be set');
      }
      if (!niterDisabled && !tendDisabled) {
        warnings.push('Both niter and tend are set — the code will refuse to start. Set one to -1');
      }
      if (!niterDisabled && niter <= 0) warnings.push(`niter = ${niter} — must be > 0`);
      if (!tendDisabled && tend <= 0) warnings.push(`tend = ${tend} — must be > 0`);
      if (!niterDisabled && stiter >= niter && stiter > 0) {
        warnings.push(`stiter (${stiter}) ≥ niter (${niter}) — simulation will never start`);
      }
      if (adaptiveDt) {
        const cflFactor = parseFloat(state.time?.cfl_factor) || 0;
        if (cflFactor <= 0 || cflFactor > 1) {
          warnings.push(`cfl_factor = ${cflFactor} — should be in (0, 1]`);
        }
        if (tendDisabled && !niterDisabled) {
          warnings.push('adaptive_dt with niter: niter may not reflect actual simulation time — consider using tend instead');
        }
      }
    }

    if (skey === 'global_output') {
      const adaptiveDt = state.time?.adaptive_dt;
      const niter = Number(state.time?.niter);
      const ndump = Number(state.global_output?.ndump) || 0;
      const tdump = parseFloat(state.global_output?.tdump);
      const ndumpSet = ndump > 0;
      const tdumpSet = !isNaN(tdump) && tdump > 0;

      if (niter > 0 && ndumpSet && ndump > niter) warnings.push(`ndump (${ndump}) > niter (${niter}) — no diagnostics will be written`);
      if (ndumpSet && tdumpSet) warnings.push('Both ndump and tdump are set — the code will refuse to start. Set one to -1');
      if (!ndumpSet && !tdumpSet) warnings.push('Both ndump and tdump are disabled — no diagnostics will be written');
      if (adaptiveDt && ndumpSet && !tdumpSet) warnings.push('adaptive_dt is on — use tdump instead of ndump (dt varies each step)');
    }

    if (skey === 'raw_diag') {
      const adaptiveDt = state.time?.adaptive_dt;
      const ndump = Number(state.global_output?.ndump) || 0;
      const spIdx = activeSpeciesIdx['raw_diag'] || 0;
      const data = state.raw_diag?.[spIdx];
      const rawNdump = Number(data?.raw_ndump) || 0;
      const rawTdump = parseFloat(data?.raw_tdump);
      const rawNdumpSet = rawNdump > 0;
      const rawTdumpSet = !isNaN(rawTdump) && rawTdump > 0;

      if (rawNdumpSet && rawTdumpSet) warnings.push('Both raw_ndump and raw_tdump are set — the code will refuse to start. Set one to -1');
      if (ndump > 0 && rawNdumpSet && rawNdump % ndump !== 0) {
        warnings.push(`raw_ndump (${rawNdump}) must be a multiple of ndump (${ndump})`);
      }
      if (adaptiveDt && rawNdumpSet && !rawTdumpSet) warnings.push('adaptive_dt is on — use raw_tdump instead of raw_ndump');
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

  // ---- Node Optimizer ----
  function getPermutations(arr) {
    if (arr.length <= 1) return [arr];
    const results = [];
    const seen = new Set();
    for (let i = 0; i < arr.length; i++) {
      const rest = arr.slice(0, i).concat(arr.slice(i + 1));
      for (const perm of getPermutations(rest)) {
        const key = [arr[i], ...perm].join(',');
        if (!seen.has(key)) {
          seen.add(key);
          results.push([arr[i], ...perm]);
        }
      }
    }
    return results;
  }

  function bestDecompositionND(ncells, nprocs) {
    const ndim = ncells.length;
    if (nprocs < 1) return null;

    // 1D: trivial
    if (ndim === 1) {
      const subAxes = [ncells[0] / nprocs];
      return { nprocs, procAxes: [nprocs], subAxes, error: 0, normalizedError: 0 };
    }

    let best = null;
    let bestProcSpread = Infinity;

    const factorTuples = [];
    if (ndim === 2) {
      for (let a = 1; a <= Math.floor(Math.sqrt(nprocs)); a++) {
        if (nprocs % a === 0) {
          factorTuples.push([a, nprocs / a]);
        }
      }
    } else {
      // 3D
      const cbrt = Math.round(Math.pow(nprocs, 1 / 3));
      for (let a = 1; a <= cbrt + 1; a++) {
        if (nprocs % a !== 0) continue;
        const rem = nprocs / a;
        for (let b = 1; b <= Math.floor(Math.sqrt(rem)); b++) {
          if (rem % b === 0) {
            factorTuples.push([a, b, rem / b]);
          }
        }
      }
    }

    for (const factors of factorTuples) {
      for (const procAxes of getPermutations(factors)) {
        const subAxes = ncells.map((nc, i) => nc / procAxes[i]);
        const maxSub = Math.max(...subAxes);
        const minSub = Math.min(...subAxes);
        const error = maxSub - minSub;
        const normalizedError = maxSub > 0 ? error / maxSub : 0;
        const procSpread = Math.max(...procAxes) - Math.min(...procAxes);

        if (best === null ||
            normalizedError < best.normalizedError - 1e-12 ||
            (Math.abs(normalizedError - best.normalizedError) < 1e-12 && procSpread < bestProcSpread)) {
          best = { nprocs, procAxes: [...procAxes], subAxes, error, normalizedError };
          bestProcSpread = procSpread;
        }
      }
    }
    return best;
  }

  function computeNodeRecommendations(targetPPP) {
    const ncells = (state.grid_space?.ncells || []).slice(0, currentDim).map(v => parseInt(v) || 1);
    const numSpecies = getSpeciesCount();
    const ndim = currentDim;

    // Compute total particles per cell across all species
    let totalPPC = 0;
    for (let s = 0; s < numSpecies; s++) {
      const numPar = (state.species?.[s]?.num_par || [2, 2, 2]).slice(0, ndim).map(v => parseInt(v) || 1);
      let ppc = 1;
      for (let i = 0; i < ndim; i++) ppc *= numPar[i];
      totalPPC += ppc;
    }

    const totalCells = ncells.reduce((a, b) => a * b, 1);
    const totalParticles = totalCells * totalPPC;
    const idealNprocs = totalParticles / targetPPP;

    const center = Math.max(1, Math.round(idealNprocs));
    const start = Math.max(1, center - 8);
    const end = center + 8;

    const candidates = [];
    for (let nprocs = start; nprocs <= end; nprocs++) {
      const dcmp = bestDecompositionND(ncells, nprocs);
      if (!dcmp) continue;
      const particlesPerProc = totalParticles / nprocs;
      const cellsPerProc = totalCells / nprocs;
      candidates.push({
        nprocs,
        procAxes: dcmp.procAxes,
        subAxes: dcmp.subAxes,
        cellsPerProc,
        particlesPerProc,
        error: dcmp.error,
        normalizedError: dcmp.normalizedError,
        targetDelta: Math.abs(particlesPerProc - targetPPP),
        idealDelta: Math.abs(nprocs - idealNprocs),
      });
    }

    // Recommended: closest to target particles/proc
    const recommended = candidates.reduce((best, c) => {
      if (!best) return c;
      if (c.targetDelta < best.targetDelta) return c;
      if (c.targetDelta === best.targetDelta && c.normalizedError < best.normalizedError) return c;
      if (c.targetDelta === best.targetDelta && c.normalizedError === best.normalizedError && c.idealDelta < best.idealDelta) return c;
      return best;
    }, null);

    // Top 5 most square
    const squareSorted = candidates.slice().sort((a, b) => {
      if (a.normalizedError !== b.normalizedError) return a.normalizedError - b.normalizedError;
      if (a.targetDelta !== b.targetDelta) return a.targetDelta - b.targetDelta;
      return a.idealDelta - b.idealDelta;
    }).slice(0, 5);

    return { totalParticles, idealNprocs, candidates: squareSorted, recommended };
  }

  function renderNodeOptimizer() {
    const resultsDiv = document.getElementById('node-optimizer-results');
    if (!resultsDiv) return;

    const slider = document.getElementById('node-optimizer-slider');
    const targetLabel = document.getElementById('node-optimizer-target-label');
    if (!slider) return;

    // Bind slider event if not already bound
    if (!slider.dataset.bound) {
      slider.dataset.bound = '1';
      slider.addEventListener('input', () => {
        const val = Math.round(Math.pow(10, parseFloat(slider.value)));
        if (targetLabel) targetLabel.textContent = val.toLocaleString();
        renderNodeOptimizer();
      });
    }

    const targetPPP = Math.round(Math.pow(10, parseFloat(slider.value)));

    const { totalParticles, idealNprocs, candidates, recommended } = computeNodeRecommendations(targetPPP);

    if (candidates.length === 0) {
      resultsDiv.innerHTML = '<div class="node-opt-empty">Could not compute decompositions.</div>';
      return;
    }

    const axesLabel = 'node_number';

    let html = '';
    html += `<div class="node-opt-summary">`;
    html += `<span>Total particles: <strong>${totalParticles.toLocaleString()}</strong></span>`;
    html += `<span>Ideal nprocs: <strong>${idealNprocs.toFixed(1)}</strong></span>`;
    html += `</div>`;

    html += `<table class="node-opt-table">`;
    html += `<thead><tr>`;
    html += `<th title="Total number of MPI processes">nprocs</th>`;
    html += `<th title="Processes per dimension — set as node_number">${axesLabel}</th>`;
    html += `<th title="Grid cells per process (total). Hover rows for per-dimension breakdown.">cells/proc</th>`;
    html += `<th title="Estimated particles per process">particles/proc</th>`;
    html += `<th title="Squareness error (0 = perfectly balanced subdomains). Lower is better.">error</th>`;
    html += `<th></th>`;
    html += `</tr></thead><tbody>`;

    for (const c of candidates) {
      const isRec = recommended && c.nprocs === recommended.nprocs &&
                    c.procAxes.join(',') === recommended.procAxes.join(',');
      const rowClass = isRec ? 'node-opt-recommended' : '';
      const axes = c.procAxes.join(' x ');
      const cellsPerDim = c.subAxes.map(v => Math.ceil(v)).join(' x ');
      html += `<tr class="${rowClass}">`;
      html += `<td>${c.nprocs}</td>`;
      html += `<td>${axes}</td>`;
      html += `<td title="${cellsPerDim} per dim">${Math.round(c.cellsPerProc).toLocaleString()}</td>`;
      html += `<td>${Math.round(c.particlesPerProc).toLocaleString()}</td>`;
      html += `<td>${c.normalizedError.toFixed(3)}</td>`;
      html += `<td><button type="button" class="node-opt-apply" data-proc-axes="${c.procAxes.join(',')}">${isRec ? 'Apply' : 'Apply'}</button></td>`;
      html += `</tr>`;
    }
    html += `</tbody></table>`;

    resultsDiv.innerHTML = html;

    // Bind apply buttons
    resultsDiv.querySelectorAll('.node-opt-apply').forEach(btn => {
      btn.addEventListener('click', () => {
        const axes = btn.dataset.procAxes.split(',').map(Number);
        // Update state
        const nodeNumber = state.node_conf.node_number;
        for (let i = 0; i < currentDim; i++) {
          if (i < axes.length) nodeNumber[i] = axes[i];
        }
        // Update UI inputs
        for (let i = 0; i < currentDim; i++) {
          const input = document.querySelector(`[data-section="node_conf"][data-key="node_number"][data-index="${i}"]`);
          if (input) input.value = axes[i];
        }
        updatePreview();
      });
    });
  }

  // ---- Toast ----
  function toast(msg) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2200);
  }

  // ---- Parameter search ----
  function initSearch() {
    const input = document.getElementById('param-search');
    const dropdown = document.getElementById('search-dropdown');
    if (!input || !dropdown) return;

    // Build search index from schema
    const searchIndex = [];
    for (const [skey, sec] of Object.entries(SCHEMA)) {
      for (const field of sec.fields) {
        searchIndex.push({
          sectionKey: skey,
          fieldKey: field.key,
          label: field.label || field.key,
          hint: field.hint || '',
          sectionLabel: sec.label || skey,
        });
      }
    }

    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      if (!q) { dropdown.classList.add('hidden'); dropdown.innerHTML = ''; return; }

      const results = searchIndex.filter(e =>
        e.fieldKey.toLowerCase().includes(q) ||
        e.label.toLowerCase().includes(q) ||
        e.hint.toLowerCase().includes(q) ||
        e.sectionLabel.toLowerCase().includes(q)
      ).slice(0, 10);

      if (results.length === 0) {
        dropdown.innerHTML = '<div class="search-empty">No matches</div>';
        dropdown.classList.remove('hidden');
        return;
      }

      dropdown.innerHTML = results.map(r =>
        `<div class="search-result" data-section="${r.sectionKey}" data-key="${r.fieldKey}">` +
        `<span class="search-field">${r.label}</span>` +
        `<span class="search-section">${r.sectionLabel}</span>` +
        (r.hint ? `<span class="search-hint">${r.hint.length > 60 ? r.hint.slice(0, 60) + '...' : r.hint}</span>` : '') +
        `</div>`
      ).join('');
      dropdown.classList.remove('hidden');

      dropdown.querySelectorAll('.search-result').forEach(el => {
        el.addEventListener('mousedown', e => {
          e.preventDefault(); // prevent blur before click fires
          const skey = el.dataset.section;
          const fkey = el.dataset.key;
          input.value = '';
          dropdown.classList.add('hidden');
          dropdown.innerHTML = '';
          setActiveSection(skey);
          // Highlight the field after a tick (DOM needs to render)
          setTimeout(() => {
            const fieldEl = document.querySelector(`[data-section="${skey}"][data-key="${fkey}"]`);
            const row = fieldEl?.closest('.field-row');
            if (row) {
              row.scrollIntoView({ behavior: 'smooth', block: 'center' });
              row.classList.add('search-highlight');
              setTimeout(() => row.classList.remove('search-highlight'), 2000);
            }
          }, 50);
        });
      });
    });

    input.addEventListener('blur', () => {
      setTimeout(() => { dropdown.classList.add('hidden'); }, 150);
    });

    input.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        input.value = '';
        dropdown.classList.add('hidden');
        dropdown.innerHTML = '';
        input.blur();
      }
    });
  }

  // ---- Go ----
  document.addEventListener('DOMContentLoaded', init);
})();
