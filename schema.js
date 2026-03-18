// dHybridR input file schema — every parameter from every Read* subroutine
// dim: 0=scalar, 'DIM'=DIM-dependent, 'DIM2'=DIM*2, 'BDIM'=2*(DIM-1), 'VDIM'=always 3, N=fixed
// type: 'int','real','bool','str','strarr'
// perSpecies sections repeat num_species times

const SCHEMA = {
  node_conf: {
    namelist: 'nl_node_conf',
    label: 'Node Configuration',
    desc: 'MPI process decomposition. Product of node_number must equal mpirun -np N.',
    required: true,
    fields: [
      { key: 'node_number', label: 'Node number', type: 'int', dim: 'DIM',
        default: [1,1,1], hint: 'Processes per dimension',
        dimLabels: ['x','y','z'] },
    ]
  },

  time: {
    namelist: 'nl_time',
    label: 'Time',
    desc: 'Simulation time stepping parameters.',
    required: true,
    fields: [
      { key: 'dt', label: 'dt', type: 'real', dim: 0, default: 0.0025, hint: 'Time step' },
      { key: 'niter', label: 'niter', type: 'int', dim: 0, default: 2000, hint: 'Number of iterations' },
      { key: 't0', label: 't0', type: 'real', dim: 0, default: 0.0, hint: 'Initial time' },
      { key: 'stiter', label: 'stiter', type: 'int', dim: 0, default: 0, hint: 'Starting iteration number' },
      { key: 'c', label: 'c', type: 'real', dim: 0, default: 100.0, hint: 'Speed of light' },
    ]
  },

  grid_space: {
    namelist: 'nl_grid_space',
    label: 'Grid & Space',
    desc: 'Computational grid size, physical box size, and boundary types.',
    required: true,
    fields: [
      { key: 'ncells', label: 'ncells', type: 'int', dim: 'DIM',
        default: [128,128,128], hint: 'Grid cells per dimension',
        dimLabels: ['Nx','Ny','Nz'] },
      { key: 'boxsize', label: 'boxsize', type: 'real', dim: 'DIM',
        default: [64,64,64], hint: 'Box size in normalized units',
        dimLabels: ['Lx','Ly','Lz'] },
      { key: 'bdtype', label: 'bdtype', type: 'strarr', dim: 'DIM2',
        default: ['per','per','per','per','per','per'],
        options: ['per','reflect','open'],
        hint: 'Boundary types: xl, xr, yl, yr, zl, zr',
        dimLabels: ['x\u2097','x\u1d63','y\u2097','y\u1d63','z\u2097','z\u1d63'] },
      { key: 'K', label: 'K', type: 'real', dim: 0, default: 1.0, hint: 'Adiabatic constant (must be > 0)' },
      { key: 'gamma', label: 'gamma', type: 'real', dim: 0, default: 1.67, hint: 'Adiabatic index (must be > 0)' },
    ]
  },

  global_output: {
    namelist: 'nl_global_output',
    label: 'Output',
    desc: 'Global diagnostic output settings.',
    required: true,
    fields: [
      { key: 'dodump', label: 'dodump', type: 'bool', dim: 0, default: true, hint: 'Enable diagnostic dumps' },
      { key: 'ndump', label: 'ndump', type: 'int', dim: 0, default: 100, hint: 'Iterations between dumps' },
      { key: 'output_folder', label: 'output_folder', type: 'str', dim: 0, default: 'Output', hint: 'Output directory' },
      { key: 'B0', label: 'B0', type: 'real', dim: 0, default: 3.05191e-7, hint: 'B field normalization (T)' },
      { key: 'n0', label: 'n0', type: 'real', dim: 0, default: 1e6, hint: 'Density normalization (m\u207b\u00b3)' },
      { key: 'units', label: 'units', type: 'str', dim: 0, default: 'NORM',
        options: ['NORM','IS'], hint: '"NORM" (normalized) or "IS" (SI units)' },
      { key: 'filemode', label: 'filemode', type: 'str', dim: 0, default: 'SERIAL',
        options: ['SERIAL','PARALLEL'], hint: 'HDF5 file mode' },
    ]
  },

  restart: {
    namelist: 'nl_restart',
    label: 'Restart',
    desc: 'Checkpoint / restart configuration.',
    required: true,
    fields: [
      { key: 'do_restart', label: 'do_restart', type: 'bool', dim: 0, default: false, hint: 'Restarting a previous simulation?' },
      { key: 'save_restart', label: 'save_restart', type: 'bool', dim: 0, default: true, hint: 'Save restart files?' },
      { key: 'restart_step', label: 'restart_step', type: 'int', dim: 0, default: -1, hint: 'Iterations between restart dumps (-1=disabled)' },
      { key: 'restart_time', label: 'restart_time', type: 'int', dim: 0, default: 7200, hint: 'Wall-time restart (seconds, -1=disabled)' },
      { key: 'restart_time_step', label: 'restart_time_step', type: 'int', dim: 0, default: 100, hint: 'Check interval for time-based restart' },
    ]
  },

  ext_emf: {
    namelist: 'nl_ext_emf',
    label: 'External EM Fields',
    desc: 'External electromagnetic field expressions (function parser syntax).',
    required: true,
    groups: [
      { title: 'Magnetic Field', keys: ['Bx','By','Bz'] },
      { title: 'Electric Field', keys: ['Ex','Ey','Ez'] },
      { title: 'Constants & Extras', keys: ['n_constants','ct','Jext','NoiseLevel','adddipole','a_dipole','pos_dipole','curr_dipole'] },
    ],
    fields: [
      { key: 'Bx', label: 'Bx', type: 'str', dim: 0, default: '0.', hint: 'B_x expression' },
      { key: 'By', label: 'By', type: 'str', dim: 0, default: '0.', hint: 'B_y expression' },
      { key: 'Bz', label: 'Bz', type: 'str', dim: 0, default: '0.', hint: 'B_z expression' },
      { key: 'Ex', label: 'Ex', type: 'str', dim: 0, default: '0.', hint: 'E_x expression' },
      { key: 'Ey', label: 'Ey', type: 'str', dim: 0, default: '0.', hint: 'E_y expression' },
      { key: 'Ez', label: 'Ez', type: 'str', dim: 0, default: '0.', hint: 'E_z expression' },
      { key: 'n_constants', label: 'n_constants', type: 'int', dim: 0, default: 0, hint: 'Number of user constants' },
      { key: 'ct', label: 'ct', type: 'real', dim: 16, default: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], hint: 'Constants ct(1:16)', advanced: true },
      { key: 'Jext', label: 'Jext', type: 'real', dim: 'VDIM', default: [0,0,0], hint: 'External current J(x,y,z)',
        dimLabels: ['Jx','Jy','Jz'] },
      { key: 'NoiseLevel', label: 'NoiseLevel', type: 'real', dim: 'VDIM', default: [0,0,0], hint: 'Noise added to B components',
        dimLabels: ['x','y','z'] },
      { key: 'adddipole', label: 'adddipole', type: 'bool', dim: 0, default: false, hint: 'Add dipolar field' },
      { key: 'a_dipole', label: 'a_dipole', type: 'real', dim: 0, default: 0, hint: 'Dipole radius' },
      { key: 'pos_dipole', label: 'pos_dipole', type: 'real', dim: 'DIM', default: [0,0,0], hint: 'Dipole position',
        dimLabels: ['x','y','z'] },
      { key: 'curr_dipole', label: 'curr_dipole', type: 'real', dim: 0, default: 0, hint: 'Dipole current' },
    ]
  },

  ext_force: {
    namelist: 'nl_ext_force',
    label: 'External Force',
    desc: 'External gravitational/mass-loading force (optional).',
    required: false,
    enabled: false,
    fields: [
      { key: 'ftype', label: 'ftype', type: 'str', dim: 0, default: '',
        options: ['','GRAV','MASS','GRAVMASS'], hint: 'Force type (blank=none)' },
      { key: 'center', label: 'center', type: 'real', dim: 'DIM', default: [0,0,0], hint: 'Force center',
        dimLabels: ['x','y','z'] },
      { key: 'k', label: 'K', type: 'real', dim: 0, default: 0, hint: 'Force constant' },
      { key: 'rmin', label: 'rmin', type: 'real', dim: 0, default: 10, hint: 'Minimum radius' },
      { key: 'subcycling_step', label: 'subcycling_step', type: 'int', dim: 0, default: -1, hint: 'Recalculate every N steps (-1=never)' },
    ]
  },

  field_diag: {
    namelist: 'nl_field_diag',
    label: 'Field Diagnostics',
    desc: 'Which field components to dump.',
    required: true,
    fields: [
      { key: 'dmp_efld', label: 'dmp_efld', type: 'bool', dim: 4,
        default: [false,false,true,true],
        hint: 'E-field: self-int, self-vec, total-int, total-vec',
        dimLabels: ['Self |E|','Self E\u20d7','Total |E|','Total E\u20d7'] },
      { key: 'dmp_bfld', label: 'dmp_bfld', type: 'bool', dim: 4,
        default: [false,false,true,true],
        hint: 'B-field: self-int, self-vec, total-int, total-vec',
        dimLabels: ['Self |B|','Self B\u20d7','Total |B|','Total B\u20d7'] },
      { key: 'dmp_jfld', label: 'dmp_jfld', type: 'bool', dim: 2,
        default: [false,false],
        hint: 'Current: intensity, vector',
        dimLabels: ['|J|','J\u20d7'] },
    ]
  },

  algorithm: {
    namelist: 'nl_algorithm',
    label: 'Algorithm',
    desc: 'Numerical algorithm settings. Some values are overridden internally.',
    required: false,
    fields: [
      { key: 'ifsmooth', label: 'ifsmooth', type: 'bool', dim: 0, default: true, hint: 'Smooth fields (overridden to .true.)' },
      { key: 'ifsmoothextfields', label: 'ifsmoothextfields', type: 'bool', dim: 0, default: true, hint: 'Smooth external fields' },
      { key: 'filternpass', label: 'filternpass', type: 'int', dim: 0, default: 6, hint: 'Filter passes' },
      { key: 'compensate', label: 'compensate', type: 'bool', dim: 0, default: false, hint: 'Compensating filter (overridden to .false.)' },
      { key: 'subniter', label: 'subniter', type: 'int', dim: 0, default: 8, hint: 'Sub-iterations (overridden to 8)' },
      { key: 'allowederror', label: 'allowederror', type: 'real', dim: 0, default: 1.0, hint: 'Allowed error (overridden to 1.0)' },
      { key: 'resistivity', label: 'resistivity', type: 'real', dim: 0, default: 0, hint: 'Resistivity' },
    ]
  },

  loadbalance: {
    namelist: 'nl_loadbalance',
    label: 'Load Balancing',
    desc: 'MPI domain load balancing.',
    required: false,
    fields: [
      { key: 'loadbalance', label: 'loadbalance', type: 'bool', dim: 0, default: true, hint: 'Enable load balancing' },
      { key: 'ifdynamicloadbalance', label: 'ifdynamicloadbalance', type: 'bool', dim: 0, default: true, hint: 'Dynamic rebalancing' },
      { key: 'dynamicloadbalancestep', label: 'dynamicloadbalancestep', type: 'int', dim: 0, default: 35, hint: 'Steps between rebalances' },
    ]
  },

  particles: {
    namelist: 'nl_particles',
    label: 'Particles',
    desc: 'Global particle settings.',
    required: true,
    fields: [
      { key: 'num_species', label: 'num_species', type: 'int', dim: 0, default: 1, hint: 'Number of ion species (\u22651)', min: 1, max: 10 },
    ]
  },

  // --- Per-species sections ---
  species: {
    namelist: 'nl_species',
    label: 'Species',
    desc: 'Ion species definition.',
    required: true, perSpecies: true,
    groups: [
      { title: 'Basic', keys: ['name','dist','num_par','spare_size','ir','mass_to_charge_ratio'] },
      { title: 'Velocity', keys: ['vdrift','vth','vsp','vnorm','match_velocity_to_gravity','pl_slope'] },
      { title: 'Density', keys: ['nsp','nsp_domain','domain_boundary','n_constants','ct'] },
      { title: 'Tracking', keys: ['follow','chk_dup'] },
    ],
    fields: [
      { key: 'name', label: 'name', type: 'str', dim: 0, default: 'H+', hint: 'Species name' },
      { key: 'dist', label: 'dist', type: 'str', dim: 0, default: 'THERMAL',
        options: ['THERMAL','ISO','POWERLAW'], hint: 'Velocity distribution' },
      { key: 'num_par', label: 'num_par', type: 'int', dim: 'DIM',
        default: [2,2,2], hint: 'Particles per cell', dimLabels: ['x','y','z'] },
      { key: 'spare_size', label: 'spare_size', type: 'real', dim: 0, default: 0.1, hint: 'Spare memory fraction (0-1)' },
      { key: 'ir', label: 'ir', type: 'int', dim: 0, default: 1, hint: 'Ionization ratio' },
      { key: 'mass_to_charge_ratio', label: 'mass_to_charge_ratio', type: 'real', dim: 0, default: 1.0, hint: 'm/q ratio' },
      { key: 'vdrift', label: 'vdrift', type: 'real', dim: 'VDIM',
        default: [0,0,0], hint: 'Drift velocity', dimLabels: ['vx','vy','vz'] },
      { key: 'vth', label: 'vth', type: 'real', dim: 0, default: 1.0, hint: 'Thermal velocity' },
      { key: 'vsp', label: 'vsp', type: 'strarr', dim: 'VDIM_STR',
        default: ['','',''], hint: 'Velocity function expressions (overrides vdrift)',
        dimLabels: ['vsp_x','vsp_y','vsp_z'] },
      { key: 'vnorm', label: 'vnorm', type: 'real', dim: 'VDIM',
        default: [1,1,1], hint: 'Velocity direction', dimLabels: ['x','y','z'] },
      { key: 'match_velocity_to_gravity', label: 'match_velocity_to_gravity', type: 'bool', dim: 0, default: false, hint: 'Auto-match velocity to gravity' },
      { key: 'pl_slope', label: 'pl_slope', type: 'real', dim: 0, default: -4.0, hint: 'Power-law slope (only for dist=POWERLAW)' },
      { key: 'nsp', label: 'nsp', type: 'str', dim: 0, default: '1.', hint: 'Density expression (function parser)' },
      { key: 'nsp_domain', label: 'nsp_domain', type: 'str', dim: 0, default: '', hint: 'Domain mask expression' },
      { key: 'domain_boundary', label: 'domain_boundary', type: 'real', dim: 'DIM2',
        default: [-1,-1,-1,-1,-1,-1], hint: 'Density domain bounds',
        dimLabels: ['x\u2097','x\u1d63','y\u2097','y\u1d63','z\u2097','z\u1d63'] },
      { key: 'n_constants', label: 'n_constants', type: 'int', dim: 0, default: 0, hint: 'Number of parser constants' },
      { key: 'ct', label: 'ct', type: 'real', dim: 16, default: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], hint: 'Constants ct(1:16)', advanced: true },
      { key: 'follow', label: 'follow', type: 'bool', dim: 0, default: false, hint: 'Follow/tag particles' },
      { key: 'chk_dup', label: 'chk_dup', type: 'bool', dim: 0, default: false, hint: 'Check for duplicate particles' },
    ]
  },

  boundary_conditions: {
    namelist: 'nl_boundary_conditions',
    label: 'Boundary Conditions',
    desc: 'Particle boundary conditions per species.',
    required: false, perSpecies: true,
    fields: [
      { key: 'bdtype', label: 'bdtype', type: 'strarr', dim: 'DIM2',
        default: ['per','per','per','per','per','per'],
        options: ['per','therm','reflect','open','fauxshock'],
        hint: 'Boundary types',
        dimLabels: ['x\u2097','x\u1d63','y\u2097','y\u1d63','z\u2097','z\u1d63'] },
      { key: 'vth', label: 'vth', type: 'real', dim: 0, default: 0, hint: 'Thermal bath velocity' },
      { key: 'vsh', label: 'vsh', type: 'real', dim: 0, default: 0, hint: 'Shift velocity' },
      { key: 'compress_ratio', label: 'compress_ratio', type: 'real', dim: 0, default: 1.0, hint: 'Compression ratio' },
    ]
  },

  plasma_injector: {
    namelist: 'nl_plasma_injector',
    label: 'Plasma Injectors',
    desc: 'Particle injection planes (optional, up to 10 per species).',
    required: false, perSpecies: true, multiPerSpecies: true, maxCount: 10, enabled: false,
    fields: [
      { key: 'plane', label: 'plane', type: 'str', dim: 0, default: 'yz',
        options: ['xy','xz','yz'], hint: 'Injection plane' },
      { key: 'planepos', label: 'planepos', type: 'real', dim: 0, default: 0, hint: 'Position of injection plane' },
      { key: 'boundary', label: 'boundary', type: 'real', dim: 'BDIM', default: [0,0,0,0], hint: 'Injection boundary',
        dimLabels: ['st1','st2','end1','end2'] },
      { key: 'num_par', label: 'num_par', type: 'int', dim: 'DIM',
        default: [2,2,2], hint: 'Particles per cell', dimLabels: ['x','y','z'] },
      { key: 'vdrift', label: 'vdrift', type: 'real', dim: 'VDIM',
        default: [0,0,0], hint: 'Drift velocity', dimLabels: ['vx','vy','vz'] },
      { key: 'vth', label: 'vth', type: 'real', dim: 0, default: 0, hint: 'Thermal velocity' },
      { key: 'sttime', label: 'sttime', type: 'real', dim: 0, default: 0, hint: 'Start time' },
      { key: 'endtime', label: 'endtime', type: 'real', dim: 0, default: 1e30, hint: 'End time' },
      { key: 'inj_dens', label: 'inj_dens', type: 'real', dim: 0, default: -1, hint: 'Injection density (-1=use species)' },
      { key: 'nodrift', label: 'nodrift', type: 'bool', dim: 0, default: false, hint: 'Zero drift after injection' },
      { key: 'halfsphere', label: 'halfsphere', type: 'bool', dim: 0, default: false, hint: 'Half-sphere velocity distribution' },
    ]
  },

  diag_species: {
    namelist: 'nl_diag_species',
    label: 'Species Diagnostics',
    desc: 'Phase space and fluid diagnostics per species.',
    required: false, perSpecies: true,
    fields: [
      { key: 'dmp_vfld', label: 'dmp_vfld', type: 'bool', dim: 2,
        default: [false,false], hint: 'Fluid velocity: intensity, vector',
        dimLabels: ['|v|','v\u20d7'] },
      { key: 'dmp_pfld', label: 'dmp_pfld', type: 'bool', dim: 2,
        default: [false,false], hint: 'Pressure tensor',
        dimLabels: ['trace','components'] },
      { key: 'phasespaces', label: 'phasespaces', type: 'str', dim: 0, default:
        'x3x2x1,x2x1,p2p1,p3p1,p3p2,p1x1,p2x2,p1x2,p2x1,p3x1,p3x2,ptx1,ptx2,etx1,etx2',
        hint: 'Phase space diagnostics', phaseCheckboxes: true,
        phaseOptions: [
          { name: 'x3x2x1', minDim: 0, group: 'Charge Density' },
          { name: 'x2x1',   minDim: 2, group: 'Position-Position' },
          { name: 'x3x1',   minDim: 3, group: 'Position-Position' },
          { name: 'x3x2',   minDim: 3, group: 'Position-Position' },
          { name: 'p2p1',   minDim: 0, group: 'Momentum-Momentum' },
          { name: 'p3p1',   minDim: 0, group: 'Momentum-Momentum' },
          { name: 'p3p2',   minDim: 0, group: 'Momentum-Momentum' },
          { name: 'p1x1',   minDim: 1, group: 'Position-Momentum' },
          { name: 'p2x2',   minDim: 2, group: 'Position-Momentum' },
          { name: 'p3x3',   minDim: 3, group: 'Position-Momentum' },
          { name: 'p1x2',   minDim: 2, group: 'Position-Momentum' },
          { name: 'p1x3',   minDim: 3, group: 'Position-Momentum' },
          { name: 'p2x1',   minDim: 1, group: 'Position-Momentum' },
          { name: 'p2x3',   minDim: 3, group: 'Position-Momentum' },
          { name: 'p3x1',   minDim: 1, group: 'Position-Momentum' },
          { name: 'p3x2',   minDim: 2, group: 'Position-Momentum' },
          { name: 'ptx1',   minDim: 1, group: 'Total-p vs Position' },
          { name: 'ptx2',   minDim: 2, group: 'Total-p vs Position' },
          { name: 'ptx3',   minDim: 3, group: 'Total-p vs Position' },
          { name: 'etx1',   minDim: 1, group: 'Energy vs Position' },
          { name: 'etx2',   minDim: 2, group: 'Energy vs Position' },
          { name: 'etx3',   minDim: 3, group: 'Energy vs Position' },
        ] },
      { key: 'pres', label: 'pres', type: 'int', dim: 'VDIM',
        default: [512,512,512], hint: 'Momentum-space resolution',
        dimLabels: ['p1','p2','p3'] },
      { key: 'xres', label: 'xres', type: 'int', dim: 'DIM',
        default: [256,256,256], hint: 'Spatial resolution',
        dimLabels: ['x','y','z'] },
    ]
  },

  raw_diag: {
    namelist: 'nl_raw_diag',
    label: 'Raw Diagnostics',
    desc: 'Raw particle data dumps per species.',
    required: false, perSpecies: true,
    fields: [
      { key: 'raw_dump', label: 'raw_dump', type: 'bool', dim: 0, default: false, hint: 'Enable raw dumps' },
      { key: 'raw_ndump', label: 'raw_ndump', type: 'int', dim: 0, default: -1, hint: 'Iterations between raw dumps' },
      { key: 'raw_volume', label: 'raw_volume', type: 'real', dim: 'DIM2',
        default: [-1,-1,-1,-1,-1,-1], hint: 'Spatial volume filter',
        dimLabels: ['x\u2097','x\u1d63','y\u2097','y\u1d63','z\u2097','z\u1d63'] },
      { key: 'raw_dump_fraction', label: 'raw_dump_fraction', type: 'real', dim: 0, default: 1.0, hint: 'Fraction of particles to dump' },
      { key: 'v_min', label: 'v_min', type: 'real', dim: 0, default: 0, hint: 'Minimum velocity filter' },
      { key: 'selectrule', label: 'selectrule', type: 'str', dim: 0, default: '1.', hint: 'Selection rule expression' },
      { key: 'n_constants', label: 'n_constants', type: 'int', dim: 0, default: 0, hint: 'Number of constants' },
      { key: 'ct', label: 'ct', type: 'real', dim: 16, default: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], hint: 'Constants ct(1:16)', advanced: true },
    ]
  },

  track_diag: {
    namelist: 'nl_track_diag',
    label: 'Track Diagnostics',
    desc: 'Particle tracking diagnostics per species.',
    required: false, perSpecies: true,
    fields: [
      { key: 'track_dump', label: 'track_dump', type: 'bool', dim: 0, default: false, hint: 'Enable track dumps' },
      { key: 'track_fields', label: 'track_fields', type: 'bool', dim: 0, default: false, hint: 'Track fields at particle positions' },
      { key: 'track_ndump', label: 'track_ndump', type: 'int', dim: 0, default: -1, hint: 'Iterations between track writes' },
      { key: 'track_nstore', label: 'track_nstore', type: 'int', dim: 0, default: -1, hint: 'Store every N iterations' },
      { key: 'track_info_file', label: 'track_info_file', type: 'str', dim: 0, default: './input/tags', hint: 'Path to track info file' },
    ]
  },
};

