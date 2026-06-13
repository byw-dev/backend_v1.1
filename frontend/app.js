const MAX_WINDOW_MINUTES = 60;
const DIRTY_TRACK_THRESHOLD_DEG = 1;
const REPLAY_INTERVAL_MS = 700;
const REPLAY_CLICK_PIXEL_THRESHOLD = 18;
const SCDP_BIN_DISPLAY_COUNT = 30;
const ICFP_BIN_DISPLAY_COUNT = 30;
const MAX_BIN_DISPLAY_COUNT = 30;
const MAX_TRACK_RENDER_POINTS = 1800;
const MAX_REPLAY_MARKERS = 260;
const MAP_INTERACTION_IDLE_RESUME_MS = 2000;
const MAP_MINI_VIEWPORT_MARGIN = 16;
const RAINVIEWER_API_REFRESH_MS = 10 * 60 * 1000;
const HIMAWARI_API_REFRESH_MS = 10 * 60 * 1000;
const LOCAL_RADAR_API_REFRESH_MS = 20 * 1000;
const LEAFLET_TILE_SIZE = 256;
const REPLAY_MAP_RENDER_INTERVAL_MS = 1000;
const REPLAY_CHART_RENDER_INTERVAL_MS = 1200;
const REPLAY_HEATMAP_RENDER_INTERVAL_MS = 2000;
const MAP_MINI_VISIBLE_RATIO = 0.35;
const FRONTEND_BUILD = '2026-06-13-lite-local-radar-hide';
const AREA_BOUNDARY_WARNING_DEG = 0.02;
const EARTH_RADIUS_KM = 6371.0088;
const MAX_AZIMUTH_SECTOR_COUNT = 72;
const LOCAL_RADAR_COLOR_STOPS = [
    [-30, '#e5e7eb'],
    [-20, '#9ca3af'],
    [-10, '#38bdf8'],
    [0, '#2563eb'],
    [5, '#22c55e'],
    [10, '#84cc16'],
    [15, '#facc15'],
    [20, '#f97316'],
    [25, '#ef4444'],
    [30, '#b91c1c'],
    [35, '#a855f7'],
    [40, '#f0abfc'],
];
const PARTICLE_SERIES_LABELS = {
    number_conc: '\u6570\u6d53\u5ea6(#/cm^3)',
    lwc: '\u6db2\u6001\u6c34\u542b\u91cf(g/m^3)',
    mvd: '\u4e2d\u503c\u4f53\u79ef\u76f4\u5f84(\u03bcm)',
    ed: '\u6709\u6548\u7c92\u5b50\u76f4\u5f84(\u03bcm)',
};
const MWR_SCALAR_LABELS = {
    sur_tem: '\u673a\u8868\u6e29\u5ea6(\u2103)',
    sur_hum: '\u673a\u8868\u6e7f\u5ea6(%)',
    cloud_base_m: '\u4e91\u5e95\u9ad8\u5ea6(m)',
    vint_mm: '\u79ef\u5206\u6c34\u6c7d(mm)',
    lqint_mm: '\u79ef\u5206\u6db2\u6001\u6c34(mm)',
};
const SCDP_BIN_DIAMETERS_UM = Array.from({ length: SCDP_BIN_DISPLAY_COUNT }, (_, index) => (
    index < 12 ? index + 2 : 14 + (index - 12) * 2
));
const DEFAULT_MAP_CONFIG = {
    has_local_tiles: false,
    local_url_template: '/tiles/{z}/{x}/{y}.png',
    online_url_template: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    satellite_url_template: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; OpenStreetMap contributors',
    satellite_attribution: 'Tiles &copy; Esri',
    min_zoom: 4,
    max_zoom: 19,
    rainviewer_api_url: 'https://api.rainviewer.com/public/weather-maps.json',
    rainviewer_tile_size: 512,
    rainviewer_max_native_zoom: 7,
    rainviewer_default_opacity: 0.55,
    rainviewer_color_scheme: 2,
    rainviewer_smooth: 1,
    rainviewer_snow: 1,
    local_radar_available: false,
    local_radar_products: ['PPI', 'RPI'],
    local_radar_default_product: 'PPI',
    local_radar_variable: 'Z2',
    local_radar_refresh_seconds: 20,
    local_radar_default_opacity: 0.72,
    local_radar_max_range_km: 50,
    local_radar_site: { lat: 20.96194444, lon: 110.06777778, name: '雷州云雷达' },
    himawari_products: [
        { id: 'infrared_b13', label: 'Himawari 红外 B13', band: 'B13', product: 'TBB', opacity: 0.72 },
        { id: 'visible_b03', label: 'Himawari 可见光 B03', band: 'B03', product: 'ALBD', opacity: 0.68 },
    ],
    himawari_preferred_image_formats: ['png', 'jpg'],
    himawari_native_min_zoom: 3,
    himawari_native_max_zoom: 6,
};
const DEFAULT_IMPORTANT_POINTS = {
    version: 1,
    type_styles: {},
    path_styles: {},
    points: [],
    paths: [],
};
const DEFAULT_POINT_STYLE = {
    shape: 'circle',
    color: '#2563eb',
    label_color: '#1e3a8a',
};
const DEFAULT_PATH_STYLE = {
    color: '#7c3aed',
    label_color: '#4c1d95',
    weight: 3,
    opacity: 0.9,
    dash_array: null,
};
const VALID_MARKER_SHAPES = new Set(['circle', 'square', 'diamond', 'triangle']);
console.info('[frontend build]', FRONTEND_BUILD);
const state = {
    currentUser: null,
    frames: [],
    pendingFrames: [],
    maxHistorySeconds: 3600,
    windowMinutes: 10,
    dataSource: null,
    replayPointIntervalSec: 10,
    replayEntries: [],
    replayLayerSignature: '',
    trackRenderSignature: '',
    mode: 'live',
    selectedFrameTime: null,
    replayTimer: null,
    renderQueued: false,
    mapConfig: DEFAULT_MAP_CONFIG,
    mapSource: 'online',
    mapRefreshPaused: false,
    mapRefreshResumeTimer: null,
    radarEnabled: true,
    radarCoverageEnabled: false,
    radarOpacity: DEFAULT_MAP_CONFIG.rainviewer_default_opacity,
    radarLastApiFetchAt: 0,
    radarFramePath: '',
    radarStatus: 'radar --',
    localRadarEnabled: false,
    localRadarProductsEnabled: {
        PPI: true,
        RPI: true,
    },
    localRadarOpacity: DEFAULT_MAP_CONFIG.local_radar_default_opacity,
    localRadarLastApiFetchAt: 0,
    localRadarSignatures: {},
    localRadarStatus: 'local radar off',
    himawariEnabled: false,
    himawariProductId: 'infrared_b13',
    himawariLastApiFetchAt: 0,
    himawariLayerSignature: '',
    himawariStatus: 'himawari off',
    pendingInteractionResize: false,
    initialMapFitted: false,
    replayLastMapRenderAt: 0,
    replayLastChartRenderAt: 0,
    replayLastHeatmapRenderAt: 0,
    importantPoints: DEFAULT_IMPORTANT_POINTS,
    importantPointsLoaded: false,
    mapMiniMode: false,
    mapPanelTop: 0,
    mapPanelHeight: 0,
    mapMiniPlaceholder: null,
    mapMiniHome: null,
    mapMiniPosition: null,
    mapMiniDrag: null,
    measureDistanceEnabled: false,
    measurePoints: [],
    measureTotalMeters: 0,
    anchorPointEnabled: false,
    anchorPoints: [],
    nextAnchorId: 1,
    anchorSizePx: 28,
    anchorAltitudeM: 197.0,
    anchorSymbol: '0',
    areaBoundaryEnabled: false,
    areaBoundary: {
        left: null,
        right: null,
        top: null,
        bottom: null,
        errors: [],
    },
};

const elements = {
    wsStatus: document.getElementById('ws-status'),
    modeStatus: document.getElementById('mode-status'),
    latestTime: document.getElementById('latest-time'),
    currentDate: document.getElementById('current-date'),
    historyLimit: document.getElementById('history-limit'),
    userRole: document.getElementById('user-role'),
    logoutBtn: document.getElementById('logout-btn'),
    trackSummary: document.getElementById('track-summary'),
    scdpStatus: document.getElementById('scdp-status'),
    icfpStatus: document.getElementById('icfp-status'),
    mwrStatus: document.getElementById('mwr-status'),
    mwrProfileTime: document.getElementById('mwr-profile-time'),
    selectedTimeLabel: document.getElementById('selected-time-label'),
    windowMinutes: document.getElementById('window-minutes'),
    replayPointSeconds: document.getElementById('replay-point-seconds'),
    applyWindow: document.getElementById('apply-window'),
    dataSourceDate: document.getElementById('data-source-date'),
    dataSourceNum: document.getElementById('data-source-num'),
    applyDataSource: document.getElementById('apply-data-source'),
    dataSourceNote: document.getElementById('data-source-note'),
    liveModeBtn: document.getElementById('live-mode-btn'),
    replayModeBtn: document.getElementById('replay-mode-btn'),
    replayPlayBtn: document.getElementById('replay-play-btn'),
    replayPauseBtn: document.getElementById('replay-pause-btn'),
    replaySlider: document.getElementById('replay-slider'),
    showScdpBins: document.getElementById('show-scdp-bins'),
    showIcfpBins: document.getElementById('show-icfp-bins'),
    mapSource: document.getElementById('map-source'),
    himawariProduct: document.getElementById('himawari-product'),
    himawariOverlayEnabled: document.getElementById('himawari-overlay-enabled'),
    radarOverlayEnabled: document.getElementById('radar-overlay-enabled'),
    radarCoverageEnabled: document.getElementById('radar-coverage-enabled'),
    radarOpacity: document.getElementById('radar-opacity'),
    radarOpacityValue: document.getElementById('radar-opacity-value'),
    localRadarEnabled: document.getElementById('local-radar-enabled'),
    localRadarPpiEnabled: document.getElementById('local-radar-ppi-enabled'),
    localRadarRpiEnabled: document.getElementById('local-radar-rpi-enabled'),
    localRadarOpacity: document.getElementById('local-radar-opacity'),
    localRadarOpacityValue: document.getElementById('local-radar-opacity-value'),
    measureDistanceEnabled: document.getElementById('measure-distance-enabled'),
    measureDistanceUndo: document.getElementById('measure-distance-undo'),
    measureDistanceClear: document.getElementById('measure-distance-clear'),
    anchorPointEnabled: document.getElementById('anchor-point-enabled'),
    anchorListOpen: document.getElementById('anchor-list-open'),
    anchorClear: document.getElementById('anchor-clear'),
    anchorSize: document.getElementById('anchor-size'),
    anchorAltitude: document.getElementById('anchor-altitude'),
    anchorSymbol: document.getElementById('anchor-symbol'),
    anchorModal: document.getElementById('anchor-modal'),
    anchorModalClose: document.getElementById('anchor-modal-close'),
    anchorModalCloseSecondary: document.getElementById('anchor-modal-close-secondary'),
    anchorModalClear: document.getElementById('anchor-modal-clear'),
    anchorExportTxt: document.getElementById('anchor-export-txt'),
    anchorTableBody: document.getElementById('anchor-table-body'),
    areaBoundaryEnabled: document.getElementById('area-boundary-enabled'),
    boundaryLeft: document.getElementById('boundary-left'),
    boundaryRight: document.getElementById('boundary-right'),
    boundaryTop: document.getElementById('boundary-top'),
    boundaryBottom: document.getElementById('boundary-bottom'),
    dashboard: document.querySelector('.dashboard'),
    centerStack: document.querySelector('.center-stack'),
    mapPanel: document.querySelector('.panel-map'),
    scdpBinsChart: document.getElementById('scdp-bins-chart'),
    icfpBinsChart: document.getElementById('icfp-bins-chart'),
};

function hasPermission(permission) {
    if (!state.currentUser || !Array.isArray(state.currentUser.permissions)) {
        return false;
    }
    return state.currentUser.permissions.includes('view_all')
        || state.currentUser.permissions.includes(permission);
}

function setPermissionVisibility(selector, visible) {
    document.querySelectorAll(selector).forEach((node) => {
        node.classList.toggle('hidden', !visible);
    });
}

function applyUserPermissions() {
    const user = state.currentUser || {};
    const canViewCharts = hasPermission('view_charts');
    const canViewLocalRadar = hasPermission('view_local_radar');
    document.body.dataset.role = user.role || 'unknown';
    document.body.dataset.canLocalRadar = canViewLocalRadar ? 'true' : 'false';
    if (elements.dashboard) {
        elements.dashboard.classList.toggle('dashboard-lite', !canViewCharts);
    }
    if (elements.centerStack) {
        elements.centerStack.classList.toggle('center-stack-lite', !canViewCharts);
    }
    setPermissionVisibility('.permission-charts', canViewCharts);
    setPermissionVisibility('.permission-local-radar', canViewLocalRadar);
    if (elements.userRole) {
        elements.userRole.textContent = user.username || user.role || '--';
    }
    const localRadarStatusNode = document.querySelector('.local-radar-status');
    if (localRadarStatusNode) {
        localRadarStatusNode.classList.toggle('hidden', !canViewLocalRadar);
    }
    const localRadarLegendNode = document.querySelector('.local-radar-legend');
    if (localRadarLegendNode) {
        localRadarLegendNode.classList.toggle('hidden', !canViewLocalRadar || !state.localRadarEnabled);
    }
    if (!canViewLocalRadar) {
        state.localRadarEnabled = false;
        if (elements.localRadarEnabled) {
            elements.localRadarEnabled.checked = false;
        }
        [
            elements.localRadarEnabled,
            elements.localRadarPpiEnabled,
            elements.localRadarRpiEnabled,
            elements.localRadarOpacity,
        ].filter(Boolean).forEach((node) => {
            node.disabled = true;
        });
        removeLocalRadarLayer('local radar unavailable');
    } else {
        [
            elements.localRadarEnabled,
            elements.localRadarPpiEnabled,
            elements.localRadarRpiEnabled,
            elements.localRadarOpacity,
        ].filter(Boolean).forEach((node) => {
            node.disabled = false;
        });
    }
    resizeCharts();
    setTimeout(() => {
        map.invalidateSize();
        updateMapMiniMode();
    }, 0);
}

async function loadCurrentUser() {
    const response = await fetch('/api/me', { cache: 'no-store' });
    if (response.status === 401) {
        location.href = '/login';
        throw new Error('login required');
    }
    if (!response.ok) {
        throw new Error(`me status ${response.status}`);
    }
    state.currentUser = await response.json();
    applyUserPermissions();
}

const charts = {
    scdpSeries: echarts.init(document.getElementById('scdp-series-chart')),
    scdpBins: echarts.init(document.getElementById('scdp-bins-chart')),
    icfpSeries: echarts.init(document.getElementById('icfp-series-chart')),
    icfpBins: echarts.init(document.getElementById('icfp-bins-chart')),
    mwrScalar: echarts.init(document.getElementById('mwr-scalar-chart')),
    mwrTempProfile: echarts.init(document.getElementById('mwr-temp-profile-chart')),
    mwrHumProfile: echarts.init(document.getElementById('mwr-hum-profile-chart')),
    mwrVaporProfile: echarts.init(document.getElementById('mwr-vapor-profile-chart')),
    mwrLiquidProfile: echarts.init(document.getElementById('mwr-liquid-profile-chart')),
    mwrZone: echarts.init(document.getElementById('mwr-saturated-zone-chart')),
};

