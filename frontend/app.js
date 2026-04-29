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
const LEAFLET_TILE_SIZE = 256;
const REPLAY_MAP_RENDER_INTERVAL_MS = 1000;
const REPLAY_CHART_RENDER_INTERVAL_MS = 1200;
const REPLAY_HEATMAP_RENDER_INTERVAL_MS = 2000;
const MAP_MINI_VISIBLE_RATIO = 0.35;
const FRONTEND_BUILD = '2026-04-27-bin-num-axis';
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
    frames: [],
    pendingFrames: [],
    maxHistorySeconds: 3600,
    windowMinutes: 10,
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
    mapMiniPosition: null,
    mapMiniDrag: null,
};

const elements = {
    wsStatus: document.getElementById('ws-status'),
    modeStatus: document.getElementById('mode-status'),
    latestTime: document.getElementById('latest-time'),
    currentDate: document.getElementById('current-date'),
    historyLimit: document.getElementById('history-limit'),
    trackSummary: document.getElementById('track-summary'),
    scdpStatus: document.getElementById('scdp-status'),
    icfpStatus: document.getElementById('icfp-status'),
    mwrStatus: document.getElementById('mwr-status'),
    mwrProfileTime: document.getElementById('mwr-profile-time'),
    selectedTimeLabel: document.getElementById('selected-time-label'),
    windowMinutes: document.getElementById('window-minutes'),
    replayPointSeconds: document.getElementById('replay-point-seconds'),
    applyWindow: document.getElementById('apply-window'),
    liveModeBtn: document.getElementById('live-mode-btn'),
    replayModeBtn: document.getElementById('replay-mode-btn'),
    replayPlayBtn: document.getElementById('replay-play-btn'),
    replayPauseBtn: document.getElementById('replay-pause-btn'),
    replaySlider: document.getElementById('replay-slider'),
    showScdpBins: document.getElementById('show-scdp-bins'),
    showIcfpBins: document.getElementById('show-icfp-bins'),
    mapSource: document.getElementById('map-source'),
    radarOverlayEnabled: document.getElementById('radar-overlay-enabled'),
    radarCoverageEnabled: document.getElementById('radar-coverage-enabled'),
    radarOpacity: document.getElementById('radar-opacity'),
    radarOpacityValue: document.getElementById('radar-opacity-value'),
    mapPanel: document.querySelector('.panel-map'),
    scdpBinsChart: document.getElementById('scdp-bins-chart'),
    icfpBinsChart: document.getElementById('icfp-bins-chart'),
};

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
map.createPane('rainCoveragePane');
map.getPane('rainCoveragePane').style.zIndex = 490;
map.getPane('rainCoveragePane').style.pointerEvents = 'none';
map.createPane('trackPane');
map.getPane('trackPane').style.zIndex = 620;
map.getPane('trackPane').style.pointerEvents = 'auto';
map.createPane('importantPathPane');
map.getPane('importantPathPane').style.zIndex = 420;
map.getPane('importantPathPane').style.pointerEvents = 'none';
let baseTileLayer = null;
let rainRadarLayer = null;
let rainRadarCoverageLayer = null;
const rainRadarStatus = L.control({ position: 'bottomleft' });
rainRadarStatus.onAdd = () => {
    const div = L.DomUtil.create('div', 'rain-radar-status');
    div.textContent = state.radarStatus;
    return div;
};
rainRadarStatus.addTo(map);

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

