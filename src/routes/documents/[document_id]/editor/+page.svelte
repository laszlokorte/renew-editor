<script>
	// @ts-nocheck

	import { resolve } from '$app/paths';
	import {
		view,
		storedAtom,
		atom,
		update,
		combine,
		read,
		failableView,
		viewCombined,
		call
	} from '$lib/reactivity/atom.svelte';
	import {
		bindValue,
		bindNumericValue,
		polyfillDragDrop
	} from '$lib/reactivity/bindings.svelte.js';
	import { numberSvgFormat } from '$lib/svg/formatter';
	import AppBar from '../../../AppBar.svelte';
	import AttributeInput from './AttributeInput.svelte';

	import Modal from '$lib/components/modal/Modal.svelte';
	import SVGViewport from '$lib/components/viewport/SVGViewport.svelte';
	import CameraScroller from '$lib/components/viewport/CameraScroller.svelte';
	import CanvasDropper from '$lib/components/dragdrop/CanvasDropper.svelte';
	import LiveResource from '$lib/components/live/LiveResource.svelte';
	import Grid from '$lib/components/editor/overlays/grid/Grid.svelte';
	import Pen from '$lib/components/editor/tools/pen/Pen.svelte';
	import Magnifier from '$lib/components/editor/tools/magnifier/Magnifier.svelte';
	import Paner from '$lib/components/editor/tools/paner/Paner.svelte';
	import Rotator from '$lib/components/editor/tools/rotator/Rotator.svelte';
	import Zoomer from '$lib/components/editor/tools/zoomer/Zoomer.svelte';
	import Spline from '$lib/components/editor/tools/spline/Spline.svelte';
	import Polygon from '$lib/components/editor/tools/polygon/Polygon.svelte';
	import Spacer from '$lib/components/editor/tools/spacer/Spacer.svelte';
	import Edger from '$lib/components/editor/tools/edger/Edger.svelte';

	import { buildPath, buildCoord } from '$lib/components/renew/symbols';
	import Symbol from '$lib/components/renew/Symbol.svelte';
	import TextElement from '$lib/components/renew/TextElement.svelte';
	import { edgeAngle, edgePath, tipColor } from '$lib/components/renew/edges.js';
	import { walkDocument } from '$lib/components/renew/document.js';

	import * as E from '$lib/dom/events';

	import * as L from 'partial.lenses';
	import * as R from 'ramda';
	import Minimap from '$lib/components/editor/overlays/minimap/Minimap.svelte';
	import * as Geo from '$lib/math/geometry';
	import MenuBarButton from '$lib/components/menubar/MenuBarButton.svelte';

	import { colorNameToHex } from '$lib/utils';
	import {
		frameBoxLens,
		panMovementLens,
		rotateMovementLens,
		zoomMovementLens
	} from '$lib/components/camera/lenses';
	import Navigator from '$lib/components/camera/Navigator.svelte';
	import MountTrigger from '$lib/components/camera/MountTrigger.svelte';
	import { describeError } from '$lib/errors';
	import { downloadFile } from '$lib/io/download';
	import {
		LOOK_AND_FEEL_OPTIONS,
		loadLookAndFeel,
		setLookAndFeel
	} from '$lib/api/look_and_feel.js';

	const { data } = $props();
	const lookAndFeel = atom(loadLookAndFeel());

	function backendUrl(path) {
		const base = data.authState?.value?.url ?? window.location.origin;

		try {
			return new URL(path, base).href;
		} catch (_) {
			return path;
		}
	}

	function documentMenuHref(key, fallbackPath) {
		return data.document?.links?.menu?.[key]?.href ?? backendUrl(fallbackPath);
	}

	function attributeTooltips(node) {
		const tooltipTargets = [
			'.pretty-select',
			'.pretty-number',
			'.pretty-color',
			'.pretty-color-reset',
			'.pretty-color-clear',
			'.pretty-checkbox',
			'.pretty-checkbox-label',
			'.pretty-checkbox-group'
		].join(',');
		const labelTargets = [
			'.pretty-select-label',
			'.pretty-number-label',
			'.pretty-color-label',
			'.pretty-checkbox-group-head',
			'title'
		].join(',');

		const tooltipText = (element) => {
			return (
				element.getAttribute('title') ||
				element.getAttribute('aria-label') ||
				element.querySelector(labelTargets)?.textContent?.trim() ||
				''
			);
		};

		const sync = () => {
			node.querySelectorAll(tooltipTargets).forEach((element) => {
				const text = tooltipText(element);

				if (!text) {
					return;
				}

				element.setAttribute('title', text);
				element.dataset.tooltip = text;

				element.querySelectorAll('input, select, button').forEach((control) => {
					control.setAttribute('title', text);
					control.dataset.tooltip = text;
				});
			});
		};

		const observer = new MutationObserver(sync);
		observer.observe(node, { childList: true, subtree: true });
		requestAnimationFrame(sync);

		return {
			destroy() {
				observer.disconnect();
			}
		};
	}

	export const forceHex = L.reread((v) => {
		if (v === 'transparent') {
			return '#000000';
		}
		return colorNameToHex(v);
	});
	const logLens = (base) =>
		L.lens(
			(x) => Math.log(x) / Math.log(base),
			(y) => Math.pow(base, y)
		);

	const textBounds = atom({});
	const selectedBlueprint = atom(undefined);
	const storedViewOptions = storedAtom('petristation-editor');
	const viewOptions = view(L.json(), storedViewOptions);
	const debugPanel = view('debugPanel', viewOptions);
	const showDebug = view(['show', L.valueOr(false)], debugPanel);
	const debugTabs = view(['tabs', L.valueOr({})], debugPanel);
	const showMinimap = view(['minimap', L.valueOr(true)], viewOptions);
	const gridView = view(['grid', L.valueOr({})], viewOptions);
	const showGrid = view(['show', L.valueOr(false)], gridView);
	const snapToGrid = view(['snap', L.valueOr(false)], gridView);
	const penView = view(['pen', L.valueOr({})], viewOptions);
	const penSmoothness = view(['smoothness', L.valueOr('linear')], penView);
	const penSmoothnessAmount = view(['smoothnessAmount', L.valueOr(50)], penView);
	const polygonView = view(['polygon', L.valueOr({})], viewOptions);
	const polygonSmoothness = view(['smoothness', L.valueOr('linear')], polygonView);
	const polygonSmoothnessAmount = view(['smoothnessAmount', L.valueOr(50)], polygonView);
	const splineView = view(['spline', L.valueOr({})], viewOptions);
	const splineSampleCount = view(['sampleCount', L.valueOr(12)], splineView);
	const showHierarchy = view(['hierarchy', L.valueOr(true)], viewOptions);
	const showCursors = view(['remoteCursors', L.valueOr(true)], viewOptions);
	const showOtherSelections = view(['remoteSelections', L.valueOr(true)], viewOptions);
	const showSequentialOnlyArcs = view(['sequentialOnlyArcs', L.valueOr(false)], viewOptions);
	const toolbarView = view(['toolbars', L.valueOr({})], viewOptions);
	const showCreateToolbar = view(['create', L.valueOr(true)], toolbarView);
	const lockRotation = view(['rotationLock', L.valueOr(false)], viewOptions);
	const gridDistance = view(['distance', L.valueOr(32)], gridView);
	const TOOLBAR_LAYOUT_STORAGE_KEY = 'petristation-toolbar-layout';
	const TOOLBAR_LAYOUTS_STORAGE_KEY = 'petristation-toolbar-layouts';
	const CREATE_TOOLBAR_ORDER_STORAGE_KEY = 'petristation-create-toolbar-order';
	const CREATE_TOOLBAR_LAYOUT_VERSION_STORAGE_KEY = 'petristation-create-toolbar-layout-version';
	const CREATE_TOOLBAR_COLLAPSED_GROUPS_STORAGE_KEY =
		'petristation-create-toolbar-collapsed-groups';
	const CREATE_TOOLBAR_WIDTH_STORAGE_KEY = 'petristation-create-toolbar-width';
	const DEFAULT_CREATE_TOOLBAR_WIDTH = 330;
	const CREATE_TOOLBAR_LAYOUT_VERSION = 'renew-toolset-2026-06-15-renew-palette-v3';

	const showRename = atom(false);
	const showNewDrawing = atom(false);
	const showSearch = atom(false);
	const showInspect = atom(false);
	const showAbout = atom(false);
	const showCommandConsole = atom(false);
	const showToolOptions = atom(false);
	const toolOptions = atom(null);
	const recentDocuments = atom([]);
	const toolbarLayouts = atom(loadToolbarLayouts());
	const createToolbarOrder = atom(loadCreateToolbarOrder());
	const collapsedCreateToolGroups = atom(loadCollapsedCreateToolGroups());
	const createToolbarWidth = atom(loadCreateToolbarWidth());
	const createToolbarDrag = atom(null);
	const inspectedLayer = atom(null);
	const searchReplaceMode = atom(false);
	const searchQuery = atom('');
	const searchReplacement = atom('');
	const searchCaseSensitive = atom(false);
	const commandConsoleText = atom('');
	const commandConsoleOutput = atom('');
	const statusMessage = atom('');
	const backoffValue = atom(undefined);
	const pointerOffset = atom({ x: 0, y: 0 });
	const resizeHandleDrag = atom(undefined);
	const attributeHandleDrag = atom(undefined);
	const polygonScaleDrag = atom(undefined);
	const polygonScalePreviewEdges = atom(new Map());
	const gridDistanceExp = view(logLens(2), gridDistance);

	const dropperDomElement = atom(undefined);

	const optimisticValue = atom(null);

	function hasTransferContent(trans, type) {
		return [...trans.types].includes(type);
	}

	function safeJsonParse(text) {
		try {
			return JSON.parse(text);
		} catch {
			return null;
		}
	}

	function cubicBezierPoint(p0, p1, p2, p3, t) {
		const inv = 1 - t;
		const inv2 = inv * inv;
		const t2 = t * t;

		return {
			x: inv2 * inv * p0.x + 3 * inv2 * t * p1.x + 3 * inv * t2 * p2.x + t2 * t * p3.x,
			y: inv2 * inv * p0.y + 3 * inv2 * t * p1.y + 3 * inv * t2 * p2.y + t2 * t * p3.y
		};
	}

	function splinePathToPolylinePoints(path, sampleCount = 12) {
		const segments = (Array.isArray(path) ? path : []).filter((entry) => entry?.point);
		if (segments.length < 2) {
			return [];
		}

		const samples = Math.max(2, Math.min(48, Number(sampleCount) || 12));
		const points = [{ ...segments[0].point }];

		for (let i = 1; i < segments.length; i += 1) {
			const from = segments[i - 1];
			const to = segments[i];
			const p0 = from.point;
			const p1 = from.front ?? from.point;
			const p2 = to.back ?? to.point;
			const p3 = to.point;

			if (!from.front && !to.back) {
				points.push({ ...p3 });
				continue;
			}

			for (let step = 1; step <= samples; step += 1) {
				points.push(cubicBezierPoint(p0, p1, p2, p3, step / samples));
			}
		}

		return points.filter(
			(point, index, all) =>
				index === 0 || Math.hypot(point.x - all[index - 1].x, point.y - all[index - 1].y) > 0.01
		);
	}

	function getTransferContent(trans, type) {
		if ([...trans.types].includes(type)) {
			const orig = trans.getData(type);
			if (orig) {
				return orig;
			} else {
				const plain = trans.getData('text/plain');
				if (plain) {
					const parsed = safeJsonParse(plain);
					if (parsed?.mime === type) {
						return JSON.stringify(parsed.data);
					}
					return parsed?.[type];
				}
			}
		}

		return null;
	}
	function setTransferContent(trans, type, value) {
		trans.setData(type, value);
		trans.setData(
			'text/plain',
			JSON.stringify({
				[type]: value
			})
		);
	}

	function throttle(mainFunction, delay) {
		let timerFlag = null;

		return (...args) => {
			if (timerFlag === null) {
				mainFunction(...args);

				timerFlag = setTimeout(() => {
					timerFlag = null;
				}, delay);
			}
		};
	}

	function debounce(callback, delay) {
		let timer;

		return function (...args) {
			clearTimeout(timer);
			timer = setTimeout(() => {
				callback(...args);
			}, delay);
		};
	}

	let lastTargetLocationOpen = 0;

	function layerTargetUrl(layer) {
		const location = layer?.style?.target_location;
		if (!location) {
			return null;
		}

		try {
			const target = new URL(location, window.location.href);
			return target.protocol === 'http:' || target.protocol === 'https:' ? target.href : null;
		} catch {
			return null;
		}
	}

	function openLayerTargetLocation(layer) {
		const href = layerTargetUrl(layer);
		if (!href) {
			return false;
		}

		window.open(href, '_blank', 'noopener,noreferrer');
		lastTargetLocationOpen = performance.now();
		return true;
	}

	function openTargetLocation(evt, layer) {
		if (activeTool.value !== 'select') {
			return false;
		}

		if (!evt.ctrlKey) {
			return false;
		}

		const href = layerTargetUrl(layer);
		if (!href) {
			return false;
		}

		evt.preventDefault();
		evt.stopPropagation();

		// macOS dispatches a contextmenu event for control-clicks; avoid opening twice
		// when the same user gesture also produces a click event.
		const now = performance.now();
		if (now - lastTargetLocationOpen > 250) {
			window.open(href, '_blank', 'noopener,noreferrer');
			lastTargetLocationOpen = now;
		}

		return true;
	}

	function openTargetLocationOrDirectModification(evt, layer, cast) {
		if (openTargetLocation(evt, layer)) {
			return true;
		}

		if (activeTool.value !== 'select' || !layer?.id) {
			return false;
		}

		evt.preventDefault();
		evt.stopPropagation();
		publishSelection(cast, [layer.id]);
		return true;
	}

	function documentExportFileName(documentValue, extension) {
		const name = documentValue?.name?.trim() || 'Untitled';
		return `${name.replace(/[\\/:*?"<>|]+/g, '_')}.${extension}`;
	}

	function serializedDocumentSvg(documentValue) {
		const source = document.getElementById(`full-document-${data.document.id}`);

		if (!source) {
			throw new Error('Rendered drawing could not be found');
		}

		const bounds = expandBox(documentDisplayBox(documentValue, textBounds.value), 20);
		const rect = boxToRect(bounds);
		const xmlns = 'http://www.w3.org/2000/svg';
		const svg = document.createElementNS(xmlns, 'svg');
		svg.setAttribute('xmlns', xmlns);
		svg.setAttribute('viewBox', `${rect.x} ${rect.y} ${rect.width} ${rect.height}`);
		svg.setAttribute('width', String(Math.ceil(rect.width)));
		svg.setAttribute('height', String(Math.ceil(rect.height)));

		const background = document.createElementNS(xmlns, 'rect');
		background.setAttribute('x', String(rect.x));
		background.setAttribute('y', String(rect.y));
		background.setAttribute('width', String(rect.width));
		background.setAttribute('height', String(rect.height));
		background.setAttribute('fill', '#ffffff');
		svg.appendChild(background);
		svg.appendChild(source.cloneNode(true));

		return new XMLSerializer().serializeToString(svg);
	}

	function downloadSvgDrawing(documentValue) {
		try {
			const svg = serializedDocumentSvg(documentValue);
			downloadFile(
				new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }),
				documentExportFileName(documentValue, 'svg')
			);
		} catch (e) {
			queueError(e, 'SVG export failed');
		}
	}

	async function downloadPngDrawing(documentValue) {
		let url;

		try {
			const svg = serializedDocumentSvg(documentValue);
			const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
			url = URL.createObjectURL(blob);

			const img = new Image();
			img.decoding = 'async';
			img.src = url;
			await img.decode();

			const scale = Math.max(1, Math.ceil(window.devicePixelRatio || 1));
			const canvas = document.createElement('canvas');
			canvas.width = Math.max(1, Math.ceil(img.width * scale));
			canvas.height = Math.max(1, Math.ceil(img.height * scale));
			const ctx = canvas.getContext('2d');
			ctx.fillStyle = '#ffffff';
			ctx.fillRect(0, 0, canvas.width, canvas.height);
			ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

			const png = await new Promise((resolve, reject) => {
				canvas.toBlob((result) => {
					if (result) {
						resolve(result);
					} else {
						reject(new Error('PNG export failed'));
					}
				}, 'image/png');
			});
			downloadFile(png, documentExportFileName(documentValue, 'png'));
		} catch (e) {
			queueError(e, 'PNG export failed');
		} finally {
			if (url) {
				URL.revokeObjectURL(url);
			}
		}
	}

	const editorTools = [
		{
			name: 'Selection Tool',
			label: 'Select',
			id: 'select',
			icon: '<path d="M8 5 L8 27 L16 20 L22 30 L25 28 L19 18 L28 18 Z" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="miter" />'
		},
		{
			name: 'Magnifier Tool',
			label: 'Magnifier',
			id: 'magnifier',
			icon: '<circle cx="13" cy="13" r="7" fill="none" stroke="currentColor" stroke-width="2" /><path d="M18 18 L27 27" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="butt" />',
			reset: (cameraScroller, cameraFocus) => {
				cameraScroller.resetCamera();
			}
		},
		{
			name: 'Pan Tool',
			label: 'Pan',
			id: 'paner',
			icon: '<path d="M10 18 L7 15 L7 23 L15 23 L12 20 C17 19 21 16 24 11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="butt" stroke-linejoin="miter" />',
			reset: (cameraScroller, cameraFocus, extension) => {
				update(
					() => ({
						x: (extension.maxX + extension.minX) / 2,
						y: (extension.maxY + extension.minY) / 2
					}),
					view(L.props('x', 'y'), cameraFocus)
				);
			}
		},
		{
			name: 'Zoom Tool',
			label: 'Zoom',
			id: 'zoomer',
			icon: '<circle cx="13" cy="13" r="7" fill="none" stroke="currentColor" stroke-width="2" /><path d="M10 13 H16 M13 10 V16 M18 18 L27 27" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="butt" />',
			reset: (cameraScroller, cameraFocus) => {
				cameraScroller.resetCamera();
			}
		},
		{
			name: 'Rotation Tool',
			label: 'Rotate',
			id: 'rotator',
			icon: '<path d="M23 10 A9 9 0 1 0 25 18" fill="none" stroke="currentColor" stroke-width="2" /><path d="M23 4 V11 H30" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="miter" />',
			reset: (cameraScroller, cameraFocus, extension) => {
				update(
					() => ({
						x: (extension.maxX + extension.minX) / 2,
						y: (extension.maxY + extension.minY) / 2,
						w: 0
					}),
					view(L.props('x', 'y', 'w'), cameraFocus)
				);
			}
		},
		{
			name: 'Scribble Tool',
			label: 'Pen',
			id: 'pen',
			icon: '<path d="M5 24 C8 10 13 28 17 12 C20 2 25 18 28 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />'
		},
		{
			name: 'Polygon Tool',
			label: 'Polygon',
			id: 'polygon',
			icon: '<path d="M6 24 L13 7 L25 10 L28 23 L16 28 Z" fill="#f2df60" stroke="currentColor" stroke-width="2" stroke-linejoin="miter" />'
		},
		{
			name: 'Spline Tool',
			label: 'Spline',
			id: 'spline',
			icon: '<path d="M5 24 C10 6 20 28 27 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />'
		},
		{
			name: 'Spacer Tool',
			label: 'Spacer',
			id: 'spacer',
			icon: '<path d="M8 8 H24 M8 24 H24 M12 10 V22 M20 10 V22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="butt" />'
		}
	];
	const editorToolGroupDefinitions = [
		{
			name: 'Standard Tools',
			items: editorTools.filter(({ id }) =>
				['select', 'pen', 'polygon', 'spline', 'spacer'].includes(id)
			)
		},
		{
			name: 'Zoom Tools',
			items: editorTools.filter(({ id }) =>
				['magnifier', 'paner', 'zoomer', 'rotator'].includes(id)
			)
		}
	].map((group) => ({
		...group,
		items: group.items.map((tool) => ({ ...tool, kind: 'editor-tool' }))
	}));
	const activeTool = atom('select');
	let edgeToolPersistent = $state(false);
	const CREATE_TOOL_ID = 'create';
	const LAYER_PRIMITIVE_MIME_TYPE = 'application/json+renewex-layer';
	const BLUEPRINT_MIME_TYPE = 'application/json+renewex-blueprint';
	const CIRCLE_SHAPE_ID = '3B66E69A-057A-40B9-A1A0-9DB44EF5CE42';
	const drawingKinds = [
		'CH.ifa.draw.standard.StandardDrawing',
		'de.renew.hierarchicalworkflownets.gui.HNViewDrawing',
		'de.renew.gui.CPNDrawing',
		'de.renew.sdnet.gui.SDNDrawing',
		'de.renew.diagram.drawing.DiagramDrawing'
	];
	const PRIMITIVE_CREATION_DRAG_THRESHOLD = 4;
	const activeCreateTool = atom(undefined);
	const activeEdgeTool = atom(undefined);
	let primitiveCreation = atom(undefined);
	let linkedPrimitiveCreation = atom(undefined);
	let inlineTextEdit = atom(undefined);
	let suppressNextLinkedPrimitiveClick = $state(false);
	const selectionHandleDescriptors = [
		{ type: 'topLeft', dx: -1, dy: -1 },
		{ type: 'topCenter', dx: 0, dy: -1 },
		{ type: 'topRight', dx: 1, dy: -1 },
		{ type: 'middleLeft', dx: -1, dy: 0 },
		{ type: 'middleRight', dx: 1, dy: 0 },
		{ type: 'bottomLeft', dx: -1, dy: 1 },
		{ type: 'bottomCenter', dx: 0, dy: 1 },
		{ type: 'bottomRight', dx: 1, dy: 1 }
	];
	const textSelectionHandleTypes = new Set(['topLeft', 'topRight', 'bottomRight']);

	const cameraSettings = atom({
		plane: {
			autosize: true,
			x: window.innerWidth * 0.8,
			y: window.innerHeight * 0.8
		},
		frame: {
			aspect: 'meet',
			alignX: 'Mid',
			alignY: 'Mid',
			autoPadding: true,
			size: {
				x: 100,
				y: 100
			}
		}
	});

	const cameraFocus = atom({ x: 0, y: 0, z: 0, w: 0 });

	const camera = view(
		[
			L.pick({
				focus: 'focus',
				frame: ['settings', 'frame'],
				plane: ['settings', 'plane']
			})
		],
		combine({ focus: cameraFocus, settings: cameraSettings })
	);

	const boxPathLens = L.reread(
		({ minX, minY, width, height }) =>
			`M${numberSvgFormat.format(minX)},${numberSvgFormat.format(minY)}h${numberSvgFormat.format(width)}v${numberSvgFormat.format(height)}h${numberSvgFormat.format(-width)}z`
	);
	const frameBoxObject = read(frameBoxLens, camera);
	const frameBoxPath = read([frameBoxLens, 'screenSpaceAligned', boxPathLens], camera);

	const cameraRotationTransformLens = L.reread(
		(c) => `rotate(${c.focus.w}, ${c.focus.x}, ${c.focus.y})`
	);

	const cameraRotationInverseTransformLens = L.reread(
		(c) => `rotate(${-c.focus.w}, ${c.focus.x}, ${c.focus.y})`
	);

	const cameraScaleLens = L.reread((c) => Math.exp(-c.focus.z));
	const cameraScaleTransformLens = [cameraScaleLens, L.reread((s) => `scale(${s})`)];

	const scaleTransform = read(cameraScaleTransformLens, camera);
	const cameraScale = read(cameraScaleLens, camera);
	const rotationTransform = read(cameraRotationTransformLens, camera);
	const rotationInverseTransform = read(cameraRotationInverseTransformLens, camera);

	const cameraRotation = view('w', cameraFocus);
	const cameraZoom = view('z', cameraFocus);

	let errors = atom([]);
	function queueError(error, fallbackMessage) {
		errors.value = [...errors.value, describeError(error, fallbackMessage)];
	}

	let selectedLayers = atom([]);
	let areaSelection = atom(undefined);
	let areaSelectionDelay = undefined;
	const AREA_SELECTION_DELAY = 180;
	let layerClipboard = atom(null);
	let lastPasteLocation = atom(null);
	let groupDrag = atom(undefined);
	let groupDragDelta = view(
		[L.reread(({ bx, by, cx, cy }) => ({ x: cx - bx, y: cy - by })), L.valueOr({ x: 0, y: 0 })],
		groupDrag
	);
	let connectedEdgePreviewOverrides = atom(new Map());
	let committedEdgePreviewOverrides = atom(new Map());
	let edgeWaypointDrag = atom(undefined);
	let committedEdgeWaypointPreviews = atom(new Map());
	let edgeEndpointDrag = atom(undefined);
	let suppressNextEdgeWaypointClick = $state(false);
	const EDGE_WAYPOINT_DRAG_THRESHOLD = 3;
	const COMMITTED_EDGE_PREVIEW_HOLD_MS = 2500;
	const PETRISTATION_CLIPBOARD_FORMAT = 'petristation/layer-clipboard';
	const PETRISTATION_CLIPBOARD_STORAGE_KEY = 'petristation:layer-clipboard';
	const PETRISTATION_CLIPBOARD_RNW_STORAGE_KEY = 'petristation:layer-clipboard-rnw';
	const RECENT_DOCUMENTS_STORAGE_KEY = 'petristation:recent-documents';
	const RENEW_RNW_CLIPBOARD_FORMAT = 'renew/rnw';
	const CLIPBOARD_RNW_TEXT = globalThis.Symbol('clipboardRnwText');
	const SYSTEM_CLIPBOARD_WITHOUT_LAYERS = {};

	function uniqueLayerIds(ids) {
		return [...new Set(ids.filter((id) => typeof id === 'string' && id))];
	}

	function rememberPasteLocation(pos) {
		if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
			lastPasteLocation.value = { x: pos.x, y: pos.y };
		}
	}

	function rememberPointerPasteLocation(evt, liveLenses) {
		rememberPasteLocation(liveLenses.clientToCanvas(evt.clientX, evt.clientY));
	}

	function publishSelection(cast, ids) {
		const selection = uniqueLayerIds(ids);
		selectedLayers.value = selection;
		cast('select', selection);
		return selection;
	}

	function clearSelection(cast) {
		return publishSelection(cast, []);
	}

	function toggleLayerSelection(cast, id) {
		if (!id) {
			return selectedLayers.value;
		}

		const selected = new Set(selectedLayers.value);
		if (selected.has(id)) {
			selected.delete(id);
		} else {
			selected.add(id);
		}

		return publishSelection(cast, [...selected]);
	}

	function consumeSuppressedEdgeWaypointClick(evt, id = undefined) {
		if (suppressNextEdgeWaypointClick === true || (id && suppressNextEdgeWaypointClick === id)) {
			suppressNextEdgeWaypointClick = false;
			evt?.preventDefault?.();
			evt?.stopPropagation?.();
			return true;
		}

		return false;
	}

	function selectLayer(cast, id, evt) {
		if (!id) {
			return selectedLayers.value;
		}

		if (consumeSuppressedEdgeWaypointClick(evt, id)) {
			return selectedLayers.value;
		}

		return evt?.shiftKey ? toggleLayerSelection(cast, id) : publishSelection(cast, [id]);
	}

	function inspectLayer(evt, layer) {
		if (activeTool.value !== 'select' || !layer?.id) {
			return false;
		}

		evt.preventDefault();
		evt.stopPropagation();
		inspectedLayer.value = JSON.parse(JSON.stringify(layer));
		showInspect.value = true;
		return true;
	}

	function inspectedLayerJson() {
		return JSON.stringify(inspectedLayer.value ?? {}, null, 2);
	}

	function loadRecentDocuments() {
		try {
			const parsed = JSON.parse(localStorage.getItem(RECENT_DOCUMENTS_STORAGE_KEY) ?? '[]');
			return Array.isArray(parsed) ? parsed : [];
		} catch {
			return [];
		}
	}

	function rememberCurrentDocument() {
		const documentId = data.document.id;
		const entry = {
			id: documentId,
			name: data.document.content?.name ?? 'Untitled',
			href: resolve(`/documents/${documentId}/editor`),
			savedAt: Date.now()
		};
		const next = [entry, ...loadRecentDocuments().filter((recent) => recent?.id !== documentId)]
			.filter((recent) => recent?.id && recent?.href)
			.slice(0, 12);
		localStorage.setItem(RECENT_DOCUMENTS_STORAGE_KEY, JSON.stringify(next));
		recentDocuments.value = next;
	}

	function clearRecentDocuments() {
		localStorage.removeItem(RECENT_DOCUMENTS_STORAGE_KEY);
		recentDocuments.value = [];
	}

	function removeRecentDocument(documentId) {
		const next = loadRecentDocuments().filter((recent) => recent?.id !== documentId);
		localStorage.setItem(RECENT_DOCUMENTS_STORAGE_KEY, JSON.stringify(next));
		recentDocuments.value = next;
	}

	function documentTabs(documentValue = data.document.content) {
		const currentId = data.document.id;
		const current = {
			id: currentId,
			name: documentValue?.name ?? data.document.content?.name ?? 'Untitled',
			href: resolve(`/documents/${currentId}/editor`)
		};
		return [
			current,
			...recentDocuments.value.filter((recent) => recent?.id && recent.id !== currentId)
		].slice(0, 8);
	}

	function closeDocumentWindow(tab) {
		const tabs = documentTabs();
		if (!tab?.id) {
			return;
		}

		if (tab.id !== data.document.id) {
			removeRecentDocument(tab.id);
			return;
		}

		const next = tabs.find((candidate) => candidate.id !== tab.id);
		removeRecentDocument(tab.id);
		location.href = next?.href ?? resolve(`/projects/${data.document.links.project.id}/documents`);
	}

	function closeOtherDrawings() {
		const currentId = data.document.id;
		const next = loadRecentDocuments().filter((recent) => recent?.id === currentId);
		localStorage.setItem(RECENT_DOCUMENTS_STORAGE_KEY, JSON.stringify(next));
		recentDocuments.value = next;
	}

	const RENEW_TEXT_TYPE = {
		LABEL: 0,
		INSCRIPTION: 1,
		NAME: 2,
		AUX: 3,
		COMM: 4
	};

	const renewNodeFilterOptions = [
		{ label: 'All', filter: { kind: 'nodes', nodeType: 'all' } },
		{ label: 'Transitions', filter: { kind: 'nodes', nodeType: 'transitions' } },
		{ label: 'Places', filter: { kind: 'nodes', nodeType: 'places' } }
	];

	const renewTextParentFilterOptions = [
		{ label: 'All', parentType: 'all' },
		{ label: 'of Transitions', parentType: 'transitions' },
		{ label: 'of Places', parentType: 'places' },
		{ label: 'of Arcs', parentType: 'arcs' }
	];

	const renewNameParentFilterOptions = renewTextParentFilterOptions.filter(
		({ parentType }) => parentType !== 'arcs'
	);

	const renewSelectionMenuGroups = [
		{ label: 'Nodes', options: renewNodeFilterOptions },
		{ label: 'Arcs', filter: { kind: 'arcs' } },
		{ label: 'Nodes and Arcs', filter: { kind: 'nodes-and-arcs' } },
		{
			label: 'Text Children',
			options: renewTextParentFilterOptions.map(({ label, parentType }) => ({
				label,
				filter: { kind: 'text', textType: 'any', parentType }
			}))
		},
		{
			label: 'Inscriptions',
			options: renewTextParentFilterOptions.map(({ label, parentType }) => ({
				label,
				filter: { kind: 'text', textType: 'inscriptions', parentType }
			}))
		},
		{
			label: 'Names',
			options: renewNameParentFilterOptions.map(({ label, parentType }) => ({
				label,
				filter: { kind: 'text', textType: 'names', parentType }
			}))
		}
	];

	const renewSelectionOperations = [
		{ label: 'Select', operation: 'select' },
		{ label: 'Add To Selection', operation: 'add' },
		{ label: 'Remove From Selection', operation: 'remove' },
		{ label: 'Restrict Selection', operation: 'restrict' }
	];

	function layerMap(docValue) {
		return new Map((docValue?.layers?.items ?? []).map((layer) => [layer.id, layer]));
	}

	function visibleLayerIds(layersInOrderValue) {
		return layersInOrderValue.filter(({ hidden }) => !hidden).map(({ id }) => id);
	}

	function edgeHandleLayerIds(selectedIds) {
		const selected = new Set(selectedIds ?? []);
		return [...selected];
	}

	function isTransitionLayer(layer) {
		const tag = layer?.semantic_tag ?? '';
		return (
			tag === 'de.renew.gui.TransitionFigure' ||
			tag === 'de.renew.gui.VirtualTransitionFigure' ||
			tag.endsWith('.TransitionFigure') ||
			tag.endsWith('.VirtualTransitionFigure')
		);
	}

	function isVirtualTransitionLayer(layer) {
		const tag = layer?.semantic_tag ?? '';
		return (
			tag === 'de.renew.gui.VirtualTransitionFigure' || tag.endsWith('.VirtualTransitionFigure')
		);
	}

	function isPlaceLayer(layer) {
		const tag = layer?.semantic_tag ?? '';
		return (
			tag === 'de.renew.gui.PlaceFigure' ||
			tag === 'de.renew.gui.VirtualPlaceFigure' ||
			tag.endsWith('.PlaceFigure') ||
			tag.endsWith('.VirtualPlaceFigure')
		);
	}

	function isVirtualPlaceLayer(layer) {
		const tag = layer?.semantic_tag ?? '';
		return tag === 'de.renew.gui.VirtualPlaceFigure' || tag.endsWith('.VirtualPlaceFigure');
	}

	function isNodeLayer(layer) {
		return isTransitionLayer(layer) || isPlaceLayer(layer);
	}

	function isSequentialOnlyArcLayer(layer) {
		const tag = layer?.semantic_tag ?? '';
		return (
			tag === 'de.renew.gui.InhibitorConnection' ||
			tag === 'de.renew.gui.ClearConnection' ||
			tag === 'de.renew.gui.HollowDoubleArcConnection' ||
			tag.endsWith('.InhibitorConnection') ||
			tag.endsWith('.ClearConnection') ||
			tag.endsWith('.HollowDoubleArcConnection')
		);
	}

	function layerVisibleInDrawing(layer, hidden = false) {
		return !hidden && (showSequentialOnlyArcs.value || !isSequentialOnlyArcLayer(layer));
	}

	function syntaxEdgeSourceTags(syntax) {
		return new Set(
			[
				...Object.keys(syntax?.edgeWhitelist ?? {}),
				...Object.keys(syntax?.autoEdgeNode ?? {})
			].filter(Boolean)
		);
	}

	function syntaxEdgeKnownTags(syntax) {
		const tags = new Set(syntaxEdgeSourceTags(syntax));

		for (const targets of Object.values(syntax?.edgeWhitelist ?? {})) {
			for (const tag of targets ?? []) {
				if (tag) {
					tags.add(tag);
				}
			}
		}

		for (const target of Object.values(syntax?.autoEdgeNode ?? {})) {
			const tag = target?.target?.semantic_tag;
			if (tag) {
				tags.add(tag);
			}
		}

		return tags;
	}

	function syntaxEdgeRules(syntax, sourceSemanticTag) {
		const typedRules = syntax?.edgeRules?.[sourceSemanticTag];
		if (Array.isArray(typedRules)) {
			return typedRules;
		}

		return (syntax?.edgeWhitelist?.[sourceSemanticTag] ?? []).map((targetSemanticTag) => ({
			target_semantic_tag: targetSemanticTag
		}));
	}

	function syntaxEdgeSemanticTags(syntax) {
		const tags = new Set();

		for (const rules of Object.values(syntax?.edgeRules ?? {})) {
			for (const rule of rules ?? []) {
				if (rule?.edge_semantic_tag) {
					tags.add(rule.edge_semantic_tag);
				}
			}
		}

		for (const target of Object.values(syntax?.autoEdgeNode ?? {})) {
			const tag = target?.edge?.semantic_tag;
			if (tag) {
				tags.add(tag);
			}
		}

		return tags;
	}

	function edgeToolIgnoresNetSyntax(edgeSemanticTag) {
		return (
			edgeSemanticTag === 'CH.ifa.draw.figures.LineConnection' ||
			edgeSemanticTag === 'CH.ifa.draw.figures.ElbowConnection' ||
			edgeSemanticTag === 'CH.ifa.draw.figures.LineFigure' ||
			edgeSemanticTag === 'CH.ifa.draw.figures.PolyLineFigure'
		);
	}

	function isSyntaxEdgeSourceLayer(layer, syntax) {
		if (!layer?.semantic_tag) {
			return false;
		}

		const knownTags = syntaxEdgeKnownTags(syntax);
		const sourceTags = syntaxEdgeSourceTags(syntax);

		if (knownTags.size === 0) {
			return isNodeLayer(layer);
		}

		return !knownTags.has(layer.semantic_tag) || sourceTags.has(layer.semantic_tag);
	}

	function syntaxEdgeSourceLayerIds(docValue, layerIds, syntax) {
		const byId = layerMap(docValue);
		return uniqueLayerIds(layerIds.filter((id) => isSyntaxEdgeSourceLayer(byId.get(id), syntax)));
	}

	function syntaxAllowsEdge(syntax, source, target, edgeSemanticTag = undefined) {
		if (!source?.semantic_tag || !target?.semantic_tag) {
			return false;
		}

		const knownTags = syntaxEdgeKnownTags(syntax);
		if (knownTags.size === 0) {
			return true;
		}

		const sourceKnown = knownTags.has(source.semantic_tag);
		const targetKnown = knownTags.has(target.semantic_tag);
		if (!sourceKnown || !targetKnown) {
			return true;
		}

		const rules = syntaxEdgeRules(syntax, source.semantic_tag);
		const edgeTags = syntaxEdgeSemanticTags(syntax);

		if (edgeSemanticTag && !edgeTags.has(edgeSemanticTag)) {
			return edgeToolIgnoresNetSyntax(edgeSemanticTag);
		}

		return rules.some((rule) => {
			if (rule?.target_semantic_tag !== target.semantic_tag) {
				return false;
			}

			return (
				!edgeSemanticTag || !rule?.edge_semantic_tag || rule.edge_semantic_tag === edgeSemanticTag
			);
		});
	}

	function syntaxAutoEdgeNodeForSource(syntax, source, edgeSemanticTag = undefined) {
		const autoNodeType = syntax?.autoEdgeNode?.[source?.semantic_tag];
		const sourceSocketId = autoNodeType?.edge?.source?.socket_id;

		if (!autoNodeType || !sourceSocketId) {
			return null;
		}

		if (sourceSocketId !== source?.socket) {
			return null;
		}

		if (!syntaxEdgeSemanticTags(syntax).has(edgeSemanticTag ?? 'de.renew.gui.ArcConnection')) {
			return null;
		}

		return syntaxAllowsEdge(
			syntax,
			source,
			{ semantic_tag: autoNodeType.target.semantic_tag },
			edgeSemanticTag
		)
			? autoNodeType
			: null;
	}

	function isNetArcSemanticTag(tag) {
		return (
			tag === 'de.renew.gui.ArcConnection' ||
			tag === 'de.renew.gui.InhibitorConnection' ||
			tag === 'de.renew.gui.HollowDoubleArcConnection' ||
			tag.endsWith('.ArcConnection') ||
			tag.endsWith('.InhibitorConnection') ||
			tag.endsWith('.HollowDoubleArcConnection')
		);
	}

	function isArcLayer(layer) {
		const tag = layer?.semantic_tag ?? '';
		return !!layer?.edge && isNetArcSemanticTag(tag);
	}

	function matchesNodeType(layer, nodeType = 'all') {
		switch (nodeType) {
			case 'transitions':
				return isTransitionLayer(layer);
			case 'places':
				return isPlaceLayer(layer);
			default:
				return isNodeLayer(layer);
		}
	}

	function textTargetLayer(layer, byId) {
		const targetId = layer?.hyperlink ?? layer?.parent_id;
		return targetId ? byId.get(targetId) : null;
	}

	function matchesTextParentType(parent, parentType = 'all') {
		switch (parentType) {
			case 'transitions':
				return isTransitionLayer(parent);
			case 'places':
				return isPlaceLayer(parent);
			case 'arcs':
				return isArcLayer(parent);
			default:
				return !!parent;
		}
	}

	function renewTextType(layer) {
		const rawType = layer?.text?.renew_type;
		if (rawType === null || rawType === undefined || rawType === '') {
			return null;
		}

		const type = Number(rawType);
		return Number.isInteger(type) ? type : null;
	}

	function isCpnTextLayer(layer) {
		return layer?.semantic_tag === 'de.renew.gui.CPNTextFigure';
	}

	function validateEditedInscription(layer, docValue) {
		if (!isInscriptionLayer(layer)) {
			return;
		}

		const target = textTargetLayer(layer, layerMap(docValue));
		if (!target) {
			queueError({
				title: 'Syntax Error',
				message: 'Inscription is not connected to a net element.',
				detail:
					'Renew accepts inscriptions on places and arcs. Connect the inscription to a supported net element before simulating or exporting the drawing.'
			});
		} else if (!isQualifiedInscriptionTarget(target)) {
			queueError({
				title: 'Syntax Error',
				message: 'The connected figure cannot carry inscriptions.',
				detail:
					'Renew accepts inscriptions on places and arcs. Remove the inscription from this figure, or attach it to a supported net element.'
			});
		}
	}

	function matchesTextType(layer, textType = 'any') {
		const type = renewTextType(layer);

		switch (textType) {
			case 'names':
				return type === RENEW_TEXT_TYPE.NAME;
			case 'inscriptions':
				return (
					type === RENEW_TEXT_TYPE.INSCRIPTION ||
					type === RENEW_TEXT_TYPE.AUX ||
					(type === null && isCpnTextLayer(layer))
				);
			default:
				return true;
		}
	}

	function matchesRenewSelectionFilter(layer, filter, byId) {
		if (!layer || !filter) {
			return false;
		}

		switch (filter.kind) {
			case 'nodes':
				return matchesNodeType(layer, filter.nodeType);
			case 'arcs':
				return isArcLayer(layer);
			case 'nodes-and-arcs':
				return isNodeLayer(layer) || isArcLayer(layer);
			case 'text': {
				if (!layer.text) {
					return false;
				}

				const parent = textTargetLayer(layer, byId);
				return (
					matchesTextParentType(parent, filter.parentType) &&
					matchesTextType(layer, filter.textType)
				);
			}
			default:
				return false;
		}
	}

	function renewSelectionIds(docValue, layersInOrderValue, filter) {
		const byId = layerMap(docValue);
		return uniqueLayerIds(
			visibleLayerIds(layersInOrderValue).filter((id) =>
				matchesRenewSelectionFilter(byId.get(id), filter, byId)
			)
		);
	}

	function applyRenewSelection(cast, docValue, layersInOrderValue, filter, operation) {
		const ids = renewSelectionIds(docValue, layersInOrderValue, filter);
		const target = new Set(ids);
		const selected = new Set(selectedLayers.value);

		switch (operation) {
			case 'add':
				return publishSelection(cast, [...selected, ...ids]);
			case 'remove':
				return publishSelection(
					cast,
					selectedLayers.value.filter((id) => !target.has(id))
				);
			case 'restrict':
				return publishSelection(
					cast,
					selectedLayers.value.filter((id) => target.has(id))
				);
			default:
				return publishSelection(cast, ids);
		}
	}

	function selectAllLayers(cast, layersInOrderValue) {
		return publishSelection(cast, visibleLayerIds(layersInOrderValue));
	}

	function invertSelection(cast, layersInOrderValue) {
		const selected = new Set(selectedLayers.value);
		return publishSelection(
			cast,
			visibleLayerIds(layersInOrderValue).filter((id) => !selected.has(id))
		);
	}

	function searchableLayerText(layer) {
		return [layer?.text?.body, layer?.semantic_tag, layer?.id]
			.filter((value) => typeof value === 'string' && value.length > 0)
			.join('\n');
	}

	function normalizeSearchText(value) {
		const text = String(value ?? '');
		return searchCaseSensitive.value ? text : text.toLocaleLowerCase();
	}

	function searchLayerIds(docValue, layersInOrderValue) {
		const query = normalizeSearchText(searchQuery.value.trim());
		if (!query) {
			return [];
		}

		const byId = layerMap(docValue);
		return visibleLayerIds(layersInOrderValue).filter((id) =>
			normalizeSearchText(searchableLayerText(byId.get(id))).includes(query)
		);
	}

	function runSearch(cast, docValue, layersInOrderValue) {
		return publishSelection(cast, searchLayerIds(docValue, layersInOrderValue));
	}

	function escapeRegExp(value) {
		return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}

	function replaceSearchMatches(cast, docValue, layersInOrderValue) {
		const query = searchQuery.value;
		if (!query) {
			return;
		}

		const matchedIds = new Set(searchLayerIds(docValue, layersInOrderValue));
		const replaceInIds = selectedLayers.value.length
			? selectedLayers.value.filter((id) => matchedIds.has(id))
			: [...matchedIds];
		const byId = layerMap(docValue);
		const pattern = new RegExp(escapeRegExp(query), searchCaseSensitive.value ? 'g' : 'gi');

		for (const id of replaceInIds) {
			const layer = byId.get(id);
			if (!layer?.text?.body) {
				continue;
			}

			const body = String(layer.text.body);
			const nextBody = body.replace(pattern, searchReplacement.value);
			if (nextBody !== body) {
				cast('change_text_body', { layer_id: id, val: nextBody });
			}
		}
	}

	function mergeAreaSelection(cast, ids, add) {
		if (!add) {
			return publishSelection(cast, ids);
		}

		return publishSelection(cast, [...selectedLayers.value, ...ids]);
	}

	function deleteSelectedLayers(cast, layersInOrderValue) {
		const selected = new Set(selectedLayers.value);
		const layerIds = layersInOrderValue
			.filter(
				({ id, parents }) => selected.has(id) && !parents.some((parent) => selected.has(parent))
			)
			.map(({ id }) => id);
		const ids = uniqueLayerIds(layerIds);

		if (ids.length) {
			cast('delete_layer', { layer_ids: ids });
		}

		clearSelection(cast);
	}

	function clipboardHasLayers(clipboard) {
		return (clipboard?.layers ?? []).length > 0;
	}

	function looksLikeRenewRnw(text) {
		return typeof text === 'string' && /^\s*\d+\s+[\w.$]+Drawing\b/.test(text);
	}

	function renewRnwClipboard(text) {
		return {
			format: RENEW_RNW_CLIPBOARD_FORMAT,
			rnw: text
		};
	}

	function isRenewRnwClipboard(clipboard) {
		return clipboard?.format === RENEW_RNW_CLIPBOARD_FORMAT && looksLikeRenewRnw(clipboard.rnw);
	}

	function attachRnwClipboardText(clipboard, rnwText) {
		if (clipboardHasLayers(clipboard) && looksLikeRenewRnw(rnwText)) {
			Object.defineProperty(clipboard, CLIPBOARD_RNW_TEXT, {
				value: rnwText,
				configurable: true
			});
		}

		return clipboard;
	}

	function rnwClipboardText(clipboard) {
		return looksLikeRenewRnw(clipboard?.[CLIPBOARD_RNW_TEXT])
			? clipboard[CLIPBOARD_RNW_TEXT]
			: null;
	}

	function encodePetriStationClipboard(clipboard) {
		return JSON.stringify({
			format: PETRISTATION_CLIPBOARD_FORMAT,
			version: 1,
			clipboard
		});
	}

	function decodePetriStationClipboard(text) {
		if (!text) {
			return null;
		}

		try {
			const parsed = JSON.parse(text);

			if (
				parsed?.format === PETRISTATION_CLIPBOARD_FORMAT &&
				clipboardHasLayers(parsed.clipboard)
			) {
				return parsed.clipboard;
			}

			if (parsed?.format === 'renewex/layers' && clipboardHasLayers(parsed)) {
				return parsed;
			}
		} catch {
			return null;
		}

		return null;
	}

	function writeStoredClipboard(clipboard, rnwText = null) {
		try {
			localStorage.setItem(
				PETRISTATION_CLIPBOARD_STORAGE_KEY,
				encodePetriStationClipboard(clipboard)
			);

			if (looksLikeRenewRnw(rnwText)) {
				localStorage.setItem(PETRISTATION_CLIPBOARD_RNW_STORAGE_KEY, rnwText);
			} else {
				localStorage.removeItem(PETRISTATION_CLIPBOARD_RNW_STORAGE_KEY);
			}
		} catch {
			// Ignore storage failures; the in-page clipboard still works.
		}
	}

	function readStoredClipboard() {
		try {
			return decodePetriStationClipboard(localStorage.getItem(PETRISTATION_CLIPBOARD_STORAGE_KEY));
		} catch {
			return null;
		}
	}

	function readStoredClipboardRnwText() {
		try {
			const text = localStorage.getItem(PETRISTATION_CLIPBOARD_RNW_STORAGE_KEY);
			return looksLikeRenewRnw(text) ? text : null;
		} catch {
			return null;
		}
	}

	async function writeSystemClipboard(clipboard) {
		const rnwText = rnwClipboardText(clipboard);
		writeStoredClipboard(clipboard, rnwText);

		if (!navigator.clipboard?.writeText) {
			return false;
		}

		try {
			await navigator.clipboard.writeText(rnwText || encodePetriStationClipboard(clipboard));
			return true;
		} catch {
			return false;
		}
	}

	async function readSystemClipboard() {
		if (navigator.clipboard?.readText) {
			try {
				const text = await navigator.clipboard.readText();
				const clipboard = decodePetriStationClipboard(text);
				if (clipboard) {
					return clipboard;
				}

				if (looksLikeRenewRnw(text)) {
					if (text === readStoredClipboardRnwText()) {
						return readStoredClipboard() || renewRnwClipboard(text);
					}

					return renewRnwClipboard(text);
				}

				return SYSTEM_CLIPBOARD_WITHOUT_LAYERS;
			} catch {
				// Fall back to the shared same-origin clipboard below.
			}
		}

		return readStoredClipboard();
	}

	function selectInsertedLayers(cast, result) {
		if (result?.layer_ids?.length) {
			publishSelection(cast, result.layer_ids);
		}

		return result;
	}

	function pasteRenewRnwClipboard(dispatch, cast, position, rnwText) {
		const pastePosition = position ?? lastPasteLocation.value ?? { x: 0, y: 0 };

		return dispatch('insert_file', {
			content: rnwText,
			file_name: 'clipboard.rnw',
			x: pastePosition.x,
			y: pastePosition.y
		}).then((result) => selectInsertedLayers(cast, result));
	}

	function rememberLayerClipboard(clipboard) {
		if (clipboardHasLayers(clipboard)) {
			layerClipboard.value = clipboard;
			writeSystemClipboard(clipboard);
			return clipboard;
		}

		return null;
	}

	function clipboardOrigin(clipboard) {
		const origin = clipboard?.origin;
		if (origin && Number.isFinite(origin.x) && Number.isFinite(origin.y)) {
			return origin;
		}
		return { x: 0, y: 0 };
	}

	function fetchSelectedLayerClipboard(dispatch, layersInOrderValue) {
		const layerIds = selectedTopLevelLayerIds(layersInOrderValue);
		if (!layerIds.length) {
			return Promise.resolve(null);
		}

		return dispatch('copy_layers', { layer_ids: layerIds }).then((result) => {
			return clipboardHasLayers(result?.clipboard)
				? attachRnwClipboardText(result.clipboard, result.rnw)
				: null;
		});
	}

	function copySelectedLayers(dispatch, layersInOrderValue) {
		return fetchSelectedLayerClipboard(dispatch, layersInOrderValue).then(rememberLayerClipboard);
	}

	function cutSelectedLayers(dispatch, cast, layersInOrderValue) {
		return copySelectedLayers(dispatch, layersInOrderValue).then((clipboard) => {
			if (clipboard) {
				deleteSelectedLayers(cast, layersInOrderValue);
			}
			return clipboard;
		});
	}

	async function pasteLayerClipboard(
		dispatch,
		cast,
		position = null,
		clipboard = null,
		{ rememberClipboard = true } = {}
	) {
		clipboard = clipboardHasLayers(clipboard) ? clipboard : await readSystemClipboard();

		if (isRenewRnwClipboard(clipboard)) {
			return pasteRenewRnwClipboard(dispatch, cast, position, clipboard.rnw);
		}

		if (clipboard === SYSTEM_CLIPBOARD_WITHOUT_LAYERS) {
			clipboard = null;
		} else {
			clipboard = clipboard || layerClipboard.value;
		}

		if (!clipboardHasLayers(clipboard)) {
			return null;
		}

		if (rememberClipboard) {
			layerClipboard.value = clipboard;
		}

		const pastePosition = position ?? lastPasteLocation.value ?? clipboardOrigin(clipboard);

		return dispatch('paste_layers', {
			clipboard,
			position: pastePosition
		}).then((result) => selectInsertedLayers(cast, result));
	}

	function duplicateSelectedLayers(dispatch, cast, layersInOrderValue) {
		return fetchSelectedLayerClipboard(dispatch, layersInOrderValue).then((clipboard) => {
			if (!clipboard) {
				return null;
			}

			const origin = clipboardOrigin(clipboard);
			return pasteLayerClipboard(
				dispatch,
				cast,
				{ x: origin.x + 24, y: origin.y + 24 },
				clipboard,
				{ rememberClipboard: false }
			);
		});
	}

	let deleteShortcutContext = { dispatch: null, cast: null, doc: null, layersInOrder: null };

	// The live document atom, captured alongside the delete-shortcut context (both are
	// registered from the same editor element). Used for optimistic local updates that
	// don't have the atom passed in directly.
	let editorDocAtom = null;

	function setDeleteShortcutContext(context) {
		deleteShortcutContext = context ?? {
			dispatch: null,
			cast: null,
			doc: null,
			layersInOrder: null
		};
		editorDocAtom = deleteShortcutContext.doc ?? null;
	}

	function deleteShortcutContextAction(_node, context) {
		setDeleteShortcutContext(context);

		return {
			update: setDeleteShortcutContext,
			destroy() {
				if (
					deleteShortcutContext.cast === context?.cast &&
					deleteShortcutContext.dispatch === context?.dispatch &&
					deleteShortcutContext.doc === context?.doc &&
					deleteShortcutContext.layersInOrder === context?.layersInOrder
				) {
					setDeleteShortcutContext(null);
				}
			}
		};
	}

	function isEditableTarget(el) {
		return (
			el &&
			(el.tagName === 'INPUT' ||
				el.tagName === 'TEXTAREA' ||
				el.tagName === 'SELECT' ||
				el.isContentEditable)
		);
	}

	function handleDocumentDeleteKeydown(evt) {
		if (
			evt.defaultPrevented ||
			evt.ctrlKey ||
			evt.metaKey ||
			evt.altKey ||
			(evt.key !== 'Backspace' && evt.key !== 'Delete') ||
			isEditableTarget(evt.target) ||
			selectedLayers.value.length === 0 ||
			!deleteShortcutContext.cast ||
			!deleteShortcutContext.doc ||
			!deleteShortcutContext.layersInOrder
		) {
			return;
		}

		evt.preventDefault();
		deleteSelectedLayers(deleteShortcutContext.cast, deleteShortcutContext.layersInOrder.value);
	}

	function handleDocumentGroupKeydown(evt) {
		if (
			evt.defaultPrevented ||
			!evt.ctrlKey ||
			!evt.shiftKey ||
			evt.metaKey ||
			evt.altKey ||
			isEditableTarget(evt.target) ||
			selectedLayers.value.length === 0 ||
			!deleteShortcutContext.dispatch ||
			!deleteShortcutContext.cast ||
			!deleteShortcutContext.layersInOrder
		) {
			return false;
		}

		const key = evt.key?.toLocaleLowerCase();

		if (key === 'g') {
			evt.preventDefault();
			wrapSelectedLayersInGroup(
				deleteShortcutContext.dispatch,
				deleteShortcutContext.cast,
				deleteShortcutContext.layersInOrder.value
			);
			return true;
		}

		if (key === 'u') {
			evt.preventDefault();
			ungroupSelectedLayers(deleteShortcutContext.cast, deleteShortcutContext.layersInOrder.value);
			return true;
		}

		return false;
	}

	function handleDocumentMovementKeydown(evt) {
		if (
			evt.defaultPrevented ||
			evt.ctrlKey ||
			evt.metaKey ||
			evt.altKey ||
			isEditableTarget(evt.target) ||
			selectedLayers.value.length === 0 ||
			!deleteShortcutContext.cast ||
			!deleteShortcutContext.layersInOrder
		) {
			return false;
		}

		const deltas = {
			ArrowLeft: { x: -1, y: 0 },
			ArrowRight: { x: 1, y: 0 },
			ArrowUp: { x: 0, y: -1 },
			ArrowDown: { x: 0, y: 1 }
		};
		const delta = deltas[evt.key];
		if (!delta) {
			return false;
		}

		const step = evt.shiftKey ? 10 : 1;
		const moveDelta = { x: delta.x * step, y: delta.y * step };
		const layerIds = selectedTopLevelLayerIds(deleteShortcutContext.layersInOrder.value);
		if (!layerIds.length) {
			return false;
		}

		evt.preventDefault();
		moveLayersLocally(
			deleteShortcutContext.doc,
			layerIds,
			moveDelta,
			deleteShortcutContext.layersInOrder.value
		);
		commitLayerMove(layerIds, moveDelta, deleteShortcutContext.cast).catch(() => {});
		return true;
	}

	function selectedTopLevelLayerIds(layersInOrderValue, ids = selectedLayers.value) {
		const selected = new Set(ids);
		return layersInOrderValue
			.filter(
				({ id, parents }) => selected.has(id) && !parents.some((parent) => selected.has(parent))
			)
			.map(({ id }) => id);
	}

	function selectedLinkedLayerIds(docValue, ids = selectedLayers.value) {
		const selected = new Set(ids);
		return uniqueLayerIds(
			docValue.layers.items
				.filter((layer) => selected.has(layer.id) && layer.hyperlink)
				.map((layer) => layer.hyperlink)
		);
	}

	function dragLayerIdsFor(layerId, layersInOrderValue) {
		const selected = new Set(selectedLayers.value);
		const layerInfo = layersInOrderValue.find((layer) => layer.id === layerId);
		const selectedOrInSelectedGroup =
			selected.has(layerId) || layerInfo?.parents.some((parent) => selected.has(parent));

		if (selectedOrInSelectedGroup) {
			return selectedTopLevelLayerIds(layersInOrderValue);
		}

		return layerId ? [layerId] : [];
	}

	function isLayerInMovingSet(layerId, layersInOrderValue) {
		return isLayerInMovingSetFor(layerId, layersInOrderValue, groupDrag.value);
	}

	function isLayerInMovingSetFor(layerId, layersInOrderValue, dragState) {
		const moving = new Set(dragState?.previewLayerIds ?? dragState?.layerIds ?? []);
		if (!moving.size) {
			return false;
		}

		const layerInfo = layersInOrderValue.find((layer) => layer.id === layerId);
		return moving.has(layerId) || layerInfo?.parents?.some((parent) => moving.has(parent));
	}

	function samePosition(a, b) {
		return Math.abs(Number(a) - Number(b)) < 0.001;
	}

	function expectedLayerMove(layer, delta) {
		if (layer.box) {
			return {
				type: 'box',
				layer_id: layer.id,
				position_x: layer.box.position_x + delta.x,
				position_y: layer.box.position_y + delta.y
			};
		}

		if (layer.text) {
			return {
				type: 'text',
				layer_id: layer.id,
				position_x: layer.text.position_x + delta.x,
				position_y: layer.text.position_y + delta.y
			};
		}

		if (layer.edge) {
			return {
				type: 'edge',
				layer_id: layer.id,
				source_x: layer.edge.source_x + delta.x,
				source_y: layer.edge.source_y + delta.y,
				target_x: layer.edge.target_x + delta.x,
				target_y: layer.edge.target_y + delta.y,
				waypoints: (L.get(localProp('waypoints'), layer.edge) ?? layer.edge.waypoints ?? [])
					.filter((waypoint) => waypoint?.id)
					.map((waypoint) => ({
						id: waypoint.id,
						x: waypoint.x + delta.x,
						y: waypoint.y + delta.y
					}))
			};
		}

		return undefined;
	}

	function layerReachedExpectedMove(layer, expected) {
		if (!layer) {
			return false;
		}

		if (expected.type === 'box') {
			return (
				layer.box &&
				samePosition(layer.box.position_x, expected.position_x) &&
				samePosition(layer.box.position_y, expected.position_y)
			);
		}

		if (expected.type === 'text') {
			return (
				layer.text &&
				samePosition(layer.text.position_x, expected.position_x) &&
				samePosition(layer.text.position_y, expected.position_y)
			);
		}

		if (expected.type === 'edge') {
			if (
				!layer.edge ||
				!samePosition(layer.edge.source_x, expected.source_x) ||
				!samePosition(layer.edge.source_y, expected.source_y) ||
				!samePosition(layer.edge.target_x, expected.target_x) ||
				!samePosition(layer.edge.target_y, expected.target_y)
			) {
				return false;
			}

			const waypoints = new Map(
				(L.get(localProp('waypoints'), layer.edge) ?? layer.edge.waypoints ?? [])
					.filter((waypoint) => waypoint?.id)
					.map((waypoint) => [waypoint.id, waypoint])
			);

			return expected.waypoints.every((expectedWaypoint) => {
				const waypoint = waypoints.get(expectedWaypoint.id);
				return (
					waypoint &&
					samePosition(waypoint.x, expectedWaypoint.x) &&
					samePosition(waypoint.y, expectedWaypoint.y)
				);
			});
		}

		return false;
	}

	function clearCommittedLayerMove(docValue) {
		if (!groupDrag.value?.committing) {
			return;
		}

		const movedLayerIds = groupDrag.value.expectedLayers ?? [];
		if (movedLayerIds.length) {
			const layerById = new Map(docValue.layers.items.map((layer) => [layer.id, layer]));
			const allReachedExpectedMove = movedLayerIds.every((expected) =>
				layerReachedExpectedMove(layerById.get(expected.layer_id), expected)
			);

			if (!allReachedExpectedMove) {
				return;
			}
		}

		if (
			groupDrag.value.baseSnapshotId &&
			groupDrag.value.baseSnapshotId !== docValue.snapshot.current_id
		) {
			groupDrag.value = undefined;
		}
	}

	function layerMoveTransform(layerId, layersInOrderValue) {
		if (!isLayerInMovingSet(layerId, layersInOrderValue)) {
			return undefined;
		}

		const delta = groupDragDelta.value;
		return delta.x || delta.y ? `translate(${delta.x} ${delta.y})` : undefined;
	}

	function layerMoveDelta(
		layerId,
		layersInOrderValue,
		dragState = groupDrag.value,
		delta = groupDragDelta.value
	) {
		if (!isLayerInMovingSetFor(layerId, layersInOrderValue, dragState)) {
			return { x: 0, y: 0 };
		}

		return delta ?? { x: 0, y: 0 };
	}

	function movedSocketBox(box, layerId, layersInOrderValue, dragState, delta) {
		const moveDelta = layerMoveDelta(layerId, layersInOrderValue, dragState, delta);

		return {
			...box,
			x: box.x + moveDelta.x,
			y: box.y + moveDelta.y
		};
	}

	function documentSocketEntries(docValue, layersInOrderValue, socketSchemas, dragState, delta) {
		const byId = layerMap(docValue);

		return (layersInOrderValue ?? [])
			.filter(({ hidden }) => !hidden)
			.flatMap(({ id }) => {
				const layer = byId.get(id);
				const socketSchema = socketSchemas?.get?.(layer?.interface_id);

				if (!socketSchema) {
					return [];
				}

				return (socketSchema.sockets ?? [])
					.map((socket) => {
						if (!layer?.box) {
							return null;
						}

						const socketBox = movedSocketBox(
							{
								x: layer.box.position_x,
								y: layer.box.position_y,
								width: layer.box.width,
								height: layer.box.height,
								shape: layer.box.shape,
								semantic_tag: layer.semantic_tag
							},
							id,
							layersInOrderValue,
							dragState,
							delta
						);

						return {
							id: {
								socket: socket.id,
								layer: id,
								semantic_tag: layer.semantic_tag,
								stencil: socketSchema.stencil
							},
							socket_schema: socketSchema,
							x: buildCoord(socketBox, 'x', false, socket.x),
							y: buildCoord(socketBox, 'y', false, socket.y),
							box: socketBox
						};
					})
					.filter(Boolean);
			});
	}

	function nearestSocketAt(
		point,
		docValue,
		layersInOrderValue,
		socketSchemas,
		{ excludeLayerId = undefined, tolerance = 14 * cameraScale.value } = {}
	) {
		let nearest = undefined;

		for (const socket of documentSocketEntries(
			docValue,
			layersInOrderValue,
			socketSchemas,
			groupDrag.value,
			groupDragDelta.value
		)) {
			if (socket?.id?.layer === excludeLayerId) {
				continue;
			}

			const distance = Math.hypot(socket.x - point.x, socket.y - point.y);
			const hitsSocket = distance <= tolerance || pointInsideBox(point, socket.box, tolerance);

			if (hitsSocket && (!nearest || distance < nearest.distance)) {
				nearest = { socket, distance };
			}
		}

		return nearest?.socket;
	}

	function compatibleSocketAt(
		point,
		docValue,
		layersInOrderValue,
		socketSchemas,
		predicate,
		{ excludeLayerId = undefined, tolerance = 14 * cameraScale.value, allowNearby = true } = {}
	) {
		const containing = [];
		const nearby = [];

		for (const socket of documentSocketEntries(
			docValue,
			layersInOrderValue,
			socketSchemas,
			groupDrag.value,
			groupDragDelta.value
		)) {
			if (socket?.id?.layer === excludeLayerId || !predicate(socket)) {
				continue;
			}

			const distance = Math.hypot(socket.x - point.x, socket.y - point.y);
			if (pointInsideSocket(point, socket, 0)) {
				containing.push({ socket, distance });
			} else if (allowNearby && pointInsideSocket(point, socket, tolerance)) {
				nearby.push({ socket, distance });
			}
		}

		return [...containing, ...nearby].sort((a, b) => a.distance - b.distance)[0]?.socket;
	}

	function endpointBond(edge, endpoint) {
		return endpoint === 'source' ? edge?.source_bond : edge?.target_bond;
	}

	function oppositeEndpointBond(edge, endpoint) {
		return endpoint === 'source' ? edge?.target_bond : edge?.source_bond;
	}

	function isFreePointEdge(layer) {
		const tag = layer?.semantic_tag ?? '';
		return (
			layer?.edge &&
			(tag.includes('PolyLineFigure') ||
				tag.includes('PolygonFigure') ||
				layer.edge.cyclic === true ||
				(!layer.edge.source_bond && !layer.edge.target_bond && tag.includes('LineFigure')))
		);
	}

	function isPolygonLayer(layer) {
		const tag = layer?.semantic_tag ?? '';
		return !!layer?.edge && (tag.includes('PolygonFigure') || layer.edge.cyclic === true);
	}

	function polygonEditablePoints(edge) {
		const waypoints = L.get(localProp('waypoints'), edge) ?? edge?.waypoints ?? [];
		return [
			{ key: 'source', kind: 'source', x: edge?.source_x, y: edge?.source_y },
			...waypoints.map((waypoint, index) => ({
				...waypoint,
				key: `waypoint:${index}`,
				kind: 'waypoint',
				index,
				x: waypoint?.x,
				y: waypoint?.y
			})),
			{ key: 'target', kind: 'target', x: edge?.target_x, y: edge?.target_y }
		].filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y));
	}

	function polygonPointCenter(points) {
		const center = points.reduce(
			(acc, point) => ({
				x: acc.x + point.x / points.length,
				y: acc.y + point.y / points.length
			}),
			{ x: 0, y: 0 }
		);

		return {
			x: Math.trunc(center.x),
			y: Math.trunc(center.y)
		};
	}

	function polygonIntegerPoint(point) {
		return {
			x: Math.trunc(point.x + 0.5),
			y: Math.trunc(point.y + 0.5)
		};
	}

	function polygonScaleHandlePosition(edge, handleSize) {
		const points = polygonEditablePoints(edge);
		if (points.length < 3) {
			return undefined;
		}

		const center = polygonPointCenter(points);
		const outer = points.reduce((current, point) => {
			if (!current) {
				return point;
			}
			const currentDistance = Math.hypot(current.x - center.x, current.y - center.y);
			const pointDistance = Math.hypot(point.x - center.x, point.y - center.y);
			return pointDistance > currentDistance ? point : current;
		}, undefined);

		if (!outer) {
			return undefined;
		}

		const distance = Math.hypot(outer.x - center.x, outer.y - center.y);
		if (!distance) {
			return {
				x: Math.trunc(outer.x - handleSize / 2),
				y: Math.trunc(outer.y + handleSize / 2)
			};
		}

		const inset = handleSize / distance;
		if (inset > 1) {
			return {
				x: Math.trunc((outer.x * 3 + center.x) / 4),
				y: Math.trunc((outer.y * 3 + center.y) / 4)
			};
		}

		return {
			x: Math.trunc(outer.x * (1 - inset) + center.x * inset),
			y: Math.trunc(outer.y * (1 - inset) + center.y * inset)
		};
	}

	function polygonScaledPoints(drag, pointer, evt) {
		const anchorLength = Math.hypot(drag.anchor.x - drag.center.x, drag.anchor.y - drag.center.y);
		if (!anchorLength) {
			return drag.points;
		}

		let scale = Math.hypot(pointer.x - drag.center.x, pointer.y - drag.center.y) / anchorLength;
		let rotation =
			Math.atan2(pointer.y - drag.center.y, pointer.x - drag.center.x) -
			Math.atan2(drag.anchor.y - drag.center.y, drag.anchor.x - drag.center.x);

		if (evt?.ctrlKey) {
			rotation = 0;
		} else if (evt?.shiftKey) {
			scale = 1;
		}

		return drag.points.map((point) => {
			const length = Math.hypot(point.x - drag.center.x, point.y - drag.center.y) * scale;
			const angle = Math.atan2(point.y - drag.center.y, point.x - drag.center.x) + rotation;
			return {
				...point,
				x: Math.trunc(drag.center.x + length * Math.cos(angle) + 0.5),
				y: Math.trunc(drag.center.y + length * Math.sin(angle) + 0.5)
			};
		});
	}

	function polygonScaleHandleDisplayPosition(layerId, fallback) {
		const drag = polygonScaleDrag.value;
		return drag?.layerId === layerId && drag.currentHandle ? drag.currentHandle : fallback;
	}

	function polygonEdgeWithPoints(edge, points, startWaypoints) {
		const byKey = new Map(points.map((point) => [point.key, point]));
		const source = byKey.get('source');
		const target = byKey.get('target');

		return {
			...edge,
			source_x: source?.x ?? edge.source_x,
			source_y: source?.y ?? edge.source_y,
			target_x: target?.x ?? edge.target_x,
			target_y: target?.y ?? edge.target_y,
			waypoints: startWaypoints.map((waypoint, index) => {
				const point = byKey.get(`waypoint:${index}`);
				return point ? { ...waypoint, x: point.x, y: point.y } : waypoint;
			})
		};
	}

	function setPolygonScalePreview(layerId, edge) {
		polygonScalePreviewEdges.value = new Map(polygonScalePreviewEdges.value).set(layerId, edge);
	}

	function clearPolygonScalePreview(layerId) {
		const previews = new Map(polygonScalePreviewEdges.value);
		previews.delete(layerId);
		polygonScalePreviewEdges.value = previews;
	}

	function applyPolygonScalePreview(drag, points) {
		setPolygonScalePreview(
			drag.layerId,
			polygonEdgeWithPoints(drag.startEdge, points, drag.startWaypoints)
		);
	}

	function resetPolygonScalePreview(drag) {
		clearPolygonScalePreview(drag.layerId);
	}

	function beginPolygonScaleHandle(
		evt,
		liveLenses,
		layer,
		edge,
		handlePos,
		layersInOrderValue,
		docValue
	) {
		if (beginSelectionMoveFromHandle(evt, liveLenses, layer.id, layersInOrderValue, docValue)) {
			return true;
		}

		if (!evt.isPrimary || !E.isLeftButton(evt) || !handlePos) {
			return false;
		}

		const startWaypoints = copyEdgeWaypoints(edge?.waypoints);
		const startEdge = { ...edge, waypoints: startWaypoints };
		const points = polygonEditablePoints(startEdge);
		if (points.length < 3) {
			return false;
		}

		evt.preventDefault();
		evt.stopPropagation();
		evt.currentTarget.focus({ preventScroll: true });
		evt.currentTarget.setPointerCapture(evt.pointerId);
		evt.currentTarget.currentPointerId = evt.pointerId;

		polygonScaleDrag.value = {
			pointerId: evt.pointerId,
			layerId: layer.id,
			anchor: handlePos,
			currentHandle: handlePos,
			center: polygonPointCenter(points),
			points,
			startEdge,
			startWaypoints,
			pointerOffset: Geo.diff2d(handlePos, liveLenses.clientToCanvas(evt.clientX, evt.clientY))
		};

		return true;
	}

	function updatePolygonScaleHandle(evt, liveLenses) {
		const drag = polygonScaleDrag.value;
		if (!drag || drag.pointerId !== evt.pointerId) {
			return false;
		}

		evt.preventDefault();
		evt.stopPropagation();
		const pointer = polygonIntegerPoint(
			Geo.translate(drag.pointerOffset, liveLenses.clientToCanvas(evt.clientX, evt.clientY))
		);
		polygonScaleDrag.value = { ...drag, currentHandle: pointer };
		applyPolygonScalePreview(drag, polygonScaledPoints(drag, pointer, evt));
		return true;
	}

	function finishPolygonScaleHandle(evt, dispatch, liveLenses) {
		const drag = polygonScaleDrag.value;
		if (!drag || drag.pointerId !== evt.pointerId) {
			return false;
		}

		evt.preventDefault();
		evt.stopPropagation();
		const pointer = polygonIntegerPoint(
			Geo.translate(drag.pointerOffset, liveLenses.clientToCanvas(evt.clientX, evt.clientY))
		);
		polygonScaleDrag.value = { ...drag, currentHandle: pointer };
		const points = polygonScaledPoints(drag, pointer, evt);
		applyPolygonScalePreview(drag, points);

		const byKey = new Map(points.map((point) => [point.key, point]));
		const source = byKey.get('source');
		const target = byKey.get('target');
		const waypointUpdates = drag.startWaypoints
			.map((waypoint, index) => {
				const point = byKey.get(`waypoint:${index}`);
				return waypoint?.id && point ? { waypoint, point } : undefined;
			})
			.filter(Boolean);

		Promise.resolve(
			dispatch('update_edge_points', {
				layer_id: drag.layerId,
				value: {
					source_x: source.x,
					source_y: source.y,
					target_x: target.x,
					target_y: target.y
				},
				waypoints: waypointUpdates.map(({ waypoint, point }) => ({
					id: waypoint.id,
					x: point.x,
					y: point.y
				}))
			})
		)
			.then(() => {
				setTimeout(() => {
					clearPolygonScalePreview(drag.layerId);
				}, 100);
			})
			.catch((error) => {
				clearPolygonScalePreview(drag.layerId);
				queueError(error, 'Polygon could not be scaled');
			});

		polygonScaleDrag.value = undefined;
		return true;
	}

	function cancelPolygonScaleHandle(evt) {
		const drag = polygonScaleDrag.value;
		if (!drag || (evt.pointerId !== undefined && drag.pointerId !== evt.pointerId)) {
			return false;
		}

		resetPolygonScalePreview(drag);
		polygonScaleDrag.value = undefined;
		return true;
	}

	function edgeEndpointCanReconnect(edgeLayer, endpoint, socket, docValue, syntax) {
		if (!edgeLayer?.edge || !socket?.id?.layer || !socket?.id?.socket) {
			return false;
		}

		const byId = layerMap(docValue);
		const candidateLayer = byId.get(socket.id.layer);
		const oppositeLayer = byId.get(edgeBondLayerId(oppositeEndpointBond(edgeLayer.edge, endpoint)));

		if (!candidateLayer) {
			return false;
		}

		if (!oppositeLayer) {
			return true;
		}

		const sourceLayer = endpoint === 'source' ? candidateLayer : oppositeLayer;
		const targetLayer = endpoint === 'source' ? oppositeLayer : candidateLayer;

		return syntaxAllowsEdge(syntax, sourceLayer, targetLayer, edgeLayer?.semantic_tag);
	}

	function reconnectOrMoveEdgeEndpoint({
		layer,
		endpoint,
		position,
		originalPosition,
		socketSchemas,
		syntax,
		dispatch,
		cast,
		docValue,
		layersInOrderValue,
		socketPosition = position
	}) {
		const edge = layer?.edge;
		const edgeId = edge?.id ?? layer?.id;
		const oldBond = endpointBond(edge, endpoint);
		const oldPoint = originalPosition ?? edgeEndpointPoint(edge, endpoint);
		const socket = compatibleSocketAt(
			socketPosition,
			docValue,
			layersInOrderValue,
			socketSchemas,
			(candidate) => edgeEndpointCanReconnect(layer, endpoint, candidate, docValue, syntax),
			{ excludeLayerId: layer?.id, allowNearby: false }
		);
		const positionValue = edgeEndpointPositionValue(endpoint, position);

		if (socket && edgeId) {
			const sameBond =
				edgeBondLayerId(oldBond) === socket.id.layer &&
				edgeBondSocketId(oldBond) === socket.id.socket;

			if (sameBond) {
				return Promise.resolve(edgeEndpointPositionValue(endpoint, oldPoint));
			}

			return dispatch('create_bond', {
				edge_id: edgeId,
				kind: endpoint,
				layer_id: socket.id.layer,
				socket_id: socket.id.socket
			});
		}

		if (hasEndpointBond(oldBond)) {
			return Promise.resolve(edgeEndpointPositionValue(endpoint, oldPoint));
		}

		if (isFreePointEdge(layer)) {
			return dispatch('update_edge_position', {
				layer_id: layer.id,
				value: positionValue
			});
		}

		return Promise.resolve().then(() =>
			dispatch('update_edge_position', {
				layer_id: layer.id,
				value: positionValue
			})
		);
	}

	function hasMoveDelta(delta) {
		return !!delta && (!!delta.x || !!delta.y);
	}

	function subtractDelta(delta, base) {
		return {
			x: (delta?.x ?? 0) - (base?.x ?? 0),
			y: (delta?.y ?? 0) - (base?.y ?? 0)
		};
	}

	function sameDelta(a, b) {
		return (a?.x ?? 0) === (b?.x ?? 0) && (a?.y ?? 0) === (b?.y ?? 0);
	}

	function edgeBondLayerId(bond) {
		return (
			bond?.layer_id ??
			bond?.layerId ??
			bond?.layer?.id ??
			bond?.source_layer_id ??
			bond?.target_layer_id ??
			undefined
		);
	}

	function edgeBondSocketId(bond) {
		return bond?.socket_id ?? bond?.socketId ?? bond?.socket?.id ?? undefined;
	}

	function hasEndpointBond(bond) {
		return !!(bond?.id ?? edgeBondLayerId(bond) ?? edgeBondSocketId(bond));
	}

	function edgeEndpointPoint(edge, endpoint) {
		return endpoint === 'source'
			? { x: edge?.source_x, y: edge?.source_y }
			: { x: edge?.target_x, y: edge?.target_y };
	}

	function edgeEndpointPositionValue(endpoint, point) {
		return endpoint === 'source'
			? { source_x: point?.x, source_y: point?.y }
			: { target_x: point?.x, target_y: point?.y };
	}

	function edgeEndpointPreviewPoint(edge, endpoint) {
		if (!edge) {
			return undefined;
		}

		const x = endpoint === 'source' ? edge.source_x : edge.target_x;
		const y = endpoint === 'source' ? edge.source_y : edge.target_y;

		return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined;
	}

	function edgeEndpointHandlePoint(layerId, endpoint, lensPoint, previewEdge) {
		const previewPoint = edgeEndpointPreviewPoint(previewEdge, endpoint);
		const drag = edgeEndpointDrag.value;

		if (drag?.layerId === layerId && drag?.endpoint === endpoint) {
			return lensPoint ?? previewPoint;
		}

		if (committedEdgePreviewOverrides.value.has(layerId)) {
			return previewPoint ?? lensPoint;
		}

		return lensPoint ?? previewPoint;
	}

	function previewEdgeEndpointDrag({
		layer,
		endpoint,
		currentPosition,
		pointerPosition = currentPosition,
		originalPosition = undefined,
		socketSchemas,
		syntax,
		docValue,
		layersInOrderValue
	}) {
		const edge = layer?.edge;
		const oldPoint = originalPosition ?? edgeEndpointPoint(edge, endpoint) ?? currentPosition;

		if (!hasEndpointBond(endpointBond(edge, endpoint))) {
			return currentPosition;
		}

		if (!socketSchemas || !syntax || !docValue || !layersInOrderValue) {
			return currentPosition;
		}

		const socket = compatibleSocketAt(
			pointerPosition,
			docValue,
			layersInOrderValue,
			socketSchemas,
			(candidate) => edgeEndpointCanReconnect(layer, endpoint, candidate, docValue, syntax),
			{ excludeLayerId: layer?.id, allowNearby: false }
		);

		if (!socket) {
			return currentPosition;
		}

		const socketPoint = socket.box
			? edgeBoxCenter(socket.box)
			: Number.isFinite(socket.x) && Number.isFinite(socket.y)
				? { x: socket.x, y: socket.y }
				: undefined;

		return (
			socketPoint ??
			(Number.isFinite(socket.x) && Number.isFinite(socket.y)
				? { x: socket.x, y: socket.y }
				: oldPoint)
		);
	}

	function edgeEndpointDragPreview({
		layer,
		endpoint,
		dragPosition,
		pointerPosition,
		originalPosition,
		socketSchemas,
		syntax,
		docValue,
		layersInOrderValue
	}) {
		const edge = layer?.edge;
		const oldPoint = originalPosition ?? edgeEndpointPoint(edge, endpoint) ?? dragPosition;

		if (!hasEndpointBond(endpointBond(edge, endpoint))) {
			return { position: dragPosition, socket: undefined };
		}

		if (!socketSchemas || !syntax || !docValue || !layersInOrderValue) {
			return { position: dragPosition, socket: undefined };
		}

		const socket = compatibleSocketAt(
			pointerPosition,
			docValue,
			layersInOrderValue,
			socketSchemas,
			(candidate) => edgeEndpointCanReconnect(layer, endpoint, candidate, docValue, syntax),
			{
				excludeLayerId: layer?.id,
				allowNearby: false
			}
		);

		if (!socket) {
			return { position: dragPosition, socket: undefined };
		}

		const position =
			(socket.box ? edgeBoxCenter(socket.box) : undefined) ??
			(Number.isFinite(socket.x) && Number.isFinite(socket.y)
				? { x: socket.x, y: socket.y }
				: oldPoint);

		return { position, socket };
	}

	function beginEdgeEndpointHandle(evt, liveLenses, positionLens, layer, endpoint) {
		if (!evt.isPrimary || !E.isLeftButton(evt) || !layer?.edge) {
			return false;
		}

		const originalPosition = positionLens.value ?? edgeEndpointPoint(layer.edge, endpoint);
		if (!Number.isFinite(originalPosition?.x) || !Number.isFinite(originalPosition?.y)) {
			return false;
		}

		evt.preventDefault();
		evt.stopPropagation();
		evt.currentTarget.focus({ preventScroll: true });
		evt.currentTarget.setPointerCapture(evt.pointerId);
		evt.currentTarget.currentPointerId = evt.pointerId;

		edgeEndpointDrag.value = {
			pointerId: evt.pointerId,
			layerId: layer.id,
			endpoint,
			originalPosition,
			currentPosition: originalPosition,
			pointerOffset: Geo.diff2d(
				originalPosition,
				liveLenses.clientToCanvas(evt.clientX, evt.clientY)
			)
		};

		return true;
	}

	function updateEdgeEndpointHandle(
		evt,
		liveLenses,
		positionLens,
		layer,
		endpoint,
		socketSchemas,
		syntax,
		docValue,
		layersInOrderValue
	) {
		const drag = edgeEndpointDrag.value;
		if (
			!drag ||
			drag.pointerId !== evt.pointerId ||
			drag.layerId !== layer?.id ||
			drag.endpoint !== endpoint
		) {
			return false;
		}

		evt.preventDefault();
		evt.stopPropagation();

		const pointerPosition = liveLenses.clientToCanvas(evt.clientX, evt.clientY);
		const dragPosition = Geo.translate(drag.pointerOffset, pointerPosition);
		const preview = edgeEndpointDragPreview({
			layer,
			endpoint,
			dragPosition,
			pointerPosition,
			originalPosition: drag.originalPosition,
			socketSchemas,
			syntax,
			docValue,
			layersInOrderValue
		});

		positionLens.value = preview.position;
		edgeEndpointDrag.value = {
			...drag,
			currentPosition: preview.position,
			pointerPosition,
			dragPosition,
			candidateSocket: preview.socket
		};

		return true;
	}

	function prepareEdgeEndpointFinish(evt) {
		const drag = edgeEndpointDrag.value;
		if (!drag || drag.pointerId !== evt.pointerId) {
			return false;
		}

		edgeEndpointDrag.value = { ...drag, finishing: true };
		return true;
	}

	function finishEdgeEndpointHandle(
		evt,
		liveLenses,
		positionLens,
		layer,
		endpoint,
		socketSchemas,
		syntax,
		docValue,
		layersInOrderValue,
		docAtom,
		dispatch,
		cast
	) {
		const drag = edgeEndpointDrag.value;
		if (
			!drag ||
			drag.pointerId !== evt.pointerId ||
			drag.layerId !== layer?.id ||
			drag.endpoint !== endpoint
		) {
			return false;
		}

		evt.preventDefault();
		evt.stopPropagation();

		const pointerPosition = liveLenses.clientToCanvas(evt.clientX, evt.clientY);
		const dragPosition = Geo.translate(drag.pointerOffset, pointerPosition);
		const preview = edgeEndpointDragPreview({
			layer,
			endpoint,
			dragPosition,
			pointerPosition,
			originalPosition: drag.originalPosition,
			socketSchemas,
			syntax,
			docValue,
			layersInOrderValue
		});

		positionLens.value = preview.position;
		const initialPreviewEdge = {
			...layer.edge,
			...edgeEndpointPositionValue(endpoint, preview.position)
		};
		const previousEdge = documentEdgeByLayerId(docAtom?.value, layer.id);
		setCommittedEdgePreview(layer.id, initialPreviewEdge);
		patchDocumentEdge(docAtom, layer.id, initialPreviewEdge);

		Promise.resolve(
			reconnectOrMoveEdgeEndpoint({
				layer,
				endpoint,
				position: dragPosition,
				socketPosition: pointerPosition,
				originalPosition: drag.originalPosition,
				socketSchemas,
				syntax,
				dispatch,
				cast,
				docValue,
				layersInOrderValue
			})
		)
			.then((result) => {
				const xKey = endpoint === 'source' ? 'source_x' : 'target_x';
				const yKey = endpoint === 'source' ? 'source_y' : 'target_y';
				let committedPreviewEdge = initialPreviewEdge;
				if (result?.[xKey] !== undefined) {
					const resultPoint = { x: result[xKey], y: result[yKey] };
					positionLens.value = resultPoint;
					committedPreviewEdge = {
						...layer.edge,
						...edgeEndpointPositionValue(endpoint, resultPoint)
					};
					setCommittedEdgePreview(layer.id, committedPreviewEdge);
					patchDocumentEdge(docAtom, layer.id, committedPreviewEdge);
				}
				clearCommittedEdgePreviewAfterSync(layer.id, committedPreviewEdge, docAtom);
			})
			.catch((error) => {
				positionLens.value = drag.originalPosition;
				patchDocumentEdge(docAtom, layer.id, previousEdge);
				clearCommittedEdgePreview(layer.id);
				queueError(error, 'Edge endpoint could not be changed');
			})
			.finally(() => {
				edgeEndpointDrag.value = undefined;
				backoffValue.value = undefined;
				if (evt.currentTarget.hasPointerCapture(evt.pointerId)) {
					evt.currentTarget.releasePointerCapture(evt.pointerId);
				}
				evt.currentTarget.blur?.();
			});

		return true;
	}

	function cancelEdgeEndpointHandle(evt, positionLens) {
		const pointerId = eventPointerId(evt);
		const drag = edgeEndpointDrag.value;
		if (!drag || (pointerId !== undefined && drag.pointerId !== pointerId)) {
			return false;
		}
		if (drag.finishing) {
			return false;
		}

		evt?.stopPropagation?.();
		evt?.preventDefault?.();
		positionLens.value = drag.originalPosition;
		edgeEndpointDrag.value = undefined;
		backoffValue.value = undefined;
		if (evt?.currentTarget?.hasPointerCapture?.(drag.pointerId)) {
			evt.currentTarget.releasePointerCapture(drag.pointerId);
		}
		return true;
	}

	function pointInsideBox(point, box, tolerance = 0) {
		return (
			point &&
			box &&
			Number.isFinite(point.x) &&
			Number.isFinite(point.y) &&
			point.x >= box.x - tolerance &&
			point.x <= box.x + box.width + tolerance &&
			point.y >= box.y - tolerance &&
			point.y <= box.y + box.height + tolerance
		);
	}

	function pointInsideSocket(point, socket, tolerance = 0) {
		if (!point || !socket) {
			return false;
		}

		const box = socket.box;
		if (!box) {
			return (
				Number.isFinite(socket.x) &&
				Number.isFinite(socket.y) &&
				Math.hypot(socket.x - point.x, socket.y - point.y) <= tolerance
			);
		}

		if (edgeBoxStencil(box) !== 'ellipse') {
			return pointInsideBox(point, box, tolerance);
		}

		const rx = box.width / 2 + tolerance;
		const ry = box.height / 2 + tolerance;
		if (rx <= 0 || ry <= 0) {
			return pointInsideBox(point, box, tolerance);
		}

		const center = edgeBoxCenter(box);
		const nx = (point.x - center.x) / rx;
		const ny = (point.y - center.y) / ry;
		return nx * nx + ny * ny <= 1;
	}

	function layerEndpointBox(layer) {
		return layer?.box
			? {
					x: layer.box.position_x,
					y: layer.box.position_y,
					width: layer.box.width,
					height: layer.box.height,
					shape: layer.box.shape,
					semantic_tag: layer.semantic_tag
				}
			: undefined;
	}

	function pointNearLayerBoundary(point, layer, tolerance = 4) {
		const box = layerEndpointBox(layer);
		if (!box) {
			return false;
		}

		if (!pointInsideBox(point, box, tolerance)) {
			return false;
		}

		if (edgeBoxStencil(box) === 'ellipse') {
			const center = edgeBoxCenter(box);
			const radiusX = box.width / 2;
			const radiusY = box.height / 2;

			if (!radiusX || !radiusY) {
				return false;
			}

			const normalized = Math.sqrt(
				((point.x - center.x) * (point.x - center.x)) / (radiusX * radiusX) +
					((point.y - center.y) * (point.y - center.y)) / (radiusY * radiusY)
			);
			const normalizedTolerance = tolerance / Math.max(1, Math.min(radiusX, radiusY));
			return Math.abs(normalized - 1) <= normalizedTolerance;
		}

		return (
			Math.abs(point.x - box.x) <= tolerance ||
			Math.abs(point.x - (box.x + box.width)) <= tolerance ||
			Math.abs(point.y - box.y) <= tolerance ||
			Math.abs(point.y - (box.y + box.height)) <= tolerance
		);
	}

	function pointMatchesLayerEndpoint(point, layer, tolerance = 4) {
		const box = layerEndpointBox(layer);
		if (!box) {
			return false;
		}

		if (pointNearLayerBoundary(point, layer, tolerance)) {
			return true;
		}

		return pointInsideBox(point, box, tolerance);
	}

	function distanceToRectBox(point, box) {
		if (!point || !box) {
			return Infinity;
		}

		const dx = Math.max(box.x - point.x, 0, point.x - (box.x + box.width));
		const dy = Math.max(box.y - point.y, 0, point.y - (box.y + box.height));
		return Math.hypot(dx, dy);
	}

	function distanceToEllipseBox(point, box) {
		if (!point || !box) {
			return Infinity;
		}

		const center = edgeBoxCenter(box);
		const radiusX = box.width / 2;
		const radiusY = box.height / 2;

		if (!radiusX || !radiusY) {
			return distanceToRectBox(point, box);
		}

		const normalized = Math.sqrt(
			((point.x - center.x) * (point.x - center.x)) / (radiusX * radiusX) +
				((point.y - center.y) * (point.y - center.y)) / (radiusY * radiusY)
		);

		if (normalized <= 1) {
			return 0;
		}

		return (normalized - 1) * Math.min(radiusX, radiusY);
	}

	function distanceToLayerEndpoint(point, layer) {
		const box = layerEndpointBox(layer);
		if (!box) {
			return Infinity;
		}

		return edgeBoxStencil(box) === 'ellipse'
			? distanceToEllipseBox(point, box)
			: distanceToRectBox(point, box);
	}

	function nearestEndpointLayer(point, layers, maxDistance) {
		let nearest = undefined;

		for (const layer of layers) {
			const distance = distanceToLayerEndpoint(point, layer);
			if (distance <= maxDistance && (!nearest || distance < nearest.distance)) {
				nearest = { layer, distance };
			}
		}

		return nearest?.layer;
	}

	function edgeEndpointLayerId(edge, endpoint, docValue, layersInOrderValue, dragState) {
		const explicitLayerId = edgeBondLayerId(
			endpoint === 'source' ? edge?.source_bond : edge?.target_bond
		);

		if (explicitLayerId) {
			return explicitLayerId;
		}

		const point = edgeEndpointPoint(edge, endpoint);
		const moving = new Set(dragState?.previewLayerIds ?? dragState?.layerIds ?? []);
		const movingTolerance = Math.max(24, 16 * cameraScale.value);
		const nearbyTolerance = Math.max(32, 24 * cameraScale.value);
		const byId = layerMap(docValue);
		const candidateLayers = layersInOrderValue
			.map(({ id }) => byId.get(id))
			.filter((layer) => layer?.box && layer.id !== edge?.layer_id && layer.id !== edge?.id);
		const movingLayers = candidateLayers.filter((layer) => moving.has(layer.id));
		const movingLayer = candidateLayers.find(
			(layer) => moving.has(layer.id) && pointMatchesLayerEndpoint(point, layer, movingTolerance)
		);
		const nearbyMovingLayer = nearestEndpointLayer(point, movingLayers, nearbyTolerance);
		const exactLayer = candidateLayers.find((layer) => pointMatchesLayerEndpoint(point, layer));
		const nearbyLayer = nearestEndpointLayer(point, candidateLayers, nearbyTolerance);

		return movingLayer?.id ?? nearbyMovingLayer?.id ?? exactLayer?.id ?? nearbyLayer?.id;
	}

	function edgeEndpointMoveDelta(edge, endpoint, docValue, layersInOrderValue, dragState, delta) {
		const layerId = edgeEndpointLayerId(edge, endpoint, docValue, layersInOrderValue, dragState);

		return layerId ? layerMoveDelta(layerId, layersInOrderValue, dragState, delta) : { x: 0, y: 0 };
	}

	function edgeBondLayerBox(edge, endpoint, docValue, layersInOrderValue, dragState, delta) {
		const layerId = edgeEndpointLayerId(edge, endpoint, docValue, layersInOrderValue, dragState);
		const layer = layerId ? layerMap(docValue).get(layerId) : undefined;

		if (!layer?.box) {
			return undefined;
		}

		return movedSocketBox(
			{
				x: layer.box.position_x,
				y: layer.box.position_y,
				width: layer.box.width,
				height: layer.box.height,
				shape: layer.box.shape,
				semantic_tag: layer.semantic_tag
			},
			layerId,
			layersInOrderValue,
			dragState,
			delta
		);
	}

	function edgeBoxStencil(box) {
		const shape = `${box?.shape ?? ''}`.toLowerCase();
		const semanticTag = `${box?.semantic_tag ?? ''}`;

		if (
			shape.includes('ellipse') ||
			shape.includes('circle') ||
			semanticTag.endsWith('.PlaceFigure') ||
			semanticTag.endsWith('.VirtualPlaceFigure') ||
			semanticTag.endsWith('.EllipseFigure') ||
			semanticTag.endsWith('.FAStateFigure')
		) {
			return 'ellipse';
		}

		return 'rect';
	}

	function edgeBoxCenter(box) {
		return {
			x: box.x + box.width / 2,
			y: box.y + box.height / 2
		};
	}

	function edgeBoxBoundaryPoint(box, toward) {
		if (!box || !toward) {
			return undefined;
		}

		const center = edgeBoxCenter(box);
		const dx = toward.x - center.x;
		const dy = toward.y - center.y;

		if (dx === 0 && dy === 0) {
			return center;
		}

		if (edgeBoxStencil(box) === 'ellipse') {
			const radiusX = box.width / 2;
			const radiusY = box.height / 2;

			if (!radiusX || !radiusY) {
				return center;
			}

			const scale =
				1 / Math.sqrt((dx * dx) / (radiusX * radiusX) + (dy * dy) / (radiusY * radiusY));

			return {
				x: center.x + dx * scale,
				y: center.y + dy * scale
			};
		}

		let scale = Infinity;

		if (dx !== 0) {
			const sideX = dx > 0 ? box.x + box.width : box.x;
			scale = Math.min(scale, (sideX - center.x) / dx);
		}

		if (dy !== 0) {
			const sideY = dy > 0 ? box.y + box.height : box.y;
			scale = Math.min(scale, (sideY - center.y) / dy);
		}

		return Number.isFinite(scale)
			? {
					x: center.x + dx * scale,
					y: center.y + dy * scale
				}
			: center;
	}

	function edgePointToLayerCoordinates(point, ownDelta) {
		return {
			x: point.x - ownDelta.x,
			y: point.y - ownDelta.y
		};
	}

	function edgePreviewWaypointPoint(waypoint, waypointDelta, ownDelta) {
		return waypoint
			? {
					x: waypoint.x + waypointDelta.x + ownDelta.x,
					y: waypoint.y + waypointDelta.y + ownDelta.y
				}
			: undefined;
	}

	function previewMovedEdge(
		layer,
		docValue,
		layersInOrderValue,
		dragState = groupDrag.value,
		delta = groupDragDelta.value
	) {
		const edge = layer?.edge;

		if (!edge) {
			return edge;
		}

		const ownDelta = layerMoveDelta(layer?.id, layersInOrderValue, dragState, delta);
		const sourceDelta = edgeEndpointMoveDelta(
			edge,
			'source',
			docValue,
			layersInOrderValue,
			dragState,
			delta
		);
		const targetDelta = edgeEndpointMoveDelta(
			edge,
			'target',
			docValue,
			layersInOrderValue,
			dragState,
			delta
		);

		if (!hasMoveDelta(sourceDelta) && !hasMoveDelta(targetDelta)) {
			return edge;
		}

		const sourceBox = edgeBondLayerBox(
			edge,
			'source',
			docValue,
			layersInOrderValue,
			dragState,
			delta
		);
		const targetBox = edgeBondLayerBox(
			edge,
			'target',
			docValue,
			layersInOrderValue,
			dragState,
			delta
		);
		const sourceRelativeDelta = hasMoveDelta(sourceDelta)
			? subtractDelta(sourceDelta, ownDelta)
			: { x: 0, y: 0 };
		const targetRelativeDelta = hasMoveDelta(targetDelta)
			? subtractDelta(targetDelta, ownDelta)
			: { x: 0, y: 0 };
		const waypointRelativeDelta =
			hasMoveDelta(sourceDelta) && hasMoveDelta(targetDelta) && sameDelta(sourceDelta, targetDelta)
				? subtractDelta(sourceDelta, ownDelta)
				: { x: 0, y: 0 };

		if (
			!hasMoveDelta(sourceRelativeDelta) &&
			!hasMoveDelta(targetRelativeDelta) &&
			!hasMoveDelta(waypointRelativeDelta)
		) {
			return edge;
		}

		const movedWaypoints = hasMoveDelta(waypointRelativeDelta)
			? moveWaypointList(edge.waypoints, waypointRelativeDelta)
			: edge.waypoints;
		const firstWaypoint = edgePreviewWaypointPoint(
			edge.waypoints?.[0],
			waypointRelativeDelta,
			ownDelta
		);
		const lastWaypoint = edgePreviewWaypointPoint(
			edge.waypoints?.[edge.waypoints?.length - 1],
			waypointRelativeDelta,
			ownDelta
		);
		const sourceFallback = {
			x: edge.source_x + sourceRelativeDelta.x + ownDelta.x,
			y: edge.source_y + sourceRelativeDelta.y + ownDelta.y
		};
		const targetFallback = {
			x: edge.target_x + targetRelativeDelta.x + ownDelta.x,
			y: edge.target_y + targetRelativeDelta.y + ownDelta.y
		};
		const sourcePoint = sourceBox
			? edgePointToLayerCoordinates(
					edgeBoxBoundaryPoint(
						sourceBox,
						firstWaypoint ?? (targetBox ? edgeBoxCenter(targetBox) : targetFallback)
					),
					ownDelta
				)
			: {
					x: edge.source_x + sourceRelativeDelta.x,
					y: edge.source_y + sourceRelativeDelta.y
				};
		const targetPoint = targetBox
			? edgePointToLayerCoordinates(
					edgeBoxBoundaryPoint(
						targetBox,
						lastWaypoint ?? (sourceBox ? edgeBoxCenter(sourceBox) : sourceFallback)
					),
					ownDelta
				)
			: {
					x: edge.target_x + targetRelativeDelta.x,
					y: edge.target_y + targetRelativeDelta.y
				};

		return {
			...edge,
			source_x: sourcePoint.x,
			source_y: sourcePoint.y,
			target_x: targetPoint.x,
			target_y: targetPoint.y,
			waypoints: movedWaypoints
		};
	}

	function renderedEdgePreview(
		layer,
		docValue,
		layersInOrderValue,
		dragState = groupDrag.value,
		delta = groupDragDelta.value
	) {
		return (
			polygonScalePreviewEdges.value.get(layer?.id) ??
			committedEdgePreviewOverrides.value.get(layer?.id) ??
			connectedEdgePreviewOverrides.value.get(layer?.id) ??
			previewMovedEdge(layer, docValue, layersInOrderValue, dragState, delta)
		);
	}

	function edgePreviewTransform(layerId, layersInOrderValue, edge, previewEdge) {
		if (hasEndpointBond(edge?.source_bond) || hasEndpointBond(edge?.target_bond)) {
			return undefined;
		}

		return edgePositionChanged(edge, previewEdge)
			? undefined
			: layerMoveTransform(layerId, layersInOrderValue);
	}

	function previewWaypointPosition(previewWaypoints, waypoint) {
		return (
			previewWaypoints?.find?.((previewWaypoint) => previewWaypoint?.id === waypoint?.id) ??
			waypoint
		);
	}

	function localWaypointIdForProposal(proposal) {
		return `__local_waypoint:${proposal?.id_before ?? 'start'}`;
	}

	function waypointServerId(id) {
		return typeof id === 'string' && !id.startsWith('__') ? id : null;
	}

	function waypointHandleVisible(waypoint) {
		return !!(waypoint?.id && Number.isFinite(waypoint?.x) && Number.isFinite(waypoint?.y));
	}

	function waypointPositionPayload(waypoint) {
		return {
			x: waypoint?.x,
			y: waypoint?.y
		};
	}

	function edgeWaypointProposals(edge) {
		const waypoints = L.get(localProp('waypoints'), edge) ?? edge?.waypoints ?? [];
		const points = [
			{ x: edge?.source_x, y: edge?.source_y, id: '__source' },
			...waypoints,
			{ x: edge?.target_x, y: edge?.target_y, id: '__target' }
		].filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y));

		const proposals = [];
		for (let i = 0; i < points.length - 1; i += 1) {
			const before = points[i];
			const after = points[i + 1];
			if (!before?.id || !after?.id) {
				continue;
			}

			proposals.push({
				id_before: before.id,
				x: (before.x + after.x) / 2,
				y: (before.y + after.y) / 2
			});
		}

		return proposals;
	}

	function expandedMoveLayerIds(layerIds, layersInOrderValue, docValue) {
		const moving = new Set(layerIds);
		for (const layerInfo of layersInOrderValue) {
			if (layerInfo.parents.some((parent) => moving.has(parent))) {
				moving.add(layerInfo.id);
			}
		}

		let changed = true;
		while (changed) {
			changed = false;

			for (const layer of docValue?.layers?.items ?? []) {
				if (layer.hyperlink && moving.has(layer.hyperlink) && !moving.has(layer.id)) {
					moving.add(layer.id);
					changed = true;
				}
			}
		}

		return moving;
	}

	function moveWaypointList(waypoints, delta) {
		return Array.isArray(waypoints)
			? waypoints.map((waypoint) => ({
					...waypoint,
					x: waypoint.x + delta.x,
					y: waypoint.y + delta.y
				}))
			: waypoints;
	}

	function removeEdgeEndpoint(layer, endpoint, currentWaypoints, dispatch, cast) {
		const waypoints = (currentWaypoints ?? layer?.edge?.waypoints ?? []).filter(
			(waypoint) => waypoint?.id
		);
		const replacement = endpoint === 'source' ? waypoints[0] : waypoints[waypoints.length - 1];

		if (!layer?.id || !replacement) {
			return false;
		}

		const value =
			endpoint === 'source'
				? { source_x: replacement.x, source_y: replacement.y }
				: { target_x: replacement.x, target_y: replacement.y };

		dispatch('update_edge_position', {
			layer_id: layer.id,
			value
		})
			.then(() =>
				cast('delete_waypoint', {
					layer_id: layer.id,
					waypoint_id: replacement.id
				})
			)
			.catch((error) => queueError(error, 'Edge point could not be removed'));

		return true;
	}

	function moveLayerValue(layer, delta) {
		if (layer.box) {
			return {
				...layer,
				box: {
					...layer.box,
					position_x: layer.box.position_x + delta.x,
					position_y: layer.box.position_y + delta.y
				}
			};
		}

		if (layer.text) {
			return {
				...layer,
				text: {
					...layer.text,
					position_x: layer.text.position_x + delta.x,
					position_y: layer.text.position_y + delta.y
				}
			};
		}

		if (layer.edge) {
			const sourceDelta = hasEndpointBond(layer.edge.source_bond) ? { x: 0, y: 0 } : delta;
			const targetDelta = hasEndpointBond(layer.edge.target_bond) ? { x: 0, y: 0 } : delta;

			return {
				...layer,
				edge: {
					...layer.edge,
					source_x: layer.edge.source_x + sourceDelta.x,
					source_y: layer.edge.source_y + sourceDelta.y,
					target_x: layer.edge.target_x + targetDelta.x,
					target_y: layer.edge.target_y + targetDelta.y,
					waypoints: moveWaypointList(layer.edge.waypoints, delta)
				}
			};
		}

		return layer;
	}

	function edgePositionChanged(edge, previewEdge) {
		if (!edge || !previewEdge) {
			return false;
		}

		if (
			!samePosition(edge.source_x, previewEdge.source_x) ||
			!samePosition(edge.source_y, previewEdge.source_y) ||
			!samePosition(edge.target_x, previewEdge.target_x) ||
			!samePosition(edge.target_y, previewEdge.target_y)
		) {
			return true;
		}

		const edgeWaypoints = edge.waypoints ?? [];
		const previewWaypoints = previewEdge.waypoints ?? [];

		if (edgeWaypoints.length !== previewWaypoints.length) {
			return true;
		}

		return edgeWaypoints.some((waypoint, index) => {
			const previewWaypoint = previewWaypoints[index];
			return (
				waypoint?.id !== previewWaypoint?.id ||
				!samePosition(waypoint?.x, previewWaypoint?.x) ||
				!samePosition(waypoint?.y, previewWaypoint?.y)
			);
		});
	}

	function edgeGeometryMatches(edge, previewEdge) {
		if (!edge || !previewEdge) {
			return false;
		}

		if (
			!samePosition(edge.source_x, previewEdge.source_x) ||
			!samePosition(edge.source_y, previewEdge.source_y) ||
			!samePosition(edge.target_x, previewEdge.target_x) ||
			!samePosition(edge.target_y, previewEdge.target_y)
		) {
			return false;
		}

		const edgeWaypoints = edge.waypoints ?? [];
		const previewWaypoints = previewEdge.waypoints ?? [];

		if (edgeWaypoints.length !== previewWaypoints.length) {
			return false;
		}

		return previewWaypoints.every((previewWaypoint, index) => {
			const waypoint = edgeWaypoints[index];
			const previewHasServerId =
				previewWaypoint?.id && !String(previewWaypoint.id).startsWith('__');

			if (
				!samePosition(waypoint?.x, previewWaypoint?.x) ||
				!samePosition(waypoint?.y, previewWaypoint?.y)
			) {
				return false;
			}

			if (previewHasServerId) {
				return waypoint?.id === previewWaypoint.id;
			}

			// The preview waypoint is still optimistic (e.g. a freshly created
			// waypoint that has not been assigned a server id yet). We optimistically
			// patch the local document with that same pending waypoint, so matching on
			// position alone would treat our own patch as "synced" and release the
			// committed preview after a single poll — before the server roundtrip
			// completes. Once the preview clears, a server state push that does not yet
			// contain the new waypoint briefly reverts the edge to its old shape (the
			// flicker). Require the matching document waypoint to carry a real server
			// id so the preview is only released once the server has truly applied the
			// change.
			return waypoint?.id && !String(waypoint.id).startsWith('__');
		});
	}

	function connectedEdgePreviews(docValue, layersInOrderValue, dragState, delta) {
		const previews = new Map();

		for (const layer of docValue?.layers?.items ?? []) {
			if (!layer?.edge || isLayerInMovingSetFor(layer.id, layersInOrderValue, dragState)) {
				continue;
			}

			const previewEdge = previewMovedEdge(layer, docValue, layersInOrderValue, dragState, delta);

			if (edgePositionChanged(layer.edge, previewEdge)) {
				previews.set(layer.id, previewEdge);
			}
		}

		return previews;
	}

	function applyConnectedEdgePreviewsLocally(docAtom, edgePreviews) {
		if (!edgePreviews.size) {
			return;
		}

		docAtom.value = {
			...docAtom.value,
			layers: {
				...docAtom.value.layers,
				items: docAtom.value.layers.items.map((layer) => {
					const previewEdge = edgePreviews.get(layer.id);
					return previewEdge ? { ...layer, edge: previewEdge } : layer;
				})
			}
		};
	}

	function moveLayersLocally(docAtom, layerIds, delta, layersInOrderValue) {
		const moving = expandedMoveLayerIds(layerIds, layersInOrderValue, docAtom.value);
		const dragState = {
			layerIds: uniqueLayerIds(layerIds),
			previewLayerIds: [...moving]
		};
		const edgePreviews = connectedEdgePreviews(docAtom.value, layersInOrderValue, dragState, delta);

		docAtom.value = {
			...docAtom.value,
			layers: {
				...docAtom.value.layers,
				items: docAtom.value.layers.items.map((layer) =>
					moving.has(layer.id) ? moveLayerValue(layer, delta) : layer
				)
			}
		};
		applyConnectedEdgePreviewsLocally(docAtom, edgePreviews);
	}

	function beginLayerMove(
		evt,
		liveLenses,
		layerId,
		layersInOrderValue,
		docValue,
		clickSelectLayerId = undefined
	) {
		if (!evt.isPrimary || !E.isLeftButton(evt)) {
			return false;
		}

		const layerIds = dragLayerIdsFor(layerId, layersInOrderValue);
		if (!layerIds.length) {
			return false;
		}

		evt.stopPropagation();
		evt.preventDefault();
		evt.currentTarget.focus?.({ preventScroll: true });
		evt.currentTarget.setPointerCapture(evt.pointerId);
		evt.currentTarget.currentPointerId = evt.pointerId;
		backoffValue.value = true;

		const world = liveLenses.clientToCanvas(evt.clientX, evt.clientY);
		rememberPasteLocation(world);
		groupDrag.value = {
			pointerId: evt.pointerId,
			layerIds,
			clickSelectLayerId,
			previewLayerIds: [...expandedMoveLayerIds(layerIds, layersInOrderValue, docValue)],
			bx: world.x,
			by: world.y,
			cx: world.x,
			cy: world.y
		};

		return true;
	}

	function beginSelectionMoveFromHandle(evt, liveLenses, layerId, layersInOrderValue, docValue) {
		if (selectedLayers.value.length <= 1) {
			return false;
		}

		return beginLayerMove(evt, liveLenses, layerId, layersInOrderValue, docValue);
	}

	function refreshConnectedEdgePreviewOverrides(docAtom, layersInOrderValue) {
		if (!docAtom || !layersInOrderValue || !groupDrag.value) {
			connectedEdgePreviewOverrides.value = new Map();
			return;
		}

		connectedEdgePreviewOverrides.value = connectedEdgePreviews(
			docAtom.value,
			layersInOrderValue,
			groupDrag.value,
			groupDragDelta.value
		);
	}

	function updateLayerMove(evt, liveLenses, docAtom = undefined, layersInOrderValue = undefined) {
		if (
			evt.isPrimary &&
			groupDrag.value?.pointerId === evt.pointerId &&
			evt.currentTarget.hasPointerCapture(evt.pointerId)
		) {
			evt.stopPropagation();
			evt.preventDefault();
			const world = liveLenses.clientToCanvas(evt.clientX, evt.clientY);
			update(L.set(L.props('cx', 'cy'), { cx: world.x, cy: world.y }), groupDrag);
			refreshConnectedEdgePreviewOverrides(docAtom, layersInOrderValue);
		}
	}

	function updateSelectionMoveFromHandle(
		evt,
		liveLenses,
		docAtom = undefined,
		layersInOrderValue = undefined
	) {
		if (groupDrag.value?.pointerId !== evt.pointerId) {
			return false;
		}

		updateLayerMove(evt, liveLenses, docAtom, layersInOrderValue);
		return true;
	}

	function commitLayerMove(layerIds, delta, dispatch) {
		return dispatch('move_layer_relative', {
			layer_ids: uniqueLayerIds(layerIds),
			dx: delta.x,
			dy: delta.y
		});
	}

	function finishLayerMove(
		evt,
		dispatch,
		docAtom,
		layersInOrderValue,
		cast = deleteShortcutContext.cast
	) {
		if (groupDrag.value?.pointerId !== evt.pointerId) {
			return;
		}

		evt.stopPropagation();
		evt.preventDefault();

		const delta = groupDragDelta.value;
		const layerIds = uniqueLayerIds(groupDrag.value.layerIds);
		const clickSelectLayerId = groupDrag.value.clickSelectLayerId;

		if (!layerIds.length || (!delta.x && !delta.y)) {
			if (evt.currentTarget.hasPointerCapture(evt.pointerId)) {
				evt.currentTarget.releasePointerCapture(evt.pointerId);
			}
			connectedEdgePreviewOverrides.value = new Map();
			groupDrag.value = undefined;
			backoffValue.value = undefined;
			if (clickSelectLayerId && deleteShortcutContext.cast) {
				publishSelection(deleteShortcutContext.cast, [clickSelectLayerId]);
			}
			return;
		}

		moveLayersLocally(docAtom, layerIds, delta, layersInOrderValue);
		relinkMovedInscriptions(cast, docAtom.value, layersInOrderValue, layerIds);
		connectedEdgePreviewOverrides.value = new Map();
		groupDrag.value = undefined;
		backoffValue.value = undefined;

		if (evt.currentTarget.hasPointerCapture(evt.pointerId)) {
			evt.currentTarget.releasePointerCapture(evt.pointerId);
		}

		commitLayerMove(layerIds, delta, dispatch).catch(() => {});
	}

	function finishSelectionMoveFromHandle(evt, dispatch, docAtom, layersInOrderValue) {
		if (groupDrag.value?.pointerId !== evt.pointerId) {
			return false;
		}

		finishLayerMove(evt, dispatch, docAtom, layersInOrderValue);
		return true;
	}

	function eventPointerId(evt) {
		return evt?.pointerId ?? evt?.currentTarget?.currentPointerId;
	}

	function cancelLayerMove(evt) {
		const pointerId = eventPointerId(evt);
		if (!evt || groupDrag.value?.pointerId !== pointerId || groupDrag.value?.committing) {
			return;
		}

		evt.stopPropagation();
		evt.preventDefault();

		if (evt.currentTarget.hasPointerCapture(pointerId)) {
			evt.currentTarget.releasePointerCapture(pointerId);
		}

		connectedEdgePreviewOverrides.value = new Map();
		groupDrag.value = undefined;
	}

	function cancelSelectionMoveFromHandle(evt) {
		if (groupDrag.value?.pointerId !== eventPointerId(evt)) {
			return false;
		}

		cancelLayerMove(evt);
		return true;
	}

	function clickSelectedLayer(evt, cast, id) {
		if (consumeSuppressedEdgeWaypointClick(evt, id)) {
			return;
		}

		evt.preventDefault();
		evt.stopPropagation();
		if (evt.shiftKey) {
			toggleLayerSelection(cast, id);
		}
		backoffValue.value = undefined;
	}

	function layerIdAtPointer(evt, ignoredIds = new Set()) {
		for (const element of document.elementsFromPoint?.(evt.clientX, evt.clientY) ?? []) {
			const layerElement = element.closest?.('[data-editor-layer-id]');
			const id = layerElement?.dataset?.editorLayerId;
			if (id && !ignoredIds.has(id)) {
				return id;
			}
		}

		return undefined;
	}

	function clickSelectedLayerHitbox(evt, cast, id) {
		if (!evt.shiftKey) {
			clickSelectedLayer(evt, cast, id);
			return;
		}

		clickSelectedLayer(evt, cast, layerIdAtPointer(evt, new Set([id])) ?? id);
	}

	function reorderSelectedLayers(dispatch, cast, target_rel, layersInOrderValue) {
		const layerIds = selectedTopLevelLayerIds(layersInOrderValue);

		if (!layerIds.length) {
			return;
		}

		dispatch('reorder_relative', {
			layer_ids: layerIds,
			target_rel
		}).catch(() => ({}));
	}

	function selectRelativeLayers(dispatch, cast, command, rel, layersInOrderValue) {
		const layerIds = selectedTopLevelLayerIds(layersInOrderValue);

		if (!layerIds.length) {
			return;
		}

		dispatch(command, {
			layer_ids: layerIds,
			rel
		})
			.catch(() => ({ layer_ids: [] }))
			.then((result) => {
				const relativeIds = uniqueLayerIds(result?.layer_ids ?? []);
				if (relativeIds.length) {
					publishSelection(cast, relativeIds);
				}
			});
	}

	function wrapSelectedLayersInGroup(dispatch, cast, layersInOrderValue) {
		const ids = selectedTopLevelLayerIds(layersInOrderValue);

		if (!ids.length) {
			return;
		}

		dispatch('create_layer', {
			layer_ids: ids
		}).then(({ id: groupId }) => {
			if (!groupId) {
				return;
			}

			publishSelection(cast, [groupId]);
		});
	}

	function selectedGroupLayerIds(layersInOrderValue) {
		const selected = new Set(selectedTopLevelLayerIds(layersInOrderValue));
		return layersInOrderValue
			.filter(({ id, has_children }) => selected.has(id) && has_children)
			.map(({ id }) => id);
	}

	function ungroupSelectedLayers(cast, layersInOrderValue) {
		const ids = uniqueLayerIds(selectedGroupLayerIds(layersInOrderValue));

		if (!ids.length) {
			return;
		}

		cast('delete_layer', { layer_ids: ids, delete_children: false });
		clearSelection(cast);
	}

	function normalizedBox({ start, current, square = false }) {
		let end = current;

		if (square) {
			const dx = current.x - start.x;
			const dy = current.y - start.y;
			const size = Math.max(Math.abs(dx), Math.abs(dy));
			end = {
				x: start.x + Math.sign(dx || 1) * size,
				y: start.y + Math.sign(dy || 1) * size
			};
		}

		const minX = Math.min(start.x, end.x);
		const minY = Math.min(start.y, end.y);
		const maxX = Math.max(start.x, end.x);
		const maxY = Math.max(start.y, end.y);

		return {
			minX,
			minY,
			maxX,
			maxY,
			x: minX,
			y: minY,
			width: maxX - minX,
			height: maxY - minY
		};
	}

	function finiteBox(box) {
		return (
			box &&
			Number.isFinite(box.minX) &&
			Number.isFinite(box.minY) &&
			Number.isFinite(box.maxX) &&
			Number.isFinite(box.maxY)
		);
	}

	function rectToBox(rect) {
		if (
			!rect ||
			!Number.isFinite(rect.x) ||
			!Number.isFinite(rect.y) ||
			!Number.isFinite(rect.width) ||
			!Number.isFinite(rect.height)
		) {
			return null;
		}

		return {
			minX: rect.x,
			minY: rect.y,
			maxX: rect.x + rect.width,
			maxY: rect.y + rect.height
		};
	}

	function boxToRect(box) {
		return {
			x: box.minX,
			y: box.minY,
			width: box.maxX - box.minX,
			height: box.maxY - box.minY
		};
	}

	function rectToSizeHint(rect) {
		return {
			position_x: rect.x,
			position_y: rect.y,
			width: rect.width,
			height: rect.height
		};
	}

	function selectionHandlePosition(rect, handle) {
		return {
			x: rect.x + ((handle.dx + 1) * rect.width) / 2,
			y: rect.y + ((handle.dy + 1) * rect.height) / 2
		};
	}

	function selectionHandlesForLayer(layer) {
		if (layer?.text) {
			return selectionHandleDescriptors.filter((handle) =>
				textSelectionHandleTypes.has(handle.type)
			);
		}

		return selectionHandleDescriptors;
	}

	function selectionHandleCanResize(layer) {
		return !layer?.text;
	}

	function normalizeResizeRect(rect) {
		const minWidth = 1;
		const minHeight = 1;
		return {
			x: Number.isFinite(rect.x) ? rect.x : 0,
			y: Number.isFinite(rect.y) ? rect.y : 0,
			width: Math.max(minWidth, Number.isFinite(rect.width) ? rect.width : minWidth),
			height: Math.max(minHeight, Number.isFinite(rect.height) ? rect.height : minHeight)
		};
	}

	function resizeRectFromHandle(drag, pointer, evt) {
		const start = normalizeResizeRect(drag.startRect);
		let left = start.x;
		let right = start.x + start.width;
		let top = start.y;
		let bottom = start.y + start.height;

		if (drag.dx < 0) {
			left = Math.min(pointer.x, right - 1);
		} else if (drag.dx > 0) {
			right = Math.max(pointer.x, left + 1);
		}

		if (drag.dy < 0) {
			top = Math.min(pointer.y, bottom - 1);
		} else if (drag.dy > 0) {
			bottom = Math.max(pointer.y, top + 1);
		}

		if ((evt.ctrlKey || evt.metaKey) && drag.dx !== 0 && drag.dy !== 0) {
			const size = Math.max(right - left, bottom - top, 1);
			if (drag.dx < 0) {
				left = right - size;
			} else {
				right = left + size;
			}
			if (drag.dy < 0) {
				top = bottom - size;
			} else {
				bottom = top + size;
			}
		} else if (evt.shiftKey && drag.dx !== 0 && drag.dy !== 0 && start.height > 0) {
			const ratio = start.width / start.height;
			let width = Math.max(right - left, 1);
			let height = Math.max(bottom - top, 1);

			if (width / height > ratio) {
				height = width / ratio;
			} else {
				width = height * ratio;
			}

			if (drag.dx < 0) {
				left = right - width;
			} else {
				right = left + width;
			}
			if (drag.dy < 0) {
				top = bottom - height;
			} else {
				bottom = top + height;
			}
		}

		return normalizeResizeRect({
			x: left,
			y: top,
			width: right - left,
			height: bottom - top
		});
	}

	function patchLayerLocally(docAtom, layerId, patcher) {
		docAtom.value = {
			...docAtom.value,
			layers: {
				...docAtom.value.layers,
				items: docAtom.value.layers.items.map((layer) =>
					layer.id === layerId ? patcher(layer) : layer
				)
			}
		};
	}

	function previewLayerResize(docAtom, layer, rect) {
		if (!layer?.id || !rect) {
			return;
		}

		const normalized = normalizeResizeRect(rect);

		if (layer.box) {
			patchLayerLocally(docAtom, layer.id, (current) => ({
				...current,
				box: {
					...current.box,
					position_x: normalized.x,
					position_y: normalized.y,
					width: normalized.width,
					height: normalized.height
				}
			}));
			return;
		}

		if (layer.text) {
			textBounds.value = {
				...textBounds.value,
				[layer.id]: normalized
			};
			patchLayerLocally(docAtom, layer.id, (current) => ({
				...current,
				text: {
					...current.text,
					hint: {
						...current.text?.hint,
						x: normalized.x,
						y: normalized.y,
						width: normalized.width,
						height: normalized.height
					}
				}
			}));
		}
	}

	function commitLayerResize(cast, layer, rect) {
		if (!layer?.id || !rect) {
			return;
		}

		const normalized = normalizeResizeRect(rect);

		if (layer.box) {
			cast('update_box_size', {
				layer_id: layer.id,
				value: rectToSizeHint(normalized)
			});
		} else if (layer.text) {
			cast('update_text_size_hint', {
				layer_id: layer.id,
				box: rectToSizeHint(normalized)
			});
		}
	}

	function patchTextFontSizeLocally(docAtom, layerId, fontSize) {
		patchLayerLocally(docAtom, layerId, (current) => ({
			...current,
			text: {
				...current.text,
				style: {
					...current.text?.style,
					font_size: fontSize
				}
			}
		}));
	}

	function textFontSizeFromDrag(drag, pointer) {
		return Math.max(
			1,
			Math.round((drag.startFontSize + (pointer.y - drag.startPointer.y) / 2) * 10) / 10
		);
	}

	function commitTextFontSize(cast, layer, fontSize) {
		if (!layer?.id) {
			return;
		}

		cast('change_style', {
			layer_id: layer.id,
			type: 'text',
			attr: 'font_size',
			val: fontSize
		});
	}

	function layerShapeName(layer, symbols) {
		return symbols?.get(layer?.box?.shape)?.name ?? '';
	}

	const ROUND_RECT_SHAPE_NAMES = new Set(['rect-round', 'round-rect']);

	// Stored rx/ry are arc diameters (the renderer draws the SVG corner radius at
	// stored / 2). Renew keeps the horizontal and vertical arc independent, each up to
	// the full width/height, so wide boxes can be rounded all the way to an ellipse.
	function boxRoundRadii(box) {
		const attributes = symbolShapeAttributes(box);
		const rx = Number(attributes.rx ?? attributes.ry ?? 0);
		const ry = Number(attributes.ry ?? attributes.rx ?? 0);
		return {
			rx: Number.isFinite(rx) ? rx : 0,
			ry: Number.isFinite(ry) ? ry : 0
		};
	}

	function supportsRoundRadiusHandle(layer, symbols) {
		if (!layer?.box) {
			return false;
		}

		// Match Renew: a round-rectangle figure always offers its radius handle, even
		// when the radius is 0 — the handle then sits in the corner so it can be dragged
		// back out. A box is a rounded rectangle whenever it carries rx/ry shape
		// attributes; dragging the handle down to 0 keeps the rect-round shape with
		// rx/ry = 0, whereas a plain rectangle has no rx/ry attributes at all.
		if (ROUND_RECT_SHAPE_NAMES.has(layerShapeName(layer, symbols))) {
			return true;
		}

		const attributes = symbolShapeAttributes(layer.box);
		return attributes.rx !== undefined || attributes.ry !== undefined;
	}

	// Renew's RadiusHandle nudges the handle a few pixels into the figure
	// (RadiusHandle.OFFSET), so at radius 0 it sits next to — not exactly on — the
	// corner resize handle. The offset is a constant screen distance, hence scaled by
	// the camera scale (canvas units per screen pixel).
	const ROUND_RADIUS_HANDLE_OFFSET = 3;

	function roundRadiusHandleOffset() {
		return ROUND_RADIUS_HANDLE_OFFSET * (cameraScale.value ?? 0);
	}

	function roundRadiusHandlePosition(box) {
		const { rx, ry } = boxRoundRadii(box);
		// The handle sits at the visible corner radius (= stored arc / 2) plus Renew's
		// constant inset offset, matching RadiusHandle.locate().
		const offset = roundRadiusHandleOffset();
		return {
			x: box.position_x + rx / 2 + offset,
			y: box.position_y + ry / 2 + offset
		};
	}

	function roundRadiusFromPointer(box, pointer) {
		// The handle marks the visible corner radius (plus the inset offset), so the
		// stored arc is twice the distance from the corner to the pointer, with the
		// offset subtracted so the handle stays under the pointer and radius 0 remains
		// reachable. Clamp each axis independently to the full width/height (Renew
		// parity), allowing elliptical corners.
		const offset = roundRadiusHandleOffset();
		const rx = Math.min(Math.max(0, 2 * (pointer.x - box.position_x - offset)), box.width);
		const ry = Math.min(Math.max(0, 2 * (pointer.y - box.position_y - offset)), box.height);
		return {
			rx: Math.round(rx * 10) / 10,
			ry: Math.round(ry * 10) / 10
		};
	}

	function patchBoxRoundRadiusLocally(docAtom, layerId, { rx, ry }) {
		patchLayerLocally(docAtom, layerId, (current) => ({
			...current,
			box: {
				...current.box,
				symbol_shape_attributes: {
					...(current.box?.symbol_shape_attributes ?? {}),
					rx,
					ry
				},
				shape_attributes: {
					...(current.box?.shape_attributes ?? {}),
					rx,
					ry
				}
			}
		}));
	}

	function commitBoxRoundRadius(cast, layer, { rx, ry }) {
		if (!layer?.id || !layer?.box) {
			return;
		}

		cast('change_layer_shape', {
			layer_id: layer.id,
			shape_id: layer.box.shape,
			attributes: { rx, ry }
		});
	}

	function supportsPieAngleHandles(layer, symbols) {
		return !!layer?.box && layerShapeName(layer, symbols) === 'pie';
	}

	function normalizePieAngle(angle) {
		const value = Number(angle);
		if (!Number.isFinite(value)) {
			return 0;
		}

		return ((value % 360) + 360) % 360;
	}

	function pieAngleValue(box, angleKind) {
		const fallback = angleKind === 'start_angle' ? 180 : 90;
		return normalizePieAngle(symbolShapeAttributes(box)?.[angleKind] ?? fallback);
	}

	function pieAngleHandlePosition(box, angleKind) {
		const angle = pieAngleValue(box, angleKind);
		const radians = (Math.PI / 180) * angle;
		const rx = box.width / 2;
		const ry = box.height / 2;
		const cx = box.position_x + rx;
		const cy = box.position_y + ry;

		return {
			x: cx + Math.cos(radians) * rx,
			y: cy - Math.sin(radians) * ry
		};
	}

	function pieAngleFromPointer(box, pointer, snap) {
		const cx = box.position_x + box.width / 2;
		const cy = box.position_y + box.height / 2;
		let angle = (Math.atan2(cy - pointer.y, pointer.x - cx) * 180) / Math.PI;
		angle = normalizePieAngle(angle);

		if (snap) {
			angle = normalizePieAngle(Math.round(angle / 15) * 15);
		}

		return Math.round(angle * 10) / 10;
	}

	function patchPieAngleLocally(docAtom, layerId, angleKind, angle) {
		patchLayerLocally(docAtom, layerId, (current) => ({
			...current,
			box: {
				...current.box,
				symbol_shape_attributes: {
					...(current.box?.symbol_shape_attributes ?? {}),
					[angleKind]: angle
				},
				shape_attributes: {
					...(current.box?.shape_attributes ?? {}),
					[angleKind]: angle
				}
			}
		}));
	}

	function commitPieAngle(cast, layer, angleKind, angle) {
		if (!layer?.id || !layer?.box) {
			return;
		}

		cast('change_layer_shape', {
			layer_id: layer.id,
			shape_id: layer.box.shape,
			attributes: {
				...symbolShapeAttributes(layer.box),
				[angleKind]: angle
			}
		});
	}

	const TRIANGLE_SHAPES = [
		'triangle-up',
		'triangle-ne',
		'triangle-right',
		'triangle-se',
		'triangle-down',
		'triangle-sw',
		'triangle-left',
		'triangle-nw'
	];

	const TRIANGLE_ROTATION_ANGLES = [
		-Math.PI / 2,
		-Math.PI / 4,
		0,
		Math.PI / 4,
		Math.PI / 2,
		(3 * Math.PI) / 4,
		Math.PI,
		(-3 * Math.PI) / 4
	];

	function triangleRotation(layer, symbols) {
		const shapeName = symbols?.get(layer?.box?.shape)?.name;
		const rotation = TRIANGLE_SHAPES.indexOf(shapeName);
		return rotation >= 0 ? rotation : null;
	}

	function supportsTriangleRotationHandle(layer, symbols) {
		return !!layer?.box && triangleRotation(layer, symbols) !== null;
	}

	function triangleApex(box, rotation) {
		const x = box.position_x;
		const y = box.position_y;
		const w = box.width;
		const h = box.height;

		switch (rotation) {
			case 1:
				return { x: x + w, y };
			case 2:
				return { x: x + w, y: y + h / 2 };
			case 3:
				return { x: x + w, y: y + h };
			case 4:
				return { x: x + w / 2, y: y + h };
			case 5:
				return { x, y: y + h };
			case 6:
				return { x, y: y + h / 2 };
			case 7:
				return { x, y };
			default:
				return { x: x + w / 2, y };
		}
	}

	function triangleRotationHandlePosition(box, rotation, handleSize) {
		const apex = triangleApex(box, rotation);
		const center = {
			x: box.position_x + box.width / 2,
			y: box.position_y + box.height / 2
		};
		const len = Math.hypot(apex.x - center.x, apex.y - center.y);

		if (len <= 0) {
			return { x: apex.x - handleSize / 2, y: apex.y + handleSize / 2 };
		}

		const u = Math.min(1, handleSize / len);
		if (u >= 1) {
			return {
				x: (apex.x * 3 + center.x) / 4,
				y: (apex.y * 3 + center.y) / 4
			};
		}

		return {
			x: apex.x * (1 - u) + center.x * u,
			y: apex.y * (1 - u) + center.y * u
		};
	}

	function angleDistance(a, b) {
		return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
	}

	function triangleRotationFromPointer(box, pointer) {
		const center = {
			x: box.position_x + box.width / 2,
			y: box.position_y + box.height / 2
		};
		const angle = Math.atan2(pointer.y - center.y, pointer.x - center.x);
		let best = 0;
		let distance = Infinity;

		for (let i = 0; i < TRIANGLE_ROTATION_ANGLES.length; i += 1) {
			const d = angleDistance(angle, TRIANGLE_ROTATION_ANGLES[i]);
			if (d < distance) {
				best = i;
				distance = d;
			}
		}

		return best;
	}

	function patchTriangleShapeLocally(docAtom, layerId, shapeId) {
		patchLayerLocally(docAtom, layerId, (current) => {
			if (!current?.box) {
				return current;
			}

			return {
				...current,
				box: {
					...current.box,
					shape: shapeId
				}
			};
		});
	}

	function commitTriangleRotation(cast, layer, symbols, rotation) {
		if (!layer?.id || !layer?.box) {
			return;
		}

		const shapeId = symbolIdByName(symbols, TRIANGLE_SHAPES[rotation]);
		if (!shapeId) {
			return;
		}

		cast('change_layer_shape', {
			layer_id: layer.id,
			shape_id: shapeId,
			attributes: symbolShapeAttributes(layer.box)
		});
	}

	function unionBoxes(boxes) {
		const finiteBoxes = boxes.filter(finiteBox);

		if (!finiteBoxes.length) {
			return {
				minX: -100,
				minY: -100,
				maxX: 100,
				maxY: 100
			};
		}

		return {
			minX: Math.min(...finiteBoxes.map((box) => box.minX)),
			minY: Math.min(...finiteBoxes.map((box) => box.minY)),
			maxX: Math.max(...finiteBoxes.map((box) => box.maxX)),
			maxY: Math.max(...finiteBoxes.map((box) => box.maxY))
		};
	}

	function documentDisplayBox(docValue, textBoundsValue) {
		const boxes = [rectToBox(docValue?.viewbox)];

		for (const layer of docValue?.layers?.items ?? []) {
			if (!layer.text) {
				continue;
			}

			const bounds = textBoundsValue?.[layer.id];
			const box = rectToBox(bounds);
			if (box) {
				boxes.push(expandBox(box, 100));
			}
		}

		return unionBoxes(boxes);
	}

	function symbolShapeAttributes(box) {
		return {
			...(box?.symbol_shape_attributes ?? {}),
			...(box?.shape_attributes ?? {})
		};
	}

	function syntaxEdgeTipSymbolShapeId(syntax, attr) {
		return (
			Object.values(syntax?.autoEdgeNode ?? {})
				.map((entry) => entry?.edge?.[attr])
				.find(Boolean) ?? null
		);
	}

	function layerBox(layerInfo, layer, textBoundsValue) {
		if (layerInfo?.has_children) {
			return layerInfo.deep_bounding;
		}

		if (layer?.box) {
			return layerInfo.own_bounding;
		}

		if (layer?.edge) {
			return layerInfo.own_bounding;
		}

		if (layer?.text) {
			const bbox = textBoundsValue[layer.id];
			return bbox
				? {
						minX: bbox.x,
						minY: bbox.y,
						maxX: bbox.x + bbox.width,
						maxY: bbox.y + bbox.height
					}
				: layerInfo.own_bounding;
		}

		return null;
	}

	function boxContainsBox(outer, inner) {
		return (
			inner.minX >= outer.minX &&
			inner.minY >= outer.minY &&
			inner.maxX <= outer.maxX &&
			inner.maxY <= outer.maxY
		);
	}

	function boxContainsPoint(box, point) {
		return point.x >= box.minX && point.x <= box.maxX && point.y >= box.minY && point.y <= box.maxY;
	}

	function expandBox(box, padding) {
		return {
			minX: box.minX - padding,
			minY: box.minY - padding,
			maxX: box.maxX + padding,
			maxY: box.maxY + padding
		};
	}

	function gridSize() {
		const size = Number(gridDistance.value);
		return Number.isFinite(size) && size > 0 ? size : 32;
	}

	function snapNumber(value) {
		const size = gridSize();
		return Math.round(value / size) * size;
	}

	function snapCanvasPoint(point) {
		if (!snapToGrid.value || !point) {
			return point;
		}

		return {
			x: snapNumber(point.x),
			y: snapNumber(point.y)
		};
	}

	function selectedLayoutEntries(docValue, layersInOrderValue, textBoundsValue) {
		const byId = layerMap(docValue);
		return selectedTopLevelLayerIds(layersInOrderValue)
			.map((id) => {
				const info = layersInOrderValue.find((layerInfo) => layerInfo.id === id);
				const box = layerBox(info, byId.get(id), textBoundsValue);
				return finiteBox(box) ? { id, box } : null;
			})
			.filter(Boolean);
	}

	function moveLayoutEntry(dispatch, entry, dx, dy) {
		if (!entry || (!dx && !dy)) {
			return;
		}

		dispatch('move_layer_relative', {
			layer_ids: [entry.id],
			dx,
			dy
		}).catch(() => ({}));
	}

	function snapSelectedLayersToGrid(dispatch, docValue, layersInOrderValue, textBoundsValue) {
		for (const entry of selectedLayoutEntries(docValue, layersInOrderValue, textBoundsValue)) {
			moveLayoutEntry(
				dispatch,
				entry,
				snapNumber(entry.box.minX) - entry.box.minX,
				snapNumber(entry.box.minY) - entry.box.minY
			);
		}
	}

	function alignSelectedLayers(
		dispatch,
		docValue,
		layersInOrderValue,
		textBoundsValue,
		axis,
		mode
	) {
		const entries = selectedLayoutEntries(docValue, layersInOrderValue, textBoundsValue);
		if (entries.length < 2) {
			return;
		}

		const union = unionBoxes(entries.map(({ box }) => box));
		const target =
			axis === 'x'
				? mode === 'min'
					? union.minX
					: mode === 'max'
						? union.maxX
						: (union.minX + union.maxX) / 2
				: mode === 'min'
					? union.minY
					: mode === 'max'
						? union.maxY
						: (union.minY + union.maxY) / 2;

		for (const entry of entries) {
			const box = entry.box;
			const current =
				axis === 'x'
					? mode === 'min'
						? box.minX
						: mode === 'max'
							? box.maxX
							: (box.minX + box.maxX) / 2
					: mode === 'min'
						? box.minY
						: mode === 'max'
							? box.maxY
							: (box.minY + box.maxY) / 2;
			moveLayoutEntry(
				dispatch,
				entry,
				axis === 'x' ? target - current : 0,
				axis === 'y' ? target - current : 0
			);
		}
	}

	function spreadSelectedLayers(dispatch, docValue, layersInOrderValue, textBoundsValue, axis) {
		const entries = selectedLayoutEntries(docValue, layersInOrderValue, textBoundsValue).sort(
			(a, b) =>
				axis === 'x'
					? (a.box.minX + a.box.maxX) / 2 - (b.box.minX + b.box.maxX) / 2
					: (a.box.minY + a.box.maxY) / 2 - (b.box.minY + b.box.maxY) / 2
		);

		if (entries.length < 3) {
			return;
		}

		const union = unionBoxes(entries.map(({ box }) => box));
		const first = entries[0];
		const start = axis === 'x' ? first.box.minX : first.box.minY;
		const totalSize = entries.reduce(
			(sum, entry) =>
				sum + (axis === 'x' ? entry.box.maxX - entry.box.minX : entry.box.maxY - entry.box.minY),
			0
		);
		const gap = Math.max(
			0,
			((axis === 'x' ? union.maxX - union.minX : union.maxY - union.minY) - totalSize) /
				(entries.length - 1)
		);
		let cursor = start;

		for (const entry of entries) {
			const current = axis === 'x' ? entry.box.minX : entry.box.minY;
			moveLayoutEntry(
				dispatch,
				entry,
				axis === 'x' ? cursor - current : 0,
				axis === 'y' ? cursor - current : 0
			);
			cursor +=
				(axis === 'x' ? entry.box.maxX - entry.box.minX : entry.box.maxY - entry.box.minY) + gap;
		}
	}

	function symbolIdByName(symbols, name) {
		for (const [id, symbol] of symbols.entries()) {
			if (symbol?.name === name) {
				return id;
			}
		}

		return '';
	}

	function changeSelectedBoxRoundCorners(cast, docValue, layersInOrderValue, symbols, radius) {
		const byId = layerMap(docValue);
		const shapeName = radius > 0 ? 'rect-round' : 'rect';
		const shapeId = symbolIdByName(symbols, shapeName);
		const attributes = radius > 0 ? { rx: radius, ry: radius } : {};

		for (const id of selectedTopLevelLayerIds(layersInOrderValue)) {
			if (!byId.get(id)?.box) {
				continue;
			}

			cast('change_layer_shape', {
				layer_id: id,
				shape_id: shapeId,
				attributes
			});
		}
	}

	function layerRectForEntry(entry) {
		return {
			x: entry.box.minX,
			y: entry.box.minY,
			width: entry.box.maxX - entry.box.minX,
			height: entry.box.maxY - entry.box.minY
		};
	}

	function resizeLayoutEntry(dispatch, docValue, entry, rect) {
		const layer = layerMap(docValue).get(entry.id);
		if (!layer) {
			return;
		}

		if (layer.box) {
			dispatch('update_box_size', {
				layer_id: entry.id,
				value: rectToSizeHint(rect)
			}).catch(() => ({}));
		} else if (layer.text) {
			dispatch('update_text_size_hint', {
				layer_id: entry.id,
				box: rectToSizeHint(rect)
			}).catch(() => ({}));
		}
	}

	function promptSelectedFigureSize(dispatch, docValue, layersInOrderValue, textBoundsValue) {
		const entries = selectedLayoutEntries(docValue, layersInOrderValue, textBoundsValue);
		if (!entries.length) {
			return;
		}

		const first = layerRectForEntry(entries[0]);
		const width = Number(prompt('Width', String(Math.round(first.width * 10) / 10)));
		if (!Number.isFinite(width) || width < 0) {
			return;
		}

		const height = Number(prompt('Height', String(Math.round(first.height * 10) / 10)));
		if (!Number.isFinite(height) || height < 0) {
			return;
		}

		for (const entry of entries) {
			const rect = layerRectForEntry(entry);
			resizeLayoutEntry(dispatch, docValue, entry, {
				...rect,
				width,
				height
			});
		}
	}

	function promptSelectedLocation(dispatch, docValue, layersInOrderValue, textBoundsValue) {
		const entries = selectedLayoutEntries(docValue, layersInOrderValue, textBoundsValue);
		if (!entries.length) {
			return;
		}

		const first = layerRectForEntry(entries[0]);
		const x = Number(prompt('X', String(Math.round(first.x * 10) / 10)));
		if (!Number.isFinite(x)) {
			return;
		}

		const y = Number(prompt('Y', String(Math.round(first.y * 10) / 10)));
		if (!Number.isFinite(y)) {
			return;
		}

		for (const entry of entries) {
			const rect = layerRectForEntry(entry);
			moveLayoutEntry(dispatch, entry, x - rect.x, y - rect.y);
		}
	}

	function automaticLayout(dispatch, docValue, layersInOrderValue, textBoundsValue) {
		const entries = selectedLayoutEntries(docValue, layersInOrderValue, textBoundsValue);
		const layoutEntries = entries.length
			? entries
			: layersInOrderValue
					.map(({ id }) => {
						const layer = layerMap(docValue).get(id);
						const box = layerBox(
							layersInOrderValue.find((layerInfo) => layerInfo.id === id),
							layer,
							textBoundsValue
						);
						return finiteBox(box) ? { id, box } : null;
					})
					.filter(Boolean);

		if (!layoutEntries.length) {
			return;
		}

		const columnCount = Math.max(1, Math.ceil(Math.sqrt(layoutEntries.length)));
		const cellWidth =
			Math.max(...layoutEntries.map(({ box }) => Math.max(40, box.maxX - box.minX))) + 40;
		const cellHeight =
			Math.max(...layoutEntries.map(({ box }) => Math.max(30, box.maxY - box.minY))) + 40;
		const origin = unionBoxes(layoutEntries.map(({ box }) => box));

		layoutEntries.forEach((entry, index) => {
			const column = index % columnCount;
			const row = Math.floor(index / columnCount);
			const targetX = origin.minX + column * cellWidth;
			const targetY = origin.minY + row * cellHeight;
			moveLayoutEntry(dispatch, entry, targetX - entry.box.minX, targetY - entry.box.minY);
		});
	}

	function equalizeSelectedFigureSize(
		dispatch,
		docValue,
		layersInOrderValue,
		textBoundsValue,
		dimension
	) {
		const entries = selectedLayoutEntries(docValue, layersInOrderValue, textBoundsValue);
		if (entries.length < 2) {
			return;
		}

		const first = layerRectForEntry(entries[0]);
		for (const entry of entries.slice(1)) {
			const rect = layerRectForEntry(entry);
			resizeLayoutEntry(dispatch, docValue, entry, {
				...rect,
				width: dimension === 'height' ? rect.width : first.width,
				height: dimension === 'width' ? rect.height : first.height
			});
		}
	}

	function selectedLayersWithKind(docValue, layersInOrderValue, predicate) {
		const byId = layerMap(docValue);
		return selectedTopLevelLayerIds(layersInOrderValue).filter((id) => predicate(byId.get(id)));
	}

	function changeSelectedStyle(cast, docValue, layersInOrderValue, type, attr, val, predicate) {
		const layerIds = selectedLayersWithKind(docValue, layersInOrderValue, predicate);
		if (layerIds.length) {
			cast('change_style', { layer_ids: layerIds, type, attr, val });
			applyOptimisticStyle(layerIds, type, attr, val);
		}
	}

	// Apply a style change to the local document immediately so the selection updates
	// without waiting for the server round-trip. The batched change_style triggers a
	// single document push that confirms this same value, so there is no flicker. If
	// the document atom isn't available we simply skip and rely on the server echo.
	function applyOptimisticStyle(layerIds, type, attr, val) {
		const docAtom = editorDocAtom;
		const items = docAtom?.value?.layers?.items;
		if (!Array.isArray(items)) {
			return;
		}

		const ids = new Set(layerIds);
		const withAttr = (style) => ({ ...(style ?? {}), [attr]: val });

		docAtom.value = {
			...docAtom.value,
			layers: {
				...docAtom.value.layers,
				items: items.map((layer) => {
					if (!ids.has(layer.id)) {
						return layer;
					}

					if (type === 'text' && layer.text) {
						return { ...layer, text: { ...layer.text, style: withAttr(layer.text.style) } };
					}

					if (type === 'edge' && layer.edge) {
						return { ...layer, edge: { ...layer.edge, style: withAttr(layer.edge.style) } };
					}

					if (type === 'layer') {
						return { ...layer, style: withAttr(layer.style) };
					}

					return layer;
				})
			}
		};
	}

	function applyOptimisticLayerUpdate(layerIds, updateLayer) {
		const docAtom = editorDocAtom;
		const items = docAtom?.value?.layers?.items;
		if (!Array.isArray(items)) {
			return;
		}

		const ids = new Set(layerIds);
		docAtom.value = {
			...docAtom.value,
			layers: {
				...docAtom.value.layers,
				items: items.map((layer) => (ids.has(layer.id) ? updateLayer(layer) : layer))
			}
		};
	}

	function changeSelectedTextType(cast, docValue, layersInOrderValue, renewType) {
		const layerIds = selectedLayersWithKind(docValue, layersInOrderValue, (layer) => !!layer?.text);
		if (layerIds.length) {
			cast('change_text_type', { layer_ids: layerIds, renew_type: renewType });
			applyOptimisticLayerUpdate(layerIds, (layer) => ({
				...layer,
				text: { ...layer.text, renew_type: renewType }
			}));
		}
	}

	function changeSelectedLayerShape(cast, docValue, layersInOrderValue, shapeId) {
		const layerIds = selectedLayersWithKind(docValue, layersInOrderValue, (layer) => !!layer?.box);
		if (layerIds.length) {
			cast('change_layer_shape', { layer_ids: layerIds, shape_id: shapeId });
			applyOptimisticLayerUpdate(layerIds, (layer) => ({
				...layer,
				box: { ...layer.box, shape: shapeId }
			}));
		}
	}

	function changeSelectedEdgeCyclic(cast, docValue, layersInOrderValue, cyclic) {
		const layerIds = selectedLayersWithKind(docValue, layersInOrderValue, (layer) => !!layer?.edge);
		if (layerIds.length) {
			cast('change_edge_attributes', { layer_ids: layerIds, attrs: { cyclic } });
			applyOptimisticLayerUpdate(layerIds, (layer) => ({
				...layer,
				edge: { ...layer.edge, cyclic }
			}));
		}
	}

	function selectedLayerKindCounts(docValue, layersInOrderValue) {
		const byId = layerMap(docValue);
		return selectedTopLevelLayerIds(layersInOrderValue).reduce(
			(counts, id) => {
				const layer = byId.get(id);
				counts.total += 1;
				if (layer?.text) {
					counts.text += 1;
				} else if (layer?.edge) {
					counts.edge += 1;
				} else if (layer?.box) {
					counts.box += 1;
				} else {
					counts.group += 1;
				}
				return counts;
			},
			{ total: 0, box: 0, edge: 0, text: 0, group: 0 }
		);
	}

	function promptSelectedStyle(cast, docValue, layersInOrderValue, type, attr, label, predicate) {
		const layerIds = selectedLayersWithKind(docValue, layersInOrderValue, predicate);
		if (!layerIds.length) {
			return;
		}
		const firstLayer = layerMap(docValue).get(layerIds[0]);
		const current =
			type === 'text'
				? firstLayer?.text?.style?.[attr]
				: type === 'edge'
					? firstLayer?.edge?.style?.[attr]
					: firstLayer?.style?.[attr];
		const val = prompt(label, current ?? '');
		if (val === null) {
			return;
		}
		changeSelectedStyle(cast, docValue, layersInOrderValue, type, attr, val, predicate);
	}

	function promptSelectedOpacity(cast, docValue, layersInOrderValue, type, attr, label, predicate) {
		const val = Number(prompt(label, '1'));
		if (!Number.isFinite(val)) {
			return;
		}
		changeSelectedStyle(
			cast,
			docValue,
			layersInOrderValue,
			type,
			attr,
			R.clamp(0, 1, val),
			predicate
		);
	}

	function createNewDrawing(evt) {
		evt.preventDefault();
		const formData = new FormData(evt.currentTarget);
		const name = formData.get('name')?.toString().trim() || 'Untitled';
		const selectedKind = formData.get('kind')?.toString().trim();
		const customKind = formData.get('custom_kind')?.toString().trim();
		const syntax_id = formData.get('syntax_id')?.toString().trim();
		const kind = selectedKind || customKind || 'de.renew.gui.CPNDrawing';

		data.commands
			.createDocument({
				name,
				kind,
				...(syntax_id && syntax_id !== 'none' ? { syntax_id } : {})
			})
			.then(() => {
				showNewDrawing.value = false;
			})
			.catch((e) => {
				queueError(e, 'Document could not be created');
			});
	}

	function toolbarLayoutSnapshot() {
		return {
			showMinimap: showMinimap.value,
			showHierarchy: showHierarchy.value,
			showCreateToolbar: showCreateToolbar.value,
			showDebug: showDebug.value,
			createToolbarOrder: createToolbarOrder.value,
			createToolbarWidth: createToolbarWidth.value,
			collapsedCreateToolGroups: collapsedCreateToolGroups.value
		};
	}

	function applyToolbarLayout(layout) {
		if (!layout || typeof layout !== 'object') {
			return false;
		}
		showMinimap.value = layout.showMinimap ?? showMinimap.value;
		showHierarchy.value = layout.showHierarchy ?? showHierarchy.value;
		showCreateToolbar.value = layout.showCreateToolbar ?? showCreateToolbar.value;
		showDebug.value = layout.showDebug ?? showDebug.value;
		if (layout.createToolbarWidth !== undefined) {
			setCreateToolbarWidth(layout.createToolbarWidth);
		}
		if (layout.createToolbarOrder) {
			createToolbarOrder.value = normalizeCreateToolbarOrder(layout.createToolbarOrder);
			persistCreateToolbarOrder();
		}
		collapsedCreateToolGroups.value = normalizeCollapsedCreateToolGroups(
			layout.collapsedCreateToolGroups
		);
		persistCollapsedCreateToolGroups();
		return true;
	}

	function normalizeToolbarLayouts(layouts) {
		if (!layouts || typeof layouts !== 'object' || Array.isArray(layouts)) {
			return {};
		}

		return Object.fromEntries(
			Object.entries(layouts)
				.filter(([name, layout]) => name && layout && typeof layout === 'object')
				.map(([name, layout]) => [String(name), layout])
		);
	}

	function loadToolbarLayouts() {
		return normalizeToolbarLayouts(
			safeJsonParse(localStorage.getItem(TOOLBAR_LAYOUTS_STORAGE_KEY))
		);
	}

	function persistToolbarLayouts(layouts = toolbarLayouts.value) {
		localStorage.setItem(
			TOOLBAR_LAYOUTS_STORAGE_KEY,
			JSON.stringify(normalizeToolbarLayouts(layouts))
		);
		toolbarLayouts.value = normalizeToolbarLayouts(layouts);
	}

	function toolbarLayoutNames() {
		return Object.keys(toolbarLayouts.value ?? {}).sort((a, b) => a.localeCompare(b));
	}

	function saveToolbarLayout(name = undefined) {
		const layoutName =
			name ??
			window.prompt('Toolbar layout name', toolbarLayoutNames()[0] ?? 'Last Layout')?.trim();

		if (!layoutName) {
			return;
		}

		const snapshot = toolbarLayoutSnapshot();
		localStorage.setItem(TOOLBAR_LAYOUT_STORAGE_KEY, JSON.stringify(snapshot));
		persistToolbarLayouts({
			...toolbarLayouts.value,
			[layoutName]: snapshot
		});
	}

	function loadToolbarLayout(name = undefined) {
		const layouts = normalizeToolbarLayouts(toolbarLayouts.value);
		const layout =
			(name ? layouts[name] : undefined) ??
			safeJsonParse(localStorage.getItem(TOOLBAR_LAYOUT_STORAGE_KEY));

		applyToolbarLayout(layout);
	}

	function resetToolbarLayout() {
		localStorage.removeItem(TOOLBAR_LAYOUT_STORAGE_KEY);
		showMinimap.value = true;
		showHierarchy.value = true;
		showCreateToolbar.value = true;
		showDebug.value = false;
		createToolbarOrder.value = {};
		localStorage.removeItem(CREATE_TOOLBAR_ORDER_STORAGE_KEY);
		localStorage.setItem(CREATE_TOOLBAR_LAYOUT_VERSION_STORAGE_KEY, CREATE_TOOLBAR_LAYOUT_VERSION);
		collapsedCreateToolGroups.value = [];
		localStorage.removeItem(CREATE_TOOLBAR_COLLAPSED_GROUPS_STORAGE_KEY);
		setCreateToolbarWidth(DEFAULT_CREATE_TOOLBAR_WIDTH);
	}

	function normalizeCollapsedCreateToolGroups(groups) {
		return uniqueLayerIds((Array.isArray(groups) ? groups : []).filter(Boolean).map(String));
	}

	function loadCollapsedCreateToolGroups() {
		return normalizeCollapsedCreateToolGroups(
			safeJsonParse(localStorage.getItem(CREATE_TOOLBAR_COLLAPSED_GROUPS_STORAGE_KEY))
		);
	}

	function persistCollapsedCreateToolGroups() {
		localStorage.setItem(
			CREATE_TOOLBAR_COLLAPSED_GROUPS_STORAGE_KEY,
			JSON.stringify(normalizeCollapsedCreateToolGroups(collapsedCreateToolGroups.value))
		);
	}

	function normalizeCreateToolbarWidth(size) {
		const value = Number(size);
		return Number.isFinite(value)
			? R.clamp(120, 480, Math.round(value))
			: DEFAULT_CREATE_TOOLBAR_WIDTH;
	}

	function loadCreateToolbarWidth() {
		return normalizeCreateToolbarWidth(localStorage.getItem(CREATE_TOOLBAR_WIDTH_STORAGE_KEY));
	}

	function setCreateToolbarWidth(size) {
		createToolbarWidth.value = normalizeCreateToolbarWidth(size);
		localStorage.setItem(CREATE_TOOLBAR_WIDTH_STORAGE_KEY, String(createToolbarWidth.value));
	}

	function startCreateToolbarResize(evt) {
		evt.preventDefault();
		evt.stopPropagation();

		const originX = evt.clientX;
		const initialWidth = createToolbarWidth.value;
		const previousCursor = document.body.style.cursor;
		const previousUserSelect = document.body.style.userSelect;
		document.body.style.cursor = 'ew-resize';
		document.body.style.userSelect = 'none';

		const move = (moveEvt) => {
			setCreateToolbarWidth(initialWidth + (moveEvt.clientX - originX));
		};

		const stop = () => {
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', stop);
			window.removeEventListener('pointercancel', stop);
			document.body.style.cursor = previousCursor;
			document.body.style.userSelect = previousUserSelect;
		};

		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', stop, { once: true });
		window.addEventListener('pointercancel', stop, { once: true });
	}

	function createToolGroupCollapsed(groupName) {
		return collapsedCreateToolGroups.value.includes(groupName);
	}

	function setCreateToolGroupCollapsed(groupName, collapsed) {
		const groups = new Set(normalizeCollapsedCreateToolGroups(collapsedCreateToolGroups.value));
		if (collapsed) {
			groups.add(groupName);
		} else {
			groups.delete(groupName);
		}
		collapsedCreateToolGroups.value = [...groups];
		persistCollapsedCreateToolGroups();
	}

	function toggleCreateToolGroupCollapsed(groupName) {
		setCreateToolGroupCollapsed(groupName, !createToolGroupCollapsed(groupName));
	}

	function deleteToolbarLayout(name = undefined) {
		if (!name) {
			resetToolbarLayout();
			return;
		}

		const { [name]: _removed, ...rest } = normalizeToolbarLayouts(toolbarLayouts.value);
		persistToolbarLayouts(rest);
	}

	function normalizeCreateToolbarOrder(order) {
		if (!order || typeof order !== 'object') {
			return {};
		}

		const groups = Array.isArray(order.groups) ? order.groups.filter(Boolean).map(String) : [];
		const hidden = Array.isArray(order.hidden) ? order.hidden.filter(Boolean).map(String) : [];
		const entries =
			order.entries && typeof order.entries === 'object' && !Array.isArray(order.entries)
				? Object.fromEntries(
						Object.entries(order.entries).map(([group, ids]) => [
							group,
							Array.isArray(ids) ? ids.filter(Boolean).map(String) : []
						])
					)
				: {};

		return { groups, entries, hidden: uniqueLayerIds(hidden) };
	}

	function loadCreateToolbarOrder() {
		if (
			localStorage.getItem(CREATE_TOOLBAR_LAYOUT_VERSION_STORAGE_KEY) !==
			CREATE_TOOLBAR_LAYOUT_VERSION
		) {
			localStorage.removeItem(CREATE_TOOLBAR_ORDER_STORAGE_KEY);
			localStorage.removeItem(CREATE_TOOLBAR_COLLAPSED_GROUPS_STORAGE_KEY);
			localStorage.setItem(
				CREATE_TOOLBAR_LAYOUT_VERSION_STORAGE_KEY,
				CREATE_TOOLBAR_LAYOUT_VERSION
			);
			return {};
		}

		return normalizeCreateToolbarOrder(
			safeJsonParse(localStorage.getItem(CREATE_TOOLBAR_ORDER_STORAGE_KEY))
		);
	}

	function persistCreateToolbarOrder() {
		localStorage.setItem(CREATE_TOOLBAR_LAYOUT_VERSION_STORAGE_KEY, CREATE_TOOLBAR_LAYOUT_VERSION);
		localStorage.setItem(
			CREATE_TOOLBAR_ORDER_STORAGE_KEY,
			JSON.stringify(createToolbarOrder.value)
		);
	}

	function orderedByPreference(items, preferredIds, idForItem) {
		const preferred = new Map((preferredIds ?? []).map((id, index) => [id, index]));

		return [...items].sort((a, b) => {
			const aId = idForItem(a);
			const bId = idForItem(b);
			const aPreferred = preferred.has(aId);
			const bPreferred = preferred.has(bId);

			if (aPreferred && bPreferred) {
				return preferred.get(aId) - preferred.get(bId);
			}

			if (aPreferred) {
				return -1;
			}

			if (bPreferred) {
				return 1;
			}

			return 0;
		});
	}

	function moveIdInList(ids, id, direction) {
		const index = ids.indexOf(id);
		if (index === -1) {
			return ids;
		}

		const targetIndex = R.clamp(0, ids.length - 1, index + direction);
		if (targetIndex === index) {
			return ids;
		}

		const next = [...ids];
		const [entry] = next.splice(index, 1);
		next.splice(targetIndex, 0, entry);
		return next;
	}

	function moveIdBeforeOrAfter(ids, movedId, targetId, after = false) {
		const sourceIndex = ids.indexOf(movedId);
		const targetIndex = ids.indexOf(targetId);

		if (sourceIndex === -1 || targetIndex === -1 || movedId === targetId) {
			return ids;
		}

		const next = [...ids];
		const [entry] = next.splice(sourceIndex, 1);
		const adjustedTargetIndex = next.indexOf(targetId);
		next.splice(adjustedTargetIndex + (after ? 1 : 0), 0, entry);
		return next;
	}

	function dragAfterTarget(evt) {
		const rect = evt.currentTarget.getBoundingClientRect();
		const horizontal = rect.width >= rect.height * 1.2;
		return horizontal
			? evt.clientX > rect.left + rect.width / 2
			: evt.clientY > rect.top + rect.height / 2;
	}

	function beginCreateToolGroupDrag(evt, groupName) {
		createToolbarDrag.value = { type: 'group', groupName };
		evt.dataTransfer.effectAllowed = 'move';
		evt.dataTransfer.setData('text/plain', `petristation-toolbar-group:${groupName}`);
	}

	function beginCreateToolEntryDrag(evt, groupName, item) {
		createToolbarDrag.value = {
			type: 'entry',
			groupName,
			itemId: createToolEntryId(item)
		};
		evt.dataTransfer.effectAllowed = 'copyMove';
		evt.dataTransfer.setData('application/x-petristation-toolbar-entry', createToolEntryId(item));
	}

	function allowCreateToolbarDrop(evt) {
		if (!createToolbarDrag.value) {
			return;
		}
		evt.preventDefault();
		evt.dataTransfer.dropEffect = 'move';
	}

	function dropCreateToolGroup(evt, targetGroupName, groups) {
		const drag = createToolbarDrag.value;
		if (drag?.type !== 'group') {
			return;
		}
		evt.preventDefault();
		evt.stopPropagation();

		const ids = createToolGroups(groups).map((group) => group.name);
		const nextIds = moveIdBeforeOrAfter(ids, drag.groupName, targetGroupName, dragAfterTarget(evt));

		createToolbarOrder.value = {
			...normalizeCreateToolbarOrder(createToolbarOrder.value),
			groups: nextIds
		};
		createToolbarDrag.value = null;
		persistCreateToolbarOrder();
	}

	function dropCreateToolEntry(evt, targetGroupName, targetItem, groups) {
		const drag = createToolbarDrag.value;
		if (drag?.type !== 'entry' || drag.groupName !== targetGroupName) {
			return;
		}
		evt.preventDefault();
		evt.stopPropagation();

		const group = createToolGroups(groups).find((candidate) => candidate.name === targetGroupName);
		if (!group) {
			createToolbarDrag.value = null;
			return;
		}

		const targetId = createToolEntryId(targetItem);
		const ids = (group.entries ?? []).map(createToolEntryId);
		const nextIds = moveIdBeforeOrAfter(ids, drag.itemId, targetId, dragAfterTarget(evt));
		const order = normalizeCreateToolbarOrder(createToolbarOrder.value);

		createToolbarOrder.value = {
			...order,
			entries: {
				...(order.entries ?? {}),
				[targetGroupName]: nextIds
			}
		};
		createToolbarDrag.value = null;
		persistCreateToolbarOrder();
	}

	function finishCreateToolbarDrag() {
		createToolbarDrag.value = null;
	}

	function moveCreateToolGroup(groupName, direction, groups) {
		const ids = createToolGroups(groups).map((group) => group.name);
		const nextIds = moveIdInList(ids, groupName, direction);

		createToolbarOrder.value = {
			...normalizeCreateToolbarOrder(createToolbarOrder.value),
			groups: nextIds
		};
		persistCreateToolbarOrder();
	}

	function moveCreateToolEntry(groupName, item, direction, groups) {
		const group = createToolGroups(groups).find((candidate) => candidate.name === groupName);
		if (!group) {
			return;
		}

		const itemId = createToolEntryId(item);
		const ids = (group.entries ?? []).map(createToolEntryId);
		const nextIds = moveIdInList(ids, itemId, direction);
		const order = normalizeCreateToolbarOrder(createToolbarOrder.value);

		createToolbarOrder.value = {
			...order,
			entries: {
				...(order.entries ?? {}),
				[groupName]: nextIds
			}
		};
		persistCreateToolbarOrder();
	}

	function setCreateToolHidden(itemId, hidden) {
		const order = normalizeCreateToolbarOrder(createToolbarOrder.value);
		const hiddenIds = new Set(order.hidden ?? []);

		if (hidden) {
			hiddenIds.add(itemId);
		} else {
			hiddenIds.delete(itemId);
		}

		createToolbarOrder.value = {
			...order,
			hidden: [...hiddenIds]
		};
		persistCreateToolbarOrder();
	}

	function hideCreateToolEntry(item) {
		setCreateToolHidden(createToolEntryId(item), true);
	}

	function showCreateToolEntryId(itemId, groupName = undefined) {
		setCreateToolHidden(itemId, false);
		if (groupName) {
			setCreateToolGroupCollapsed(groupName, false);
		}
	}

	function hideCreateToolGroup(groupName, groups) {
		const group = createToolGroups(groups).find((candidate) => candidate.name === groupName);
		if (!group) {
			return;
		}

		const order = normalizeCreateToolbarOrder(createToolbarOrder.value);
		const hiddenIds = new Set(order.hidden ?? []);
		for (const item of group.entries ?? []) {
			hiddenIds.add(createToolEntryId(item));
		}

		createToolbarOrder.value = {
			...order,
			hidden: [...hiddenIds]
		};
		persistCreateToolbarOrder();
	}

	function showAllCreateTools() {
		const order = normalizeCreateToolbarOrder(createToolbarOrder.value);
		createToolbarOrder.value = {
			...order,
			hidden: []
		};
		collapsedCreateToolGroups.value = [];
		persistCreateToolbarOrder();
		persistCollapsedCreateToolGroups();
	}

	function hiddenCreateToolEntries(groups) {
		const order = normalizeCreateToolbarOrder(createToolbarOrder.value);
		const hiddenIds = new Set(order.hidden ?? []);
		const entries = [];

		for (const group of createToolGroups(groups)) {
			for (const item of group.entries ?? []) {
				const id = createToolEntryId(item);
				if (hiddenIds.has(id)) {
					entries.push({
						id,
						groupName: group.name,
						name: item.name
					});
				}
			}
		}

		return entries;
	}

	function printDrawing(evt) {
		evt.preventDefault();
		window.print();
	}

	function openToolOptions(evt, options) {
		evt.preventDefault();
		evt.stopPropagation();
		toolOptions.value = options;
		showToolOptions.value = true;
	}

	function runToolOption(action) {
		if (typeof action === 'function') {
			action();
		}
		showToolOptions.value = false;
	}

	function validateAllInscriptions(docValue) {
		let issueCount = 0;
		for (const layer of docValue?.layers?.items ?? []) {
			const before = errors.value.length;
			validateEditedInscription(layer, docValue);
			if (errors.value.length > before) {
				issueCount += 1;
			}
		}

		if (issueCount === 0) {
			statusMessage.value = 'No inscription syntax problems found.';
		} else {
			statusMessage.value = `${issueCount} inscription syntax problem${issueCount === 1 ? '' : 's'} found.`;
		}
	}

	async function checkInscriptions(docValue) {
		const href = data.document?.links?.check_inscriptions?.href;

		if (!href) {
			validateAllInscriptions(docValue);
			return;
		}

		try {
			const response = await fetch(href, {
				headers: {
					accept: 'application/json',
					...(data.authState?.value?.token
						? { authorization: `Bearer ${data.authState.value.token}` }
						: {})
				}
			});

			if (!response.ok) {
				throw new Error(`Unexpected server response (${response.status})`);
			}

			const result = await response.json();
			const issues = Array.isArray(result?.issues) ? result.issues : [];

			for (const issue of issues) {
				queueError({
					title: issue.title ?? 'Syntax Error',
					message: issue.message ?? 'Inscription syntax problem.',
					detail: issue.detail
				});
			}

			if (issues.length === 0) {
				statusMessage.value = 'No inscription syntax problems found.';
			} else {
				statusMessage.value = `${issues.length} inscription syntax problem${issues.length === 1 ? '' : 's'} found.`;
			}
		} catch (error) {
			validateAllInscriptions(docValue);
			queueError(error, 'Server-side inscription syntax check could not be performed.');
		}
	}

	function isInscriptionLayer(layer) {
		return !!layer?.text && matchesTextType(layer, 'inscriptions');
	}

	function isQualifiedInscriptionTarget(layer) {
		return isPlaceLayer(layer) || isArcLayer(layer) || isVirtualPlaceLayer(layer);
	}

	function relinkSelectedInscription(cast, docValue) {
		const byId = layerMap(docValue);
		const selected = selectedLayers.value.map((id) => byId.get(id)).filter(Boolean);
		const inscriptions = selected.filter(isInscriptionLayer);
		const targets = selected.filter((layer) => !isInscriptionLayer(layer));

		if (inscriptions.length !== 1 || targets.length !== 1) {
			queueError({
				title: 'Selection Error',
				message: 'Select exactly one inscription and one target figure.',
				detail:
					'The command changes which figure an inscription belongs to. It needs one selected inscription and one selected place or arc.'
			});
			return;
		}

		const target = targets[0];
		if (!isQualifiedInscriptionTarget(target)) {
			queueError({
				title: 'Syntax Error',
				message: 'The selected target cannot carry an inscription.',
				detail:
					'Renew accepts inscriptions on places and arcs. Select a place or arc together with the inscription.'
			});
			return;
		}

		cast('link_layer', {
			layer_id: inscriptions[0].id,
			target_layer_id: target.id
		});
	}

	function inscriptionHitPoint(layer, textBoundsValue) {
		if (!layer?.text) {
			return undefined;
		}

		const bounds = textBoundsValue?.[layer.id];
		const width = Number.isFinite(bounds?.width) ? bounds.width : 1;
		const height = Number.isFinite(bounds?.height) ? bounds.height : 1;

		return {
			x: layer.text.position_x + width / 2,
			y: layer.text.position_y + height / 2
		};
	}

	function relinkMovedInscriptions(cast, docValue, layersInOrderValue, movedLayerIds) {
		if (!cast || !docValue || !Array.isArray(layersInOrderValue) || !movedLayerIds?.length) {
			return;
		}

		const byId = layerMap(docValue);
		const tolerance = 10 * cameraScale.value;
		const inscriptionContent = { renew_type: RENEW_TEXT_TYPE.INSCRIPTION };

		for (const layerId of uniqueLayerIds(movedLayerIds)) {
			const layer = byId.get(layerId);
			if (!isInscriptionLayer(layer)) {
				continue;
			}

			const point = inscriptionHitPoint(layer, textBounds.value);
			if (!point) {
				continue;
			}

			const target = linkedPrimitiveTargetAtPosition(
				point,
				layersInOrderValue,
				docValue,
				textBounds.value,
				tolerance,
				inscriptionContent
			);

			if (!target?.id || target.id === layer.hyperlink) {
				continue;
			}

			cast('link_layer', {
				layer_id: layer.id,
				target_layer_id: target.id
			});
		}
	}

	function inscriptionForTarget(target, docValue) {
		if (!target?.id) {
			return null;
		}

		const byId = layerMap(docValue);
		return (
			(docValue?.layers?.items ?? []).find(
				(layer) => isInscriptionLayer(layer) && textTargetLayer(layer, byId)?.id === target.id
			) ?? null
		);
	}

	function inscriptionPositionFromContext(evt, target, liveLenses, fallbackBounds) {
		if (Number.isFinite(evt?.clientX) && Number.isFinite(evt?.clientY)) {
			return snapCanvasPoint(liveLenses.clientToCanvas(evt.clientX, evt.clientY));
		}

		if (fallbackBounds) {
			return snapCanvasPoint({
				x: fallbackBounds.x + (fallbackBounds.width ?? 0) / 2,
				y: fallbackBounds.y + (fallbackBounds.height ?? 0) / 2
			});
		}

		if (target?.box) {
			return snapCanvasPoint({
				x: target.box.position_x + target.box.width / 2,
				y: target.box.position_y + target.box.height / 2
			});
		}

		if (target?.edge) {
			return snapCanvasPoint({
				x: (target.edge.source_x + target.edge.target_x) / 2,
				y: (target.edge.source_y + target.edge.target_y) / 2
			});
		}

		return { x: 0, y: 0 };
	}

	function beginDirectInscriptionEdit(
		evt,
		target,
		liveLenses,
		dispatch,
		cast,
		docValue,
		fallbackBounds
	) {
		if (activeTool.value !== 'select' || !isQualifiedInscriptionTarget(target)) {
			return false;
		}

		evt.preventDefault();
		evt.stopPropagation();

		const existing = inscriptionForTarget(target, docValue);
		if (existing) {
			const bounds = textBounds.value?.[existing.id] ?? { lockToTextPosition: true };
			return beginInlineTextEdit(evt, existing, bounds, cast, {
				force: true,
				select: true,
				requireTextHit: false
			});
		}

		const position = inscriptionPositionFromContext(evt, target, liveLenses, fallbackBounds);
		const style = isArcLayer(target)
			? {
					background_color: '#ffffff',
					background_opacity: 1
				}
			: undefined;

		dispatch('create_layer', {
			base_layer_id: target.id,
			pos: position,
			body: '',
			semantic_tag: 'de.renew.gui.CPNTextFigure',
			renew_type: RENEW_TEXT_TYPE.INSCRIPTION,
			hyperlink: target.id,
			style
		})
			.then(({ id }) => {
				if (!id) {
					return;
				}
				publishSelection(cast, [id]);
				inlineTextEdit.value = {
					id,
					body: '',
					bounds: { lockToTextPosition: true },
					blankLines: false
				};
			})
			.catch((e) => queueError(e, 'Inscription could not be created'));

		return true;
	}

	function edgePoints(edge) {
		const waypoints = L.get(localProp('waypoints'), edge) ?? edge.waypoints ?? [];
		return [
			{ x: edge.source_x, y: edge.source_y },
			...waypoints,
			{ x: edge.target_x, y: edge.target_y }
		].filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y));
	}

	function edgeContainsPoint(edge, point, tolerance) {
		const points = edgePoints(edge);

		for (let i = 1; i < points.length; i++) {
			if (
				Geo.pointToLineDistance(point, {
					from: points[i - 1],
					to: points[i]
				}) <= tolerance
			) {
				return true;
			}
		}

		return false;
	}

	function edgeWaypointInsertion(edge, point, tolerance) {
		if (!edge || !point) {
			return undefined;
		}

		const waypoints = L.get(localProp('waypoints'), edge) ?? edge.waypoints ?? [];
		const points = [
			{ x: edge.source_x, y: edge.source_y, id: null },
			...waypoints,
			{ x: edge.target_x, y: edge.target_y, id: '__target' }
		].filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y));

		let closest = undefined;

		for (let i = 1; i < points.length; i++) {
			const distance = Geo.pointToLineDistance(point, {
				from: points[i - 1],
				to: points[i]
			});

			if (!closest || distance < closest.distance) {
				closest = {
					distance,
					after_waypoint_id: points[i - 1].id,
					position: point
				};
			}
		}

		if (!closest || closest.distance > tolerance) {
			return undefined;
		}

		return {
			after_waypoint_id: closest.after_waypoint_id,
			position: closest.position
		};
	}

	function edgeWaypointNear(edge, point, tolerance) {
		if (!edge || !point) {
			return undefined;
		}

		const waypoints = L.get(localProp('waypoints'), edge) ?? edge.waypoints ?? [];
		let closest = undefined;

		for (const waypoint of waypoints) {
			if (!waypoint?.id || !Number.isFinite(waypoint?.x) || !Number.isFinite(waypoint?.y)) {
				continue;
			}

			const distance = Math.hypot(waypoint.x - point.x, waypoint.y - point.y);
			if (!closest || distance < closest.distance) {
				closest = {
					id: waypoint.id,
					distance
				};
			}
		}

		return closest && closest.distance <= tolerance ? closest : undefined;
	}

	function localPointerPosition(evt, liveLenses) {
		const target = evt.currentTarget;
		const svg = target?.ownerSVGElement;
		const screenMatrix = target?.getScreenCTM?.();

		if (svg && screenMatrix) {
			try {
				const point = svg.createSVGPoint();
				point.x = evt.clientX;
				point.y = evt.clientY;
				const local = point.matrixTransform(screenMatrix.inverse());
				return { x: local.x, y: local.y };
			} catch {
				// Fall through to the canvas transform when the browser cannot invert the SVG matrix.
			}
		}

		return liveLenses.clientToCanvas(evt.clientX, evt.clientY);
	}

	function beginUnselectedEdgeWaypointDrag(evt, layer, edge, liveLenses) {
		if (
			!['select', 'edge'].includes(activeTool.value) ||
			(activeTool.value === 'select' && selectedLayers.value.includes(layer?.id)) ||
			!layer?.edge ||
			!evt.isPrimary ||
			!E.isLeftButton(evt)
		) {
			return false;
		}

		const start = localPointerPosition(evt, liveLenses);
		const tolerance = 10 * cameraScale.value;
		const existing =
			activeTool.value === 'edge' ? edgeWaypointNear(edge, start, tolerance) : undefined;
		const insertion = existing ? undefined : edgeWaypointInsertion(edge, start, tolerance);

		if (!insertion && !existing) {
			return false;
		}

		const startWaypoints = Array.isArray(edge?.waypoints)
			? edge.waypoints.map((waypoint) => ({ ...waypoint }))
			: [];
		const startEdge = { ...edge, waypoints: startWaypoints };

		edgeWaypointDrag.value = {
			pointerId: evt.pointerId,
			layerId: layer.id,
			afterWaypointId: insertion?.after_waypoint_id,
			deleteWaypointId: existing?.id,
			createOnClick: activeTool.value === 'edge',
			startEdge,
			startWaypoints,
			start,
			current: insertion?.position ?? start,
			screenStart: { x: evt.clientX, y: evt.clientY },
			moved: false
		};
		backoffValue.value = true;
		evt.preventDefault();
		evt.stopPropagation();
		evt.currentTarget.setPointerCapture(evt.pointerId);
		evt.currentTarget.currentPointerId = evt.pointerId;
		return true;
	}

	function updateUnselectedEdgeWaypointDrag(evt, liveLenses) {
		const drag = edgeWaypointDrag.value;
		if (!drag || drag.pointerId !== evt.pointerId) {
			return false;
		}

		const dx = evt.clientX - drag.screenStart.x;
		const dy = evt.clientY - drag.screenStart.y;
		edgeWaypointDrag.value = {
			...drag,
			current: localPointerPosition(evt, liveLenses),
			moved: drag.moved || Math.hypot(dx, dy) >= EDGE_WAYPOINT_DRAG_THRESHOLD
		};
		evt.preventDefault();
		evt.stopPropagation();
		return true;
	}

	function finishUnselectedEdgeWaypointDrag(evt, cast, docAtom = undefined) {
		const drag = edgeWaypointDrag.value;
		if (!drag || drag.pointerId !== evt.pointerId) {
			return false;
		}

		evt.preventDefault();
		evt.stopPropagation();

		let action;
		let dispatched = false;
		if (drag.deleteWaypointId) {
			if (!drag.moved) {
				edgeWaypointDrag.value = undefined;
				return true;
			}
			action = cast('update_waypoint_position', {
				layer_id: drag.layerId,
				waypoint_id: drag.deleteWaypointId,
				value: drag.current
			});
			dispatched = true;
		} else if (drag.moved || drag.createOnClick) {
			action = cast('create_waypoint', {
				layer_id: drag.layerId,
				after_waypoint_id: drag.afterWaypointId,
				position: drag.current
			});
			dispatched = true;
		}

		// `cast` is fire-and-forget and always resolves to `undefined`, so we must not
		// gate the optimistic preview on the action's truthiness (that check was always
		// false, which is why the edge-tool path snapped back to the server value on
		// release while the selected-handle path — which holds unconditionally — did
		// not).
		if (dispatched) {
			const committedWaypoints = pendingWaypointPreview(
				drag.startWaypoints ?? [],
				{ ...drag, moved: true },
				drag.layerId
			);
			holdCommittedEdgeWaypointPreview(
				drag.layerId,
				drag.startEdge,
				committedWaypoints,
				action,
				docAtom
			);
		}

		if (activeTool.value !== 'edge') {
			publishSelection(cast, [drag.layerId]);
		} else {
			suppressNextEdgeWaypointClick = drag.layerId;
			resetTransientEdgeTool();
		}
		edgeWaypointDrag.value = undefined;
		return true;
	}

	function cancelUnselectedEdgeWaypointDrag(evt) {
		if (!edgeWaypointDrag.value || edgeWaypointDrag.value.pointerId !== evt.pointerId) {
			return false;
		}

		edgeWaypointDrag.value = undefined;
		return true;
	}

	function setCommittedEdgeWaypointPreview(layerId, waypoints) {
		committedEdgeWaypointPreviews.value = new Map(committedEdgeWaypointPreviews.value).set(
			layerId,
			waypoints
		);
	}

	function clearCommittedEdgeWaypointPreview(layerId) {
		const previews = new Map(committedEdgeWaypointPreviews.value);
		previews.delete(layerId);
		committedEdgeWaypointPreviews.value = previews;
	}

	function setCommittedEdgePreview(layerId, edge) {
		committedEdgePreviewOverrides.value = new Map(committedEdgePreviewOverrides.value).set(
			layerId,
			edge
		);
	}

	function clearCommittedEdgePreview(layerId) {
		const previews = new Map(committedEdgePreviewOverrides.value);
		previews.delete(layerId);
		committedEdgePreviewOverrides.value = previews;
	}

	function documentEdgeByLayerId(docValue, layerId) {
		return docValue?.layers?.items?.find((layer) => layer.id === layerId)?.edge;
	}

	function patchDocumentEdge(docAtom, layerId, edge) {
		const items = docAtom?.value?.layers?.items;
		if (!Array.isArray(items) || !edge) {
			return false;
		}

		let changed = false;
		const patchedItems = items.map((layer) => {
			if (layer?.id !== layerId || !layer?.edge) {
				return layer;
			}

			changed = true;
			return {
				...layer,
				edge: {
					...layer.edge,
					...edge,
					waypoints: copyEdgeWaypoints(edge.waypoints)
				}
			};
		});

		if (changed) {
			docAtom.value = {
				...docAtom.value,
				layers: {
					...docAtom.value.layers,
					items: patchedItems
				}
			};
		}

		return changed;
	}

	// Store an optimistic waypoint update as a localProp draft on the document edge
	// instead of overwriting `edge.waypoints`. The draft lives in `edge.__draft` and
	// is read back through the `localProp('waypoints')` lens while rendering, so the
	// new shape is shown immediately, but `edge.waypoints` keeps holding the last
	// server value. That separation matters for the committed-preview hold: the sync
	// check (edgeGeometryMatches) inspects `edge.waypoints` directly, so it only
	// reports "synced" once the server has actually applied the change rather than
	// being fooled by our own optimistic patch. It also makes the draft self-clear —
	// once the server value differs from the recorded base, the lens falls back to it.
	function setDocumentEdgeWaypointDraft(docAtom, layerId, waypoints) {
		const items = docAtom?.value?.layers?.items;
		if (!Array.isArray(items)) {
			return false;
		}

		let changed = false;
		const patchedItems = items.map((layer) => {
			if (layer?.id !== layerId || !layer?.edge) {
				return layer;
			}

			changed = true;
			return {
				...layer,
				edge: L.set(localProp('waypoints'), copyEdgeWaypoints(waypoints), layer.edge)
			};
		});

		if (changed) {
			docAtom.value = {
				...docAtom.value,
				layers: {
					...docAtom.value.layers,
					items: patchedItems
				}
			};
		}

		return changed;
	}

	function resetDocumentEdgeWaypointDraft(docAtom, layerId) {
		const items = docAtom?.value?.layers?.items;
		if (!Array.isArray(items)) {
			return false;
		}

		let changed = false;
		const patchedItems = items.map((layer) => {
			if (layer?.id !== layerId || !layer?.edge?.__draft?.waypoints) {
				return layer;
			}

			changed = true;
			return {
				...layer,
				edge: L.set(localProp('waypoints'), localProp.reset, layer.edge)
			};
		});

		if (changed) {
			docAtom.value = {
				...docAtom.value,
				layers: {
					...docAtom.value.layers,
					items: patchedItems
				}
			};
		}

		return changed;
	}

	function clearCommittedEdgePreviewAfterSync(
		layerId,
		previewEdge,
		docAtom,
		clearWaypoints = false
	) {
		if (!docAtom) {
			setTimeout(() => {
				if (clearWaypoints) {
					clearCommittedEdgeWaypointPreview(layerId);
				}
				clearCommittedEdgePreview(layerId);
			}, COMMITTED_EDGE_PREVIEW_HOLD_MS);
			return;
		}

		const startedAt = performance.now();
		const check = () => {
			const edge = documentEdgeByLayerId(docAtom.value, layerId);
			const synced = edgeGeometryMatches(edge, previewEdge);
			const expired = performance.now() - startedAt >= COMMITTED_EDGE_PREVIEW_HOLD_MS;

			if (synced || expired) {
				if (clearWaypoints) {
					clearCommittedEdgeWaypointPreview(layerId);
					resetDocumentEdgeWaypointDraft(docAtom, layerId);
				}
				clearCommittedEdgePreview(layerId);
				return;
			}

			setTimeout(check, 40);
		};

		setTimeout(check, 40);
	}

	function copyEdgeWaypoints(waypoints) {
		return Array.isArray(waypoints) ? waypoints.map((waypoint) => ({ ...waypoint })) : [];
	}

	function holdCommittedEdgeWaypointPreview(layerId, edge, waypoints, action, docAtom = undefined) {
		const committedWaypoints = copyEdgeWaypoints(waypoints);
		const previewEdge = {
			...(edge ?? {}),
			waypoints: committedWaypoints
		};
		setCommittedEdgeWaypointPreview(layerId, committedWaypoints);
		setCommittedEdgePreview(layerId, previewEdge);
		// Apply the optimistic waypoints as a self-clearing localProp draft rather than
		// overwriting the document edge. This keeps `edge.waypoints` at the server value
		// so the committed-preview hold is only released once the server truly confirms
		// the change (see setDocumentEdgeWaypointDraft) — otherwise a server state push
		// arriving after an early release would briefly snap the edge back to its old
		// shape.
		setDocumentEdgeWaypointDraft(docAtom, layerId, committedWaypoints);

		Promise.resolve(action)
			.then(() => {
				clearCommittedEdgePreviewAfterSync(layerId, previewEdge, docAtom, true);
			})
			.catch(() => {
				resetDocumentEdgeWaypointDraft(docAtom, layerId);
				clearCommittedEdgeWaypointPreview(layerId);
				clearCommittedEdgePreview(layerId);
			});
	}

	function pendingWaypointPreview(waypoints, drag, layerId) {
		if (!drag?.moved || drag.layerId !== layerId) {
			return waypoints;
		}

		if (drag.deleteWaypointId) {
			return Array.isArray(waypoints)
				? waypoints.map((waypoint) =>
						waypoint.id === drag.deleteWaypointId
							? {
									...waypoint,
									x: drag.current.x,
									y: drag.current.y
								}
							: waypoint
					)
				: waypoints;
		}

		const pending = {
			id: '__pending',
			x: drag.current.x,
			y: drag.current.y
		};
		const list = Array.isArray(waypoints) ? waypoints : [];

		if (!drag.afterWaypointId) {
			return [pending, ...list];
		}

		const index = list.findIndex((waypoint) => waypoint.id === drag.afterWaypointId);

		if (index === -1) {
			return [...list, pending];
		}

		return [...list.slice(0, index + 1), pending, ...list.slice(index + 1)];
	}

	function linkedPrimitiveTargetAtPosition(
		position,
		layersInOrderValue,
		docValue,
		textBoundsValue,
		tolerance,
		content = undefined
	) {
		const layerById = new Map(docValue.layers.items.map((layer) => [layer.id, layer]));

		for (const layerInfo of [...layersInOrderValue].reverse()) {
			if (layerInfo.hidden) {
				continue;
			}

			const layer = layerById.get(layerInfo.id);
			if (!layer?.box && !layer?.edge) {
				continue;
			}

			const boundingBox = layerBox(layerInfo, layer, textBoundsValue);
			if (!finiteBox(boundingBox)) {
				continue;
			}

			const hitBox = layer.edge ? expandBox(boundingBox, tolerance) : boundingBox;
			if (!boxContainsPoint(hitBox, position)) {
				continue;
			}

			if (
				(layer.box || edgeContainsPoint(layer.edge, position, tolerance)) &&
				(!content || canTargetLinkedPrimitiveContent(content, layer))
			) {
				return layer;
			}
		}

		return undefined;
	}

	function layersInsideBox(box, layersInOrderValue, docValue, textBoundsValue) {
		const layerById = new Map(docValue.layers.items.map((layer) => [layer.id, layer]));

		return layersInOrderValue
			.filter(({ hidden }) => !hidden)
			.filter((layerInfo) => {
				const boundingBox = layerBox(layerInfo, layerById.get(layerInfo.id), textBoundsValue);
				return finiteBox(boundingBox) && boxContainsBox(box, boundingBox);
			})
			.map(({ id }) => id);
	}

	function clearAreaSelectionDelay() {
		if (areaSelectionDelay !== undefined) {
			clearTimeout(areaSelectionDelay);
			areaSelectionDelay = undefined;
		}
	}

	function isAreaSelectionPointer(evt) {
		if (evt.shiftKey && !evt.metaKey && !evt.ctrlKey && !evt.altKey) {
			return E.isLeftButton(evt, true);
		}

		return E.isLeftButton(evt);
	}

	function beginAreaSelection(evt, liveLenses) {
		if (activeTool.value !== 'select' || !evt.isPrimary || !isAreaSelectionPointer(evt)) {
			return;
		}

		const start = snapCanvasPoint(liveLenses.clientToCanvas(evt.clientX, evt.clientY));
		rememberPasteLocation(start);
		areaSelection.value = {
			pointerId: evt.pointerId,
			start,
			current: start,
			active: false,
			add: evt.shiftKey
		};

		evt.currentTarget.setPointerCapture(evt.pointerId);
		clearAreaSelectionDelay();
		areaSelectionDelay = setTimeout(() => {
			if (areaSelection.value?.pointerId === evt.pointerId) {
				areaSelection.value = { ...areaSelection.value, active: true };
				backoffValue.value = true;
			}
		}, AREA_SELECTION_DELAY);
	}

	function updateAreaSelection(evt, liveLenses) {
		if (areaSelection.value?.pointerId !== evt.pointerId) {
			return;
		}

		areaSelection.value = {
			...areaSelection.value,
			current: liveLenses.clientToCanvas(evt.clientX, evt.clientY)
		};
	}

	function finishAreaSelection(evt, liveLenses, cast, layersInOrderValue, docValue) {
		if (areaSelection.value?.pointerId !== evt.pointerId) {
			return;
		}

		updateAreaSelection(evt, liveLenses);
		clearAreaSelectionDelay();

		if (areaSelection.value.active) {
			const box = normalizedBox(areaSelection.value);
			const ids = layersInsideBox(box, layersInOrderValue, docValue, textBounds.value);
			mergeAreaSelection(cast, ids, areaSelection.value.add);
			backoffValue.value = true;
		}

		if (evt.currentTarget.hasPointerCapture(evt.pointerId)) {
			evt.currentTarget.releasePointerCapture(evt.pointerId);
		}

		areaSelection.value = undefined;
	}

	function cancelAreaSelection(evt) {
		clearAreaSelectionDelay();

		if (
			evt &&
			areaSelection.value?.pointerId === evt.pointerId &&
			evt.currentTarget.hasPointerCapture(evt.pointerId)
		) {
			evt.currentTarget.releasePointerCapture(evt.pointerId);
		}

		areaSelection.value = undefined;
	}

	function primitiveToolId(item) {
		return `primitive:${item?.name ?? ''}:${item?.data?.content?.semantic_tag ?? ''}`;
	}

	function isVirtualPlaceContent(content) {
		const tag = content?.semantic_tag ?? '';
		return tag === 'de.renew.gui.VirtualPlaceFigure' || tag.endsWith('.VirtualPlaceFigure');
	}

	function isVirtualTransitionContent(content) {
		const tag = content?.semantic_tag ?? '';
		return (
			tag === 'de.renew.gui.VirtualTransitionFigure' || tag.endsWith('.VirtualTransitionFigure')
		);
	}

	function isVirtualPrimitiveContent(content) {
		return isVirtualPlaceContent(content) || isVirtualTransitionContent(content);
	}

	function primitiveContent(tool) {
		return tool?.item?.data?.content ?? {};
	}

	function primitiveCreatesVirtualPlace(tool) {
		return tool?.type === 'primitive' && isVirtualPlaceContent(primitiveContent(tool));
	}

	function primitiveCreatesVirtualTransition(tool) {
		return tool?.type === 'primitive' && isVirtualTransitionContent(primitiveContent(tool));
	}

	function primitiveCreatesVirtualFigure(tool) {
		return primitiveCreatesVirtualPlace(tool) || primitiveCreatesVirtualTransition(tool);
	}

	const renewStandardToolNames = [
		'Rectangle Tool',
		'Round Rectangle Tool',
		'Ellipse Tool',
		'Elliptical Arc/Pie Tool',
		'Diamond Tool',
		'Triangle Tool',
		'Line Tool',
		'Connection Tool',
		'Elbow Connection Tool',
		'Target Tool',
		'Image Tool'
	];
	const renewPetriNetToolNames = [
		'Transition Tool',
		'Virtual Transition Tool',
		'Place Tool',
		'Virtual Place Tool',
		'Arc Tool',
		'Test Arc Tool',
		'Reserve Arc Tool',
		'Flexible Arc Tool',
		'Inhibitor Arc Tool',
		'Clear Arc Tool',
		'Inscription Tool',
		'Name Tool',
		'Declaration Tool',
		'Comment Tool'
	];
	const renewTextToolNames = ['Text Tool', 'Connected Text Tool'];
	const renewFaToolNames = [
		'FA Start State Tool',
		'FA State Tool',
		'FA End State Tool',
		'FA Start End State Tool',
		'FA Name Tool',
		'FA Inscription Tool',
		'FA Word Placement Tool',
		'FA ArcConnection Tool',
		'FA Loop ArcConnection Tool'
	];
	const defaultFormalismId = 'P/T Net Compiler';
	const formalismSpecificToolGroups = {
		'FA Automaton Compiler': ['FA Tools'],
		'FA Net Compiler': ['FA Tools']
	};
	const toolbarIconOverrides = {
		select:
			'<path d="M7 5 L7 27 L14 20 L18 29 L21 28 L17 19 L26 19 Z" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="miter" />',
		magnifier:
			'<circle cx="13" cy="13" r="8" fill="none" stroke="currentColor" stroke-width="2" /><path d="M19 19 L28 28" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="butt" />',
		zoomer:
			'<circle cx="13" cy="13" r="8" fill="none" stroke="currentColor" stroke-width="2" /><path d="M9 13 H17 M13 9 V17 M19 19 L28 28" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="butt" />',
		paner:
			'<path d="M10 19 L7 16 L7 24 L15 24 L12 21 C18 20 22 16 25 10" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="butt" stroke-linejoin="miter" />',
		rotator:
			'<path d="M23 10 A9 9 0 1 0 25 19" fill="none" stroke="currentColor" stroke-width="2" /><path d="M23 4 V11 H30" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="miter" />',
		pen: '<path d="M5 24 C9 9 13 27 17 12 C21 2 25 18 29 8" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" />',
		polygon:
			'<path d="M6 24 L13 7 L25 10 L28 23 L16 29 Z" fill="#f2df60" stroke="currentColor" stroke-width="2" stroke-linejoin="miter" />',
		spline:
			'<path d="M5 24 C10 5 20 29 28 8" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" />',
		spacer:
			'<path d="M8 8 H24 M8 24 H24 M12 10 V22 M20 10 V22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="butt" />',
		'Rectangle Tool':
			'<rect fill="#f2df60" x="4" y="7" width="24" height="18" stroke="#111" stroke-width="2" />',
		'Round Rectangle Tool':
			'<rect fill="#f2df60" x="4" y="7" width="24" height="18" rx="6" ry="6" stroke="#111" stroke-width="2" />',
		'Ellipse Tool':
			'<circle fill="#f2df60" cx="16" cy="16" r="12.5" stroke="#111" stroke-width="2" />',
		'Elliptical Arc/Pie Tool':
			'<path d="M16 16 L16 3 A13 13 0 1 1 3 16 Z" fill="#f2df60" stroke="#111" stroke-width="2" />',
		'Diamond Tool':
			'<path d="M16 3 L29 16 L16 29 L3 16 Z" fill="#f2df60" stroke="#111" stroke-width="2" />',
		'Triangle Tool':
			'<path d="M16 4 L29 28 L3 28 Z" fill="#f2df60" stroke="#111" stroke-width="2" />',
		'Line Tool':
			'<path d="M5 25 L27 7" fill="none" stroke="#111" stroke-width="2" stroke-linecap="butt" />',
		'Target Tool':
			'<circle cx="16" cy="16" r="10" fill="none" stroke="#111" stroke-width="1.8" /><path d="M16 5 V27 M5 16 H27" fill="none" stroke="#111" stroke-width="1.4" stroke-linecap="butt" />',
		'Image Tool':
			'<rect fill="#eee" x="5" y="5" width="22" height="22" stroke="#999" stroke-width="2" /><path d="M8 24 L14 17 L18 21 L22 14 L26 24 Z" fill="#ccc" stroke="none" />',
		'Text Tool':
			'<text text-anchor="middle" font-size="27" font-weight="bold" x="16" y="26" font-family="serif" fill="#111">A</text>',
		'Connected Text Tool':
			'<text x="4" y="12" font-size="12" font-family="serif" fill="#111">*</text><text text-anchor="middle" font-size="26" font-weight="bold" x="18" y="27" font-family="serif" fill="#111">A</text>',
		'Transition Tool':
			'<rect fill="#f2df60" x="6" y="9" width="20" height="14" stroke="#111" stroke-width="1.8" /><text x="16" y="20" text-anchor="middle" font-family="serif" font-size="10.5" font-weight="bold" fill="#111">T</text>',
		'Virtual Transition Tool':
			'<rect fill="#f2df60" x="6" y="9" width="20" height="14" stroke="#111" stroke-width="1.8" /><rect fill="none" x="9" y="12" width="14" height="8" stroke="#111" stroke-width="1.2" /><text x="16" y="20" text-anchor="middle" font-family="serif" font-size="8.5" font-weight="bold" fill="#111">T</text>',
		'Place Tool':
			'<circle fill="#f2df60" cx="16" cy="16" r="11.5" stroke="#111" stroke-width="1.8" /><text x="16" y="20" text-anchor="middle" font-family="serif" font-size="10.5" font-weight="bold" fill="#111">P</text>',
		'Virtual Place Tool':
			'<circle fill="#f2df60" cx="16" cy="16" r="11.5" stroke="#111" stroke-width="1.8" /><circle fill="none" cx="16" cy="16" r="8.2" stroke="#111" stroke-width="1.2" /><text x="16" y="20" text-anchor="middle" font-family="serif" font-size="8.5" font-weight="bold" fill="#111">P</text>',
		'Arc Tool':
			'<path d="M5 25 L25 5" fill="none" stroke="#111" stroke-width="1.9" stroke-linecap="butt" /><path d="M25 5 L19.4 7.5 L22.5 10.6 Z" fill="#111" stroke="#111" stroke-width="0.6" stroke-linejoin="miter" />',
		'Connection Tool':
			'<path d="M5 25 L27 7" fill="none" stroke="#111" stroke-width="1.9" stroke-linecap="butt" />',
		'Elbow Connection Tool':
			'<path d="M7 8 L7 24 L24 24" fill="none" stroke="#111" stroke-width="1.9" stroke-linecap="butt" stroke-linejoin="miter" />',
		'Test Arc Tool':
			'<path d="M5 25 L27 7" fill="none" stroke="#111" stroke-width="1.9" stroke-linecap="butt" />',
		'Reserve Arc Tool':
			'<path d="M5 25 L25 5" fill="none" stroke="#111" stroke-width="1.9" stroke-linecap="butt" /><path d="M25 5 L19.4 7.5 L22.5 10.6 Z" fill="#111" stroke="#111" stroke-width="0.6" stroke-linejoin="miter" /><path d="M5 25 L10.6 22.5 L7.5 19.4 Z" fill="#111" stroke="#111" stroke-width="0.6" stroke-linejoin="miter" />',
		'Flexible Arc Tool':
			'<path d="M5 25 L25 5" fill="none" stroke="#111" stroke-width="1.9" stroke-linecap="butt" /><path d="M25 5 L19.4 7.5 L22.5 10.6 Z" fill="#111" stroke="#111" stroke-width="0.6" stroke-linejoin="miter" /><path d="M21 9 L15.4 11.5 L18.5 14.6 Z" fill="#111" stroke="#111" stroke-width="0.6" stroke-linejoin="miter" />',
		'Inhibitor Arc Tool':
			'<path d="M6 24 L21 9" fill="none" stroke="#111" stroke-width="1.9" stroke-linecap="butt" /><circle cx="24" cy="6" r="3.8" fill="white" stroke="#111" stroke-width="1.7" />',
		'Clear Arc Tool':
			'<path d="M5 25 L25 5" fill="none" stroke="#111" stroke-width="1.9" stroke-linecap="butt" /><path d="M25 5 L19.4 7.5 L22.5 10.6 Z" fill="#111" stroke="#111" stroke-width="0.6" stroke-linejoin="miter" /><path d="M21 9 L15.4 11.5 L18.5 14.6 Z" fill="#111" stroke="#111" stroke-width="0.6" stroke-linejoin="miter" />',
		'Inscription Tool':
			'<text text-anchor="middle" font-size="25" font-weight="bold" x="16" y="25" font-family="serif" fill="#111">i</text>',
		'Name Tool':
			'<text text-anchor="middle" font-size="25" font-weight="bold" x="16" y="25" font-family="serif" fill="#111">n</text>',
		'Declaration Tool':
			'<text text-anchor="middle" font-size="25" font-weight="bold" x="16" y="25" font-family="serif" fill="#111">d</text>',
		'Comment Tool':
			'<text text-anchor="middle" font-size="22" font-weight="bold" x="16" y="24" font-family="serif" fill="#111">@</text>',
		'FA Start State Tool':
			'<circle fill="#fff" cx="16" cy="16" r="13.5" stroke="#111" stroke-width="2" /><path d="M3 3 L9 9" fill="none" stroke="#111" stroke-width="1.5" stroke-linecap="round" /><path d="M9 9 L4.5 8.2 M9 9 L8.2 4.5" fill="none" stroke="#111" stroke-width="1.5" stroke-linecap="round" />',
		'FA State Tool':
			'<circle fill="#fff" cx="16" cy="16" r="13.5" stroke="#111" stroke-width="2" />',
		'FA End State Tool':
			'<circle fill="#fff" cx="16" cy="16" r="13.5" stroke="#111" stroke-width="2" /><circle fill="none" cx="16" cy="16" r="10.2" stroke="#111" stroke-width="1.4" />',
		'FA Start End State Tool':
			'<circle fill="#fff" cx="16" cy="16" r="13.5" stroke="#111" stroke-width="2" /><circle fill="none" cx="16" cy="16" r="10.2" stroke="#111" stroke-width="1.4" /><path d="M3 3 L9 9" fill="none" stroke="#111" stroke-width="1.5" stroke-linecap="round" /><path d="M9 9 L4.5 8.2 M9 9 L8.2 4.5" fill="none" stroke="#111" stroke-width="1.5" stroke-linecap="round" />',
		'FA Name Tool':
			'<text text-anchor="middle" font-size="25" font-weight="bold" x="16" y="25" font-family="serif" fill="#111">n</text>',
		'FA Inscription Tool':
			'<text text-anchor="middle" font-size="25" font-weight="bold" x="16" y="25" font-family="serif" fill="#111">i</text>',
		'FA Word Placement Tool':
			'<text text-anchor="middle" font-size="20" font-weight="bold" font-style="italic" x="16" y="23" font-family="serif" fill="#025bff">w</text>',
		'FA ArcConnection Tool':
			'<path d="M5 25 L25 5" fill="none" stroke="#111" stroke-width="1.9" stroke-linecap="butt" /><path d="M25 5 L19.4 7.5 L22.5 10.6 Z" fill="#111" stroke="#111" stroke-width="0.6" stroke-linejoin="miter" />',
		'FA Loop ArcConnection Tool':
			'<path d="M9 20 C3 12 7 5 15 5 C23 5 27 12 22 19" fill="none" stroke="#111" stroke-width="1.9" stroke-linecap="butt" /><path d="M22 19 L18 16.5 L18.8 21 Z" fill="#111" stroke="#111" stroke-width="0.6" stroke-linejoin="miter" />'
	};

	function createToolEntryIcon(item) {
		if (isEditorToolEntry(item)) {
			return toolbarIconOverrides[item.id] ?? item.icon;
		}

		return toolbarIconOverrides[item?.name] ?? item?.icon ?? '';
	}

	function editorToolsById() {
		return new Map(
			editorToolGroupDefinitions.flatMap((group) => group.items).map((tool) => [tool.id, tool])
		);
	}

	function primitiveToolsByName(groups) {
		const map = new Map();
		for (const group of groups ?? []) {
			for (const item of group?.items ?? []) {
				if (!map.has(item?.name)) {
					map.set(item?.name, item);
				}
			}
		}
		return map;
	}

	function appendToolbarEntry(entries, item, usedIds) {
		if (!item) {
			return;
		}

		const id = createToolEntryId(item);
		if (usedIds.has(id)) {
			return;
		}

		usedIds.add(id);
		entries.push(item);
	}

	function takeEditorTools(toolById, ids, usedIds) {
		const entries = [];
		for (const id of ids) {
			appendToolbarEntry(entries, toolById.get(id), usedIds);
		}
		return entries;
	}

	function takeNamedTools(toolByName, names, usedIds) {
		const entries = [];
		for (const name of names) {
			appendToolbarEntry(entries, toolByName.get(name), usedIds);
		}
		return entries;
	}

	function selectedFormalismId(formalisms = []) {
		return (
			currentFormalism.value ??
			formalisms.find((formalism) => formalism?.default)?.id ??
			defaultFormalismId
		);
	}

	function selectedFormalismLabel(formalisms = []) {
		const selectedId = selectedFormalismId(formalisms);
		return formalisms.find((formalism) => formalism?.id === selectedId)?.label ?? selectedId;
	}

	function selectedFormalismEntry(formalisms = [], formalismId = selectedFormalismId(formalisms)) {
		return formalisms.find((formalism) => formalism?.id === formalismId);
	}

	function toolGroupsForFormalism(formalismId = selectedFormalismId()) {
		return formalismSpecificToolGroups[formalismId] ?? [];
	}

	function syntaxNameForFormalism(formalismId, formalisms = []) {
		return (
			selectedFormalismEntry(formalisms, formalismId)?.syntax_name ??
			(`${formalismId ?? ''}`.startsWith('FA ') ? 'FSM' : 'Reference Net')
		);
	}

	function shouldUpdateSyntaxForFormalism(docValue) {
		const currentSyntaxName = docValue?.syntax?.name;
		return (
			!currentSyntaxName || currentSyntaxName === 'Reference Net' || currentSyntaxName === 'FSM'
		);
	}

	function updateDocumentSyntaxForFormalism(
		formalismId,
		formalisms,
		syntaxesPromise,
		dispatch,
		docValue
	) {
		if (!dispatch || !shouldUpdateSyntaxForFormalism(docValue)) {
			return;
		}

		const syntaxName = syntaxNameForFormalism(formalismId, formalisms);

		Promise.resolve(syntaxesPromise)
			.then((syntaxes) => {
				const syntax = syntaxes?.items?.find((candidate) => candidate?.name === syntaxName);
				if (syntax?.id && syntax.id !== docValue?.syntax?.id) {
					return dispatch('set_meta', { syntax_id: syntax.id });
				}

				return undefined;
			})
			.catch((error) => queueError(error, 'Syntax could not be changed for formalism'));
	}

	function formalismAllowsToolGroup(groupName, formalismId = selectedFormalismId()) {
		if (groupName === 'FA' || groupName === 'FA Tools') {
			return toolGroupsForFormalism(formalismId).includes('FA Tools');
		}

		return true;
	}

	function handleFormalismChange(
		formalismId,
		cast = undefined,
		dispatch = undefined,
		syntaxesPromise = undefined,
		docValue = undefined,
		formalisms = []
	) {
		currentFormalism.value = formalismId || defaultFormalismId;
		updateDocumentSyntaxForFormalism(
			currentFormalism.value,
			formalisms,
			syntaxesPromise,
			dispatch,
			docValue
		);

		if (formalismAllowsToolGroup('FA Tools', currentFormalism.value)) {
			setCreateToolGroupCollapsed('FA Tools', false);
		} else if (renewFaToolNames.includes(activeCreateTool.value?.item?.name)) {
			selectEditorTool('select', cast);
		}
	}

	function renewToolPaletteGroups(groups) {
		const usedIds = new Set();
		const toolById = editorToolsById();
		const toolByName = primitiveToolsByName(groups);
		const standardTools = [
			...takeEditorTools(toolById, ['select'], usedIds),
			...takeNamedTools(toolByName, renewStandardToolNames, usedIds),
			...takeNamedTools(toolByName, renewTextToolNames, usedIds),
			...takeEditorTools(toolById, ['pen', 'polygon', 'spline', 'spacer'], usedIds)
		];
		const petriNetTools = takeNamedTools(toolByName, renewPetriNetToolNames, usedIds);
		const zoomTools = takeEditorTools(
			toolById,
			['magnifier', 'zoomer', 'paner', 'rotator'],
			usedIds
		);
		const visibleGroups = [
			{ name: 'Standard Tools', items: standardTools },
			{ name: 'Petri Net Tools', items: petriNetTools },
			{ name: 'Zoom Tools', items: zoomTools }
		].filter((group) => group.items.length);

		if (formalismAllowsToolGroup('FA Tools')) {
			const faTools = takeNamedTools(toolByName, renewFaToolNames, usedIds);
			if (faTools.length) {
				visibleGroups.push({ name: 'FA Tools', items: faTools });
			}
		}

		for (const group of [...editorToolGroupDefinitions, ...(groups ?? [])]) {
			if (!formalismAllowsToolGroup(group?.name)) {
				continue;
			}

			const remaining = [];
			for (const item of group?.items ?? []) {
				appendToolbarEntry(remaining, item, usedIds);
			}
			if (remaining.length) {
				visibleGroups.push({ name: group.name, items: remaining });
			}
		}

		return visibleGroups;
	}

	function createToolGroups(groups) {
		const order = normalizeCreateToolbarOrder(createToolbarOrder.value);
		const groupList = renewToolPaletteGroups(groups).map((group) => ({
			...group,
			entries: orderedByPreference(
				group?.items ?? [],
				order.entries?.[group?.name],
				createToolEntryId
			)
		}));

		return orderedByPreference(groupList, order.groups, (group) => group.name);
	}

	function isEdgeCreateToolEntry(entry) {
		return entry?.kind === 'edge-tool';
	}

	function isEditorToolEntry(entry) {
		return entry?.kind === 'editor-tool';
	}

	function edgeToolId(entry) {
		return `edge:${entry?.name ?? ''}`;
	}

	function editorToolId(entry) {
		return `editor:${entry?.id ?? entry?.name ?? ''}`;
	}

	function createToolEntryId(entry) {
		if (isEditorToolEntry(entry)) {
			return editorToolId(entry);
		}

		return isEdgeCreateToolEntry(entry) ? edgeToolId(entry) : primitiveToolId(entry);
	}

	function visibleCreateToolEntries(group) {
		const hiddenIds = new Set(normalizeCreateToolbarOrder(createToolbarOrder.value).hidden ?? []);
		return (group?.entries ?? []).filter((entry) => {
			return !hiddenIds.has(createToolEntryId(entry));
		});
	}

	function isSelectableCreatePrimitive(item) {
		return item?.data?.mimeType === LAYER_PRIMITIVE_MIME_TYPE;
	}

	function canActivateCreatePrimitive(item) {
		return isSelectableCreatePrimitive(item);
	}

	function isActiveCreatePrimitive(item) {
		return activeCreateTool.value?.id === primitiveToolId(item);
	}

	function edgeToolData(item) {
		return item?.data ?? {};
	}

	function isActiveEdgeCreateTool(item) {
		return activeTool.value === 'edge' && activeEdgeTool.value?.id === edgeToolId(item);
	}

	function activateEdgeCreateTool(item, persistent = false, cast = undefined) {
		if (!isEdgeCreateToolEntry(item)) {
			return false;
		}

		clearSelectionForNonSelectTool('edge', cast);
		activeCreateTool.value = undefined;
		primitiveCreation.value = undefined;
		inlineTextEdit.value = undefined;
		activeTool.value = 'edge';
		edgeToolPersistent = persistent;
		activeEdgeTool.value = {
			id: edgeToolId(item),
			...edgeToolData(item)
		};
		return true;
	}

	function activeEdgeValue(key, fallback = undefined) {
		const tool = activeTool.value === 'edge' ? activeEdgeTool.value : undefined;
		if (!tool) {
			return fallback;
		}

		return Object.prototype.hasOwnProperty.call(tool, key) ? tool[key] : fallback;
	}

	function activeEdgePayload() {
		if (activeTool.value !== 'edge' || !activeEdgeTool.value) {
			return {};
		}

		const { id, ...payload } = activeEdgeTool.value;
		return payload;
	}

	function normalizeEdgeSmoothness(value) {
		if (value === 'bspline') {
			return 'autobezier';
		}

		return value;
	}

	function activeEdgeStylePayload() {
		const style = {};
		const smoothness = normalizeEdgeSmoothness(activeEdgeValue('smoothness'));

		if (smoothness) {
			style.smoothness = smoothness;
		}

		return style;
	}

	function activeEdgeCreatesLoop() {
		return activeEdgeValue('loop', false) === true;
	}

	function edgeLoopWaypoints(docValue, layerId, loopPosition = undefined, loopClick = true) {
		const layer = layerMap(docValue).get(layerId);
		const box = layer?.box;

		if (!box) {
			return [];
		}

		const x = Number(box.position_x ?? 0);
		const y = Number(box.position_y ?? 0);
		const width = Number(box.width ?? 0);
		const height = Number(box.height ?? 0);
		const centerX = x + width / 2;
		const centerY = y + height / 2;
		const defaultMid = {
			x: centerX,
			y: y - 20
		};
		const mid = loopPosition && !loopClick ? loopPosition : defaultMid;
		const dx = mid.x - centerX;
		const dy = mid.y - centerY;
		const distance = Math.hypot(dx, dy);

		if (distance < 8) {
			return [
				{ x: centerX - 20, y: defaultMid.y },
				{ x: centerX + 20, y: defaultMid.y }
			];
		}

		const normalX = dy / distance;
		const normalY = -dx / distance;
		const spread = loopClick ? 20 : Math.max(20, Math.min(80, distance * 0.35));

		return [
			{ x: mid.x + normalX * spread, y: mid.y + normalY * spread },
			{ x: mid.x - normalX * spread, y: mid.y - normalY * spread }
		];
	}

	function clearSelectionForNonSelectTool(toolId, cast) {
		if (toolId !== 'select' && selectedLayers.value.length > 0) {
			clearSelection(cast);
		}
	}

	function activateCreatePrimitive(
		item,
		persistent = false,
		linkedTargetId = undefined,
		cast = undefined
	) {
		if (!canActivateCreatePrimitive(item, linkedTargetId)) {
			return false;
		}

		clearSelectionForNonSelectTool(CREATE_TOOL_ID, cast);
		activeCreateTool.value = {
			type: 'primitive',
			id: primitiveToolId(item),
			item,
			persistent,
			linkedTargetId
		};
		activeEdgeTool.value = undefined;
		primitiveCreation.value = undefined;
		inlineTextEdit.value = undefined;
		activeTool.value = CREATE_TOOL_ID;
		return true;
	}

	function blueprintToolId(blueprintId) {
		return `blueprint:${blueprintId ?? ''}`;
	}

	function canActivateBlueprintTool(blueprintId) {
		return typeof blueprintId === 'string' && blueprintId.length > 0;
	}

	function isActiveBlueprintTool(blueprintId) {
		return (
			activeCreateTool.value?.type === 'blueprint' &&
			activeCreateTool.value?.id === blueprintToolId(blueprintId)
		);
	}

	function activateBlueprintTool(blueprintId, persistent = false, cast = undefined) {
		if (!canActivateBlueprintTool(blueprintId)) {
			return false;
		}

		clearSelectionForNonSelectTool(CREATE_TOOL_ID, cast);
		activeCreateTool.value = {
			type: 'blueprint',
			id: blueprintToolId(blueprintId),
			blueprintId,
			persistent
		};
		activeEdgeTool.value = undefined;
		primitiveCreation.value = undefined;
		inlineTextEdit.value = undefined;
		activeTool.value = CREATE_TOOL_ID;
		return true;
	}

	function selectBlueprintTool(blueprintId, cast = undefined) {
		selectedBlueprint.value = blueprintId || undefined;

		if (activateBlueprintTool(selectedBlueprint.value, false, cast)) {
			return;
		}

		if (activeCreateTool.value?.type === 'blueprint') {
			selectEditorTool('select');
		}
	}

	function selectEditorTool(toolId, cast = undefined, persistent = false) {
		clearSelectionForNonSelectTool(toolId, cast);
		activeCreateTool.value = undefined;
		activeEdgeTool.value = undefined;
		primitiveCreation.value = undefined;
		inlineTextEdit.value = undefined;
		activeTool.value = toolId;
		edgeToolPersistent = toolId === 'edge' && persistent;
	}

	function resetToSelectTool() {
		selectEditorTool('select');
	}

	function resetTransientEdgeTool() {
		if (activeTool.value === 'edge' && !edgeToolPersistent) {
			resetToSelectTool();
		}
	}

	function createdAutoEdgeTargetLayerId(layer, reverse = false) {
		if (layer?.target_layer_id) {
			return layer.target_layer_id;
		}

		if (layer?.layer?.id) {
			return layer.layer.id;
		}

		const bond = reverse ? layer?.edge?.source_bond : layer?.edge?.target_bond;

		return bond?.layer_id ?? layer?.id;
	}

	function isPrimitiveCreationDrag(creation) {
		if (!creation?.screenStart || !creation?.screenCurrent) {
			return false;
		}

		return (
			Math.hypot(
				creation.screenCurrent.x - creation.screenStart.x,
				creation.screenCurrent.y - creation.screenStart.y
			) >= PRIMITIVE_CREATION_DRAG_THRESHOLD
		);
	}

	function beginPrimitiveCreation(evt, liveLenses) {
		if (!activeCreateTool.value || !evt.isPrimary || !E.isLeftButton(evt)) {
			return false;
		}

		const start = liveLenses.clientToCanvas(evt.clientX, evt.clientY);
		rememberPasteLocation(start);
		primitiveCreation.value = {
			pointerId: evt.pointerId,
			start,
			current: start,
			screenStart: { x: evt.clientX, y: evt.clientY },
			screenCurrent: { x: evt.clientX, y: evt.clientY },
			square: evt.shiftKey || evt.ctrlKey || evt.metaKey
		};
		backoffValue.value = true;

		evt.preventDefault();
		evt.stopPropagation();
		evt.currentTarget.setPointerCapture(evt.pointerId);
		return true;
	}

	function updatePrimitiveCreation(evt, liveLenses) {
		if (primitiveCreation.value?.pointerId !== evt.pointerId) {
			return false;
		}

		primitiveCreation.value = {
			...primitiveCreation.value,
			current: snapCanvasPoint(liveLenses.clientToCanvas(evt.clientX, evt.clientY)),
			screenCurrent: { x: evt.clientX, y: evt.clientY },
			square: evt.shiftKey || evt.ctrlKey || evt.metaKey
		};
		evt.preventDefault();
		evt.stopPropagation();
		return true;
	}

	function primitiveSupportsSizedCreation(tool) {
		return (
			tool?.type === 'primitive' &&
			(!!tool?.item?.data?.content?.shape_id || Array.isArray(tool?.item?.data?.content?.points)) &&
			!primitiveCreatesVirtualFigure(tool)
		);
	}

	function primitiveCreatesText(tool) {
		return tool?.type === 'primitive' && typeof tool?.item?.data?.content?.body === 'string';
	}

	function primitiveCreatesImage(tool) {
		const tag = primitiveContent(tool)?.semantic_tag ?? '';
		return tool?.type === 'primitive' && tag.endsWith('.ImageFigure');
	}

	function shouldInlineEditCreatedPrimitive(tool) {
		return primitiveCreatesText(tool);
	}

	function keepCreateToolWhileEditingCreatedPrimitive(tool) {
		return shouldInlineEditCreatedPrimitive(tool) && !tool?.persistent;
	}

	function activeCreateToolUsesCrosshair() {
		return (
			activeTool.value === CREATE_TOOL_ID &&
			(primitiveNeedsLinkedTarget(activeCreateTool.value) ||
				primitiveCreatesText(activeCreateTool.value))
		);
	}

	function canvasInteractionCursor() {
		return inlineTextEdit.value || activeCreateToolUsesCrosshair() ? 'crosshair' : undefined;
	}

	function textLayerUsesConnectedTool(layer) {
		const type = renewTextType(layer);
		return (
			isCpnTextLayer(layer) ||
			!!layer?.hyperlink ||
			type === RENEW_TEXT_TYPE.INSCRIPTION ||
			type === RENEW_TEXT_TYPE.NAME ||
			type === RENEW_TEXT_TYPE.AUX ||
			type === RENEW_TEXT_TYPE.COMM
		);
	}

	function primitiveTextToolIsConnected(item) {
		const content = item?.data?.content;
		const type = Number(content?.renew_type);
		return (
			!!content?.hyperlink ||
			content?.semantic_tag === 'de.renew.gui.CPNTextFigure' ||
			type === RENEW_TEXT_TYPE.INSCRIPTION ||
			type === RENEW_TEXT_TYPE.NAME ||
			type === RENEW_TEXT_TYPE.AUX ||
			type === RENEW_TEXT_TYPE.COMM
		);
	}

	function primitiveTextToolMatchesLayer(item, layer) {
		if (!primitiveCreatesText({ type: 'primitive', item })) {
			return false;
		}

		return textLayerUsesConnectedTool(layer) === primitiveTextToolIsConnected(item);
	}

	function primitiveItemsFromGroups(groups) {
		return (groups ?? []).flatMap((group) => group?.items ?? []);
	}

	function activateTextToolForContextEdit(layer, cast) {
		clearSelectionForNonSelectTool(CREATE_TOOL_ID, cast);

		data.primitives
			.then((groups) => {
				const items = primitiveItemsFromGroups(groups).filter((item) =>
					primitiveCreatesText({ type: 'primitive', item })
				);
				const item =
					items.find((candidate) => primitiveTextToolMatchesLayer(candidate, layer)) ?? items[0];

				if (!item) {
					return;
				}

				activeCreateTool.value = {
					type: 'primitive',
					id: primitiveToolId(item),
					item,
					persistent: false,
					linkedTargetId: undefined
				};
				primitiveCreation.value = undefined;
				activeTool.value = CREATE_TOOL_ID;
			})
			.catch(() => {
				// Editing still works if the primitive menu data is not available yet.
			});
	}

	function canInlineEditTextLayer(layer, allowSelectTool = false, force = false) {
		return (
			!!layer?.text &&
			(force ||
				primitiveCreatesText(activeCreateTool.value) ||
				(allowSelectTool && activeTool.value === 'select'))
		);
	}

	function primitivePreviewStyle(content) {
		return {
			background: content?.style?.background_color ?? '#70db93',
			border: content?.style?.border_color ?? 'black'
		};
	}

	function primitivePreviewIsEllipse(content) {
		const tag = content?.semantic_tag ?? '';
		return (
			content?.shape_id === CIRCLE_SHAPE_ID ||
			tag.endsWith('.PlaceFigure') ||
			tag.endsWith('.VirtualPlaceFigure') ||
			tag.endsWith('.FAStateFigure')
		);
	}

	function primitivePreviewUsesSymbol(content) {
		const tag = content?.semantic_tag ?? '';
		return tag.endsWith('.FAStateFigure');
	}

	function primitivePreviewIsTriangle(content) {
		const tag = content?.semantic_tag ?? '';
		return tag.endsWith('.TriangleFigure');
	}

	function primitivePreviewIsDiamond(content) {
		const tag = content?.semantic_tag ?? '';
		return tag.endsWith('.DiamondFigure');
	}

	function primitivePreviewIsPie(content) {
		const tag = content?.semantic_tag ?? '';
		return tag.endsWith('.PieFigure');
	}

	function primitivePreviewIsLine(content) {
		return Array.isArray(content?.points);
	}

	function primitivePreviewRoundRadius(content) {
		const attrs = content?.shape_attributes ?? {};
		return attrs.rx ?? attrs['rx'] ?? 0;
	}

	function primitivePreviewTrianglePath(box) {
		return `M ${box.x + box.width / 2} ${box.y} L ${box.x + box.width} ${box.y + box.height} L ${box.x} ${box.y + box.height} Z`;
	}

	function primitivePreviewDiamondPath(box) {
		return `M ${box.x + box.width / 2} ${box.y} L ${box.x + box.width} ${box.y + box.height / 2} L ${box.x + box.width / 2} ${box.y + box.height} L ${box.x} ${box.y + box.height / 2} Z`;
	}

	function primitivePreviewPiePath(box) {
		const rx = box.width / 2;
		const ry = box.height / 2;
		const cx = box.x + rx;
		const cy = box.y + ry;
		return `M ${cx} ${cy} L ${cx} ${box.y} A ${rx} ${ry} 0 1 1 ${box.x} ${cy} Z`;
	}

	function primitivePreviewLinePath(box, creation = undefined) {
		const start = creation?.start ?? creation?.initial;
		const current = creation?.current;

		if (start && current) {
			return `M ${start.x} ${start.y} L ${current.x} ${current.y}`;
		}

		return `M ${box.x} ${box.y + box.height / 2} L ${box.x + box.width} ${box.y + box.height / 2}`;
	}

	function primitiveNeedsLinkedTarget(tool) {
		const content = primitiveContent(tool);
		return (
			tool?.type === 'primitive' && (!!content?.hyperlink || isVirtualPrimitiveContent(content))
		);
	}

	function primitiveHasLinkedTarget(tool) {
		return !primitiveNeedsLinkedTarget(tool) || typeof tool?.linkedTargetId === 'string';
	}

	function primitiveCanBeLinkedToSelection(item, selectedLayer) {
		const tool = { type: 'primitive', item };
		if (!primitiveNeedsLinkedTarget(tool)) {
			return undefined;
		}

		return canTargetLinkedPrimitive(tool, selectedLayer) ? selectedLayer?.id : undefined;
	}

	function canTargetLinkedPrimitive(tool, layer) {
		const content = primitiveContent(tool);

		if (primitiveCreatesVirtualPlace(tool)) {
			return typeof layer?.id === 'string' && isPlaceLayer(layer);
		}

		if (primitiveCreatesVirtualTransition(tool)) {
			return typeof layer?.id === 'string' && isTransitionLayer(layer);
		}

		return primitiveNeedsLinkedTarget(tool) && canTargetLinkedPrimitiveContent(content, layer);
	}

	function canTargetLinkedPrimitiveContent(content, layer) {
		if (isVirtualPlaceContent(content)) {
			return typeof layer?.id === 'string' && isPlaceLayer(layer);
		}

		if (isVirtualTransitionContent(content)) {
			return typeof layer?.id === 'string' && isTransitionLayer(layer);
		}

		if (Number(content?.renew_type) === RENEW_TEXT_TYPE.INSCRIPTION) {
			return typeof layer?.id === 'string' && isQualifiedInscriptionTarget(layer);
		}

		if (Number(content?.renew_type) === RENEW_TEXT_TYPE.NAME) {
			return typeof layer?.id === 'string' && isNodeLayer(layer);
		}

		return typeof layer?.id === 'string' && (!!layer?.box || !!layer?.edge);
	}

	function linkedPrimitiveSemanticTargetLayer(tool, layer, docValue) {
		if (!primitiveCreatesVirtualFigure(tool)) {
			return layer;
		}

		return linkedVirtualSemanticTargetLayer(primitiveContent(tool), layer, docValue);
	}

	function linkedPrimitiveContentSemanticTargetLayer(content, layer, docValue) {
		if (!isVirtualPrimitiveContent(content)) {
			return layer;
		}

		return linkedVirtualSemanticTargetLayer(content, layer, docValue);
	}

	function linkedVirtualSemanticTargetLayer(content, layer, docValue) {
		const byId = layerMap(docValue);
		let target = layer;
		const seen = new Set();

		while (
			target?.hyperlink &&
			!seen.has(target.id) &&
			((isVirtualPlaceContent(content) && isVirtualPlaceLayer(target)) ||
				(isVirtualTransitionContent(content) && isVirtualTransitionLayer(target)))
		) {
			seen.add(target.id);
			target = byId.get(target.hyperlink);
		}

		return target ?? layer;
	}

	function virtualNameCloneTemplates(sourceLayer, docValue) {
		if (!sourceLayer?.id || !sourceLayer?.box) {
			return [];
		}

		return (docValue?.layers?.items ?? [])
			.filter((layer) => layer?.text && layer.hyperlink === sourceLayer.id)
			.filter((layer) => renewTextType(layer) === RENEW_TEXT_TYPE.NAME)
			.map((layer) => ({
				body: layer.text.body ?? '',
				semantic_tag: layer.semantic_tag ?? 'de.renew.gui.CPNTextFigure',
				renew_type: RENEW_TEXT_TYPE.NAME,
				style: layer.text.style,
				offsetX: Number(layer.text.position_x ?? 0) - Number(sourceLayer.box.position_x ?? 0),
				offsetY: Number(layer.text.position_y ?? 0) - Number(sourceLayer.box.position_y ?? 0)
			}));
	}

	function createVirtualNameClones(tool, createdLayerId, position, size, content, dispatch) {
		const templates = tool?.virtualNameClones ?? [];
		if (!primitiveCreatesVirtualFigure(tool) || !createdLayerId || templates.length === 0) {
			return;
		}

		const width = Number(size?.width ?? content?.width ?? 20);
		const height = Number(size?.height ?? content?.height ?? 20);
		const boxX = Number(position?.x ?? 0) - width / 2;
		const boxY = Number(position?.y ?? 0) - height / 2;

		for (const template of templates) {
			dispatch('create_layer', {
				base_layer_id: createdLayerId,
				pos: {
					x: boxX + Number(template.offsetX ?? 0),
					y: boxY + Number(template.offsetY ?? 0)
				},
				body: template.body,
				semantic_tag: template.semantic_tag,
				renew_type: template.renew_type,
				style: template.style,
				hyperlink: createdLayerId
			}).catch((e) => {
				queueError(e, 'Virtual figure name could not be copied');
			});
		}
	}

	function canCreateUnlinkedTextPrimitive(tool) {
		return primitiveCreatesText(tool) && !primitiveNeedsLinkedTarget(tool);
	}

	function createUnlinkedTextPrimitiveAtEvent(evt, liveLenses, dispatch, baseLayerId) {
		const tool = activeCreateTool.value;
		if (!canCreateUnlinkedTextPrimitive(tool)) {
			return false;
		}

		const position = snapCanvasPoint(liveLenses.clientToCanvas(evt.clientX, evt.clientY));
		rememberPasteLocation(position);
		createPrimitiveLayer(tool, position, undefined, dispatch, baseLayerId);
		backoffValue.value = true;

		evt.preventDefault();
		evt.stopPropagation();
		return true;
	}

	function createLinkedPrimitiveOnLayer(evt, liveLenses, dispatch, cast, docValue, layer) {
		if (suppressNextLinkedPrimitiveClick) {
			suppressNextLinkedPrimitiveClick = false;
			evt.preventDefault();
			evt.stopPropagation();
			return true;
		}

		const tool = activeCreateTool.value;
		if (!canTargetLinkedPrimitive(tool, layer)) {
			return false;
		}

		const position = snapCanvasPoint(liveLenses.clientToCanvas(evt.clientX, evt.clientY));
		const linkedTargetLayer = linkedPrimitiveSemanticTargetLayer(tool, layer, docValue);
		const virtualNameClones = primitiveCreatesVirtualFigure(tool)
			? virtualNameCloneTemplates(layer, docValue)
			: [];
		const createAt =
			primitiveCreatesVirtualFigure(tool) && layer?.box
				? {
						x: layer.box.position_x + layer.box.width / 2,
						y: layer.box.position_y + layer.box.height / 2
					}
				: position;
		const createSize =
			primitiveCreatesVirtualFigure(tool) && layer?.box
				? { width: layer.box.width, height: layer.box.height }
				: undefined;
		rememberPasteLocation(position);
		createPrimitiveLayer(
			{ ...tool, linkedTargetId: linkedTargetLayer?.id, virtualNameClones },
			createAt,
			createSize,
			dispatch,
			layer.id,
			cast
		);
		backoffValue.value = true;

		if (!tool.persistent && !keepCreateToolWhileEditingCreatedPrimitive(tool)) {
			resetToSelectTool();
		}

		evt.preventDefault();
		evt.stopPropagation();
		return true;
	}

	function linkedPrimitiveInitialPlacement(tool, layer, position) {
		if (primitiveCreatesVirtualFigure(tool) && layer?.box) {
			return {
				position: {
					x: layer.box.position_x + layer.box.width / 2,
					y: layer.box.position_y + layer.box.height / 2
				},
				size: { width: layer.box.width, height: layer.box.height }
			};
		}

		return { position, size: undefined };
	}

	function beginLinkedPrimitiveCreation(evt, liveLenses, docValue, layer) {
		const tool = activeCreateTool.value;
		if (
			!evt.isPrimary ||
			!E.isLeftButton(evt) ||
			!primitiveCreatesVirtualFigure(tool) ||
			!canTargetLinkedPrimitive(tool, layer)
		) {
			return false;
		}

		const pointerPosition = snapCanvasPoint(liveLenses.clientToCanvas(evt.clientX, evt.clientY));
		const linkedTargetLayer = linkedPrimitiveSemanticTargetLayer(tool, layer, docValue);
		const placement = linkedPrimitiveInitialPlacement(tool, layer, pointerPosition);
		const virtualNameClones = virtualNameCloneTemplates(layer, docValue);

		linkedPrimitiveCreation.value = {
			pointerId: evt.pointerId,
			tool: { ...tool, linkedTargetId: linkedTargetLayer?.id, virtualNameClones },
			baseLayerId: layer.id,
			initial: placement.position,
			current: placement.position,
			size: placement.size,
			screenStart: { x: evt.clientX, y: evt.clientY },
			screenCurrent: { x: evt.clientX, y: evt.clientY }
		};
		rememberPasteLocation(pointerPosition);
		backoffValue.value = true;

		evt.preventDefault();
		evt.stopPropagation();
		evt.currentTarget.setPointerCapture(evt.pointerId);
		return true;
	}

	function updateLinkedPrimitiveCreation(evt, liveLenses) {
		if (linkedPrimitiveCreation.value?.pointerId !== evt.pointerId) {
			return false;
		}

		linkedPrimitiveCreation.value = {
			...linkedPrimitiveCreation.value,
			current: snapCanvasPoint(liveLenses.clientToCanvas(evt.clientX, evt.clientY)),
			screenCurrent: { x: evt.clientX, y: evt.clientY }
		};
		evt.preventDefault();
		evt.stopPropagation();
		return true;
	}

	function finishLinkedPrimitiveCreation(evt, dispatch, cast) {
		const creation = linkedPrimitiveCreation.value;
		if (creation?.pointerId !== evt.pointerId) {
			return false;
		}

		if (evt.currentTarget.hasPointerCapture(evt.pointerId)) {
			evt.currentTarget.releasePointerCapture(evt.pointerId);
		}

		const isDrag = isPrimitiveCreationDrag(creation);
		const position = isDrag ? creation.current : creation.initial;
		createPrimitiveLayer(
			creation.tool,
			position,
			creation.size,
			dispatch,
			creation.baseLayerId,
			cast
		);

		if (!creation.tool.persistent && !keepCreateToolWhileEditingCreatedPrimitive(creation.tool)) {
			resetToSelectTool();
		}

		linkedPrimitiveCreation.value = undefined;
		suppressNextLinkedPrimitiveClick = true;
		evt.preventDefault();
		evt.stopPropagation();
		return true;
	}

	function cancelLinkedPrimitiveCreation(evt) {
		if (evt && linkedPrimitiveCreation.value?.pointerId !== evt.pointerId) {
			return false;
		}

		linkedPrimitiveCreation.value = undefined;
		return true;
	}

	function createPrimitiveLayer(tool, position, size, dispatch, baseLayerId, cast = undefined) {
		const content = { ...(tool?.item?.data?.content ?? {}) };
		const editCreatedPrimitive = shouldInlineEditCreatedPrimitive(tool);

		if (!primitiveHasLinkedTarget(tool)) {
			return;
		}

		if (primitiveCreatesImage(tool) && !content.image && !content.background_url) {
			createImageLayerFromPicker(position, size, dispatch, cast, baseLayerId);
			return;
		}

		if (editCreatedPrimitive) {
			content.body = '';
		}

		if (content.hyperlink || primitiveCreatesVirtualFigure(tool)) {
			content.hyperlink = tool.linkedTargetId;
		}

		const payload = {
			base_layer_id: baseLayerId,
			pos: position,
			...content
		};

		if (Array.isArray(content.points)) {
			payload.points = Array.isArray(size?.points)
				? size.points
				: content.points.map((point) => ({
						x: position.x + Number(point?.x ?? 0),
						y: position.y + Number(point?.y ?? 0)
					}));
			delete payload.pos;
		}

		if (size && !Array.isArray(content.points)) {
			payload.width = size.width;
			payload.height = size.height;
		}

		dispatch('create_layer', payload)
			.then((layer) => {
				createVirtualNameClones(tool, layer?.id, position, size, content, dispatch);

				if (editCreatedPrimitive && layer?.id) {
					inlineTextEdit.value = {
						id: layer.id,
						body: '',
						bounds: { lockToTextPosition: true },
						blankLines: !!content?.style?.blank_lines
					};
				} else if (layer?.id && cast) {
					publishSelection(cast, [layer.id]);
				}
			})
			.catch((e) => {
				queueError(e, 'Layer could not be created');
			});
	}

	function chooseImageFile() {
		return new Promise((resolve, reject) => {
			const input = document.createElement('input');
			input.type = 'file';
			input.accept = 'image/*';
			input.style.display = 'none';
			input.onchange = () => {
				resolve(input.files?.[0] ?? null);
				input.remove();
			};
			input.oncancel = () => {
				resolve(null);
				input.remove();
			};
			document.body.append(input);
			input.click();
		});
	}

	function createImageLayerFromFile(file, position, size, dispatch, cast, baseLayerId) {
		if (!file) {
			return Promise.resolve(null);
		}

		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = (event) => {
				const image = new Image();
				image.onload = () => {
					const naturalWidth = Number(image.naturalWidth || image.width || 40);
					const naturalHeight = Number(image.naturalHeight || image.height || 32);
					const width = Number(size?.width || naturalWidth);
					const height = Number(size?.height || naturalHeight);

					dispatch('create_layer', {
						base_layer_id: baseLayerId,
						pos: {
							x: position.x - width / 2,
							y: position.y - height / 2,
							width,
							height
						},
						image: event.target.result
					})
						.then((layer) => {
							if (layer?.id) {
								publishSelection(cast, [layer.id]);
							}
							resolve(layer);
						})
						.catch(reject);
				};
				image.onerror = () => reject(new Error('Image could not be loaded'));
				image.src = event.target.result;
			};
			reader.onerror = () => reject(new Error('Image could not be read'));
			reader.readAsDataURL(file);
		});
	}

	async function createImageLayerFromPicker(position, size, dispatch, cast, baseLayerId) {
		try {
			const file = await chooseImageFile();
			await createImageLayerFromFile(file, position, size, dispatch, cast, baseLayerId);
		} catch (e) {
			queueError(e, 'Image could not be inserted');
		}
	}

	function createBlueprintInstance(tool, position, dispatch, cast) {
		dispatch('insert_document', {
			document_id: tool.blueprintId,
			position
		})
			.then((result) => selectInsertedLayers(cast, result))
			.catch((e) => {
				queueError(e, 'Document could not be inserted');
			});
	}

	function handleDroppedLayerContent(content, pos, dispatch, cast) {
		if (!content || typeof content !== 'object') {
			return;
		}

		const layerContent = { ...content };
		const droppedImagePrimitive =
			typeof layerContent.semantic_tag === 'string' &&
			layerContent.semantic_tag.endsWith('.ImageFigure') &&
			!layerContent.image &&
			!layerContent.background_url;
		const editDroppedText = typeof layerContent.body === 'string';
		let baseLayerId = L.get('id', singleSelectedLayer.value);

		if (droppedImagePrimitive) {
			createImageLayerFromPicker(
				pos,
				{ width: layerContent.width, height: layerContent.height },
				dispatch,
				cast,
				baseLayerId
			);
			return;
		}

		if (editDroppedText) {
			layerContent.body = '';
		}

		if (layerContent.hyperlink || isVirtualPrimitiveContent(layerContent)) {
			const linkedLayer =
				typeof layerContent.hyperlink === 'string'
					? layerMap(doc.value).get(layerContent.hyperlink)
					: linkedPrimitiveTargetAtPosition(
							pos,
							layersInOrder.value,
							doc.value,
							textBounds.value,
							12 * cameraScale.value,
							layerContent
						);
			const linkedTargetLayer = linkedPrimitiveContentSemanticTargetLayer(
				layerContent,
				linkedLayer,
				doc.value
			);
			const linkedTargetId = linkedTargetLayer?.id;

			if (!linkedTargetId) {
				return;
			}

			layerContent.hyperlink = linkedTargetId;
			baseLayerId = linkedLayer?.id ?? linkedTargetId;
		}

		dispatch('create_layer', {
			base_layer_id: baseLayerId,
			pos,
			...layerContent
		})
			.then((l) => {
				if (editDroppedText && l?.id) {
					inlineTextEdit.value = {
						id: l.id,
						body: '',
						bounds: { lockToTextPosition: true },
						blankLines: !!layerContent?.style?.blank_lines
					};
				} else if (l?.id) {
					publishSelection(cast, [l.id]);
				}
			})
			.catch((e) => {
				queueError(e, 'Layer could not be created');
			});
	}

	function handleDroppedBlueprintContent(content, pos, dispatch, cast) {
		if (!content?.blueprint_id) {
			return;
		}

		dispatch('insert_document', {
			document_id: content.blueprint_id,
			position: pos
		})
			.then((result) => selectInsertedLayers(cast, result))
			.catch((e) => {
				queueError(e, 'Document could not be inserted');
			});
	}

	function handleDroppedContent(mime, content, pos, dispatch, cast) {
		if (mime === LAYER_PRIMITIVE_MIME_TYPE) {
			handleDroppedLayerContent(content, pos, dispatch, cast);
		} else if (mime === BLUEPRINT_MIME_TYPE) {
			handleDroppedBlueprintContent(content, pos, dispatch, cast);
		}
	}

	function handleDroppedFile(file, pos, dispatch, cast) {
		if (file?.type?.startsWith('image/') && file.type !== 'image/svg+xml') {
			createImageLayerFromFile(
				file,
				pos,
				undefined,
				dispatch,
				cast,
				L.get('id', singleSelectedLayer.value)
			).catch((e) => {
				queueError(e, 'Image could not be inserted');
			});
			return;
		}

		const reader = new FileReader();
		reader.onload = function (event) {
			new Promise((res) => {
				const parser = new DOMParser();
				const svgDoc = parser.parseFromString(event.target.result, 'image/svg+xml');
				const isSvg = !svgDoc.querySelector('parsererror');
				if (isSvg) {
					res({ type: 'svg', svg: svgDoc });
				} else {
					res({ type: 'other', data: event.target.result });
				}
			})
				.then((doc) => {
					if (doc.type == 'svg') {
						return data.commands.uploadSvg(doc.svg).then((j) =>
							dispatch('create_layer', {
								base_layer_id: L.get('id', singleSelectedLayer.value),
								pos: {
									x: -doc.svg.documentElement.width.baseVal.value / 2 + pos.x,
									y: -doc.svg.documentElement.height.baseVal.value / 2 + pos.y,
									width: doc.svg.documentElement.width.baseVal.value,
									height: doc.svg.documentElement.height.baseVal.value
								},
								image: j.url
							}).then((l) => {
								publishSelection(cast, [l.id]);
							})
						);
					}

					return dispatch('insert_file', {
						content: doc.data,
						file_name: file.name,
						x: pos.x,
						y: pos.y
					}).then((result) => selectInsertedLayers(cast, result));
				})
				.catch((e) => {
					queueError(e, 'File could not be inserted');
				});
		};
		reader.readAsText(file);
	}

	function fallbackDropPosition() {
		return lastPasteLocation.value ?? { x: 0, y: 0 };
	}

	function handleToolbarDrop(evt, dispatch, cast) {
		const transfer = evt.dataTransfer;
		if (!transfer) {
			return;
		}

		evt.preventDefault();
		evt.stopPropagation();
		const pos = fallbackDropPosition();
		let handledStructuredContent = false;

		for (const file of transfer.files ?? []) {
			handleDroppedFile(file, pos, dispatch, cast);
		}

		for (const mime of [LAYER_PRIMITIVE_MIME_TYPE, BLUEPRINT_MIME_TYPE]) {
			if (!hasTransferContent(transfer, mime)) {
				continue;
			}

			const raw = getTransferContent(transfer, mime);
			const content = safeJsonParse(raw);
			if (content) {
				handleDroppedContent(mime, content, pos, dispatch, cast);
				handledStructuredContent = true;
			}
		}

		if (!handledStructuredContent && hasTransferContent(transfer, 'text/plain')) {
			const workaround = safeJsonParse(getTransferContent(transfer, 'text/plain'));
			if (
				workaround &&
				typeof workaround.mime === 'string' &&
				Object.prototype.hasOwnProperty.call(workaround, 'data')
			) {
				handleDroppedContent(workaround.mime, workaround.data, pos, dispatch, cast);
			}
		}
	}

	function editorDropZone(node, context) {
		let current = context;

		function dragover(evt) {
			if (evt.dataTransfer?.types?.length || evt.dataTransfer?.files?.length) {
				evt.preventDefault();
				evt.dataTransfer.dropEffect = 'copy';
			}
		}

		function drop(evt) {
			handleToolbarDrop(evt, current.dispatch, current.cast);
		}

		node.addEventListener('dragover', dragover);
		node.addEventListener('drop', drop);

		return {
			update(next) {
				current = next;
			},
			destroy() {
				node.removeEventListener('dragover', dragover);
				node.removeEventListener('drop', drop);
			}
		};
	}

	function finishPrimitiveCreation(evt, liveLenses, dispatch, cast, baseLayerId) {
		if (primitiveCreation.value?.pointerId !== evt.pointerId) {
			return false;
		}

		updatePrimitiveCreation(evt, liveLenses);
		const creation = primitiveCreation.value;
		const tool = activeCreateTool.value;

		if (evt.currentTarget.hasPointerCapture(evt.pointerId)) {
			evt.currentTarget.releasePointerCapture(evt.pointerId);
		}

		primitiveCreation.value = undefined;
		backoffValue.value = true;

		if (tool && creation) {
			if (primitiveHasLinkedTarget(tool)) {
				if (primitiveSupportsSizedCreation(tool) && isPrimitiveCreationDrag(creation)) {
					const box = normalizedBox(creation);
					if (Array.isArray(primitiveContent(tool).points)) {
						createPrimitiveLayer(
							tool,
							creation.start,
							{ points: [creation.start, creation.current] },
							dispatch,
							baseLayerId,
							cast
						);
					} else {
						createPrimitiveLayer(
							tool,
							{ x: box.x + box.width / 2, y: box.y + box.height / 2 },
							{ width: box.width, height: box.height },
							dispatch,
							baseLayerId,
							cast
						);
					}
				} else if (tool.type === 'blueprint') {
					createBlueprintInstance(tool, creation.start, dispatch, cast);
				} else {
					createPrimitiveLayer(tool, creation.start, undefined, dispatch, baseLayerId, cast);
				}

				if (!tool.persistent && !keepCreateToolWhileEditingCreatedPrimitive(tool)) {
					resetToSelectTool();
				}
			}
		}

		evt.preventDefault();
		evt.stopPropagation();
		return true;
	}

	function textEditorLineCount(value) {
		return Math.max(1, String(value ?? '').split('\n').length);
	}

	function textEditorHasBlankLine(value) {
		const text = String(value ?? '');
		return text.includes('\n') && text.split('\n').some((line) => line.trim() === '');
	}

	function textEditorIsEmpty(value) {
		return String(value ?? '').trim().length === 0;
	}

	function textEditorLongestLineLength(value) {
		return Math.max(
			1,
			...String(value ?? '')
				.split('\n')
				.map((line) => line.length)
		);
	}

	function textEditorNumericFontSize(layer) {
		const value = layer?.text?.style?.font_size ?? 20;
		const numeric = Number(value);
		return Number.isFinite(numeric) && numeric > 0 ? numeric : 20;
	}

	let textEditorMeasureContext;

	function textEditorFontFamily(layer) {
		return layer?.text?.style?.font_family ?? 'sans-serif';
	}

	function textEditorFontStyle(layer) {
		return layer?.text?.style?.italic ? 'italic' : 'normal';
	}

	function textEditorFontWeight(layer) {
		return layer?.text?.style?.bold ? 'bold' : 'normal';
	}

	function textEditorMeasureWidth(layer, body) {
		const fallbackFontSize = textEditorNumericFontSize(layer);
		const lines = String(body ?? '').split('\n');

		if (typeof document === 'undefined') {
			return textEditorLongestLineLength(body) * fallbackFontSize * 0.55;
		}

		if (!textEditorMeasureContext) {
			textEditorMeasureContext = document.createElement('canvas').getContext('2d');
		}

		textEditorMeasureContext.font = `${textEditorFontStyle(layer)} ${textEditorFontWeight(
			layer
		)} ${fallbackFontSize}px ${textEditorFontFamily(layer)}`;

		return Math.max(
			0,
			...lines.map((line) => textEditorMeasureContext.measureText(line || ' ').width)
		);
	}

	function textEditorBounds(layer, bbox, scale, body = layer?.text?.body) {
		if (!layer?.text) {
			return null;
		}

		const padding = 2 * scale;
		const fallbackFontSize = textEditorNumericFontSize(layer);
		const draftLineCount = textEditorLineCount(body);
		const draftWidth = textEditorMeasureWidth(layer, body) + fallbackFontSize * 0.4;
		const draftHeight = fallbackFontSize * draftLineCount * 1.25;
		const fallbackHeight = Math.max(24 * scale, fallbackFontSize * 1.6);
		const fallbackWidth = Math.max(18 * scale, fallbackFontSize * 0.8);
		const useTextPosition = bbox?.lockToTextPosition;
		const x = !useTextPosition && Number.isFinite(bbox?.x) ? bbox.x : layer.text.position_x;
		const y =
			!useTextPosition && Number.isFinite(bbox?.y)
				? bbox.y
				: useTextPosition
					? layer.text.position_y
					: layer.text.position_y - fallbackHeight / 2;
		const width = Math.max(draftWidth, fallbackWidth);
		const height = Math.max(draftHeight, fallbackHeight);

		return {
			x: x - padding,
			y: y - padding,
			width: width + 2 * padding,
			height: height + 2 * padding
		};
	}

	function textEditorRows(value) {
		return textEditorLineCount(value);
	}

	function textEditorFontSize(layer) {
		const value = layer?.text?.style?.font_size ?? 20;
		if (typeof value === 'number') {
			return `${value}px`;
		}

		const text = String(value);
		return /^[0-9]+(\.[0-9]+)?$/.test(text) ? `${text}px` : text;
	}

	function visibleTextMatchesLayer(element, layer) {
		return (
			!!element &&
			element.classList?.contains?.('editor-text-visible') &&
			(!layer?.id || element.dataset?.layerId === layer.id)
		);
	}

	function eventHitsVisibleText(evt, layer) {
		const directText = evt?.target?.closest?.('.editor-text-visible');
		if (visibleTextMatchesLayer(directText, layer)) {
			return true;
		}

		if (
			typeof document === 'undefined' ||
			typeof document.elementsFromPoint !== 'function' ||
			!Number.isFinite(evt?.clientX) ||
			!Number.isFinite(evt?.clientY)
		) {
			return false;
		}

		return document
			.elementsFromPoint(evt.clientX, evt.clientY)
			.some((element) => visibleTextMatchesLayer(element.closest?.('.editor-text-visible'), layer));
	}

	function beginInlineTextEdit(
		evt,
		layer,
		bbox,
		cast,
		{ allowSelectTool = false, force = false, select = true, requireTextHit = true } = {}
	) {
		if (
			!canInlineEditTextLayer(layer, allowSelectTool, force) ||
			groupDrag.value !== undefined ||
			(requireTextHit && !eventHitsVisibleText(evt, layer))
		) {
			return false;
		}

		evt.preventDefault();
		evt.stopPropagation();
		backoffValue.value = true;
		primitiveCreation.value = undefined;
		if (inlineTextEdit.value?.id && inlineTextEdit.value.id !== layer.id) {
			commitInlineTextEdit(cast);
		}
		if (select) {
			publishSelection(cast, [layer.id]);
		}
		inlineTextEdit.value = {
			id: layer.id,
			body: layer.text.body ?? '',
			bounds: bbox,
			blankLines: !!layer.text?.style?.blank_lines
		};
		return true;
	}

	function beginContextTextEdit(evt, layer, bbox, cast) {
		if (!layer?.text || groupDrag.value !== undefined || !eventHitsVisibleText(evt, layer)) {
			return false;
		}

		activateTextToolForContextEdit(layer, cast);
		return beginInlineTextEdit(evt, layer, bbox, cast, {
			force: true,
			select: false,
			requireTextHit: true
		});
	}

	function updateInlineTextEdit(value) {
		if (!inlineTextEdit.value) {
			return;
		}

		inlineTextEdit.value = {
			...inlineTextEdit.value,
			body: value
		};
	}

	function commitInlineTextEdit(cast) {
		const edit = inlineTextEdit.value;
		if (!edit?.id) {
			return;
		}

		const body = edit.body ?? '';
		const docValue = deleteShortcutContext.doc?.value;
		const editedLayer = layerMap(docValue).get(edit.id);
		if (textEditorIsEmpty(body)) {
			if (selectedLayers.value.includes(edit.id)) {
				publishSelection(
					cast,
					selectedLayers.value.filter((id) => id !== edit.id)
				);
			}
			cast('delete_layer', { layer_ids: [edit.id] });
			inlineTextEdit.value = undefined;
			return;
		}

		if (!edit.blankLines && textEditorHasBlankLine(body)) {
			cast('change_style', {
				layer_id: edit.id,
				type: 'text',
				attr: 'blank_lines',
				val: true
			});
		}

		cast('change_text_body', {
			layer_id: edit.id,
			val: body
		});
		validateEditedInscription(editedLayer, docValue);
		inlineTextEdit.value = undefined;
	}

	function shouldResetTextToolAfterInlineTextDismiss(evt) {
		return (
			primitiveCreatesText(activeCreateTool.value) &&
			!activeCreateTool.value?.persistent &&
			!evt?.target?.closest?.('.editor-text-layer')
		);
	}

	function resetTextToolAfterInlineTextDismiss(evt) {
		if (shouldResetTextToolAfterInlineTextDismiss(evt)) {
			resetToSelectTool();
		}
	}

	function dismissInlineTextEditFromCanvasPointer(evt, cast) {
		if (!inlineTextEdit.value || !evt.isPrimary || !E.isLeftButton(evt)) {
			return false;
		}

		evt.preventDefault();
		evt.stopPropagation();
		commitInlineTextEdit(cast);
		resetTextToolAfterInlineTextDismiss(evt);
		return true;
	}

	function commitInlineTextEditOnOutsidePointer(node, cast) {
		function onPointerDown(evt) {
			if (!inlineTextEdit.value || !evt.isPrimary || !E.isLeftButton(evt)) {
				return;
			}

			if (node.contains(evt.target)) {
				return;
			}

			if (evt.target?.closest?.('.inline-text-editor-canvas-dismiss')) {
				return;
			}

			commitInlineTextEdit(cast);
			resetTextToolAfterInlineTextDismiss(evt);
		}

		window.addEventListener('pointerdown', onPointerDown, true);

		return {
			destroy() {
				window.removeEventListener('pointerdown', onPointerDown, true);
			}
		};
	}

	function focusInlineTextEditor(node) {
		requestAnimationFrame(() => {
			node.focus();
			node.select();
		});
	}

	function cancelPrimitiveCreation(evt) {
		if (
			evt &&
			primitiveCreation.value?.pointerId === evt.pointerId &&
			evt.currentTarget.hasPointerCapture(evt.pointerId)
		) {
			evt.currentTarget.releasePointerCapture(evt.pointerId);
		}

		primitiveCreation.value = undefined;
	}

	function resetToolFromCanvas(evt) {
		if (!activeCreateTool.value && activeTool.value !== 'edge') {
			return;
		}

		evt.preventDefault();
		evt.stopPropagation();
		backoffValue.value = true;
		resetToSelectTool();
	}

	function deleteThisDocument(evt) {
		evt?.preventDefault();

		if (
			!confirm(`Delete document "${data.document.content.name}"? This action cannot be undone.`)
		) {
			return;
		}

		data.commands.deleteDocument().catch((e) => {
			queueError(e, 'Document could not be deleted');
		});
	}

	let startingSimulation = $state(false);
	function simulateThisDocument(evt) {
		evt.preventDefault();
		startingSimulation = true;
		data.commands
			.simulateDocument(currentFormalism.value)
			.catch((e) => {
				console.error(e);
				queueError(e, 'Simulation could not be started');
			})
			.then(() => {
				startingSimulation = false;
			});
	}

	function openNavigatorPane() {
		showMinimap.value = true;
		showHierarchy.value = true;
	}

	function importFiles(dispatch, cast, accept = '.rnw,.draw,.svg,image/*') {
		const input = document.createElement('input');
		input.type = 'file';
		input.multiple = true;
		input.accept = accept;
		input.onchange = () => {
			for (const file of input.files ?? []) {
				handleDroppedFile(file, fallbackDropPosition(), dispatch, cast);
			}
		};
		input.click();
	}

	function normalizeOpenUrlInput(rawUrl) {
		const trimmed = `${rawUrl ?? ''}`.trim();

		if (!trimmed) {
			return null;
		}

		if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
			return trimmed;
		}

		return `http://${trimmed}`;
	}

	function fileNameFromOpenUrl(href) {
		try {
			const url = new URL(href);
			const name = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() ?? '');
			return name || 'drawing.rnw';
		} catch {
			return 'drawing.rnw';
		}
	}

	async function openUrl(dispatch, cast) {
		const href = normalizeOpenUrlInput(prompt('URL'));
		if (!href) {
			return;
		}

		try {
			const response = await fetch(href);
			if (!response.ok) {
				throw new Error(`Unexpected server response (${response.status})`);
			}

			const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
			const blob = await response.blob();
			const file = new File([blob], fileNameFromOpenUrl(href), { type: contentType });
			handleDroppedFile(file, fallbackDropPosition(), dispatch, cast);
		} catch (e) {
			queueError(
				e,
				'URL could not be opened. The browser may have blocked access, or the URL did not point to an importable drawing.'
			);
		}
	}

	function closeAllDrawings() {
		location.href = resolve(`/projects/${data.document.links.project.id}/documents`);
	}

	function exitEditor() {
		location.href = resolve('/projects');
	}

	const commandConsoleHelp = [
		'help',
		'new drawing',
		'select all',
		'invert selection',
		'clear selection',
		'delete',
		'copy',
		'cut',
		'paste',
		'duplicate',
		'search <text>',
		'check syntax',
		'group',
		'ungroup',
		'toggle snap',
		'show grid',
		'hide grid',
		'snap grid',
		'fit',
		'reset zoom',
		'zoom in',
		'zoom out',
		'reset rotation',
		'rotate left',
		'rotate right',
		'show hierarchy',
		'hide hierarchy',
		'show minimap',
		'hide minimap',
		'show toolbars',
		'hide toolbars',
		'navigator',
		'print',
		'export renew',
		'export svg',
		'export png',
		'export json',
		'export struct',
		'simulate'
	];

	async function runEditorConsoleCommand(dispatch, cast, docValue, layersInOrderValue) {
		const rawCommand = commandConsoleText.value.trim();
		const command = rawCommand.toLocaleLowerCase();

		if (!command) {
			return;
		}

		commandConsoleOutput.value = '';

		try {
			if (command === 'help' || command === '?') {
				commandConsoleOutput.value = `Available commands:\n${commandConsoleHelp.join('\n')}`;
			} else if (command === 'new drawing') {
				showNewDrawing.value = true;
				commandConsoleOutput.value = 'New drawing dialog opened.';
			} else if (command === 'select all') {
				selectAllLayers(cast, layersInOrderValue);
				commandConsoleOutput.value = 'Selected all visible figures.';
			} else if (command === 'invert selection') {
				invertSelection(cast, layersInOrderValue);
				commandConsoleOutput.value = 'Inverted selection.';
			} else if (command === 'clear selection') {
				clearSelection(cast);
				commandConsoleOutput.value = 'Selection cleared.';
			} else if (command === 'delete') {
				deleteSelectedLayers(cast, layersInOrderValue);
				commandConsoleOutput.value = 'Delete command sent.';
			} else if (command === 'copy') {
				await copySelectedLayers(dispatch, layersInOrderValue);
				commandConsoleOutput.value = 'Selection copied.';
			} else if (command === 'cut') {
				await copySelectedLayers(dispatch, layersInOrderValue);
				deleteSelectedLayers(cast, layersInOrderValue);
				commandConsoleOutput.value = 'Selection cut.';
			} else if (command === 'paste') {
				await pasteLayerClipboard(dispatch, cast, undefined, layersInOrderValue);
				commandConsoleOutput.value = 'Clipboard pasted.';
			} else if (command === 'duplicate') {
				await duplicateSelectedLayers(dispatch, cast, layersInOrderValue);
				commandConsoleOutput.value = 'Selection duplicated.';
			} else if (command.startsWith('search ')) {
				searchQuery.value = rawCommand.slice(rawCommand.indexOf(' ') + 1);
				runSearch(cast, docValue, layersInOrderValue);
				commandConsoleOutput.value = `Search selected ${searchLayerIds(docValue, layersInOrderValue).length} figure(s).`;
			} else if (command === 'check syntax') {
				await checkInscriptions(docValue);
				commandConsoleOutput.value = 'Inscription syntax checks finished.';
			} else if (command === 'group') {
				wrapSelectedLayersInGroup(dispatch, cast, layersInOrderValue);
				commandConsoleOutput.value = 'Selected figures grouped.';
			} else if (command === 'ungroup') {
				ungroupSelectedLayers(cast, layersInOrderValue);
				commandConsoleOutput.value = 'Selected groups ungrouped.';
			} else if (command === 'toggle snap') {
				snapToGrid.value = !snapToGrid.value;
				commandConsoleOutput.value = `Snap to grid ${snapToGrid.value ? 'enabled' : 'disabled'}.`;
			} else if (command === 'show grid') {
				showGrid.value = true;
				commandConsoleOutput.value = 'Grid shown.';
			} else if (command === 'hide grid') {
				showGrid.value = false;
				commandConsoleOutput.value = 'Grid hidden.';
			} else if (command === 'snap grid' || command === 'snap grid now') {
				snapSelectedLayersToGrid(dispatch, docValue, layersInOrderValue, textBounds.value);
				commandConsoleOutput.value = 'Selection snapped to grid.';
			} else if (command === 'fit') {
				call((c) => {
					c && c.resetCamera();
				}, cameraScroller);
				commandConsoleOutput.value = 'Camera fitted to drawing.';
			} else if (command === 'reset zoom') {
				cameraZoom.value = 0;
				commandConsoleOutput.value = 'Zoom reset.';
			} else if (command === 'zoom in') {
				update(R.add(0.2), cameraZoom);
				commandConsoleOutput.value = 'Zoomed in.';
			} else if (command === 'zoom out') {
				update(R.add(-0.2), cameraZoom);
				commandConsoleOutput.value = 'Zoomed out.';
			} else if (command === 'reset rotation') {
				cameraRotation.value = 0;
				commandConsoleOutput.value = 'Rotation reset.';
			} else if (command === 'rotate left' || command === 'rotate counter-clockwise') {
				update(R.add(-90), cameraRotation);
				commandConsoleOutput.value = 'Rotated left.';
			} else if (command === 'rotate right' || command === 'rotate clockwise') {
				update(R.add(90), cameraRotation);
				commandConsoleOutput.value = 'Rotated right.';
			} else if (command === 'show hierarchy') {
				showHierarchy.value = true;
				commandConsoleOutput.value = 'Hierarchy shown.';
			} else if (command === 'hide hierarchy') {
				showHierarchy.value = false;
				commandConsoleOutput.value = 'Hierarchy hidden.';
			} else if (command === 'show minimap') {
				showMinimap.value = true;
				commandConsoleOutput.value = 'Minimap shown.';
			} else if (command === 'hide minimap') {
				showMinimap.value = false;
				commandConsoleOutput.value = 'Minimap hidden.';
			} else if (command === 'show toolbars') {
				showCreateToolbar.value = true;
				commandConsoleOutput.value = 'Tool palette shown.';
			} else if (command === 'hide toolbars') {
				showCreateToolbar.value = false;
				commandConsoleOutput.value = 'Tool palette hidden.';
			} else if (command === 'navigator') {
				openNavigatorPane();
				commandConsoleOutput.value = 'Navigator panels opened.';
			} else if (command === 'print') {
				printDrawing({ preventDefault() {} });
				commandConsoleOutput.value = 'Print dialog requested.';
			} else if (command === 'export renew') {
				await data.commands.exportRenew();
				commandConsoleOutput.value = 'Renew export requested.';
			} else if (command === 'export svg') {
				downloadSvgDrawing(docValue);
				commandConsoleOutput.value = 'SVG export requested.';
			} else if (command === 'export png') {
				await downloadPngDrawing(docValue);
				commandConsoleOutput.value = 'PNG export requested.';
			} else if (command === 'export json') {
				await data.commands.downloadJson();
				commandConsoleOutput.value = 'JSON export requested.';
			} else if (command === 'export struct') {
				await data.commands.downloadStruct();
				commandConsoleOutput.value = 'Struct export requested.';
			} else if (command === 'simulate') {
				simulateThisDocument({ preventDefault() {} });
				commandConsoleOutput.value = 'Simulation start requested.';
			} else {
				commandConsoleOutput.value = `Unknown command: ${rawCommand}\nType "help" for available commands.`;
			}
		} catch (error) {
			const described = describeError(error);
			commandConsoleOutput.value = [described.message, described.detail]
				.filter(Boolean)
				.join('\n\n');
			queueError(error, 'Command could not be executed');
		}
	}

	const cameraJson = view(L.inverse(L.json({ space: '  ' })), camera);

	let cameraScroller = atom(undefined);

	function localProp(prop) {
		return L.lens(
			(x) => {
				if (x.__draft?.[prop]?.base === x[prop]) {
					return x.__draft?.[prop]?.live;
				} else {
					return x[prop];
				}
			},
			(n, o) =>
				n === localProp.reset
					? { ...o, __draft: undefined }
					: {
							...o,
							__draft: {
								[prop]: {
									live: n,
									base: o?.__draft?.[prop]?.base ?? o[prop]
								}
							}
						}
		);
	}

	localProp.reset = Object.create(null);

	function memo(fn) {
		let prevArg = undefined;
		let prevResult = undefined;
		return function (arg) {
			if (prevArg !== arg) {
				prevArg = arg;
				prevResult = fn(arg);
			}

			return prevResult;
		};
	}

	const currentFormalism = atom();
	data.formalisms
		.then((formalisms) => {
			if (!currentFormalism.value) {
				currentFormalism.value = selectedFormalismId(formalisms);
			}
		})
		.catch(() => {
			if (!currentFormalism.value) {
				currentFormalism.value = defaultFormalismId;
			}
		});
</script>

<svelte:document
	onkeydown={(evt) => {
		if (handleDocumentMovementKeydown(evt)) {
			return;
		}
		if (handleDocumentGroupKeydown(evt)) {
			return;
		}
		handleDocumentDeleteKeydown(evt);
	}}
/>

<div class="full-page">
	<AppBar
		active="documents"
		title={`Document Editor`}
		projectId={data.document.links.project.id}
		authState={data.authState}
		{errors}
		connectionState={data.connectionState}
	/>

	<LiveResource socket={data.live_socket} resource={data.document}>
		{#snippet children(doc, presence, { dispatch, cast, queuedActions })}
			{@const currentSyntax = view(
				[
					'syntax',
					'href',
					L.reread(memo(data.loadJson)),
					L.valueOr(Promise.resolve(data.defaultSyntax))
				],
				doc
			)}
			{@const currentSyntaxValue = currentSyntax.value}
			{@const updateText = debounce(
				(id, value) =>
					cast('change_text_body', {
						layer_id: id,
						val: value
					}),
				700
			)}
			{@const moveCursor = throttle((pos) => {
				const psum = L.sum([L.elems, 'count'], presence.value);
				if (psum > 1) {
					cast('cursor', pos);
				}
			}, 20)}
			{@const stopCursor = throttle((pos) => {
				const psum = L.sum([L.elems, 'count'], presence.value);
				if (psum > 1) {
					cast('cursor', null);
				}
			}, 20)}
			{@const layersInOrder = view(L.reread(walkDocument), doc)}
			<span
				aria-hidden="true"
				style="display: none"
				use:deleteShortcutContextAction={{ dispatch, cast, doc, layersInOrder }}
			></span>
			{@const _layerMoveCommitSync = clearCommittedLayerMove(doc.value)}
			{@const documentDisplayBounds = read(
				L.reread(({ documentValue, textBoundsValue }) =>
					documentDisplayBox(documentValue, textBoundsValue)
				),
				combine({ documentValue: doc, textBoundsValue: textBounds })
			)}
			{@const extension = documentDisplayBounds}
			{@const documentDisplayRect = read(L.reread(boxToRect), documentDisplayBounds)}
			{@const selectedLayersType = read(
				L.reread(({ d, sl }) => {
					return d.layers.items
						.filter((l) => sl.includes(l.id))
						.map((l) => {
							if (l.text) {
								return 'text';
							} else if (l.edge) {
								return 'edge';
							} else if (l.box) {
								return 'box';
							} else {
								return 'group';
							}
						})
						.filter((t) => t !== null);
				}),
				combine({ d: doc, sl: selectedLayers })
			)}
			{@const allSelectedLayers = view(
				L.choose(({ d, sl }) => {
					return L.partsOf(['d', 'layers', 'items', L.elems, L.when((l) => sl.includes(l.id))]);
				}),
				combine({ d: doc, sl: selectedLayers })
			)}
			{@const singleSelectedLayerType = read(
				(l) => (l.length === 1 ? l[0] : null),
				selectedLayersType
			)}
			{@const singleSelectedLayer = view(
				L.choose(({ d, sl }) => {
					return sl.length == 1
						? ['d', 'layers', 'items', L.find((l) => sl.includes(l.id))]
						: L.lens(
								() => null,
								(_, a) => a
							);
				}),
				combine({ d: doc, sl: selectedLayers })
			)}
			{@const singleSelectedHyperinkedId = read(
				L.reread((l) => l && l.hyperlink),
				singleSelectedLayer
			)}
			{@const selectedHyperlinkedIds = read(
				L.reread(({ d, sl }) => selectedLinkedLayerIds(d, sl)),
				combine({ d: doc, sl: selectedLayers })
			)}
			{@const singleSelectedIsBoxOrEdge = read(
				L.reread((x) => x == 'box' || x == 'edge'),
				singleSelectedLayerType
			)}

			<Modal bind:visible={showInspect.value} closeLabel="Close">
				<h2>Inspect Figure</h2>
				<textarea
					class="form-field"
					readonly
					style="width: min(80vw, 70rem); height: min(65vh, 38rem); font-family: monospace;"
					value={inspectedLayerJson()}
				></textarea>
			</Modal>

			<Modal bind:visible={showAbout.value} closeLabel="Close">
				<h2>About PetriStation</h2>
				<p>
					PetriStation document editor with Renew-compatible drawing, clipboard and simulation
					functions.
				</p>
				<p>Document: {doc.value.name}</p>
			</Modal>

			<Modal bind:visible={showCommandConsole.value} closeLabel="Close">
				<form
					onsubmit={(evt) => {
						evt.preventDefault();
						runEditorConsoleCommand(dispatch, cast, doc.value, layersInOrder.value);
					}}
				>
					<h2>Command Console</h2>
					<dl class="command-console">
						<dt>Command</dt>
						<dd>
							<input
								class="form-field"
								type="text"
								bind:value={commandConsoleText.value}
								placeholder="help"
								autofocus
							/>
						</dd>
						<dt></dt>
						<dd class="command-console-actions">
							<button type="submit" class="form-button">Run</button>
							<button
								type="button"
								class="form-button"
								onclick={() => {
									commandConsoleText.value = 'help';
									runEditorConsoleCommand(dispatch, cast, doc.value, layersInOrder.value);
								}}>Help</button
							>
						</dd>
						{#if commandConsoleOutput.value}
							<dt>Output</dt>
							<dd>
								<textarea
									class="form-field command-console-output"
									readonly
									value={commandConsoleOutput.value}
								></textarea>
							</dd>
						{/if}
					</dl>
				</form>
			</Modal>

			<Modal bind:visible={showToolOptions.value} closeLabel="Close">
				<h2>Tool Options</h2>
				{#if toolOptions.value}
					<div class="tool-options-dialog">
						<p><strong>{toolOptions.value.name}</strong></p>
						{#if toolOptions.value.description}
							<p>{toolOptions.value.description}</p>
						{/if}
						<div class="tool-options-actions">
							{#if toolOptions.value.activate}
								<button type="button" onclick={() => runToolOption(toolOptions.value.activate)}>
									Activate
								</button>
							{/if}
							{#if toolOptions.value.keepActive}
								<button type="button" onclick={() => runToolOption(toolOptions.value.keepActive)}>
									Keep active
								</button>
							{/if}
							{#if toolOptions.value.reset}
								<button type="button" onclick={() => runToolOption(toolOptions.value.reset)}>
									Reset
								</button>
							{/if}
							{#each toolOptions.value.actions ?? [] as action}
								<button
									type="button"
									disabled={!action.run}
									onclick={() => runToolOption(action.run)}
								>
									{action.label}
								</button>
							{/each}
						</div>
					</div>
				{/if}
			</Modal>

			<Modal bind:visible={showNewDrawing.value} closeLabel="Cancel">
				{@const newDrawingName = atom('Untitled')}
				{@const newDrawingKind = atom(data.document.content?.kind || 'de.renew.gui.CPNDrawing')}
				{@const predefinedNewDrawingKind = view(
					[
						L.lens(
							(v) => (drawingKinds.indexOf(v) > -1 ? v : undefined),
							(n, o) => n
						),
						L.defaults('')
					],
					newDrawingKind
				)}

				<form onsubmit={createNewDrawing} method="post" accept-charset="utf-8">
					<h2>New Drawing</h2>
					<dl
						style="display: grid; grid-template-columns: auto 1fr; align-items: baseline; gap: 1ex; max-width: 50vw"
					>
						<dt>Document Name</dt>
						<dd>
							<input
								class="form-field"
								style="width: 100%; box-sizing: border-box;"
								type="text"
								name="name"
								bind:value={newDrawingName.value}
								autofocus
							/>
						</dd>
						<dt>Document Kind</dt>
						<dd style="display: grid; gap: 1ex; grid-auto-rows: 1fr 1fr;">
							<select name="kind" class="form-field" bind:value={predefinedNewDrawingKind.value}>
								<option value="">Other</option>
								{#each drawingKinds as dk}
									<option value={dk}>{dk}</option>
								{/each}
							</select>
							<input
								name="custom_kind"
								class={{ 'form-field': true, hidden: predefinedNewDrawingKind.value.length > 0 }}
								style="width: 100%; box-sizing: border-box;"
								type="text"
								bind:value={newDrawingKind.value}
							/>
						</dd>
						<dt>Syntax</dt>
						<dd style="display: grid; gap: 1ex; grid-template-columns: 1fr; align-items: baseline;">
							{#await data.syntaxes}
								loading
							{:then syntaxes}
								{@const transientSyntax = atom(doc.value.syntax?.id)}
								{@const syntaxId = view([L.valueOr('none'), L.defaults('none')], transientSyntax)}
								<select name="syntax_id" class="form-field" bind:value={syntaxId.value}>
									<option value="none">None</option>
									{#each syntaxes.items as s}
										<option value={s.id}>{s.name}</option>
									{/each}
								</select>
							{:catch}
								error
							{/await}
						</dd>
						<dt></dt>
						<dd><button type="submit" class="form-button">Create</button></dd>
					</dl>
				</form>
			</Modal>

			<Modal bind:visible={showRename.value} closeLabel="Cancel">
				{@const transientKind = atom(doc.value.kind)}
				{@const predefinedKind = view(
					[
						L.lens(
							(v) => (drawingKinds.indexOf(v) > -1 ? v : undefined),
							(n, o) => n
						),
						L.defaults('')
					],
					transientKind
				)}
				{@const transientName = atom(doc.value.name)}

				<form
					onsubmit={(evt) => {
						evt.preventDefault();

						const data = new FormData(evt.currentTarget);

						dispatch('set_meta', Object.fromEntries(data)).then(() => {
							showRename.value = false;
						});
					}}
					method="post"
					accept-charset="utf-8"
				>
					<h2>Rename Document</h2>
					<dl
						style="display: grid; grid-template-columns: auto 1fr; align-items: baseline; gap: 1ex; max-width: 50vw"
					>
						<dt>Document Name</dt>
						<dd>
							<input
								class="form-field"
								style="width: 100%; box-sizing: border-box;"
								type="text"
								name="name"
								value={transientName.value}
							/>
						</dd>
						<dt>Document Kind</dt>
						<dd style="display: grid; gap: 1ex; grid-auto-rows: 1fr 1fr;">
							<select name="kind" class="form-field" bind:value={predefinedKind.value}>
								<option value="">Other</option>
								{#each drawingKinds as dk}
									<option value={dk}>{dk}</option>
								{/each}
							</select>
							<input
								name="kind"
								class={{ 'form-field': true, hidden: predefinedKind.value.length > 0 }}
								style="width: 100%; box-sizing: border-box;"
								type="text"
								bind:value={transientKind.value}
							/>
						</dd>
						<dt>Syntax</dt>
						<dd style="display: grid; gap: 1ex; grid-template-columns: 1fr; align-items: baseline;">
							{#await data.syntaxes}
								loading
							{:then syntaxes}
								{@const transientSyntax = atom(doc.value.syntax?.id)}
								{@const syntaxId = view([L.valueOr('none'), L.defaults('none')], transientSyntax)}
								<select name="syntax_id" class="form-field" bind:value={syntaxId.value}>
									<option value="none">None</option>
									{#each syntaxes.items as s}
										<option value={s.id}>{s.name}</option>
									{/each}
								</select>
							{:catch e}
								error
							{/await}
						</dd>
						<dt></dt>
						<dd><button type="submit" class="form-button">Save</button></dd>
					</dl>
				</form>
			</Modal>

			<Modal bind:visible={showSearch.value} closeLabel="Close">
				{@const foundLayerIds = searchLayerIds(doc.value, layersInOrder.value)}
				<form
					onsubmit={(evt) => {
						evt.preventDefault();
						runSearch(cast, doc.value, layersInOrder.value);
					}}
				>
					<h2>{searchReplaceMode.value ? 'Search & Replace' : 'Search'}</h2>
					<dl
						style="display: grid; grid-template-columns: auto minmax(18em, 1fr); align-items: center; gap: 1ex; max-width: 54vw"
					>
						<dt>Search</dt>
						<dd>
							<input
								class="form-field"
								style="width: 100%; box-sizing: border-box;"
								type="text"
								bind:value={searchQuery.value}
								autofocus
							/>
						</dd>
						{#if searchReplaceMode.value}
							<dt>Replace</dt>
							<dd>
								<input
									class="form-field"
									style="width: 100%; box-sizing: border-box;"
									type="text"
									bind:value={searchReplacement.value}
								/>
							</dd>
						{/if}
						<dt></dt>
						<dd>
							<label>
								<input type="checkbox" bind:checked={searchCaseSensitive.value} />
								Case sensitive</label
							>
						</dd>
						<dt>Matches</dt>
						<dd>{foundLayerIds.length}</dd>
						<dt></dt>
						<dd style="display: flex; gap: 1ex; justify-content: flex-end;">
							<button type="submit" class="form-button">Select Matches</button>
							{#if searchReplaceMode.value}
								<button
									type="button"
									class="form-button"
									onclick={() => replaceSearchMatches(cast, doc.value, layersInOrder.value)}
									disabled={!foundLayerIds.length}>Replace</button
								>
							{/if}
						</dd>
					</dl>
				</form>
			</Modal>

			<header class="header" use:editorDropZone={{ dispatch, cast }}>
				<div class="header-titel">
					<a
						href={resolve(`/projects/${data.document.links.project.id}/documents`)}
						data-sveltekit-preload-data="off"
						title="Back"
						class="nav-link">Back</a
					>

					<h2>Document: {doc.value.name}</h2>
				</div>

				<menu class="header-menu">
					<ol class="menu-bar">
						<li class="menu-bar-item" tabindex="-1">
							File
							<ul class="menu-bar-menu">
								<li class="menu-bar-menu-item">
									<MenuBarButton
										shortcut={{ ctrlKey: true, key: 'n' }}
										onclick={(evt) => {
											evt.preventDefault();
											showNewDrawing.value = true;
										}}>New Drawing...</MenuBarButton
									>
								</li>
								<li class="menu-bar-menu-item">
									<MenuBarButton
										onclick={() => {
											statusMessage.value = 'The document is saved automatically.';
										}}>Save</MenuBarButton
									>
								</li>
								<li class="menu-bar-menu-item submenu">
									<button type="button" class="menu-bar-item-button submenu-trigger">
										<span>Recently saved</span>
										<span class="submenu-arrow">&gt;</span>
									</button>
									<ul class="menu-bar-menu submenu-menu">
										{#each recentDocuments.value as recent}
											<li class="menu-bar-menu-item">
												<a class="menu-bar-item-button" href={recent.href}>{recent.name}</a>
											</li>
										{:else}
											<li class="menu-bar-menu-item">
												<MenuBarButton disabled>No recent drawings</MenuBarButton>
											</li>
										{/each}
										<li class="menu-bar-menu-item"><hr class="menu-bar-menu-ruler" /></li>
										<li class="menu-bar-menu-item">
											<MenuBarButton
												disabled={recentDocuments.value.length === 0}
												onclick={(evt) => {
													evt.preventDefault();
													clearRecentDocuments();
												}}>Clear list</MenuBarButton
											>
										</li>
									</ul>
								</li>
								<li class="menu-bar-menu-item">
									<MenuBarButton
										onclick={(evt) => {
											evt.preventDefault();
											openNavigatorPane();
										}}>Open Navigator</MenuBarButton
									>
								</li>
								<li class="menu-bar-menu-item">
									<MenuBarButton
										onclick={() => {
											showRename.value = true;
										}}>Rename</MenuBarButton
									>
								</li>
								<li class="menu-bar-menu-item submenu">
									<button type="button" class="menu-bar-item-button submenu-trigger">
										<span>Import</span>
										<span class="submenu-arrow">&gt;</span>
									</button>
									<ul class="menu-bar-menu submenu-menu">
										<li class="menu-bar-menu-item">
											<MenuBarButton
												onclick={(evt) => {
													evt.preventDefault();
													importFiles(dispatch, cast, '.rnw');
												}}>Renew .rnw...</MenuBarButton
											>
										</li>
										<li class="menu-bar-menu-item">
											<MenuBarButton
												onclick={(evt) => {
													evt.preventDefault();
													importFiles(dispatch, cast, '.draw');
												}}>Draw...</MenuBarButton
											>
										</li>
										<li class="menu-bar-menu-item">
											<MenuBarButton
												onclick={(evt) => {
													evt.preventDefault();
													importFiles(dispatch, cast, '.svg');
												}}>SVG...</MenuBarButton
											>
										</li>
										<li class="menu-bar-menu-item">
											<MenuBarButton
												onclick={(evt) => {
													evt.preventDefault();
													importFiles(dispatch, cast, 'image/*');
												}}>Image...</MenuBarButton
											>
										</li>
									</ul>
								</li>
								<li class="menu-bar-menu-item">
									<MenuBarButton
										onclick={() => {
											data.commands.duplicateDocument();
										}}>Duplicate</MenuBarButton
									>
								</li>
								<li class="menu-bar-menu-item submenu">
									<button type="button" class="menu-bar-item-button submenu-trigger">
										<span>Export</span>
										<span class="submenu-arrow">&gt;</span>
									</button>
									<ul class="menu-bar-menu submenu-menu">
										<li class="menu-bar-menu-item">
											<MenuBarButton
												onclick={() => {
													data.commands
														.exportRenew()
														.catch((e) => queueError(e, 'Renew export failed'));
												}}>Renew .rnw</MenuBarButton
											>
										</li>
										<li class="menu-bar-menu-item">
											<MenuBarButton
												onclick={(evt) => {
													evt.preventDefault();
													downloadSvgDrawing(doc.value);
												}}>SVG</MenuBarButton
											>
										</li>
										<li class="menu-bar-menu-item">
											<MenuBarButton
												onclick={(evt) => {
													evt.preventDefault();
													downloadPngDrawing(doc.value);
												}}>PNG</MenuBarButton
											>
										</li>
										<li class="menu-bar-menu-item">
											<MenuBarButton
												onclick={() => {
													data.commands
														.downloadJson()
														.catch((e) => queueError(e, 'JSON export failed'));
												}}>JSON</MenuBarButton
											>
										</li>
										<li class="menu-bar-menu-item">
											<MenuBarButton
												class="menu-bar-item-button"
												onclick={() => {
													data.commands
														.downloadStruct()
														.catch((e) => queueError(e, 'Document structure export failed'));
												}}>Struct</MenuBarButton
											>
										</li>
									</ul>
								</li>
								<li class="menu-bar-menu-item">
									<MenuBarButton shortcut={{ ctrlKey: true, key: 'p' }} onclick={printDrawing}
										>Print Drawing</MenuBarButton
									>
								</li>
								<li class="menu-bar-menu-item">
									<MenuBarButton
										onclick={(evt) => {
											evt.preventDefault();
											openUrl(dispatch, cast);
										}}>Open URL...</MenuBarButton
									>
								</li>
								<li class="menu-bar-menu-item"><hr class="menu-bar-menu-ruler" /></li>
								<li class="menu-bar-menu-item submenu">
									<button type="button" class="menu-bar-item-button submenu-trigger">
										<span>Open Drawings</span>
										<span class="submenu-arrow">&gt;</span>
									</button>
									<ul class="menu-bar-menu submenu-menu">
										{#each documentTabs(doc.value) as tab (tab.id)}
											<li class="menu-bar-menu-item">
												<a
													class="menu-bar-item-button"
													class:active={tab.id === data.document.id}
													href={tab.href}
													data-sveltekit-preload-data="off"
													data-sveltekit-preload-code="eager"
													title={tab.name}>{tab.name}</a
												>
											</li>
										{:else}
											<li class="menu-bar-menu-item">
												<MenuBarButton disabled>No open drawings</MenuBarButton>
											</li>
										{/each}
									</ul>
								</li>
								<li class="menu-bar-menu-item">
									<MenuBarButton
										disabled={documentTabs(doc.value).length <= 1}
										onclick={(evt) => {
											evt.preventDefault();
											closeOtherDrawings();
										}}>Close Other Drawings</MenuBarButton
									>
								</li>
								<li class="menu-bar-menu-item"><hr class="menu-bar-menu-ruler" /></li>
								<li class="menu-bar-menu-item">
									<MenuBarButton
										onclick={(evt) => {
											evt.preventDefault();
											closeAllDrawings();
										}}>Close All Drawings</MenuBarButton
									>
								</li>
								<li class="menu-bar-menu-item">
									<MenuBarButton
										onclick={(evt) => {
											evt.preventDefault();
											exitEditor();
										}}>Exit</MenuBarButton
									>
								</li>
								<li class="menu-bar-menu-item"><hr class="menu-bar-menu-ruler" /></li>
								<li class="menu-bar-menu-item">
									<MenuBarButton onclick={deleteThisDocument} style="color: #aa0000"
										>Delete Document</MenuBarButton
									>
								</li>
							</ul>
						</li>
						<li class="menu-bar-item" tabindex="-1">
							Edit
							<ul class="menu-bar-menu">
								<li class="menu-bar-menu-item">
									<MenuBarButton
										disabled={doc.value.snapshot.prev_id == doc.value.snapshot.current_id}
										shortcut={{ ctrlKey: true, key: 'z' }}
										onclick={(evt) => {
											evt.preventDefault();
											cast('restore_snapshot', doc.value.snapshot.prev_id);
										}}>Undo</MenuBarButton
									>
								</li>
								<li class="menu-bar-menu-item">
									{#if doc.value.snapshot.next_ids.length > 1}
										<hr class="menu-bar-menu-ruler" />
									{:else if doc.value.snapshot.next_ids.length > 0}
										<MenuBarButton
											disabled={doc.value.snapshot.next_ids[0] == doc.value.snapshot.current_id}
											shortcut={{ ctrlKey: true, key: 'y' }}
											onclick={(evt) => {
												evt.preventDefault();
												cast('restore_snapshot', doc.value.snapshot.next_ids[0]);
											}}>Redo</MenuBarButton
										>
									{:else}
										<MenuBarButton shortcut={{ ctrlKey: true, key: 'y' }} disabled
											>Redo</MenuBarButton
										>
									{/if}
								</li>
								{#if doc.value.snapshot.next_ids.length > 1}
									{#each doc.value.snapshot.next_ids as nid, i}
										{#if nid !== doc.value.snapshot.current_id}
											<li class="menu-bar-menu-item">
												<MenuBarButton
													shortcut={i == 0 ? { ctrlKey: true, key: 'y' } : null}
													onclick={(evt) => {
														evt.preventDefault();
														cast('restore_snapshot', nid);
													}}>redo ({i})</MenuBarButton
												>
											</li>
										{/if}
									{/each}
									<li class="menu-bar-menu-item"><hr class="menu-bar-menu-ruler" /></li>
								{/if}

								<li class="menu-bar-menu-item"><hr class="menu-bar-menu-ruler" /></li>
								<li class="menu-bar-menu-item">
									<MenuBarButton
										disabled={selectedLayers.value.length === 0}
										shortcut={{ ctrlKey: true, key: 'x' }}
										onclick={(evt) => {
											evt.preventDefault();
											cutSelectedLayers(dispatch, cast, layersInOrder.value);
										}}>Cut</MenuBarButton
									>
								</li>
								<li class="menu-bar-menu-item">
									<MenuBarButton
										disabled={selectedLayers.value.length === 0}
										shortcut={{ ctrlKey: true, key: 'c' }}
										onclick={(evt) => {
											evt.preventDefault();
											copySelectedLayers(dispatch, layersInOrder.value);
										}}>Copy</MenuBarButton
									>
								</li>
								<li class="menu-bar-menu-item">
									<MenuBarButton
										shortcut={{ ctrlKey: true, key: 'v' }}
										onclick={(evt) => {
											evt.preventDefault();
											pasteLayerClipboard(dispatch, cast);
										}}>Paste</MenuBarButton
									>
								</li>
								<li class="menu-bar-menu-item"><hr class="menu-bar-menu-ruler" /></li>
								<li class="menu-bar-menu-item">
									<MenuBarButton
										disabled={selectedLayers.value.length === 0}
										shortcut={{ ctrlKey: true, key: 'd' }}
										onclick={(evt) => {
											evt.preventDefault();
											duplicateSelectedLayers(dispatch, cast, layersInOrder.value);
										}}>Duplicate</MenuBarButton
									>
								</li>
								<li class="menu-bar-menu-item">
									<MenuBarButton
										disabled={selectedLayers.value.length === 0}
										onclick={(evt) => {
											evt.preventDefault();
											deleteSelectedLayers(cast, layersInOrder.value);
										}}
										class="menu-bar-item-button menu-bar-item-danger">Delete</MenuBarButton
									>
								</li>
								<li class="menu-bar-menu-item"><hr class="menu-bar-menu-ruler" /></li>
								<li class="menu-bar-menu-item">
									<MenuBarButton
										shortcut={{ ctrlKey: true, key: 'f' }}
										onclick={(evt) => {
											evt.preventDefault();
											searchReplaceMode.value = false;
											showSearch.value = true;
										}}>Search...</MenuBarButton
									>
								</li>
								<li class="menu-bar-menu-item">
									<MenuBarButton
										shortcut={{ ctrlKey: true, key: 'g' }}
										onclick={(evt) => {
											evt.preventDefault();
											searchReplaceMode.value = true;
											showSearch.value = true;
										}}>Search & Replace...</MenuBarButton
									>
								</li>
								<li class="menu-bar-menu-item"><hr class="menu-bar-menu-ruler" /></li>
								<li class="menu-bar-menu-item">
									<MenuBarButton
										disabled={selectedLayers.value.length === 0}
										shortcut={{ ctrlKey: true, shiftKey: true, key: 'g' }}
										onclick={(evt) => {
											evt.preventDefault();
											wrapSelectedLayersInGroup(dispatch, cast, layersInOrder.value);
										}}>Wrap in Group</MenuBarButton
									>
								</li>
								<li class="menu-bar-menu-item">
									<MenuBarButton
										disabled={selectedGroupLayerIds(layersInOrder.value).length === 0}
										shortcut={{ ctrlKey: true, shiftKey: true, key: 'u' }}
										onclick={(evt) => {
											evt.preventDefault();
											ungroupSelectedLayers(cast, layersInOrder.value);
										}}>Ungroup</MenuBarButton
									>
								</li>
								<li class="menu-bar-menu-item"><hr class="menu-bar-menu-ruler" /></li>
								<li class="menu-bar-menu-item">
									<MenuBarButton
										disabled={!singleSelectedLayer.value}
										onclick={(evt) => {
											evt.preventDefault();

											dispatch('set_thumbnail', {
												layer_id: singleSelectedLayer.value.id
											});
										}}>Mark Layer as Thumbnail</MenuBarButton
									>
								</li>
								<li class="menu-bar-menu-item">
									<MenuBarButton
										disabled={!layerTargetUrl(singleSelectedLayer.value)}
										onclick={(evt) => {
											evt.preventDefault();
											openLayerTargetLocation(singleSelectedLayer.value);
										}}>Open Target Location</MenuBarButton
									>
								</li>
								<li class="menu-bar-menu-item"><hr class="menu-bar-menu-ruler" /></li>
								<li class="menu-bar-menu-item">
									<MenuBarButton
										shortcut={{ ctrlKey: true, key: 'a' }}
										onclick={(evt) => {
											evt.preventDefault();
											selectAllLayers(cast, layersInOrder.value);
										}}>Select All</MenuBarButton
									>
								</li>
								<li class="menu-bar-menu-item">
									<MenuBarButton
										onclick={(evt) => {
											evt.preventDefault();
											invertSelection(cast, layersInOrder.value);
										}}>Invert Selection</MenuBarButton
									>
								</li>
								{#each renewSelectionOperations as { label, operation }}
									<li class="menu-bar-menu-item submenu">
										<button type="button" class="menu-bar-item-button submenu-trigger">
											<span>{label}</span>
											<span class="submenu-arrow">&gt;</span>
										</button>
										<ul class="menu-bar-menu submenu-menu">
											{#each renewSelectionMenuGroups as group}
												{#if group.options}
													<li class="menu-bar-menu-item submenu">
														<button type="button" class="menu-bar-item-button submenu-trigger">
															<span>{group.label}</span>
															<span class="submenu-arrow">&gt;</span>
														</button>
														<ul class="menu-bar-menu submenu-menu">
															{#each group.options as option}
																<li class="menu-bar-menu-item">
																	<MenuBarButton
																		onclick={(evt) => {
																			evt.preventDefault();
																			applyRenewSelection(
																				cast,
																				doc.value,
																				layersInOrder.value,
																				option.filter,
																				operation
																			);
																		}}>{option.label}</MenuBarButton
																	>
																</li>
															{/each}
														</ul>
													</li>
												{:else}
													<li class="menu-bar-menu-item">
														<MenuBarButton
															onclick={(evt) => {
																evt.preventDefault();
																applyRenewSelection(
																	cast,
																	doc.value,
																	layersInOrder.value,
																	group.filter,
																	operation
																);
															}}>{group.label}</MenuBarButton
														>
													</li>
												{/if}
											{/each}
										</ul>
									</li>
								{/each}
							</ul>
						</li>
						<li class="menu-bar-item" tabindex="-1">
							Layout
							<ul class="menu-bar-menu">
								<li class="menu-bar-menu-item">
									<label class="menu-bar-item-button">
										<input type="checkbox" bind:checked={snapToGrid.value} />
										Toggle Snap to Grid</label
									>
								</li>
								<li class="menu-bar-menu-item">
									<MenuBarButton
										disabled={selectedLayers.value.length === 0}
										onclick={(evt) => {
											evt.preventDefault();
											snapSelectedLayersToGrid(
												dispatch,
												doc.value,
												layersInOrder.value,
												textBounds.value
											);
										}}>Snap to Grid now</MenuBarButton
									>
								</li>
								<li class="menu-bar-menu-item"><hr class="menu-bar-menu-ruler" /></li>
								<li class="menu-bar-menu-item submenu">
									<button type="button" class="menu-bar-item-button submenu-trigger">
										<span>Align</span>
										<span class="submenu-arrow">&gt;</span>
									</button>
									<ul class="menu-bar-menu submenu-menu">
										{#each [{ label: 'Left', axis: 'x', mode: 'min' }, { label: 'Horizontal Center', axis: 'x', mode: 'center' }, { label: 'Right', axis: 'x', mode: 'max' }, { label: 'Top', axis: 'y', mode: 'min' }, { label: 'Vertical Center', axis: 'y', mode: 'center' }, { label: 'Bottom', axis: 'y', mode: 'max' }] as { label, axis, mode }}
											<li class="menu-bar-menu-item">
												<MenuBarButton
													disabled={selectedLayers.value.length < 2}
													onclick={(evt) => {
														evt.preventDefault();
														alignSelectedLayers(
															dispatch,
															doc.value,
															layersInOrder.value,
															textBounds.value,
															axis,
															mode
														);
													}}>{label}</MenuBarButton
												>
											</li>
										{/each}
									</ul>
								</li>
								<li class="menu-bar-menu-item submenu">
									<button type="button" class="menu-bar-item-button submenu-trigger">
										<span>Spread</span>
										<span class="submenu-arrow">&gt;</span>
									</button>
									<ul class="menu-bar-menu submenu-menu">
										{#each [{ label: 'Horizontal', axis: 'x' }, { label: 'Vertical', axis: 'y' }] as { label, axis }}
											<li class="menu-bar-menu-item">
												<MenuBarButton
													disabled={selectedLayers.value.length < 3}
													onclick={(evt) => {
														evt.preventDefault();
														spreadSelectedLayers(
															dispatch,
															doc.value,
															layersInOrder.value,
															textBounds.value,
															axis
														);
													}}>{label}</MenuBarButton
												>
											</li>
										{/each}
									</ul>
								</li>
								<li class="menu-bar-menu-item submenu">
									<button type="button" class="menu-bar-item-button submenu-trigger">
										<span>Figure Size</span>
										<span class="submenu-arrow">&gt;</span>
									</button>
									<ul class="menu-bar-menu submenu-menu">
										<li class="menu-bar-menu-item">
											<MenuBarButton
												disabled={selectedLayers.value.length === 0}
												onclick={(evt) => {
													evt.preventDefault();
													promptSelectedFigureSize(
														dispatch,
														doc.value,
														layersInOrder.value,
														textBounds.value
													);
												}}>Set Size...</MenuBarButton
											>
										</li>
										{#each [{ label: 'Same Width', dimension: 'width' }, { label: 'Same Height', dimension: 'height' }, { label: 'Same Size', dimension: 'both' }] as { label, dimension }}
											<li class="menu-bar-menu-item">
												<MenuBarButton
													disabled={selectedLayers.value.length < 2}
													onclick={(evt) => {
														evt.preventDefault();
														equalizeSelectedFigureSize(
															dispatch,
															doc.value,
															layersInOrder.value,
															textBounds.value,
															dimension
														);
													}}>{label}</MenuBarButton
												>
											</li>
										{/each}
									</ul>
								</li>
								<li class="menu-bar-menu-item"><hr class="menu-bar-menu-ruler" /></li>
								<li class="menu-bar-menu-item">
									<MenuBarButton
										onclick={(evt) => {
											evt.preventDefault();
											automaticLayout(dispatch, doc.value, layersInOrder.value, textBounds.value);
										}}>Automatic Layout...</MenuBarButton
									>
								</li>
								<li class="menu-bar-menu-item submenu">
									<button type="button" class="menu-bar-item-button submenu-trigger">
										<span>Location</span>
										<span class="submenu-arrow">&gt;</span>
									</button>
									<ul class="menu-bar-menu submenu-menu">
										<li class="menu-bar-menu-item">
											<MenuBarButton
												disabled={selectedLayers.value.length === 0}
												onclick={(evt) => {
													evt.preventDefault();
													promptSelectedLocation(
														dispatch,
														doc.value,
														layersInOrder.value,
														textBounds.value
													);
												}}>Set Location...</MenuBarButton
											>
										</li>
									</ul>
								</li>
								<li class="menu-bar-menu-item"><hr class="menu-bar-menu-ruler" /></li>
								<li class="menu-bar-menu-item"><div style="padding: 1ex">Reorder:</div></li>
								{#each [{ target_rel: 'before_parent', label: 'Below Parent' }, { target_rel: 'after_parent', label: 'Above Parent' }, { target_rel: 'into_prev', label: 'Indent' }, { target_rel: 'frontwards', label: 'Frontwards' }, { target_rel: 'backwards', label: 'Backwards' }, { target_rel: 'to_front', label: 'To Front' }, { target_rel: 'to_back', label: 'To Back' }] as { label, target_rel }}
									<li class="menu-bar-menu-item">
										<MenuBarButton
											disabled={selectedLayers.value.length === 0}
											onclick={(evt) => {
												evt.preventDefault();
												reorderSelectedLayers(dispatch, cast, target_rel, layersInOrder.value);
											}}>{label}</MenuBarButton
										>
									</li>
								{/each}
							</ul>
						</li>
						<li class="menu-bar-item" tabindex="-1">
							Attributes
							<ul class="menu-bar-menu">
								<li class="menu-bar-menu-item submenu">
									<button type="button" class="menu-bar-item-button submenu-trigger">
										<span>Fill Opacity</span>
										<span class="submenu-arrow">&gt;</span>
									</button>
									<ul class="menu-bar-menu submenu-menu">
										{#each [{ label: '100%', value: 1 }, { label: '75%', value: 0.75 }, { label: '50%', value: 0.5 }, { label: '25%', value: 0.25 }] as { label, value }}
											<li class="menu-bar-menu-item">
												<MenuBarButton
													disabled={selectedLayers.value.length === 0}
													onclick={(evt) => {
														evt.preventDefault();
														changeSelectedStyle(
															cast,
															doc.value,
															layersInOrder.value,
															'layer',
															'background_opacity',
															value,
															(layer) => !!layer?.box
														);
													}}>{label}</MenuBarButton
												>
											</li>
										{/each}
										<li class="menu-bar-menu-item">
											<MenuBarButton
												disabled={selectedLayers.value.length === 0}
												onclick={(evt) => {
													evt.preventDefault();
													promptSelectedOpacity(
														cast,
														doc.value,
														layersInOrder.value,
														'layer',
														'background_opacity',
														'Fill opacity',
														(layer) => !!layer?.box
													);
												}}>Custom...</MenuBarButton
											>
										</li>
									</ul>
								</li>
								<li class="menu-bar-menu-item submenu">
									<button type="button" class="menu-bar-item-button submenu-trigger">
										<span>Pen Opacity</span>
										<span class="submenu-arrow">&gt;</span>
									</button>
									<ul class="menu-bar-menu submenu-menu">
										{#each [{ label: '100%', value: 1 }, { label: '75%', value: 0.75 }, { label: '50%', value: 0.5 }, { label: '25%', value: 0.25 }] as { label, value }}
											<li class="menu-bar-menu-item">
												<MenuBarButton
													disabled={selectedLayers.value.length === 0}
													onclick={(evt) => {
														evt.preventDefault();
														changeSelectedStyle(
															cast,
															doc.value,
															layersInOrder.value,
															'layer',
															'border_opacity',
															value,
															(layer) => !!layer?.box
														);
														changeSelectedStyle(
															cast,
															doc.value,
															layersInOrder.value,
															'edge',
															'stroke_opacity',
															value,
															(layer) => !!layer?.edge
														);
													}}>{label}</MenuBarButton
												>
											</li>
										{/each}
										<li class="menu-bar-menu-item">
											<MenuBarButton
												disabled={selectedLayers.value.length === 0}
												onclick={(evt) => {
													evt.preventDefault();
													const val = Number(prompt('Pen opacity', '1'));
													if (!Number.isFinite(val)) {
														return;
													}
													const opacity = R.clamp(0, 1, val);
													changeSelectedStyle(
														cast,
														doc.value,
														layersInOrder.value,
														'layer',
														'border_opacity',
														opacity,
														(layer) => !!layer?.box
													);
													changeSelectedStyle(
														cast,
														doc.value,
														layersInOrder.value,
														'edge',
														'stroke_opacity',
														opacity,
														(layer) => !!layer?.edge
													);
												}}>Custom...</MenuBarButton
											>
										</li>
									</ul>
								</li>
								<li class="menu-bar-menu-item submenu">
									<button type="button" class="menu-bar-item-button submenu-trigger">
										<span>Line Style</span>
										<span class="submenu-arrow">&gt;</span>
									</button>
									<ul class="menu-bar-menu submenu-menu">
										{#each [{ label: 'Solid', value: '' }, { label: 'Dashed', value: '8 4' }, { label: 'Dotted', value: '2 4' }, { label: 'Dash-dot', value: '8 4 2 4' }] as { label, value }}
											<li class="menu-bar-menu-item">
												<MenuBarButton
													disabled={selectedLayers.value.length === 0}
													onclick={(evt) => {
														evt.preventDefault();
														changeSelectedStyle(
															cast,
															doc.value,
															layersInOrder.value,
															'layer',
															'border_dash_array',
															value,
															(layer) => !!layer?.box
														);
														changeSelectedStyle(
															cast,
															doc.value,
															layersInOrder.value,
															'edge',
															'stroke_dash_array',
															value,
															(layer) => !!layer?.edge
														);
													}}>{label}</MenuBarButton
												>
											</li>
										{/each}
										<li class="menu-bar-menu-item">
											<MenuBarButton
												disabled={selectedLayers.value.length === 0}
												onclick={(evt) => {
													evt.preventDefault();
													const value = prompt('Dash pattern, for example: 8 4 2 4', '');
													if (value === null) {
														return;
													}
													changeSelectedStyle(
														cast,
														doc.value,
														layersInOrder.value,
														'layer',
														'border_dash_array',
														value,
														(layer) => !!layer?.box
													);
													changeSelectedStyle(
														cast,
														doc.value,
														layersInOrder.value,
														'edge',
														'stroke_dash_array',
														value,
														(layer) => !!layer?.edge
													);
												}}>Custom...</MenuBarButton
											>
										</li>
									</ul>
								</li>
								<li class="menu-bar-menu-item submenu">
									<button type="button" class="menu-bar-item-button submenu-trigger">
										<span>Round corners</span>
										<span class="submenu-arrow">&gt;</span>
									</button>
									<ul class="menu-bar-menu submenu-menu">
										{#await data.symbols then symbols}
											{#each [{ label: 'None', radius: 0 }, { label: 'Small', radius: 6 }, { label: 'Medium', radius: 12 }, { label: 'Large', radius: 24 }] as { label, radius }}
												<li class="menu-bar-menu-item">
													<MenuBarButton
														disabled={selectedLayers.value.length === 0}
														onclick={(evt) => {
															evt.preventDefault();
															changeSelectedBoxRoundCorners(
																cast,
																doc.value,
																layersInOrder.value,
																symbols,
																radius
															);
														}}>{label}</MenuBarButton
													>
												</li>
											{/each}
										{:catch}
											<li class="menu-bar-menu-item">
												<MenuBarButton disabled>Symbols unavailable</MenuBarButton>
											</li>
										{/await}
									</ul>
								</li>
								<li class="menu-bar-menu-item submenu">
									<button type="button" class="menu-bar-item-button submenu-trigger">
										<span>Font</span>
										<span class="submenu-arrow">&gt;</span>
									</button>
									<ul class="menu-bar-menu submenu-menu">
										{#each [{ label: 'Sans Serif', value: 'sans-serif' }, { label: 'Serif', value: 'serif' }, { label: 'Monospace', value: 'monospace' }, { label: 'Dialog', value: 'Dialog, sans-serif' }, { label: 'Helvetica', value: 'Helvetica, Arial, sans-serif' }, { label: 'Times', value: '"Times New Roman", Times, serif' }, { label: 'Courier', value: '"Courier New", Courier, monospace' }] as { label, value }}
											<li class="menu-bar-menu-item">
												<MenuBarButton
													disabled={selectedLayers.value.length === 0}
													onclick={(evt) => {
														evt.preventDefault();
														changeSelectedStyle(
															cast,
															doc.value,
															layersInOrder.value,
															'text',
															'font_family',
															value,
															(layer) => !!layer?.text
														);
													}}>{label}</MenuBarButton
												>
											</li>
										{/each}
										<li class="menu-bar-menu-item">
											<MenuBarButton
												disabled={selectedLayers.value.length === 0}
												onclick={(evt) => {
													evt.preventDefault();
													promptSelectedStyle(
														cast,
														doc.value,
														layersInOrder.value,
														'text',
														'font_size',
														'Font size',
														(layer) => !!layer?.text
													);
												}}>Font Size...</MenuBarButton
											>
										</li>
										<li class="menu-bar-menu-item"><hr class="menu-bar-menu-ruler" /></li>
										{#each [{ label: 'Bold', attr: 'bold' }, { label: 'Italic', attr: 'italic' }, { label: 'Underline', attr: 'underline' }] as { label, attr }}
											<li class="menu-bar-menu-item submenu">
												<button type="button" class="menu-bar-item-button submenu-trigger">
													<span>{label}</span>
													<span class="submenu-arrow">&gt;</span>
												</button>
												<ul class="menu-bar-menu submenu-menu">
													{#each [{ label: 'On', value: true }, { label: 'Off', value: false }] as { label, value }}
														<li class="menu-bar-menu-item">
															<MenuBarButton
																disabled={selectedLayers.value.length === 0}
																onclick={(evt) => {
																	evt.preventDefault();
																	changeSelectedStyle(
																		cast,
																		doc.value,
																		layersInOrder.value,
																		'text',
																		attr,
																		value,
																		(layer) => !!layer?.text
																	);
																}}>{label}</MenuBarButton
															>
														</li>
													{/each}
												</ul>
											</li>
										{/each}
										<li class="menu-bar-menu-item submenu">
											<button type="button" class="menu-bar-item-button submenu-trigger">
												<span>Alignment</span>
												<span class="submenu-arrow">&gt;</span>
											</button>
											<ul class="menu-bar-menu submenu-menu">
												{#each [{ label: 'Left', value: 'left' }, { label: 'Center', value: 'center' }, { label: 'Right', value: 'right' }] as { label, value }}
													<li class="menu-bar-menu-item">
														<MenuBarButton
															disabled={selectedLayers.value.length === 0}
															onclick={(evt) => {
																evt.preventDefault();
																changeSelectedStyle(
																	cast,
																	doc.value,
																	layersInOrder.value,
																	'text',
																	'alignment',
																	value,
																	(layer) => !!layer?.text
																);
															}}>{label}</MenuBarButton
														>
													</li>
												{/each}
											</ul>
										</li>
									</ul>
								</li>
								<li class="menu-bar-menu-item submenu">
									<button type="button" class="menu-bar-item-button submenu-trigger">
										<span>Text Opacity</span>
										<span class="submenu-arrow">&gt;</span>
									</button>
									<ul class="menu-bar-menu submenu-menu">
										{#each [{ label: '100%', value: 1 }, { label: '75%', value: 0.75 }, { label: '50%', value: 0.5 }, { label: '25%', value: 0.25 }] as { label, value }}
											<li class="menu-bar-menu-item">
												<MenuBarButton
													disabled={selectedLayers.value.length === 0}
													onclick={(evt) => {
														evt.preventDefault();
														changeSelectedStyle(
															cast,
															doc.value,
															layersInOrder.value,
															'text',
															'opacity',
															value,
															(layer) => !!layer?.text
														);
													}}>{label}</MenuBarButton
												>
											</li>
										{/each}
										<li class="menu-bar-menu-item">
											<MenuBarButton
												disabled={selectedLayers.value.length === 0}
												onclick={(evt) => {
													evt.preventDefault();
													promptSelectedOpacity(
														cast,
														doc.value,
														layersInOrder.value,
														'text',
														'opacity',
														'Text opacity',
														(layer) => !!layer?.text
													);
												}}>Custom...</MenuBarButton
											>
										</li>
									</ul>
								</li>
								<li class="menu-bar-menu-item submenu">
									<button type="button" class="menu-bar-item-button submenu-trigger">
										<span>Text Background</span>
										<span class="submenu-arrow">&gt;</span>
									</button>
									<ul class="menu-bar-menu submenu-menu">
										{#each [{ label: 'Transparent', value: 'transparent' }, { label: 'White', value: '#ffffff' }, { label: 'Yellow', value: '#fff4a3' }] as { label, value }}
											<li class="menu-bar-menu-item">
												<MenuBarButton
													disabled={selectedLayers.value.length === 0}
													onclick={(evt) => {
														evt.preventDefault();
														changeSelectedStyle(
															cast,
															doc.value,
															layersInOrder.value,
															'text',
															'background_color',
															value,
															(layer) => !!layer?.text
														);
													}}>{label}</MenuBarButton
												>
											</li>
										{/each}
										<li class="menu-bar-menu-item">
											<MenuBarButton
												disabled={selectedLayers.value.length === 0}
												onclick={(evt) => {
													evt.preventDefault();
													promptSelectedStyle(
														cast,
														doc.value,
														layersInOrder.value,
														'text',
														'background_color',
														'Text background color',
														(layer) => !!layer?.text
													);
												}}>Custom...</MenuBarButton
											>
										</li>
										<li class="menu-bar-menu-item submenu">
											<button type="button" class="menu-bar-item-button submenu-trigger">
												<span>Opacity</span>
												<span class="submenu-arrow">&gt;</span>
											</button>
											<ul class="menu-bar-menu submenu-menu">
												{#each [{ label: '100%', value: 1 }, { label: '75%', value: 0.75 }, { label: '50%', value: 0.5 }, { label: '25%', value: 0.25 }] as { label, value }}
													<li class="menu-bar-menu-item">
														<MenuBarButton
															disabled={selectedLayers.value.length === 0}
															onclick={(evt) => {
																evt.preventDefault();
																changeSelectedStyle(
																	cast,
																	doc.value,
																	layersInOrder.value,
																	'text',
																	'background_opacity',
																	value,
																	(layer) => !!layer?.text
																);
															}}>{label}</MenuBarButton
														>
													</li>
												{/each}
												<li class="menu-bar-menu-item">
													<MenuBarButton
														disabled={selectedLayers.value.length === 0}
														onclick={(evt) => {
															evt.preventDefault();
															promptSelectedOpacity(
																cast,
																doc.value,
																layersInOrder.value,
																'text',
																'background_opacity',
																'Text background opacity',
																(layer) => !!layer?.text
															);
														}}>Custom...</MenuBarButton
													>
												</li>
											</ul>
										</li>
									</ul>
								</li>
								<li class="menu-bar-menu-item submenu">
									<button type="button" class="menu-bar-item-button submenu-trigger">
										<span>Text Type</span>
										<span class="submenu-arrow">&gt;</span>
									</button>
									<ul class="menu-bar-menu submenu-menu">
										{#each [{ label: 'Label', value: RENEW_TEXT_TYPE.LABEL }, { label: 'Inscription', value: RENEW_TEXT_TYPE.INSCRIPTION }, { label: 'Name', value: RENEW_TEXT_TYPE.NAME }, { label: 'Declaration', value: RENEW_TEXT_TYPE.AUX }, { label: 'Comment', value: RENEW_TEXT_TYPE.COMM }] as { label, value }}
											<li class="menu-bar-menu-item">
												<MenuBarButton
													disabled={selectedLayers.value.length === 0}
													onclick={(evt) => {
														evt.preventDefault();
														changeSelectedTextType(cast, doc.value, layersInOrder.value, value);
													}}>{label}</MenuBarButton
												>
											</li>
										{/each}
									</ul>
								</li>
							</ul>
						</li>
						<li class="menu-bar-item" tabindex="-1">
							Net
							<ul class="menu-bar-menu">
								<li class="menu-bar-menu-item">
									<MenuBarButton
										onclick={(evt) => {
											evt.preventDefault();
											checkInscriptions(doc.value);
										}}>Check Inscriptions</MenuBarButton
									>
								</li>
								<li class="menu-bar-menu-item">
									<MenuBarButton
										disabled={selectedLayers.value.length !== 2}
										onclick={(evt) => {
											evt.preventDefault();
											relinkSelectedInscription(cast, doc.value);
										}}>Attach Inscription to Selection</MenuBarButton
									>
								</li>
								<li class="menu-bar-menu-item">
									<label class="menu-bar-item-button">
										<input type="checkbox" bind:checked={showSequentialOnlyArcs.value} />
										Show sequential-only arcs</label
									>
								</li>
							</ul>
						</li>
						<li class="menu-bar-item" tabindex="-1">
							Selection
							<ul class="menu-bar-menu">
								{#each [{ label: 'Parent', rel: 'parent' }, { label: 'First Sibling', rel: 'sibling_first' }, { label: 'Last Sibling', rel: 'sibling_last' }, { label: 'Sibling Below', rel: 'sibling_prev' }, { label: 'Sibling Above', rel: 'sibling_next' }, { label: 'First Child', rel: 'child_first' }, { label: 'Last Child', rel: 'child_last' }] as { label, rel }}
									<li class="menu-bar-menu-item">
										<MenuBarButton
											disabled={selectedLayers.value.length === 0}
											onclick={(evt) => {
												evt.preventDefault();
												selectRelativeLayers(
													dispatch,
													cast,
													'fetch_relative',
													rel,
													layersInOrder.value
												);
											}}>Select {label}</MenuBarButton
										>
									</li>
								{/each}

								<li class="menu-bar-menu-item submenu">
									<button type="button" class="menu-bar-item-button submenu-trigger">
										<span>Select Family</span>
										<span class="submenu-arrow">&gt;</span>
									</button>
									<ul class="menu-bar-menu submenu-menu">
										{#each [{ label: 'Root', rel: 'root' }, { label: 'All Ancestors', rel: 'ancestors' }, { label: 'All Siblings', rel: 'siblings' }, { label: 'Siblings Before', rel: 'siblings_before' }, { label: 'Siblings After', rel: 'siblings_after' }, { label: 'All Direct Children', rel: 'direct_children' }, { label: 'All Deep Children', rel: 'deep_children' }, { label: 'All Leaf Children', rel: 'leafs' }] as { label, rel }}
											<li class="menu-bar-menu-item">
												<MenuBarButton
													disabled={selectedLayers.value.length === 0}
													onclick={(evt) => {
														evt.preventDefault();
														selectRelativeLayers(
															dispatch,
															cast,
															'fetch_relative_many',
															rel,
															layersInOrder.value
														);
													}}>{label}</MenuBarButton
												>
											</li>
										{/each}
									</ul>
								</li>

								<li class="menu-bar-menu-item submenu">
									<button type="button" class="menu-bar-item-button submenu-trigger">
										<span>Select Connected </span>
										<span class="submenu-arrow">&gt;</span>
									</button>
									<ul class="menu-bar-menu submenu-menu">
										{#each [{ label: 'Any Connected', rel: 'any' }, { label: 'All Connected', rel: 'all' }, { label: 'Connected Target Node', rel: 'target' }, { label: 'Connected Source Node', rel: 'source' }, { label: 'Connected Nodes', rel: 'nodes' }, { label: 'Connected Outgoing Edges', rel: 'outgoing' }, { label: 'Connected Incoming Edges', rel: 'incoming' }, { label: 'Connected Edges', rel: 'edges' }] as { label, rel }}
											<li class="menu-bar-menu-item">
												<MenuBarButton
													disabled={selectedLayers.value.length === 0}
													onclick={(evt) => {
														evt.preventDefault();
														selectRelativeLayers(
															dispatch,
															cast,
															'fetch_relative_graph',
															rel,
															layersInOrder.value
														);
													}}>{label}</MenuBarButton
												>
											</li>
										{/each}
									</ul>
								</li>

								<li class="menu-bar-menu-item submenu">
									<button type="button" class="menu-bar-item-button submenu-trigger">
										<span>Select Linked</span>
										<span class="submenu-arrow">&gt;</span>
									</button>
									<ul class="menu-bar-menu submenu-menu">
										<li class="menu-bar-menu-item">
											<MenuBarButton
												disabled={selectedHyperlinkedIds.value.length === 0}
												onclick={(evt) => {
													evt.preventDefault();
													publishSelection(cast, selectedHyperlinkedIds.value);
												}}>Select Link (Outgoing)</MenuBarButton
											>
										</li>
										{#each [{ label: 'Incoming Links (Deep)', rel: 'deep' }, { label: 'Incoming Links', rel: 'direct' }] as { label, rel }}
											<li class="menu-bar-menu-item">
												<MenuBarButton
													disabled={selectedLayers.value.length === 0}
													onclick={(evt) => {
														evt.preventDefault();
														selectRelativeLayers(
															dispatch,
															cast,
															'fetch_linked',
															rel,
															layersInOrder.value
														);
													}}>{label}</MenuBarButton
												>
											</li>
										{/each}
									</ul>
								</li>
								<li class="menu-bar-menu-item">
									<MenuBarButton
										disabled={selectedLayers.value.length === 0}
										onclick={(evt) => {
											evt.preventDefault();
											selectRelativeLayers(
												dispatch,
												cast,
												'fetch_reachable',
												'all',
												layersInOrder.value
											);
										}}>All reachable</MenuBarButton
									>
								</li>
								<li class="menu-bar-menu-item">
									<MenuBarButton
										disabled={selectedLayers.value.length === 0}
										onclick={(evt) => {
											evt.preventDefault();
											selectRelativeLayers(
												dispatch,
												cast,
												'fetch_reachable',
												'uplink',
												layersInOrder.value
											);
										}}>All reachable (uplink)</MenuBarButton
									>
								</li>
								<li class="menu-bar-menu-item">
									<MenuBarButton
										disabled={selectedLayers.value.length === 0}
										onclick={(evt) => {
											evt.preventDefault();
											selectRelativeLayers(
												dispatch,
												cast,
												'fetch_reachable',
												'downlink',
												layersInOrder.value
											);
										}}>All reachable (downlink)</MenuBarButton
									>
								</li>
							</ul>
						</li>
						<li class="menu-bar-item" tabindex="-1">
							View

							<ul class="menu-bar-menu">
								<li class="menu-bar-menu-item">
									<MenuBarButton
										onclick={() => {
											call((c) => {
												c && c.resetCamera();
											}, cameraScroller);
										}}>Fit into Camera</MenuBarButton
									>
								</li>
								<li class="menu-bar-menu-item"><hr class="menu-bar-menu-ruler" /></li>
								<li class="menu-bar-menu-item">
									<MenuBarButton
										shortcut={{ ctrlKey: true, key: '0' }}
										onclick={() => {
											cameraZoom.value = 0;
										}}>Reset Zoom</MenuBarButton
									>
								</li>
								<li class="menu-bar-menu-item">
									<MenuBarButton
										shortcut={{ ctrlKey: true, key: '+' }}
										onclick={() => {
											update(R.add(0.2), cameraZoom);
										}}>Zoom in</MenuBarButton
									>
								</li>
								<li class="menu-bar-menu-item">
									<MenuBarButton
										shortcut={{ ctrlKey: true, key: '-' }}
										onclick={() => {
											update(R.add(-0.2), cameraZoom);
										}}>Zoom out</MenuBarButton
									>
								</li>
								<li class="menu-bar-menu-item">
									<input
										type="range"
										bind:value={cameraZoom.value}
										min="-3"
										step=".01"
										max="3"
										style="width: 100%; box-sizing: border-box;"
									/>
								</li>
								<li class="menu-bar-menu-item"><hr class="menu-bar-menu-ruler" /></li>
								<li class="menu-bar-menu-item">
									<MenuBarButton
										onclick={() => {
											cameraRotation.value = 0;
										}}>Reset Rotation</MenuBarButton
									>
								</li>
								<li class="menu-bar-menu-item">
									<MenuBarButton
										onclick={() => {
											update(R.add(90), cameraRotation);
										}}>Rotate Clockwise</MenuBarButton
									>
								</li>
								<li class="menu-bar-menu-item">
									<MenuBarButton
										onclick={() => {
											update(R.add(-90), cameraRotation);
										}}>Rotate Counter-Clockwise</MenuBarButton
									>
								</li>

								<li class="menu-bar-menu-item">
									<label>
										<input type="checkbox" bind:checked={lockRotation.value} />
										Lock rotation</label
									>
								</li>
								<li class="menu-bar-menu-item">
									<input
										disabled={lockRotation.value}
										type="range"
										bind:value={cameraRotation.value}
										min="-180"
										step="5"
										max="180"
										style="width: 100%; box-sizing: border-box;"
									/>
								</li>
								<li class="menu-bar-menu-item"><hr class="menu-bar-menu-ruler" /></li>
								<li class="menu-bar-menu-item">
									<label>
										<input type="checkbox" bind:checked={showGrid.value} />
										Show Grid</label
									>
								</li>
								<li class="menu-bar-menu-item">
									<input
										disabled={!showGrid.value}
										type="range"
										bind:value={gridDistanceExp.value}
										min="2"
										step="1"
										max="10"
										style="width: 100%; box-sizing: border-box;"
									/>
								</li>
								<li class="menu-bar-menu-item"><hr class="menu-bar-menu-ruler" /></li>
								<li class="menu-bar-menu-item">
									<label>
										<input type="checkbox" bind:checked={showMinimap.value} />
										Show Minimap</label
									>
								</li>
								<li class="menu-bar-menu-item submenu">
									<button type="button" class="menu-bar-item-button submenu-trigger">
										<span>Toolbars</span>
										<span class="submenu-arrow">&gt;</span>
									</button>
									<ul class="menu-bar-menu submenu-menu">
										<li class="menu-bar-menu-item">
											<label>
												<input type="checkbox" bind:checked={showCreateToolbar.value} />
												Tool Palette</label
											>
										</li>
										<li class="menu-bar-menu-item"><hr class="menu-bar-menu-ruler" /></li>
										<li class="menu-bar-menu-item">
											<MenuBarButton
												onclick={(evt) => {
													evt.preventDefault();
													saveToolbarLayout();
												}}>Save Layout...</MenuBarButton
											>
										</li>
										<li class="menu-bar-menu-item submenu">
											<button type="button" class="menu-bar-item-button submenu-trigger">
												<span>Saved Layouts</span>
												<span class="submenu-arrow">&gt;</span>
											</button>
											<ul class="menu-bar-menu submenu-menu">
												{#each toolbarLayoutNames() as layoutName}
													<li class="menu-bar-menu-item submenu">
														<button type="button" class="menu-bar-item-button submenu-trigger">
															<span>{layoutName}</span>
															<span class="submenu-arrow">&gt;</span>
														</button>
														<ul class="menu-bar-menu submenu-menu">
															<li class="menu-bar-menu-item">
																<MenuBarButton
																	onclick={(evt) => {
																		evt.preventDefault();
																		loadToolbarLayout(layoutName);
																	}}>Load</MenuBarButton
																>
															</li>
															<li class="menu-bar-menu-item">
																<MenuBarButton
																	onclick={(evt) => {
																		evt.preventDefault();
																		deleteToolbarLayout(layoutName);
																	}}>Delete</MenuBarButton
																>
															</li>
														</ul>
													</li>
												{:else}
													<li class="menu-bar-menu-item disabled-menu-item">No saved layouts</li>
												{/each}
											</ul>
										</li>
										<li class="menu-bar-menu-item">
											<MenuBarButton
												onclick={(evt) => {
													evt.preventDefault();
													resetToolbarLayout();
												}}>Reset Layout</MenuBarButton
											>
										</li>
										<li class="menu-bar-menu-item"><hr class="menu-bar-menu-ruler" /></li>
										<li class="menu-bar-menu-item submenu">
											<button type="button" class="menu-bar-item-button submenu-trigger">
												<span>Hidden Tools</span>
												<span class="submenu-arrow">&gt;</span>
											</button>
											<ul class="menu-bar-menu submenu-menu">
												{#await data.primitives then groups}
													{@const hiddenEntries = hiddenCreateToolEntries(groups)}
													{#if hiddenEntries.length}
														{#each hiddenEntries as entry (entry.id)}
															<li class="menu-bar-menu-item">
																<MenuBarButton
																	onclick={(evt) => {
																		evt.preventDefault();
																		showCreateToolEntryId(entry.id, entry.groupName);
																	}}>{entry.groupName}: {entry.name}</MenuBarButton
																>
															</li>
														{/each}
													{:else}
														<li class="menu-bar-menu-item disabled-menu-item">No hidden tools</li>
													{/if}
												{/await}
											</ul>
										</li>
										<li class="menu-bar-menu-item">
											<MenuBarButton
												onclick={(evt) => {
													evt.preventDefault();
													showAllCreateTools();
												}}>Show All Tools</MenuBarButton
											>
										</li>
									</ul>
								</li>
								<li class="menu-bar-menu-item">
									<label>
										<input type="checkbox" bind:checked={showHierarchy.value} />
										Show Hierarchy</label
									>
								</li>
								<li class="menu-bar-menu-item">
									<label>
										<input type="checkbox" bind:checked={showCursors.value} />
										Show Remote Cursors</label
									>
								</li>
								<li class="menu-bar-menu-item">
									<label>
										<input type="checkbox" bind:checked={showOtherSelections.value} />
										Show Remote Selections</label
									>
								</li>
								<li class="menu-bar-menu-item">
									<label>
										<input type="checkbox" bind:checked={showDebug.value} />
										Show Debug</label
									>
								</li>
							</ul>
						</li>
						<li class="menu-bar-item" tabindex="-1">
							Simulation
							<ul class={{ 'menu-bar-menu': true, open: startingSimulation }}>
								{#await data.formalisms then formalisms}
									<li class="menu-bar-menu-item">
										<label class="pretty-select" style="width: 100%; max-width: none">
											<span class="pretty-select-label">Formalism</span>
											<span class="pretty-select-value">{selectedFormalismLabel(formalisms)}</span>
											<select
												class="pretty-select-control"
												onchange={(evt) =>
													handleFormalismChange(
														evt.currentTarget.value,
														cast,
														dispatch,
														data.syntaxes,
														doc.value,
														formalisms
													)}
											>
												{#each formalisms as { id, label } (id)}
													<option value={id} selected={id === selectedFormalismId(formalisms)}>
														{label}
													</option>
												{/each}
											</select>
										</label>
									</li>
									<li class="menu-bar-menu-item">
										<MenuBarButton
											shortcut={{ ctrlKey: true, key: 'i' }}
											disabled={startingSimulation}
											class="menu-bar-item-button new-sim-action"
											onclick={simulateThisDocument}
										>
											{#if startingSimulation}
												Compiling…
											{:else}
												New Simulation
											{/if}
										</MenuBarButton>
									</li>
									<li class="menu-bar-menu-item"><hr class="menu-bar-menu-ruler" /></li>
								{:catch e}
									<li class="menu-bar-menu-item">
										<span class="pretty-select" style="width: 100%; max-width: none">
											<span class="pretty-select-label">Formalism</span>
											<span class="pretty-select-value">Error loading formalisms</span>
										</span>
									</li>

									<li class="menu-bar-menu-item">
										<button disabled={true} class="menu-bar-item-button"> New Simulation </button>
									</li>
									<li class="menu-bar-menu-item"><hr class="menu-bar-menu-ruler" /></li>
								{/await}
								<li class="menu-bar-menu-item">
									<a
										class="menu-bar-item-button"
										href={resolve(`/projects/${data.document.links.project.id}/simulations`)}
										target="_blank">Show all Simulations</a
									>
								</li>
								{#await data.linked_simulations then links}
									<li class="menu-bar-menu-item"><hr class="menu-bar-menu-ruler" /></li>

									<LiveResource socket={data.live_socket} resource={links}>
										{#snippet children(ls)}
											<li class="menu-bar-menu-item">Latest simulations</li>
											{#each ls.value.items.slice(0, 5) as l}
												<li class="menu-bar-menu-item">
													<a
														class="menu-bar-item-button"
														href={resolve(`/simulations/${l.id}/observer`)}
														target="_blank">{l.id}</a
													>
												</li>
											{:else}
												<li class="menu-bar-menu-item">None</li>
											{/each}
										{/snippet}
									</LiveResource>
								{/await}
							</ul>
						</li>
						<!-- <li class="menu-bar-item" tabindex="-1">
							Share
							<ul class="menu-bar-menu">
								<li class="menu-bar-menu-item">
									<button class="menu-bar-item-button">Share Link</button>
								</li>
							</ul>
						</li> -->
						<li class="menu-bar-item" tabindex="-1">
							Plugins
							<ul class="menu-bar-menu">
								<li class="menu-bar-menu-item">
									<a
										class="menu-bar-item-button"
										href={documentMenuHref('primitives', '/primitives')}
										target="_blank"
									>
										Primitives
									</a>
								</li>
								<li class="menu-bar-menu-item">
									<a
										class="menu-bar-item-button"
										href={documentMenuHref('icons', '/icons')}
										target="_blank"
									>
										Icons
									</a>
								</li>
								<li class="menu-bar-menu-item">
									<a
										class="menu-bar-item-button"
										href={documentMenuHref('socket_schemas', '/socket_schemas')}
										target="_blank"
									>
										Socket Schemas
									</a>
								</li>
								<li class="menu-bar-menu-item">
									<a
										class="menu-bar-item-button"
										href={documentMenuHref('syntax', '/syntax')}
										target="_blank"
									>
										Syntax Rules
									</a>
								</li>
							</ul>
						</li>
						<li class="menu-bar-item" tabindex="-1">
							Tools
							<ul class="menu-bar-menu">
								<li class="menu-bar-menu-item">
									<MenuBarButton
										onclick={(evt) => {
											evt.preventDefault();
											openNavigatorPane();
										}}>Navigator</MenuBarButton
									>
								</li>
								<li class="menu-bar-menu-item">
									<a
										class="menu-bar-item-button"
										href={backendUrl(`/documents/${doc.value.id}/inspect`)}
										target="_blank">Inspect Document</a
									>
								</li>
								<li class="menu-bar-menu-item">
									<MenuBarButton
										onclick={(evt) => {
											evt.preventDefault();
											checkInscriptions(doc.value);
										}}>Check Syntax</MenuBarButton
									>
								</li>
								<li class="menu-bar-menu-item">
									<MenuBarButton
										onclick={(evt) => {
											evt.preventDefault();
											if (!commandConsoleText.value) {
												commandConsoleText.value = 'help';
											}
											showCommandConsole.value = true;
										}}>Command Console...</MenuBarButton
									>
								</li>
							</ul>
						</li>
						<li class="menu-bar-item" tabindex="-1">
							System
							<ul class="menu-bar-menu">
								<li class="menu-bar-menu-item submenu">
									<button type="button" class="menu-bar-item-button submenu-trigger">
										<span>Look and Feel</span>
										<span class="submenu-arrow">&gt;</span>
									</button>
									<ul class="menu-bar-menu">
										{#each LOOK_AND_FEEL_OPTIONS as option}
											<li class="menu-bar-menu-item">
												<MenuBarButton
													onclick={(evt) => {
														evt.preventDefault();
														lookAndFeel.value = setLookAndFeel(option.id);
													}}
												>
													{lookAndFeel.value === option.id ? '* ' : ''}{option.label}
												</MenuBarButton>
											</li>
										{/each}
									</ul>
								</li>
								<li class="menu-bar-menu-item"><hr class="menu-bar-menu-ruler" /></li>
								<li class="menu-bar-menu-item">
									<a
										class="menu-bar-item-button"
										href={documentMenuHref('health', '/health')}
										target="_blank"
									>
										Health
									</a>
								</li>
								<li class="menu-bar-menu-item">
									<a
										class="menu-bar-item-button"
										href={documentMenuHref('system', '/system')}
										target="_blank"
									>
										System
									</a>
								</li>
								<li class="menu-bar-menu-item">
									<button
										class="menu-bar-item-button"
										type="button"
										onclick={() => data.authState.reconnectSocket()}>Reconnect</button
									>
								</li>
							</ul>
						</li>
						<li class="menu-bar-item" tabindex="-1">
							Windows
							<ul class="menu-bar-menu">
								<li class="menu-bar-menu-item">Open Drawings</li>
								{#each documentTabs(doc.value) as tab (tab.id)}
									<li class="menu-bar-menu-item document-window-menu-entry">
										<a
											class={{ 'menu-bar-item-button': true, active: tab.id === data.document.id }}
											href={tab.href}
											data-sveltekit-preload-data="off"
											data-sveltekit-preload-code="eager"
											title={tab.name}
										>
											<span>{tab.id === data.document.id ? '* ' : ''}{tab.name}</span>
										</a>
										<button
											type="button"
											class="menu-bar-item-icon-button"
											title="Close drawing"
											aria-label="Close drawing"
											onclick={(evt) => {
												evt.preventDefault();
												evt.stopPropagation();
												closeDocumentWindow(tab);
											}}>x</button
										>
									</li>
								{/each}
								<li class="menu-bar-menu-item"><hr class="menu-bar-menu-ruler" /></li>
								<li class="menu-bar-menu-item">
									<label>
										<input type="checkbox" bind:checked={showCreateToolbar.value} />
										Tool Palette</label
									>
								</li>
								<li class="menu-bar-menu-item">
									<label>
										<input type="checkbox" bind:checked={showHierarchy.value} />
										Hierarchy</label
									>
								</li>
								<li class="menu-bar-menu-item"><hr class="menu-bar-menu-ruler" /></li>
								<li class="menu-bar-menu-item">
									<MenuBarButton
										onclick={(evt) => {
											evt.preventDefault();
											showCreateToolbar.value = true;
											showHierarchy.value = true;
										}}>Show All Panels</MenuBarButton
									>
								</li>
							</ul>
						</li>
						<li class="menu-bar-item" tabindex="-1">
							Help
							<ul class="menu-bar-menu">
								<li class="menu-bar-menu-item">
									<a
										class="menu-bar-item-button"
										href="https://tgipm.informatik.uni-hamburg.de/confluence/x/BwAdJQ">Confluence</a
									>
								</li>
								<li class="menu-bar-menu-item">
									<a class="menu-bar-item-button" target="_blank" href="http://www.renew.de"
										>renew.de</a
									>
								</li>
								<li class="menu-bar-menu-item">
									<a
										class="menu-bar-item-button"
										target="_blank"
										href="https://www.petristation.net/">petristation.net</a
									>
								</li>
								<li class="menu-bar-menu-item">
									<a
										class="menu-bar-item-button"
										target="_blank"
										href="https://www.youtube.com/@petristation">youtube/@petristation</a
									>
								</li>
								<li class="menu-bar-menu-item"><hr class="menu-bar-menu-ruler" /></li>
								<li class="menu-bar-menu-item">
									<MenuBarButton
										onclick={(evt) => {
											evt.preventDefault();
											showAbout.value = true;
										}}>About...</MenuBarButton
									>
								</li>
							</ul>
						</li>
					</ol>
				</menu>

				<nav class="document-tabs" aria-label="Open documents">
					{#each documentTabs(doc.value) as tab (tab.id)}
						<a
							class={{ 'document-tab': true, active: tab.id === data.document.id }}
							href={tab.href}
							data-sveltekit-preload-data="off"
							data-sveltekit-preload-code="eager"
							title={tab.name}
						>
							<span class="document-tab-label">{tab.name}</span>
							{#if tab.id !== data.document.id}
								<button
									type="button"
									class="document-tab-close"
									aria-label="Remove from tabs"
									onclick={(evt) => {
										evt.preventDefault();
										evt.stopPropagation();
										removeRecentDocument(tab.id);
									}}>x</button
								>
							{/if}
						</a>
					{/each}
				</nav>

				<ul class="presence-list">
					<!--<li class="presence-list-total">{presence.length}</li>-->
					{#each presence.value as p (p.data.username)}
						<li>
							<svg viewBox="-4 -4 40 40" width="32">
								<title>{p.data.username} ({p.count})</title>
								<circle fill={p.data.color} cx="16" cy="16" r="16" stroke="#fff" stroke-width="2" />
								<text x="16" y="22" text-anchor="middle" font-size="20" fill="#fff"
									>{p.data.username.substr(0, 1)}</text
								>
							</svg>
						</li>
					{/each}
				</ul>
			</header>

			<div class="overlay">
				<div class="body">
					<CanvasDropper
						{camera}
						domElement={dropperDomElement}
						onDrop={(mime, content, pos) => {
							handleDroppedContent(mime, content, pos, dispatch, cast);
						}}
						onDropFile={(file, pos) => {
							handleDroppedFile(file, pos, dispatch, cast);
						}}
					>
						<CameraScroller bind:this={cameraScroller.value} {camera} {extension}>
							<SVGViewport
								{camera}
								onclick={(evt) => {
									evt.preventDefault();
									if (backoffValue.value === undefined) {
										if (!evt.shiftKey) {
											clearSelection(cast);
										}
									} else {
										backoffValue.value = undefined;
									}
								}}
								ontouchend={(evt) => {
									evt.preventDefault();
								}}
								onkeydown={(evt) => {
									if (evt.key == 'Escape') {
										clearSelection(cast);
									}
								}}
							>
								<Navigator
									onworldcursor={(pos) => {
										if (showCursors.value) {
											moveCursor(pos);
										}
									}}
									onpointerleave={(evt) => {
										if (showCursors.value) {
											stopCursor();
										}
									}}
									{camera}
									{lockRotation}
									{frameBoxPath}
								>
									{#snippet children(liveLenses, navigationActions)}
										<!-- svelte-ignore a11y_no_static_element_interactions -->
										<rect
											transform={rotationTransform.value}
											fill="#fff"
											stroke="#eee"
											stroke-width="5"
											{...documentDisplayRect.value}
										/>
										<!-- svelte-ignore a11y_no_static_element_interactions -->
										<path
											class="inline-text-editor-canvas-dismiss"
											d={frameBoxPath.value}
											fill="#ffffff00"
											stroke="none"
											cursor={canvasInteractionCursor()}
											pointer-events="all"
											onpointerdown={(evt) => {
												if (dismissInlineTextEditFromCanvasPointer(evt, cast)) {
													return;
												}
												if (
													primitiveNeedsLinkedTarget(activeCreateTool.value) ||
													primitiveCreatesText(activeCreateTool.value)
												) {
													beginPrimitiveCreation(evt, liveLenses);
												} else {
													beginAreaSelection(evt, liveLenses);
												}
											}}
											onpointermove={(evt) => {
												if (!updatePrimitiveCreation(evt, liveLenses)) {
													updateAreaSelection(evt, liveLenses);
												}
											}}
											onpointerup={(evt) => {
												if (
													!finishPrimitiveCreation(
														evt,
														liveLenses,
														dispatch,
														cast,
														L.get('id', singleSelectedLayer.value)
													)
												) {
													finishAreaSelection(
														evt,
														liveLenses,
														cast,
														layersInOrder.value,
														doc.value
													);
												}
											}}
											onpointercancel={(evt) => {
												cancelPrimitiveCreation(evt);
												cancelAreaSelection(evt);
											}}
											onlostpointercapture={(evt) => {
												cancelPrimitiveCreation(evt);
												cancelAreaSelection(evt);
											}}
											oncontextmenu={resetToolFromCanvas}
										/>
										{#if showGrid.value}
											<Grid {rotationTransform} {frameBoxObject} {cameraScale} {gridDistance} />
										{/if}

										<g transform={rotationTransform.value}>
											<g id="full-document-{data.document.id}">
												{#each layersInOrder.value as { index, id, depth, hidden } (id)}
													{@const el = view(['layers', 'items', L.find((el) => el.id == id)], doc)}
													{#if layerVisibleInDrawing(el.value, hidden)}
														{#if el.value?.box}
															<g
																role="button"
																data-editor-layer-id={el.value?.id}
																transform={layerMoveTransform(id, layersInOrder.value)}
																cursor={canvasInteractionCursor()}
																oncontextmenu={(evt) => {
																	if (
																		beginDirectInscriptionEdit(
																			evt,
																			el.value,
																			liveLenses,
																			dispatch,
																			cast,
																			doc.value,
																			{
																				x: el.value?.box?.position_x,
																				y: el.value?.box?.position_y,
																				width: el.value?.box?.width,
																				height: el.value?.box?.height
																			}
																		)
																	) {
																		return;
																	}
																	openTargetLocationOrDirectModification(evt, el.value, cast);
																}}
																ondblclick={(evt) => inspectLayer(evt, el.value)}
																onpointerdown={(evt) => {
																	if (
																		beginLinkedPrimitiveCreation(
																			evt,
																			liveLenses,
																			doc.value,
																			el.value
																		)
																	) {
																		return;
																	}
																	if (
																		activeTool.value === 'select' &&
																		!evt.shiftKey &&
																		beginLayerMove(
																			evt,
																			liveLenses,
																			el.value.id,
																			layersInOrder.value,
																			doc.value,
																			el.value.id
																		)
																	) {
																		return;
																	}
																	rememberPointerPasteLocation(evt, liveLenses);
																}}
																onpointermove={(evt) => {
																	updateLayerMove(evt, liveLenses, doc, layersInOrder.value);
																	updateLinkedPrimitiveCreation(evt, liveLenses);
																}}
																onpointerup={(evt) => {
																	if (groupDrag.value?.pointerId === evt.pointerId) {
																		finishLayerMove(evt, dispatch, doc, layersInOrder.value);
																		return;
																	}
																	finishLinkedPrimitiveCreation(evt, dispatch, cast);
																}}
																onpointercancel={(evt) => {
																	cancelLayerMove(evt);
																	cancelLinkedPrimitiveCreation(evt);
																}}
																onlostpointercapture={(evt) => {
																	cancelLayerMove(evt);
																	cancelLinkedPrimitiveCreation(evt);
																}}
																onclick={(evt) => {
																	if (consumeSuppressedEdgeWaypointClick(evt, el.value?.id)) {
																		return;
																	}
																	if (
																		createLinkedPrimitiveOnLayer(
																			evt,
																			liveLenses,
																			dispatch,
																			cast,
																			doc.value,
																			el.value
																		)
																	) {
																		return;
																	}
																	if (
																		createUnlinkedTextPrimitiveAtEvent(
																			evt,
																			liveLenses,
																			dispatch,
																			el.value?.id
																		)
																	) {
																		return;
																	}
																	if (openTargetLocation(evt, el.value)) {
																		return;
																	}
																	evt.stopPropagation();
																	if (groupDrag.value === undefined) {
																		if (el.value?.id) {
																			evt.preventDefault();
																			selectLayer(cast, el.value.id, evt);
																		}
																	}
																}}
																tabindex="-1"
																onkeydown={(evt) => {
																	if (evt.key === ' ' || evt.key === 'Enter') {
																		evt.preventDefault();
																		if (el.value?.id) {
																			selectLayer(cast, el.value.id, evt);
																		}
																	}
																}}
																fill={el.value?.style?.background_color ?? '#70DB93'}
																fill-opacity={el.value?.style?.background_opacity ?? '1'}
																stroke={el.value?.style?.border_color ?? 'black'}
																stroke-opacity={el.value?.style?.border_opacity ?? '1'}
																stroke-dasharray={el.value?.style?.border_dash_array ?? 'none'}
																stroke-width={el.value?.style?.border_width ?? '1'}
																opacity={el.value?.style?.opacity ?? '1'}
															>
																<Symbol
																	symbols={data.symbols}
																	symbolId={el.value?.box.shape}
																	shapeAttributes={symbolShapeAttributes(el.value?.box)}
																	background_url={el.value?.style?.background_url}
																	box={{
																		x: el.value?.box.position_x,
																		y: el.value?.box.position_y,
																		width: el.value?.box.width,
																		height: el.value?.box.height
																	}}
																/>
															</g>
														{/if}
														{#if el.value?.text}
															{@const thisbbox = view(L.prop(el.value?.id), textBounds)}
															{#key el.value?.id}
																<g
																	role="button"
																	class="editor-text-layer"
																	data-editor-layer-id={el.value?.id}
																	transform={layerMoveTransform(id, layersInOrder.value)}
																	cursor={canvasInteractionCursor()}
																	oncontextmenu={(evt) => {
																		if (beginContextTextEdit(evt, el.value, thisbbox.value, cast)) {
																			return;
																		}
																		openTargetLocationOrDirectModification(evt, el.value, cast);
																	}}
																	ondblclick={(evt) => inspectLayer(evt, el.value)}
																	onpointerdown={(evt) => {
																		if (
																			activeTool.value === 'select' &&
																			!evt.shiftKey &&
																			beginLayerMove(
																				evt,
																				liveLenses,
																				el.value.id,
																				layersInOrder.value,
																				doc.value,
																				el.value.id
																			)
																		) {
																			return;
																		}
																		rememberPointerPasteLocation(evt, liveLenses);
																	}}
																	onpointermove={(evt) =>
																		updateLayerMove(evt, liveLenses, doc, layersInOrder.value)}
																	onpointerup={(evt) =>
																		finishLayerMove(evt, dispatch, doc, layersInOrder.value)}
																	onpointercancel={cancelLayerMove}
																	onlostpointercapture={cancelLayerMove}
																	onclick={(evt) => {
																		if (beginInlineTextEdit(evt, el.value, thisbbox.value, cast)) {
																			return;
																		}
																		if (
																			createUnlinkedTextPrimitiveAtEvent(
																				evt,
																				liveLenses,
																				dispatch,
																				el.value?.id
																			)
																		) {
																			return;
																		}
																		if (openTargetLocation(evt, el.value)) {
																			return;
																		}
																		evt.stopPropagation();
																		if (groupDrag.value === undefined) {
																			if (el.value?.id) {
																				evt.preventDefault();
																				selectLayer(cast, el.value.id, evt);
																			}
																		}
																	}}
																	tabindex="-1"
																	onkeydown={(evt) => {
																		if (evt.key === ' ' || evt.key === 'Enter') {
																			evt.preventDefault();
																			if (el.value?.id) {
																				selectLayer(cast, el.value.id, evt);
																			}
																		}
																	}}
																>
																	<TextElement
																		optimisticValue={optimisticValue.value}
																		bbox={thisbbox}
																		el={el.value}
																		showVisibleText={inlineTextEdit.value?.id !== el.value?.id}
																	/>
																</g>
															{/key}
														{/if}
														{#if el.value?.edge}
															{@const previewEdge = renderedEdgePreview(
																el.value,
																doc.value,
																layersInOrder.value,
																groupDrag.value,
																groupDragDelta.value
															)}
															{@const basePreviewWaypoints =
																committedEdgeWaypointPreviews.value.get(el.value?.id) ??
																L.get(localProp('waypoints'), previewEdge) ??
																previewEdge?.waypoints ??
																[]}
															{@const previewWaypoints = pendingWaypointPreview(
																basePreviewWaypoints,
																edgeWaypointDrag.value,
																el.value?.id
															)}
															<g
																role="button"
																data-editor-layer-id={el.value?.id}
																transform={edgePreviewTransform(
																	id,
																	layersInOrder.value,
																	el.value.edge,
																	previewEdge
																)}
																cursor={canvasInteractionCursor()}
																oncontextmenu={(evt) => {
																	if (
																		beginDirectInscriptionEdit(
																			evt,
																			el.value,
																			liveLenses,
																			dispatch,
																			cast,
																			doc.value
																		)
																	) {
																		return;
																	}
																	openTargetLocationOrDirectModification(evt, el.value, cast);
																}}
																ondblclick={(evt) => inspectLayer(evt, el.value)}
																onpointerdown={(evt) => {
																	if (
																		beginUnselectedEdgeWaypointDrag(
																			evt,
																			el.value,
																			previewEdge,
																			liveLenses
																		)
																	) {
																		return;
																	}
																	if (
																		beginLinkedPrimitiveCreation(
																			evt,
																			liveLenses,
																			doc.value,
																			el.value
																		)
																	) {
																		return;
																	}
																	if (
																		activeTool.value === 'select' &&
																		!evt.shiftKey &&
																		beginLayerMove(
																			evt,
																			liveLenses,
																			el.value.id,
																			layersInOrder.value,
																			doc.value,
																			el.value.id
																		)
																	) {
																		return;
																	}
																	rememberPointerPasteLocation(evt, liveLenses);
																}}
																onpointermove={(evt) => {
																	if (updateUnselectedEdgeWaypointDrag(evt, liveLenses)) {
																		return;
																	}
																	updateLayerMove(evt, liveLenses, doc, layersInOrder.value);
																	updateLinkedPrimitiveCreation(evt, liveLenses);
																}}
																onpointerup={(evt) => {
																	if (finishUnselectedEdgeWaypointDrag(evt, cast, doc)) {
																		return;
																	}
																	if (groupDrag.value?.pointerId === evt.pointerId) {
																		finishLayerMove(evt, dispatch, doc, layersInOrder.value);
																		return;
																	}
																	finishLinkedPrimitiveCreation(evt, dispatch, cast);
																}}
																onpointercancel={(evt) => {
																	cancelUnselectedEdgeWaypointDrag(evt);
																	cancelLayerMove(evt);
																	cancelLinkedPrimitiveCreation(evt);
																}}
																onlostpointercapture={(evt) => {
																	cancelUnselectedEdgeWaypointDrag(evt);
																	cancelLayerMove(evt);
																	cancelLinkedPrimitiveCreation(evt);
																}}
																onclick={(evt) => {
																	if (consumeSuppressedEdgeWaypointClick(evt, el.value?.id)) {
																		return;
																	}
																	if (
																		createLinkedPrimitiveOnLayer(
																			evt,
																			liveLenses,
																			dispatch,
																			cast,
																			doc.value,
																			el.value
																		)
																	) {
																		return;
																	}
																	if (
																		createUnlinkedTextPrimitiveAtEvent(
																			evt,
																			liveLenses,
																			dispatch,
																			el.value?.id
																		)
																	) {
																		return;
																	}
																	if (openTargetLocation(evt, el.value)) {
																		return;
																	}
																	evt.stopPropagation();
																	if (groupDrag.value === undefined) {
																		if (el.value?.id) {
																			evt.preventDefault();
																			selectLayer(cast, el.value.id, evt);
																		}
																	}
																}}
																tabindex="-1"
																onkeydown={(evt) => {
																	if (evt.key === ' ' || evt.key === 'Enter') {
																		evt.preventDefault();
																		if (el.value?.id) {
																			selectLayer(cast, el.value.id, evt);
																		}
																	}
																}}
																opacity={el.value?.style?.opacity ?? '1'}
																stroke={el.value?.edge?.style?.stroke_color ?? 'black'}
																stroke-width={el.value?.edge?.style?.stroke_width ?? '1'}
																stroke-opacity={el.value?.edge?.style?.stroke_opacity ?? '1'}
																fill-opacity={el.value?.edge?.style?.stroke_opacity ?? '1'}
																stroke-linejoin={el.value?.edge?.style?.stroke_join ?? 'miter'}
																stroke-linecap={el.value?.edge?.style?.stroke_cap ?? 'butt'}
															>
																<path
																	d={edgePath[previewEdge?.style?.smoothness ?? 'linear'](
																		previewEdge,
																		previewWaypoints
																	)}
																	pointer-events="stroke"
																	fill={previewEdge?.cyclic
																		? (el.value?.style?.background_color ?? 'none')
																		: 'none'}
																	stroke="transparent"
																	stroke-width={(previewEdge?.style?.stroke_width ?? 1) * 1 +
																		10 * cameraScale.value}
																/>
																<path
																	d={edgePath[previewEdge?.style?.smoothness ?? 'linear'](
																		previewEdge,
																		previewWaypoints
																	)}
																	stroke-dasharray={previewEdge?.style?.stroke_dash_array ?? 'none'}
																	fill={previewEdge?.cyclic
																		? (el.value?.style?.background_color ?? 'none')
																		: 'none'}
																	vector-effect="non-scaling-stroke"
																/>

																{#if previewEdge?.style?.source_tip_symbol_shape_id}
																	{@const source_angle = edgeAngle['source'](
																		previewEdge,
																		previewWaypoints
																	)}
																	{@const size =
																		(previewEdge?.style?.stroke_width ?? 1) *
																		(previewEdge?.style?.source_tip_size ?? 1)}

																	<g
																		fill={tipColor(
																			el.value?.style?.background_color,
																			previewEdge?.style?.stroke_color,
																			'black'
																		)}
																		stroke={tipColor(
																			el.value?.style?.background_color,
																			previewEdge?.style?.stroke_color,
																			'black'
																		)}
																		transform="rotate({source_angle} {previewEdge.source_x} {previewEdge.source_y})"
																	>
																		<Symbol
																			symbols={data.symbols}
																			symbolId={previewEdge?.style?.source_tip_symbol_shape_id}
																			box={{
																				x: previewEdge.source_x - size,
																				y: previewEdge.source_y - size,
																				width: 2 * size,
																				height: 2 * size
																			}}
																		/>
																	</g>
																{/if}

																{#if previewEdge?.style?.target_tip_symbol_shape_id}
																	{@const target_angle = edgeAngle['target'](
																		previewEdge,
																		previewWaypoints
																	)}
																	{@const size =
																		(previewEdge?.style?.stroke_width ?? 1) *
																		(previewEdge?.style?.target_tip_size ?? 1)}
																	<g
																		fill={tipColor(
																			el.value?.style?.background_color,
																			previewEdge?.style?.stroke_color,
																			'black'
																		)}
																		stroke={tipColor(
																			el.value?.style?.background_color,
																			previewEdge?.style?.stroke_color,
																			'black'
																		)}
																		transform="rotate({target_angle} {previewEdge.target_x} {previewEdge.target_y})"
																	>
																		<Symbol
																			symbols={data.symbols}
																			symbolId={previewEdge?.style?.target_tip_symbol_shape_id}
																			box={{
																				x: previewEdge.target_x - size,
																				y: previewEdge.target_y - size,
																				width: 2 * size,
																				height: 2 * size
																			}}
																		/>
																	</g>
																{/if}
															</g>
														{/if}
													{/if}
												{/each}
											</g>
										</g>
										{#if activeTool.value === 'select'}
											<g transform={rotationTransform.value}>
												{#each selectedLayers.value as id (id)}
													{@const deep_bounding = view(
														[L.find((el) => el.id == id && el.has_children), 'deep_bounding'],
														layersInOrder
													).value}

													{#if deep_bounding}
														<rect
															tabindex="-1"
															cursor="default"
															x={deep_bounding.minX -
																3 * cameraScale.value +
																groupDragDelta.value.x}
															y={deep_bounding.minY -
																3 * cameraScale.value +
																groupDragDelta.value.y}
															width={deep_bounding.maxX -
																deep_bounding.minX +
																6 * cameraScale.value}
															height={deep_bounding.maxY -
																deep_bounding.minY +
																6 * cameraScale.value}
															fill="transparent"
															pointer-events="all"
															role="button"
															onclick={(evt) => clickSelectedLayerHitbox(evt, cast, id)}
															onpointerdown={(evt) =>
																beginLayerMove(evt, liveLenses, id, layersInOrder.value, doc.value)}
															onpointermove={(evt) =>
																updateLayerMove(evt, liveLenses, doc, layersInOrder.value)}
															onpointerup={(evt) =>
																finishLayerMove(evt, dispatch, doc, layersInOrder.value)}
															onpointercancel={cancelLayerMove}
															onlostpointercapture={cancelLayerMove}
															onkeydown={(evt) => {
																if (evt.key === 'Escape' || evt.key === 'Esc') {
																	cancelLayerMove(evt);
																}
															}}
														/>
													{/if}
												{/each}
											</g>
										{/if}
										<g transform={rotationTransform.value} opacity="0.7">
											{#each selectedLayers.value as id (id)}
												{@const els = view(
													['layers', 'items', L.filter((el) => el.hyperlink == id)],
													doc
												)}
												{#each els.value as el}
													{#if el.box}
														<rect
															class="link-selected"
															transform={layerMoveTransform(el.id, layersInOrder.value)}
															x={el.box.position_x - cameraScale.value}
															y={el.box.position_y - cameraScale.value}
															width={el.box.width + 2 * cameraScale.value}
															height={el.box.height + 2 * cameraScale.value}
															cursor="default"
														></rect>
													{/if}
													{#if el.text}
														{@const bbox = view(L.prop(el.id), textBounds)}

														{#if bbox.value}
															<rect
																class="link-selected"
																transform={layerMoveTransform(el.id, layersInOrder.value)}
																x={bbox.value.x}
																y={bbox.value.y}
																width={bbox.value.width}
																height={bbox.value.height}
																stroke-width={cameraScale.value * 6}
															></rect>
														{/if}
													{/if}
													{#if el.edge}
														{@const linkedPreviewEdge = renderedEdgePreview(
															el,
															doc.value,
															layersInOrder.value,
															groupDrag.value,
															groupDragDelta.value
														)}
														{@const linkedPreviewWaypoints =
															L.get(localProp('waypoints'), linkedPreviewEdge) ??
															linkedPreviewEdge?.waypoints ??
															[]}
														<path
															class="link-selected"
															transform={edgePreviewTransform(
																el.id,
																layersInOrder.value,
																el.edge,
																linkedPreviewEdge
															)}
															d={edgePath[linkedPreviewEdge?.style?.smoothness ?? 'linear'](
																linkedPreviewEdge,
																linkedPreviewWaypoints
															)}
															stroke="black"
															fill="none"
															stroke-width={(linkedPreviewEdge?.style?.stroke_width ?? 1) * 1 +
																6 * cameraScale.value}
															stroke-linejoin={linkedPreviewEdge?.style?.stroke_join ?? 'miter'}
															stroke-linecap={linkedPreviewEdge?.style?.stroke_cap ?? 'butt'}
														/>

														{#if linkedPreviewEdge?.style?.source_tip_symbol_shape_id}
															{@const source_angle = edgeAngle['source'](
																linkedPreviewEdge,
																linkedPreviewWaypoints
															)}
															<g
																class="link-selected"
																transform="{edgePreviewTransform(
																	el.id,
																	layersInOrder.value,
																	el.edge,
																	linkedPreviewEdge
																) ??
																	''} rotate({source_angle} {linkedPreviewEdge.source_x} {linkedPreviewEdge.source_y})"
															>
																{#await data.symbols then symbols}
																	{@const symbol = symbols.get(
																		linkedPreviewEdge?.style?.source_tip_symbol_shape_id
																	)}
																	{@const size =
																		(linkedPreviewEdge?.style?.stroke_width ?? 1) *
																		(linkedPreviewEdge?.style?.source_tip_size ?? 1)}

																	{#if symbol}
																		{#each symbol.paths as path, i (i)}
																			<path
																				fill={path.fill_color ?? 'transparent'}
																				stroke={path.stroke_color ?? 'transparent'}
																				d={buildPath(
																					{
																						x: linkedPreviewEdge.source_x - size,
																						y: linkedPreviewEdge.source_y - size,
																						width: 2 * size,
																						height: 2 * size
																					},
																					path
																				)}
																				fill-rule="evenodd"
																			/>
																		{/each}
																	{/if}
																{/await}
															</g>
														{/if}

														{#if linkedPreviewEdge?.style?.target_tip_symbol_shape_id}
															{@const target_angle = edgeAngle['target'](
																linkedPreviewEdge,
																linkedPreviewWaypoints
															)}
															<g
																class="link-selected"
																transform="{edgePreviewTransform(
																	el.id,
																	layersInOrder.value,
																	el.edge,
																	linkedPreviewEdge
																) ??
																	''} rotate({target_angle} {linkedPreviewEdge.target_x} {linkedPreviewEdge.target_y})"
															>
																{#await data.symbols then symbols}
																	{@const symbol = symbols.get(
																		linkedPreviewEdge?.style?.target_tip_symbol_shape_id
																	)}
																	{@const size =
																		(linkedPreviewEdge?.style?.stroke_width ?? 1) *
																		(linkedPreviewEdge?.style?.target_tip_size ?? 1)}

																	{#if symbol}
																		{#each symbol.paths as path, i (i)}
																			<path
																				fill={path.fill_color ?? 'transparent'}
																				stroke={path.stroke_color ?? 'transparent'}
																				d={buildPath(
																					{
																						x: linkedPreviewEdge.target_x - size,
																						y: linkedPreviewEdge.target_y - size,
																						width: 2 * size,
																						height: 2 * size
																					},
																					path
																				)}
																				fill-rule="evenodd"
																			/>
																		{/each}
																	{/if}
																{/await}
															</g>
														{/if}
													{/if}
												{/each}
											{/each}
											{#each selectedLinkedLayerIds(doc.value, selectedLayers.value) as linkedTargetId (linkedTargetId)}
												{@const linkedEl = view(
													['layers', 'items', L.find((el) => el.id == linkedTargetId)],
													doc
												)}
												{#if linkedEl.value?.box}
													<rect
														class="link-selected"
														transform={layerMoveTransform(linkedTargetId, layersInOrder.value)}
														x={linkedEl.value.box.position_x - cameraScale.value}
														y={linkedEl.value.box.position_y - cameraScale.value}
														width={linkedEl.value.box.width + 2 * cameraScale.value}
														height={linkedEl.value.box.height + 2 * cameraScale.value}
														cursor="default"
													></rect>
												{/if}
												{#if linkedEl.value?.text}
													{@const linkedBbox = view(L.prop(linkedEl.value.id), textBounds)}

													{#if linkedBbox.value}
														<rect
															class="link-selected"
															transform={layerMoveTransform(linkedTargetId, layersInOrder.value)}
															x={linkedBbox.value.x}
															y={linkedBbox.value.y}
															width={linkedBbox.value.width}
															height={linkedBbox.value.height}
															stroke-width={cameraScale.value * 6}
														></rect>
													{/if}
												{/if}
												{#if linkedEl.value?.edge}
													{@const linkedTargetPreviewEdge = renderedEdgePreview(
														linkedEl.value,
														doc.value,
														layersInOrder.value,
														groupDrag.value,
														groupDragDelta.value
													)}
													{@const linkedTargetPreviewWaypoints =
														L.get(localProp('waypoints'), linkedTargetPreviewEdge) ??
														linkedTargetPreviewEdge?.waypoints ??
														[]}
													<path
														class="link-selected"
														transform={edgePreviewTransform(
															linkedTargetId,
															layersInOrder.value,
															linkedEl.value.edge,
															linkedTargetPreviewEdge
														)}
														d={edgePath[linkedTargetPreviewEdge?.style?.smoothness ?? 'linear'](
															linkedTargetPreviewEdge,
															linkedTargetPreviewWaypoints
														)}
														stroke="black"
														fill="none"
														stroke-width={(linkedTargetPreviewEdge?.style?.stroke_width ?? 1) * 1 +
															6 * cameraScale.value}
														stroke-linejoin={linkedTargetPreviewEdge?.style?.stroke_join ?? 'miter'}
														stroke-linecap={linkedTargetPreviewEdge?.style?.stroke_cap ?? 'butt'}
													/>
												{/if}
											{/each}
										</g>

										<g transform={rotationTransform.value} opacity="0.7">
											{#each selectedLayers.value as id (id)}
												{@const el = view(['layers', 'items', L.find((el) => el.id == id)], doc)}

												{#if el.value?.box}
													<rect
														class="selected"
														transform={layerMoveTransform(id, layersInOrder.value)}
														x={el.value?.box.position_x - cameraScale.value}
														y={el.value?.box.position_y - cameraScale.value}
														width={el.value?.box.width + 2 * cameraScale.value}
														height={el.value?.box.height + 2 * cameraScale.value}
														cursor="default"
													></rect>
												{/if}
												{#if el.value?.text}
													{@const bbox = view(L.prop(el.value?.id), textBounds)}

													{#if bbox.value}
														<rect
															class="selected"
															transform={layerMoveTransform(id, layersInOrder.value)}
															x={bbox.value.x}
															y={bbox.value.y}
															width={bbox.value.width}
															height={bbox.value.height}
															stroke-width={cameraScale.value * 6}
														></rect>
													{/if}
												{/if}
												{#if el.value?.edge}
													{@const selectedLayerPreviewEdge = renderedEdgePreview(
														el.value,
														doc.value,
														layersInOrder.value,
														groupDrag.value,
														groupDragDelta.value
													)}
													{@const selectedLayerPreviewWaypoints =
														L.get(localProp('waypoints'), selectedLayerPreviewEdge) ??
														selectedLayerPreviewEdge?.waypoints ??
														[]}
													<path
														class="selected"
														transform={edgePreviewTransform(
															id,
															layersInOrder.value,
															el.value.edge,
															selectedLayerPreviewEdge
														)}
														d={edgePath[selectedLayerPreviewEdge?.style?.smoothness ?? 'linear'](
															selectedLayerPreviewEdge,
															selectedLayerPreviewWaypoints
														)}
														stroke="black"
														fill="none"
														stroke-width={(selectedLayerPreviewEdge?.style?.stroke_width ?? 1) * 1 +
															6 * cameraScale.value}
														stroke-linejoin={selectedLayerPreviewEdge?.style?.stroke_join ??
															'miter'}
														stroke-linecap={selectedLayerPreviewEdge?.style?.stroke_cap ?? 'butt'}
													/>

													{#if selectedLayerPreviewEdge?.style?.source_tip_symbol_shape_id}
														{@const source_angle = edgeAngle['source'](
															selectedLayerPreviewEdge,
															selectedLayerPreviewWaypoints
														)}
														<g
															class="selected"
															transform="{edgePreviewTransform(
																id,
																layersInOrder.value,
																el.value.edge,
																selectedLayerPreviewEdge
															) ??
																''} rotate({source_angle} {selectedLayerPreviewEdge.source_x} {selectedLayerPreviewEdge.source_y})"
														>
															{#await data.symbols then symbols}
																{@const symbol = symbols.get(
																	selectedLayerPreviewEdge?.style?.source_tip_symbol_shape_id
																)}
																{@const size =
																	(selectedLayerPreviewEdge?.style?.stroke_width ?? 1) *
																	(selectedLayerPreviewEdge?.style?.source_tip_size ?? 1)}

																{#if symbol}
																	{#each symbol.paths as path, i (i)}
																		<path
																			fill={path.fill_color ?? 'transparent'}
																			stroke={path.stroke_color ?? 'transparent'}
																			d={buildPath(
																				{
																					x: selectedLayerPreviewEdge.source_x - size,
																					y: selectedLayerPreviewEdge.source_y - size,
																					width: 2 * size,
																					height: 2 * size
																				},
																				path
																			)}
																			fill-rule="evenodd"
																		/>
																	{/each}
																{/if}
															{/await}
														</g>
													{/if}

													{#if selectedLayerPreviewEdge?.style?.target_tip_symbol_shape_id}
														{@const target_angle = edgeAngle['target'](
															selectedLayerPreviewEdge,
															selectedLayerPreviewWaypoints
														)}
														<g
															class="selected"
															transform="{edgePreviewTransform(
																id,
																layersInOrder.value,
																el.value.edge,
																selectedLayerPreviewEdge
															) ??
																''} rotate({target_angle} {selectedLayerPreviewEdge.target_x} {selectedLayerPreviewEdge.target_y})"
														>
															{#await data.symbols then symbols}
																{@const symbol = symbols.get(
																	selectedLayerPreviewEdge?.style?.target_tip_symbol_shape_id
																)}
																{@const size =
																	(selectedLayerPreviewEdge?.style?.stroke_width ?? 1) *
																	(selectedLayerPreviewEdge?.style?.target_tip_size ?? 1)}

																{#if symbol}
																	{#each symbol.paths as path, i (i)}
																		<path
																			fill={path.fill_color ?? 'transparent'}
																			stroke={path.stroke_color ?? 'transparent'}
																			d={buildPath(
																				{
																					x: selectedLayerPreviewEdge.target_x - size,
																					y: selectedLayerPreviewEdge.target_y - size,
																					width: 2 * size,
																					height: 2 * size
																				},
																				path
																			)}
																			fill-rule="evenodd"
																		/>
																	{/each}
																{/if}
															{/await}
														</g>
													{/if}
												{/if}
											{/each}
										</g>

										<g transform={rotationTransform.value} opacity="0.6" pointer-events="none">
											{#each presence.value as { data: { cursors, color, username, selections } }}
												{#if showOtherSelections.value}
													<g style:--selection-color={color}>
														{#each selections.filter(({ self }) => !self) as { value: id }}
															{@const el = view(
																['layers', 'items', L.find((el) => el.id == id)],
																doc
															)}
															{@const deep_bounding = view(
																[
																	L.find((layer) => layer.id == id && layer.has_children),
																	'deep_bounding'
																],
																layersInOrder
															).value}
															{#if deep_bounding}
																<rect
																	class="selected"
																	x={deep_bounding.minX - 3 * cameraScale.value}
																	y={deep_bounding.minY - 3 * cameraScale.value}
																	width={deep_bounding.maxX -
																		deep_bounding.minX +
																		6 * cameraScale.value}
																	height={deep_bounding.maxY -
																		deep_bounding.minY +
																		6 * cameraScale.value}
																></rect>
															{/if}
															{#if el.value?.box}
																<rect
																	class="selected"
																	x={el.value?.box.position_x - 1 * cameraScale.value}
																	y={el.value?.box.position_y - 1 * cameraScale.value}
																	width={el.value?.box.width + 2 * cameraScale.value}
																	height={el.value?.box.height + 2 * cameraScale.value}
																></rect>
															{/if}
															{#if el.value?.text}
																{@const bbox = view(L.prop(el.value?.id), textBounds)}

																{#if bbox.value}
																	<rect
																		class="selected"
																		x={bbox.value.x}
																		y={bbox.value.y}
																		width={bbox.value.width}
																		height={bbox.value.height}
																	></rect>
																{/if}
															{/if}
															{#if el.value?.edge}
																{@const remotePreviewEdge = renderedEdgePreview(
																	el.value,
																	doc.value,
																	layersInOrder.value,
																	groupDrag.value,
																	groupDragDelta.value
																)}
																{@const remotePreviewWaypoints =
																	L.get(localProp('waypoints'), remotePreviewEdge) ??
																	remotePreviewEdge?.waypoints ??
																	[]}
																<g>
																	<path
																		class="selected"
																		d={edgePath[remotePreviewEdge?.style?.smoothness ?? 'linear'](
																			remotePreviewEdge,
																			remotePreviewWaypoints
																		)}
																		stroke="black"
																		fill="none"
																		stroke-width={(remotePreviewEdge?.style?.stroke_width ?? 1) *
																			1 +
																			4 * cameraScale.value}
																		stroke-linejoin={remotePreviewEdge?.style?.stroke_join ??
																			'miter'}
																		stroke-linecap={remotePreviewEdge?.style?.stroke_cap ?? 'butt'}
																	/>

																	{#if remotePreviewEdge?.style?.source_tip_symbol_shape_id}
																		{@const source_angle = edgeAngle['source'](
																			remotePreviewEdge,
																			remotePreviewWaypoints
																		)}
																		<g
																			class="selected"
																			transform="rotate({source_angle} {remotePreviewEdge.source_x} {remotePreviewEdge.source_y})"
																		>
																			{#await data.symbols then symbols}
																				{@const symbol = symbols.get(
																					remotePreviewEdge?.style?.source_tip_symbol_shape_id
																				)}
																				{@const size =
																					(remotePreviewEdge?.style?.stroke_width ?? 1) *
																					(remotePreviewEdge?.style?.source_tip_size ?? 1)}

																				{#if symbol}
																					{#each symbol.paths as path, i (i)}
																						<path
																							fill={path.fill_color ?? 'transparent'}
																							stroke={path.stroke_color ?? 'transparent'}
																							d={buildPath(
																								{
																									x: remotePreviewEdge.source_x - size,
																									y: remotePreviewEdge.source_y - size,
																									width: 2 * size,
																									height: 2 * size
																								},
																								path
																							)}
																							fill-rule="evenodd"
																						/>
																					{/each}
																				{/if}
																			{/await}
																		</g>
																	{/if}

																	{#if remotePreviewEdge?.style?.target_tip_symbol_shape_id}
																		{@const target_angle = edgeAngle['target'](
																			remotePreviewEdge,
																			remotePreviewWaypoints
																		)}
																		<g
																			class="selected"
																			transform="rotate({target_angle} {remotePreviewEdge.target_x} {remotePreviewEdge.target_y})"
																		>
																			{#await data.symbols then symbols}
																				{@const symbol = symbols.get(
																					remotePreviewEdge?.style?.target_tip_symbol_shape_id
																				)}
																				{@const size =
																					(remotePreviewEdge?.style?.stroke_width ?? 1) *
																					(remotePreviewEdge?.style?.target_tip_size ?? 1)}

																				{#if symbol}
																					{#each symbol.paths as path, i (i)}
																						<path
																							fill={path.fill_color ?? 'transparent'}
																							stroke={path.stroke_color ?? 'transparent'}
																							d={buildPath(
																								{
																									x: remotePreviewEdge.target_x - size,
																									y: remotePreviewEdge.target_y - size,
																									width: 2 * size,
																									height: 2 * size
																								},
																								path
																							)}
																							fill-rule="evenodd"
																						/>
																					{/each}
																				{/if}
																			{/await}
																		</g>
																	{/if}</g
																>
															{/if}
														{/each}
													</g>
												{/if}
												{#if showCursors.value}
													{#each cursors.filter(({ self, value }) => !self && value) as { value: cursor }}
														<path
															transform="translate({cursor.x} {cursor.y}) rotate({-camera.value
																.focus.w} 0 0) {scaleTransform.value}
												"
															d="M0 0 v 24 l 6 -6 h 10"
															fill={color}
														/>
													{/each}
												{/if}
											{/each}
										</g>

										{#if areaSelection.value?.active}
											{@const selectionBox = normalizedBox(areaSelection.value)}
											<g transform={rotationTransform.value}>
												<rect
													class="area-selection"
													x={selectionBox.x}
													y={selectionBox.y}
													width={selectionBox.width}
													height={selectionBox.height}
												/>
											</g>
										{/if}

										{#if primitiveCreation.value && primitiveSupportsSizedCreation(activeCreateTool.value) && isPrimitiveCreationDrag(primitiveCreation.value)}
											{@const creationBox = normalizedBox(primitiveCreation.value)}
											{@const primitiveContent = activeCreateTool.value?.item?.data?.content ?? {}}
											{@const previewStyle = primitivePreviewStyle(primitiveContent)}
											{@const roundRadius = primitivePreviewRoundRadius(primitiveContent)}
											<g transform={rotationTransform.value}>
												{#if primitivePreviewUsesSymbol(primitiveContent)}
													<g
														class="primitive-creation-preview-shape"
														style:fill={previewStyle.background}
														style:stroke={previewStyle.border}
													>
														<Symbol
															symbols={data.symbols}
															symbolId={primitiveContent.shape_id}
															box={creationBox}
															shapeAttributes={primitiveContent.shape_attributes}
														/>
													</g>
												{:else if primitivePreviewIsLine(primitiveContent)}
													<path
														class="primitive-creation-preview-shape primitive-creation-preview-line"
														style:stroke={previewStyle.border}
														fill="none"
														d={primitivePreviewLinePath(creationBox, primitiveCreation.value)}
													/>
												{:else if primitivePreviewIsEllipse(primitiveContent)}
													<ellipse
														class="primitive-creation-preview-shape"
														style:fill={previewStyle.background}
														style:stroke={previewStyle.border}
														cx={creationBox.x + creationBox.width / 2}
														cy={creationBox.y + creationBox.height / 2}
														rx={creationBox.width / 2}
														ry={creationBox.height / 2}
													/>
												{:else if primitivePreviewIsTriangle(primitiveContent)}
													<path
														class="primitive-creation-preview-shape"
														style:fill={previewStyle.background}
														style:stroke={previewStyle.border}
														d={primitivePreviewTrianglePath(creationBox)}
													/>
												{:else if primitivePreviewIsDiamond(primitiveContent)}
													<path
														class="primitive-creation-preview-shape"
														style:fill={previewStyle.background}
														style:stroke={previewStyle.border}
														d={primitivePreviewDiamondPath(creationBox)}
													/>
												{:else if primitivePreviewIsPie(primitiveContent)}
													<path
														class="primitive-creation-preview-shape"
														style:fill={previewStyle.background}
														style:stroke={previewStyle.border}
														d={primitivePreviewPiePath(creationBox)}
													/>
												{:else}
													<rect
														class="primitive-creation-preview-shape"
														style:fill={previewStyle.background}
														style:stroke={previewStyle.border}
														x={creationBox.x}
														y={creationBox.y}
														width={creationBox.width}
														height={creationBox.height}
														rx={roundRadius}
														ry={roundRadius}
													/>
												{/if}
											</g>
										{/if}

										{#if linkedPrimitiveCreation.value}
											{@const creation = linkedPrimitiveCreation.value}
											{@const primitiveContent = creation.tool?.item?.data?.content ?? {}}
											{@const previewStyle = primitivePreviewStyle(primitiveContent)}
											{@const previewSize = creation.size ?? {
												width: primitiveContent.width ?? 20,
												height: primitiveContent.height ?? 20
											}}
											{@const creationBox = {
												x: creation.current.x - previewSize.width / 2,
												y: creation.current.y - previewSize.height / 2,
												width: previewSize.width,
												height: previewSize.height
											}}
											{@const roundRadius = primitivePreviewRoundRadius(primitiveContent)}
											<g transform={rotationTransform.value}>
												{#if primitivePreviewUsesSymbol(primitiveContent)}
													<g
														class="primitive-creation-preview-shape"
														style:fill={previewStyle.background}
														style:stroke={previewStyle.border}
													>
														<Symbol
															symbols={data.symbols}
															symbolId={primitiveContent.shape_id}
															box={creationBox}
															shapeAttributes={primitiveContent.shape_attributes}
														/>
													</g>
												{:else if primitivePreviewIsLine(primitiveContent)}
													<path
														class="primitive-creation-preview-shape primitive-creation-preview-line"
														style:stroke={previewStyle.border}
														fill="none"
														d={primitivePreviewLinePath(creationBox, creation)}
													/>
												{:else if primitivePreviewIsEllipse(primitiveContent)}
													<ellipse
														class="primitive-creation-preview-shape"
														style:fill={previewStyle.background}
														style:stroke={previewStyle.border}
														cx={creationBox.x + creationBox.width / 2}
														cy={creationBox.y + creationBox.height / 2}
														rx={creationBox.width / 2}
														ry={creationBox.height / 2}
													/>
												{:else if primitivePreviewIsTriangle(primitiveContent)}
													<path
														class="primitive-creation-preview-shape"
														style:fill={previewStyle.background}
														style:stroke={previewStyle.border}
														d={primitivePreviewTrianglePath(creationBox)}
													/>
												{:else if primitivePreviewIsDiamond(primitiveContent)}
													<path
														class="primitive-creation-preview-shape"
														style:fill={previewStyle.background}
														style:stroke={previewStyle.border}
														d={primitivePreviewDiamondPath(creationBox)}
													/>
												{:else if primitivePreviewIsPie(primitiveContent)}
													<path
														class="primitive-creation-preview-shape"
														style:fill={previewStyle.background}
														style:stroke={previewStyle.border}
														d={primitivePreviewPiePath(creationBox)}
													/>
												{:else}
													<rect
														class="primitive-creation-preview-shape"
														style:fill={previewStyle.background}
														style:stroke={previewStyle.border}
														x={creationBox.x}
														y={creationBox.y}
														width={creationBox.width}
														height={creationBox.height}
														rx={roundRadius}
														ry={roundRadius}
													/>
												{/if}
											</g>
										{/if}

										{#if activeCreateTool.value && !primitiveNeedsLinkedTarget(activeCreateTool.value) && !primitiveCreatesText(activeCreateTool.value)}
											<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
											<path
												class="primitive-creation-hitbox"
												d={frameBoxPath.value}
												fill="#ffffff00"
												stroke="none"
												pointer-events="all"
												onpointerdown={(evt) => beginPrimitiveCreation(evt, liveLenses)}
												onpointermove={(evt) => updatePrimitiveCreation(evt, liveLenses)}
												onpointerup={(evt) =>
													finishPrimitiveCreation(
														evt,
														liveLenses,
														dispatch,
														cast,
														L.get('id', singleSelectedLayer.value)
													)}
												onpointercancel={cancelPrimitiveCreation}
												onlostpointercapture={cancelPrimitiveCreation}
												oncontextmenu={resetToolFromCanvas}
												onclick={(evt) => {
													evt.preventDefault();
													evt.stopPropagation();
												}}
											/>
										{/if}

										{#if inlineTextEdit.value}
											{@const editingLayer = view(
												['layers', 'items', L.find((el) => el.id === inlineTextEdit.value.id)],
												doc
											)}
											{@const editingBounds = textEditorBounds(
												editingLayer.value,
												inlineTextEdit.value.bounds ?? textBounds.value[inlineTextEdit.value.id],
												cameraScale.value,
												inlineTextEdit.value.body
											)}
											{#if editingLayer.value?.text && editingBounds}
												<g transform={rotationTransform.value}>
													<rect
														class="inline-text-editor-rect"
														rx="5"
														ry="5"
														transform={layerMoveTransform(
															inlineTextEdit.value.id,
															layersInOrder.value
														)}
														x={editingBounds.x}
														y={editingBounds.y}
														width={editingBounds.width}
														height={editingBounds.height}
													></rect>
													<foreignObject
														class="inline-text-editor-object"
														transform={layerMoveTransform(
															inlineTextEdit.value.id,
															layersInOrder.value
														)}
														x={editingBounds.x}
														y={editingBounds.y}
														width={editingBounds.width}
														height={editingBounds.height}
													>
														<textarea
															class="inline-text-editor-control"
															rows={textEditorRows(inlineTextEdit.value.body)}
															wrap="off"
															spellcheck="false"
															style:font-size={textEditorFontSize(editingLayer.value)}
															style:font-family={editingLayer.value.text?.style?.font_family ??
																'sans-serif'}
															style:font-weight={editingLayer.value.text?.style?.bold
																? 'bold'
																: 'normal'}
															style:font-style={editingLayer.value.text?.style?.italic
																? 'italic'
																: 'normal'}
															style:color={editingLayer.value.text?.style?.text_color ?? 'black'}
															value={inlineTextEdit.value.body}
															use:focusInlineTextEditor
															use:commitInlineTextEditOnOutsidePointer={cast}
															onpointerdown={(evt) => evt.stopPropagation()}
															onblur={(evt) => commitInlineTextEdit(cast)}
															onclick={(evt) => evt.stopPropagation()}
															oninput={(evt) => {
																updateInlineTextEdit(evt.currentTarget.value);
																updateText(editingLayer.value.id, evt.currentTarget.value);
															}}
															onkeydown={(evt) => {
																evt.stopPropagation();
																if (evt.key === 'Escape') {
																	evt.preventDefault();
																	commitInlineTextEdit(cast);
																}
																if ((evt.ctrlKey || evt.metaKey) && evt.key === 'Enter') {
																	evt.preventDefault();
																	commitInlineTextEdit(cast);
																}
															}}
														></textarea>
													</foreignObject>
												</g>
											{/if}
										{/if}

										{#if activeTool.value === 'select'}
											<g transform={rotationTransform.value} opacity="0.7">
												{#each selectedLayers.value as id (id)}
													{@const el = view(['layers', 'items', L.find((el) => el.id == id)], doc)}

													{@const deep_bounding = view(
														[L.find((el) => el.id == id && el.has_children), 'deep_bounding'],
														layersInOrder
													).value}

													{#if deep_bounding}
														<rect
															stroke="#0af"
															cursor="default"
															stroke-dasharray="{cameraScale.value * 2} {cameraScale.value * 2}"
															stroke-width={cameraScale.value * 2}
															x={deep_bounding.minX -
																3 * cameraScale.value +
																groupDragDelta.value.x}
															y={deep_bounding.minY -
																3 * cameraScale.value +
																groupDragDelta.value.y}
															width={deep_bounding.maxX -
																deep_bounding.minX +
																6 * cameraScale.value}
															height={deep_bounding.maxY -
																deep_bounding.minY +
																6 * cameraScale.value}
															fill="#0af5"
															pointer-events="none"
														/>
													{/if}
												{/each}
											</g>
										{/if}
										{#if activeTool.value === 'select'}
											<g transform={rotationTransform.value}>
												<!-- svelte-ignore a11y_no_static_element_interactions -->
												{#each edgeHandleLayerIds(selectedLayers.value) as id (id)}
													{@const el = view(['layers', 'items', L.find((el) => el.id == id)], doc)}
													{@const waypoints = view(['edge', localProp('waypoints')], el)}
													{@const persistentWaypoints = view(
														L.filter(waypointHandleVisible),
														waypoints
													)}
													{#if el.value?.edge}
														{@const selectedPreviewEdge = renderedEdgePreview(
															el.value,
															doc.value,
															layersInOrder.value,
															groupDrag.value,
															groupDragDelta.value
														)}
														{@const selectedPreviewWaypoints =
															L.get(localProp('waypoints'), selectedPreviewEdge) ??
															selectedPreviewEdge?.waypoints ??
															[]}
														{@const selectedPreviewWaypointProposals =
															edgeWaypointProposals(selectedPreviewEdge)}
														{#if activeTool.value === 'select'}
															<path
																d={edgePath[selectedPreviewEdge?.style?.smoothness ?? 'linear'](
																	selectedPreviewEdge,
																	selectedPreviewWaypoints
																)}
																transform={edgePreviewTransform(
																	id,
																	layersInOrder.value,
																	el.value.edge,
																	selectedPreviewEdge
																)}
																tabindex="-1"
																onkeydown={(evt) => {
																	if (evt.key === 'Escape' || evt.key === 'Esc') {
																		cancelLayerMove(evt);
																	}
																}}
																stroke={'transparent'}
																fill={selectedPreviewEdge?.cyclic
																	? (el.value?.style?.background_color ?? 'none')
																	: 'none'}
																fill-opacity="0"
																stroke-width={(selectedPreviewEdge?.style?.stroke_width ?? 1) * 1 +
																	10 * cameraScale.value}
																stroke-linejoin={selectedPreviewEdge?.style?.stroke_join ?? 'miter'}
																stroke-linecap={selectedPreviewEdge?.style?.stroke_cap ?? 'butt'}
																style:pointer-events="painted"
																cursor="default"
																onpointerdown={(evt) =>
																	beginLayerMove(
																		evt,
																		liveLenses,
																		el.value.id,
																		layersInOrder.value,
																		doc.value
																	)}
																onclick={(evt) => clickSelectedLayer(evt, cast, el.value.id)}
																onpointermove={(evt) =>
																	updateLayerMove(evt, liveLenses, doc, layersInOrder.value)}
																onpointerup={(evt) =>
																	finishLayerMove(evt, dispatch, doc, layersInOrder.value)}
																onpointercancel={cancelLayerMove}
																onlostpointercapture={cancelLayerMove}
															/>
														{/if}
														{#if activeTool.value === 'select' && isPolygonLayer(el.value)}
															{@const polygonHandlePos = polygonScaleHandlePosition(
																selectedPreviewEdge,
																8 * cameraScale.value
															)}
															{#if polygonHandlePos}
																{@const polygonHandleDisplayPos = polygonScaleHandleDisplayPosition(
																	id,
																	polygonHandlePos
																)}
																<g
																	transform={edgePreviewTransform(
																		id,
																		layersInOrder.value,
																		el.value.edge,
																		selectedPreviewEdge
																	)}
																	role="button"
																	tabindex="-1"
																	onpointerdown={(evt) =>
																		beginPolygonScaleHandle(
																			evt,
																			liveLenses,
																			el.value,
																			selectedPreviewEdge,
																			polygonHandlePos,
																			layersInOrder.value,
																			doc.value
																		)}
																	onpointermove={(evt) => {
																		if (
																			updateSelectionMoveFromHandle(
																				evt,
																				liveLenses,
																				doc,
																				layersInOrder.value
																			)
																		) {
																			return;
																		}
																		updatePolygonScaleHandle(evt, liveLenses);
																	}}
																	onpointerup={(evt) => {
																		if (
																			finishSelectionMoveFromHandle(
																				evt,
																				dispatch,
																				doc,
																				layersInOrder.value
																			)
																		) {
																			return;
																		}
																		finishPolygonScaleHandle(evt, dispatch, liveLenses);
																	}}
																	onpointercancel={(evt) => cancelPolygonScaleHandle(evt)}
																	onlostpointercapture={(evt) => cancelPolygonScaleHandle(evt)}
																	onclick={(evt) => {
																		evt.stopPropagation();
																	}}
																	onkeydown={(evt) => {
																		if (cancelSelectionMoveFromHandle(evt)) {
																			return;
																		}

																		if (evt.key === 'Escape' || evt.key === 'Esc') {
																			evt.stopPropagation();
																			cancelPolygonScaleHandle(evt);
																		}
																	}}
																>
																	<circle
																		fill="none"
																		stroke="none"
																		pointer-events="all"
																		cursor="default"
																		r={4 * cameraScale.value}
																		cx={polygonHandleDisplayPos.x}
																		cy={polygonHandleDisplayPos.y}
																	/>
																	<circle
																		fill="#ffeb3b"
																		stroke="#111"
																		stroke-width="1.5"
																		vector-effect="non-scaling-stroke"
																		pointer-events="none"
																		r={4 * cameraScale.value}
																		cx={polygonHandleDisplayPos.x}
																		cy={polygonHandleDisplayPos.y}
																	/>
																</g>
															{/if}
														{/if}
														{#each selectedPreviewWaypointProposals as wp_proposal, wi (wp_proposal.id_before)}
															{@const draftWaypointId = localWaypointIdForProposal(wp_proposal)}
															{@const pos = view(
																[
																	L.lens(
																		(list) => {
																			const sourceList = Array.isArray(list) ? list : [];
																			const i =
																				R.findIndex(
																					R.propEq(wp_proposal.id_before, 'id'),
																					sourceList
																				) + 1;
																			if (
																				sourceList[i] &&
																				(!sourceList[i].id || sourceList[i].id === draftWaypointId)
																			) {
																				return sourceList[i];
																			} else {
																				return undefined;
																			}
																		},
																		(n, list) => {
																			const sourceList = Array.isArray(list) ? list : [];
																			const i =
																				R.findIndex(
																					R.propEq(wp_proposal.id_before, 'id'),
																					sourceList
																				) + 1;
																			const draftAtIndex =
																				sourceList[i] &&
																				(!sourceList[i].id || sourceList[i].id === draftWaypointId);
																			if (draftAtIndex) {
																				if (n === undefined || R.equals(wp_proposal, n)) {
																					return [
																						...sourceList.slice(0, i),
																						...sourceList.slice(i + 1)
																					];
																				} else {
																					return [
																						...sourceList.slice(0, i),
																						{ ...n, id: draftWaypointId },
																						...sourceList.slice(i + 1)
																					];
																				}
																			} else {
																				if (n === undefined) {
																					return sourceList;
																				} else {
																					return [
																						...sourceList.slice(0, i),
																						{ ...n, id: draftWaypointId },
																						...sourceList.slice(i)
																					];
																				}
																			}
																		}
																	)
																],
																waypoints
															)}
															<g
																transform={edgePreviewTransform(
																	id,
																	layersInOrder.value,
																	el.value.edge,
																	selectedPreviewEdge
																)}
																onclick={(evt) => {
																	evt.stopPropagation();
																	backoffValue.value = undefined;
																}}
																onkeydown={(evt) => {
																	if (cancelSelectionMoveFromHandle(evt)) {
																		return;
																	}

																	if (evt.key === 'Escape' || evt.key === 'Esc') {
																		if (!backoffValue.value) {
																			return;
																		}
																		evt.stopPropagation();
																		waypoints.value = localProp.reset;
																		evt.currentTarget.releasePointerCapture(
																			evt.currentTarget.currentPointerId
																		);
																	}
																}}
																role="button"
																tabindex="-1"
																onpointerdown={(evt) => {
																	if (evt.isPrimary && E.isLeftButton(evt)) {
																		evt.preventDefault();
																		evt.currentTarget.focus({
																			preventScroll: true
																		});
																		waypoints.value = localProp.reset;
																		evt.currentTarget.setPointerCapture(evt.pointerId);
																		evt.currentTarget.currentPointerId = evt.pointerId;
																		backoffValue.value = wp_proposal;
																		pointerOffset.value = Geo.diff2d(
																			wp_proposal,
																			liveLenses.clientToCanvas(evt.clientX, evt.clientY)
																		);

																		pos.value = {
																			...Geo.translate(
																				pointerOffset.value,
																				liveLenses.clientToCanvas(evt.clientX, evt.clientY)
																			),
																			id: draftWaypointId
																		};
																	}
																}}
																onpointermove={(evt) => {
																	if (
																		evt.isPrimary &&
																		evt.currentTarget.hasPointerCapture(evt.pointerId)
																	) {
																		pos.value = {
																			...Geo.translate(
																				pointerOffset.value,
																				liveLenses.clientToCanvas(evt.clientX, evt.clientY)
																			),
																			id: draftWaypointId
																		};
																	}
																}}
																onpointerup={(evt) => {
																	if (
																		evt.isPrimary &&
																		evt.currentTarget.hasPointerCapture(evt.pointerId)
																	) {
																		const finalPosition = waypointPositionPayload(pos.value);
																		const committedWaypoints = pendingWaypointPreview(
																			selectedPreviewWaypoints,
																			{
																				layerId: el.value.id,
																				afterWaypointId: waypointServerId(wp_proposal.id_before),
																				current: finalPosition,
																				moved: true
																			},
																			el.value.id
																		);
																		const action = cast('create_waypoint', {
																			layer_id: el.value.id,
																			after_waypoint_id: waypointServerId(wp_proposal.id_before),
																			position: finalPosition
																		});
																		holdCommittedEdgeWaypointPreview(
																			el.value.id,
																			selectedPreviewEdge,
																			committedWaypoints,
																			action,
																			doc
																		);
																		evt.currentTarget.releasePointerCapture(evt.pointerId);
																		evt.currentTarget.blur();
																		backoffValue.value = undefined;
																	}
																}}
															>
																<circle
																	fill="none"
																	cursor="default"
																	stroke="none"
																	r={12 * cameraScale.value}
																	cx={wp_proposal.x}
																	cy={wp_proposal.y}
																	pointer-events="all"
																/>
																<circle
																	fill="white"
																	cursor="default"
																	stroke="#7af"
																	stroke-width="2"
																	pointer-events="none"
																	vector-effect="non-scaling-stroke"
																	r={4 * cameraScale.value}
																	cx={wp_proposal.x}
																	cy={wp_proposal.y}
																/>
																<path
																	d="M {wp_proposal.x -
																		3 * cameraScale.value} {wp_proposal.y} H {wp_proposal.x +
																		3 * cameraScale.value} M {wp_proposal.x} {wp_proposal.y -
																		3 * cameraScale.value} V {wp_proposal.y +
																		3 * cameraScale.value}"
																	stroke="#7af"
																	stroke-width="1.5"
																	vector-effect="non-scaling-stroke"
																	pointer-events="none"
																/></g
															>
														{/each}
														{#each persistentWaypoints.value as wp, wi (wp.id)}
															{@const previewWp = previewWaypointPosition(
																selectedPreviewWaypoints,
																wp
															)}
															{@const pos = view(
																[
																	L.find(R.whereEq({ id: wp.id }), { hint: wi }),
																	L.removable('x', 'y'),
																	L.props('x', 'y')
																],
																waypoints
															)}
															<g
																transform={edgePreviewTransform(
																	id,
																	layersInOrder.value,
																	el.value.edge,
																	selectedPreviewEdge
																)}
																onclick={(evt) => {
																	backoffValue.value = undefined;
																	evt.stopPropagation();
																}}
																ondblclick={(evt) => {
																	evt.stopPropagation();

																	if (document.activeElement === evt.currentTarget) {
																		pos.value = undefined;
																		cast('delete_waypoint', {
																			layer_id: el.value.id,
																			waypoint_id: wp.id
																		});
																	}
																}}
																onpointerdown={(evt) => {
																	if (evt.isPrimary && E.isLeftButton(evt)) {
																		evt.preventDefault();
																		evt.currentTarget.focus({
																			preventScroll: true
																		});
																		evt.currentTarget.setPointerCapture(evt.pointerId);
																		evt.currentTarget.currentPointerId = evt.pointerId;
																		waypoints.value = localProp.reset;
																		pos.value = previewWp;
																		backoffValue.value = previewWp;
																		pointerOffset.value = Geo.diff2d(
																			previewWp,
																			liveLenses.clientToCanvas(evt.clientX, evt.clientY)
																		);
																	}
																}}
																onpointermove={(evt) => {
																	if (
																		evt.isPrimary &&
																		evt.currentTarget.hasPointerCapture(evt.pointerId)
																	) {
																		pos.value = Geo.translate(
																			pointerOffset.value,
																			liveLenses.clientToCanvas(evt.clientX, evt.clientY)
																		);
																	}
																}}
																onpointerup={(evt) => {
																	if (
																		evt.isPrimary &&
																		evt.currentTarget.hasPointerCapture(evt.pointerId)
																	) {
																		const newPos = Geo.translate(
																			pointerOffset.value,
																			liveLenses.clientToCanvas(evt.clientX, evt.clientY)
																		);
																		if (
																			backoffValue.value.x != newPos.x ||
																			backoffValue.value.y != newPos.y
																		) {
																			evt.preventDefault();
																			const committedWaypoints = selectedPreviewWaypoints.map(
																				(waypoint) =>
																					waypoint?.id === wp.id
																						? { ...waypoint, x: newPos.x, y: newPos.y }
																						: waypoint
																			);
																			const action = cast('update_waypoint_position', {
																				layer_id: el.value.id,
																				waypoint_id: wp.id,
																				value: newPos
																			});
																			holdCommittedEdgeWaypointPreview(
																				el.value.id,
																				selectedPreviewEdge,
																				committedWaypoints,
																				action,
																				doc
																			);
																			evt.currentTarget.blur();
																		}
																		evt.currentTarget.releasePointerCapture(evt.pointerId);
																		backoffValue.value = undefined;
																	}
																}}
																onkeydown={(evt) => {
																	if (cancelSelectionMoveFromHandle(evt)) {
																		return;
																	}

																	if (evt.key === 'Escape' || evt.key === 'Esc') {
																		if (!backoffValue.value) {
																			return;
																		}
																		evt.stopPropagation();
																		evt.currentTarget.releasePointerCapture(
																			evt.currentTarget.currentPointerId
																		);
																		waypoints.value = localProp.reset;
																	}
																}}
																role="button"
																tabindex="-1"
															>
																<circle
																	fill="none"
																	cursor="default"
																	stroke="none"
																	r={12 * cameraScale.value}
																	cx={previewWp.x}
																	cy={previewWp.y}
																	pointer-events="all"
																/>
																<rect
																	fill="white"
																	cursor="default"
																	stroke="#7af"
																	stroke-width="2"
																	vector-effect="non-scaling-stroke"
																	x={previewWp.x - 5 * cameraScale.value}
																	y={previewWp.y - 5 * cameraScale.value}
																	width={10 * cameraScale.value}
																	height={10 * cameraScale.value}
																	pointer-events="none"
																/></g
															>
														{/each}

														{@const source_pos = view(
															['edge', L.pick({ x: 'source_x', y: 'source_y' })],
															el
														)}
														{@const target_pos = view(
															['edge', L.pick({ x: 'target_x', y: 'target_y' })],
															el
														)}
														<g
															transform={edgePreviewTransform(
																id,
																layersInOrder.value,
																el.value.edge,
																selectedPreviewEdge
															)}
															onclick={(evt) => {
																evt.stopPropagation();
															}}
															ondblclick={(evt) => {
																evt.preventDefault();
																evt.stopPropagation();
																removeEdgeEndpoint(
																	el.value,
																	'source',
																	waypoints.value,
																	dispatch,
																	cast
																);
															}}
															onpointerdown={(evt) => {
																beginEdgeEndpointHandle(
																	evt,
																	liveLenses,
																	source_pos,
																	el.value,
																	'source'
																);
															}}
															onpointermove={(evt) => {
																if (
																	evt.isPrimary &&
																	evt.currentTarget.hasPointerCapture(evt.pointerId)
																) {
																	const handle = evt.currentTarget;
																	updateEdgeEndpointHandle(
																		evt,
																		liveLenses,
																		source_pos,
																		el.value,
																		'source'
																	);
																	Promise.all([data.socket_schemas, currentSyntaxValue])
																		.then(([socketSchemas, syntax]) => {
																			if (!handle.hasPointerCapture(evt.pointerId)) {
																				return;
																			}
																			updateEdgeEndpointHandle(
																				evt,
																				liveLenses,
																				source_pos,
																				el.value,
																				'source',
																				socketSchemas,
																				syntax,
																				doc.value,
																				layersInOrder.value
																			);
																		})
																		.catch(() => {});
																}
															}}
															onpointerup={(evt) => {
																if (
																	evt.isPrimary &&
																	evt.currentTarget.hasPointerCapture(evt.pointerId) &&
																	prepareEdgeEndpointFinish(evt)
																) {
																	Promise.all([data.socket_schemas, currentSyntaxValue])
																		.then(([socketSchemas, syntax]) => {
																			finishEdgeEndpointHandle(
																				evt,
																				liveLenses,
																				source_pos,
																				el.value,
																				'source',
																				socketSchemas,
																				syntax,
																				doc.value,
																				layersInOrder.value,
																				doc,
																				dispatch,
																				cast
																			);
																		})
																		.catch((error) => {
																			cancelEdgeEndpointHandle(evt, source_pos);
																			queueError(error, 'Edge endpoint could not be changed');
																		});
																}
															}}
															onkeydown={(evt) => {
																if (cancelSelectionMoveFromHandle(evt)) {
																	return;
																}

																if (evt.key === 'Escape' || evt.key === 'Esc') {
																	cancelEdgeEndpointHandle(evt, source_pos);
																}
															}}
															onpointercancel={(evt) => cancelEdgeEndpointHandle(evt, source_pos)}
															onlostpointercapture={(evt) =>
																cancelEdgeEndpointHandle(evt, source_pos)}
															role="button"
															tabindex="-1"
														>
															<circle
																fill="none"
																cursor="default"
																stroke="none"
																pointer-events="all"
																r={7 * cameraScale.value}
																cx={edgeEndpointHandlePoint(
																	id,
																	'source',
																	source_pos.value,
																	selectedPreviewEdge
																)?.x}
																cy={edgeEndpointHandlePoint(
																	id,
																	'source',
																	source_pos.value,
																	selectedPreviewEdge
																)?.y}
															/><rect
																fill={isFreePointEdge(el.value) ? 'white' : '#35a66a'}
																cursor="default"
																pointer-events="none"
																stroke={isFreePointEdge(el.value) ? '#111' : '#1f7048'}
																stroke-width="1.5"
																vector-effect="non-scaling-stroke"
																x={edgeEndpointHandlePoint(
																	id,
																	'source',
																	source_pos.value,
																	selectedPreviewEdge
																)?.x -
																	4 * cameraScale.value}
																y={edgeEndpointHandlePoint(
																	id,
																	'source',
																	source_pos.value,
																	selectedPreviewEdge
																)?.y -
																	4 * cameraScale.value}
																width={8 * cameraScale.value}
																height={8 * cameraScale.value}
															/></g
														>
														<g
															transform={edgePreviewTransform(
																id,
																layersInOrder.value,
																el.value.edge,
																selectedPreviewEdge
															)}
															onclick={(evt) => {
																evt.stopPropagation();
															}}
															ondblclick={(evt) => {
																evt.preventDefault();
																evt.stopPropagation();
																removeEdgeEndpoint(
																	el.value,
																	'target',
																	waypoints.value,
																	dispatch,
																	cast
																);
															}}
															onpointerdown={(evt) => {
																beginEdgeEndpointHandle(
																	evt,
																	liveLenses,
																	target_pos,
																	el.value,
																	'target'
																);
															}}
															onpointermove={(evt) => {
																if (
																	evt.isPrimary &&
																	evt.currentTarget.hasPointerCapture(evt.pointerId)
																) {
																	const handle = evt.currentTarget;
																	updateEdgeEndpointHandle(
																		evt,
																		liveLenses,
																		target_pos,
																		el.value,
																		'target'
																	);
																	Promise.all([data.socket_schemas, currentSyntaxValue])
																		.then(([socketSchemas, syntax]) => {
																			if (!handle.hasPointerCapture(evt.pointerId)) {
																				return;
																			}
																			updateEdgeEndpointHandle(
																				evt,
																				liveLenses,
																				target_pos,
																				el.value,
																				'target',
																				socketSchemas,
																				syntax,
																				doc.value,
																				layersInOrder.value
																			);
																		})
																		.catch(() => {});
																}
															}}
															onpointerup={(evt) => {
																if (
																	evt.isPrimary &&
																	evt.currentTarget.hasPointerCapture(evt.pointerId) &&
																	prepareEdgeEndpointFinish(evt)
																) {
																	Promise.all([data.socket_schemas, currentSyntaxValue])
																		.then(([socketSchemas, syntax]) => {
																			finishEdgeEndpointHandle(
																				evt,
																				liveLenses,
																				target_pos,
																				el.value,
																				'target',
																				socketSchemas,
																				syntax,
																				doc.value,
																				layersInOrder.value,
																				doc,
																				dispatch,
																				cast
																			);
																		})
																		.catch((error) => {
																			cancelEdgeEndpointHandle(evt, target_pos);
																			queueError(error, 'Edge endpoint could not be changed');
																		});
																}
															}}
															onkeydown={(evt) => {
																if (cancelSelectionMoveFromHandle(evt)) {
																	return;
																}

																if (evt.key === 'Escape' || evt.key === 'Esc') {
																	cancelEdgeEndpointHandle(evt, target_pos);
																}
															}}
															onpointercancel={(evt) => cancelEdgeEndpointHandle(evt, target_pos)}
															onlostpointercapture={(evt) =>
																cancelEdgeEndpointHandle(evt, target_pos)}
															role="button"
															tabindex="-1"
														>
															<circle
																fill="none"
																stroke="none"
																cursor="default"
																pointer-events="all"
																r={7 * cameraScale.value}
																cx={edgeEndpointHandlePoint(
																	id,
																	'target',
																	target_pos.value,
																	selectedPreviewEdge
																)?.x}
																cy={edgeEndpointHandlePoint(
																	id,
																	'target',
																	target_pos.value,
																	selectedPreviewEdge
																)?.y}
															/><rect
																fill={isFreePointEdge(el.value) ? 'white' : '#35a66a'}
																stroke={isFreePointEdge(el.value) ? '#111' : '#1f7048'}
																cursor="default"
																stroke-width="1.5"
																pointer-events="none"
																vector-effect="non-scaling-stroke"
																x={edgeEndpointHandlePoint(
																	id,
																	'target',
																	target_pos.value,
																	selectedPreviewEdge
																)?.x -
																	4 * cameraScale.value}
																y={edgeEndpointHandlePoint(
																	id,
																	'target',
																	target_pos.value,
																	selectedPreviewEdge
																)?.y -
																	4 * cameraScale.value}
																width={8 * cameraScale.value}
																height={8 * cameraScale.value}
															/></g
														>
													{/if}
												{/each}
											</g>
										{/if}
										{#if activeTool.value === 'select'}
											<g transform={rotationTransform.value}>
												<!-- svelte-ignore a11y_no_static_element_interactions -->
												{#each selectedLayers.value as id (id)}
													{@const el = view(['layers', 'items', L.find((el) => el.id == id)], doc)}
													{@const corners = {
														topLeft: {
															dx: -1,
															dy: -1,
															lens: L.pick({
																x: [
																	L.lens(
																		(o) => o && o.position_x,
																		(n, o) => {
																			const d = Math.min(n - o.position_x, o.width);

																			return {
																				...o,
																				position_x: o.position_x + d,
																				width: o.width - d
																			};
																		}
																	)
																],
																y: [
																	L.lens(
																		(o) => o && o.position_y,
																		(n, o) => {
																			const d = Math.min(n - o.position_y, o.height);

																			return {
																				...o,
																				position_y: o.position_y + d,
																				height: o.height - d
																			};
																		}
																	)
																]
															})
														},
														topCenter: {
															dx: 0,
															dy: -1,
															lens: L.pick({
																x: L.lens(
																	(o) => o && o.position_x + o.width / 2,
																	(_n, o) => o
																),
																y: [
																	L.lens(
																		(o) => o && o.position_y,
																		(n, o) => {
																			const d = Math.min(n - o.position_y, o.height);

																			return {
																				...o,
																				position_y: o.position_y + d,
																				height: o.height - d
																			};
																		}
																	)
																]
															})
														},
														topRight: {
															dx: 1,
															dy: -1,
															lens: L.pick({
																x: [
																	L.lens(
																		(o) => o && o.position_x,
																		(n, o) => {
																			const d = Math.min(n - o.position_x, o.width);

																			return {
																				...o,
																				position_x: o.position_x + d,
																				width: o.width - d
																			};
																		}
																	)
																],
																y: L.choose((b) => [
																	'height',
																	L.normalize(R.max(0)),
																	L.add(b ? b.position_y : 0)
																])
															})
														},
														middleLeft: {
															dx: -1,
															dy: 0,
															lens: L.pick({
																x: [
																	L.lens(
																		(o) => o && o.position_x,
																		(n, o) => {
																			const d = Math.min(n - o.position_x, o.width);

																			return {
																				...o,
																				position_x: o.position_x + d,
																				width: o.width - d
																			};
																		}
																	)
																],
																y: L.lens(
																	(o) => o && o.position_y + o.height / 2,
																	(_n, o) => o
																)
															})
														},
														middleRight: {
															dx: 1,
															dy: 0,
															lens: L.pick({
																x: L.choose((b) => [
																	'width',
																	L.normalize(R.max(0)),
																	L.add(b ? b.position_x : 0)
																]),
																y: L.lens(
																	(o) => o && o.position_y + o.height / 2,
																	(_n, o) => o
																)
															})
														},
														bottomLeft: {
															dx: -1,
															dy: 1,
															lens: L.pick({
																y: [
																	L.lens(
																		(o) => o && o.position_y,
																		(n, o) => {
																			const d = Math.min(n - o.position_y, o.height);

																			return {
																				...o,
																				position_y: o.position_y + d,
																				height: o.height - d
																			};
																		}
																	)
																],
																x: L.choose((b) => [
																	'width',
																	L.normalize(R.max(0)),
																	L.add(b ? b.position_x : 0)
																])
															})
														},
														bottomRight: {
															dx: 1,
															dy: 1,
															lens: L.pick({
																x: L.choose((b) => [
																	'width',
																	L.normalize(R.max(0)),
																	L.add(b ? b.position_x : 0)
																]),
																y: L.choose((b) => [
																	'height',
																	L.normalize(R.max(0)),
																	L.add(b ? b.position_y : 0)
																])
															})
														},
														bottomCenter: {
															dx: 0,
															dy: 1,
															lens: L.pick({
																x: L.lens(
																	(o) => o && o.position_x + o.width / 2,
																	(_n, o) => o
																),
																y: L.choose((b) => [
																	'height',
																	L.normalize(R.max(0)),
																	L.add(b ? b.position_y : 0)
																])
															})
														}
													}}
													{@const boxDim = viewCombined(
														[
															L.cond(
																[
																	R.path(['el', 'box']),
																	[
																		'el',
																		'box',
																		L.pick({
																			x: 'position_x',
																			y: 'position_y',
																			width: 'width',
																			height: 'height'
																		})
																	]
																],
																[
																	(x, i) => R.path(['el', 'text']),
																	[
																		L.choose(({ el }) =>
																			el ? ['textBounds', L.prop(el.id)] : L.zero
																		)
																	]
																]
															)
														],
														{ el, textBounds }
													)}
													<rect
														{...boxDim.value}
														transform={layerMoveTransform(id, layersInOrder.value)}
														fill="none"
														class="draggable"
														oncontextmenu={(evt) => {
															if (
																el.value?.text &&
																beginContextTextEdit(evt, el.value, boxDim.value, cast)
															) {
																return;
															}
															if (
																beginDirectInscriptionEdit(
																	evt,
																	el.value,
																	liveLenses,
																	dispatch,
																	cast,
																	doc.value,
																	boxDim.value
																)
															) {
																return;
															}
															openTargetLocationOrDirectModification(evt, el.value, cast);
														}}
														onpointerdown={(evt) =>
															beginLayerMove(
																evt,
																liveLenses,
																el.value.id,
																layersInOrder.value,
																doc.value
															)}
														onpointermove={(evt) =>
															updateLayerMove(evt, liveLenses, doc, layersInOrder.value)}
														onpointerup={(evt) =>
															finishLayerMove(evt, dispatch, doc, layersInOrder.value)}
														onpointercancel={cancelLayerMove}
														onlostpointercapture={cancelLayerMove}
														onclick={(evt) => clickSelectedLayerHitbox(evt, cast, el.value.id)}
														onkeydown={(evt) => {
															if (evt.key === 'Escape' || evt.key === 'Esc') {
																cancelLayerMove(evt);
															}
														}}
														role="button"
														tabindex="-1"
													/>
													{#each selectionHandlesForLayer(el.value) as handle (handle.type)}
														{#if boxDim.value}
															{@const posVal = selectionHandlePosition(boxDim.value, handle)}
															{@const canResizeHandle = selectionHandleCanResize(el.value)}
															{@const handleInteractive =
																canResizeHandle || selectedLayers.value.length > 1}
															<g
																onpointerdown={(evt) => {
																	if (!handleInteractive) {
																		return;
																	}

																	if (
																		beginSelectionMoveFromHandle(
																			evt,
																			liveLenses,
																			el.value.id,
																			layersInOrder.value,
																			doc.value
																		)
																	) {
																		return;
																	}

																	if (!canResizeHandle) {
																		return;
																	}

																	if (evt.isPrimary && E.isLeftButton(evt)) {
																		evt.preventDefault();
																		evt.currentTarget.focus({
																			preventScroll: true
																		});
																		evt.currentTarget.setPointerCapture(evt.pointerId);
																		evt.currentTarget.currentPointerId = evt.pointerId;
																		backoffValue.value = normalizeResizeRect(boxDim.value);
																		pointerOffset.value = Geo.diff2d(
																			posVal,
																			liveLenses.clientToCanvas(evt.clientX, evt.clientY)
																		);
																		resizeHandleDrag.value = {
																			layerId: el.value.id,
																			startRect: normalizeResizeRect(boxDim.value),
																			currentRect: normalizeResizeRect(boxDim.value),
																			dx: handle.dx,
																			dy: handle.dy,
																			pointerOffset: pointerOffset.value
																		};
																	}
																}}
																onpointermove={(evt) => {
																	if (
																		updateSelectionMoveFromHandle(
																			evt,
																			liveLenses,
																			doc,
																			layersInOrder.value
																		)
																	) {
																		return;
																	}

																	if (
																		evt.isPrimary &&
																		evt.currentTarget.hasPointerCapture(evt.pointerId)
																	) {
																		const drag = resizeHandleDrag.value;
																		if (!drag || drag.layerId !== el.value.id) {
																			return;
																		}
																		const pointer = Geo.translate(
																			drag.pointerOffset,
																			liveLenses.clientToCanvas(evt.clientX, evt.clientY)
																		);
																		const rect = resizeRectFromHandle(drag, pointer, evt);
																		resizeHandleDrag.value = {
																			...drag,
																			currentRect: rect
																		};
																		previewLayerResize(doc, el.value, rect);
																	}
																}}
																onpointerup={(evt) => {
																	if (
																		finishSelectionMoveFromHandle(
																			evt,
																			dispatch,
																			doc,
																			layersInOrder.value
																		)
																	) {
																		return;
																	}

																	if (
																		evt.isPrimary &&
																		evt.currentTarget.hasPointerCapture(evt.pointerId)
																	) {
																		const rect =
																			resizeHandleDrag.value?.currentRect ??
																			normalizeResizeRect(boxDim.value);
																		commitLayerResize(cast, el.value, rect);
																		resizeHandleDrag.value = undefined;
																	}
																}}
																onclick={(evt) => {
																	evt.stopPropagation();
																	backoffValue.value = undefined;
																	resizeHandleDrag.value = undefined;
																}}
																onkeydown={(evt) => {
																	if (cancelSelectionMoveFromHandle(evt)) {
																		return;
																	}

																	if (evt.key === 'Escape' || evt.key === 'Esc') {
																		if (!backoffValue.value) {
																			return;
																		}
																		evt.stopPropagation();
																		evt.currentTarget.releasePointerCapture(
																			evt.currentTarget.currentPointerId
																		);
																		previewLayerResize(doc, el.value, backoffValue.value);
																		resizeHandleDrag.value = undefined;
																	}
																}}
																role="button"
																tabindex="-1"
																transform={layerMoveTransform(id, layersInOrder.value) ?? ''}
															>
																<rect
																	fill="none"
																	stroke="none"
																	cursor="default"
																	pointer-events={handleInteractive ? 'all' : 'none'}
																	vector-effect="non-scaling-stroke"
																	x={posVal.x - cameraScale.value * 6}
																	y={posVal.y - cameraScale.value * 6}
																	width={cameraScale.value * 12}
																	height={cameraScale.value * 12}
																/>
																<rect
																	fill={canResizeHandle ? 'white' : 'none'}
																	stroke="#111"
																	cursor="default"
																	pointer-events="none"
																	vector-effect="non-scaling-stroke"
																	stroke-width="1.5"
																	x={posVal.x - cameraScale.value * 4}
																	y={posVal.y - cameraScale.value * 4}
																	width={cameraScale.value * 8}
																	height={cameraScale.value * 8}
																/>
															</g>
														{/if}
													{/each}
													{#if el.value?.text && boxDim.value}
														{@const fontHandlePos = {
															x: boxDim.value.x,
															y: boxDim.value.y + boxDim.value.height
														}}
														<g
															role="button"
															tabindex="-1"
															transform={layerMoveTransform(id, layersInOrder.value) ?? ''}
															onpointerdown={(evt) => {
																if (
																	beginSelectionMoveFromHandle(
																		evt,
																		liveLenses,
																		el.value.id,
																		layersInOrder.value,
																		doc.value
																	)
																) {
																	return;
																}

																if (evt.isPrimary && E.isLeftButton(evt)) {
																	evt.preventDefault();
																	evt.currentTarget.focus({ preventScroll: true });
																	evt.currentTarget.setPointerCapture(evt.pointerId);
																	evt.currentTarget.currentPointerId = evt.pointerId;
																	attributeHandleDrag.value = {
																		type: 'font_size',
																		layerId: el.value.id,
																		startPointer: liveLenses.clientToCanvas(
																			evt.clientX,
																			evt.clientY
																		),
																		startFontSize: textEditorNumericFontSize(el.value),
																		value: textEditorNumericFontSize(el.value)
																	};
																}
															}}
															onpointermove={(evt) => {
																if (
																	updateSelectionMoveFromHandle(
																		evt,
																		liveLenses,
																		doc,
																		layersInOrder.value
																	)
																) {
																	return;
																}

																if (
																	evt.isPrimary &&
																	evt.currentTarget.hasPointerCapture(evt.pointerId)
																) {
																	const drag = attributeHandleDrag.value;
																	if (drag?.type !== 'font_size' || drag.layerId !== el.value.id) {
																		return;
																	}
																	const fontSize = textFontSizeFromDrag(
																		drag,
																		liveLenses.clientToCanvas(evt.clientX, evt.clientY)
																	);
																	attributeHandleDrag.value = { ...drag, value: fontSize };
																	patchTextFontSizeLocally(doc, el.value.id, fontSize);
																}
															}}
															onpointerup={(evt) => {
																if (
																	finishSelectionMoveFromHandle(
																		evt,
																		dispatch,
																		doc,
																		layersInOrder.value
																	)
																) {
																	return;
																}

																if (
																	evt.isPrimary &&
																	evt.currentTarget.hasPointerCapture(evt.pointerId)
																) {
																	const fontSize =
																		attributeHandleDrag.value?.value ??
																		textEditorNumericFontSize(el.value);
																	commitTextFontSize(cast, el.value, fontSize);
																	attributeHandleDrag.value = undefined;
																}
															}}
															onkeydown={(evt) => {
																if (cancelSelectionMoveFromHandle(evt)) {
																	return;
																}

																if (evt.key === 'Escape' || evt.key === 'Esc') {
																	const drag = attributeHandleDrag.value;
																	if (drag?.type !== 'font_size') {
																		return;
																	}
																	evt.stopPropagation();
																	evt.currentTarget.releasePointerCapture(
																		evt.currentTarget.currentPointerId
																	);
																	patchTextFontSizeLocally(doc, el.value.id, drag.startFontSize);
																	attributeHandleDrag.value = undefined;
																}
															}}
														>
															<circle
																fill="none"
																stroke="none"
																cursor="default"
																pointer-events="all"
																r={cameraScale.value * 7}
																cx={fontHandlePos.x}
																cy={fontHandlePos.y}
															/>
															<circle
																fill="#ffeb3b"
																stroke="#111"
																stroke-width="1.5"
																vector-effect="non-scaling-stroke"
																pointer-events="none"
																r={cameraScale.value * 4}
																cx={fontHandlePos.x}
																cy={fontHandlePos.y}
															/>
														</g>
													{/if}
													{#await data.symbols then symbols}
														{#if supportsRoundRadiusHandle(el.value, symbols)}
														{@const radiusHandlePos = roundRadiusHandlePosition(el.value.box)}
														<g
															role="button"
															tabindex="-1"
															transform={layerMoveTransform(id, layersInOrder.value) ?? ''}
															onpointerdown={(evt) => {
																if (
																	beginSelectionMoveFromHandle(
																		evt,
																		liveLenses,
																		el.value.id,
																		layersInOrder.value,
																		doc.value
																	)
																) {
																	return;
																}

																if (evt.isPrimary && E.isLeftButton(evt)) {
																	evt.preventDefault();
																	evt.currentTarget.focus({ preventScroll: true });
																	evt.currentTarget.setPointerCapture(evt.pointerId);
																	evt.currentTarget.currentPointerId = evt.pointerId;
																	attributeHandleDrag.value = {
																		type: 'round_radius',
																		layerId: el.value.id,
																		startRadii: boxRoundRadii(el.value.box),
																		value: boxRoundRadii(el.value.box)
																	};
																}
															}}
															onpointermove={(evt) => {
																if (
																	updateSelectionMoveFromHandle(
																		evt,
																		liveLenses,
																		doc,
																		layersInOrder.value
																	)
																) {
																	return;
																}

																if (
																	evt.isPrimary &&
																	evt.currentTarget.hasPointerCapture(evt.pointerId)
																) {
																	const drag = attributeHandleDrag.value;
																	if (
																		drag?.type !== 'round_radius' ||
																		drag.layerId !== el.value.id
																	) {
																		return;
																	}
																	const radius = roundRadiusFromPointer(
																		el.value.box,
																		liveLenses.clientToCanvas(evt.clientX, evt.clientY)
																	);
																	attributeHandleDrag.value = { ...drag, value: radius };
																	patchBoxRoundRadiusLocally(doc, el.value.id, radius);
																}
															}}
															onpointerup={(evt) => {
																if (
																	finishSelectionMoveFromHandle(
																		evt,
																		dispatch,
																		doc,
																		layersInOrder.value
																	)
																) {
																	return;
																}

																if (
																	evt.isPrimary &&
																	evt.currentTarget.hasPointerCapture(evt.pointerId)
																) {
																	const radius =
																		attributeHandleDrag.value?.value ?? boxRoundRadii(el.value.box);
																	commitBoxRoundRadius(cast, el.value, radius);
																	attributeHandleDrag.value = undefined;
																}
															}}
															onkeydown={(evt) => {
																if (cancelSelectionMoveFromHandle(evt)) {
																	return;
																}

																if (evt.key === 'Escape' || evt.key === 'Esc') {
																	const drag = attributeHandleDrag.value;
																	if (drag?.type !== 'round_radius') {
																		return;
																	}
																	evt.stopPropagation();
																	evt.currentTarget.releasePointerCapture(
																		evt.currentTarget.currentPointerId
																	);
																	patchBoxRoundRadiusLocally(doc, el.value.id, drag.startRadii);
																	attributeHandleDrag.value = undefined;
																}
															}}
														>
															<circle
																fill="none"
																stroke="none"
																cursor="default"
																pointer-events="all"
																r={cameraScale.value * 7}
																cx={radiusHandlePos.x}
																cy={radiusHandlePos.y}
															/>
															<circle
																fill="#ffeb3b"
																stroke="#111"
																stroke-width="1.5"
																vector-effect="non-scaling-stroke"
																pointer-events="none"
																r={cameraScale.value * 4}
																cx={radiusHandlePos.x}
																cy={radiusHandlePos.y}
															/>
														</g>
													{/if}
													{#if supportsPieAngleHandles(el.value, symbols)}
														{#each ['start_angle', 'end_angle'] as angleKind (angleKind)}
															{@const pieHandlePos = pieAngleHandlePosition(
																el.value.box,
																angleKind
															)}
															<g
																role="button"
																tabindex="-1"
																transform={layerMoveTransform(id, layersInOrder.value) ?? ''}
																onpointerdown={(evt) => {
																	if (
																		beginSelectionMoveFromHandle(
																			evt,
																			liveLenses,
																			el.value.id,
																			layersInOrder.value,
																			doc.value
																		)
																	) {
																		return;
																	}

																	if (evt.isPrimary && E.isLeftButton(evt)) {
																		evt.preventDefault();
																		evt.currentTarget.focus({ preventScroll: true });
																		evt.currentTarget.setPointerCapture(evt.pointerId);
																		evt.currentTarget.currentPointerId = evt.pointerId;
																		attributeHandleDrag.value = {
																			type: 'pie_angle',
																			angleKind,
																			layerId: el.value.id,
																			startAngle: pieAngleValue(el.value.box, angleKind),
																			value: pieAngleValue(el.value.box, angleKind)
																		};
																	}
																}}
																onpointermove={(evt) => {
																	if (
																		updateSelectionMoveFromHandle(
																			evt,
																			liveLenses,
																			doc,
																			layersInOrder.value
																		)
																	) {
																		return;
																	}

																	if (
																		evt.isPrimary &&
																		evt.currentTarget.hasPointerCapture(evt.pointerId)
																	) {
																		const drag = attributeHandleDrag.value;
																		if (
																			drag?.type !== 'pie_angle' ||
																			drag.layerId !== el.value.id ||
																			drag.angleKind !== angleKind
																		) {
																			return;
																		}
																		const angle = pieAngleFromPointer(
																			el.value.box,
																			liveLenses.clientToCanvas(evt.clientX, evt.clientY),
																			evt.ctrlKey || evt.metaKey
																		);
																		attributeHandleDrag.value = { ...drag, value: angle };
																		patchPieAngleLocally(doc, el.value.id, angleKind, angle);
																	}
																}}
																onpointerup={(evt) => {
																	if (
																		finishSelectionMoveFromHandle(
																			evt,
																			dispatch,
																			doc,
																			layersInOrder.value
																		)
																	) {
																		return;
																	}

																	if (
																		evt.isPrimary &&
																		evt.currentTarget.hasPointerCapture(evt.pointerId)
																	) {
																		const angle =
																			attributeHandleDrag.value?.value ??
																			pieAngleValue(el.value.box, angleKind);
																		commitPieAngle(cast, el.value, angleKind, angle);
																		attributeHandleDrag.value = undefined;
																	}
																}}
																onkeydown={(evt) => {
																	if (cancelSelectionMoveFromHandle(evt)) {
																		return;
																	}

																	if (evt.key === 'Escape' || evt.key === 'Esc') {
																		const drag = attributeHandleDrag.value;
																		if (
																			drag?.type !== 'pie_angle' ||
																			drag.layerId !== el.value.id ||
																			drag.angleKind !== angleKind
																		) {
																			return;
																		}
																		evt.stopPropagation();
																		evt.currentTarget.releasePointerCapture(
																			evt.currentTarget.currentPointerId
																		);
																		patchPieAngleLocally(
																			doc,
																			el.value.id,
																			angleKind,
																			drag.startAngle
																		);
																		attributeHandleDrag.value = undefined;
																	}
																}}
															>
																<circle
																	fill="none"
																	stroke="none"
																	cursor="default"
																	pointer-events="all"
																	r={cameraScale.value * 7}
																	cx={pieHandlePos.x}
																	cy={pieHandlePos.y}
																/>
																<circle
																	fill="#ffeb3b"
																	stroke="#111"
																	stroke-width="1.5"
																	vector-effect="non-scaling-stroke"
																	pointer-events="none"
																	r={cameraScale.value * 4}
																	cx={pieHandlePos.x}
																	cy={pieHandlePos.y}
																/>
															</g>
														{/each}
														{/if}
														{#if supportsTriangleRotationHandle(el.value, symbols)}
															{@const triangleRotationValue = triangleRotation(el.value, symbols)}
															{@const triangleHandlePos = triangleRotationHandlePosition(
																el.value.box,
																triangleRotationValue,
																cameraScale.value * 8
															)}
															<g
																role="button"
																tabindex="-1"
																transform={layerMoveTransform(id, layersInOrder.value) ?? ''}
																onpointerdown={(evt) => {
																	if (
																		beginSelectionMoveFromHandle(
																			evt,
																			liveLenses,
																			el.value.id,
																			layersInOrder.value,
																			doc.value
																		)
																	) {
																		return;
																	}

																	if (evt.isPrimary && E.isLeftButton(evt)) {
																		evt.preventDefault();
																		evt.currentTarget.focus({ preventScroll: true });
																		evt.currentTarget.setPointerCapture(evt.pointerId);
																		evt.currentTarget.currentPointerId = evt.pointerId;
																		attributeHandleDrag.value = {
																			type: 'triangle_rotation',
																			layerId: el.value.id,
																			startRotation: triangleRotationValue,
																			startShapeId: el.value.box.shape,
																			value: triangleRotationValue
																		};
																	}
																}}
																onpointermove={(evt) => {
																	if (
																		updateSelectionMoveFromHandle(
																			evt,
																			liveLenses,
																			doc,
																			layersInOrder.value
																		)
																	) {
																		return;
																	}

																	if (
																		evt.isPrimary &&
																		evt.currentTarget.hasPointerCapture(evt.pointerId)
																	) {
																		const drag = attributeHandleDrag.value;
																		if (
																			drag?.type !== 'triangle_rotation' ||
																			drag.layerId !== el.value.id
																		) {
																			return;
																		}
																		const rotation = triangleRotationFromPointer(
																			el.value.box,
																			liveLenses.clientToCanvas(evt.clientX, evt.clientY)
																		);
																		const shapeId = symbolIdByName(
																			symbols,
																			TRIANGLE_SHAPES[rotation]
																		);
																		if (!shapeId) {
																			return;
																		}
																		attributeHandleDrag.value = { ...drag, value: rotation };
																		patchTriangleShapeLocally(doc, el.value.id, shapeId);
																	}
																}}
																onpointerup={(evt) => {
																	if (
																		finishSelectionMoveFromHandle(
																			evt,
																			dispatch,
																			doc,
																			layersInOrder.value
																		)
																	) {
																		return;
																	}

																	if (
																		evt.isPrimary &&
																		evt.currentTarget.hasPointerCapture(evt.pointerId)
																	) {
																		const rotation =
																			attributeHandleDrag.value?.value ?? triangleRotationValue;
																		commitTriangleRotation(cast, el.value, symbols, rotation);
																		attributeHandleDrag.value = undefined;
																	}
																}}
																onkeydown={(evt) => {
																	if (cancelSelectionMoveFromHandle(evt)) {
																		return;
																	}

																	if (evt.key === 'Escape' || evt.key === 'Esc') {
																		const drag = attributeHandleDrag.value;
																		if (
																			drag?.type !== 'triangle_rotation' ||
																			drag.layerId !== el.value.id
																		) {
																			return;
																		}
																		evt.stopPropagation();
																		evt.currentTarget.releasePointerCapture(
																			evt.currentTarget.currentPointerId
																		);
																		patchTriangleShapeLocally(doc, el.value.id, drag.startShapeId);
																		attributeHandleDrag.value = undefined;
																	}
																}}
															>
																<circle
																	fill="none"
																	stroke="none"
																	cursor="default"
																	pointer-events="all"
																	r={cameraScale.value * 7}
																	cx={triangleHandlePos.x}
																	cy={triangleHandlePos.y}
																/>
																<circle
																	fill="#ffeb3b"
																	stroke="#111"
																	stroke-width="1.5"
																	vector-effect="non-scaling-stroke"
																	pointer-events="none"
																	r={cameraScale.value * 4}
																	cx={triangleHandlePos.x}
																	cy={triangleHandlePos.y}
																/>
															</g>
														{/if}
													{/await}
												{/each}
											</g>
										{/if}
										{#if activeTool.value === 'edge' || activeTool.value === 'select'}
											{#await data.socket_schemas then s}
												{#await currentSyntaxValue then syntax}
													{@const selectedEdgeSourceLayerIds = read(
														L.reread(({ d, sl }) => syntaxEdgeSourceLayerIds(d, sl, syntax)),
														combine({ d: doc, sl: selectedLayers })
													)}
													{@const visibleEdgeSourceLayerIds = read(
														L.reread(({ d, inOrder }) =>
															syntaxEdgeSourceLayerIds(d, visibleLayerIds(inOrder), syntax)
														),
														combine({ d: doc, inOrder: layersInOrder })
													)}
													{#if activeTool.value === 'edge' || selectedEdgeSourceLayerIds.value.length > 0}
														<Edger
															symbols={data.symbols}
															sourceTipSymbolShapeId={activeEdgeValue(
																'source_tip_symbol_shape_id',
																syntaxEdgeTipSymbolShapeId(syntax, 'source_tip_symbol_shape_id')
															)}
															targetTipSymbolShapeId={activeEdgeValue(
																'target_tip_symbol_shape_id',
																syntaxEdgeTipSymbolShapeId(syntax, 'target_tip_symbol_shape_id')
															)}
															sourceLayerIds={activeTool.value === 'select'
																? selectedEdgeSourceLayerIds.value
																: visibleEdgeSourceLayerIds.value}
															selectionHandles={activeTool.value === 'select'}
															loop={activeEdgeCreatesLoop()}
															sockets={viewCombined(
																[
																	L.reread(({ inOrder, flatLayers, dragState, moveDelta }) =>
																		inOrder
																			.filter(R.complement(R.prop('hidden')))
																			.flatMap(({ index, id, depth, hidden }) => {
																				const el = R.find((l) => l.id === id, flatLayers);
																				const iid = el?.interface_id;
																				const semantic_tag = el?.semantic_tag;

																				if (iid) {
																					const socket_schema = s.get(iid);
																					if (!socket_schema) {
																						return [];
																					}

																					return (socket_schema.sockets ?? [])
																						.map((sock) => {
																							if (el.box) {
																								const socketBox = movedSocketBox(
																									{
																										x: el.box.position_x,
																										y: el.box.position_y,
																										width: el.box.width,
																										height: el.box.height,
																										shape: el.box.shape,
																										semantic_tag
																									},
																									id,
																									inOrder,
																									dragState,
																									moveDelta
																								);

																								return {
																									id: {
																										socket: sock.id,
																										layer: id,
																										semantic_tag,
																										stencil: socket_schema.stencil
																									},
																									socket_schema,
																									x: buildCoord(socketBox, 'x', false, sock.x),
																									y: buildCoord(socketBox, 'y', false, sock.y),
																									box: socketBox
																								};
																							} else if (el.text?.hint) {
																								const socketBox = movedSocketBox(
																									{
																										x: el.text.hint.x,
																										y: el.text.hint.y,
																										width: el.text.hint.width,
																										height: el.text.hint.height
																									},
																									id,
																									inOrder,
																									dragState,
																									moveDelta
																								);

																								return {
																									id: {
																										socket: sock.id,
																										layer: id,
																										stencil: socket_schema.stencil
																									},
																									socket_schema,
																									x: buildCoord(socketBox, 'x', false, sock.x),
																									y: buildCoord(socketBox, 'y', false, sock.y)
																								};
																							} else {
																								return null;
																							}
																						})
																						.filter(R.identity);
																				} else {
																					return [];
																				}
																			})
																	)
																],
																{
																	inOrder: layersInOrder,
																	flatLayers: read(['layers', 'items'], doc),
																	dragState: groupDrag,
																	moveDelta: groupDragDelta
																}
															)}
															{frameBoxObject}
															{frameBoxPath}
															clientToCanvas={liveLenses.clientToCanvas}
															{rotationTransform}
															{cameraScale}
															onCancelToSelect={resetToSelectTool}
															validEdge={(source, target) =>
																syntaxAllowsEdge(
																	syntax,
																	source,
																	target,
																	activeEdgeValue('semantic_tag', 'de.renew.gui.ArcConnection')
																)}
															newEdge={(e, evt) => {
																if (evt.shiftKey) {
																	e = {
																		...e,
																		source: e.target,
																		target: e.source
																	};
																}
																if (
																	syntaxAllowsEdge(
																		syntax,
																		e.source,
																		e.target,
																		activeEdgeValue('semantic_tag', 'de.renew.gui.ArcConnection')
																	)
																) {
																	dispatch('create_layer', {
																		base_layer_id: L.get('id', singleSelectedLayer.value),
																		...activeEdgePayload(),
																		source_tip_symbol_shape_id: activeEdgeValue(
																			'source_tip_symbol_shape_id',
																			syntaxEdgeTipSymbolShapeId(
																				syntax,
																				'source_tip_symbol_shape_id'
																			)
																		),
																		target_tip_symbol_shape_id: activeEdgeValue(
																			'target_tip_symbol_shape_id',
																			syntaxEdgeTipSymbolShapeId(
																				syntax,
																				'target_tip_symbol_shape_id'
																			)
																		),
																		style: activeEdgeStylePayload(),
																		waypoints: activeEdgeCreatesLoop()
																			? edgeLoopWaypoints(
																					doc.value,
																					e.source.layer,
																					e.loopPosition,
																					e.loopClick
																				)
																			: undefined,
																		semantic_tag: activeEdgeValue(
																			'semantic_tag',
																			'de.renew.gui.ArcConnection'
																		),
																		source: {
																			socket_id: e.source.socket,
																			layer_id: e.source.layer
																		},
																		target: { socket_id: e.target.socket, layer_id: e.target.layer }
																	})
																		.then(() => {
																			publishSelection(cast, [e.target.layer]);
																			resetTransientEdgeTool();
																		})
																		.catch((error) => {
																			queueError(error, 'Edge could not be created');
																		});
																}
															}}
															newEdgeNode={(e, evt) => {
																const autoNodeType = syntaxAutoEdgeNodeForSource(
																	syntax,
																	e.source,
																	activeEdgeValue('semantic_tag', 'de.renew.gui.ArcConnection')
																);

																if (autoNodeType) {
																	dispatch('create_layer', {
																		base_layer_id: L.get(
																			['id', L.valueOr(e.source.layer)],
																			singleSelectedLayer.value
																		),
																		pos: e.newTarget,
																		...autoNodeType.target,
																		with_edge: {
																			source: {
																				...autoNodeType.edge.source,
																				layer_id: e.source.layer
																			},
																			target: {
																				...autoNodeType.edge.target
																			},
																			reverse: evt.shiftKey,
																			target_tip_symbol_shape_id: activeEdgeValue(
																				'target_tip_symbol_shape_id',
																				autoNodeType.edge.target_tip_symbol_shape_id
																			),
																			source_tip_symbol_shape_id: activeEdgeValue(
																				'source_tip_symbol_shape_id',
																				autoNodeType.edge.source_tip_symbol_shape_id
																			),
																			semantic_tag: activeEdgeValue(
																				'semantic_tag',
																				autoNodeType.edge.semantic_tag
																			)
																		}
																	})
																		.then((l) => {
																			publishSelection(cast, [
																				createdAutoEdgeTargetLayerId(l, evt.shiftKey)
																			]);
																			resetTransientEdgeTool();
																		})
																		.catch((error) => {
																			queueError(error, 'Edge could not be created');
																		});
																}
															}}
														/>
													{/if}
												{/await}
											{/await}
										{/if}

										{#if activeTool.value === 'pen'}
											<Pen
												{frameBoxPath}
												clientToCanvas={liveLenses.clientToCanvas}
												{cameraScale}
												{rotationTransform}
												smoothnessAmount={penSmoothnessAmount.value}
												onDraw={(points) => {
													dispatch('create_layer', {
														base_layer_id: L.get('id', singleSelectedLayer.value),
														points,
														style: {
															smoothness: penSmoothness.value,
															smoothness_amount: penSmoothnessAmount.value
														}
													}).then((l) => {
														publishSelection(cast, [l.id]);
													});
												}}
											/>
										{/if}

										{#if activeTool.value === 'magnifier'}
											<Magnifier
												{frameBoxPath}
												clientToCanvas={liveLenses.clientToCanvas}
												cameraRotationLens={liveLenses.cameraRotationIso}
												{cameraRotation}
												onZoomDelta={navigationActions.zoomDelta}
												onZoomFrame={navigationActions.zoomFrame}
												{cameraScale}
											/>
										{/if}

										{#if activeTool.value === 'paner'}
											<Paner
												{frameBoxPath}
												clientToCanvas={liveLenses.clientToCanvas}
												onPan={navigationActions.panMove}
											/>
										{/if}

										{#if activeTool.value === 'rotator'}
											<Rotator
												{frameBoxPath}
												clientToCanvas={liveLenses.clientToCanvas}
												onRotate={navigationActions.rotate}
												{rotationTransform}
												{cameraScale}
											/>
										{/if}

										{#if activeTool.value === 'zoomer'}
											<Zoomer
												{frameBoxPath}
												clientToCanvas={liveLenses.clientToCanvas}
												onZoom={navigationActions.zoomDelta}
												{rotationTransform}
												{cameraScale}
											/>
										{/if}

										{#if activeTool.value === 'polygon'}
											<Polygon
												{frameBoxPath}
												clientToCanvas={liveLenses.clientToCanvas}
												{rotationTransform}
												{cameraScale}
												onDraw={(points, closed) => {
													dispatch('create_layer', {
														base_layer_id: L.get('id', singleSelectedLayer.value),
														points,
														cyclic: !!closed,
														style: {
															smoothness: polygonSmoothness.value,
															smoothness_amount: polygonSmoothnessAmount.value
														},
														layer_style: closed
															? {
																	background_color: '#70DB93',
																	background_opacity: '1',
																	border_color: 'black'
																}
															: undefined
													}).then((l) => {
														publishSelection(cast, [l.id]);
													});
												}}
											/>
										{/if}

										{#if activeTool.value === 'spacer'}
											<Spacer
												{frameBoxObject}
												{frameBoxPath}
												clientToCanvas={liveLenses.clientToCanvas}
												{rotationTransform}
												{cameraScale}
												makeSpace={({ base, dir, inverse }) => {
													cast('make_space', {
														base,
														dir,
														inverse
													});
												}}
											/>
										{/if}

										{#if activeTool.value === 'spline'}
											<Spline
												{frameBoxPath}
												clientToCanvas={liveLenses.clientToCanvas}
												{rotationTransform}
												{cameraScale}
												onDraw={(path) => {
													const points = splinePathToPolylinePoints(path, splineSampleCount.value);
													if (points.length < 2) {
														return;
													}

													dispatch('create_layer', {
														base_layer_id: L.get('id', singleSelectedLayer.value),
														points,
														cyclic:
															points.length > 2 &&
															Math.hypot(
																points[0].x - points[points.length - 1].x,
																points[0].y - points[points.length - 1].y
															) < 0.01,
														style: {
															smoothness: 'linear'
														}
													}).then((l) => {
														publishSelection(cast, [l.id]);
													});
												}}
											/>
										{/if}

										<MountTrigger
											onMount={() => {
												recentDocuments.value = loadRecentDocuments();
												rememberCurrentDocument();
												requestAnimationFrame(() => {
													call((c) => {
														c && c.resetCamera();
													}, cameraScroller);
												});
											}}
										/>
									{/snippet}
								</Navigator>
							</SVGViewport>
						</CameraScroller>
					</CanvasDropper>
				</div>

				<div class="topbar" use:editorDropZone={{ dispatch, cast }}>
					<div class="toolbar dense">
						{#if ['pen', 'polygon', 'spline'].includes(activeTool.value)}
							<div class="toolbar-body tool-option-toolbar">
								{#if activeTool.value === 'pen'}
									<div class="pretty-checkbox-group">
										<span class="pretty-checkbox-group-head">Pen</span>
										<div class="pretty-checkbox-group-body">
											<label class="pretty-checkbox"
												><input
													class="pretty-checkbox-control"
													type="radio"
													value="linear"
													bind:group={penSmoothness.value}
												/><svg viewBox="-16 -16 32 32" class="pretty-checkbox-label"
													><title>Raw line</title>
													<path
														stroke="currentColor"
														stroke-width="5"
														d="M-12,-12L5,-4L-5,4L12,12"
														fill="none"
													/>
												</svg></label
											>
											<label class="pretty-checkbox"
												><input
													class="pretty-checkbox-control"
													type="radio"
													value="autobezier"
													bind:group={penSmoothness.value}
												/><svg viewBox="-16 -16 32 32" class="pretty-checkbox-label"
													><title>Smooth line</title>
													<path
														stroke="currentColor"
														stroke-width="5"
														d="M-12,-12  C 32,-7  -32,7  12,12"
														fill="none"
													/>
												</svg></label
											>
											<label class="pretty-number">
												<span class="pretty-number-label">Smoothness</span>
												<input
													class="pretty-number-control"
													type="range"
													min="0"
													max="100"
													step="1"
													disabled={penSmoothness.value !== 'autobezier'}
													bind:value={penSmoothnessAmount.value}
												/>
											</label>
										</div>
									</div>
								{/if}
								{#if activeTool.value === 'polygon'}
									<div class="pretty-checkbox-group">
										<span class="pretty-checkbox-group-head">Polygon</span>
										<div class="pretty-checkbox-group-body">
											<label class="pretty-checkbox"
												><input
													class="pretty-checkbox-control"
													type="radio"
													value="linear"
													bind:group={polygonSmoothness.value}
												/><svg viewBox="-16 -16 32 32" class="pretty-checkbox-label"
													><title>Raw line</title>
													<path
														stroke="currentColor"
														stroke-width="5"
														d="M-12,-12L5,-4L-5,4L12,12"
														fill="none"
													/>
												</svg></label
											>
											<label class="pretty-checkbox"
												><input
													class="pretty-checkbox-control"
													type="radio"
													value="autobezier"
													bind:group={polygonSmoothness.value}
												/><svg viewBox="-16 -16 32 32" class="pretty-checkbox-label"
													><title>Smooth line</title>
													<path
														stroke="currentColor"
														stroke-width="5"
														d="M-12,-12  C 32,-7  -32,7  12,12"
														fill="none"
													/>
												</svg></label
											>
											<label class="pretty-number">
												<span class="pretty-number-label">Smoothness</span>
												<input
													class="pretty-number-control"
													type="range"
													min="0"
													max="100"
													step="1"
													disabled={polygonSmoothness.value !== 'autobezier'}
													bind:value={polygonSmoothnessAmount.value}
												/>
											</label>
										</div>
									</div>
								{/if}
								{#if activeTool.value === 'spline'}
									<label class="pretty-number">
										<span class="pretty-number-label">Curve samples</span>
										<input
											class="pretty-number-control"
											type="range"
											min="4"
											max="32"
											step="1"
											bind:value={splineSampleCount.value}
										/>
									</label>
								{/if}
							</div>
						{/if}

						{#snippet edgeProps()}
							{@const isCyclic = view(['edge', 'cyclic', L.valueOr(false)], singleSelectedLayer)}

							<label class="pretty-number attribute-icon-number" data-icon="|">
								<span class="pretty-number-label">Stroke</span>
								<input
									type="number"
									class="pretty-number-control"
									size="4"
									min="0"
									onchange={(evt) =>
										cast('change_style', {
											layer_id: singleSelectedLayer.value.id,
											type: 'edge',
											attr: 'stroke_width',
											val: evt.currentTarget.value
										})}
									use:bindValue={view(
										['edge', 'style', 'stroke_width', L.valueOr('1')],
										singleSelectedLayer
									)}
								/>
							</label>
							{@const strokeColor = view(
								['edge', 'style', 'stroke_color', L.valueOr('#000000')],
								singleSelectedLayer
							)}
							<label class="pretty-color">
								<span class="pretty-color-label">Line Color</span>
								<svg
									preserveAspectRatio="xMinYMid meet"
									class="pretty-color-value"
									style:color={strokeColor.value}
									viewBox="-16 -16 32 32"
								>
									<path
										stroke="currentColor"
										stroke-width="8"
										d="M-12,0C0,-12,12,12,24,0"
										fill="none"
									/>
								</svg>

								<input
									type="color"
									alpha
									class="pretty-color-control"
									onchange={(evt) =>
										cast('change_style', {
											layer_id: singleSelectedLayer.value.id,
											type: 'edge',
											attr: 'stroke_color',
											val: evt.currentTarget.value
										})}
									use:bindValue={view(forceHex, strokeColor)}
								/>
							</label>

							{@const strokeOpacityValue = view(
								[
									'edge',
									'style',
									'stroke_opacity',
									L.rewrite(R.clamp(0, 1)),
									L.valueOr(1),
									L.reread((num) => (Math.round(num * 100) / 100).toFixed(2))
								],
								singleSelectedLayer
							)}
							<label class="pretty-number attribute-icon-number" data-icon="%" title="Opacity">
								<span class="pretty-number-label">Line Opacity</span>
								<input
									type="number"
									class="pretty-number-control"
									size="4"
									min="0"
									max="1"
									step="0.01"
									onchange={(evt) => {
										strokeOpacityValue.value = evt.currentTarget.valueAsNumber;
										cast('change_style', {
											layer_id: singleSelectedLayer.value.id,
											type: 'edge',
											attr: 'stroke_opacity',
											val: strokeOpacityValue.value
										});
									}}
									use:bindNumericValue={strokeOpacityValue}
								/>
							</label>

							{@const opacityValueStrict = view(
								[
									'style',
									'opacity',
									L.rewrite(R.clamp(0, 1)),
									L.valueOr(1),
									L.reread((num) => (Math.round(num * 100) / 100).toFixed(2))
								],
								singleSelectedLayer
							)}
							<label class="pretty-number attribute-icon-number" data-icon="%">
								<span class="pretty-number-label">Opacity</span>
								<input
									type="number"
									class="pretty-number-control"
									size="4"
									min="0"
									max="1"
									step="0.01"
									onchange={(evt) => {
										opacityValueStrict.value = evt.currentTarget.valueAsNumber;
										cast('change_style', {
											layer_id: singleSelectedLayer.value.id,
											type: 'layer',
											attr: 'opacity',
											val: opacityValueStrict.value
										});
									}}
									use:bindNumericValue={opacityValueStrict}
								/>
							</label>

							{@const sourceTipShapeValue = view(
								['edge', 'style', 'source_tip_symbol_shape_id', L.valueOr(''), L.defaults('')],
								singleSelectedLayer
							)}

							<label class="pretty-select" title="Shape">
								<span class="pretty-select-label">Source Tip</span>
								<span class="pretty-select-value attribute-symbol-value">
									<svg viewBox="-16 -16 32 32" aria-hidden="true">
										<path d="M12,-8L-8,0L12,8" fill="currentColor" />
										<path d="M-12,0L10,0" stroke="currentColor" stroke-width="3" fill="none" />
									</svg>
								</span>
								<select
									class="pretty-select-control"
									onchange={(evt) =>
										cast('change_style', {
											layer_id: singleSelectedLayer.value.id,
											type: 'edge',
											attr: 'source_tip_symbol_shape_id',
											val: evt.currentTarget.value
										})}
									use:bindValue={sourceTipShapeValue}
								>
									{#await data.symbols then symbols}
										<option value="">None</option>
										{@const symbolGroups = R.groupBy(([id, symbol]) => {
											return symbol.name.split('-', 2)[0];
										}, symbols.entries())}
										{#each Object.entries(symbolGroups) as [g, s] (g)}
											<optgroup label={g}>
												{#each s as [id, symbol] (id)}
													<option value={id}>{symbol.name}</option>
												{/each}
											</optgroup>
										{/each}
									{/await}
								</select>
							</label>

							{@const sourceTipSize = view(
								[
									'edge',
									'style',
									'source_tip_size',
									L.rewrite(R.clamp(0, 10)),
									L.valueOr(1),
									L.reread((num) => (Math.round(num * 100) / 100).toFixed(2))
								],
								singleSelectedLayer
							)}
							<label class="pretty-number attribute-icon-number" data-icon="<">
								<span class="pretty-number-label">Source Tip Size</span>
								<input
									type="number"
									class="pretty-number-control"
									size="3"
									min="0"
									max="10"
									step="0.01"
									onchange={(evt) => {
										sourceTipSize.value = evt.currentTarget.valueAsNumber;
										cast('change_style', {
											layer_id: singleSelectedLayer.value.id,
											type: 'edge',
											attr: 'source_tip_size',
											val: sourceTipSize.value
										});
									}}
									use:bindNumericValue={sourceTipSize}
								/>
							</label>

							{@const strokeDashValue = view(
								['edge', 'style', 'stroke_dash_array', L.valueOr('')],
								singleSelectedLayer
							)}
							<label class="pretty-select">
								<span class="pretty-select-label">Dash</span>
								<span class="pretty-select-value attribute-symbol-value">
									<svg viewBox="-16 -16 32 32" aria-hidden="true">
										<path
											d="M-13,0H13"
											stroke="currentColor"
											stroke-width="3"
											stroke-dasharray="5 4"
										/>
									</svg>
								</span>
								<select
									class="pretty-select-control"
									onchange={(evt) =>
										cast('change_style', {
											layer_id: singleSelectedLayer.value.id,
											type: 'edge',
											attr: 'stroke_dash_array',
											val: evt.currentTarget.value
										})}
									use:bindValue={strokeDashValue}
								>
									<option value="">No Dash</option>
									<option value="5 5">5 5</option>
									<option value="10 5">10 5</option>
									<option value="2 2">2 2</option>
								</select>
							</label>
							{@const targetTipShapeValue = view(
								['edge', 'style', 'target_tip_symbol_shape_id', L.valueOr(''), L.defaults('')],
								singleSelectedLayer
							)}

							<label class="pretty-select">
								<span class="pretty-select-label">Target Tip</span>
								<span class="pretty-select-value attribute-symbol-value">
									<svg viewBox="-16 -16 32 32" aria-hidden="true">
										<path d="M-12,-8L8,0L-12,8" fill="currentColor" />
										<path d="M-10,0L12,0" stroke="currentColor" stroke-width="3" fill="none" />
									</svg>
								</span>
								<select
									class="pretty-select-control"
									onchange={(evt) =>
										cast('change_style', {
											layer_id: singleSelectedLayer.value.id,
											type: 'edge',
											attr: 'target_tip_symbol_shape_id',
											val: evt.currentTarget.value
										})}
									use:bindValue={targetTipShapeValue}
								>
									{#await data.symbols then symbols}
										<option value="">None</option>
										{@const symbolGroups = R.groupBy(([id, symbol]) => {
											return symbol.name.split('-', 2)[0];
										}, symbols.entries())}
										{#each Object.entries(symbolGroups) as [g, s] (g)}
											<optgroup label={g}>
												{#each s as [id, symbol] (id)}
													<option value={id}>{symbol.name}</option>
												{/each}
											</optgroup>
										{/each}
									{/await}
								</select>
							</label>

							{@const targetTipSize = view(
								[
									'edge',
									'style',
									'target_tip_size',
									L.rewrite(R.clamp(0, 10)),
									L.valueOr(1),
									L.reread((num) => (Math.round(num * 100) / 100).toFixed(2))
								],
								singleSelectedLayer
							)}
							<label class="pretty-number attribute-icon-number" data-icon=">">
								<span class="pretty-number-label">Target Tip Size</span>
								<input
									type="number"
									class="pretty-number-control"
									size="3"
									min="0"
									max="10"
									step="0.01"
									onchange={(evt) => {
										targetTipSize.value = evt.currentTarget.valueAsNumber;
										cast('change_style', {
											layer_id: singleSelectedLayer.value.id,
											type: 'edge',
											attr: 'target_tip_size',
											val: targetTipSize.value
										});
									}}
									use:bindNumericValue={targetTipSize}
								/>
							</label>

							{@const smoothnessValue = view(
								['edge', 'style', 'smoothness', L.valueOr('linear')],
								singleSelectedLayer
							)}
							{@const smoothnessAmountValue = view(
								['edge', 'style', 'smoothness_amount', L.rewrite(R.clamp(0, 100)), L.valueOr(50)],
								singleSelectedLayer
							)}

							<div class="pretty-checkbox-group">
								<span class="pretty-checkbox-group-head">smoothness</span>
								<div class="pretty-checkbox-group-body">
									<label class="pretty-checkbox"
										><input
											class="pretty-checkbox-control"
											type="radio"
											value="linear"
											bind:group={smoothnessValue.value}
											onchange={(evt) => {
												if (evt.currentTarget.checked) {
													cast('change_style', {
														layer_id: singleSelectedLayer.value.id,
														type: 'edge',
														attr: 'smoothness',
														val: evt.currentTarget.value
													});
												}
											}}
										/><svg viewBox="-16 -16 32 32" class="pretty-checkbox-label"
											><title>Left</title>
											<path
												stroke="currentColor"
												stroke-width="5"
												d="M-12,-12L5,-4L-5,4L12,12"
												fill="none"
											/>
										</svg></label
									>

									<label class="pretty-checkbox"
										><input
											class="pretty-checkbox-control"
											type="radio"
											value="autobezier"
											bind:group={smoothnessValue.value}
											onchange={(evt) => {
												if (evt.currentTarget.checked) {
													cast('change_style', {
														layer_id: singleSelectedLayer.value.id,
														type: 'edge',
														attr: 'smoothness',
														val: evt.currentTarget.value
													});
												}
											}}
										/><svg viewBox="-16 -16 32 32" class="pretty-checkbox-label"
											><title>Left</title>
											<path
												stroke="currentColor"
												stroke-width="5"
												d="M-12,-12  C 32,-7  -32,7  12,12"
												fill="none"
											/>
										</svg></label
									>
								</div>
							</div>
							<label class="pretty-number attribute-icon-number" data-icon="~">
								<span class="pretty-number-label">Smoothness</span>
								<input
									type="range"
									class="pretty-number-control"
									min="0"
									max="100"
									step="1"
									disabled={smoothnessValue.value !== 'autobezier'}
									onchange={(evt) => {
										smoothnessAmountValue.value = evt.currentTarget.valueAsNumber;
										cast('change_style', {
											layer_id: singleSelectedLayer.value.id,
											type: 'edge',
											attr: 'smoothness_amount',
											val: smoothnessAmountValue.value
										});
									}}
									use:bindNumericValue={smoothnessAmountValue}
								/>
							</label>
							{@const strokeJoinValue = view(
								['edge', 'style', 'stroke_join', L.valueOr('miter')],
								singleSelectedLayer
							)}

							<div class="pretty-checkbox-group">
								<span class="pretty-checkbox-group-head">Join</span>
								<div class="pretty-checkbox-group-body">
									<label class="pretty-checkbox"
										><input
											class="pretty-checkbox-control"
											type="radio"
											value="miter"
											bind:group={strokeJoinValue.value}
											onchange={(evt) => {
												if (evt.currentTarget.checked) {
													cast('change_style', {
														layer_id: singleSelectedLayer.value.id,
														type: 'edge',
														attr: 'stroke_join',
														val: evt.currentTarget.value
													});
												}
											}}
										/><svg viewBox="-16 -16 32 32" class="pretty-checkbox-label"
											><title>miter</title>

											<path
												stroke="currentColor"
												stroke-width="10"
												d="M-10,-10L6,0L-10,10"
												fill="none"
												stroke-linejoin="miter"
											/>
										</svg></label
									>

									<label class="pretty-checkbox"
										><input
											class="pretty-checkbox-control"
											type="radio"
											value="bevel"
											bind:group={strokeJoinValue.value}
											onchange={(evt) => {
												if (evt.currentTarget.checked) {
													cast('change_style', {
														layer_id: singleSelectedLayer.value.id,
														type: 'edge',
														attr: 'stroke_join',
														val: evt.currentTarget.value
													});
												}
											}}
										/><svg viewBox="-16 -16 32 32" class="pretty-checkbox-label"
											><title>bevel</title>

											<path
												stroke="currentColor"
												stroke-width="10"
												d="M-10,-10L6,0L-10,10"
												fill="none"
												stroke-linejoin="bevel"
											/>
										</svg></label
									>

									<label class="pretty-checkbox"
										><input
											class="pretty-checkbox-control"
											type="radio"
											value="round"
											bind:group={strokeJoinValue.value}
											onchange={(evt) => {
												if (evt.currentTarget.checked) {
													cast('change_style', {
														layer_id: singleSelectedLayer.value.id,
														type: 'edge',
														attr: 'stroke_join',
														val: evt.currentTarget.value
													});
												}
											}}
										/><svg viewBox="-16 -16 32 32" class="pretty-checkbox-label"
											><title>round</title>

											<path
												stroke="currentColor"
												stroke-width="10"
												d="M-10,-10L6,0L-10,10"
												fill="none"
												stroke-linejoin="round"
											/>
										</svg></label
									>
								</div>
							</div>

							{@const strokeCapValue = view(
								['edge', 'style', 'stroke_cap', L.valueOr('butt')],
								singleSelectedLayer
							)}
							<div class="pretty-checkbox-group">
								<span class="pretty-checkbox-group-head">Cap</span>
								<div class="pretty-checkbox-group-body">
									<label class="pretty-checkbox"
										><input
											class="pretty-checkbox-control"
											type="radio"
											value="butt"
											bind:group={strokeCapValue.value}
											onchange={(evt) => {
												if (evt.currentTarget.checked) {
													cast('change_style', {
														layer_id: singleSelectedLayer.value.id,
														type: 'edge',
														attr: 'stroke_cap',
														val: evt.currentTarget.value
													});
												}
											}}
										/><svg viewBox="-16 -16 32 32" class="pretty-checkbox-label"
											><title>butt</title>

											<path
												stroke="currentColor"
												stroke-width="10"
												d="M-10,-10L10,10"
												fill="none"
												stroke-linecap="butt"
											/>
										</svg></label
									>

									<label class="pretty-checkbox"
										><input
											class="pretty-checkbox-control"
											type="radio"
											value="square"
											bind:group={strokeCapValue.value}
											onchange={(evt) => {
												if (evt.currentTarget.checked) {
													cast('change_style', {
														layer_id: singleSelectedLayer.value.id,
														type: 'edge',
														attr: 'stroke_cap',
														val: evt.currentTarget.value
													});
												}
											}}
										/><svg viewBox="-16 -16 32 32" class="pretty-checkbox-label"
											><title>square</title>

											<path
												stroke="currentColor"
												stroke-width="10"
												d="M-10,-10L10,10"
												fill="none"
												stroke-linecap="square"
											/>
										</svg></label
									>

									<label class="pretty-checkbox"
										><input
											class="pretty-checkbox-control"
											type="radio"
											value="round"
											bind:group={strokeCapValue.value}
											onchange={(evt) => {
												if (evt.currentTarget.checked) {
													cast('change_style', {
														layer_id: singleSelectedLayer.value.id,
														type: 'edge',
														attr: 'stroke_cap',
														val: evt.currentTarget.value
													});
												}
											}}
										/><svg viewBox="-16 -16 32 32" class="pretty-checkbox-label"
											><title>round</title>

											<path
												stroke="currentColor"
												stroke-width="10"
												d="M-10,-10L10,10"
												fill="none"
												stroke-linecap="round"
											/>
										</svg></label
									>
								</div>
							</div>

							<label class="pretty-checkbox"
								><input
									class="pretty-checkbox-control"
									bind:checked={isCyclic.value}
									onchange={(evt) => {
										cast('change_edge_attributes', {
											layer_id: singleSelectedLayer.value.id,
											attrs: {
												cyclic: evt.currentTarget.checked
											}
										});
									}}
									type="checkbox"
								/><svg viewBox="-16 -16 32 32" class="pretty-checkbox-label"
									><title>Cyclic</title>
									<text
										text-anchor="middle"
										dominant-baseline="middle"
										x="0"
										y="2"
										font-size="20"
										fill="currentColor"
										font-weight="bold">C</text
									>
								</svg></label
							>

							{@const backgroundColorValue = view(
								['style', 'background_color', L.defaults('transparent')],
								singleSelectedLayer
							)}
							<div class="pretty-color-group">
								<label class="pretty-color">
									<span class="pretty-color-label">Fill</span>

									<input
										type="color"
										alpha
										class="pretty-color-control"
										onchange={(evt) =>
											cast('change_style', {
												layer_id: singleSelectedLayer.value.id,
												type: 'layer',
												attr: 'background_color',
												val: evt.currentTarget.value
											})}
										use:bindValue={view(forceHex, backgroundColorValue)}
									/>
									<svg
										preserveAspectRatio="xMinYMid meet"
										class="pretty-color-value"
										style:color={backgroundColorValue.value}
										viewBox="0 0 32 32"
									>
										<rect
											fill="currentColor"
											stroke-width="6"
											x="0"
											y="0"
											width="32"
											height="32"
											stroke="#eee"
											class="swatch-rect"
										></rect>

										{#if !backgroundColorValue.value}
											<path line-joincap="round" stroke-width="4" d="M6 6 l 20 20 " stroke="red" />
										{/if}
									</svg>
								</label>
								<button
									class="pretty-color-reset"
									disabled={!backgroundColorValue.value}
									onclick={(e) => {
										backgroundColorValue.value = null;
										cast('change_style', {
											layer_id: singleSelectedLayer.value.id,
											type: 'layer',
											attr: 'background_color',
											val: null
										});
									}}
								>
									<svg
										preserveAspectRatio="xMinYMid meet"
										class="pretty-color-value"
										viewBox="0 0 32 32"
									>
										<titel>Reset Color</titel>
										<path
											line-joincap="round"
											stroke-width="4"
											d="M11 11 l 10 10 M 11 21 l 10 -10"
											stroke="red"
										/>
									</svg>
								</button>
							</div>

							<button
								onclick={() => {
									dispatch('change_edge_direction', {
										layer_id: singleSelectedLayer.value.id
									});
								}}
								class="action-button">Reverse</button
							>
						{/snippet}
						{#snippet boxProps()}
							{@const shapeValue = view(
								['box', 'shape', L.valueOr(''), L.defaults('')],
								singleSelectedLayer
							)}
							<label class="pretty-select">
								<span class="pretty-select-label">Shape</span>
								<span class="pretty-select-value attribute-symbol-value">
									<svg viewBox="-16 -16 32 32" aria-hidden="true">
										<rect
											x="-10"
											y="-8"
											width="20"
											height="16"
											fill="none"
											stroke="currentColor"
											stroke-width="3"
										/>
									</svg>
								</span>
								<select
									class="pretty-select-control"
									onchange={(evt) =>
										cast('change_layer_shape', {
											layer_id: singleSelectedLayer.value.id,
											shape_id: evt.currentTarget.value
										})}
									use:bindValue={shapeValue}
								>
									{#await data.symbols then symbols}
										<option value="">None</option>
										{@const symbolGroups = R.groupBy(([id, symbol]) => {
											return symbol.name.split('-', 2)[0];
										}, symbols.entries())}
										{#each Object.entries(symbolGroups) as [g, s] (g)}
											<optgroup label={g}>
												{#each s as [id, symbol] (id)}
													<option value={id}>{symbol.name}</option>
												{/each}
											</optgroup>
										{/each}
									{/await}
								</select>
							</label>
							{@render commonProps(L.valueOr('#70DB93'), L.valueOr('#000000'), L.valueOr(1))}
						{/snippet}

						{#snippet commonProps(defaultBackground, defaultStroke, defaultBorderWith)}
							{@const backgroundColorValue = view(
								['style', 'background_color', defaultBackground],
								singleSelectedLayer
							)}
							<div class="pretty-color-group">
								<label class="pretty-color">
									<span class="pretty-color-label">Fill</span>

									<input
										type="color"
										alpha
										class="pretty-color-control"
										onchange={(evt) =>
											cast('change_style', {
												layer_id: singleSelectedLayer.value.id,
												type: 'layer',
												attr: 'background_color',
												val: evt.currentTarget.value
											})}
										use:bindValue={view(forceHex, backgroundColorValue)}
									/>
									<svg
										preserveAspectRatio="xMinYMid meet"
										class="pretty-color-value"
										style:color={backgroundColorValue.value}
										viewBox="0 0 32 32"
									>
										<rect
											fill="currentColor"
											stroke-width="6"
											x="0"
											y="0"
											width="32"
											height="32"
											stroke="#eee"
											class="swatch-rect"
										></rect>

										{#if backgroundColorValue.value == 'transparent'}
											<path line-joincap="round" stroke-width="4" d="M6 6 l 20 20 " stroke="red" />
										{/if}
									</svg>
								</label>
								<button
									class="pretty-color-reset"
									disabled={backgroundColorValue.value === 'transparent'}
									onclick={(e) => {
										backgroundColorValue.value = 'transparent';
										cast('change_style', {
											layer_id: singleSelectedLayer.value.id,
											type: 'layer',
											attr: 'background_color',
											val: 'transparent'
										});
									}}
								>
									<svg
										preserveAspectRatio="xMinYMid meet"
										class="pretty-color-value"
										viewBox="0 0 32 32"
									>
										<titel>Reset Color</titel>
										<path
											line-joincap="round"
											stroke-width="4"
											d="M11 11 l 10 10 M 11 21 l 10 -10"
											stroke="red"
										/>
									</svg>
								</button>
							</div>
							{@const backgroundOpacityValue = view(
								[
									'style',
									'background_opacity',
									L.rewrite(R.clamp(0, 1)),
									L.valueOr(1),
									L.reread((num) => (Math.round(num * 100) / 100).toFixed(2))
								],
								singleSelectedLayer
							)}
							<label class="pretty-number attribute-icon-number" data-icon="%">
								<span class="pretty-number-label">Fill Opacity</span>
								<input
									type="number"
									class="pretty-number-control"
									size="4"
									min="0"
									max="1"
									step="0.01"
									onchange={(evt) => {
										backgroundOpacityValue.value = evt.currentTarget.valueAsNumber;
										cast('change_style', {
											layer_id: singleSelectedLayer.value.id,
											type: 'layer',
											attr: 'background_opacity',
											val: backgroundOpacityValue.value
										});
									}}
									use:bindNumericValue={backgroundOpacityValue}
								/>
							</label>
							{@const borderColorValue = view(
								['style', 'border_color', defaultStroke],
								singleSelectedLayer
							)}
							<div class="pretty-color-group">
								<label class="pretty-color">
									<span class="pretty-color-label">Strk</span>

									<input
										type="color"
										alpha
										class="pretty-color-control"
										onchange={(evt) =>
											cast('change_style', {
												layer_id: singleSelectedLayer.value.id,
												type: 'layer',
												attr: 'border_color',
												val: evt.currentTarget.value
											})}
										use:bindValue={view(forceHex, borderColorValue)}
									/>
									<svg
										preserveAspectRatio="xMinYMid meet"
										class="pretty-color-value"
										style:color={borderColorValue.value}
										viewBox="0 0 32 32"
									>
										<rect
											class="swatch-rect"
											stroke="#eee"
											stroke-width="4"
											x="4"
											y="4"
											width="26"
											height="26"
											fill="none"
											stroke-dasharray="1 7"
											stroke-dashoffset="1"
											rx="3"
											ry="3"
										></rect>
										<rect
											stroke="currentColor"
											stroke-width="4"
											x="4"
											y="4"
											width="26"
											height="26"
											fill="none"
										></rect>

										{#if borderColorValue.value == 'transparent'}
											<path line-joincap="round" stroke-width="4" d="M6 6 l 20 20 " stroke="red" />
										{/if}
									</svg>
								</label>

								<button
									class="pretty-color-reset"
									disabled={borderColorValue.value === 'transparent'}
									onclick={(e) => {
										borderColorValue.value = 'transparent';
										cast('change_style', {
											layer_id: singleSelectedLayer.value.id,
											type: 'layer',
											attr: 'border_color',
											val: 'transparent'
										});
									}}
								>
									<svg
										preserveAspectRatio="xMinYMid meet"
										class="pretty-color-value"
										viewBox="0 0 32 32"
									>
										<titel>Reset Color</titel>
										<path
											line-joincap="round"
											stroke-width="4"
											d="M11 11 l 10 10 M 11 21 l 10 -10"
											stroke="red"
										/>
									</svg>
								</button>
							</div>
							{@const borderOpacityValue = view(
								[
									'style',
									'border_opacity',
									L.rewrite(R.clamp(0, 1)),
									L.valueOr(1),
									L.reread((num) => (Math.round(num * 100) / 100).toFixed(2))
								],
								singleSelectedLayer
							)}
							<label class="pretty-number attribute-icon-number" data-icon="%">
								<span class="pretty-number-label">Pen Opacity</span>
								<input
									type="number"
									class="pretty-number-control"
									size="4"
									min="0"
									max="1"
									step="0.01"
									onchange={(evt) => {
										borderOpacityValue.value = evt.currentTarget.valueAsNumber;
										cast('change_style', {
											layer_id: singleSelectedLayer.value.id,
											type: 'layer',
											attr: 'border_opacity',
											val: borderOpacityValue.value
										});
									}}
									use:bindNumericValue={borderOpacityValue}
								/>
							</label>
							{@const opacityValueStrict = view(
								[
									'style',
									'opacity',
									L.rewrite(R.clamp(0, 1)),
									L.valueOr(1),
									L.reread((num) => (Math.round(num * 100) / 100).toFixed(2))
								],
								singleSelectedLayer
							)}
							<label class="pretty-number attribute-icon-number" data-icon="%">
								<span class="pretty-number-label">Opacity</span>
								<input
									type="number"
									class="pretty-number-control"
									size="4"
									min="0"
									max="1"
									step="0.01"
									onchange={(evt) => {
										opacityValueStrict.value = evt.currentTarget.valueAsNumber;
										cast('change_style', {
											layer_id: singleSelectedLayer.value.id,
											type: 'layer',
											attr: 'opacity',
											val: opacityValueStrict.value
										});
									}}
									use:bindNumericValue={opacityValueStrict}
								/>
							</label>
							{@const dashValue = view(
								['style', 'border_dash_array', L.valueOr('')],
								singleSelectedLayer
							)}
							<label class="pretty-select">
								<span class="pretty-select-label">Dash</span>
								<span class="pretty-select-value attribute-symbol-value">
									<svg viewBox="-16 -16 32 32" aria-hidden="true">
										<path
											d="M-13,0H13"
											stroke="currentColor"
											stroke-width="3"
											stroke-dasharray="5 4"
										/>
									</svg>
								</span>
								<select
									class="pretty-select-control"
									onchange={(evt) =>
										cast('change_style', {
											layer_id: singleSelectedLayer.value.id,
											type: 'layer',
											attr: 'border_dash_array',
											val: evt.currentTarget.value
										})}
									use:bindValue={dashValue}
								>
									<option value="">No Dash</option>
									<option value="5 5">5 5</option>
									<option value="10 5">10 5</option>
									<option value="2 2">2 2</option>
								</select>
							</label>
							<label class="pretty-number attribute-icon-number" data-icon="|">
								<span class="pretty-number-label">Stroke</span>
								<input
									type="number"
									class="pretty-number-control"
									size="4"
									min="0"
									onchange={(evt) =>
										cast('change_style', {
											layer_id: singleSelectedLayer.value.id,
											type: 'layer',
											attr: 'border_width',
											val: evt.currentTarget.value
										})}
									use:bindValue={view(
										['style', 'border_width', defaultBorderWith],
										singleSelectedLayer
									)}
								/>
							</label>
						{/snippet}
						{#snippet groupProps()}
							Group
						{/snippet}
						{#snippet textProps()}
							{@const textTypeValue = view(
								['text', 'renew_type', L.valueOr(RENEW_TEXT_TYPE.LABEL)],
								singleSelectedLayer
							)}
							{@const fontFamily = view(['text', 'style', 'font_family'], singleSelectedLayer)}
							{@const bold = view(['text', 'style', 'bold', L.valueOr(false)], singleSelectedLayer)}
							{@const italic = view(
								['text', 'style', 'italic', L.valueOr(false)],
								singleSelectedLayer
							)}
							{@const underline = view(
								['text', 'style', 'underline', L.valueOr(false)],
								singleSelectedLayer
							)}
							<label class="pretty-select">
								<span class="pretty-select-label">Text Type</span>
								<span class="pretty-select-value attribute-symbol-value attribute-symbol-text"
									>T</span
								>
								<select
									class="pretty-select-control"
									onchange={(evt) => {
										const renewType = Number(evt.currentTarget.value);
										textTypeValue.value = renewType;
										cast('change_text_type', {
											layer_id: singleSelectedLayer.value.id,
											renew_type: renewType
										});
									}}
									use:bindValue={textTypeValue}
								>
									{#each [{ label: 'Label', value: RENEW_TEXT_TYPE.LABEL }, { label: 'Inscription', value: RENEW_TEXT_TYPE.INSCRIPTION }, { label: 'Name', value: RENEW_TEXT_TYPE.NAME }, { label: 'Declaration', value: RENEW_TEXT_TYPE.AUX }, { label: 'Comment', value: RENEW_TEXT_TYPE.COMM }] as { label, value }}
										<option {value}>{label}</option>
									{/each}
								</select>
							</label>
							<label class="pretty-select">
								<span class="pretty-select-label">Font Family</span>
								<span
									style:font-family={fontFamily.value}
									class="pretty-select-value attribute-symbol-value attribute-symbol-text">A</span
								>
								<select
									class="pretty-select-control"
									onchange={(evt) =>
										cast('change_style', {
											layer_id: singleSelectedLayer.value.id,
											type: 'text',
											attr: 'font_family',
											val: evt.currentTarget.value
										})}
									use:bindValue={fontFamily}
								>
									<option style:font-family={'sans-serif'} value="sans-serif">sans-serif</option>
									<option style:font-family={'serif'} value="serif">serif</option>
									<option style:font-family={'monospace'} value="monospace">monospace</option>
									<option style:font-family={'Dialog, sans-serif'} value="Dialog, sans-serif"
										>Dialog</option
									>
									<option
										style:font-family={'Helvetica, Arial, sans-serif'}
										value="Helvetica, Arial, sans-serif">Helvetica</option
									>
									<option
										style:font-family={'Times New Roman, Times, serif'}
										value={'"Times New Roman", Times, serif'}>Times</option
									>
									<option
										style:font-family={'Courier New, Courier, monospace'}
										value={'"Courier New", Courier, monospace'}>Courier</option
									>
								</select>
							</label>
							<label class="pretty-number attribute-icon-number" data-icon="A">
								<span class="pretty-number-label">Size</span>
								<AttributeInput
									cmd="change_style"
									type="text"
									attr="font_size"
									{cast}
									path={['text', 'style', 'font_size']}
									{singleSelectedLayer}
									{optimisticValue}
								/>
							</label>

							<div class="pretty-checkbox-group">
								<span class="pretty-checkbox-group-head">Style</span>
								<div class="pretty-checkbox-group-body">
									<label class="pretty-checkbox"
										><input
											class="pretty-checkbox-control"
											onchange={(evt) =>
												cast('change_style', {
													layer_id: singleSelectedLayer.value.id,
													type: 'text',
													attr: 'bold',
													val: evt.currentTarget.checked
												})}
											type="checkbox"
											bind:checked={bold.value}
										/><svg viewBox="-16 -16 32 32" class="pretty-checkbox-label"
											><title>Bold</title>
											<text
												text-anchor="middle"
												dominant-baseline="middle"
												x="0"
												y="2"
												font-size="20"
												fill="currentColor"
												stroke="none"
												font-weight="bold">B</text
											>
										</svg></label
									>
									<label class="pretty-checkbox"
										><input
											class="pretty-checkbox-control"
											type="checkbox"
											onchange={(evt) =>
												cast('change_style', {
													layer_id: singleSelectedLayer.value.id,
													type: 'text',
													attr: 'italic',
													val: evt.currentTarget.checked
												})}
											bind:checked={italic.value}
										/><svg viewBox="-16 -16 32 32" class="pretty-checkbox-label"
											><title>Italic</title>
											<text
												text-anchor="middle"
												dominant-baseline="middle"
												x="0"
												y="2"
												font-size="20"
												fill="currentColor"
												stroke="none"
												font-style="italic">I</text
											>
										</svg></label
									>
									<label class="pretty-checkbox"
										><input
											class="pretty-checkbox-control"
											type="checkbox"
											onchange={(evt) =>
												cast('change_style', {
													layer_id: singleSelectedLayer.value.id,
													type: 'text',
													attr: 'underline',
													val: evt.currentTarget.checked
												})}
											bind:checked={underline.value}
										/><svg viewBox="-16 -16 32 32" class="pretty-checkbox-label"
											><title>Underline</title>
											<text
												text-anchor="middle"
												dominant-baseline="middle"
												x="0"
												y="2"
												font-size="20"
												fill="currentColor"
												stroke="none"
												text-decoration="underline">U</text
											>
										</svg></label
									>
								</div>
							</div>

							{@const breakValue = view(
								['text', 'style', 'blank_lines', L.valueOr(false)],
								singleSelectedLayer
							)}
							<div class="pretty-checkbox-group">
								<span class="pretty-checkbox-group-head">Breaks</span>
								<div class="pretty-checkbox-group-body">
									<label class="pretty-checkbox"
										><input
											class="pretty-checkbox-control"
											type="checkbox"
											value="round"
											bind:checked={breakValue.value}
											onchange={(evt) => {
												cast('change_style', {
													layer_id: singleSelectedLayer.value.id,
													type: 'text',
													attr: 'blank_lines',
													val: evt.currentTarget.checked
												});
											}}
										/><svg viewBox="-16 -16 32 32" class="pretty-checkbox-label"
											><title>lines</title><text
												text-anchor="middle"
												dominant-baseline="middle"
												x="0"
												y="0"
												font-size="20"
												fill="currentColor"
												font-weight="bold">¶</text
											>
										</svg></label
									>
								</div>
							</div>

							{@const textColor = view(['text', 'style', 'text_color'], singleSelectedLayer)}
							<label class="pretty-color">
								<span class="pretty-color-label">Color</span>
								<svg
									preserveAspectRatio="xMinYMid meet"
									class="pretty-color-value"
									style:color={textColor.value}
									viewBox="-16 -16 32 32"
								>
									<text
										text-anchor="middle"
										dominant-baseline="middle"
										x="0"
										y="4"
										font-size="30"
										fill="none"
										stroke="#eee"
										stroke-width="6">A</text
									>
									<text
										text-anchor="middle"
										dominant-baseline="middle"
										x="0"
										y="4"
										font-size="30"
										fill="currentColor"
										stroke-width="0">A</text
									>
								</svg>

								<input
									type="color"
									alpha
									class="pretty-color-control"
									onchange={(evt) =>
										cast('change_style', {
											layer_id: singleSelectedLayer.value.id,
											type: 'text',
											attr: 'text_color',
											val: evt.currentTarget.value
										})}
									use:bindValue={view(forceHex, textColor)}
								/>
							</label>
							{@const textOpacityValue = view(
								[
									'text',
									'style',
									'opacity',
									L.rewrite(R.clamp(0, 1)),
									L.valueOr(1),
									L.reread((num) => (Math.round(num * 100) / 100).toFixed(2))
								],
								singleSelectedLayer
							)}
							<label class="pretty-number attribute-icon-number" data-icon="%">
								<span class="pretty-number-label">Text Opacity</span>
								<input
									type="number"
									class="pretty-number-control"
									size="4"
									min="0"
									max="1"
									step="0.01"
									onchange={(evt) => {
										textOpacityValue.value = evt.currentTarget.valueAsNumber;
										cast('change_style', {
											layer_id: singleSelectedLayer.value.id,
											type: 'text',
											attr: 'opacity',
											val: textOpacityValue.value
										});
									}}
									use:bindNumericValue={textOpacityValue}
								/>
							</label>
							{@const textBackgroundColor = view(
								['text', 'style', 'background_color', L.valueOr('transparent')],
								singleSelectedLayer
							)}
							<label class="pretty-color">
								<span class="pretty-color-label">Text Background</span>
								<svg
									preserveAspectRatio="xMinYMid meet"
									class="pretty-color-value"
									style:color={textBackgroundColor.value}
									viewBox="-16 -16 32 32"
								>
									<rect
										x="-12"
										y="-10"
										width="24"
										height="20"
										rx="2"
										fill="currentColor"
										stroke="#333"
										stroke-width="2"
									/>
									{#if textBackgroundColor.value === 'transparent'}
										<path line-joincap="round" stroke-width="4" d="M-11 -9 l 22 18" stroke="red" />
									{/if}
								</svg>

								<input
									type="color"
									alpha
									class="pretty-color-control"
									onchange={(evt) =>
										cast('change_style', {
											layer_id: singleSelectedLayer.value.id,
											type: 'text',
											attr: 'background_color',
											val: evt.currentTarget.value
										})}
									use:bindValue={view(forceHex, textBackgroundColor)}
								/>
								<button
									type="button"
									class="pretty-color-clear"
									aria-label="Clear text background color"
									title="Clear text background color"
									disabled={textBackgroundColor.value === 'transparent'}
									onclick={(evt) => {
										evt.preventDefault();
										textBackgroundColor.value = 'transparent';
										cast('change_style', {
											layer_id: singleSelectedLayer.value.id,
											type: 'text',
											attr: 'background_color',
											val: 'transparent'
										});
									}}
								>
									<svg viewBox="-16 -16 32 32" class="pretty-color-clear-icon">
										<path line-joincap="round" stroke-width="4" d="M6 6 l 20 20 " stroke="red" />
									</svg>
								</button>
							</label>
							{@const textBackgroundOpacityValue = view(
								[
									'text',
									'style',
									'background_opacity',
									L.rewrite(R.clamp(0, 1)),
									L.valueOr(1),
									L.reread((num) => (Math.round(num * 100) / 100).toFixed(2))
								],
								singleSelectedLayer
							)}
							<label class="pretty-number">
								<span class="pretty-number-label">Text Bg Opacity</span>
								<input
									type="number"
									class="pretty-number-control"
									size="4"
									min="0"
									max="1"
									step="0.01"
									onchange={(evt) => {
										textBackgroundOpacityValue.value = evt.currentTarget.valueAsNumber;
										cast('change_style', {
											layer_id: singleSelectedLayer.value.id,
											type: 'text',
											attr: 'background_opacity',
											val: textBackgroundOpacityValue.value
										});
									}}
									use:bindNumericValue={textBackgroundOpacityValue}
								/>
							</label>
							{@const alignmentValue = view(['text', 'style', 'alignment'], singleSelectedLayer)}

							<div class="pretty-checkbox-group">
								<span class="pretty-checkbox-group-head">Alignment</span>
								<div class="pretty-checkbox-group-body">
									<label class="pretty-checkbox"
										><input
											class="pretty-checkbox-control"
											type="radio"
											value="left"
											onchange={(evt) => {
												if (evt.currentTarget.checked) {
													cast('change_style', {
														layer_id: singleSelectedLayer.value.id,
														type: 'text',
														attr: 'alignment',
														val: evt.currentTarget.value
													});
												}
											}}
											bind:group={alignmentValue.value}
										/><svg viewBox="-16 -16 32 32" class="pretty-checkbox-label"
											><title>Left</title>
											<rect
												x="-12"
												y="-10"
												height="4"
												width="24"
												fill="currentColor"
												stroke="none"
												stroke-width="0"
											></rect>
											<rect
												x="-12"
												y="-2"
												height="4"
												width="12"
												fill="currentColor"
												stroke="none"
												stroke-width="0"
											></rect>
											<rect
												x="-12"
												y="6"
												height="4"
												width="16"
												fill="currentColor"
												stroke="none"
												stroke-width="0"
											></rect>
										</svg></label
									>

									<label class="pretty-checkbox"
										><input
											class="pretty-checkbox-control"
											type="radio"
											value="center"
											onchange={(evt) => {
												if (evt.currentTarget.checked) {
													cast('change_style', {
														layer_id: singleSelectedLayer.value.id,
														type: 'text',
														attr: 'alignment',
														val: evt.currentTarget.value
													});
												}
											}}
											bind:group={alignmentValue.value}
										/><svg viewBox="-16 -16 32 32" class="pretty-checkbox-label"
											><title>Center</title>
											<rect
												x="-12"
												y="-10"
												height="4"
												width="24"
												fill="currentColor"
												stroke="none"
												stroke-width="0"
											></rect>
											<rect
												x="-6"
												y="-2"
												height="4"
												width="12"
												fill="currentColor"
												stroke="none"
												stroke-width="0"
											></rect>
											<rect
												x="-8"
												y="6"
												height="4"
												width="16"
												fill="currentColor"
												stroke="none"
												stroke-width="0"
											></rect>
										</svg></label
									>

									<label class="pretty-checkbox"
										><input
											class="pretty-checkbox-control"
											type="radio"
											value="right"
											onchange={(evt) => {
												if (evt.currentTarget.checked) {
													cast('change_style', {
														layer_id: singleSelectedLayer.value.id,
														type: 'text',
														attr: 'alignment',
														val: evt.currentTarget.value
													});
												}
											}}
											bind:group={alignmentValue.value}
										/><svg viewBox="-16 -16 32 32" class="pretty-checkbox-label"
											><title>Right</title>
											<rect
												x="-12"
												y="-10"
												height="4"
												width="24"
												fill="currentColor"
												stroke="none"
												stroke-width="0"
											></rect>
											<rect
												x="0"
												y="-2"
												height="4"
												width="12"
												fill="currentColor"
												stroke="none"
												stroke-width="0"
											></rect>
											<rect
												x="-4"
												y="6"
												height="4"
												width="16"
												fill="currentColor"
												stroke="none"
												stroke-width="0"
											></rect>
										</svg></label
									>
								</div>
							</div>

							{@render commonProps(
								L.valueOr('transparent'),
								L.valueOr('transparent'),
								L.valueOr(0)
							)}
						{/snippet}
						{#snippet multiProps()}
							<label class="pretty-number attribute-icon-number" data-icon="%">
								<span class="pretty-number-label">Opacity</span>
								<input
									type="number"
									class="pretty-number-control"
									title="Opacity"
									size="4"
									min="0"
									max="1"
									step="0.01"
									placeholder="mixed"
									onchange={(evt) => {
										const val = evt.currentTarget.valueAsNumber;
										if (Number.isFinite(val)) {
											changeSelectedStyle(
												cast,
												doc.value,
												layersInOrder.value,
												'layer',
												'opacity',
												val,
												(layer) => !!layer
											);
										}
									}}
								/>
							</label>

							<span class="attribute-section-label">Figures</span>
							<label class="pretty-select">
								<span class="pretty-select-label">Shape</span>
								<span class="pretty-select-value attribute-symbol-value">
									<svg viewBox="-16 -16 32 32" aria-hidden="true">
										<rect
											x="-10"
											y="-8"
											width="20"
											height="16"
											fill="none"
											stroke="currentColor"
											stroke-width="3"
										/>
									</svg>
								</span>
								<select
									class="pretty-select-control"
									title="Shape"
									value="__keep"
									onchange={(evt) => {
										if (evt.currentTarget.value !== '__keep') {
											changeSelectedLayerShape(
												cast,
												doc.value,
												layersInOrder.value,
												evt.currentTarget.value
											);
											evt.currentTarget.value = '__keep';
										}
									}}
								>
									<option value="__keep" disabled>Set shape</option>
									{#await data.symbols then symbols}
										<option value="">None</option>
										{@const symbolGroups = R.groupBy(([id, symbol]) => {
											return symbol.name.split('-', 2)[0];
										}, symbols.entries())}
										{#each Object.entries(symbolGroups) as [g, s] (g)}
											<optgroup label={g}>
												{#each s as [id, symbol] (id)}
													<option value={id}>{symbol.name}</option>
												{/each}
											</optgroup>
										{/each}
									{/await}
								</select>
							</label>
							<div class="pretty-color-group">
								<label class="pretty-color" title="Fill color">
									<span class="pretty-color-label">Fill</span>
									<input
										type="color"
										alpha
										class="pretty-color-control"
										title="Fill color"
										value="#70DB93"
										onchange={(evt) =>
											changeSelectedStyle(
												cast,
												doc.value,
												layersInOrder.value,
												'layer',
												'background_color',
												evt.currentTarget.value,
												(layer) => !!(layer?.box || layer?.text)
											)}
									/>
									<svg
										preserveAspectRatio="xMinYMid meet"
										class="pretty-color-value"
										style:color="#70DB93"
										viewBox="0 0 32 32"
									>
										<rect
											fill="currentColor"
											stroke-width="6"
											x="0"
											y="0"
											width="32"
											height="32"
											stroke="#eee"
											class="swatch-rect"
										></rect>
									</svg>
								</label>
								<button
									type="button"
									class="pretty-color-reset"
									title="Clear fill"
									onclick={() =>
										changeSelectedStyle(
											cast,
											doc.value,
											layersInOrder.value,
											'layer',
											'background_color',
											'transparent',
											(layer) => !!(layer?.box || layer?.text)
										)}
								>
									<svg
										preserveAspectRatio="xMinYMid meet"
										class="pretty-color-value"
										viewBox="0 0 32 32"
									>
										<title>Clear fill</title>
										<path
											line-joincap="round"
											stroke-width="4"
											d="M11 11 l 10 10 M 11 21 l 10 -10"
											stroke="red"
										/>
									</svg>
								</button>
							</div>

							<label class="pretty-number attribute-icon-number" data-icon="%" title="Fill opacity">
								<span class="pretty-number-label">Fill Opacity</span>
								<input
									type="number"
									class="pretty-number-control"
									title="Fill opacity"
									size="4"
									min="0"
									max="1"
									step="0.01"
									placeholder="mixed"
									onchange={(evt) => {
										const val = evt.currentTarget.valueAsNumber;
										if (Number.isFinite(val)) {
											changeSelectedStyle(
												cast,
												doc.value,
												layersInOrder.value,
												'layer',
												'background_opacity',
												val,
												(layer) => !!(layer?.box || layer?.text)
											);
										}
									}}
								/>
							</label>

							<div class="pretty-color-group">
								<label class="pretty-color" title="Stroke color">
									<span class="pretty-color-label">Strk</span>
									<input
										type="color"
										alpha
										class="pretty-color-control"
										title="Stroke color"
										value="#000000"
										onchange={(evt) =>
											changeSelectedStyle(
												cast,
												doc.value,
												layersInOrder.value,
												'layer',
												'border_color',
												evt.currentTarget.value,
												(layer) => !!(layer?.box || layer?.text)
											)}
									/>
									<svg
										preserveAspectRatio="xMinYMid meet"
										class="pretty-color-value"
										style:color="#000000"
										viewBox="0 0 32 32"
									>
										<rect
											stroke="currentColor"
											stroke-width="4"
											x="4"
											y="4"
											width="26"
											height="26"
											fill="none"
										></rect>
									</svg>
								</label>
								<button
									type="button"
									class="pretty-color-reset"
									title="Clear stroke"
									onclick={() =>
										changeSelectedStyle(
											cast,
											doc.value,
											layersInOrder.value,
											'layer',
											'border_color',
											'transparent',
											(layer) => !!(layer?.box || layer?.text)
										)}
								>
									<svg
										preserveAspectRatio="xMinYMid meet"
										class="pretty-color-value"
										viewBox="0 0 32 32"
									>
										<title>Clear stroke</title>
										<path
											line-joincap="round"
											stroke-width="4"
											d="M11 11 l 10 10 M 11 21 l 10 -10"
											stroke="red"
										/>
									</svg>
								</button>
							</div>

							<label class="pretty-number attribute-icon-number" data-icon="|" title="Stroke width">
								<span class="pretty-number-label">Stroke</span>
								<input
									type="number"
									class="pretty-number-control"
									title="Stroke width"
									size="4"
									min="0"
									placeholder="mixed"
									onchange={(evt) => {
										const val = evt.currentTarget.valueAsNumber;
										if (Number.isFinite(val)) {
											changeSelectedStyle(
												cast,
												doc.value,
												layersInOrder.value,
												'layer',
												'border_width',
												val,
												(layer) => !!(layer?.box || layer?.text)
											);
										}
									}}
								/>
							</label>

							<label class="pretty-select" title="Dash pattern">
								<span class="pretty-select-label">Dash</span>
								<span class="pretty-select-value attribute-symbol-value">
									<svg viewBox="-16 -16 32 32" aria-hidden="true">
										<path
											d="M-12 0 H12"
											fill="none"
											stroke="currentColor"
											stroke-width="4"
											stroke-dasharray="5 4"
										/>
									</svg>
								</span>
								<select
									class="pretty-select-control"
									title="Dash pattern"
									value="__keep"
									onchange={(evt) => {
										if (evt.currentTarget.value !== '__keep') {
											changeSelectedStyle(
												cast,
												doc.value,
												layersInOrder.value,
												'layer',
												'border_dash_array',
												evt.currentTarget.value,
												(layer) => !!layer && !layer.edge
											);
											evt.currentTarget.value = '__keep';
										}
									}}
								>
									<option value="__keep" disabled>Set dash</option>
									<option value="">No Dash</option>
									<option value="5 5">5 5</option>
									<option value="10 5">10 5</option>
									<option value="2 2">2 2</option>
								</select>
							</label>

							<span class="attribute-section-label">Edges</span>
							<label
								class="pretty-number attribute-icon-number"
								data-icon="|"
								title="Edge stroke width"
							>
								<span class="pretty-number-label">Stroke</span>
								<input
									type="number"
									class="pretty-number-control"
									title="Edge stroke width"
									size="4"
									min="0"
									placeholder="mixed"
									onchange={(evt) => {
										const val = evt.currentTarget.valueAsNumber;
										if (Number.isFinite(val)) {
											changeSelectedStyle(
												cast,
												doc.value,
												layersInOrder.value,
												'edge',
												'stroke_width',
												val,
												(layer) => !!layer?.edge
											);
										}
									}}
								/>
							</label>
							<label class="pretty-color" title="Edge color">
								<span class="pretty-color-label">Line Color</span>
								<svg
									preserveAspectRatio="xMinYMid meet"
									class="pretty-color-value"
									style:color="#000000"
									viewBox="-16 -16 32 32"
								>
									<path
										stroke="currentColor"
										stroke-width="8"
										d="M-12,0C0,-12,12,12,24,0"
										fill="none"
									/>
								</svg>
								<input
									type="color"
									alpha
									class="pretty-color-control"
									title="Edge color"
									value="#000000"
									onchange={(evt) =>
										changeSelectedStyle(
											cast,
											doc.value,
											layersInOrder.value,
											'edge',
											'stroke_color',
											evt.currentTarget.value,
											(layer) => !!layer?.edge
										)}
								/>
							</label>
							<label class="pretty-number attribute-icon-number" data-icon="%" title="Edge opacity">
								<span class="pretty-number-label">Line Opacity</span>
								<input
									type="number"
									class="pretty-number-control"
									title="Edge opacity"
									size="4"
									min="0"
									max="1"
									step="0.01"
									placeholder="mixed"
									onchange={(evt) => {
										const val = evt.currentTarget.valueAsNumber;
										if (Number.isFinite(val)) {
											changeSelectedStyle(
												cast,
												doc.value,
												layersInOrder.value,
												'edge',
												'stroke_opacity',
												val,
												(layer) => !!layer?.edge
											);
										}
									}}
								/>
							</label>
							<label class="pretty-select" title="Edge dash pattern">
								<span class="pretty-select-label">Line Dash</span>
								<span class="pretty-select-value attribute-symbol-value">
									<svg viewBox="-16 -16 32 32" aria-hidden="true">
										<path
											d="M-12 0 H12"
											fill="none"
											stroke="currentColor"
											stroke-width="4"
											stroke-dasharray="5 4"
										/>
									</svg>
								</span>
								<select
									class="pretty-select-control"
									title="Edge dash pattern"
									value="__keep"
									onchange={(evt) => {
										if (evt.currentTarget.value !== '__keep') {
											changeSelectedStyle(
												cast,
												doc.value,
												layersInOrder.value,
												'edge',
												'stroke_dash_array',
												evt.currentTarget.value,
												(layer) => !!layer?.edge
											);
											evt.currentTarget.value = '__keep';
										}
									}}
								>
									<option value="__keep" disabled>Set dash</option>
									<option value="">No Dash</option>
									<option value="5 5">5 5</option>
									<option value="10 5">10 5</option>
									<option value="2 2">2 2</option>
								</select>
							</label>
							<label class="pretty-select" title="Edge smoothness">
								<span class="pretty-select-label">Smoothness</span>
								<span class="pretty-select-value attribute-symbol-value">
									<svg viewBox="-16 -16 32 32" aria-hidden="true">
										<path
											d="M-12 8 C-4 -12 4 12 12 -8"
											fill="none"
											stroke="currentColor"
											stroke-width="3"
										/>
									</svg>
								</span>
								<select
									class="pretty-select-control"
									title="Edge smoothness"
									value="__keep"
									onchange={(evt) => {
										if (evt.currentTarget.value !== '__keep') {
											changeSelectedStyle(
												cast,
												doc.value,
												layersInOrder.value,
												'edge',
												'smoothness',
												evt.currentTarget.value,
												(layer) => !!layer?.edge
											);
											evt.currentTarget.value = '__keep';
										}
									}}
								>
									<option value="__keep" disabled>Set smoothness</option>
									<option value="linear">Linear</option>
									<option value="autobezier">Autobezier</option>
								</select>
							</label>
							<label class="pretty-select" title="Cyclic edge">
								<span class="pretty-select-label">Cyclic</span>
								<span class="pretty-select-value attribute-symbol-value attribute-symbol-text"
									>C</span
								>
								<select
									class="pretty-select-control"
									title="Cyclic edge"
									value="__keep"
									onchange={(evt) => {
										if (evt.currentTarget.value !== '__keep') {
											changeSelectedEdgeCyclic(
												cast,
												doc.value,
												layersInOrder.value,
												evt.currentTarget.value === 'true'
											);
											evt.currentTarget.value = '__keep';
										}
									}}
								>
									<option value="__keep" disabled>Set cyclic</option>
									<option value="true">On</option>
									<option value="false">Off</option>
								</select>
							</label>

							<span class="attribute-section-label">Text</span>
							<label class="pretty-select" title="Text type">
								<span class="pretty-select-label">Text Type</span>
								<span class="pretty-select-value attribute-symbol-value attribute-symbol-text"
									>T</span
								>
								<select
									class="pretty-select-control"
									title="Text type"
									value="__keep"
									onchange={(evt) => {
										if (evt.currentTarget.value !== '__keep') {
											changeSelectedTextType(
												cast,
												doc.value,
												layersInOrder.value,
												Number(evt.currentTarget.value)
											);
											evt.currentTarget.value = '__keep';
										}
									}}
								>
									<option value="__keep" disabled>Set type</option>
									{#each [{ label: 'Label', value: RENEW_TEXT_TYPE.LABEL }, { label: 'Inscription', value: RENEW_TEXT_TYPE.INSCRIPTION }, { label: 'Name', value: RENEW_TEXT_TYPE.NAME }, { label: 'Declaration', value: RENEW_TEXT_TYPE.AUX }, { label: 'Comment', value: RENEW_TEXT_TYPE.COMM }] as { label, value }}
										<option {value}>{label}</option>
									{/each}
								</select>
							</label>
							<label class="pretty-select" title="Font family">
								<span class="pretty-select-label">Font Family</span>
								<span class="pretty-select-value attribute-symbol-value attribute-symbol-text"
									>A</span
								>
								<select
									class="pretty-select-control"
									title="Font family"
									value="__keep"
									onchange={(evt) => {
										if (evt.currentTarget.value !== '__keep') {
											changeSelectedStyle(
												cast,
												doc.value,
												layersInOrder.value,
												'text',
												'font_family',
												evt.currentTarget.value,
												(layer) => !!layer?.text
											);
											evt.currentTarget.value = '__keep';
										}
									}}
								>
									<option value="__keep" disabled>Set font</option>
									<option style:font-family={'sans-serif'} value="sans-serif">sans-serif</option>
									<option style:font-family={'serif'} value="serif">serif</option>
									<option style:font-family={'monospace'} value="monospace">monospace</option>
									<option style:font-family={'Dialog, sans-serif'} value="Dialog, sans-serif"
										>Dialog</option
									>
									<option
										style:font-family={'Helvetica, Arial, sans-serif'}
										value="Helvetica, Arial, sans-serif">Helvetica</option
									>
									<option
										style:font-family={'Times New Roman, Times, serif'}
										value={'"Times New Roman", Times, serif'}>Times</option
									>
									<option
										style:font-family={'Courier New, Courier, monospace'}
										value={'"Courier New", Courier, monospace'}>Courier</option
									>
								</select>
							</label>
							<label class="pretty-number attribute-icon-number" data-icon="A" title="Font size">
								<span class="pretty-number-label">Size</span>
								<input
									type="number"
									class="pretty-number-control"
									title="Font size"
									size="4"
									min="1"
									placeholder="mixed"
									onchange={(evt) => {
										const val = evt.currentTarget.valueAsNumber;
										if (Number.isFinite(val)) {
											changeSelectedStyle(
												cast,
												doc.value,
												layersInOrder.value,
												'text',
												'font_size',
												val,
												(layer) => !!layer?.text
											);
										}
									}}
								/>
							</label>
							<label class="pretty-color" title="Text color">
								<span class="pretty-color-label">Color</span>
								<svg
									preserveAspectRatio="xMinYMid meet"
									class="pretty-color-value"
									style:color="#000000"
									viewBox="-16 -16 32 32"
								>
									<text
										text-anchor="middle"
										dominant-baseline="middle"
										x="0"
										y="4"
										font-size="30"
										fill="currentColor"
										stroke-width="0">A</text
									>
								</svg>
								<input
									type="color"
									alpha
									class="pretty-color-control"
									title="Text color"
									value="#000000"
									onchange={(evt) =>
										changeSelectedStyle(
											cast,
											doc.value,
											layersInOrder.value,
											'text',
											'text_color',
											evt.currentTarget.value,
											(layer) => !!layer?.text
										)}
								/>
							</label>
							<label class="pretty-select" title="Bold">
								<span class="pretty-select-label">Bold</span>
								<span class="pretty-select-value attribute-symbol-value attribute-symbol-text"
									><b>B</b></span
								>
								<select
									class="pretty-select-control"
									title="Bold"
									value="__keep"
									onchange={(evt) => {
										if (evt.currentTarget.value !== '__keep') {
											changeSelectedStyle(
												cast,
												doc.value,
												layersInOrder.value,
												'text',
												'bold',
												evt.currentTarget.value === 'true',
												(layer) => !!layer?.text
											);
											evt.currentTarget.value = '__keep';
										}
									}}
								>
									<option value="__keep" disabled>Set bold</option>
									<option value="true">On</option>
									<option value="false">Off</option>
								</select>
							</label>
							<label class="pretty-select" title="Italic">
								<span class="pretty-select-label">Italic</span>
								<span class="pretty-select-value attribute-symbol-value attribute-symbol-text"
									><i>I</i></span
								>
								<select
									class="pretty-select-control"
									title="Italic"
									value="__keep"
									onchange={(evt) => {
										if (evt.currentTarget.value !== '__keep') {
											changeSelectedStyle(
												cast,
												doc.value,
												layersInOrder.value,
												'text',
												'italic',
												evt.currentTarget.value === 'true',
												(layer) => !!layer?.text
											);
											evt.currentTarget.value = '__keep';
										}
									}}
								>
									<option value="__keep" disabled>Set italic</option>
									<option value="true">On</option>
									<option value="false">Off</option>
								</select>
							</label>
							<label class="pretty-select" title="Underline">
								<span class="pretty-select-label">Underline</span>
								<span class="pretty-select-value attribute-symbol-value attribute-symbol-text"
									><u>U</u></span
								>
								<select
									class="pretty-select-control"
									title="Underline"
									value="__keep"
									onchange={(evt) => {
										if (evt.currentTarget.value !== '__keep') {
											changeSelectedStyle(
												cast,
												doc.value,
												layersInOrder.value,
												'text',
												'underline',
												evt.currentTarget.value === 'true',
												(layer) => !!layer?.text
											);
											evt.currentTarget.value = '__keep';
										}
									}}
								>
									<option value="__keep" disabled>Set underline</option>
									<option value="true">On</option>
									<option value="false">Off</option>
								</select>
							</label>
							<label class="pretty-select" title="Text alignment">
								<span class="pretty-select-label">Alignment</span>
								<span class="pretty-select-value attribute-symbol-value">
									<svg viewBox="-16 -16 32 32" aria-hidden="true">
										<path
											d="M-12 -8 H12 M-12 0 H6 M-12 8 H10"
											stroke="currentColor"
											stroke-width="3"
											stroke-linecap="butt"
										/>
									</svg>
								</span>
								<select
									class="pretty-select-control"
									title="Text alignment"
									value="__keep"
									onchange={(evt) => {
										if (evt.currentTarget.value !== '__keep') {
											changeSelectedStyle(
												cast,
												doc.value,
												layersInOrder.value,
												'text',
												'alignment',
												evt.currentTarget.value,
												(layer) => !!layer?.text
											);
											evt.currentTarget.value = '__keep';
										}
									}}
								>
									<option value="__keep" disabled>Set alignment</option>
									<option value="left">Left</option>
									<option value="center">Center</option>
									<option value="right">Right</option>
								</select>
							</label>
						{/snippet}
						<div class="attribute-toolbar-body" use:attributeTooltips>
							{@render multiProps()}
						</div>
					</div>
				</div>

				<div class="topsubbar" use:editorDropZone={{ dispatch, cast }}>
					{#if showDebug.value}
						{@const symbolsOpen = view('symbols', debugTabs)}
						{@const primitivesOpen = view('primitives', debugTabs)}
						{@const tabs = [
							{
								key: 'document',
								label: 'Debug Document',
								lens: L.inverse(L.json({ space: '  ' })),
								root: doc
							},
							{
								key: 'selection',
								label: 'Debug Selection',
								lens: L.inverse(L.json({ space: '  ' })),
								root: singleSelectedLayer
							},
							{
								key: 'camera',
								label: 'Debug Document',
								lens: [L.identity],
								root: cameraJson
							}
						]}
						<div class="toolbar vertical">
							<label>
								<input type="checkbox" bind:checked={showDebug.value} />
								Show Debug</label
							>
							{#each tabs as t (t.key)}
								{@const tabOpen = view(t.key, debugTabs)}
								<details bind:open={tabOpen.value}>
									<summary>{t.label}</summary>
									<textarea
										style="font-family: monospace; height: 100%; min-height: 6em; resize: none;  width: 100%; justify-self: stretch; flex-grow: 1; box-sizing: border-box;"
										use:bindValue={view(t.lens, t.root)}
									></textarea>
								</details>
							{/each}
							<details bind:open={symbolsOpen.value}>
								<summary>Debug Symbols </summary>

								{#await data.symbols then symbols}
									<textarea
										style="font-family: monospace; height: 100%; min-height: 6em; resize: none;  width: 100%; justify-self: stretch; flex-grow: 1; box-sizing: border-box;"
										value={JSON.stringify(Array.from(symbols.entries()))}
									></textarea>
								{/await}
							</details>
							<details bind:open={primitivesOpen.value}>
								<summary>Debug Primitives </summary>

								{#await data.primitives then primitives}
									<textarea
										style="height: 100%; min-height: 6em; resize: none;  width: 100%; justify-self: stretch; flex-grow: 1; box-sizing: border-box;"
										value={JSON.stringify(primitives)}
									></textarea>
								{/await}
							</details>
						</div>
					{/if}
				</div>

				<div class="sidebar right" use:editorDropZone={{ dispatch, cast }}>
					<Minimap
						visible={showMinimap}
						{extension}
						{frameBoxPath}
						{rotationInverseTransform}
						{cameraFocus}
					>
						<rect
							x={documentDisplayRect.value.x}
							y={documentDisplayRect.value.y}
							width={documentDisplayRect.value.width}
							height={documentDisplayRect.value.height}
							fill="white"
							opacity="0.8"
						/>

						<use href="#full-document-{data.document.id}" opacity="0.8" />

						<rect stroke="#0af" stroke-width="5" fill="#0af" fill-opacity="0.1" />
					</Minimap>
					<div
						class={{
							'hierarchy-panel': true,
							toolbar: true,
							vertical: true,
							hidden: !showHierarchy.value
						}}
					>
						<div style="border-bottom: 1px solid #333; padding: 0 1ex 1ex">Hierarchy</div>
						<!-- <input style="" type="search" name="" placeholder="search" /> -->
						<div
							style="scrollbar-width: thin; max-height: 100%; min-height: 10em; padding:1px; overflow: auto; display: flex; flex-direction: column;"
							use:polyfillDragDrop={{
								dropArea: document,
								options: { dragThresholdPixels: 0 }
							}}
						>
							{#if !layersInOrder.value.length}
								<div
									style="color: #aaa; font-style: italic; display: grid; align-content: center; justify-content: center; flex-grow: 1;border: 2px dashed #aaa;"
								>
									Document is empty
								</div>
							{/if}
							{#each layersInOrder.value as { index, id, depth, hidden, isLast, parents } (id)}
								{@const el = view(['layers', 'items', L.find((el) => el.id == id)], doc)}
								{@const elId = view('id', el)}
								{@const hyperlink = view('hyperlink', el)}
								{@const visible = view(['hidden', L.complement], el)}
								{@const elType = view(
									L.reread((el) => {
										return el.text ? 'text' : el.edge ? 'edge' : el.box ? 'box' : '';
									}),
									el
								)}
								{@const elSemantic = view(
									[
										'semantic_tag',
										L.defaults(''),
										L.reread(R.ifElse(R.is(String), R.compose(R.last, R.split('.')), R.always('-')))
									],
									el
								)}
								{@const selected = view(
									L.lens(
										(s) => s.includes(id),
										(s, old) => (s ? uniqueLayerIds([...old, id]) : old.filter((o) => o !== id))
									),
									selectedLayers
								)}
								<!-- svelte-ignore a11y_no_static_element_interactions -->
								<div
									style:margin-left="{2.5 + depth}em"
									role="region"
									ondragenter={(evt) => {
										const hasSourceId = hasTransferContent(
											evt.dataTransfer,
											'application/json+renewex-layer-id'
										);

										if (!hasSourceId) {
											return;
										}
										evt.preventDefault();
										evt.currentTarget.classList.add('droparea');
										evt.currentTarget.style.backgroundColor = '#23875d';
									}}
									ondragleave={(evt) => {
										evt.preventDefault();
										evt.currentTarget.classList.remove('droparea');
										evt.currentTarget.style.backgroundColor = 'white';
									}}
									ondrop={(evt) => {
										const sourceId = getTransferContent(
											evt.dataTransfer,
											'application/json+renewex-layer-id'
										);
										if (!sourceId || sourceId === id) {
											evt.currentTarget.style.backgroundColor = '#333';
											return;
										}

										cast('move_layer', {
											layer_ids: [sourceId],
											target_layer_id: id,
											order: 'below',
											relative: 'outside'
										});

										evt.preventDefault();
										evt.currentTarget.style.backgroundColor = 'white';
									}}
									style="background: white; height: 5px; flex-shrink: 0;"
									ondragover={(evt) => {
										if (evt.currentTarget === evt.relatedTarget) {
											return;
										}
										const hasSourceId = hasTransferContent(
											evt.dataTransfer,
											'application/json+renewex-layer-id'
										);
										if (!hasSourceId) {
											return;
										}
										evt.preventDefault();
										evt.dataTransfer.dropEffect = 'move';
									}}
								></div>
								<div
									style="max-width: 100%; display: flex;  gap: 0.5ex; align-items: stretch; justify-content: stretch; box-sizing: border-box;"
									style:opacity={hidden ? 0.5 : 1}
									style:background={selected.value ? '#23875d44' : '#fafafa'}
								>
									<label
										style="display: grid; align-items: center; justify-items: center; padding: 0.5em"
									>
										<input
											style="accent-color: #23875d;"
											type="checkbox"
											bind:checked={visible.value}
											onchange={(evt) =>
												cast('set_visibility', {
													layer_id: id,
													visible: evt.currentTarget.checked
												})}
										/>
									</label>
									<!-- svelte-ignore a11y_no_static_element_interactions -->
									<div
										draggable="true"
										style:touch-action="none"
										ondragstart={(evt) => {
											const p = evt.currentTarget.parentNode;
											const rect = p.getBoundingClientRect();
											evt.dataTransfer.setDragImage(
												evt.currentTarget.parentNode,
												evt.clientX - rect.left,
												evt.clientY - rect.top
											);
											evt.dataTransfer.effectAllowed = 'move';
											setTransferContent(evt.dataTransfer, 'application/json+renewex-layer-id', id);

											publishSelection(cast, [id]);
										}}
										ondragover={(evt) => {
											if (evt.currentTarget === evt.relatedTarget) {
												return;
											}
											const hasSourceId = hasTransferContent(
												evt.dataTransfer,
												'application/json+renewex-layer-id'
											);
											if (!hasSourceId) {
												return;
											}
											evt.preventDefault();
											evt.dataTransfer.dropEffect = 'move';
										}}
										ondragenter={(evt) => {
											const hasSourceId = hasTransferContent(
												evt.dataTransfer,
												'application/json+renewex-layer-id'
											);
											if (!hasSourceId) {
												return;
											}
											evt.preventDefault();
											evt.currentTarget.classList.add('droparea');
											evt.currentTarget.style.backgroundColor = '#23875d';
										}}
										ondragleave={(evt) => {
											evt.preventDefault();
											evt.currentTarget.classList.remove('droparea');
											evt.currentTarget.style.backgroundColor = '#333';
										}}
										ondrop={(evt) => {
											const sourceId = getTransferContent(
												evt.dataTransfer,
												'application/json+renewex-layer-id'
											);
											if (!sourceId || sourceId === id) {
												evt.currentTarget.style.backgroundColor = '#333';
												return;
											}

											cast('move_layer', {
												layer_ids: [sourceId],
												target_layer_id: id,
												order: 'above',
												relative: 'inside'
											});

											evt.preventDefault();
											evt.currentTarget.style.backgroundColor = '#333';
										}}
										style="flex-shrink: 0; font-weight: bold; text-align: center; background: #333; color: #fff; align-self: center; height: 1.6em; width: 1.6em; cursor: move; display: grid; align-content: center; justify-content: center;"
										style:margin-left="{depth}em"
									>
										☰
									</div>
									<div
										role="button"
										tabindex="-1"
										onclick={(evt) => {
											selectLayer(cast, id, evt);
										}}
										onkeydown={(evt) => {
											if (evt.key === ' ' || evt.key === 'Enter') {
												evt.preventDefault();
												selectLayer(cast, id, evt);
											}
										}}
										style="flex-grow: 1; display: flex; flex-direction: column; align-self: stretch; justify-content: center; box-sizing: border-box;"
									>
										<div style="white-space: nowrap;">
											<span>{elType.value || 'group'} </span>
											<span
												>{#if hyperlink.value}🔗{/if}</span
											>
											<span
												>{#if elId.value == doc.value.thumbnail_layer}🖼️{/if}</span
											>
											<span>{elSemantic.value}</span>
										</div>
										<small
											style="color: #aaa; display: block; max-width: 10em; width:100%; overflow: hidden; text-overflow: ellipsis; word-break: normal; white-space: nowrap; box-sizing: border-box;"
											>({el.value.z_index}/{elId.value})</small
										>
									</div>
								</div>
								{#if isLast}
									{#each [id, ...parents] as p, i (p)}
										<div
											role="region"
											style:margin-left="{2.5 + depth - i}em"
											ondragenter={(evt) => {
												const hasSourceId = hasTransferContent(
													evt.dataTransfer,
													'application/json+renewex-layer-id'
												);
												if (!hasSourceId) {
													return;
												}

												evt.preventDefault();
												evt.currentTarget.classList.add('droparea');
												evt.currentTarget.style.backgroundColor = '#23875d';
											}}
											ondragleave={(evt) => {
												evt.preventDefault();
												evt.currentTarget.classList.remove('droparea');
												evt.currentTarget.style.backgroundColor = 'white';
											}}
											ondrop={(evt) => {
												const sourceId = getTransferContent(
													evt.dataTransfer,
													'application/json+renewex-layer-id'
												);

												if (!sourceId || sourceId === p) {
													evt.currentTarget.style.backgroundColor = '#333';
													return;
												}

												cast('move_layer', {
													layer_ids: [sourceId],
													target_layer_id: p,
													order: 'above',
													relative: 'outside'
												});

												evt.preventDefault();
												evt.currentTarget.style.backgroundColor = 'white';
											}}
											ondragover={(evt) => {
												if (evt.currentTarget === evt.relatedTarget) {
													return;
												}
												const hasSourceId = hasTransferContent(
													evt.dataTransfer,
													'application/json+renewex-layer-id'
												);
												if (!hasSourceId) {
													return;
												}
												evt.preventDefault();
												evt.dataTransfer.dropEffect = 'move';
											}}
											style="background: white; height: 5px;flex-shrink: 0;"
										></div>
									{/each}
								{/if}
							{/each}
						</div>
						{#if singleSelectedHyperinkedId.value}
							<div>
								Linked:<br />
								<u
									tabindex="-1"
									style="cursor: pointer"
									role="button"
									onkeydown={(evt) => {
										if (evt.key === 'enter') {
											const id = singleSelectedHyperinkedId.value;
											publishSelection(cast, [id]);
										}
									}}
									onclick={() => {
										const id = singleSelectedHyperinkedId.value;
										publishSelection(cast, [id]);
									}}>{singleSelectedHyperinkedId.value}</u
								>
							</div>
						{/if}
						<label class="pretty-select" style="max-width: none">
							<span class="pretty-select-label">Interface</span>
							{#await data.socket_schemas then schemas}
								<span class="pretty-select-value"
									>{view(
										['interface_id', L.reread((v) => schemas.get(v)?.name || 'None')],
										singleSelectedLayer
									).value}</span
								>
								<select
									class="pretty-select-control"
									disabled={!singleSelectedLayer.value}
									onchange={(evt) =>
										cast('set_socket_schema', {
											layer_id: singleSelectedLayer.value.id,
											val: evt.currentTarget.value
										})}
									use:bindValue={view(
										['interface_id', L.defaults(''), L.valueOr('')],
										singleSelectedLayer
									)}
								>
									<option value="">None</option>
									{#each schemas.entries() as [id, s]}
										<option value={id}>{s.name}</option>
									{/each}
								</select>
							{/await}
						</label>
						<label class="pretty-select" style="max-width: none">
							<span class="pretty-select-label">Semantic Tag</span>
							{#await data.semantic_tags then tags}
								<span class="pretty-select-value"
									>{view(['semantic_tag', L.defaults(''), L.valueOr('None')], singleSelectedLayer)
										.value}</span
								>
								<select
									class="pretty-select-control"
									disabled={!singleSelectedLayer.value}
									onchange={(evt) =>
										cast('set_semantic_tag', {
											layer_id: singleSelectedLayer.value.id,
											val: evt.currentTarget.value
										})}
									use:bindValue={view(
										['semantic_tag', L.defaults(''), L.valueOr('')],
										singleSelectedLayer
									)}
								>
									<option value="">None</option>
									{#each tags as t}
										<option value={t}>{t}</option>
									{/each}
								</select>
							{/await}
						</label>
						<button
							disabled={selectedLayers.value.length === 0}
							class="delete-button"
							onclick={(evt) => {
								evt.preventDefault();
								deleteSelectedLayers(cast, layersInOrder.value);
							}}>Delete</button
						>
					</div>
				</div>
				<div
					class={{ sidebar: true, left: true, hidden: !showCreateToolbar.value }}
					use:editorDropZone={{ dispatch, cast }}
				>
					<div
						class="toolbar vertical create-toolbar"
						style={`--create-toolbar-width: ${createToolbarWidth.value}px;`}
						use:polyfillDragDrop={{
							dropArea: dropperDomElement,
							options: { dragThresholdPixels: 0 }
						}}
					>
						<div class="create-toolbar-header">
							<span>Tools</span>
						</div>
						{#snippet editorToolButton(item, groupName, groups)}
							<div
								class={{
									'create-primitive-tool': true,
									'editor-tool-entry': true,
									'selectable-create': true,
									'active-create-tool': activeTool.value === item.id
								}}
								role="button"
								tabindex="0"
								aria-pressed={activeTool.value === item.id}
								title={item.name}
								data-tooltip={item.name}
								style="display: grid; justify-content: center; align-content: center;"
								draggable="true"
								ondragstart={(evt) => beginCreateToolEntryDrag(evt, groupName, item)}
								ondragend={finishCreateToolbarDrag}
								ondragover={allowCreateToolbarDrop}
								ondrop={(evt) => dropCreateToolEntry(evt, groupName, item, groups)}
								onclick={(evt) => {
									selectEditorTool(item.id, cast);
									evt.preventDefault();
									evt.stopPropagation();
								}}
								oncontextmenu={(evt) => {
									openToolOptions(evt, {
										name: item.name,
										description: 'Editor tool',
										activate: () => selectEditorTool(item.id, cast),
										reset: item.reset
											? () => item.reset(cameraScroller.value, cameraFocus, extension.value)
											: undefined,
										actions: [
											{
												label: 'Move up',
												run: () => moveCreateToolEntry(groupName, item, -1, groups)
											},
											{
												label: 'Move down',
												run: () => moveCreateToolEntry(groupName, item, 1, groups)
											},
											{
												label: 'Hide',
												run: () => hideCreateToolEntry(item)
											}
										]
									});
								}}
								ondblclick={(evt) => {
									evt.preventDefault();
									evt.stopPropagation();
									item.reset?.(cameraScroller.value, cameraFocus, extension.value);
								}}
								onkeydown={(evt) => {
									if (evt.key === 'Enter' || evt.key === ' ') {
										evt.preventDefault();
										selectEditorTool(item.id, cast);
									}
								}}
							>
								<svg viewBox="-4 -4 40 40" width="32" aria-hidden="true">
									<title>{item.name}</title>
									{@html createToolEntryIcon(item)}
								</svg>
							</div>
						{/snippet}
						{#snippet edgeCreateToolButton(item, groupName, groups)}
							<div
								class={{
									'create-primitive-tool': true,
									'edge-create-tool': true,
									'selectable-create': true,
									'active-create-tool': isActiveEdgeCreateTool(item),
									'persistent-create-tool': isActiveEdgeCreateTool(item) && edgeToolPersistent
								}}
								role="button"
								tabindex="0"
								aria-pressed={isActiveEdgeCreateTool(item)}
								title={item.name}
								data-tooltip={item.name}
								style="display: grid; justify-content: center; align-content: center;"
								draggable="true"
								ondragstart={(evt) => beginCreateToolEntryDrag(evt, groupName, item)}
								ondragend={finishCreateToolbarDrag}
								ondragover={allowCreateToolbarDrop}
								ondrop={(evt) => dropCreateToolEntry(evt, groupName, item, groups)}
								onclick={(evt) => {
									if (activateEdgeCreateTool(item, false, cast)) {
										evt.preventDefault();
										evt.stopPropagation();
									}
								}}
								oncontextmenu={(evt) => {
									openToolOptions(evt, {
										name: item.name,
										description: 'Edge creation tool',
										activate: () => activateEdgeCreateTool(item, false, cast),
										keepActive: () => activateEdgeCreateTool(item, true, cast),
										actions: [
											{
												label: 'Move up',
												run: () => moveCreateToolEntry(groupName, item, -1, groups)
											},
											{
												label: 'Move down',
												run: () => moveCreateToolEntry(groupName, item, 1, groups)
											},
											{
												label: 'Hide',
												run: () => hideCreateToolEntry(item)
											}
										]
									});
								}}
								ondblclick={(evt) => {
									if (activateEdgeCreateTool(item, true, cast)) {
										evt.preventDefault();
										evt.stopPropagation();
									}
								}}
								onkeydown={(evt) => {
									if (evt.key === 'Enter' || evt.key === ' ') {
										evt.preventDefault();
										activateEdgeCreateTool(item, false, cast);
									}
								}}
							>
								<svg viewBox="-4 -4 40 40" width="32" aria-hidden="true">
									<title>{item.name}</title>
									{@html createToolEntryIcon(item)}
								</svg>
							</div>
						{/snippet}
						{#await data.primitives}
							-
						{:then groups}
							{#each createToolGroups(groups) as g}
								{@const visibleEntries = visibleCreateToolEntries(g)}
								{@const groupCollapsed = createToolGroupCollapsed(g.name)}
								{#if visibleEntries.length}
									<div class="create-tool-group">
										<div
											class="create-tool-group-title"
											role="button"
											tabindex="0"
											aria-expanded={!groupCollapsed}
											draggable="true"
											ondragstart={(evt) => beginCreateToolGroupDrag(evt, g.name)}
											ondragend={finishCreateToolbarDrag}
											ondragover={allowCreateToolbarDrop}
											ondrop={(evt) => dropCreateToolGroup(evt, g.name, groups)}
											onclick={(evt) => {
												evt.preventDefault();
												toggleCreateToolGroupCollapsed(g.name);
											}}
											oncontextmenu={(evt) => {
												openToolOptions(evt, {
													name: g.name,
													description: 'Create tool group',
													actions: [
														{
															label: groupCollapsed ? 'Expand group' : 'Collapse group',
															run: () => toggleCreateToolGroupCollapsed(g.name)
														},
														{
															label: 'Move group up',
															run: () => moveCreateToolGroup(g.name, -1, groups)
														},
														{
															label: 'Move group down',
															run: () => moveCreateToolGroup(g.name, 1, groups)
														},
														{
															label: 'Hide group',
															run: () => hideCreateToolGroup(g.name, groups)
														}
													]
												});
											}}
											onkeydown={(evt) => {
												if (evt.key === 'Enter' || evt.key === ' ') {
													evt.preventDefault();
													toggleCreateToolGroupCollapsed(g.name);
												}
											}}
										>
											<span class="create-tool-group-arrow">{groupCollapsed ? '>' : 'v'}</span>
											<span>{g.name}</span>
										</div>
										{#if !groupCollapsed}
											<div class="create-tool-group-body">
												{#each visibleEntries as item (createToolEntryId(item))}
													{@const linkedCreateTargetId = primitiveCanBeLinkedToSelection(
														item,
														singleSelectedLayer.value
													)}
													{#if isEditorToolEntry(item)}
														{@render editorToolButton(item, g.name, groups)}
													{:else if isEdgeCreateToolEntry(item)}
														{@render edgeCreateToolButton(item, g.name, groups)}
													{:else}
														<div
															class={{
																'create-primitive-tool': true,
																'selectable-create': isSelectableCreatePrimitive(item),
																'disabled-create-tool':
																	isSelectableCreatePrimitive(item) &&
																	!canActivateCreatePrimitive(item, linkedCreateTargetId),
																'active-create-tool': isActiveCreatePrimitive(item),
																'persistent-create-tool':
																	isActiveCreatePrimitive(item) &&
																	activeCreateTool.value?.persistent
															}}
															role="button"
															tabindex={canActivateCreatePrimitive(item, linkedCreateTargetId)
																? '0'
																: '-1'}
															aria-disabled={!canActivateCreatePrimitive(
																item,
																linkedCreateTargetId
															)}
															aria-pressed={isSelectableCreatePrimitive(item)
																? isActiveCreatePrimitive(item)
																: undefined}
															title={item.name}
															data-tooltip={item.name}
															style="display: grid; justify-content: center; align-content: center;"
															draggable={isSelectableCreatePrimitive(item)}
															style:touch-action="none"
															ondragover={allowCreateToolbarDrop}
															ondrop={(evt) => dropCreateToolEntry(evt, g.name, item, groups)}
															onclick={(evt) => {
																if (
																	activateCreatePrimitive(item, false, linkedCreateTargetId, cast)
																) {
																	evt.preventDefault();
																	evt.stopPropagation();
																}
															}}
															oncontextmenu={(evt) => {
																openToolOptions(evt, {
																	name: item.name,
																	description: 'Create tool',
																	activate: canActivateCreatePrimitive(item, linkedCreateTargetId)
																		? () =>
																				activateCreatePrimitive(
																					item,
																					false,
																					linkedCreateTargetId,
																					cast
																				)
																		: undefined,
																	keepActive: canActivateCreatePrimitive(item, linkedCreateTargetId)
																		? () =>
																				activateCreatePrimitive(
																					item,
																					true,
																					linkedCreateTargetId,
																					cast
																				)
																		: undefined,
																	actions: [
																		{
																			label: 'Move up',
																			run: () => moveCreateToolEntry(g.name, item, -1, groups)
																		},
																		{
																			label: 'Move down',
																			run: () => moveCreateToolEntry(g.name, item, 1, groups)
																		},
																		{
																			label: 'Hide',
																			run: () => hideCreateToolEntry(item)
																		}
																	]
																});
															}}
															ondblclick={(evt) => {
																if (
																	activateCreatePrimitive(item, true, linkedCreateTargetId, cast)
																) {
																	evt.preventDefault();
																	evt.stopPropagation();
																}
															}}
															onkeydown={(evt) => {
																if (
																	canActivateCreatePrimitive(item, linkedCreateTargetId) &&
																	(evt.key === 'Enter' || evt.key === ' ')
																) {
																	evt.preventDefault();
																	activateCreatePrimitive(item, false, linkedCreateTargetId, cast);
																}
															}}
															ondragstart={(evt) => {
																beginCreateToolEntryDrag(evt, g.name, item);
																const d = {
																	...item.data,
																	content: {
																		...item.data.content,
																		hyperlink:
																			item.data.content.hyperlink ||
																			isVirtualPrimitiveContent(item.data.content)
																				? true
																				: undefined
																	}
																};

																evt.stopPropagation();
																const positionInfo = evt.currentTarget.getBoundingClientRect();
																evt.dataTransfer.setDragImage(
																	evt.currentTarget,
																	positionInfo.width * d.alignX,
																	positionInfo.height * d.alignY
																);
																const data = d.dynamicContent
																	? d.dynamicContent(properties.value)
																	: d.content;
																evt.dataTransfer.setData(d.mimeType, JSON.stringify(data));

																// Work-around for
																// https://bugs.chromium.org/p/chromium/issues/detail?id=1293803&no_tracker_redirect=1
																evt.dataTransfer.setData(
																	'text/plain',
																	JSON.stringify({
																		mime: d.mimeType,
																		data: data
																	})
																);
															}}
															ondragend={finishCreateToolbarDrag}
														>
															<svg
																class={{
																	droppable: isSelectableCreatePrimitive(item)
																}}
																style:opacity={isSelectableCreatePrimitive(item) ? 1 : 0.5}
																viewBox="-4 -4 40 40"
																width="32"
															>
																<title>{item.name}</title>
																{@html createToolEntryIcon(item)}
															</svg>
														</div>
													{/if}
												{/each}
											</div>
										{/if}
									</div>
								{/if}
							{/each}
						{:catch e}
							error
						{/await}
						<div class="create-tool-group insert-tool-group">
							<div class="create-tool-group-title static-create-tool-group-title">
								<span class="create-tool-group-arrow">v</span>
								<span>Insert</span>
							</div>
							<div class="create-tool-group-body insert-tool-group-body">
								<label style="text-align: center; display: block;">
									{#await data.blueprints}
										-
									{:then bp}
										<div
											title={bp.get(selectedBlueprint.value)?.name ?? '-'}
											style="display: grid; align-content: center; justify-content: center; grid-template-columns: 1fr; grid-template-rows: 1fr; align-items: stretch; justify-items: stretch; width: 2em; overflow: hidden;"
										>
											<div
												style="grid-area: 1 / 1 / span 1 / span 1; align-self: center; width: 100%; overflow: hidden"
											>
												INS<br />
												<div
													style="width: 2em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"
												>
													{bp.get(selectedBlueprint.value)?.name ?? '-'}
												</div>
											</div>
											<select
												value={selectedBlueprint.value ?? ''}
												style="-webkit-appearance: none; width: 3em; max-width: 100%; height: 3em; opacity: 0;grid-area: 1 / 1 / span 1 / span 1;"
												onchange={(evt) => selectBlueprintTool(evt.currentTarget.value, cast)}
											>
												<option value=""></option>
												{#each bp.entries() as [id, s]}
													<option value={id}>{s.name}</option>
												{/each}
											</select>
										</div>
									{:catch e}
										error
									{/await}
								</label>
								<div
									class={{
										'create-primitive-tool': true,
										'blueprint-create-tool': true,
										'selectable-create': canActivateBlueprintTool(selectedBlueprint.value),
										'disabled-create-tool': !canActivateBlueprintTool(selectedBlueprint.value),
										'active-create-tool': isActiveBlueprintTool(selectedBlueprint.value),
										'persistent-create-tool':
											isActiveBlueprintTool(selectedBlueprint.value) &&
											activeCreateTool.value?.persistent
									}}
									style="display: grid; justify-content: center; align-content: center;"
									role="button"
									tabindex={canActivateBlueprintTool(selectedBlueprint.value) ? '0' : '-1'}
									aria-disabled={!canActivateBlueprintTool(selectedBlueprint.value)}
									aria-pressed={isActiveBlueprintTool(selectedBlueprint.value)}
									title="Insert"
									data-tooltip="Insert"
									style:cursor={!!selectedBlueprint.value ? 'pointer' : 'default'}
									style:opacity={!!selectedBlueprint.value ? '1' : 0.5}
									draggable={!!selectedBlueprint.value}
									style:touch-action="none"
									onclick={(evt) => {
										if (activateBlueprintTool(selectedBlueprint.value, false, cast)) {
											evt.preventDefault();
											evt.stopPropagation();
										}
									}}
									oncontextmenu={(evt) => {
										openToolOptions(evt, {
											name: 'Insert',
											description: 'Insert selected document',
											activate: canActivateBlueprintTool(selectedBlueprint.value)
												? () => activateBlueprintTool(selectedBlueprint.value, false, cast)
												: undefined,
											keepActive: canActivateBlueprintTool(selectedBlueprint.value)
												? () => activateBlueprintTool(selectedBlueprint.value, true, cast)
												: undefined
										});
									}}
									ondblclick={(evt) => {
										if (activateBlueprintTool(selectedBlueprint.value, true, cast)) {
											evt.preventDefault();
											evt.stopPropagation();
										}
									}}
									onkeydown={(evt) => {
										if (
											canActivateBlueprintTool(selectedBlueprint.value) &&
											(evt.key === 'Enter' || evt.key === ' ')
										) {
											evt.preventDefault();
											activateBlueprintTool(selectedBlueprint.value, false, cast);
										}
									}}
									ondragstart={(evt) => {
										const d = {
											content: {
												blueprint_id: selectedBlueprint.value
											},
											mimeType: BLUEPRINT_MIME_TYPE,
											alignX: 0.5,
											alignY: 0.5
										};

										evt.stopPropagation();
										evt.dataTransfer.effectAllowed = 'copy';
										evt.currentTarget.setAttribute('aria-grabbed', 'true');
										const positionInfo = evt.currentTarget.getBoundingClientRect();
										evt.dataTransfer.setDragImage(
											evt.currentTarget,
											positionInfo.width * d.alignX,
											positionInfo.height * d.alignY
										);
										const data = d.dynamicContent ? d.dynamicContent(properties.value) : d.content;
										evt.dataTransfer.setData(d.mimeType, JSON.stringify(data));

										// Work-around for
										// https://bugs.chromium.org/p/chromium/issues/detail?id=1293803&no_tracker_redirect=1
										evt.dataTransfer.setData(
											'text/plain',
											JSON.stringify({
												mime: d.mimeType,
												data: data
											})
										);
									}}
								>
									<svg viewBox="-4 -4 40 40" aria-hidden="true">
										<rect
											x="8"
											y="5"
											width="16"
											height="22"
											fill="#eeeeee"
											stroke="#aaaaaa"
											stroke-width="1.5"
										/>
										<path
											d="M12 10 H20 M12 15 H20 M12 20 H20"
											stroke="#ffffff"
											stroke-width="1.5"
										/>
									</svg>
								</div>
							</div>
						</div>
						<div
							class="create-toolbar-resize-handle"
							role="separator"
							aria-orientation="vertical"
							title="Resize tool palette"
							data-tooltip="Resize tool palette"
							onpointerdown={startCreateToolbarResize}
						></div>
					</div>
					<div
						style="user-select: none; text-align: center; font-size: 2em; cursor: pointer; display: grid; align-content: center; justify-content: center; line-height: 1; padding: 0.5ex"
						onclick={() => update(R.not, lockRotation)}
						ondblclick={() => {
							cameraRotation.value = 0;
						}}
						tabindex="-1"
						role="button"
						onkeydown={(evt) => {
							if (evt.key === 'enter' || evt.key === 'space') {
								update(R.not, lockRotation);
							} else if (evt.key === 'escape') {
								cameraRotation.value = 0;
							}
						}}
					>
						<svg viewBox="-20 -20 40 40" width="40" height="40" style="width: 100%;">
							<g transform="rotate({cameraRotation.value})">
								<circle cx={0} cy={0} r={18} fill="#3333" stroke="#fff3" stroke-width="1" />
								<path d="M0,0h-3l3,-16l3,16z" fill="#b00c" />
								<path d="M0,0h-3l3,16l3,-16z" fill="#fffc" />
							</g>

							<g style:color={lockRotation.value ? '#000' : '#777'}>
								<rect x="-20" y="10" width="11" height="8" fill="currentColor" />
								<path
									opacity={lockRotation.value ? 1 : 0}
									d="M-18,10v-5 a 4 4 0 0 1  7 0 v5"
									stroke="currentColor"
									stroke-width="2"
									fill="none"
								/>
								<path
									opacity={lockRotation.value ? 0 : 1}
									d="M-18,10v-8 a 4 4 0 0 1  7 0 v3"
									stroke="currentColor"
									stroke-width="2"
									fill="none"
								/>
							</g>
						</svg>
					</div>
				</div>
			</div>
			<footer class="statusbar" aria-live="polite">
				<span>{activeTool.value}</span>
				<span>
					{#if selectedLayers.value.length === 0}
						Nothing Selected
					{:else if selectedLayers.value.length === 1}
						1 {selectedLayersType.value[0] ?? 'layer'} selected
					{:else}
						{selectedLayers.value.length} layers selected
					{/if}
				</span>
				<span>{statusMessage.value || doc.value.name}</span>
				<span
					>{data.offline
						? 'offline snapshot'
						: data.connectionState.value === false
							? 'offline'
							: 'online'}</span
				>
				{#if queuedActions.value > 0}
					<span
						>{queuedActions.value} queued offline action{queuedActions.value === 1 ? '' : 's'}</span
					>
				{/if}
			</footer>
		{/snippet}
	</LiveResource>
</div>

<style>
	.full-page {
		position: absolute;
		inset: 0;
		display: grid;
		place-content: stretch;
		place-items: stretch;
		z-index: -1;
		grid-template-rows: auto auto;
		grid-auto-rows: 1fr;
		overflow: hidden;
	}

	.header {
		background: #23875d;
		color: #fff;
		display: grid;
		grid-template-columns: [top-left-start] 1fr [top-left-end right-start] auto [right-end];
		grid-template-rows: [right-start top-left-start] auto [top-left-end bottom-start] auto [right-end bottom-end];
		padding: 1ex 0 0 0;
	}

	.header-menu {
		margin: 0;
		padding: 0 1ex;
		display: block;
		width: 100%;
	}

	.document-tabs {
		grid-column: 1 / -1;
		display: flex;
		align-items: end;
		gap: 1px;
		min-height: 1.9rem;
		padding: 0 1ex;
		overflow-x: auto;
		overflow-y: hidden;
		background: #1f7753;
		scrollbar-width: thin;
	}

	.document-tab {
		display: inline-grid;
		grid-template-columns: minmax(0, auto) auto;
		align-items: center;
		gap: 0.45em;
		max-width: 16em;
		min-width: 4em;
		height: 1.75rem;
		padding: 0 0.55em;
		box-sizing: border-box;
		background: #d7e2e6;
		border: 1px solid #8aa0a8;
		border-bottom: none;
		color: #111;
		text-decoration: none;
		white-space: nowrap;
	}

	.document-tab.active {
		background: #fff;
		font-weight: bold;
	}

	.document-tab-label {
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.document-tab-close {
		width: 1.1rem;
		height: 1.1rem;
		padding: 0;
		border: 1px solid #8aa0a8;
		background: #eef3f4;
		color: #222;
		font: inherit;
		line-height: 1;
		cursor: pointer;
	}

	.header-titel {
		padding: 0 1.5em 1ex;
		grid-area: top-left;
	}

	.nav-link {
		user-select: none;
	}

	.menu-bar {
		display: flex;
		margin: 0;
		padding: 0;
		list-style: none;
		gap: 1ex;
		user-select: none;
		max-width: 20vw;
		overflow: visible;
		grid-area: bottom;
	}

	.menu-bar-item {
		position: relative;
		padding: 1.2ex 1em;
	}

	.menu-bar-item {
		cursor: pointer;
	}

	.menu-bar-item:hover {
		background: #0004;
	}

	.menu-bar:focus-within .menu-bar-item:hover {
		background: #fff;
		color: #000;
		box-shadow: 0 -1px 4px -1px #0006;
	}

	.menu-bar-menu {
		pointer-events: all;
		z-index: 10000;
		position: absolute;
		left: 0;
		top: 100%;
		background: #fff;
		color: #000;
		padding: 0;
		list-style: none;
		display: none;
		flex-direction: column;
		gap: 0.25ex;
		padding: 0.5ex;
		min-width: 100%;
		width: max-content;
		box-shadow: 0 6px 10px -6px #0006;
	}

	.menu-bar:focus-within > .menu-bar-menu {
		display: flex;
	}

	.menu-bar-menu:has(:hover, :focus) {
		display: flex;
	}
	.menu-bar:focus-within .menu-bar-item:hover > .menu-bar-menu {
		display: flex;
	}

	.menu-bar-menu.open {
		display: flex;
	}

	.menu-bar-menu-item {
		display: flex;
		width: 100%;
		cursor: default;
	}

	.menu-bar-menu-item.submenu {
		position: relative;
	}

	.menu-bar-menu-item.submenu > .menu-bar-menu {
		left: 100%;
		top: -0.5ex;
	}

	.menu-bar-menu-item.submenu:hover > .menu-bar-menu,
	.menu-bar-menu-item.submenu:focus-within > .menu-bar-menu {
		display: flex;
	}

	.menu-bar-menu-ruler {
		margin: 0.5ex 0;
		border: none;
		border-top: 1px solid #aaa;
	}

	.menu-bar-item-button {
		text-align: left;
		border: none;
		background: none;
		font: inherit;
		cursor: pointer;
		flex-grow: 1;
		width: 100%;
		box-sizing: border-box;
		padding: 1ex 4em 1ex 1ex;
	}

	.menu-bar-item-button.active {
		font-weight: bold;
	}

	.document-window-menu-entry {
		display: grid;
		grid-template-columns: minmax(12rem, 1fr) auto;
		align-items: stretch;
	}

	.document-window-menu-entry .menu-bar-item-button {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		padding-right: 1ex;
	}

	.menu-bar-item-icon-button {
		border: none;
		background: none;
		font: inherit;
		padding: 0 1ex;
		cursor: pointer;
	}

	.menu-bar-item-icon-button:hover {
		background: #eee;
	}

	.submenu-trigger {
		display: flex;
		justify-content: space-between;
		gap: 3em;
		padding-right: 1ex;
	}

	.submenu-arrow {
		font-size: 1.2em;
		line-height: 0.8;
		margin-left: auto;
	}

	.new-sim-action {
		color: #090;
	}
	@media (pointer: fine) {
		.new-sim-action:not(:disabled):hover {
			background: #090;
			color: #fff;
		}

		.new-sim-action:not(:disabled):active {
			background: #5a5 !important;
			color: #fff !important;
		}

		.new-sim-action:not(:disabled):focus {
			background: #5a5;
			color: #fff;
		}
	}

	.menu-bar-item-button:hover {
		background: #eee;
	}

	.menu-bar-item-button:not(:disabled):active {
		background: #e0e0e0;
	}

	.menu-bar-item-button:disabled {
		color: #8a8a8a;
		cursor: default;
	}

	.menu-bar-item-danger {
		color: #a00;
	}

	h2 {
		margin: 0;
		white-space: nowrap;
		max-width: 80vw;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.overlay {
		z-index: 100;
		display: grid;
		grid-template-columns:
			[body-start] 0.5ex [left-start] auto [left-end top-start topsubbar-start] 1fr[topsubbar-end right-start] max(
				20vw
			)
			[right-end top-end] 1em [body-end];
		grid-template-rows: [body-start] 0.5ex [top-start left-start] auto [top-end right-start topsubbar-start] 1fr [] auto [topsubbar-end left-end right-end] 1em [body-end];
		gap: 0.5em;
		overflow: hidden;
		width: 100vw;

		contain: strict;
	}

	.topsubbar {
		grid-area: topsubbar;
		z-index: 100;
		align-self: end;
		display: flex;
		flex-direction: column;
		gap: 1ex;
	}

	.body {
		grid-area: body;
		place-self: stretch;
		position: relative;
		display: grid;
		touch-action: none;

		user-select: none;
		-webkit-user-select: none;

		-webkit-touch-callout: none;
		-webkit-user-callout: none;
		-webkit-user-select: none;
		-webkit-user-drag: none;
		-webkit-user-modify: none;
		-webkit-highlight: none;
	}

	.topbar {
		grid-area: top;
		align-self: start;
		z-index: 1;
	}

	.toolbar {
		padding: 1em 1em;
		background: #fff;
		box-shadow: 0 0 5px #0003;
		padding: 1em 1em;
		background: #fff;
		box-shadow: 0 0 5px #0003;
		border-radius: 0.5ex;
		z-index: 100;
		display: grid;
		grid-auto-flow: column;
		gap: 1ex;
		align-items: center;
		justify-content: start;
		justify-items: stretch;
		grid-auto-rows: 1fr;
		overflow: auto;
		scrollbar-width: none;
		user-select: none;
		overscroll-behavior: contain;
		touch-action: auto;
	}

	.toolbar.dense {
		padding: 0;
	}

	.toolbar-body {
		display: flex;
		align-items: center;
		justify-content: start;
		justify-items: stretch;
		flex-direction: inherit;
		padding: 1em;
		gap: 0.5ex;
	}

	.attribute-toolbar-body {
		display: flex;
		align-items: center;
		gap: 0.18rem;
		flex-wrap: nowrap;
		padding: 0.12rem 0.3rem;
		min-height: 2rem;
		max-height: 2rem;
		overflow-x: auto;
		overflow-y: hidden;
		scrollbar-width: thin;
		background: #fff;
		border: 1px solid #ddd;
		box-shadow: 0 0 5px #0002;
		font-size: 0.9rem;
	}

	.attribute-section-label {
		width: 1px;
		height: 1.55rem;
		border-left: 1px solid #cfcfcf;
		margin: 0 0.22rem;
		padding: 0;
		overflow: hidden;
		text-indent: -999px;
		flex: 0 0 auto;
	}

	.attribute-toolbar-body .pretty-select,
	.attribute-toolbar-body .pretty-number,
	.attribute-toolbar-body .pretty-color,
	.attribute-toolbar-body .pretty-checkbox-group {
		position: relative;
		display: grid;
		place-items: center;
		flex: 0 0 auto;
		width: 1.75rem;
		height: 1.75rem;
		min-width: 1.75rem;
		max-width: 1.75rem;
		grid-template-rows: none;
		padding: 0;
		margin: 0;
		gap: 0;
		align-self: center;
	}

	.attribute-toolbar-body .pretty-color-group {
		display: flex;
		align-items: center;
		gap: 0.1rem;
	}

	.attribute-toolbar-body .pretty-select-label,
	.attribute-toolbar-body .pretty-number-label,
	.attribute-toolbar-body .pretty-color-label,
	.attribute-toolbar-body .pretty-checkbox-group-head {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	.attribute-toolbar-body .pretty-select-value {
		display: grid;
		place-items: center;
		grid-area: 1 / 1;
		width: 1.75rem;
		height: 1.75rem;
		min-width: 1.75rem;
		max-width: 1.75rem;
		padding: 0;
		line-height: 1;
		background: #eee;
		border: 1px solid #aaa;
		border-radius: 2px;
		box-sizing: border-box;
		pointer-events: none;
	}

	.attribute-toolbar-body .pretty-select::after {
		content: '';
		position: absolute;
		right: 0.14rem;
		bottom: 0.12rem;
		width: 0;
		height: 0;
		border-left: 0.16rem solid transparent;
		border-right: 0.16rem solid transparent;
		border-top: 0.24rem solid #333;
		padding: 0;
		pointer-events: none;
		z-index: 2;
	}

	.attribute-toolbar-body .pretty-select-control {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		min-width: 0;
		opacity: 0;
		cursor: pointer;
	}

	.attribute-toolbar-body .pretty-number-control {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		min-width: 0;
		padding: 0;
		border: 0;
		background: #fff;
		text-align: center;
		opacity: 0;
		cursor: text;
		font: inherit;
	}

	.attribute-toolbar-body .pretty-number-control::placeholder {
		color: transparent;
	}

	.attribute-toolbar-body .pretty-color-value,
	.attribute-toolbar-body .pretty-checkbox-label {
		width: 1.75rem;
		height: 1.75rem;
		min-width: 1.75rem;
		max-width: 1.75rem;
		background: #eee;
		border: 1px solid #aaa;
		border-radius: 2px;
		box-sizing: border-box;
	}

	.attribute-toolbar-body .pretty-color-reset,
	.attribute-toolbar-body .pretty-color-clear {
		width: 1.75rem;
		height: 1.75rem;
		min-width: 1.75rem;
		padding: 0;
		background: #eee;
		border: 1px solid #aaa;
		border-radius: 2px;
	}

	.attribute-toolbar-body .pretty-color-reset .pretty-color-value,
	.attribute-toolbar-body .pretty-color-clear .pretty-color-value {
		width: 100%;
		height: 100%;
		min-width: 0;
		max-width: none;
		background: transparent;
		border: 0;
		box-shadow: none;
	}

	.attribute-toolbar-body .pretty-checkbox-group-body {
		gap: 0.15em;
	}

	.attribute-toolbar-body .pretty-color-control {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		opacity: 0;
		cursor: pointer;
	}

	.attribute-toolbar-body .attribute-symbol-value {
		display: grid;
		place-items: center;
		min-width: 1.75rem;
		max-width: 1.75rem;
		padding: 0;
		line-height: 1;
		color: #111;
		font-size: 0;
	}

	.attribute-toolbar-body .attribute-symbol-value svg {
		width: 1.2rem;
		height: 1.2rem;
		overflow: visible;
	}

	.attribute-toolbar-body .attribute-symbol-text {
		display: grid;
		place-items: center;
		font-family: serif;
		font-size: 1.05rem;
		font-weight: bold;
	}

	.attribute-toolbar-body .attribute-icon-number {
		display: grid;
		grid-template-columns: 1.75rem;
		place-items: center;
		overflow: hidden;
		background: #eee;
		border: 1px solid #aaa;
		border-radius: 2px;
		box-sizing: border-box;
		min-height: 1.75rem;
	}

	.attribute-toolbar-body .attribute-icon-number::before {
		content: attr(data-icon);
		display: grid;
		place-items: center;
		width: 1.75rem;
		height: 1.75rem;
		color: #111;
		font-family: serif;
		font-size: 0.95rem;
		font-weight: bold;
	}

	.attribute-toolbar-body .attribute-icon-number:focus-within {
		grid-template-columns: 1.45rem 2.4rem;
		width: 3.85rem;
		max-width: 3.85rem;
		overflow: visible;
		z-index: 3;
	}

	.attribute-toolbar-body .attribute-icon-number:focus-within::before {
		width: 1.45rem;
		height: 1.6rem;
		border-right: 1px solid #9fb4c6;
	}

	.attribute-toolbar-body .attribute-icon-number:focus-within .pretty-number-control {
		position: static;
		width: 2.4rem;
		height: 1.6rem;
		padding: 0 0.15rem;
		background: #fff;
		opacity: 1;
	}

	.attribute-toolbar-body .pretty-select:hover .pretty-select-value,
	.attribute-toolbar-body .pretty-color:hover .pretty-color-value,
	.attribute-toolbar-body .pretty-color-reset:hover,
	.attribute-toolbar-body .pretty-color-clear:hover,
	.attribute-toolbar-body .pretty-checkbox-label:hover,
	.attribute-toolbar-body .attribute-icon-number:hover {
		background: #f7f7f7;
	}

	.attribute-toolbar-body .pretty-select:focus-within .pretty-select-value,
	.attribute-toolbar-body .pretty-color:focus-within .pretty-color-value,
	.attribute-toolbar-body .pretty-color-reset:focus-visible,
	.attribute-toolbar-body .pretty-color-clear:focus-visible,
	.attribute-toolbar-body .pretty-checkbox:focus-within .pretty-checkbox-label,
	.attribute-toolbar-body .attribute-icon-number:focus-within {
		outline: 2px solid #23875d;
		outline-offset: -2px;
	}

	.attribute-empty {
		width: 1px;
		height: 1.75rem;
	}

	hr {
		flex-grow: 1;
		flex-shrink: 0;
		flex-basis: 1px;
		align-self: stretch;
		justify-self: stretch;
		flex-basis: 1px;
		margin: 0;
		border: none;
		border-top: 1px solid gray;
		border-left: 1px solid gray;
	}

	.toolbar.vertical {
		grid-auto-flow: row;
		grid-auto-columns: 1fr;
		grid-auto-rows: auto;
	}

	.toolbar.vertical.create-toolbar {
		--create-toolbar-width: 330px;
		--create-tool-cell: 2.25rem;
		--create-tool-icon: 1.78rem;
		--create-tool-gap: 0.12rem;
		align-items: stretch;
		background: #fff;
		border: 1px solid #d5dfdc;
		border-left: 4px solid #23875d;
		box-shadow: 0 2px 8px #0001;
		box-sizing: border-box;
		gap: 0.28rem;
		max-width: 34rem;
		min-width: 9rem;
		padding: 0.35rem 0.55rem 0.35rem 0.35rem;
		position: relative;
		width: var(--create-toolbar-width);
	}

	.create-toolbar-header {
		align-items: center;
		background: #f2f6f5;
		border: 1px solid #d5dfdc;
		color: #111;
		display: flex;
		font-size: 0.76rem;
		font-weight: bold;
		justify-content: space-between;
		line-height: 1.2;
		min-height: 1.45rem;
		padding: 0 0.35rem;
		user-select: none;
	}

	.create-toolbar-resize-handle {
		bottom: 0.25rem;
		cursor: ew-resize;
		position: absolute;
		right: 0;
		top: 0.25rem;
		width: 0.5rem;
	}

	.create-toolbar-resize-handle::before {
		background:
			linear-gradient(#23875d, #23875d) center / 1px 70% no-repeat,
			linear-gradient(#0000, #0000);
		border-radius: 2px;
		content: '';
		inset: 0.15rem 0.18rem;
		opacity: 0.35;
		position: absolute;
	}

	.create-toolbar-resize-handle:hover::before,
	.create-toolbar-resize-handle:focus-visible::before {
		opacity: 0.9;
	}

	.statusbar {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 250;
		display: grid;
		grid-template-columns: auto auto 1fr auto;
		gap: 2em;
		align-items: center;
		padding: 0.25em 0.75em;
		background: #eeeeee;
		border-top: 1px solid #9a9a9a;
		box-shadow: 0 -1px 3px #0002;
		color: #222;
		font-size: 0.78rem;
		user-select: text;
	}

	.sidebar {
		align-self: start;
		justify-self: start;
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 1ex;
		z-index: 1;
	}

	.sidebar.left {
		grid-area: left;
		max-height: 100%;
		overflow: auto;
		scrollbar-width: thin;
	}

	.sidebar.right {
		grid-area: right;
		justify-self: stretch;
		max-height: 100%;
	}

	@media (max-width: 40em) {
		.sidebar.right {
			display: none;
		}
	}

	a {
		color: inherit;
	}

	select {
		flex-grow: 1;
		width: 100%;
		box-sizing: border-box;
		font: inherit;
		height: 100%;
		box-sizing: border-box;
	}

	.attribute-select {
		flex-grow: 1;
		width: 100%;
		font: inherit;
		height: 100%;
		box-sizing: border-box;
		padding: 0.5ex 1em;
		max-width: 10em;
		min-width: 6em;
	}

	.color-swatch {
		box-sizing: border-box;
		padding: 0;
		height: 100%;
		background: none;
		border: none;
		width: auto;
		min-width: 2em;
		aspect-ratio: 1;
	}

	.number-spinner {
		box-sizing: border-box;
		padding: 0.5ex;
		height: 100%;
	}

	option {
		font: inherit;
	}

	select option:checked {
		background-color: #23875d;
		background-image: linear-gradient(#23875d, #23875d);
		color: #fff;
	}

	.droppable {
		cursor: move;
	}

	.create-primitive-tool {
		align-content: center;
		background: linear-gradient(#f8fbfd, #dce8f2);
		border: 1px solid #8fa8ba;
		border-radius: 2px;
		box-shadow:
			inset 1px 1px 0 #ffffff,
			inset -1px -1px 0 #b8c8d4;
		box-sizing: border-box;
		color: #000;
		display: grid;
		height: var(--create-tool-cell);
		justify-content: center;
		outline: 1px solid transparent;
		outline-offset: 1px;
		min-height: var(--create-tool-cell);
		min-width: var(--create-tool-cell);
		position: relative;
		width: var(--create-tool-cell);
	}

	.create-tool-group {
		background: #fff;
		border: 1px solid #9fb4c6;
		display: grid;
		gap: 0.16rem;
		padding: 0.18rem;
	}

	.create-tool-group:first-of-type {
		border-top: 1px solid #d5dfdc;
	}

	.create-tool-group-body {
		display: grid;
		gap: var(--create-tool-gap);
		grid-template-columns: repeat(auto-fill, var(--create-tool-cell));
		justify-content: start;
		justify-items: stretch;
	}

	.create-tool-group-title {
		align-items: center;
		background: #c8d7e2;
		border: 1px solid #9fb4c6;
		color: #111;
		cursor: pointer;
		display: flex;
		font-size: 0.75rem;
		gap: 0.35em;
		justify-content: start;
		justify-self: stretch;
		line-height: 1.2;
		overflow: hidden;
		padding: 0.15rem 0.25rem;
		text-align: center;
		text-overflow: ellipsis;
		user-select: none;
		white-space: nowrap;
	}

	.create-tool-group-title:hover {
		background: #d7e3ec;
	}

	.create-tool-group-title:focus-visible {
		outline: 2px solid #23875d;
	}

	.create-tool-group-arrow {
		display: inline-block;
		font-weight: bold;
		text-align: center;
		width: 1em;
	}

	.static-create-tool-group-title {
		cursor: default;
	}

	.insert-tool-group-body {
		align-items: center;
		grid-template-columns: var(--create-tool-cell) var(--create-tool-cell);
	}

	.create-primitive-tool > svg {
		height: var(--create-tool-icon);
		overflow: visible;
		width: var(--create-tool-icon);
	}

	.create-primitive-tool:hover {
		background: linear-gradient(#ffffff, #e7f1f8);
	}

	.create-primitive-tool.selectable-create {
		cursor: pointer;
	}

	.create-primitive-tool.selectable-create svg {
		cursor: pointer;
	}

	.create-primitive-tool.disabled-create-tool,
	.create-primitive-tool.disabled-create-tool svg {
		cursor: default;
	}

	.create-primitive-tool.blueprint-create-tool {
		background: #eee;
		border: 1px solid #aaa;
		color: #000;
	}

	.create-primitive-tool.active-create-tool {
		background: #333;
		outline-color: #333;
		color: #fff;
	}

	.create-primitive-tool.persistent-create-tool {
		outline-style: dashed;
	}

	.tool-button {
		border: none;
		background: #eee;
		border-radius: 2px;
		color: #000;
		font: inherit;
		padding: 1ex;
		cursor: pointer;
		border: 1px solid #aaa;
	}

	.tool-button:hover {
		background: #f7f7f7;
	}

	.tool-button:active {
		background: #e0e0e0;
	}

	.tool-button:focus-visible {
		outline: 2px solid #23875d;
	}

	.attribute-field {
		background: #eee;
		border-radius: 2px;
		border: 1px solid #aaa;
	}

	.attribute-field:hover {
		background: #f7f7f7;
	}

	.attribute-field:active {
		background: #e0e0e0;
	}

	.attribute-field:focus-visible {
		outline: 2px solid #23875d;
	}

	.attribute-field-label {
		display: flex;
		align-items: center;
		gap: 1ex;
		white-space: nowrap;
	}

	.presence-list {
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: 1.5ex;
		list-style: none;
		padding: 1ex;
		margin: 0 2em 0 0;
		align-self: center;
		margin-left: auto;
		position: relative;
		cursor: default;
		grid-area: right;
		align-self: end;
	}

	.presence-list-total {
		position: absolute;
		right: -0.75em;
		top: 0;
		bottom: 0.5ex;
		text-align: center;
		align-items: center;
		align-content: center;
		color: #fff;
		font-weight: bold;
	}

	.draggable {
		pointer-events: all;
		cursor: default;
	}

	rect.area-selection {
		stroke: #0af;
		fill: #0af;
		fill-opacity: 0.12;
		stroke-width: 1.5;
		stroke-dasharray: 6 4;
		vector-effect: non-scaling-stroke;
		pointer-events: none;
	}

	.primitive-creation-preview-shape {
		stroke-width: 1;
		vector-effect: non-scaling-stroke;
		pointer-events: none;
	}

	.primitive-creation-preview-line {
		stroke-width: 1.5;
	}

	.primitive-creation-hitbox {
		cursor: crosshair;
	}

	.inline-text-editor-object {
		overflow: visible;
		pointer-events: all;
	}

	.inline-text-editor-rect {
		fill: #23875d;
		stroke-width: 0;
		vector-effect: non-scaling-stroke;
	}

	.inline-text-editor-control {
		width: 100%;
		height: 100%;
		box-sizing: border-box;
		resize: none;
		overflow: hidden;
		padding: 0;
		border: none;
		outline: 1px solid #23875d;
		border-radius: 2px;
		background: #fff;
		line-height: 1.2;
		border: 1px solid transparent;
		white-space: pre;
		pointer-events: all;
		touch-action: auto !important;
		user-select: text !important;
		-webkit-user-select: text !important;
		-webkit-user-modify: read-write !important;
		-webkit-touch-callout: default !important;
	}

	.inline-text-editor-control::-webkit-scrollbar {
		display: none;
	}

	.inline-text-editor-control:focus {
		outline: 2px solid #23875d;
		outline-offset: 0;
	}

	rect.selected {
		stroke: var(--selection-color, #7af);
		fill: var(--selection-color, #7af);
		fill-opacity: 0.3;
		stroke-width: 5;
		vector-effect: non-scaling-stroke;
		pointer-events: none;
		stroke-linecap: round;
		stroke-linejoin: round;
		paint-order: stroke;
		outline: none;
	}

	path.selected {
		stroke: var(--selection-color, #7af);
		pointer-events: none;
	}
	g.selected {
		stroke: var(--selection-color, #7af);
		fill: var(--selection-color, #7af);
		stroke-width: 5;
		pointer-events: none;
		stroke-linecap: butt;
		stroke-linejoin: round;
	}

	rect.link-selected {
		stroke-dasharray: 3 10;
		stroke: var(--selection-color, #7af);
		fill: var(--selection-color, #7af);
		fill-opacity: 0.3;
		stroke-width: 5;
		vector-effect: non-scaling-stroke;
		pointer-events: none;
		stroke-linecap: round;
		stroke-linejoin: round;
		paint-order: stroke;
		outline: none;
	}

	path.link-selected {
		stroke-dasharray: 5 20;
		stroke: var(--selection-color, #7af);
		pointer-events: none;
	}
	g.link-selected {
		stroke-dasharray: 5 20;
		stroke: var(--selection-color, #7af);
		fill: var(--selection-color, #7af);
		stroke-width: 5;
		pointer-events: none;
		stroke-linecap: butt;
		stroke-linejoin: round;
	}

	textarea {
		width: 100%;
	}

	.tool-selector {
		padding: 1ex;
		cursor: pointer;
		position: relative;
	}

	.tool-selector[data-tooltip]:hover::after,
	.tool-selector[data-tooltip]:focus-visible::after,
	.create-primitive-tool[data-tooltip]:hover::after,
	.create-primitive-tool[data-tooltip]:focus-visible::after {
		background: #ffffe1;
		border: 1px solid #777;
		box-shadow: 1px 1px 2px #0002;
		color: #111;
		content: attr(data-tooltip);
		font-size: 0.75rem;
		left: 100%;
		line-height: 1.2;
		margin-left: 0.35rem;
		max-width: 18rem;
		padding: 0.25rem 0.35rem;
		pointer-events: none;
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		white-space: nowrap;
		z-index: 2000;
	}

	.toolbar-body .tool-selector[data-tooltip]:hover::after,
	.toolbar-body .tool-selector[data-tooltip]:focus-visible::after {
		left: 0;
		margin-left: 0;
		margin-top: 0.35rem;
		top: 100%;
		transform: none;
	}

	.toolbar.vertical.create-toolbar .create-primitive-tool[data-tooltip]:hover::after,
	.toolbar.vertical.create-toolbar .create-primitive-tool[data-tooltip]:focus-visible::after {
		content: none;
		display: none;
	}

	.tool-selector.active {
		background: #333;
		color: #fff;
	}

	.tool-radio {
		display: none;
	}

	.hidden {
		display: none;
	}

	.form-button {
		background: black;
		color: #fff;
		padding: 1ex;
		border: none;
		cursor: pointer;
	}

	.form-button:hover {
		background: #222;
	}

	.form-field {
		box-sizing: border-box;
		padding: 1ex;
		font: inherit;
		min-width: 5em;
	}

	.command-console {
		align-items: start;
		display: grid;
		gap: 1ex;
		grid-template-columns: auto minmax(22rem, 1fr);
		max-width: min(56rem, 82vw);
	}

	.command-console input,
	.command-console textarea {
		width: 100%;
	}

	.command-console-actions {
		display: flex;
		gap: 1ex;
		justify-content: flex-end;
	}

	.command-console-output {
		font-family: monospace;
		min-height: 12rem;
		resize: vertical;
		white-space: pre;
	}

	.tool-options-dialog {
		min-width: min(24rem, 80vw);
		max-width: min(34rem, 85vw);
	}

	.tool-options-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 1rem;
	}

	.tool-options-actions button {
		border: 1px solid #999;
		background: #f4f4f4;
		padding: 0.45rem 0.8rem;
		font: inherit;
		cursor: pointer;
	}

	.tool-options-actions button:hover {
		background: #e8eef6;
	}

	[role='button'] {
		outline: none;
	}

	g {
		-webkit-tap-highlight-color: transparent;
	}

	.pretty-select {
		display: grid;
		grid-template-columns: [full-start] 1fr [full-end];
		grid-template-rows: [full-start label-start] max-content [label-end value-start] max-content [value-end full-end];
		align-items: stretch;
		justify-items: stretch;
		max-width: 12em;
		padding: 0.1ex;
		gap: 0.1ex;
		flex-grow: 1;
	}

	.pretty-select::after {
		content: '▼';
		grid-area: value / full;
		align-self: center;
		justify-self: end;
		display: block;
		padding: 5px;
		color: #aaa;
	}

	.pretty-select-value {
		grid-area: value / full;
		display: block;
		width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		background: #fafafa;
		padding: 0.5ex;
		border: 1px solid #e0e0e0;
		box-sizing: border-box;
	}

	.pretty-select:focus-within > .pretty-select-value {
		outline: 3px solid #23875d;
	}

	.pretty-select-label {
		grid-area: label / full;
		display: block;
		text-transform: uppercase;
	}

	.pretty-select-control {
		display: block;
		grid-area: full;
		width: 100%;
		opacity: 0;
		min-width: 10em;
		-webkit-appearance: none;
		appearance: none;
	}

	.pretty-number {
		display: grid;
		grid-template-columns: [full-start] 1fr [full-end];
		grid-template-rows: [full-start label-start] max-content [label-end value-start] max-content [value-end full-end];
		align-items: stretch;
		justify-items: stretch;
		max-width: 12em;
		padding: 0.1ex;
		gap: 0.1ex;
	}

	.pretty-number-label {
		grid-area: label / full;
		display: block;
		text-transform: uppercase;
	}

	.pretty-number-control {
		display: block;
		grid-area: value / full;
		width: 100%;
		background: #fafafa;
		padding: 0.5ex;
		border: 1px solid #e0e0e0;
		box-sizing: border-box;
		min-width: 6em;
	}

	.pretty-number-control:focus {
		outline: 3px solid #23875d;
	}

	.pretty-color-label:has(~ :focus) {
		color: #23875d;
	}

	.pretty-number-label:has(~ :focus) {
		color: #23875d;
	}

	.pretty-select-label:has(~ :focus) {
		color: #23875d;
	}

	.pretty-color {
		display: grid;
		grid-template-columns: [full-start] 1fr [full-end];
		grid-template-rows: [full-start label-start] max-content [label-end value-start] max-content [value-end full-end];
		align-items: stretch;
		justify-items: stretch;
		max-width: 12em;
		padding: 0.1ex;
		gap: 0.1ex;
	}

	.pretty-color-value {
		grid-area: value / full;
		display: block;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		height: 1.8em;
		aspect-ratio: 1;
		font-family: serif;
		font-weight: bold;
		stroke-linejoin: round;
		stroke-linecap: round;
	}

	.pretty-color-group {
		display: grid;
		grid-template-columns: 1fr 1fr;
		align-items: end;
	}

	.pretty-color-reset {
		background: none;
		border: none;
		padding: 0;
		width: 100%;
		min-width: 2em;
		font: inherit;
		cursor: pointer;
	}

	.pretty-color-reset:disabled {
		opacity: 0.1;
		cursor: default;
	}

	.pretty-color-control:focus + svg .swatch-rect,
	.pretty-color-control:active + svg .swatch-rect {
		stroke: #23875d;
	}

	.pretty-color-label {
		grid-area: label / full;
		display: block;
		text-transform: uppercase;
	}

	.pretty-color-control {
		display: block;
		grid-area: full;
		width: 100%;
		opacity: 0;
	}

	.pretty-checkbox {
		display: grid;
		grid-template-columns: [full-start] 1fr [full-end];
		grid-template-rows: [full-start] 1fr [full-end];
		align-items: stretch;
		justify-items: stretch;
		align-self: end;
	}

	.pretty-checkbox-label {
		grid-area: full;
		width: 1.8em;
		height: 1.8em;
		box-sizing: border-box;
		font-family: serif;
		color: #aaa;
	}

	.pretty-checkbox-control {
		grid-area: full;
		opacity: 0;
	}

	.pretty-checkbox-control:checked + .pretty-checkbox-label {
		background: #23875d;
		border-radius: 2px;
		color: #fff;
	}

	.pretty-select-label::after,
	.pretty-number-label::after,
	.pretty-color-label::after,
	.pretty-checkbox-group-head::after {
		content: ': ';
		color: #888;
	}

	.pretty-select-label,
	.pretty-number-label,
	.pretty-color-label,
	.pretty-checkbox-group-head {
		white-space: nowrap;
		color: #555;
		font-size: 0.6rem;
	}

	.pretty-checkbox-group {
		display: grid;
		grid-template-columns: [full-start] 1fr [full-end];
		grid-template-rows: [full-start label-start] max-content [label-end value-start] max-content [value-end full-end];
		align-items: stretch;
		justify-items: stretch;
		max-width: 12em;
		padding: 0.1ex;
		gap: 0.1ex;
	}

	.pretty-checkbox-group-head {
		grid-area: label;
		text-transform: uppercase;
	}

	.pretty-checkbox-group-body {
		grid-area: value;
		display: flex;
		gap: 0.25ex;
	}

	.delete-button {
		background: #a00;
		color: #fff;
		border: none;
		padding: 1ex;
		cursor: pointer;
	}

	.action-button {
		background: #333;
		color: #fff;
		border: none;
		padding: 1ex;
		cursor: pointer;
		align-self: end;
	}

	.delete-button:disabled {
		background: #aaa;
		cursor: default;
	}

	.delete-button:not(:disabled):hover {
		background: #a22;
	}
	.delete-button:not(:disabled):active {
		background: #900;
	}

	:global(.droparea) * {
		pointer-events: none;
	}

	.tool-spacer {
		border: none;
		background: #aaa;
	}
	.hierarchy-panel {
		grid-template-rows: auto 1fr auto auto auto;
	}

	.menu-bar-menu::before {
		content: '';
		position: absolute;
		left: -2em;
		right: -2em;
		bottom: -2em;
		top: 0;
		z-index: 10;
	}
	.menu-bar-menu-item {
		z-index: 200;
	}

	.submenu-menu::before {
		content: '';
		position: absolute;
		z-index: 5;
		left: -1em;
		right: -2em;
		bottom: -2em;
		top: -2em;
	}
</style>