const map = L.map('track-map', {
    preferCanvas: true,
    zoomControl: true,
    attributionControl: true,
    updateWhenZooming: false,
    updateWhenIdle: true,
    zoomAnimation: false,
    fadeAnimation: false,
}).setView([30, 110], 6);
map.createPane('fixedPathPane');
map.getPane('fixedPathPane').style.zIndex = 420;
map.getPane('fixedPathPane').style.pointerEvents = 'auto';
map.createPane('fixedPointPane');
map.getPane('fixedPointPane').style.zIndex = 430;
map.getPane('fixedPointPane').style.pointerEvents = 'auto';
map.createPane('fixedTooltipPane');
map.getPane('fixedTooltipPane').style.zIndex = 455;
map.getPane('fixedTooltipPane').style.pointerEvents = 'none';
map.createPane('rainRadarPane');
map.getPane('rainRadarPane').style.zIndex = 500;
map.getPane('rainRadarPane').style.pointerEvents = 'none';
map.createPane('localRadarPane');
map.getPane('localRadarPane').style.zIndex = 510;
map.getPane('localRadarPane').style.pointerEvents = 'none';
map.createPane('rainCoveragePane');
map.getPane('rainCoveragePane').style.zIndex = 490;
map.getPane('rainCoveragePane').style.pointerEvents = 'none';
map.createPane('himawariPane');
map.getPane('himawariPane').style.zIndex = 480;
map.getPane('himawariPane').style.pointerEvents = 'none';
map.createPane('trackPane');
map.getPane('trackPane').style.zIndex = 620;
map.getPane('trackPane').style.pointerEvents = 'auto';
map.createPane('importantPathPane');
map.getPane('importantPathPane').style.zIndex = 420;
map.getPane('importantPathPane').style.pointerEvents = 'none';
map.createPane('areaBoundaryPane');
map.getPane('areaBoundaryPane').style.zIndex = 650;
map.getPane('areaBoundaryPane').style.pointerEvents = 'none';
map.createPane('measurePane');
map.getPane('measurePane').style.zIndex = 700;
map.getPane('measurePane').style.pointerEvents = 'none';
map.createPane('anchorPane');
map.getPane('anchorPane').style.zIndex = 710;
map.getPane('anchorPane').style.pointerEvents = 'none';
let baseTileLayer = null;
let himawariLayer = null;
let rainRadarLayer = null;
let rainRadarCoverageLayer = null;
const localRadarLayers = {};
const rainRadarStatus = L.control({ position: 'bottomleft' });
rainRadarStatus.onAdd = () => {
    const div = L.DomUtil.create('div', 'rain-radar-status');
    div.textContent = state.radarStatus;
    return div;
};
rainRadarStatus.addTo(map);
const localRadarStatus = L.control({ position: 'bottomleft' });
localRadarStatus.onAdd = () => {
    const div = L.DomUtil.create('div', 'local-radar-status');
    div.textContent = state.localRadarStatus;
    return div;
};
localRadarStatus.addTo(map);
const localRadarLegend = L.control({ position: 'bottomright' });
localRadarLegend.onAdd = () => {
    const div = L.DomUtil.create('div', 'local-radar-legend hidden');
    const rows = [...LOCAL_RADAR_COLOR_STOPS].reverse().map(([value, color]) => (
        `<div class="local-radar-legend-row">`
        + `<span class="local-radar-legend-swatch" style="background:${color};"></span>`
        + `<span>${value}</span>`
        + `</div>`
    )).join('');
    div.innerHTML = `<div class="local-radar-legend-title">dBZ</div>${rows}`;
    return div;
};
localRadarLegend.addTo(map);
const himawariStatus = L.control({ position: 'bottomleft' });
himawariStatus.onAdd = () => {
    const div = L.DomUtil.create('div', 'himawari-status');
    div.textContent = state.himawariStatus;
    return div;
};
himawariStatus.addTo(map);
const zoomStatus = L.control({ position: 'bottomleft' });
zoomStatus.onAdd = () => {
    const div = L.DomUtil.create('div', 'zoom-status');
    div.textContent = `zoom ${map.getZoom()}`;
    return div;
};
zoomStatus.addTo(map);

function applyBaseTileLayer(source) {
    state.mapSource = source;
    const cfg = state.mapConfig || DEFAULT_MAP_CONFIG;
    const useLocal = source === 'local' && cfg.has_local_tiles;
    const useSatellite = source === 'satellite';
    const url = useLocal
        ? cfg.local_url_template
        : (useSatellite ? cfg.satellite_url_template : cfg.online_url_template);
    const attribution = useSatellite ? cfg.satellite_attribution : cfg.attribution;
    if (baseTileLayer) {
        map.removeLayer(baseTileLayer);
    }
    baseTileLayer = L.tileLayer(url, {
        minZoom: cfg.min_zoom,
        maxZoom: cfg.max_zoom,
        attribution,
        keepBuffer: 8,
        updateWhenZooming: false,
        updateWhenIdle: true,
    }).addTo(map);
    if (useLocal) {
        let tileErrorCount = 0;
        baseTileLayer.on('tileerror', () => {
            tileErrorCount += 1;
            if (tileErrorCount >= 4) {
                console.warn('[map] local tiles failed, fallback to online.');
                applyBaseTileLayer('online');
            }
        });
    }
    if (elements.mapSource) {
        elements.mapSource.value = useLocal ? 'local' : (useSatellite ? 'satellite' : 'online');
    }
}

function updateRadarStatus(text) {
    state.radarStatus = text;
    const node = document.querySelector('.rain-radar-status');
    if (node) {
        node.textContent = text;
    }
}

function updateLocalRadarStatus(text) {
    state.localRadarStatus = text;
    const node = document.querySelector('.local-radar-status');
    if (node) {
        node.textContent = text;
    }
}

function updateLocalRadarLegendVisibility() {
    const node = document.querySelector('.local-radar-legend');
    if (node) {
        node.classList.toggle('hidden', !state.localRadarEnabled || !Object.keys(localRadarLayers).length);
    }
}

function updateHimawariStatus(text) {
    state.himawariStatus = text;
    const node = document.querySelector('.himawari-status');
    if (node) {
        node.textContent = text;
    }
}

function updateZoomStatus() {
    const node = document.querySelector('.zoom-status');
    if (node) {
        node.textContent = `zoom ${map.getZoom()}`;
    }
}

function getHimawariProducts() {
    const cfg = state.mapConfig || DEFAULT_MAP_CONFIG;
    return Array.isArray(cfg.himawari_products) && cfg.himawari_products.length
        ? cfg.himawari_products
        : DEFAULT_MAP_CONFIG.himawari_products;
}

function getSelectedHimawariProduct() {
    const products = getHimawariProducts();
    return products.find((item) => item.id === state.himawariProductId) || products[0];
}

function populateHimawariProducts() {
    if (!elements.himawariProduct) {
        return;
    }
    const products = getHimawariProducts();
    elements.himawariProduct.innerHTML = '';
    products.forEach((product) => {
        const option = document.createElement('option');
        option.value = product.id;
        option.textContent = product.label || product.id;
        elements.himawariProduct.appendChild(option);
    });
    if (!products.some((product) => product.id === state.himawariProductId) && products[0]) {
        state.himawariProductId = products[0].id;
    }
    elements.himawariProduct.value = state.himawariProductId;
    elements.himawariProduct.disabled = !products.length;
}

function getLocalRadarProducts() {
    const cfg = state.mapConfig || DEFAULT_MAP_CONFIG;
    return Array.isArray(cfg.local_radar_products) && cfg.local_radar_products.length
        ? cfg.local_radar_products
        : DEFAULT_MAP_CONFIG.local_radar_products;
}

function populateLocalRadarProducts() {
    const products = getLocalRadarProducts();
    const productSet = new Set(products.map((item) => String(item).toUpperCase()));
    if (elements.localRadarPpiEnabled) {
        elements.localRadarPpiEnabled.disabled = !state.mapConfig.local_radar_available || !productSet.has('PPI');
    }
    if (elements.localRadarRpiEnabled) {
        elements.localRadarRpiEnabled.disabled = !state.mapConfig.local_radar_available || !productSet.has('RPI');
    }
}

function removeHimawariLayer(statusText = 'himawari off') {
    if (himawariLayer) {
        map.removeLayer(himawariLayer);
        himawariLayer = null;
    }
    state.himawariLayerSignature = '';
    updateHimawariStatus(statusText);
}

function buildHimawariTileUrl(template, metadata, product, z, x, y) {
    return template
        .replaceAll('{base_time}', metadata.base_time)
        .replaceAll('{valid_time}', metadata.valid_time)
        .replaceAll('{band}', product.band)
        .replaceAll('{product}', product.product)
        .replaceAll('{z}', z)
        .replaceAll('{x}', x)
        .replaceAll('{y}', y)
        .replaceAll('{format}', metadata.image_format || 'jpg');
}

function formatHimawariTime(value) {
    const text = String(value || '');
    if (/^\d{14}$/.test(text)) {
        return `${text.slice(8, 10)}:${text.slice(10, 12)}:${text.slice(12, 14)}`;
    }
    return formatClock(value);
}

async function refreshHimawariLayer(force = false) {
    if (!state.himawariEnabled) {
        removeHimawariLayer('himawari off');
        return;
    }

    const now = Date.now();
    if (!force && himawariLayer && now - state.himawariLastApiFetchAt < HIMAWARI_API_REFRESH_MS) {
        return;
    }

    const product = getSelectedHimawariProduct();
    if (!product || !product.band || !product.product) {
        removeHimawariLayer('himawari product unavailable');
        return;
    }

    try {
        updateHimawariStatus('himawari loading');
        const response = await fetch('/api/himawari/latest', { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`status ${response.status}`);
        }
        const metadata = await response.json();
        if (metadata.error) {
            throw new Error(metadata.error);
        }
        const fdSource = metadata.fd || metadata;
        const jpSource = metadata.jp || null;
        if (!fdSource.base_time || !fdSource.valid_time || !fdSource.tile_url_template) {
            throw new Error('missing Himawari metadata');
        }
        if (!jpSource || !jpSource.base_time || !jpSource.valid_time || !jpSource.tile_url_template) {
            throw new Error('missing Himawari jp metadata');
        }

        state.himawariLastApiFetchAt = now;
        const signature = [
            fdSource.base_time,
            fdSource.valid_time,
            fdSource.image_format || 'jpg',
            jpSource.base_time,
            jpSource.valid_time,
            jpSource.image_format || 'jpg',
            product.id,
        ].join('|');
        if (signature === state.himawariLayerSignature && himawariLayer) {
            updateHimawariStatus(`himawari fd ${formatHimawariTime(fdSource.valid_time)} / jp ${formatHimawariTime(jpSource.valid_time)}`);
            return;
        }

        removeHimawariLayer('himawari loading');
        state.himawariLayerSignature = signature;
        himawariLayer = L.tileLayer('', {
            pane: 'himawariPane',
            opacity: Number.isFinite(Number(product.opacity)) ? Number(product.opacity) : 0.7,
            tileSize: LEAFLET_TILE_SIZE,
            minZoom: Math.min(state.mapConfig.min_zoom, 3),
            maxZoom: state.mapConfig.max_zoom,
            minNativeZoom: 3,
            maxNativeZoom: 6,
            keepBuffer: 3,
            updateWhenZooming: false,
            updateWhenIdle: true,
            interactive: false,
            className: 'himawari-layer',
            attribution: metadata.attribution || 'Himawari imagery &copy; JMA',
        });
        himawariLayer.getTileUrl = (coords) => {
            const nativeZ = Math.max(3, Math.min(6, coords.z));
            let nativeX = coords.x;
            let nativeY = coords.y;
            if (coords.z > nativeZ) {
                const scale = 2 ** (coords.z - nativeZ);
                nativeX = Math.floor(coords.x / scale);
                nativeY = Math.floor(coords.y / scale);
            }
            const source = nativeZ >= 6 ? jpSource : fdSource;
            const sourceZ = nativeZ >= 6 ? 6 : nativeZ;
            return buildHimawariTileUrl(source.tile_url_template, source, product, sourceZ, nativeX, nativeY);
        };
        himawariLayer.addTo(map);
        let tileErrorCount = 0;
        himawariLayer.on('tileerror', () => {
            tileErrorCount += 1;
            if (tileErrorCount >= 4) {
                updateHimawariStatus('himawari tile unavailable');
            }
        });
        updateHimawariStatus(`himawari fd ${formatHimawariTime(fdSource.valid_time)} / jp ${formatHimawariTime(jpSource.valid_time)}`);
    } catch (error) {
        console.warn('[himawari] layer failed:', error);
        removeHimawariLayer('himawari unavailable');
    }
}

function setRadarOpacity(opacity) {
    state.radarOpacity = Math.max(0, Math.min(1, Number(opacity) || 0));
    if (rainRadarLayer) {
        rainRadarLayer.setOpacity(state.radarOpacity);
    }
    if (elements.radarOpacity) {
        elements.radarOpacity.value = String(Math.round(state.radarOpacity * 100));
    }
    if (elements.radarOpacityValue) {
        elements.radarOpacityValue.textContent = `${Math.round(state.radarOpacity * 100)}%`;
    }
}

function setLocalRadarOpacity(opacity) {
    state.localRadarOpacity = Math.max(0, Math.min(1, Number(opacity) || 0));
    Object.values(localRadarLayers).forEach((layer) => layer.setOpacity(state.localRadarOpacity));
    if (elements.localRadarOpacity) {
        elements.localRadarOpacity.value = String(Math.round(state.localRadarOpacity * 100));
    }
    if (elements.localRadarOpacityValue) {
        elements.localRadarOpacityValue.textContent = `${Math.round(state.localRadarOpacity * 100)}%`;
    }
}

function removeRadarLayer(statusText = 'radar off') {
    if (rainRadarLayer) {
        map.removeLayer(rainRadarLayer);
        rainRadarLayer = null;
    }
    updateRadarStatus(statusText);
}

function removeRadarCoverageLayer() {
    if (rainRadarCoverageLayer) {
        map.removeLayer(rainRadarCoverageLayer);
        rainRadarCoverageLayer = null;
    }
}

function buildRainViewerTileUrl(host, path) {
    const cfg = state.mapConfig || DEFAULT_MAP_CONFIG;
    const tileSize = cfg.rainviewer_tile_size || DEFAULT_MAP_CONFIG.rainviewer_tile_size;
    const color = cfg.rainviewer_color_scheme || DEFAULT_MAP_CONFIG.rainviewer_color_scheme;
    const smooth = Number.isFinite(Number(cfg.rainviewer_smooth)) ? Number(cfg.rainviewer_smooth) : DEFAULT_MAP_CONFIG.rainviewer_smooth;
    const snow = Number.isFinite(Number(cfg.rainviewer_snow)) ? Number(cfg.rainviewer_snow) : DEFAULT_MAP_CONFIG.rainviewer_snow;
    return `${host}${path}/${tileSize}/{z}/{x}/{y}/${color}/${smooth}_${snow}.png`;
}

function buildRainViewerCoverageTileUrl(host) {
    const cfg = state.mapConfig || DEFAULT_MAP_CONFIG;
    const tileSize = cfg.rainviewer_tile_size || DEFAULT_MAP_CONFIG.rainviewer_tile_size;
    return `${host}/v2/coverage/0/${tileSize}/{z}/{x}/{y}/0/0_0.png`;
}

function updateRadarCoverageLayer(host) {
    removeRadarCoverageLayer();
    if (!state.radarCoverageEnabled || !host) {
        return;
    }
    const cfg = state.mapConfig || DEFAULT_MAP_CONFIG;
    rainRadarCoverageLayer = L.tileLayer(buildRainViewerCoverageTileUrl(host), {
        pane: 'rainCoveragePane',
        opacity: 0.45,
        tileSize: LEAFLET_TILE_SIZE,
        maxNativeZoom: cfg.rainviewer_max_native_zoom || DEFAULT_MAP_CONFIG.rainviewer_max_native_zoom,
        maxZoom: cfg.max_zoom,
        keepBuffer: 3,
        updateWhenZooming: false,
        updateWhenIdle: true,
        interactive: false,
        className: 'rainviewer-radar-layer',
        attribution: 'Coverage &copy; RainViewer',
    }).addTo(map);
}

async function refreshRadarLayer(force = false) {
    if (!state.radarEnabled && !state.radarCoverageEnabled) {
        removeRadarLayer('radar off');
        removeRadarCoverageLayer();
        return;
    }

    const now = Date.now();
    const hasRequestedLayers = (!state.radarEnabled || rainRadarLayer)
        && (!state.radarCoverageEnabled || rainRadarCoverageLayer);
    if (!force && hasRequestedLayers && now - state.radarLastApiFetchAt < RAINVIEWER_API_REFRESH_MS) {
        return;
    }

    const cfg = state.mapConfig || DEFAULT_MAP_CONFIG;
    try {
        const response = await fetch(cfg.rainviewer_api_url, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`status ${response.status}`);
        }
        const data = await response.json();
        const frames = data && data.radar && Array.isArray(data.radar.past) ? data.radar.past : [];
        const latestFrame = frames[frames.length - 1];
        if (!latestFrame || !data.host || !latestFrame.path) {
            throw new Error('missing radar frame');
        }
        state.radarLastApiFetchAt = now;
        updateRadarCoverageLayer(data.host);
        if (!state.radarEnabled) {
            removeRadarLayer('radar off');
            return;
        }
        const radarTime = formatClock(new Date(latestFrame.time * 1000).toISOString());
        if (latestFrame.path === state.radarFramePath && rainRadarLayer) {
            updateRadarStatus(`radar ${radarTime}`);
            return;
        }

        removeRadarLayer('radar loading');
        state.radarFramePath = latestFrame.path;
        rainRadarLayer = L.tileLayer(buildRainViewerTileUrl(data.host, latestFrame.path), {
            pane: 'rainRadarPane',
            opacity: state.radarOpacity,
            tileSize: LEAFLET_TILE_SIZE,
            maxNativeZoom: cfg.rainviewer_max_native_zoom || DEFAULT_MAP_CONFIG.rainviewer_max_native_zoom,
            maxZoom: cfg.max_zoom,
            keepBuffer: 3,
            updateWhenZooming: false,
            updateWhenIdle: true,
            interactive: false,
            className: 'rainviewer-radar-layer',
            attribution: 'Radar &copy; RainViewer',
        }).addTo(map);
        let radarTileErrorCount = 0;
        rainRadarLayer.on('tileerror', () => {
            radarTileErrorCount += 1;
            if (radarTileErrorCount >= 4) {
                updateRadarStatus('radar tile unavailable');
            }
        });
        updateRadarStatus(`radar ${radarTime}`);
    } catch (error) {
        console.warn('[rainviewer] radar layer failed:', error);
        removeRadarLayer('radar unavailable');
    }
}