function updateImportantOverlayStatus(pointCount, pathCount, warningCount) {
    const node = document.querySelector('.important-overlay-status');
    if (!node) {
        return;
    }
    const warningText = warningCount ? ` | warnings ${warningCount}` : '';
    node.textContent = `fixed points ${pointCount} | paths ${pathCount}${warningText}`;
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

        const tooltipContent = `<span style="color:${escapeHtml(style.label_color)};">${escapeHtml(name)}</span>`;
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
                        html: `<span style="color:${escapeHtml(style.label_color)};">${escapeHtml(name)}</span>`,
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
    updateImportantOverlayStatus(renderedPointCount, renderedPathCount, warnings.length);
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
    if (!state.mapMiniMode) {
        const rect = elements.mapPanel.getBoundingClientRect();
        state.mapPanelTop = rect.top + window.scrollY;
        state.mapPanelHeight = rect.height;
    }
    const panelTop = state.mapPanelTop;
    const panelHeight = state.mapPanelHeight || elements.mapPanel.offsetHeight || 1;
    const panelBottom = panelTop + panelHeight;
    const viewportTop = window.scrollY;
    const viewportBottom = viewportTop + viewportHeight;
    const visibleTop = Math.max(panelTop, viewportTop);
    const visibleBottom = Math.min(panelBottom, viewportBottom);
    const visibleHeight = Math.max(0, visibleBottom - visibleTop);
    const visibleRatio = visibleHeight / panelHeight;
    const shouldMini = viewportTop > panelTop && visibleRatio < MAP_MINI_VISIBLE_RATIO;
    const changed = elements.mapPanel.classList.toggle('map-mini', shouldMini);
    if (changed) {
        state.mapMiniMode = shouldMini;
        if (shouldMini) {
            if (!state.mapMiniPlaceholder) {
                state.mapMiniPlaceholder = document.createElement('section');
                state.mapMiniPlaceholder.className = 'panel-map-placeholder grid-map';
            }
            state.mapMiniPlaceholder.style.height = `${panelHeight}px`;
            elements.mapPanel.parentNode.insertBefore(state.mapMiniPlaceholder, elements.mapPanel);
            applyMapMiniPosition();
        } else if (state.mapMiniPlaceholder && state.mapMiniPlaceholder.parentNode) {
            state.mapMiniPlaceholder.parentNode.removeChild(state.mapMiniPlaceholder);
            elements.mapPanel.style.left = '';
            elements.mapPanel.style.top = '';
            state.mapMiniDrag = null;
            elements.mapPanel.classList.remove('map-mini-dragging');
        }
        setTimeout(() => map.invalidateSize(), 80);
    } else if (shouldMini) {
        applyMapMiniPosition();
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
        .filter((item) => item.data.lat != null && item.data.lon != null);

    const filtered = [];
    let lastValid = null;
    rawEntries.forEach((item) => {
        const current = { lat: item.data.lat, lon: item.data.lon };
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

function pauseMapRefreshByInteraction() {
    state.mapRefreshPaused = true;
    if (state.mapRefreshResumeTimer) {
        clearTimeout(state.mapRefreshResumeTimer);
    }
    state.mapRefreshResumeTimer = setTimeout(() => {
        state.mapRefreshPaused = false;
        state.mapRefreshResumeTimer = null;
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
    trimFrames();
    const displayFrames = getDisplayFrames();
    const selectedFrame = getSelectedFrame();
    updateMeta(selectedFrame);
    updateReplayControls();

    if (state.mode === 'replay' && state.mapRefreshPaused) {
        return;
    }

    if (state.mode !== 'replay') {
        updateTrackMapFast(displayFrames);
        updateScdpCharts(selectedFrame, displayFrames);
        updateIcfpCharts(selectedFrame, displayFrames);
        updateMwrScalarChart(selectedFrame, displayFrames);
        updateMwrProfileCharts(selectedFrame);
        updateMwrZoneChart(selectedFrame, displayFrames);
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
    if (shouldRenderCharts) {
        updateScdpCharts(selectedFrame, displayFrames);
        updateIcfpCharts(selectedFrame, displayFrames);
        updateMwrScalarChart(selectedFrame, displayFrames);
        updateMwrProfileCharts(selectedFrame);
        state.replayLastChartRenderAt = now;
    }
    if (shouldRenderHeatmap) {
        updateMwrZoneChart(selectedFrame, displayFrames);
        state.replayLastHeatmapRenderAt = now;
    }
}

async function loadStatus() {
    const response = await fetch('/api/status');
    const data = await response.json();
    state.maxHistorySeconds = data.max_history_seconds || 3600;
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

    if (elements.mapSource) {
        const localOption = elements.mapSource.querySelector('option[value="local"]');
        if (localOption) {
            localOption.disabled = !state.mapConfig.has_local_tiles;
        }
        elements.mapSource.disabled = false;
    }
    applyBaseTileLayer(state.mapConfig.has_local_tiles ? 'local' : 'online');
    refreshRadarLayer(true);
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
    elements.applyWindow.addEventListener('click', async () => {
        const requested = Number(elements.windowMinutes.value) || 10;
        const allowed = Math.min(MAX_WINDOW_MINUTES, Math.max(1, Math.floor(state.maxHistorySeconds / 60)));
        state.windowMinutes = Math.max(1, Math.min(requested, allowed));
        await loadHistory();
        setMode('live');
        updateWindowLimitIndicator();
    });

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

    const mapHeader = elements.mapPanel ? elements.mapPanel.querySelector('.panel-header') : null;
    if (mapHeader) {
        mapHeader.addEventListener('pointerdown', beginMapMiniDrag);
    }
    window.addEventListener('pointermove', updateMapMiniDrag);
    window.addEventListener('pointerup', endMapMiniDrag);
    window.addEventListener('pointercancel', endMapMiniDrag);

    window.addEventListener('scroll', () => {
        updateMapMiniMode();
        pauseMapRefreshByInteraction();
    }, { passive: true });
    window.addEventListener('resize', () => {
        resizeCharts();
        updateMapMiniMode();
        applyMapMiniPosition();
    });
}

async function init() {
    bindEvents();
    syncReplayPointInterval();
    updateBinVisibility();
    await loadMapConfig();
    await loadImportantPoints();
    await loadStatus();
    await loadHistory();
    setMode('live');
    openWebSocket();
    setInterval(() => refreshRadarLayer(false), RAINVIEWER_API_REFRESH_MS);
    setTimeout(() => {
        resizeCharts();
        updateMapMiniMode();
    }, 150);
}

init();