// Section ordering for the UI sidebar
const SECTION_ORDER = [
  { header: 'Simulation' },
  'node_conf', 'time', 'grid_space',
  { header: 'Physics' },
  'ext_emf', 'ext_force', 'algorithm',
  { header: 'Output' },
  'global_output', 'field_diag', 'restart',
  { header: 'Particles' },
  'particles', 'loadbalance',
  { header: 'Per Species' },
  'species', 'boundary_conditions', 'plasma_injector',
  'diag_species', 'raw_diag', 'track_diag',
];

// Presets
const PRESETS = [
  {
    name: '2D Periodic Box',
    desc: 'Simple 2D periodic test with 1 species',
    dim: 2,
    values: {
      node_conf: { node_number: [1,1] },
      time: { dt: 0.001768, niter: 2000, c: 100 },
      grid_space: { ncells: [20,20], boxsize: [10,10], bdtype: ['per','per','per','per'] },
      ext_emf: { Bx: '0.6', By: '0.33', Bz: '-.25' },
      species: [{ num_par: [2,2], vth: 1 }],
      boundary_conditions: [{ bdtype: ['per','per','per','per'] }],
      restart: { restart_step: -1, restart_time: 7200, restart_time_step: 100 },
    }
  },
  {
    name: '3D Periodic Box',
    desc: 'Simple 3D periodic test with 1 species',
    dim: 3,
    values: {
      node_conf: { node_number: [1,1,1] },
      time: { dt: 0.001443, niter: 2000, c: 100 },
      grid_space: { ncells: [20,20,20], boxsize: [10,10,10], bdtype: ['per','per','per','per','per','per'] },
      ext_emf: { Bx: '0.6', By: '0.33', Bz: '-.25' },
      species: [{ num_par: [2,2,2], vth: 1 }],
      boundary_conditions: [{ bdtype: ['per','per','per','per','per','per'] }],
      restart: { restart_step: -1, restart_time: 7200, restart_time_step: 100 },
    }
  },
  {
    name: '2D Shock',
    desc: 'Parallel shock with conducting/open boundaries',
    dim: 2,
    values: {
      node_conf: { node_number: [1,1] },
      time: { dt: 0.001768, niter: 1024, c: 100 },
      grid_space: { ncells: [128,128], boxsize: [64,64], bdtype: ['reflect','open','per','per'] },
      global_output: { ndump: 256, output_folder: 'Output' },
      ext_emf: { Bx: '1.', By: '0.', Bz: '0.' },
      algorithm: { filternpass: 1, ifsmoothextfields: true },
      species: [{ vdrift: [-220,0,0], vth: 1, num_par: [2,2] }],
      boundary_conditions: [{ bdtype: ['reflect','open','per','per'], vth: 0 }],
      plasma_injector: [[{ plane: 'yz', planepos: 64, boundary: [0,64], vdrift: [-30,0,0], vth: 1, num_par: [2,2] }]],
      restart: { restart_step: -1, restart_time: 7200, restart_time_step: 100 },
    }
  },
  {
    name: '3D Shock',
    desc: 'Parallel shock with conducting/open boundaries',
    dim: 3,
    values: {
      node_conf: { node_number: [1,1,1] },
      time: { dt: 0.0009623, niter: 1024, c: 100 },
      grid_space: { ncells: [64,64,64], boxsize: [32,32,32], bdtype: ['reflect','open','per','per','per','per'] },
      global_output: { ndump: 256, output_folder: 'Output' },
      ext_emf: { Bx: '1.', By: '0.', Bz: '0.' },
      algorithm: { filternpass: 1, ifsmoothextfields: true },
      species: [{ vdrift: [-220,0,0], vth: 1, num_par: [2,2,2] }],
      boundary_conditions: [{ bdtype: ['reflect','open','per','per','per','per'], vth: 0 }],
      plasma_injector: [[{ plane: 'yz', planepos: 32, boundary: [0,0,32,32], vdrift: [-30,0,0], vth: 1, num_par: [2,2,2] }]],
      restart: { restart_step: -1, restart_time: 7200, restart_time_step: 100 },
    }
  },
];