const trackLine = L.polyline([], { color: '#d9480f', weight: 3, pane: 'trackPane' }).addTo(map);
const trackMarker = L.circleMarker([0, 0], {
    radius: 4,
    color: '#0f766e',
    fillColor: '#14b8a6',
    fillOpacity: 0.95,
    pane: 'trackPane',
}).addTo(map);
const selectedTrackMarker = L.circleMarker([0, 0], {
    radius: 6,
    color: '#ef4444',
    fillColor: '#fecaca',
    fillOpacity: 0.85,
    pane: 'trackPane',
}).addTo(map);
const trackPointLayer = L.layerGroup().addTo(map);
const importantPointLayer = L.layerGroup().addTo(map);
const importantPathLayer = L.layerGroup().addTo(map);
const areaBoundaryLayer = L.layerGroup().addTo(map);
const measureLayer = L.layerGroup().addTo(map);
const measurePreviewLayer = L.layerGroup().addTo(map);
const anchorLayer = L.layerGroup().addTo(map);
const importantOverlayStatus = L.control({ position: 'topright' });
importantOverlayStatus.onAdd = () => {
    const div = L.DomUtil.create('div', 'important-overlay-status');
    div.textContent = 'fixed overlays --';
    return div;
};
importantOverlayStatus.addTo(map);

const flightInfoControl = L.control({ position: 'bottomright' });
flightInfoControl.onAdd = () => {
    const div = L.DomUtil.create('div', 'flight-info-status');
    div.textContent = 'flight --';
    return div;
};
flightInfoControl.addTo(map);

const measureInfoControl = L.control({ position: 'topright' });
measureInfoControl.onAdd = () => {
    const div = L.DomUtil.create('div', 'measure-info-status');
    div.textContent = 'measure off';
    return div;
};
measureInfoControl.addTo(map);

const anchorInfoControl = L.control({ position: 'topright' });
anchorInfoControl.onAdd = () => {
    const div = L.DomUtil.create('div', 'anchor-info-status');
    div.textContent = 'anchors 0';
    return div;
};
anchorInfoControl.addTo(map);

const areaBoundaryControl = L.control({ position: 'topright' });
areaBoundaryControl.onAdd = () => {
    const div = L.DomUtil.create('div', 'area-boundary-status');
    div.textContent = '区域限定 off';
    return div;
};
areaBoundaryControl.addTo(map);

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function normalizePointStyle(type, typeStyles) {
    const incoming = typeStyles && typeof typeStyles === 'object' ? typeStyles[type] : null;
    if (!incoming || typeof incoming !== 'object') {
        return { ...DEFAULT_POINT_STYLE };
    }
    const shape = VALID_MARKER_SHAPES.has(incoming.shape) ? incoming.shape : DEFAULT_POINT_STYLE.shape;
    const color = typeof incoming.color === 'string' ? incoming.color : DEFAULT_POINT_STYLE.color;
    const labelColor = typeof incoming.label_color === 'string' ? incoming.label_color : DEFAULT_POINT_STYLE.label_color;
    return {
        shape,
        color,
        label_color: labelColor,
    };
}

function normalizePathStyle(type, pathStyles) {
    const incoming = pathStyles && typeof pathStyles === 'object' ? pathStyles[type] : null;
    if (!incoming || typeof incoming !== 'object') {
        return { ...DEFAULT_PATH_STYLE };
    }
    const weight = Number(incoming.weight);
    const opacity = Number(incoming.opacity);
    return {
        color: typeof incoming.color === 'string' ? incoming.color : DEFAULT_PATH_STYLE.color,
        label_color: typeof incoming.label_color === 'string' ? incoming.label_color : DEFAULT_PATH_STYLE.label_color,
        weight: Number.isFinite(weight) && weight > 0 ? weight : DEFAULT_PATH_STYLE.weight,
        opacity: Number.isFinite(opacity) && opacity >= 0 && opacity <= 1 ? opacity : DEFAULT_PATH_STYLE.opacity,
        dash_array: typeof incoming.dash_array === 'string' && incoming.dash_array.trim()
            ? incoming.dash_array
            : null,
    };
}

function createImportantPointIcon(style) {
    const safeShape = VALID_MARKER_SHAPES.has(style.shape) ? style.shape : DEFAULT_POINT_STYLE.shape;
    const safeColor = typeof style.color === 'string' ? style.color : DEFAULT_POINT_STYLE.color;
    const html = `<span class="important-point-marker shape-${safeShape}" style="--marker-color:${escapeHtml(safeColor)};"></span>`;
    return L.divIcon({
        className: 'important-point-icon-wrapper',
        html,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
        popupAnchor: [0, -8],
        tooltipAnchor: [0, -10],
    });
}

function createPathEndpointIcon(style, endpointType) {
    const safeColor = typeof style.color === 'string' ? style.color : DEFAULT_PATH_STYLE.color;
    const safeEndpoint = endpointType === 'end' ? 'end' : 'start';
    const html = `<span class="important-path-endpoint endpoint-${safeEndpoint}" style="--path-color:${escapeHtml(safeColor)};"></span>`;
    return L.divIcon({
        className: 'important-path-endpoint-wrapper',
        html,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
        popupAnchor: [0, -7],
        tooltipAnchor: [0, -9],
    });
}

function normalizeCoverageRadii(point) {
    const rawRadii = Array.isArray(point.coverage_radii_km) ? point.coverage_radii_km : [];
    const radii = [];
    rawRadii.forEach((value) => {
        const radius = Number(value);
        if (Number.isFinite(radius) && radius > 0) {
            radii.push(radius);
        } else {
            console.warn('[important-points] invalid coverage radius skipped:', point.id || point.name, value);
        }
    });
    return radii;
}

function getCoverageOverlayColor(point, style) {
    if (point && typeof point.coverage_color === 'string' && point.coverage_color.trim()) {
        return point.coverage_color;
    }
    return style && style.color ? style.color : '#4dccff';
}

function normalizeAzimuthOverlay(point, radii) {
    const rawCount = Number(point.azimuth_sector_count);
    if (!Number.isFinite(rawCount) || rawCount <= 0) {
        return null;
    }
    const count = Math.floor(rawCount);
    if (count < 1 || count > MAX_AZIMUTH_SECTOR_COUNT) {
        console.warn('[important-points] invalid azimuth sector count skipped:', point.id || point.name, rawCount);
        return null;
    }
    const rawRadius = Number(point.azimuth_radius_km);
    const fallbackRadius = radii.length ? Math.max(...radii) : 0;
    const radiusKm = Number.isFinite(rawRadius) && rawRadius > 0 ? rawRadius : fallbackRadius;
    if (!Number.isFinite(radiusKm) || radiusKm <= 0) {
        console.warn('[important-points] azimuth overlay requires positive radius:', point.id || point.name);
        return null;
    }
    const startDeg = Number(point.azimuth_start_deg);
    return {
        count,
        radiusKm,
        startDeg: Number.isFinite(startDeg) ? startDeg : 0,
    };
}

function destinationPoint(lat, lon, bearingDeg, distanceKm) {
    const angularDistance = distanceKm / EARTH_RADIUS_KM;
    const bearing = bearingDeg * Math.PI / 180;
    const lat1 = lat * Math.PI / 180;
    const lon1 = lon * Math.PI / 180;
    const sinLat1 = Math.sin(lat1);
    const cosLat1 = Math.cos(lat1);
    const sinDistance = Math.sin(angularDistance);
    const cosDistance = Math.cos(angularDistance);
    const lat2 = Math.asin(
        sinLat1 * cosDistance + cosLat1 * sinDistance * Math.cos(bearing)
    );
    const lon2 = lon1 + Math.atan2(
        Math.sin(bearing) * sinDistance * cosLat1,
        cosDistance - sinLat1 * Math.sin(lat2)
    );
    const normalizedLon = ((lon2 * 180 / Math.PI + 540) % 360) - 180;
    return [lat2 * 180 / Math.PI, normalizedLon];
}

function renderAzimuthSectors(point, lat, lon, style, radii) {
    const overlay = normalizeAzimuthOverlay(point, radii);
    if (!overlay) {
        return 0;
    }
    const color = getCoverageOverlayColor(point, style);
    const stepDeg = 360 / overlay.count;
    for (let index = 0; index < overlay.count; index += 1) {
        const bearing = overlay.startDeg + index * stepDeg;
        const endpoint = destinationPoint(lat, lon, bearing, overlay.radiusKm);
        L.polyline([[lat, lon], endpoint], {
            color,
            weight: 1,
            opacity: 0.66,
            dashArray: '4 8',
            pane: 'importantPathPane',
            interactive: false,
        }).addTo(importantPathLayer);

        const labelPoint = destinationPoint(lat, lon, bearing, overlay.radiusKm + 1.2);
        L.marker(labelPoint, {
            icon: L.divIcon({
                className: 'important-azimuth-label',
                html: `<span>${Math.round(((bearing % 360) + 360) % 360)}&deg;</span>`,
            }),
            keyboard: false,
            interactive: false,
            pane: 'fixedTooltipPane',
        }).addTo(importantPathLayer);
    }
    return overlay.count;
}

function renderCoverageRadii(point, lat, lon, style) {
    const radii = normalizeCoverageRadii(point);
    const color = getCoverageOverlayColor(point, style);
    radii.forEach((radiusKm) => {
        L.circle([lat, lon], {
            radius: radiusKm * 1000,
            color,
            weight: 1.5,
            opacity: 0.78,
            fillColor: color,
            fillOpacity: 0.025,
            dashArray: '8 6',
            pane: 'importantPathPane',
            interactive: false,
        }).addTo(importantPathLayer);

        const labelLat = lat + (radiusKm / 111.32);
        L.marker([labelLat, lon], {
            icon: L.divIcon({
                className: 'important-radius-label',
                html: `<span>${formatMetric(radiusKm, 0, ' km')}</span>`,
            }),
            keyboard: false,
            interactive: false,
            pane: 'fixedTooltipPane',
        }).addTo(importantPathLayer);
    });
    return {
        radiusCount: radii.length,
        azimuthCount: renderAzimuthSectors(point, lat, lon, style, radii),
    };
}

function pathMidpoint(coords) {
    if (!coords.length) {
        return null;
    }
    return coords[Math.floor((coords.length - 1) / 2)];
}

function isSameCoord(a, b) {
    if (!a || !b) {
        return false;
    }
    return Math.abs(a[0] - b[0]) < 0.000001 && Math.abs(a[1] - b[1]) < 0.000001;
}

function isValidLatLngPair(coord) {
    return Array.isArray(coord)
        && coord.length >= 2
        && Number.isFinite(Number(coord[0]))
        && Number.isFinite(Number(coord[1]));
}

function collectImportantCoords() {
    const data = state.importantPoints || DEFAULT_IMPORTANT_POINTS;
    const coords = [];
    const points = Array.isArray(data.points) ? data.points : [];
    const paths = Array.isArray(data.paths) ? data.paths : [];

    points.forEach((point) => {
        const lat = Number(point.lat);
        const lon = Number(point.lon);
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
            coords.push([lat, lon]);
            const radii = normalizeCoverageRadii(point);
            const overlay = normalizeAzimuthOverlay(point, radii);
            const maxRadius = Math.max(...radii, overlay ? overlay.radiusKm : 0);
            if (Number.isFinite(maxRadius) && maxRadius > 0) {
                [0, 90, 180, 270].forEach((bearing) => {
                    coords.push(destinationPoint(lat, lon, bearing, maxRadius));
                });
            }
        }
    });

    paths.forEach((path) => {
        const rawPoints = Array.isArray(path.points) ? path.points : [];
        rawPoints.forEach((point) => {
            const lat = Number(point.lat);
            const lon = Number(point.lon);
            if (Number.isFinite(lat) && Number.isFinite(lon)) {
                coords.push([lat, lon]);
            }
        });
    });

    return coords;
}

function fitInitialMapView(trackCoords = []) {
    if (state.initialMapFitted || state.mapRefreshPaused) {
        return;
    }
    const coords = [
        ...trackCoords.filter(isValidLatLngPair),
        ...collectImportantCoords(),
    ];
    if (!coords.length) {
        return;
    }

    state.initialMapFitted = true;
    if (coords.length === 1) {
        map.setView(coords[0], Math.max(map.getZoom(), 10), { animate: false });
        return;
    }
    map.fitBounds(L.latLngBounds(coords), {
        padding: [36, 36],
        maxZoom: 12,
        animate: false,
    });
}

function updateImportantOverlayStatus(pointCount, overlayCount, warningCount) {
    const node = document.querySelector('.important-overlay-status');
    if (!node) {
        return;
    }
    const warningText = warningCount ? ` | warnings ${warningCount}` : '';
    node.textContent = `fixed points ${pointCount} | overlays ${overlayCount}${warningText}`;
}

function renderImportantPoints() {
    importantPointLayer.clearLayers();
    importantPathLayer.clearLayers();
    const data = state.importantPoints || DEFAULT_IMPORTANT_POINTS;
    const points = Array.isArray(data.points) ? data.points : [];
    const paths = Array.isArray(data.paths) ? data.paths : [];
    const warnings = Array.isArray(data.warnings) ? data.warnings : [];
    const typeStyles = data.type_styles && typeof data.type_styles === 'object' ? data.type_styles : {};
    const pathStyles = data.path_styles && typeof data.path_styles === 'object' ? data.path_styles : {};
    let renderedPointCount = 0;
    let renderedPathCount = 0;
    let renderedRadiusCount = 0;
    let renderedAzimuthCount = 0;

    points.forEach((point) => {
        const lat = Number(point.lat);
        const lon = Number(point.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            return;
        }
        const name = point.name || point.id || 'unnamed-point';
        const pointType = point.type || 'default';
        const style = normalizePointStyle(pointType, typeStyles);
        const marker = L.marker([lat, lon], {
            icon: createImportantPointIcon(style),
            keyboard: false,
            pane: 'fixedPointPane',
        });

        const tooltipContent = `<span>${escapeHtml(name)}</span>`;
        const tooltipClass = 'important-point-label';
        if (point.show_label) {
            marker.bindTooltip(tooltipContent, {
                permanent: true,
                direction: 'top',
                className: tooltipClass,
                pane: 'fixedTooltipPane',
            });
        } else {
            marker.bindTooltip(tooltipContent, {
                direction: 'top',
                className: tooltipClass,
                pane: 'fixedTooltipPane',
            });
        }

        const descriptionText = point.description ? `<div class="important-point-popup-desc">${escapeHtml(point.description)}</div>` : '';
        marker.bindPopup(
            `<div class="important-point-popup">` +
            `<div class="important-point-popup-title">${escapeHtml(name)}</div>` +
            `<div>类型: ${escapeHtml(pointType)}</div>` +
            `${descriptionText}` +
            `</div>`
        );
        importantPointLayer.addLayer(marker);
        const overlayCounts = renderCoverageRadii(point, lat, lon, style);
        renderedRadiusCount += overlayCounts.radiusCount;
        renderedAzimuthCount += overlayCounts.azimuthCount;
        renderedPointCount += 1;
    });

    paths.forEach((path) => {
        const rawPoints = Array.isArray(path.points) ? path.points : [];
        const coords = rawPoints
            .map((point) => {
                const lat = Number(point.lat);
                const lon = Number(point.lon);
                if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
                    return null;
                }
                return [lat, lon];
            })
            .filter(Boolean);
        if (coords.length < 2) {
            return;
        }

        const name = path.name || path.id || 'unnamed-path';
        const pathType = path.type || 'default';
        const style = normalizePathStyle(pathType, pathStyles);
        const isClosedPath = coords.length >= 4 && isSameCoord(coords[0], coords[coords.length - 1]);
        const lineOptions = {
            color: style.color,
            weight: Math.max(style.weight, 4),
            opacity: Math.max(style.opacity, 0.95),
            dashArray: style.dash_array,
            lineJoin: 'round',
            lineCap: 'round',
            pane: 'importantPathPane',
            interactive: false,
        };
        const line = isClosedPath
            ? L.polygon(coords, {
                ...lineOptions,
                fillColor: style.color,
                fillOpacity: 0.08,
            })
            : L.polyline(coords, lineOptions);
        const descriptionText = path.description ? `<div class="important-point-popup-desc">${escapeHtml(path.description)}</div>` : '';
        const popupContent =
            `<div class="important-point-popup">` +
            `<div class="important-point-popup-title">${escapeHtml(name)}</div>` +
            `<div>path type: ${escapeHtml(pathType)}</div>` +
            `${descriptionText}` +
            `</div>`;
        importantPathLayer.addLayer(line);
        renderedPathCount += 1;

        if (path.show_label) {
            const middle = pathMidpoint(coords);
            if (middle) {
                const label = L.marker(middle, {
                    icon: L.divIcon({
                        className: 'important-path-label',
                        html: `<span>${escapeHtml(name)}</span>`,
                    }),
                    keyboard: false,
                    interactive: false,
                    pane: 'fixedTooltipPane',
                });
                importantPathLayer.addLayer(label);
            }
        }

        if (path.show_endpoints !== false) {
            const startMarker = L.marker(coords[0], {
                icon: createPathEndpointIcon(style, 'start'),
                keyboard: false,
                interactive: false,
                pane: 'fixedPointPane',
            });
            const endMarker = L.marker(coords[coords.length - 1], {
                icon: createPathEndpointIcon(style, 'end'),
                keyboard: false,
                interactive: false,
                pane: 'fixedPointPane',
            });
            importantPathLayer.addLayer(startMarker);
            importantPathLayer.addLayer(endMarker);
        }
    });
    updateImportantOverlayStatus(
        renderedPointCount,
        renderedPathCount + renderedRadiusCount + renderedAzimuthCount,
        warnings.length
    );
    fitInitialMapView([]);
}

function setPillState(element, mode) {
    element.classList.remove('pill-neutral', 'pill-ok', 'pill-alert');
    element.classList.add(mode);
}

function parseTime(value) {
    return value ? new Date(value) : null;
}

function formatClock(value) {
    const time = parseTime(value);
    if (!time) {
        return '--:--:--';
    }
    return time.toLocaleTimeString('zh-CN', { hour12: false });
}

function formatDate(value) {
    const time = parseTime(value);
    if (!time) {
        return '----/--/--';
    }
    const year = time.getFullYear();
    const month = String(time.getMonth() + 1).padStart(2, '0');
    const day = String(time.getDate()).padStart(2, '0');
    return `${year}/${month}/${day}`;
}

function formatMetric(value, digits = 0, suffix = '') {
    const number = Number(value);
    if (!Number.isFinite(number)) {
        return '--';
    }
    return `${number.toFixed(digits)}${suffix}`;
}

function formatDistance(meters) {
    const value = Number(meters);
    if (!Number.isFinite(value) || value <= 0) {
        return '0 m';
    }
    if (value < 1000) {
        return `${value.toFixed(0)} m`;
    }
    return `${(value / 1000).toFixed(2)} km`;
}

function updateMeasureStatus() {
    const node = document.querySelector('.measure-info-status');
    if (!node) {
        return;
    }
    if (!state.measureDistanceEnabled) {
        node.textContent = state.measurePoints.length
            ? `measure saved ${formatDistance(state.measureTotalMeters)}`
            : 'measure off';
        return;
    }
    const pointText = state.measurePoints.length === 1 ? '1 point' : `${state.measurePoints.length} points`;
    node.textContent = `measure on | ${pointText} | ${formatDistance(state.measureTotalMeters)}`;
}

function clearMeasurePreview() {
    measurePreviewLayer.clearLayers();
}

function drawMeasurePreview(latlng) {
    clearMeasurePreview();
    if (!state.measureDistanceEnabled || !state.measurePoints.length || !latlng) {
        return;
    }

    const previous = state.measurePoints[state.measurePoints.length - 1];
    const previewPoint = L.latLng(latlng.lat, latlng.lng);
    const previewTotal = state.measureTotalMeters + map.distance(previous, previewPoint);
    L.polyline([previous, previewPoint], {
        color: '#f4b84a',
        weight: 2,
        opacity: 0.72,
        dashArray: '4 7',
        lineCap: 'round',
        lineJoin: 'round',
        pane: 'measurePane',
        interactive: false,
    }).addTo(measurePreviewLayer);
    L.circleMarker(previewPoint, {
        radius: 4,
        color: '#f4b84a',
        fillColor: '#ffffff',
        fillOpacity: 0.85,
        weight: 2,
        pane: 'measurePane',
        interactive: false,
    }).addTo(measurePreviewLayer);
    L.marker(previewPoint, {
        icon: L.divIcon({
            className: 'measure-distance-label measure-distance-preview-label',
            html: `<span>${formatDistance(previewTotal)}</span>`,
            iconAnchor: [0, -12],
        }),
        keyboard: false,
        interactive: false,
        pane: 'measurePane',
    }).addTo(measurePreviewLayer);
}

function updateMeasurePreviewFromClientPoint(clientX, clientY) {
    if (!state.measureDistanceEnabled || !state.measurePoints.length) {
        return;
    }
    const container = map.getContainer();
    const rect = container.getBoundingClientRect();
    if (!rect.width || !rect.height) {
        clearMeasurePreview();
        return;
    }
    const clampedX = Math.min(Math.max(clientX, rect.left), rect.right);
    const clampedY = Math.min(Math.max(clientY, rect.top), rect.bottom);
    const point = L.point(clampedX - rect.left, clampedY - rect.top);
    drawMeasurePreview(map.containerPointToLatLng(point));
}

function setMeasureDistanceEnabled(enabled) {
    state.measureDistanceEnabled = Boolean(enabled);
    if (state.measureDistanceEnabled) {
        setAnchorPointEnabled(false);
    } else {
        clearMeasurePreview();
    }
    if (elements.measureDistanceEnabled) {
        elements.measureDistanceEnabled.checked = state.measureDistanceEnabled;
    }
    map.getContainer().classList.toggle('measuring-distance', state.measureDistanceEnabled);
    updateMeasureStatus();
}

function clearMeasureDistance() {
    state.measurePoints = [];
    state.measureTotalMeters = 0;
    measureLayer.clearLayers();
    clearMeasurePreview();
    updateMeasureStatus();
}

function recalculateMeasureDistance() {
    state.measureTotalMeters = 0;
    for (let index = 1; index < state.measurePoints.length; index += 1) {
        state.measureTotalMeters += map.distance(state.measurePoints[index - 1], state.measurePoints[index]);
    }
}

function removeLocalRadarLayer(statusText = 'local radar off') {
    Object.keys(localRadarLayers).forEach((product) => {
        map.removeLayer(localRadarLayers[product]);
        delete localRadarLayers[product];
    });
    state.localRadarSignatures = {};
    updateLocalRadarStatus(statusText);
    updateLocalRadarLegendVisibility();
}

function removeOneLocalRadarLayer(product) {
    const key = String(product || '').toUpperCase();
    if (localRadarLayers[key]) {
        map.removeLayer(localRadarLayers[key]);
        delete localRadarLayers[key];
    }
    delete state.localRadarSignatures[key];
    updateLocalRadarLegendVisibility();
}

function localRadarColor(value) {
    if (!Number.isFinite(value) || value < -45) {
        return null;
    }
    for (let index = LOCAL_RADAR_COLOR_STOPS.length - 1; index >= 0; index -= 1) {
        if (value >= LOCAL_RADAR_COLOR_STOPS[index][0]) {
            return LOCAL_RADAR_COLOR_STOPS[index][1];
        }
    }
    return '#f3f4f6';
}

const LocalRadarCanvasLayer = L.Layer.extend({
    initialize(payload, options = {}) {
        this.payload = payload;
        this.options = {
            pane: 'localRadarPane',
            opacity: 0.72,
            ...options,
        };
        this._canvas = null;
        this._reset = this._reset.bind(this);
    },
    onAdd(mapInstance) {
        this._map = mapInstance;
        this._canvas = L.DomUtil.create('canvas', 'leaflet-layer local-radar-layer');
        this._canvas.style.position = 'absolute';
        this._canvas.style.pointerEvents = 'none';
        this.getPane().appendChild(this._canvas);
        mapInstance.on('move zoom resize viewreset', this._reset);
        this._reset();
    },
    onRemove(mapInstance) {
        mapInstance.off('move zoom resize viewreset', this._reset);
        if (this._canvas && this._canvas.parentNode) {
            this._canvas.parentNode.removeChild(this._canvas);
        }
        this._canvas = null;
    },
    setOpacity(opacity) {
        this.options.opacity = Math.max(0, Math.min(1, Number(opacity) || 0));
        if (this._canvas) {
            this._canvas.style.opacity = String(this.options.opacity);
        }
    },
    setPayload(payload) {
        this.payload = payload;
        this._reset();
    },
    _reset() {
        if (!this._map || !this._canvas) {
            return;
        }
        const size = this._map.getSize();
        const topLeft = this._map.containerPointToLayerPoint([0, 0]);
        L.DomUtil.setPosition(this._canvas, topLeft);
        this._canvas.width = size.x;
        this._canvas.height = size.y;
        this._canvas.style.width = `${size.x}px`;
        this._canvas.style.height = `${size.y}px`;
        this._canvas.style.opacity = String(this.options.opacity);
        this._draw();
    },
    _draw() {
        const ctx = this._canvas.getContext('2d');
        const width = this._canvas.width;
        const height = this._canvas.height;
        ctx.clearRect(0, 0, width, height);
        const payload = this.payload || {};
        const radar = payload.radar || {};
        const centerLat = Number(radar.lat);
        const centerLon = Number(radar.lon);
        const azimuths = Array.isArray(payload.azimuths_deg) ? payload.azimuths_deg : [];
        const ranges = Array.isArray(payload.ranges_km) ? payload.ranges_km : [];
        const rows = Array.isArray(payload.values) ? payload.values : [];
        if (!Number.isFinite(centerLat) || !Number.isFinite(centerLon) || !azimuths.length || !ranges.length || !rows.length) {
            return;
        }
        const azStep = Number(payload.azimuth_step_deg) || 2;
        const rangeBin = Number(payload.range_bin_km) || 0.3;
        ctx.globalAlpha = 1;
        for (let rowIndex = 0; rowIndex < azimuths.length; rowIndex += 1) {
            const row = rows[rowIndex] || [];
            const azimuth = Number(azimuths[rowIndex]);
            if (!Number.isFinite(azimuth)) {
                continue;
            }
            const az0 = azimuth - azStep / 2;
            const az1 = azimuth + azStep / 2;
            for (let colIndex = 0; colIndex < ranges.length; colIndex += 1) {
                if (row[colIndex] === null || row[colIndex] === undefined) {
                    continue;
                }
                const value = Number(row[colIndex]);
                const color = localRadarColor(value);
                if (!color) {
                    continue;
                }
                const rangeCenter = Number(ranges[colIndex]);
                if (!Number.isFinite(rangeCenter)) {
                    continue;
                }
                const inner = Math.max(0, rangeCenter - rangeBin / 2);
                const outer = rangeCenter + rangeBin / 2;
                const corners = [
                    destinationPoint(centerLat, centerLon, az0, inner),
                    destinationPoint(centerLat, centerLon, az0, outer),
                    destinationPoint(centerLat, centerLon, az1, outer),
                    destinationPoint(centerLat, centerLon, az1, inner),
                ].map((latlng) => this._map.latLngToContainerPoint(latlng));
                ctx.beginPath();
                ctx.moveTo(corners[0].x, corners[0].y);
                for (let index = 1; index < corners.length; index += 1) {
                    ctx.lineTo(corners[index].x, corners[index].y);
                }
                ctx.closePath();
                ctx.fillStyle = color;
                ctx.fill();
            }
        }
    },
});

function formatLocalRadarTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '--:--';
    }
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function getEnabledLocalRadarProducts() {
    return getLocalRadarProducts()
        .map((item) => String(item).toUpperCase())
        .filter((product) => state.localRadarProductsEnabled[product]);
}

async function refreshOneLocalRadarLayer(product, force = false) {
    const key = String(product || '').toUpperCase();
    try {
        const params = new URLSearchParams({ product: key });
        if (force) {
            params.set('force', 'true');
        }
        const response = await fetch(`/api/local-radar/latest?${params.toString()}`, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`status ${response.status}`);
        }
        const payload = await response.json();
        if (!payload.available) {
            throw new Error(payload.error || `no ${key} local radar data`);
        }
        const signature = [
            payload.filename,
            payload.scan_time,
            payload.scan_product,
            payload.variable,
            payload.angle,
        ].join('|');
        if (signature === state.localRadarSignatures[key] && localRadarLayers[key]) {
            return payload;
        }
        state.localRadarSignatures[key] = signature;
        if (!localRadarLayers[key]) {
            localRadarLayers[key] = new LocalRadarCanvasLayer(payload, {
                opacity: state.localRadarOpacity,
                pane: 'localRadarPane',
            }).addTo(map);
        } else {
            localRadarLayers[key].setPayload(payload);
            localRadarLayers[key].setOpacity(state.localRadarOpacity);
        }
        const pane = map.getPane('localRadarPane');
        if (pane && localRadarLayers.PPI && localRadarLayers.RPI) {
            const ppiCanvas = localRadarLayers.PPI._canvas;
            const rpiCanvas = localRadarLayers.RPI._canvas;
            if (ppiCanvas && rpiCanvas && ppiCanvas.nextSibling !== rpiCanvas) {
                pane.insertBefore(ppiCanvas, rpiCanvas);
            }
        }
        return payload;
    } catch (error) {
        console.warn(`[local-radar] ${key} layer failed:`, error);
        removeOneLocalRadarLayer(key);
        return null;
    }
}

async function refreshLocalRadarLayer(force = false) {
    if (!hasPermission('view_local_radar')) {
        removeLocalRadarLayer('local radar unavailable');
        return;
    }
    if (!state.localRadarEnabled) {
        removeLocalRadarLayer('local radar off');
        return;
    }
    if (!state.mapConfig.local_radar_available) {
        removeLocalRadarLayer('local radar unavailable');
        return;
    }

    const now = Date.now();
    const refreshMs = Math.max(5, Number(state.mapConfig.local_radar_refresh_seconds) || 30) * 1000;
    if (!force && Object.keys(localRadarLayers).length && now - state.localRadarLastApiFetchAt < refreshMs) {
        return;
    }

    const enabledProducts = getEnabledLocalRadarProducts();
    ['PPI', 'RPI'].forEach((product) => {
        if (!enabledProducts.includes(product)) {
            removeOneLocalRadarLayer(product);
        }
    });
    if (!enabledProducts.length) {
        removeLocalRadarLayer('local radar no product');
        return;
    }

    updateLocalRadarStatus('local radar loading');
    const payloads = [];
    for (const product of enabledProducts) {
        const payload = await refreshOneLocalRadarLayer(product, force);
        if (payload) {
            payloads.push(payload);
        }
    }
    state.localRadarLastApiFetchAt = now;
    if (!payloads.length) {
        removeLocalRadarLayer('local radar unavailable');
        return;
    }
    const statusText = payloads
        .map((payload) => `${payload.scan_product} ${formatLocalRadarTime(payload.scan_time)}`)
        .join(' / ');
    updateLocalRadarStatus(`local ${statusText}`);
    updateLocalRadarLegendVisibility();
}

function undoMeasurePoint() {
    if (!state.measurePoints.length) {
        updateMeasureStatus();
        return;
    }
    state.measurePoints.pop();
    recalculateMeasureDistance();
    drawMeasureDistance();
    if (!state.measurePoints.length) {
        clearMeasurePreview();
    }
}

function drawMeasureDistance() {
    measureLayer.clearLayers();
    if (!state.measurePoints.length) {
        clearMeasurePreview();
        updateMeasureStatus();
        return;
    }

    state.measurePoints.forEach((latlng, index) => {
        L.circleMarker(latlng, {
            radius: index === 0 ? 5 : 4,
            color: '#f4b84a',
            fillColor: index === 0 ? '#18d39e' : '#f4b84a',
            fillOpacity: 0.95,
            weight: 2,
            pane: 'measurePane',
            interactive: false,
        }).addTo(measureLayer);
    });

    if (state.measurePoints.length >= 2) {
        L.polyline(state.measurePoints, {
            color: '#f4b84a',
            weight: 3,
            opacity: 0.95,
            dashArray: '8 6',
            lineCap: 'round',
            lineJoin: 'round',
            pane: 'measurePane',
            interactive: false,
        }).addTo(measureLayer);

        L.marker(state.measurePoints[state.measurePoints.length - 1], {
            icon: L.divIcon({
                className: 'measure-distance-label',
                html: `<span>${formatDistance(state.measureTotalMeters)}</span>`,
                iconAnchor: [0, -12],
            }),
            keyboard: false,
            interactive: false,
            pane: 'measurePane',
        }).addTo(measureLayer);
    }
    updateMeasureStatus();
}

function addMeasurePoint(latlng) {
    const point = L.latLng(latlng.lat, latlng.lng);
    const previous = state.measurePoints[state.measurePoints.length - 1];
    if (previous) {
        state.measureTotalMeters += map.distance(previous, point);
    }
    state.measurePoints.push(point);
    drawMeasureDistance();
    clearMeasurePreview();
}

function isTextEditingTarget(target) {
    if (!target) {
        return false;
    }
    if (target.isContentEditable) {
        return true;
    }
    if (target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
        return true;
    }
    if (target.tagName !== 'INPUT') {
        return false;
    }
    const type = String(target.type || 'text').toLowerCase();
    return [
        'text',
        'search',
        'url',
        'tel',
        'email',
        'password',
        'number',
        'date',
        'datetime-local',
        'month',
        'week',
        'time',
    ].includes(type);
}

function formatAnchorTime(value) {
    const time = parseTime(value);
    if (!time) {
        return '--';
    }
    return time.toLocaleString('zh-CN', { hour12: false });
}

function updateAnchorStatus() {
    const node = document.querySelector('.anchor-info-status');
    if (!node) {
        return;
    }
    const modeText = state.anchorPointEnabled ? 'on' : 'off';
    node.textContent = `anchors ${modeText} | ${state.anchorPoints.length}`;
}

function createAnchorIcon(anchor) {
    const size = Math.max(16, Math.min(60, Number(state.anchorSizePx) || 28));
    return L.divIcon({
        className: 'anchor-point-icon-wrapper',
        html: `<span class="anchor-point-marker" style="--anchor-size:${size}px;">${escapeHtml(anchor.name)}</span>`,
        iconSize: [size + 2, size + 2],
        iconAnchor: [(size + 2) / 2, (size + 2) / 2],
    });
}

function formatAnchorCoord(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(7) : '';
}

function formatAnchorAltitude(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(1) : '197.0';
}

function currentAnchorAltitude() {
    const value = elements.anchorAltitude ? Number(elements.anchorAltitude.value) : Number(state.anchorAltitudeM);
    return Number.isFinite(value) ? value : 197.0;
}

function currentAnchorSymbol() {
    const value = elements.anchorSymbol ? String(elements.anchorSymbol.value).trim() : String(state.anchorSymbol || '0');
    return value || '0';
}

function renderAnchorTable() {
    if (!elements.anchorTableBody) {
        return;
    }
    elements.anchorTableBody.innerHTML = '';
    if (!state.anchorPoints.length) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 6;
        cell.textContent = '暂无锚点';
        row.appendChild(cell);
        elements.anchorTableBody.appendChild(row);
        return;
    }

    state.anchorPoints.forEach((anchor) => {
        const row = document.createElement('tr');
        [
            String(anchor.id),
            formatAnchorCoord(anchor.lng),
            formatAnchorCoord(anchor.lat),
            formatAnchorAltitude(anchor.altitudeM),
            String(anchor.symbol),
            formatAnchorTime(anchor.createdAt),
        ].forEach((value) => {
            const cell = document.createElement('td');
            cell.textContent = value;
            row.appendChild(cell);
        });
        elements.anchorTableBody.appendChild(row);
    });
}

function drawAnchorPoints() {
    anchorLayer.clearLayers();
    const coords = state.anchorPoints.map((anchor) => [anchor.lat, anchor.lng]);
    if (coords.length >= 2) {
        L.polyline(coords, {
            color: '#9ca3af',
            weight: 2,
            opacity: 0.88,
            dashArray: '5 7',
            lineCap: 'round',
            lineJoin: 'round',
            pane: 'anchorPane',
            interactive: false,
        }).addTo(anchorLayer);
    }
    state.anchorPoints.forEach((anchor) => {
        L.marker([anchor.lat, anchor.lng], {
            icon: createAnchorIcon(anchor),
            keyboard: false,
            interactive: false,
            pane: 'anchorPane',
        }).addTo(anchorLayer);
    });
    renderAnchorTable();
    updateAnchorStatus();
}

function setAnchorPointEnabled(enabled) {
    state.anchorPointEnabled = Boolean(enabled);
    if (state.anchorPointEnabled) {
        setMeasureDistanceEnabled(false);
    }
    if (elements.anchorPointEnabled) {
        elements.anchorPointEnabled.checked = state.anchorPointEnabled;
    }
    map.getContainer().classList.toggle('placing-anchor', state.anchorPointEnabled);
    updateAnchorStatus();
}

function addAnchorPoint(latlng) {
    const lat = Number(latlng.lat);
    const lng = Number(latlng.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return;
    }
    const id = state.nextAnchorId;
    state.nextAnchorId += 1;
    state.anchorPoints.push({
        id,
        name: String(id),
        lat,
        lng,
        altitudeM: currentAnchorAltitude(),
        symbol: currentAnchorSymbol(),
        createdAt: new Date().toISOString(),
    });
    drawAnchorPoints();
}

function undoAnchorPoint() {
    if (!state.anchorPoints.length) {
        updateAnchorStatus();
        return;
    }
    state.anchorPoints.pop();
    state.nextAnchorId = state.anchorPoints.reduce((maxId, anchor) => Math.max(maxId, anchor.id), 0) + 1;
    drawAnchorPoints();
}

function clearAnchorPoints() {
    state.anchorPoints = [];
    state.nextAnchorId = 1;
    anchorLayer.clearLayers();
    renderAnchorTable();
    updateAnchorStatus();
}

function openAnchorModal() {
    renderAnchorTable();
    if (elements.anchorModal) {
        elements.anchorModal.classList.remove('hidden');
    }
}

function closeAnchorModal() {
    if (elements.anchorModal) {
        elements.anchorModal.classList.add('hidden');
    }
}

function buildAnchorTxt() {
    const lines = [];
    state.anchorPoints.forEach((anchor) => {
        lines.push([
            String(anchor.id),
            formatAnchorCoord(anchor.lng),
            formatAnchorCoord(anchor.lat),
            formatAnchorAltitude(anchor.altitudeM),
            String(anchor.symbol),
        ].join('\t'));
    });
    return `${lines.join('\n')}\n`;
}

function exportAnchorTxt() {
    const blob = new Blob([buildAnchorTxt()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const link = document.createElement('a');
    link.href = url;
    link.download = `anchor_points_${timestamp}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function parseBoundaryCoordinate(value, kind) {
    const raw = String(value || '').trim();
    if (!raw) {
        return { value: null, error: null };
    }

    const directionMatch = raw.match(/[NSEW东西南北]/i);
    const direction = directionMatch ? directionMatch[0].toUpperCase() : '';
    const trimmed = raw.trim();
    const leadingSign = trimmed.startsWith('-') ? '-' : '';
    const numericSource = `${leadingSign}${trimmed.replace(/^[+-]/, '').replace(/-/g, ' ')}`;
    const numbers = numericSource.match(/[+-]?\d+(?:\.\d+)?/g);
    if (!numbers || !numbers.length) {
        return { value: null, error: '格式无法识别' };
    }

    let decimal = Number(numbers[0]);
    if (numbers.length >= 2) {
        const minutes = Number(numbers[1]);
        const seconds = numbers.length >= 3 ? Number(numbers[2]) : 0;
        if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || minutes < 0 || minutes >= 60 || seconds < 0 || seconds >= 60) {
            return { value: null, error: '分秒范围应为 0-59' };
        }
        const sign = decimal < 0 ? -1 : 1;
        decimal = sign * (Math.abs(decimal) + (minutes / 60) + (seconds / 3600));
    }

    if (direction === 'S' || direction === 'W' || direction === '南' || direction === '西') {
        decimal = -Math.abs(decimal);
    } else if (direction === 'N' || direction === 'E' || direction === '北' || direction === '东') {
        decimal = Math.abs(decimal);
    }

    const limit = kind === 'lat' ? 90 : 180;
    if (!Number.isFinite(decimal) || decimal < -limit || decimal > limit) {
        return { value: null, error: `${kind === 'lat' ? '纬度' : '经度'}范围应为 -${limit} 到 ${limit}` };
    }
    return { value: decimal, error: null };
}

function readAreaBoundaryInputs() {
    const specs = [
        ['left', elements.boundaryLeft, 'lon', '左边界'],
        ['right', elements.boundaryRight, 'lon', '右边界'],
        ['top', elements.boundaryTop, 'lat', '上边界'],
        ['bottom', elements.boundaryBottom, 'lat', '下边界'],
    ];
    const next = { left: null, right: null, top: null, bottom: null, errors: [] };
    specs.forEach(([key, element, kind, label]) => {
        const parsed = parseBoundaryCoordinate(element ? element.value : '', kind);
        next[key] = parsed.value;
        if (parsed.error) {
            next.errors.push(`${label}: ${parsed.error}`);
        }
    });
    if (next.left != null && next.right != null && next.left > next.right) {
        next.errors.push('左边界不能大于右边界');
    }
    if (next.top != null && next.bottom != null && next.bottom > next.top) {
        next.errors.push('下边界不能大于上边界');
    }
    state.areaBoundary = next;
    return next;
}

function areaBoundaryHasAnyLimit(boundary = state.areaBoundary) {
    return ['left', 'right', 'top', 'bottom'].some((key) => boundary[key] != null);
}

function setAreaBoundaryEnabled(enabled) {
    state.areaBoundaryEnabled = Boolean(enabled);
    if (elements.areaBoundaryEnabled) {
        elements.areaBoundaryEnabled.checked = state.areaBoundaryEnabled;
    }
    refreshAreaBoundary(getSelectedTrackEntry());
}

function addAreaBoundaryLine(points, label) {
    const line = L.polyline(points, {
        color: '#ff5d6c',
        weight: 2,
        opacity: 0.92,
        dashArray: '7 6',
        pane: 'areaBoundaryPane',
        interactive: false,
    }).addTo(areaBoundaryLayer);
    line.bindTooltip(label, {
        permanent: true,
        direction: 'center',
        className: 'area-boundary-label',
        opacity: 0.95,
    });
}

function drawAreaBoundary(boundary = state.areaBoundary) {
    areaBoundaryLayer.clearLayers();
    if (!state.areaBoundaryEnabled || boundary.errors.length || !areaBoundaryHasAnyLimit(boundary)) {
        return;
    }
    const mapBounds = map.getBounds();
    const south = mapBounds.getSouth();
    const north = mapBounds.getNorth();
    const west = mapBounds.getWest();
    const east = mapBounds.getEast();

    const hasRect = boundary.left != null
        && boundary.right != null
        && boundary.top != null
        && boundary.bottom != null
        && boundary.left <= boundary.right
        && boundary.bottom <= boundary.top;
    if (hasRect) {
        L.rectangle([[boundary.bottom, boundary.left], [boundary.top, boundary.right]], {
            color: '#ff5d6c',
            weight: 2,
            opacity: 0.95,
            fillColor: '#ff5d6c',
            fillOpacity: 0.04,
            dashArray: '7 6',
            pane: 'areaBoundaryPane',
            interactive: false,
        }).addTo(areaBoundaryLayer);
    }

    const lineSouth = boundary.bottom != null ? boundary.bottom : south;
    const lineNorth = boundary.top != null ? boundary.top : north;
    const lineWest = boundary.left != null ? boundary.left : west;
    const lineEast = boundary.right != null ? boundary.right : east;

    if (boundary.left != null) {
        addAreaBoundaryLine([[lineSouth, boundary.left], [lineNorth, boundary.left]], '左边界');
    }
    if (boundary.right != null) {
        addAreaBoundaryLine([[lineSouth, boundary.right], [lineNorth, boundary.right]], '右边界');
    }
    if (boundary.top != null) {
        addAreaBoundaryLine([[boundary.top, lineWest], [boundary.top, lineEast]], '上边界');
    }
    if (boundary.bottom != null) {
        addAreaBoundaryLine([[boundary.bottom, lineWest], [boundary.bottom, lineEast]], '下边界');
    }
}

function getSelectedTrackEntry() {
    const selectedFrame = getSelectedFrame();
    if (!selectedFrame || !selectedFrame.track || !selectedFrame.track.data) {
        return null;
    }
    const lat = Number(selectedFrame.track.data.lat);
    const lon = Number(selectedFrame.track.data.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) {
        return null;
    }
    return { frame: selectedFrame, data: selectedFrame.track.data };
}

function buildAreaBoundaryWarnings(item, boundary = state.areaBoundary) {
    if (!item) {
        return ['无有效航迹点'];
    }
    const lat = Number(item.data.lat);
    const lon = Number(item.data.lon);
    const violations = [];
    const warnings = [];
    if (boundary.left != null) {
        if (lon < boundary.left) {
            violations.push('越过左边界');
        } else if (lon - boundary.left <= AREA_BOUNDARY_WARNING_DEG) {
            warnings.push('接近左边界');
        }
    }
    if (boundary.right != null) {
        if (lon > boundary.right) {
            violations.push('越过右边界');
        } else if (boundary.right - lon <= AREA_BOUNDARY_WARNING_DEG) {
            warnings.push('接近右边界');
        }
    }
    if (boundary.top != null) {
        if (lat > boundary.top) {
            violations.push('越过上边界');
        } else if (boundary.top - lat <= AREA_BOUNDARY_WARNING_DEG) {
            warnings.push('接近上边界');
        }
    }
    if (boundary.bottom != null) {
        if (lat < boundary.bottom) {
            violations.push('越过下边界');
        } else if (lat - boundary.bottom <= AREA_BOUNDARY_WARNING_DEG) {
            warnings.push('接近下边界');
        }
    }
    return violations.length ? violations : warnings;
}

function updateAreaBoundaryStatus(item) {
    const node = document.querySelector('.area-boundary-status');
    if (!node) {
        return;
    }
    if (!state.areaBoundaryEnabled) {
        node.textContent = '区域限定 off';
        node.classList.remove('area-boundary-alert');
        return;
    }
    const boundary = state.areaBoundary;
    if (boundary.errors.length) {
        node.textContent = `区域限定输入错误: ${boundary.errors.join('；')}`;
        node.classList.add('area-boundary-alert');
        return;
    }
    if (!areaBoundaryHasAnyLimit(boundary)) {
        node.textContent = '区域限定 on | 未设置边界';
        node.classList.remove('area-boundary-alert');
        return;
    }
    const warnings = buildAreaBoundaryWarnings(item, boundary);
    if (warnings.length) {
        node.textContent = `区域限定 | ${warnings.join('；')}`;
        node.classList.add('area-boundary-alert');
        return;
    }
    node.textContent = '区域限定 | 范围内';
    node.classList.remove('area-boundary-alert');
}

function refreshAreaBoundary(item = getSelectedTrackEntry()) {
    const boundary = readAreaBoundaryInputs();
    drawAreaBoundary(boundary);
    updateAreaBoundaryStatus(item);
}

function formatAltitude(data) {
    if (!data) {
        return '--';
    }
    return formatMetric(data.alt_m, 0, ' m');
}

function formatTrackTooltip(item) {
    return [
        `Time: ${formatClock(item.frame.time)}`,
        `Alt: ${formatAltitude(item.data)}`,
        `Speed: ${formatMetric(item.data.speed, 1)}`,
        `Heading: ${formatMetric(item.data.heading, 0, ' deg')}`,
    ].join('<br>');
}

function updateFlightInfo(item) {
    const node = document.querySelector('.flight-info-status');
    if (!node) {
        return;
    }
    if (!item) {
        node.innerHTML = 'Flight<br>Alt --';
        return;
    }
    node.innerHTML = [
        `<strong>${formatClock(item.frame.time)}</strong>`,
        `Alt ${formatAltitude(item.data)}`,
        `Lat ${formatMetric(item.data.lat, 5)}`,
        `Lon ${formatMetric(item.data.lon, 5)}`,
    ].join('<br>');
}

function updateMapMiniMode() {
    if (!elements.mapPanel) {
        return;
    }
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const anchor = state.mapMiniMode && state.mapMiniPlaceholder && state.mapMiniPlaceholder.parentNode
        ? state.mapMiniPlaceholder
        : elements.mapPanel;
    const rect = anchor.getBoundingClientRect();
    state.mapPanelTop = rect.top + window.scrollY;
    state.mapPanelHeight = rect.height || elements.mapPanel.offsetHeight || 1;
    const panelTop = state.mapPanelTop;
    const panelHeight = state.mapPanelHeight;
    const panelBottom = panelTop + panelHeight;
    const viewportTop = window.scrollY;
    const viewportBottom = viewportTop + viewportHeight;
    const visibleTop = Math.max(panelTop, viewportTop);
    const visibleBottom = Math.min(panelBottom, viewportBottom);
    const visibleHeight = Math.max(0, visibleBottom - visibleTop);
    const visibleRatio = visibleHeight / panelHeight;
    const shouldMini = viewportTop > panelTop && visibleRatio < MAP_MINI_VISIBLE_RATIO;

    if (shouldMini) {
        enterMapMiniMode(panelHeight);
        applyMapMiniPosition();
        return;
    }

    exitMapMiniMode();
}

function enterMapMiniMode(panelHeight) {
    if (state.mapMiniMode && elements.mapPanel.classList.contains('map-mini')) {
        if (state.mapMiniPlaceholder) {
            state.mapMiniPlaceholder.style.height = `${panelHeight}px`;
            state.mapMiniPlaceholder.style.minHeight = `${panelHeight}px`;
        }
        return;
    }
    if (!state.mapMiniPlaceholder) {
        state.mapMiniPlaceholder = document.createElement('section');
        state.mapMiniPlaceholder.className = 'panel-map-placeholder';
    }
    state.mapMiniPlaceholder.style.height = `${panelHeight}px`;
    state.mapMiniPlaceholder.style.minHeight = `${panelHeight}px`;
    if (!state.mapMiniPlaceholder.parentNode) {
        state.mapMiniHome = {
            parent: elements.mapPanel.parentNode,
            nextSibling: elements.mapPanel.nextSibling,
        };
        elements.mapPanel.parentNode.insertBefore(state.mapMiniPlaceholder, elements.mapPanel);
    }
    if (elements.mapPanel.parentNode !== document.body) {
        document.body.appendChild(elements.mapPanel);
    }
    elements.mapPanel.classList.add('map-mini');
    state.mapMiniMode = true;
    setTimeout(() => map.invalidateSize(), 80);
}

function exitMapMiniMode() {
    if (!elements.mapPanel) {
        return;
    }
    const wasMini = state.mapMiniMode
        || elements.mapPanel.classList.contains('map-mini')
        || Boolean(state.mapMiniPlaceholder && state.mapMiniPlaceholder.parentNode);
    if (state.mapMiniPlaceholder && state.mapMiniPlaceholder.parentNode) {
        state.mapMiniPlaceholder.parentNode.insertBefore(elements.mapPanel, state.mapMiniPlaceholder);
    } else if (state.mapMiniHome && state.mapMiniHome.parent) {
        state.mapMiniHome.parent.insertBefore(elements.mapPanel, state.mapMiniHome.nextSibling);
    }
    if (state.mapMiniPlaceholder && state.mapMiniPlaceholder.parentNode) {
        state.mapMiniPlaceholder.parentNode.removeChild(state.mapMiniPlaceholder);
    }
    elements.mapPanel.classList.remove('map-mini', 'map-mini-dragging');
    elements.mapPanel.style.left = '';
    elements.mapPanel.style.top = '';
    elements.mapPanel.style.right = '';
    elements.mapPanel.style.bottom = '';
    elements.mapPanel.style.width = '';
    elements.mapPanel.style.height = '';
    state.mapMiniMode = false;
    state.mapMiniHome = null;
    state.mapMiniDrag = null;
    if (wasMini) {
        setTimeout(() => map.invalidateSize(), 80);
    }
}

function clampMapMiniPosition(left, top) {
    const rect = elements.mapPanel.getBoundingClientRect();
    const width = rect.width || elements.mapPanel.offsetWidth || 1;
    const height = rect.height || elements.mapPanel.offsetHeight || 1;
    const maxLeft = Math.max(MAP_MINI_VIEWPORT_MARGIN, window.innerWidth - width - MAP_MINI_VIEWPORT_MARGIN);
    const maxTop = Math.max(MAP_MINI_VIEWPORT_MARGIN, window.innerHeight - height - MAP_MINI_VIEWPORT_MARGIN);
    return {
        left: Math.min(Math.max(left, MAP_MINI_VIEWPORT_MARGIN), maxLeft),
        top: Math.min(Math.max(top, MAP_MINI_VIEWPORT_MARGIN), maxTop),
    };
}

function defaultMapMiniPosition() {
    const rect = elements.mapPanel.getBoundingClientRect();
    const width = rect.width || elements.mapPanel.offsetWidth || 520;
    const height = rect.height || elements.mapPanel.offsetHeight || 390;
    return clampMapMiniPosition(
        window.innerWidth - width - 24,
        window.innerHeight - height - 24,
    );
}

function applyMapMiniPosition() {
    if (!state.mapMiniMode || !elements.mapPanel) {
        return;
    }
    const nextPosition = state.mapMiniPosition
        ? clampMapMiniPosition(state.mapMiniPosition.left, state.mapMiniPosition.top)
        : defaultMapMiniPosition();
    state.mapMiniPosition = nextPosition;
    elements.mapPanel.style.left = `${nextPosition.left}px`;
    elements.mapPanel.style.top = `${nextPosition.top}px`;
}

function beginMapMiniDrag(event) {
    if (!state.mapMiniMode || !elements.mapPanel || event.button !== 0) {
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    const rect = elements.mapPanel.getBoundingClientRect();
    state.mapMiniDrag = {
        pointerId: event.pointerId,
        captureTarget: event.currentTarget,
        startX: event.clientX,
        startY: event.clientY,
        startLeft: rect.left,
        startTop: rect.top,
    };
    elements.mapPanel.classList.add('map-mini-dragging');
    if (event.currentTarget.setPointerCapture) {
        event.currentTarget.setPointerCapture(event.pointerId);
    }
    pauseMapRefreshByInteraction();
}

function updateMapMiniDrag(event) {
    const drag = state.mapMiniDrag;
    if (!drag || drag.pointerId !== event.pointerId) {
        return;
    }
    event.preventDefault();
    const nextPosition = clampMapMiniPosition(
        drag.startLeft + event.clientX - drag.startX,
        drag.startTop + event.clientY - drag.startY,
    );
    state.mapMiniPosition = nextPosition;
    elements.mapPanel.style.left = `${nextPosition.left}px`;
    elements.mapPanel.style.top = `${nextPosition.top}px`;
    pauseMapRefreshByInteraction();
}

function endMapMiniDrag(event) {
    const drag = state.mapMiniDrag;
    if (!drag || drag.pointerId !== event.pointerId) {
        return;
    }
    state.mapMiniDrag = null;
    elements.mapPanel.classList.remove('map-mini-dragging');
    if (
        drag.captureTarget
        && drag.captureTarget.hasPointerCapture
        && drag.captureTarget.hasPointerCapture(event.pointerId)
    ) {
        drag.captureTarget.releasePointerCapture(event.pointerId);
    }
    pauseMapRefreshByInteraction();
}

function frameTimeOf(frame) {
    return frame ? frame.time : null;
}

function nonMissingFrames(moduleName) {
    return state.frames.filter((frame) => frame[moduleName] && frame[moduleName].status !== 'missing');
}

function latestFrame() {
    return state.frames.length ? state.frames[state.frames.length - 1] : null;
}

function latestNonMissingFrame(moduleName) {
    const frames = nonMissingFrames(moduleName);
    return frames.length ? frames[frames.length - 1] : null;
}

function getSelectedFrame() {
    if (state.mode === 'live' || !state.selectedFrameTime) {
        return latestFrame();
    }
    return state.frames.find((frame) => frame.time === state.selectedFrameTime) || latestFrame();
}

function upsertFrame(collection, frame) {
    const index = collection.findIndex((item) => item.time === frame.time);
    if (index >= 0) {
        collection[index] = frame;
    } else {
        collection.push(frame);
        collection.sort((a, b) => parseTime(a.time) - parseTime(b.time));
    }
}

function trimFrames() {
    const maxFrames = Math.max(1, state.maxHistorySeconds);
    if (state.frames.length > maxFrames) {
        state.frames = state.frames.slice(-maxFrames);
    }
}

function getDisplayFrames() {
    if (state.mode !== 'live') {
        return state.frames;
    }
    const keepSeconds = Math.max(1, Math.floor(state.windowMinutes * 60));
    return state.frames.slice(-keepSeconds);
}

function moduleStatusText(frame, moduleName) {
    if (!frame || !frame[moduleName]) {
        return '--';
    }
    const module = frame[moduleName];
    return `${module.status}${module.source_time ? ` | 源时次 ${formatClock(module.source_time)}` : ''}`;
}

function buildSeriesFrames(moduleName, frames) {
    return frames.filter((frame) => frame[moduleName] && frame[moduleName].data);
}

function getFilteredTrackEntries(frames) {
    const rawEntries = frames
        .map((frame) => frame.track && frame.track.data ? ({ frame, data: frame.track.data }) : null)
        .filter(Boolean)
        .filter((item) => item.data.lat != null && item.data.lon != null)
        .filter((item) => {
            const lat = Number(item.data.lat);
            const lon = Number(item.data.lon);
            return Number.isFinite(lat)
                && Number.isFinite(lon)
                && !(lat === 0 && lon === 0);
        });

    const filtered = [];
    let lastValid = null;
    rawEntries.forEach((item) => {
        const current = { lat: Number(item.data.lat), lon: Number(item.data.lon) };
        if (!lastValid) {
            filtered.push({ ...item, isDirty: false });
            lastValid = current;
            return;
        }

        const latDiff = Math.abs(current.lat - lastValid.lat);
        const lonDiff = Math.abs(current.lon - lastValid.lon);
        if (latDiff > DIRTY_TRACK_THRESHOLD_DEG || lonDiff > DIRTY_TRACK_THRESHOLD_DEG) {
            return;
        }

        filtered.push({ ...item, isDirty: false });
        lastValid = current;
    });

    return filtered;
}

function getReplayTrackEntries(entries) {
    const sampled = [];
    let lastAcceptedTime = null;

    entries.forEach((item) => {
        const currentTime = parseTime(item.frame.time);
        if (!currentTime) {
            return;
        }
        if (!lastAcceptedTime) {
            sampled.push(item);
            lastAcceptedTime = currentTime;
            return;
        }
        const diffSec = (currentTime - lastAcceptedTime) / 1000;
        if (diffSec >= state.replayPointIntervalSec) {
            sampled.push(item);
            lastAcceptedTime = currentTime;
        }
    });

    if (entries.length) {
        const lastEntry = entries[entries.length - 1];
        const lastSampled = sampled[sampled.length - 1];
        if (!lastSampled || lastSampled.frame.time !== lastEntry.frame.time) {
            sampled.push(lastEntry);
        }
    }

    return sampled;
}

function downsampleTrackPoints(points, maxPoints = MAX_TRACK_RENDER_POINTS) {
    if (points.length <= maxPoints) {
        return points;
    }
    const sampled = [];
    const step = (points.length - 1) / (maxPoints - 1);
    for (let i = 0; i < maxPoints; i += 1) {
        const idx = Math.round(i * step);
        sampled.push(points[idx]);
    }
    return sampled;
}

function downsampleReplayEntries(entries, maxCount = MAX_REPLAY_MARKERS) {
    if (entries.length <= maxCount) {
        return entries;
    }
    const sampled = [];
    const step = (entries.length - 1) / (maxCount - 1);
    for (let i = 0; i < maxCount; i += 1) {
        const idx = Math.round(i * step);
        sampled.push(entries[idx]);
    }
    return sampled;
}

function buildTrackRenderSignature(entries, points) {
    if (!entries.length || !points.length) {
        return `0|${state.mode}|${state.windowMinutes}|${state.replayPointIntervalSec}`;
    }
    return [
        entries.length,
        entries[0].frame.time,
        entries[entries.length - 1].frame.time,
        points.length,
        state.mode,
        state.windowMinutes,
        state.replayPointIntervalSec,
    ].join('|');
}

function buildReplayLayerSignature(replayEntries) {
    if (!replayEntries.length) {
        return `0|${state.mode}|${state.replayPointIntervalSec}`;
    }
    return [
        replayEntries.length,
        replayEntries[0].frame.time,
        replayEntries[replayEntries.length - 1].frame.time,
        state.mode,
        state.replayPointIntervalSec,
    ].join('|');
}

function rebuildReplayLayer(replayEntries) {
    trackPointLayer.clearLayers();
    replayEntries.forEach((item) => {
        const marker = L.circleMarker([item.data.lat, item.data.lon], {
            radius: 2,
            color: '#0f172a',
            weight: 0,
            fillColor: '#ffffff',
            fillOpacity: 0.25,
            pane: 'trackPane',
        });
        marker.bindTooltip(formatTrackTooltip(item), { direction: 'top', opacity: 0.92 });
        trackPointLayer.addLayer(marker);
    });
}

function pauseMapRefreshByInteraction(options = {}) {
    state.mapRefreshPaused = true;
    if (options.resizeOnResume) {
        state.pendingInteractionResize = true;
    }
    if (state.mapRefreshResumeTimer) {
        clearTimeout(state.mapRefreshResumeTimer);
    }
    state.mapRefreshResumeTimer = setTimeout(() => {
        state.mapRefreshPaused = false;
        state.mapRefreshResumeTimer = null;
        if (state.pendingInteractionResize) {
            state.pendingInteractionResize = false;
            resizeCharts();
        }
        forceReplayRenderNow();
        requestRender();
    }, MAP_INTERACTION_IDLE_RESUME_MS);
}

function forceReplayRenderNow() {
    state.replayLastMapRenderAt = 0;
    state.replayLastChartRenderAt = 0;
    state.replayLastHeatmapRenderAt = 0;
}

function findNearestReplayEntry(latlng) {
    if (!latlng || !state.replayEntries.length) {
        return null;
    }

    const clickPoint = map.latLngToContainerPoint(latlng);
    let nearest = null;
    let nearestDistance = Infinity;

    state.replayEntries.forEach((item) => {
        const point = map.latLngToContainerPoint([item.data.lat, item.data.lon]);
        const dx = clickPoint.x - point.x;
        const dy = clickPoint.y - point.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < nearestDistance) {
            nearestDistance = distance;
            nearest = item;
        }
    });

    if (nearestDistance <= REPLAY_CLICK_PIXEL_THRESHOLD) {
        return nearest;
    }
    return null;
}

function updateReplayControls() {
    const maxIndex = Math.max(0, state.frames.length - 1);
    elements.replaySlider.max = String(maxIndex);
    const currentFrame = getSelectedFrame();
    const selectedIndex = currentFrame ? state.frames.findIndex((frame) => frame.time === currentFrame.time) : 0;
    elements.replaySlider.value = String(Math.max(0, selectedIndex));
    elements.selectedTimeLabel.textContent = currentFrame ? formatClock(currentFrame.time) : '--:--:--';
    elements.replaySlider.disabled = !state.frames.length;
    elements.replayPlayBtn.disabled = state.mode !== 'replay' || state.frames.length <= 1;
    elements.replayPauseBtn.disabled = state.mode !== 'replay';
}

function syncReplayPointInterval() {
    if (!elements.replayPointSeconds) {
        return;
    }
    const value = Number(elements.replayPointSeconds.value) || 10;
    state.replayPointIntervalSec = Math.max(1, value);
    elements.replayPointSeconds.value = String(state.replayPointIntervalSec);
}

function setMode(mode) {
    state.mode = mode;
    state.replayLastMapRenderAt = 0;
    state.replayLastChartRenderAt = 0;
    state.replayLastHeatmapRenderAt = 0;
    if (mode === 'live') {
        stopReplay();
        if (state.pendingFrames.length) {
            state.pendingFrames.forEach((frame) => upsertFrame(state.frames, frame));
            state.pendingFrames = [];
            trimFrames();
        }
        const latest = latestFrame();
        state.selectedFrameTime = latest ? latest.time : null;
        setPillState(elements.modeStatus, 'pill-ok');
        elements.modeStatus.textContent = '模式 实时刷新';
    } else {
        const current = getSelectedFrame() || latestFrame();
        state.selectedFrameTime = current ? current.time : null;
        setPillState(elements.modeStatus, 'pill-alert');
        elements.modeStatus.textContent = '模式 历史回放';
    }
    updateReplayControls();
    renderAll();
}

function stopReplay() {
    if (state.replayTimer) {
        clearInterval(state.replayTimer);
        state.replayTimer = null;
    }
}

function startReplay() {
    if (state.mode !== 'replay' || state.frames.length <= 1) {
        return;
    }
    stopReplay();
    state.replayTimer = setInterval(() => {
        const currentFrame = getSelectedFrame();
        let index = currentFrame ? state.frames.findIndex((frame) => frame.time === currentFrame.time) : -1;
        if (index >= state.frames.length - 1) {
            index = -1;
        }
        const nextFrame = state.frames[index + 1];
        if (!nextFrame) {
            return;
        }
        state.selectedFrameTime = nextFrame.time;
        updateReplayControls();
        requestRender();
    }, REPLAY_INTERVAL_MS);
}

function selectFrameByTime(time, mode = state.mode) {
    if (!time) {
        return;
    }
    if (mode === 'replay') {
        state.selectedFrameTime = time;
        forceReplayRenderNow();
        updateReplayControls();
        requestRender();
        return;
    }
    state.selectedFrameTime = time;
    requestRender();
}

function updateTrackMap(displayFrames) {
    const entries = getFilteredTrackEntries(displayFrames);
    const points = entries.map((item) => [item.data.lat, item.data.lon]);
    fitInitialMapView(points);
    const replayEntries = getReplayTrackEntries(entries);
    state.replayEntries = replayEntries;
    elements.trackSummary.textContent = `轨迹点 ${points.length}`;

    trackPointLayer.clearLayers();
    selectedTrackMarker.setStyle({ opacity: 0, fillOpacity: 0 });

    if (!points.length) {
        trackLine.setLatLngs([]);
        updateFlightInfo(null);
        refreshAreaBoundary(null);
        return;
    }

    trackLine.setLatLngs(points);

    const selectedFrame = getSelectedFrame();
    const selectedEntry = entries.find((item) => selectedFrame && item.frame.time === selectedFrame.time);
    const activeEntry = selectedEntry || entries[entries.length - 1];
    const focusPoint = selectedEntry ? [selectedEntry.data.lat, selectedEntry.data.lon] : points[points.length - 1];
    trackMarker.setLatLng(points[points.length - 1]);
    trackMarker.bindTooltip(formatTrackTooltip(entries[entries.length - 1]), { direction: 'top', opacity: 0.92 });
    selectedTrackMarker.setLatLng(focusPoint);
    selectedTrackMarker.setStyle({ opacity: 1, fillOpacity: 0.85 });
    selectedTrackMarker.bindTooltip(formatTrackTooltip(activeEntry), { direction: 'top', opacity: 0.92 });
    updateFlightInfo(activeEntry);
    refreshAreaBoundary(activeEntry);

    replayEntries.forEach((item) => {
        const marker = L.circleMarker([item.data.lat, item.data.lon], {
            radius: 3,
            color: '#0f172a',
            weight: 1,
            fillColor: '#ffffff',
            fillOpacity: 0.2,
            pane: 'trackPane',
        });
        marker.on('click', () => {
            if (state.mode === 'live') {
                setMode('replay');
            }
            selectFrameByTime(item.frame.time, 'replay');
        });
        marker.bindTooltip(formatTrackTooltip(item), { direction: 'top', opacity: 0.92 });
        trackPointLayer.addLayer(marker);
    });
}

function updateTrackMapFast(displayFrames) {
    if (state.mapRefreshPaused) {
        return;
    }
    const entries = getFilteredTrackEntries(displayFrames);
    const points = entries.map((item) => [item.data.lat, item.data.lon]);
    fitInitialMapView(points);
    const renderedPoints = downsampleTrackPoints(points);
    const replayEntries = getReplayTrackEntries(entries);
    const replayVisualEntries = downsampleReplayEntries(replayEntries);
    state.replayEntries = replayEntries;
    elements.trackSummary.textContent = `轨迹点 ${points.length} / 渲染 ${renderedPoints.length}`;
    selectedTrackMarker.setStyle({ opacity: 0, fillOpacity: 0 });

    if (!points.length) {
        trackLine.setLatLngs([]);
        updateFlightInfo(null);
        refreshAreaBoundary(null);
        if (state.replayLayerSignature !== '0' || state.trackRenderSignature !== '0') {
            trackPointLayer.clearLayers();
            state.replayLayerSignature = '0';
            state.trackRenderSignature = '0';
        }
        return;
    }
    const trackRenderSignature = buildTrackRenderSignature(entries, points);
    if (trackRenderSignature !== state.trackRenderSignature) {
        trackLine.setLatLngs(renderedPoints);
        state.trackRenderSignature = trackRenderSignature;
    }

    const selectedFrame = getSelectedFrame();
    const selectedEntry = entries.find((item) => selectedFrame && item.frame.time === selectedFrame.time);
    const activeEntry = selectedEntry || entries[entries.length - 1];
    const focusPoint = selectedEntry ? [selectedEntry.data.lat, selectedEntry.data.lon] : points[points.length - 1];
    trackMarker.setLatLng(points[points.length - 1]);
    trackMarker.bindTooltip(formatTrackTooltip(entries[entries.length - 1]), { direction: 'top', opacity: 0.92 });
    selectedTrackMarker.setLatLng(focusPoint);
    selectedTrackMarker.setStyle({ opacity: 1, fillOpacity: 0.85 });
    selectedTrackMarker.bindTooltip(formatTrackTooltip(activeEntry), { direction: 'top', opacity: 0.92 });
    updateFlightInfo(activeEntry);
    refreshAreaBoundary(activeEntry);

    const replaySignature = buildReplayLayerSignature(replayVisualEntries);
    if (replaySignature !== state.replayLayerSignature) {
        rebuildReplayLayer(replayVisualEntries);
        state.replayLayerSignature = replaySignature;
    }
}

function buildTimelineAxis(frames) {
    return frames.map((frame) => formatClock(frame.time));
}

function buildSelectedTimeMarkLine(selectedFrame) {
    if (!selectedFrame) {
        return undefined;
    }
    return {
        symbol: 'none',
        lineStyle: { color: '#ef4444', width: 1.5 },
        data: [{ xAxis: formatClock(selectedFrame.time) }],
    };
}

function renderLineChart(chart, title, frames, seriesDefs, selectedFrame) {
    const xAxis = buildTimelineAxis(frames);
    chart.setOption({
        animation: false,
        title: { text: title, left: 8, top: 4, textStyle: { fontSize: 14, fontWeight: 'normal' } },
        tooltip: { trigger: 'axis' },
        legend: { top: 4, right: 8 },
        grid: { left: 56, right: 28, top: 44, bottom: 48 },
        xAxis: { type: 'category', data: xAxis, axisLabel: { rotate: 35 } },
        yAxis: { type: 'value', scale: true },
        series: seriesDefs.map((item) => ({
            name: item.name,
            type: 'line',
            showSymbol: false,
            smooth: false,
            connectNulls: false,
            markLine: buildSelectedTimeMarkLine(selectedFrame),
            data: frames.map((frame) => item.getValue(frame)),
        })),
    });
}

function renderBarChart(chart, title, values, prefix, options = {}) {
    const normalizedValues = Array.isArray(values)
        ? (prefix === 'Bin ' ? values.slice(0, MAX_BIN_DISPLAY_COUNT) : values)
        : [];
    const categories = options.categories || normalizedValues.map((_, idx) => `${prefix}${idx + 1}`);
    chart.setOption({
        animation: false,
        title: { text: title, left: 8, top: 4, textStyle: { fontSize: 14, fontWeight: 'normal' } },
        tooltip: { trigger: 'axis' },
        grid: { left: 56, right: 20, top: 40, bottom: options.xName ? 68 : 54 },
        xAxis: {
            type: 'category',
            data: categories,
            name: options.xName || '',
            nameLocation: 'middle',
            nameGap: 46,
            axisLabel: { interval: 'auto', rotate: 40, fontSize: 10 },
        },
        yAxis: { type: 'value', scale: true },
        series: [{
            name: title,
            type: 'bar',
            barMaxWidth: 12,
            itemStyle: { color: '#2a9d8f' },
            data: normalizedValues,
        }],
    });
}

function renderProfileChart(chart, title, xName, levels, values, color) {
    const pairs = levels.map((level, idx) => [values ? values[idx] : null, level]);
    chart.setOption({
        animation: false,
        title: { show: false },
        tooltip: { trigger: 'axis' },
        grid: { left: 78, right: 28, top: 20, bottom: 58 },
        xAxis: {
            type: 'value',
            name: title,
            nameLocation: 'middle',
            nameGap: 36,
            scale: true,
        },
        yAxis: {
            type: 'value',
            name: '\u9ad8\u5ea6(m)',
            nameLocation: 'middle',
            nameGap: 48,
            min: 0,
        },
        series: [{
            type: 'line',
            showSymbol: false,
            data: pairs,
            lineStyle: { color },
            itemStyle: { color },
        }],
    });
}

function updateScdpCharts(selectedFrame, displayFrames) {
    const frames = buildSeriesFrames('scdp', displayFrames);
    renderLineChart(charts.scdpSeries, 'SCDP 单值量', frames, [
        { name: PARTICLE_SERIES_LABELS.number_conc, getValue: (frame) => frame.scdp.data.number_conc },
        { name: PARTICLE_SERIES_LABELS.lwc, getValue: (frame) => frame.scdp.data.lwc },
        { name: PARTICLE_SERIES_LABELS.mvd, getValue: (frame) => frame.scdp.data.mvd },
        { name: PARTICLE_SERIES_LABELS.ed, getValue: (frame) => frame.scdp.data.ed },
    ], selectedFrame);

    const activeFrame = selectedFrame && selectedFrame.scdp && selectedFrame.scdp.status !== 'missing'
        ? selectedFrame
        : latestNonMissingFrame('scdp');
    const scdpBins = activeFrame && activeFrame.scdp.data && Array.isArray(activeFrame.scdp.data.bins)
        ? activeFrame.scdp.data.bins.slice(0, SCDP_BIN_DISPLAY_COUNT)
        : null;
    renderBarChart(charts.scdpBins, 'Num', scdpBins, '', {
        categories: SCDP_BIN_DIAMETERS_UM.map(String),
        xName: '\u7c92\u5f84(\u03bcm)',
    });
    elements.scdpStatus.textContent = moduleStatusText(activeFrame || selectedFrame, 'scdp');
}

function updateIcfpCharts(selectedFrame, displayFrames) {
    const frames = buildSeriesFrames('icfp', displayFrames);
    renderLineChart(charts.icfpSeries, 'ICFP 单值量', frames, [
        { name: PARTICLE_SERIES_LABELS.number_conc, getValue: (frame) => frame.icfp.data.number_conc },
        { name: PARTICLE_SERIES_LABELS.lwc, getValue: (frame) => frame.icfp.data.lwc },
        { name: PARTICLE_SERIES_LABELS.mvd, getValue: (frame) => frame.icfp.data.mvd },
        { name: PARTICLE_SERIES_LABELS.ed, getValue: (frame) => frame.icfp.data.ed },
    ], selectedFrame);

    const activeFrame = selectedFrame && selectedFrame.icfp && selectedFrame.icfp.status !== 'missing'
        ? selectedFrame
        : latestNonMissingFrame('icfp');
    const icfpBins = activeFrame && activeFrame.icfp.data && Array.isArray(activeFrame.icfp.data.bins)
        ? activeFrame.icfp.data.bins.slice(0, ICFP_BIN_DISPLAY_COUNT)
        : null;
    renderBarChart(charts.icfpBins, 'Num', icfpBins, 'Bin ');
    elements.icfpStatus.textContent = moduleStatusText(activeFrame || selectedFrame, 'icfp');
}

function updateMwrScalarChart(selectedFrame, displayFrames) {
    const frames = buildSeriesFrames('mwr', displayFrames);
    renderLineChart(charts.mwrScalar, 'MWR 单值量', frames, [
        { name: MWR_SCALAR_LABELS.sur_tem, getValue: (frame) => frame.mwr.data.sur_tem },
        { name: MWR_SCALAR_LABELS.sur_hum, getValue: (frame) => frame.mwr.data.sur_hum },
        { name: MWR_SCALAR_LABELS.cloud_base_m, getValue: (frame) => frame.mwr.data.cloud_base_km == null ? null : frame.mwr.data.cloud_base_km * 1000 },
        { name: MWR_SCALAR_LABELS.vint_mm, getValue: (frame) => frame.mwr.data.vint_mm },
        { name: MWR_SCALAR_LABELS.lqint_mm, getValue: (frame) => frame.mwr.data.lqint_mm },
    ], selectedFrame);
    const activeFrame = selectedFrame && selectedFrame.mwr && selectedFrame.mwr.status !== 'missing'
        ? selectedFrame
        : latestNonMissingFrame('mwr');
    elements.mwrStatus.textContent = moduleStatusText(activeFrame || selectedFrame, 'mwr');
}

function updateMwrProfileCharts(selectedFrame) {
    const activeFrame = selectedFrame && selectedFrame.mwr && selectedFrame.mwr.status !== 'missing'
        ? selectedFrame
        : latestNonMissingFrame('mwr');
    const levels = activeFrame && activeFrame.mwr.data ? activeFrame.mwr.data.levels_m : [];
    const data = activeFrame && activeFrame.mwr.data ? activeFrame.mwr.data : null;
    if (elements.mwrProfileTime) {
        elements.mwrProfileTime.textContent = activeFrame ? formatClock(activeFrame.time) : '--:--:--';
    }

    renderProfileChart(charts.mwrTempProfile, '\u6e29\u5ea6\u5ed3\u7ebf', '\u6e29\u5ea6', levels, data ? data.temperature_profile : [], '#d9480f');
    renderProfileChart(charts.mwrHumProfile, '\u6e7f\u5ea6\u5ed3\u7ebf', '\u6e7f\u5ea6', levels, data ? data.humidity_profile : [], '#2563eb');
    renderProfileChart(charts.mwrVaporProfile, '\u6c34\u6c7d\u5bc6\u5ea6\u5ed3\u7ebf', '\u6c34\u6c7d\u5bc6\u5ea6', levels, data ? data.vapor_density_profile : [], '#0f766e');
    renderProfileChart(charts.mwrLiquidProfile, '\u6db2\u6001\u6c34\u5ed3\u7ebf', '\u6db2\u6001\u6c34', levels, data ? data.liquid_water_profile : [], '#7c3aed');
}

function updateMwrZoneChart(selectedFrame, displayFrames) {
    const frames = displayFrames
        .filter((frame) => frame.mwr && frame.mwr.status !== 'missing')
        .filter((frame) => frame.mwr.data && frame.mwr.data.saturated_zone);
    const latest = frames.length ? frames[frames.length - 1] : null;
    const levels = latest && latest.mwr.data ? latest.mwr.data.levels_m : [];
    const xAxis = buildTimelineAxis(frames);
    const heatmap = [];

    frames.forEach((frame, xIndex) => {
        const codes = frame.mwr.data.saturated_zone.zone_codes || [];
        codes.forEach((code, yIndex) => {
            heatmap.push([xIndex, yIndex, code]);
        });
    });

    charts.mwrZone.setOption({
        animation: false,
        title: { text: '过冷水汽饱和区识别', left: 8, top: 4, textStyle: { fontSize: 14, fontWeight: 'normal' } },
        tooltip: {
            formatter(params) {
                const xIndex = params.value[0];
                const yIndex = params.value[1];
                return `${xAxis[xIndex] || '--:--:--'}<br>${levels[yIndex] || '--'} m<br>类别 ${params.value[2]}`;
            },
        },
        grid: { left: 64, right: 28, top: 82, bottom: 40 },
        xAxis: { type: 'category', data: xAxis, axisLabel: { rotate: 35 } },
        yAxis: {
            type: 'category',
            name: '\u9ad8\u5ea6',
            nameLocation: 'middle',
            nameGap: 46,
            data: levels.map((value) => `${value} m`),
        },
        visualMap: {
            min: -1,
            max: 3,
            orient: 'horizontal',
            left: 'center',
            top: 34,
            pieces: [
                { value: -1, label: 'Filled(no data)', color: 'grey' },
                { value: 0, label: 'no cloud', color: 'white' },
                { value: 1, label: 'e>es>ei', color: 'blue' },
                { value: 2, label: 'es>e>ei', color: 'green' },
                { value: 3, label: 'es > ei > e', color: 'red' },
            ],
        },
        series: [{
            type: 'heatmap',
            data: heatmap,
            progressive: 0,
            markLine: buildSelectedTimeMarkLine(selectedFrame),
            emphasis: { itemStyle: { borderColor: '#333', borderWidth: 1 } },
        }],
    });
}

function updateMeta(selectedFrame) {
    const latest = latestFrame();
    elements.latestTime.textContent = `最新时刻 ${latest ? formatClock(latest.time) : '--:--:--'}`;
    elements.currentDate.textContent = `日期 ${selectedFrame ? formatDate(selectedFrame.time) : '----/--/--'}`;
    elements.selectedTimeLabel.textContent = selectedFrame ? formatClock(selectedFrame.time) : '--:--:--';
}

function updateWindowLimitIndicator() {
    const requestedMinutes = Number(elements.windowMinutes.value) || 0;
    const effectiveLimit = Math.min(MAX_WINDOW_MINUTES, Math.max(1, Math.floor(state.maxHistorySeconds / 60)));
    elements.historyLimit.textContent = `限制时间 ${effectiveLimit}min`;
    setPillState(elements.historyLimit, requestedMinutes > effectiveLimit ? 'pill-alert' : 'pill-neutral');
}

function applyDataSourceToInputs(data) {
    if (!data) {
        return;
    }
    state.dataSource = data;
    if (elements.dataSourceDate) {
        elements.dataSourceDate.value = data.date1 || '';
    }
    if (elements.dataSourceNum) {
        elements.dataSourceNum.value = String(data.num || 1);
    }
    if (elements.dataSourceNote) {
        const defaultText = data.default_date1 && data.default_num
            ? `默认 ${data.default_date1} / ${data.default_num} 架次`
            : '重启后恢复默认日期';
        elements.dataSourceNote.textContent = `当前 ${data.date1 || '--'} / ${data.num || '--'} 架次；${defaultText}`;
    }
}

function clearLoadedRuntimeData() {
    stopReplay();
    state.frames = [];
    state.pendingFrames = [];
    state.selectedFrameTime = null;
    state.replayEntries = [];
    state.replayLayerSignature = '';
    state.trackRenderSignature = '';
    state.initialMapFitted = false;
    renderAll();
}

async function loadDataSource() {
    const response = await fetch('/api/data-source', { cache: 'no-store' });
    if (!response.ok) {
        throw new Error(`data-source status ${response.status}`);
    }
    applyDataSourceToInputs(await response.json());
}

async function applyDataSource() {
    if (!elements.dataSourceDate || !elements.dataSourceNum) {
        return;
    }
    const response = await fetch('/api/data-source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            date1: elements.dataSourceDate.value,
            num: Number(elements.dataSourceNum.value) || 1,
        }),
    });
    if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail.detail || `data-source status ${response.status}`);
    }
    applyDataSourceToInputs(await response.json());
    clearLoadedRuntimeData();
    await loadStatus();
    await loadMapConfig();
    await loadHistory();
}

function updateBinVisibility() {
    elements.scdpBinsChart.classList.toggle('hidden', !elements.showScdpBins.checked);
    elements.icfpBinsChart.classList.toggle('hidden', !elements.showIcfpBins.checked);
    charts.scdpBins.resize();
    charts.icfpBins.resize();
}

function resizeCharts() {
    map.invalidateSize();
    Object.values(charts).forEach((chart) => chart.resize());
}

function shiftTimelineStrip(direction) {
    const timelineStrip = document.querySelector('.timeline-strip');
    if (!timelineStrip) {
        return;
    }
    pauseMapRefreshByInteraction({ resizeOnResume: true });
    const card = timelineStrip.querySelector('.timeline-card');
    const step = card ? card.getBoundingClientRect().width + 12 : timelineStrip.clientWidth;
    timelineStrip.scrollBy({
        left: direction * step,
        behavior: 'smooth',
    });
}

function requestRender() {
    if (state.renderQueued) {
        return;
    }
    state.renderQueued = true;
    requestAnimationFrame(() => {
        state.renderQueued = false;
        renderAll();
    });
}

function renderAll() {
    if (state.mapRefreshPaused) {
        return;
    }
    trimFrames();
    const displayFrames = getDisplayFrames();
    const selectedFrame = getSelectedFrame();
    updateMeta(selectedFrame);
    updateReplayControls();
    const canViewCharts = hasPermission('view_charts');

    if (state.mode !== 'replay') {
        updateTrackMapFast(displayFrames);
        if (canViewCharts) {
            updateScdpCharts(selectedFrame, displayFrames);
            updateIcfpCharts(selectedFrame, displayFrames);
            updateMwrScalarChart(selectedFrame, displayFrames);
            updateMwrProfileCharts(selectedFrame);
            updateMwrZoneChart(selectedFrame, displayFrames);
        }
        return;
    }

    const now = performance.now();
    const shouldRenderMap = now - state.replayLastMapRenderAt >= REPLAY_MAP_RENDER_INTERVAL_MS;
    const shouldRenderCharts = now - state.replayLastChartRenderAt >= REPLAY_CHART_RENDER_INTERVAL_MS;
    const shouldRenderHeatmap = now - state.replayLastHeatmapRenderAt >= REPLAY_HEATMAP_RENDER_INTERVAL_MS;

    if (shouldRenderMap) {
        updateTrackMapFast(displayFrames);
        state.replayLastMapRenderAt = now;
    }
    if (canViewCharts && shouldRenderCharts) {
        updateScdpCharts(selectedFrame, displayFrames);
        updateIcfpCharts(selectedFrame, displayFrames);
        updateMwrScalarChart(selectedFrame, displayFrames);
        updateMwrProfileCharts(selectedFrame);
        state.replayLastChartRenderAt = now;
    }
    if (canViewCharts && shouldRenderHeatmap) {
        updateMwrZoneChart(selectedFrame, displayFrames);
        state.replayLastHeatmapRenderAt = now;
    }
}

async function loadStatus() {
    const response = await fetch('/api/status');
    const data = await response.json();
    state.maxHistorySeconds = data.max_history_seconds || 3600;
    if (data.data_source) {
        applyDataSourceToInputs(data.data_source);
    }
    elements.windowMinutes.max = String(Math.min(MAX_WINDOW_MINUTES, Math.max(1, Math.floor(state.maxHistorySeconds / 60))));
    updateWindowLimitIndicator();
}

async function loadMapConfig() {
    try {
        const response = await fetch('/api/map-config');
        if (!response.ok) {
            throw new Error(`status ${response.status}`);
        }
        const data = await response.json();
        state.mapConfig = { ...DEFAULT_MAP_CONFIG, ...data };
    } catch (error) {
        console.warn('[map-config] fallback to defaults:', error);
        state.mapConfig = { ...DEFAULT_MAP_CONFIG };
    }
    setRadarOpacity(state.mapConfig.rainviewer_default_opacity);
    setLocalRadarOpacity(state.mapConfig.local_radar_default_opacity);
    populateHimawariProducts();
    populateLocalRadarProducts();

    if (elements.mapSource) {
        const localOption = elements.mapSource.querySelector('option[value="local"]');
        if (localOption) {
            localOption.disabled = !state.mapConfig.has_local_tiles;
        }
        elements.mapSource.disabled = false;
    }
    applyBaseTileLayer(state.mapConfig.has_local_tiles ? 'local' : 'online');
    refreshHimawariLayer(true);
    refreshRadarLayer(true);
    if (hasPermission('view_local_radar')) {
        refreshLocalRadarLayer(true);
    }
}

async function loadImportantPoints() {
    try {
        const response = await fetch('/api/important-points');
        if (!response.ok) {
            throw new Error(`status ${response.status}`);
        }
        const data = await response.json();
        state.importantPoints = {
            ...DEFAULT_IMPORTANT_POINTS,
            ...data,
        };
    } catch (error) {
        console.warn('[important-points] fallback to defaults:', error);
        state.importantPoints = { ...DEFAULT_IMPORTANT_POINTS };
    }
    state.importantPointsLoaded = true;
    renderImportantPoints();
}

async function loadHistory() {
    const seconds = Math.max(1, state.maxHistorySeconds);
    const response = await fetch(`/api/history?seconds=${seconds}`);
    state.frames = await response.json();
    const latest = latestFrame();
    state.selectedFrameTime = latest ? latest.time : null;
    renderAll();
}

function openWebSocket() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${location.host}/ws/realtime`);

    setPillState(elements.wsStatus, 'pill-neutral');
    elements.wsStatus.textContent = '连接状态 连接中';

    ws.onopen = () => {
        setPillState(elements.wsStatus, 'pill-ok');
        elements.wsStatus.textContent = '连接状态 已连接';
    };

    ws.onmessage = (event) => {
        const frame = JSON.parse(event.data);
        if (state.mode === 'live') {
            upsertFrame(state.frames, frame);
            trimFrames();
            state.selectedFrameTime = frame.time;
            requestRender();
            return;
        }

        upsertFrame(state.pendingFrames, frame);
    };

    ws.onclose = () => {
        setPillState(elements.wsStatus, 'pill-neutral');
        elements.wsStatus.textContent = '连接状态 未连接';
        setTimeout(openWebSocket, 2000);
    };

    ws.onerror = () => {
        ws.close();
    };
}

function bindEvents() {
    if (elements.logoutBtn) {
        elements.logoutBtn.addEventListener('click', async () => {
            await fetch('/api/logout', { method: 'POST' });
            location.href = '/login';
        });
    }
    elements.applyWindow.addEventListener('click', async () => {
        const requested = Number(elements.windowMinutes.value) || 10;
        const allowed = Math.min(MAX_WINDOW_MINUTES, Math.max(1, Math.floor(state.maxHistorySeconds / 60)));
        state.windowMinutes = Math.max(1, Math.min(requested, allowed));
        await loadHistory();
        setMode('live');
        updateWindowLimitIndicator();
    });
    if (elements.applyDataSource) {
        elements.applyDataSource.addEventListener('click', async () => {
            try {
                elements.applyDataSource.disabled = true;
                await applyDataSource();
            } catch (error) {
                console.warn('[data-source] apply failed:', error);
                if (elements.dataSourceNote) {
                    elements.dataSourceNote.textContent = `日期切换失败: ${error.message}`;
                }
            } finally {
                elements.applyDataSource.disabled = false;
            }
        });
    }

    elements.windowMinutes.addEventListener('input', updateWindowLimitIndicator);
    if (elements.replayPointSeconds) {
        elements.replayPointSeconds.addEventListener('input', () => {
            syncReplayPointInterval();
            requestRender();
        });
    }
    elements.showScdpBins.addEventListener('change', updateBinVisibility);
    elements.showIcfpBins.addEventListener('change', updateBinVisibility);
    if (elements.mapSource) {
        elements.mapSource.addEventListener('change', () => {
            const source = elements.mapSource.value;
            applyBaseTileLayer(source === 'local' ? 'local' : (source === 'satellite' ? 'satellite' : 'online'));
        });
    }
    if (elements.himawariProduct) {
        elements.himawariProduct.addEventListener('change', () => {
            state.himawariProductId = elements.himawariProduct.value;
            refreshHimawariLayer(true);
        });
    }
    if (elements.himawariOverlayEnabled) {
        state.himawariEnabled = elements.himawariOverlayEnabled.checked;
        elements.himawariOverlayEnabled.addEventListener('change', () => {
            state.himawariEnabled = elements.himawariOverlayEnabled.checked;
            refreshHimawariLayer(true);
        });
    }
    if (elements.radarOverlayEnabled) {
        elements.radarOverlayEnabled.addEventListener('change', () => {
            state.radarEnabled = elements.radarOverlayEnabled.checked;
            refreshRadarLayer(true);
        });
    }
    if (elements.radarCoverageEnabled) {
        elements.radarCoverageEnabled.addEventListener('change', () => {
            state.radarCoverageEnabled = elements.radarCoverageEnabled.checked;
            refreshRadarLayer(true);
        });
    }
    if (elements.radarOpacity) {
        elements.radarOpacity.addEventListener('input', () => {
            setRadarOpacity((Number(elements.radarOpacity.value) || 0) / 100);
        });
    }
    if (elements.localRadarEnabled) {
        state.localRadarEnabled = elements.localRadarEnabled.checked;
        elements.localRadarEnabled.addEventListener('change', () => {
            state.localRadarEnabled = elements.localRadarEnabled.checked;
            refreshLocalRadarLayer(true);
        });
    }
    if (elements.localRadarPpiEnabled) {
        state.localRadarProductsEnabled.PPI = elements.localRadarPpiEnabled.checked;
        elements.localRadarPpiEnabled.addEventListener('change', () => {
            state.localRadarProductsEnabled.PPI = elements.localRadarPpiEnabled.checked;
            refreshLocalRadarLayer(true);
        });
    }
    if (elements.localRadarRpiEnabled) {
        state.localRadarProductsEnabled.RPI = elements.localRadarRpiEnabled.checked;
        elements.localRadarRpiEnabled.addEventListener('change', () => {
            state.localRadarProductsEnabled.RPI = elements.localRadarRpiEnabled.checked;
            refreshLocalRadarLayer(true);
        });
    }
    if (elements.localRadarOpacity) {
        elements.localRadarOpacity.addEventListener('input', () => {
            setLocalRadarOpacity((Number(elements.localRadarOpacity.value) || 0) / 100);
        });
    }
    if (elements.measureDistanceEnabled) {
        elements.measureDistanceEnabled.addEventListener('change', () => {
            setMeasureDistanceEnabled(elements.measureDistanceEnabled.checked);
        });
    }
    if (elements.measureDistanceUndo) {
        elements.measureDistanceUndo.addEventListener('click', () => {
            undoMeasurePoint();
        });
    }
    if (elements.measureDistanceClear) {
        elements.measureDistanceClear.addEventListener('click', () => {
            clearMeasureDistance();
        });
    }
    if (elements.anchorPointEnabled) {
        elements.anchorPointEnabled.addEventListener('change', () => {
            setAnchorPointEnabled(elements.anchorPointEnabled.checked);
        });
    }
    if (elements.anchorListOpen) {
        elements.anchorListOpen.addEventListener('click', () => {
            openAnchorModal();
        });
    }
    if (elements.anchorClear) {
        elements.anchorClear.addEventListener('click', () => {
            clearAnchorPoints();
        });
    }
    if (elements.anchorSize) {
        elements.anchorSize.addEventListener('input', () => {
            const value = Number(elements.anchorSize.value);
            state.anchorSizePx = Number.isFinite(value) ? Math.max(16, Math.min(60, value)) : 28;
            drawAnchorPoints();
        });
    }
    if (elements.anchorAltitude) {
        elements.anchorAltitude.addEventListener('input', () => {
            state.anchorAltitudeM = currentAnchorAltitude();
        });
    }
    if (elements.anchorSymbol) {
        elements.anchorSymbol.addEventListener('input', () => {
            state.anchorSymbol = currentAnchorSymbol();
        });
    }
    if (elements.anchorModalClose) {
        elements.anchorModalClose.addEventListener('click', closeAnchorModal);
    }
    if (elements.anchorModalCloseSecondary) {
        elements.anchorModalCloseSecondary.addEventListener('click', closeAnchorModal);
    }
    if (elements.anchorModalClear) {
        elements.anchorModalClear.addEventListener('click', () => {
            clearAnchorPoints();
        });
    }
    if (elements.anchorExportTxt) {
        elements.anchorExportTxt.addEventListener('click', () => {
            exportAnchorTxt();
        });
    }
    if (elements.anchorModal) {
        elements.anchorModal.addEventListener('click', (event) => {
            if (event.target === elements.anchorModal) {
                closeAnchorModal();
            }
        });
    }
    if (elements.areaBoundaryEnabled) {
        state.areaBoundaryEnabled = elements.areaBoundaryEnabled.checked;
        elements.areaBoundaryEnabled.addEventListener('change', () => {
            setAreaBoundaryEnabled(elements.areaBoundaryEnabled.checked);
        });
    }
    [
        elements.boundaryLeft,
        elements.boundaryRight,
        elements.boundaryTop,
        elements.boundaryBottom,
    ].filter(Boolean).forEach((input) => {
        input.addEventListener('input', () => {
            refreshAreaBoundary();
        });
    });

    elements.liveModeBtn.addEventListener('click', () => {
        setMode('live');
    });

    elements.replayModeBtn.addEventListener('click', () => {
        setMode('replay');
    });

    elements.replayPlayBtn.addEventListener('click', () => {
        if (state.mode !== 'replay') {
            setMode('replay');
        }
        startReplay();
    });

    elements.replayPauseBtn.addEventListener('click', () => {
        stopReplay();
    });

    elements.replaySlider.addEventListener('input', () => {
        const index = Number(elements.replaySlider.value) || 0;
        const frame = state.frames[index];
        if (!frame) {
            return;
        }
        if (state.mode !== 'replay') {
            setMode('replay');
        }
        stopReplay();
        state.selectedFrameTime = frame.time;
        requestRender();
    });

    map.on('click', (event) => {
        if (state.measureDistanceEnabled) {
            addMeasurePoint(event.latlng);
            return;
        }
        if (state.anchorPointEnabled) {
            addAnchorPoint(event.latlng);
            return;
        }
        const nearest = findNearestReplayEntry(event.latlng);
        if (!nearest) {
            return;
        }
        if (state.mode !== 'replay') {
            setMode('replay');
        }
        stopReplay();
        state.selectedFrameTime = nearest.frame.time;
        requestRender();
    });
    map.on('movestart move moveend zoomstart zoom zoomend dragstart drag dragend', () => {
        pauseMapRefreshByInteraction();
    });
    map.on('moveend zoomend viewreset', () => {
        refreshAreaBoundary();
    });
    map.on('zoomend viewreset', updateZoomStatus);

    const mapHeader = elements.mapPanel ? elements.mapPanel.querySelector('.panel-header') : null;
    if (mapHeader) {
        mapHeader.addEventListener('pointerdown', beginMapMiniDrag);
    }
    window.addEventListener('pointermove', updateMapMiniDrag);
    window.addEventListener('pointermove', (event) => {
        updateMeasurePreviewFromClientPoint(event.clientX, event.clientY);
    });
    window.addEventListener('pointerup', endMapMiniDrag);
    window.addEventListener('pointercancel', endMapMiniDrag);
    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closeAnchorModal();
        }
        const isEditing = isTextEditingTarget(event.target);
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !isEditing) {
            if (state.measureDistanceEnabled) {
                event.preventDefault();
                undoMeasurePoint();
                return;
            }
            if (state.anchorPointEnabled) {
                event.preventDefault();
                undoAnchorPoint();
            }
        }
    });

    window.addEventListener('scroll', () => {
        updateMapMiniMode();
        pauseMapRefreshByInteraction();
    }, { passive: true });
    window.addEventListener('resize', () => {
        resizeCharts();
        updateMapMiniMode();
        applyMapMiniPosition();
    });
    const timelineStrip = document.querySelector('.timeline-strip');
    if (timelineStrip) {
        timelineStrip.addEventListener('scroll', () => {
            pauseMapRefreshByInteraction({ resizeOnResume: true });
        }, { passive: true });
    }
    const rightStack = document.querySelector('.right-stack');
    if (rightStack) {
        rightStack.addEventListener('scroll', () => {
            pauseMapRefreshByInteraction({ resizeOnResume: true });
        }, { passive: true });
    }
    const timelinePrev = document.querySelector('.timeline-cue-left');
    const timelineNext = document.querySelector('.timeline-cue-right');
    if (timelinePrev) {
        timelinePrev.addEventListener('click', () => shiftTimelineStrip(-1));
    }
    if (timelineNext) {
        timelineNext.addEventListener('click', () => shiftTimelineStrip(1));
    }
}

async function init() {
    await loadCurrentUser();
    bindEvents();
    updateZoomStatus();
    syncReplayPointInterval();
    updateBinVisibility();
    await loadMapConfig();
    await loadImportantPoints();
    await loadDataSource();
    await loadStatus();
    await loadHistory();
    setMode('live');
    openWebSocket();
    setInterval(() => refreshHimawariLayer(false), HIMAWARI_API_REFRESH_MS);
    setInterval(() => refreshRadarLayer(false), RAINVIEWER_API_REFRESH_MS);
    setInterval(() => refreshLocalRadarLayer(false), LOCAL_RADAR_API_REFRESH_MS);
    setTimeout(() => {
        resizeCharts();
        updateMapMiniMode();
    }, 150);
}

init();
