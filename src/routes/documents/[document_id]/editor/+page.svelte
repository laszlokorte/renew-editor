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

	const { data } = $props();

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
	const showHierarchy = view(['hierarchy', L.valueOr(true)], viewOptions);
	const showCursors = view(['remoteCursors', L.valueOr(true)], viewOptions);
	const showOtherSelections = view(['remoteSelections', L.valueOr(true)], viewOptions);
	const lockRotation = view(['rotationLock', L.valueOr(false)], viewOptions);
	const gridDistance = view(['distance', L.valueOr(32)], gridView);

	const showRename = atom(false);
	const backoffValue = atom(undefined);
	const pointerOffset = atom({ x: 0, y: 0 });
	const gridDistanceExp = view(logLens(2), gridDistance);

	const dropperDomElement = atom(undefined);

	const optimisticValue = atom(null);
	const optimisticLens = (id, attr, persistentLens) => {
		return L.lens(
			(store) =>
				store && store.optimistic && store.optimistic.id === id && store.optimistic.attr === attr
					? store.optimistic.value
					: L.get(persistentLens, store.real),
			(newValue, { optimistic, real }) => ({
				optimistic: newValue === undefined ? undefined : { id, attr, value: newValue },
				real: newValue === undefined ? real : L.set(persistentLens, newValue, real)
			})
		);
	};

	function hasTransferContent(trans, type) {
		return [...trans.types].includes(type);
	}

	function getTransferContent(trans, type) {
		if ([...trans.types].includes(type)) {
			const orig = trans.getData(type);
			if (orig) {
				return orig;
			} else {
				const plain = trans.getData('text/plain');
				if (plain) {
					return JSON.parse(plain)[type];
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

	function openTargetLocation(evt, layer) {
		if (activeTool.value !== 'select') {
			return false;
		}

		const location = layer?.style?.target_location;
		if (!evt.ctrlKey || !location) {
			return false;
		}

		let target;
		try {
			target = new URL(location, window.location.href);
		} catch {
			return false;
		}

		if (target.protocol !== 'http:' && target.protocol !== 'https:') {
			return false;
		}

		evt.preventDefault();
		evt.stopPropagation();

		// macOS dispatches a contextmenu event for control-clicks; avoid opening twice
		// when the same user gesture also produces a click event.
		const now = performance.now();
		if (now - lastTargetLocationOpen > 250) {
			window.open(target.href, '_blank', 'noopener,noreferrer');
			lastTargetLocationOpen = now;
		}

		return true;
	}

	const tools = [
		{ name: 'Select', id: 'select' },
		{
			name: 'Magnifier',
			id: 'magnifier',
			reset: (cameraScroller, cameraFocus) => {
				cameraScroller.resetCamera();
			}
		},
		{
			name: 'Pan',
			id: 'paner',
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
			name: 'Zoom',
			id: 'zoomer',
			reset: (cameraScroller, cameraFocus) => {
				cameraScroller.resetCamera();
			}
		},
		{
			name: 'Rotate',
			id: 'rotator',
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
		{ name: 'Pen', id: 'pen' },
		{ name: 'Edge', id: 'edge' },
		{ name: 'Polygon', id: 'polygon' },
		{ name: 'Spacer', id: 'spacer' }

		// Splines are not supported by the editor server yet
		//{ name: 'Spline', id: 'spline' }
	];
	const activeTool = atom('select');
	const CREATE_TOOL_ID = 'create';
	const LAYER_PRIMITIVE_MIME_TYPE = 'application/json+renewex-layer';
	const BLUEPRINT_MIME_TYPE = 'application/json+renewex-blueprint';
	const CIRCLE_SHAPE_ID = '3B66E69A-057A-40B9-A1A0-9DB44EF5CE42';
	const PRIMITIVE_CREATION_DRAG_THRESHOLD = 4;
	const activeCreateTool = atom(undefined);
	let primitiveCreation = atom(undefined);
	let inlineTextEdit = atom(undefined);

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
	const PETRISTATION_CLIPBOARD_FORMAT = 'petristation/layer-clipboard';
	const PETRISTATION_CLIPBOARD_STORAGE_KEY = 'petristation:layer-clipboard';
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

	function selectLayer(cast, id, evt) {
		if (!id) {
			return selectedLayers.value;
		}

		return evt?.shiftKey ? toggleLayerSelection(cast, id) : publishSelection(cast, [id]);
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

	function isTransitionLayer(layer) {
		const tag = layer?.semantic_tag ?? '';
		return tag === 'de.renew.gui.TransitionFigure' || tag.endsWith('.TransitionFigure');
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

	function isNodeLayer(layer) {
		return isTransitionLayer(layer) || isPlaceLayer(layer);
	}

	function isArcLayer(layer) {
		const tag = layer?.semantic_tag ?? '';
		return !!layer?.edge && tag.endsWith('ArcConnection');
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

	function writeStoredClipboard(clipboard) {
		try {
			localStorage.setItem(
				PETRISTATION_CLIPBOARD_STORAGE_KEY,
				encodePetriStationClipboard(clipboard)
			);
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

	async function writeSystemClipboard(clipboard) {
		writeStoredClipboard(clipboard);

		if (!navigator.clipboard?.writeText) {
			return false;
		}

		try {
			await navigator.clipboard.writeText(encodePetriStationClipboard(clipboard));
			return true;
		} catch {
			return false;
		}
	}

	async function readSystemClipboard() {
		if (navigator.clipboard?.readText) {
			try {
				const clipboard = decodePetriStationClipboard(await navigator.clipboard.readText());
				if (clipboard) {
					return clipboard;
				}
				return SYSTEM_CLIPBOARD_WITHOUT_LAYERS;
			} catch {
				// Fall back to the shared same-origin clipboard below.
			}
		}

		return readStoredClipboard();
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
			return clipboardHasLayers(result?.clipboard) ? result.clipboard : null;
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
		}).then((result) => {
			if (result?.layer_ids?.length) {
				publishSelection(cast, result.layer_ids);
			}
			return result;
		});
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

	let deleteShortcutContext = { cast: null, layersInOrder: null };

	function syncDeleteShortcutContext(cast, layersInOrder) {
		deleteShortcutContext = { cast, layersInOrder };
		return null;
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
			!deleteShortcutContext.layersInOrder
		) {
			return;
		}

		evt.preventDefault();
		deleteSelectedLayers(deleteShortcutContext.cast, deleteShortcutContext.layersInOrder.value);
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
		const moving = new Set(groupDrag.value?.previewLayerIds ?? groupDrag.value?.layerIds ?? []);
		if (!moving.size) {
			return false;
		}

		const layerInfo = layersInOrderValue.find((layer) => layer.id === layerId);
		return moving.has(layerId) || layerInfo?.parents.some((parent) => moving.has(parent));
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
			return {
				...layer,
				edge: {
					...layer.edge,
					source_x: layer.edge.source_x + delta.x,
					source_y: layer.edge.source_y + delta.y,
					target_x: layer.edge.target_x + delta.x,
					target_y: layer.edge.target_y + delta.y,
					waypoints: moveWaypointList(layer.edge.waypoints, delta)
				}
			};
		}

		return layer;
	}

	function moveLayersLocally(docAtom, layerIds, delta, layersInOrderValue) {
		const moving = expandedMoveLayerIds(layerIds, layersInOrderValue, docAtom.value);
		docAtom.value = {
			...docAtom.value,
			layers: {
				...docAtom.value.layers,
				items: docAtom.value.layers.items.map((layer) =>
					moving.has(layer.id) ? moveLayerValue(layer, delta) : layer
				)
			}
		};
	}

	function beginLayerMove(evt, liveLenses, layerId, layersInOrderValue, docValue) {
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

	function updateLayerMove(evt, liveLenses) {
		if (
			evt.isPrimary &&
			groupDrag.value?.pointerId === evt.pointerId &&
			evt.currentTarget.hasPointerCapture(evt.pointerId)
		) {
			evt.stopPropagation();
			evt.preventDefault();
			const world = liveLenses.clientToCanvas(evt.clientX, evt.clientY);
			update(L.set(L.props('cx', 'cy'), { cx: world.x, cy: world.y }), groupDrag);
		}
	}

	function updateSelectionMoveFromHandle(evt, liveLenses) {
		if (groupDrag.value?.pointerId !== evt.pointerId) {
			return false;
		}

		updateLayerMove(evt, liveLenses);
		return true;
	}

	function commitLayerMove(layerIds, delta, dispatch) {
		return dispatch('move_layer_relative', {
			layer_ids: uniqueLayerIds(layerIds),
			dx: delta.x,
			dy: delta.y
		});
	}

	function finishLayerMove(evt, dispatch, docAtom, layersInOrderValue) {
		if (groupDrag.value?.pointerId !== evt.pointerId) {
			return;
		}

		evt.stopPropagation();
		evt.preventDefault();

		const delta = groupDragDelta.value;
		const layerIds = uniqueLayerIds(groupDrag.value.layerIds);

		if (!layerIds.length || (!delta.x && !delta.y)) {
			if (evt.currentTarget.hasPointerCapture(evt.pointerId)) {
				evt.currentTarget.releasePointerCapture(evt.pointerId);
			}
			groupDrag.value = undefined;
			return;
		}

		moveLayersLocally(docAtom, layerIds, delta, layersInOrderValue);
		groupDrag.value = undefined;

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

	function normalizedBox({ start, current }) {
		const minX = Math.min(start.x, current.x);
		const minY = Math.min(start.y, current.y);
		const maxX = Math.max(start.x, current.x);
		const maxY = Math.max(start.y, current.y);

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

	function linkedPrimitiveTargetAtPosition(
		position,
		layersInOrderValue,
		docValue,
		textBoundsValue,
		tolerance
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

			if (layer.box || edgeContainsPoint(layer.edge, position, tolerance)) {
				return layer;
			}
		}

		return undefined;
	}

	function layersInsideBox(box, layersInOrderValue, docValue, textBoundsValue) {
		const layerById = new Map(docValue.layers.items.map((layer) => [layer.id, layer]));

		const selected = new Set(
			layersInOrderValue
				.filter(({ hidden }) => !hidden)
				.filter((layerInfo) => {
					const boundingBox = layerBox(layerInfo, layerById.get(layerInfo.id), textBoundsValue);
					return finiteBox(boundingBox) && boxContainsBox(box, boundingBox);
				})
				.map(({ id }) => id)
		);

		return layersInOrderValue
			.filter(({ hidden }) => !hidden)
			.filter(
				({ id, parents }) => selected.has(id) && !parents.some((parent) => selected.has(parent))
			)
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

		const start = liveLenses.clientToCanvas(evt.clientX, evt.clientY);
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
		return item?.data?.content?.semantic_tag ?? item?.name;
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
			linkedTargetId: undefined
		};
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
		primitiveCreation.value = undefined;
		inlineTextEdit.value = undefined;
		activeTool.value = CREATE_TOOL_ID;
		return true;
	}

	function selectEditorTool(toolId, cast = undefined) {
		clearSelectionForNonSelectTool(toolId, cast);
		activeCreateTool.value = undefined;
		primitiveCreation.value = undefined;
		inlineTextEdit.value = undefined;
		activeTool.value = toolId;
	}

	function resetToSelectTool() {
		selectEditorTool('select');
	}

	function isPrimitiveCreationDrag(creation) {
		if (!creation?.screenStart || !creation?.screenCurrent) {
			return false;
		}

		return (
			Math.abs(creation.screenCurrent.x - creation.screenStart.x) >=
				PRIMITIVE_CREATION_DRAG_THRESHOLD &&
			Math.abs(creation.screenCurrent.y - creation.screenStart.y) >=
				PRIMITIVE_CREATION_DRAG_THRESHOLD
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
			screenCurrent: { x: evt.clientX, y: evt.clientY }
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
			current: liveLenses.clientToCanvas(evt.clientX, evt.clientY),
			screenCurrent: { x: evt.clientX, y: evt.clientY }
		};
		evt.preventDefault();
		evt.stopPropagation();
		return true;
	}

	function primitiveSupportsSizedCreation(tool) {
		return tool?.type === 'primitive' && !!tool?.item?.data?.content?.shape_id;
	}

	function primitiveCreatesText(tool) {
		return tool?.type === 'primitive' && typeof tool?.item?.data?.content?.body === 'string';
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
		return content?.shape_id === CIRCLE_SHAPE_ID;
	}

	function primitiveNeedsLinkedTarget(tool) {
		return tool?.type === 'primitive' && !!tool?.item?.data?.content?.hyperlink;
	}

	function primitiveHasLinkedTarget(tool) {
		return !primitiveNeedsLinkedTarget(tool) || typeof tool?.linkedTargetId === 'string';
	}

	function canTargetLinkedPrimitive(tool, layer) {
		return (
			primitiveNeedsLinkedTarget(tool) &&
			typeof layer?.id === 'string' &&
			(!!layer?.box || !!layer?.edge)
		);
	}

	function canCreateUnlinkedTextPrimitive(tool) {
		return primitiveCreatesText(tool) && !primitiveNeedsLinkedTarget(tool);
	}

	function createUnlinkedTextPrimitiveAtEvent(evt, liveLenses, dispatch, baseLayerId) {
		const tool = activeCreateTool.value;
		if (!canCreateUnlinkedTextPrimitive(tool)) {
			return false;
		}

		const position = liveLenses.clientToCanvas(evt.clientX, evt.clientY);
		rememberPasteLocation(position);
		createPrimitiveLayer(tool, position, undefined, dispatch, baseLayerId);
		backoffValue.value = true;

		evt.preventDefault();
		evt.stopPropagation();
		return true;
	}

	function createLinkedPrimitiveOnLayer(evt, liveLenses, dispatch, layer) {
		const tool = activeCreateTool.value;
		if (!canTargetLinkedPrimitive(tool, layer)) {
			return false;
		}

		const position = liveLenses.clientToCanvas(evt.clientX, evt.clientY);
		rememberPasteLocation(position);
		createPrimitiveLayer(
			{ ...tool, linkedTargetId: layer.id },
			position,
			undefined,
			dispatch,
			layer.id
		);
		backoffValue.value = true;

		if (!tool.persistent && !keepCreateToolWhileEditingCreatedPrimitive(tool)) {
			resetToSelectTool();
		}

		evt.preventDefault();
		evt.stopPropagation();
		return true;
	}

	function createPrimitiveLayer(tool, position, size, dispatch, baseLayerId) {
		const content = { ...(tool?.item?.data?.content ?? {}) };
		const editCreatedPrimitive = shouldInlineEditCreatedPrimitive(tool);

		if (!primitiveHasLinkedTarget(tool)) {
			return;
		}

		if (editCreatedPrimitive) {
			content.body = '';
		}

		if (content.hyperlink) {
			content.hyperlink = tool.linkedTargetId;
		}

		const payload = {
			base_layer_id: baseLayerId,
			pos: position,
			...content
		};

		if (size) {
			payload.width = size.width;
			payload.height = size.height;
		}

		dispatch('create_layer', payload)
			.then((layer) => {
				if (editCreatedPrimitive && layer?.id) {
					inlineTextEdit.value = {
						id: layer.id,
						body: '',
						bounds: { lockToTextPosition: true },
						blankLines: !!content?.style?.blank_lines
					};
				}
			})
			.catch((e) => {
				errors.value = [...errors.value, e.message ?? 'Can not create layer'];
			});
	}

	function createBlueprintInstance(tool, position, dispatch) {
		dispatch('insert_document', {
			document_id: tool.blueprintId,
			position
		}).catch((e) => {
			errors.value = [...errors.value, e.message ?? 'Can not insert document'];
		});
	}

	function finishPrimitiveCreation(evt, liveLenses, dispatch, baseLayerId) {
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
					createPrimitiveLayer(
						tool,
						{ x: box.x + box.width / 2, y: box.y + box.height / 2 },
						{ width: box.width, height: box.height },
						dispatch,
						baseLayerId
					);
				} else if (tool.type === 'blueprint') {
					createBlueprintInstance(tool, creation.start, dispatch);
				} else {
					createPrimitiveLayer(tool, creation.start, undefined, dispatch, baseLayerId);
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

	function resetPrimitiveToolFromCanvas(evt) {
		if (!activeCreateTool.value) {
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
			update((e) => [...e, e.message], errors);
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
				update((errs) => [...errs, e.message], errors);
			})
			.then(() => {
				startingSimulation = false;
			});
	}

	function causeError(e) {
		update((e) => [...e, 'Some Error'], errors);
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
</script>

<svelte:document onkeydown={handleDocumentDeleteKeydown} />

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
		{#snippet children(doc, presence, { dispatch, cast })}
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
			{@const _deleteShortcutContext = syncDeleteShortcutContext(cast, layersInOrder)}
			{@const _layerMoveCommitSync = clearCommittedLayerMove(doc.value)}
			{@const extension = view(
				[
					'viewbox',
					L.pick({
						minX: 'x',
						minY: 'y',
						maxX: L.reread(({ x, width }) => x + width),
						maxY: L.reread(({ y, height }) => y + height)
					})
				],
				doc
			)}
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

			<Modal bind:visible={showRename.value} closeLabel="Cancel">
				{@const drawingKinds = [
					'CH.ifa.draw.standard.StandardDrawing',
					'de.renew.hierarchicalworkflownets.gui.HNViewDrawing',
					'de.renew.gui.CPNDrawing',
					'de.renew.sdnet.gui.SDNDrawing',
					'de.renew.diagram.drawing.DiagramDrawing'
				]}
				{@const syntaxes = {
					foo: 'baar'
				}}
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

			<header class="header">
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
										onclick={() => {
											alert('the document is saved automatically');
										}}>Save</MenuBarButton
									>
								</li>
								<li class="menu-bar-menu-item">
									<MenuBarButton
										onclick={() => {
											showRename.value = true;
										}}>Rename</MenuBarButton
									>
								</li>
								<li class="menu-bar-menu-item">
									<MenuBarButton
										onclick={() => {
											data.commands.duplicateDocument();
										}}>Duplicate</MenuBarButton
									>
								</li>
								<li class="menu-bar-menu-item">
									<MenuBarButton
										onclick={() => {
											data.commands.downloadJson();
										}}>Download JSON</MenuBarButton
									>
								</li>
								<li class="menu-bar-menu-item">
									<MenuBarButton
										class="menu-bar-item-button"
										onclick={() => {
											data.commands.downloadStruct();
										}}>Download Struct</MenuBarButton
									>
								</li>
								<li class="menu-bar-menu-item">
									<MenuBarButton
										onclick={() => {
											data.commands.exportRenew();
										}}>export .rnw</MenuBarButton
									>
								</li>
								<li class="menu-bar-menu-item"><hr class="menu-bar-menu-ruler" /></li>
								<li class="menu-bar-menu-item">
									<MenuBarButton onclick={deleteThisDocument} style="color: #aa0000"
										>Delete Document</MenuBarButton
									>
								</li>
								<!--

								<li class="menu-bar-menu-item"><hr class="menu-bar-menu-ruler" /></li>
								<li class="menu-bar-menu-item">
									<button class="menu-bar-item-button" onclick={causeError} style="color: #aa0000"
										>Cause Error</button
									>
								</li>
								-->
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
										disabled={selectedLayers.value.length === 0}
										onclick={(evt) => {
											evt.preventDefault();
											wrapSelectedLayersInGroup(dispatch, cast, layersInOrder.value);
										}}>Wrap in Group</MenuBarButton
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
							Simulate
							<ul class={{ 'menu-bar-menu': true, open: startingSimulation }}>
								{#await data.formalisms then formalisms}
									<li class="menu-bar-menu-item">
										<label class="pretty-select" style="width: 100%; max-width: none">
											<span class="pretty-select-label">Formalism</span>
											<span class="pretty-select-value"
												>{L.get(
													[L.find(R.propEq(currentFormalism.value, 'id')), 'label'],
													formalisms
												)}</span
											>
											<select class="pretty-select-control" bind:value={currentFormalism.value}>
												{#each formalisms as { id, label } (id)}
													<option value={id}>{label}</option>
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
							</ul>
						</li>
					</ol>
				</menu>

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
							if (mime === 'application/json+renewex-layer') {
								const layerContent = { ...content };
								const editDroppedText = typeof layerContent.body === 'string';
								let baseLayerId = L.get('id', singleSelectedLayer.value);

								if (editDroppedText) {
									layerContent.body = '';
								}

								if (layerContent.hyperlink) {
									const linkedTargetId =
										typeof layerContent.hyperlink === 'string'
											? layerContent.hyperlink
											: linkedPrimitiveTargetAtPosition(
													pos,
													layersInOrder.value,
													doc.value,
													textBounds.value,
													12 * cameraScale.value
												)?.id;

									if (!linkedTargetId) {
										return;
									}

									layerContent.hyperlink = linkedTargetId;
									baseLayerId = linkedTargetId;
								}

								dispatch('create_layer', {
									base_layer_id: baseLayerId,
									pos,
									...layerContent
								}).then((l) => {
									if (editDroppedText && l?.id) {
										inlineTextEdit.value = {
											id: l.id,
											body: '',
											bounds: { lockToTextPosition: true },
											blankLines: !!layerContent?.style?.blank_lines
										};
									} else {
										publishSelection(cast, [l.id]);
									}
								});
							} else if (mime === 'application/json+renewex-blueprint') {
								dispatch('insert_document', {
									document_id: content.blueprint_id,
									position: pos
								});
							}
						}}
						onDropFile={(file, pos) => {
							const reader = new FileReader();
							reader.onload = function (event) {
								new Promise((res, reject) => {
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
											return data.commands.uploadSvg(doc.svg).then((j) => {
												return dispatch('create_layer', {
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
												});
											});
										} else {
											return cast('insert_file', {
												content: doc.data,
												file_name: file.name,
												x: pos.x,
												y: pos.y
											});
										}
									})
									.catch((e) => {
										errors.value = ['Can not insert file'];
									});
							};
							reader.readAsText(file);
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
											{...doc.value.viewbox}
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
											oncontextmenu={resetPrimitiveToolFromCanvas}
										/>
										{#if showGrid.value}
											<Grid {rotationTransform} {frameBoxObject} {cameraScale} {gridDistance} />
										{/if}

										<g transform={rotationTransform.value}>
											<g id="full-document-{data.document.id}">
												{#each layersInOrder.value as { index, id, depth, hidden } (id)}
													{#if !hidden}
														{@const el = view(
															['layers', 'items', L.find((el) => el.id == id)],
															doc
														)}

														{#if el.value?.box}
															<g
																role="button"
																data-editor-layer-id={el.value?.id}
																transform={layerMoveTransform(id, layersInOrder.value)}
																cursor={canvasInteractionCursor()}
																oncontextmenu={(evt) => {
																	openTargetLocation(evt, el.value);
																}}
																onpointerdown={(evt) =>
																	rememberPointerPasteLocation(evt, liveLenses)}
																onclick={(evt) => {
																	if (
																		createLinkedPrimitiveOnLayer(
																			evt,
																			liveLenses,
																			dispatch,
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
																stroke={el.value?.style?.border_color ?? 'black'}
																stroke-dasharray={el.value?.style?.border_dash_array ?? 'none'}
																stroke-width={el.value?.style?.border_width ?? '1'}
																opacity={el.value?.style?.opacity ?? '1'}
															>
																<Symbol
																	symbols={data.symbols}
																	symbolId={el.value?.box.shape}
																	shapeAttributes={el.value?.box.shape_attributes}
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
															{#key el.id}
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
																		openTargetLocation(evt, el.value);
																	}}
																	onpointerdown={(evt) =>
																		rememberPointerPasteLocation(evt, liveLenses)}
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
															<g
																role="button"
																data-editor-layer-id={el.value?.id}
																transform={layerMoveTransform(id, layersInOrder.value)}
																cursor={canvasInteractionCursor()}
																oncontextmenu={(evt) => {
																	openTargetLocation(evt, el.value);
																}}
																onpointerdown={(evt) =>
																	rememberPointerPasteLocation(evt, liveLenses)}
																onclick={(evt) => {
																	if (
																		createLinkedPrimitiveOnLayer(
																			evt,
																			liveLenses,
																			dispatch,
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
																stroke-linejoin={el.value?.edge?.style?.stroke_join ?? 'miter'}
																stroke-linecap={el.value?.edge?.style?.stroke_cap ?? 'butt'}
															>
																<path
																	d={edgePath[el.value?.edge?.style?.smoothness ?? 'linear'](
																		el.value?.edge,
																		L.get(localProp('waypoints'), el.value?.edge)
																	)}
																	pointer-events="stroke"
																	fill={el.value?.edge?.cyclic
																		? (el.value?.style?.background_color ?? 'none')
																		: 'none'}
																	stroke="none"
																	stroke-width={(el.value?.edge?.style?.stroke_width ?? 1) * 1 +
																		10 * cameraScale.value}
																/>
																<path
																	d={edgePath[el.value?.edge?.style?.smoothness ?? 'linear'](
																		el.value?.edge,
																		L.get(localProp('waypoints'), el.value?.edge)
																	)}
																	stroke-dasharray={el.value?.edge?.style?.stroke_dash_array ??
																		'none'}
																	fill={el.value?.edge?.cyclic
																		? (el.value?.style?.background_color ?? 'none')
																		: 'none'}
																/>

																{#if el.value?.edge?.style?.source_tip_symbol_shape_id}
																	{@const source_angle = edgeAngle['source'](
																		el.value?.edge,
																		L.get(localProp('waypoints'), el.value?.edge)
																	)}
																	{@const size =
																		(el.value?.edge?.style?.stroke_width ?? 1) *
																		(el.value?.edge?.style?.source_tip_size ?? 1)}

																	<g
																		fill={tipColor(
																			el.value?.style?.background_color,
																			el.value?.edge?.style?.stroke_color,
																			'black'
																		)}
																		stroke={tipColor(
																			el.value?.style?.background_color,
																			el.value?.edge?.style?.stroke_color,
																			'black'
																		)}
																		transform="rotate({source_angle} {el.value?.edge.source_x} {el
																			.value?.edge.source_y})"
																	>
																		<Symbol
																			symbols={data.symbols}
																			symbolId={el.value?.edge?.style?.source_tip_symbol_shape_id}
																			box={{
																				x: el.value?.edge.source_x - size,
																				y: el.value?.edge.source_y - size,
																				width: 2 * size,
																				height: 2 * size
																			}}
																		/>
																	</g>
																{/if}

																{#if el.value?.edge?.style?.target_tip_symbol_shape_id}
																	{@const target_angle = edgeAngle['target'](
																		el.value?.edge,
																		L.get(localProp('waypoints'), el.value?.edge)
																	)}
																	{@const size =
																		(el.value?.edge?.style?.stroke_width ?? 1) *
																		(el.value?.edge?.style?.target_tip_size ?? 1)}
																	<g
																		fill={tipColor(
																			el.value?.style?.background_color,
																			el.value?.edge?.style?.stroke_color,
																			'black'
																		)}
																		stroke={tipColor(
																			el.value?.style?.background_color,
																			el.value?.edge?.style?.stroke_color,
																			'black'
																		)}
																		transform="rotate({target_angle} {el.value?.edge.target_x} {el
																			.value?.edge.target_y})"
																	>
																		<Symbol
																			symbols={data.symbols}
																			symbolId={el.value?.edge?.style?.target_tip_symbol_shape_id}
																			box={{
																				x: el.value?.edge.target_x - size,
																				y: el.value?.edge.target_y - size,
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
															onpointermove={(evt) => updateLayerMove(evt, liveLenses)}
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
														<path
															class="link-selected"
															transform={layerMoveTransform(el.id, layersInOrder.value)}
															d={edgePath[el.edge?.style?.smoothness ?? 'linear'](
																el.edge,
																L.get(localProp('waypoints'), el.edge)
															)}
															stroke="black"
															fill="none"
															stroke-width={(el.edge?.style?.stroke_width ?? 1) * 1 +
																6 * cameraScale.value}
															stroke-linejoin={el.edge?.style?.stroke_join ?? 'miter'}
															stroke-linecap={el.edge?.style?.stroke_cap ?? 'butt'}
														/>

														{#if el.edge?.style?.source_tip_symbol_shape_id}
															{@const source_angle = edgeAngle['source'](
																el.edge,
																L.get(localProp('waypoints'), el.edge)
															)}
															<g
																class="link-selected"
																transform="{layerMoveTransform(el.id, layersInOrder.value) ??
																	''} rotate({source_angle} {el.edge.source_x} {el.edge.source_y})"
															>
																{#await data.symbols then symbols}
																	{@const symbol = symbols.get(
																		el.edge?.style?.source_tip_symbol_shape_id
																	)}
																	{@const size =
																		(el.edge?.style?.stroke_width ?? 1) *
																		(el.edge?.style?.source_tip_size ?? 1)}

																	{#if symbol}
																		{#each symbol.paths as path, i (i)}
																			<path
																				fill={path.fill_color ?? 'transparent'}
																				stroke={path.stroke_color ?? 'transparent'}
																				d={buildPath(
																					{
																						x: el.edge.source_x - size,
																						y: el.edge.source_y - size,
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

														{#if el.edge?.style?.target_tip_symbol_shape_id}
															{@const target_angle = edgeAngle['target'](
																el.edge,
																L.get(localProp('waypoints'), el.edge)
															)}
															<g
																class="link-selected"
																transform="{layerMoveTransform(el.id, layersInOrder.value) ??
																	''} rotate({target_angle} {el.edge.target_x} {el.edge.target_y})"
															>
																{#await data.symbols then symbols}
																	{@const symbol = symbols.get(
																		el.edge?.style?.target_tip_symbol_shape_id
																	)}
																	{@const size =
																		(el.edge?.style?.stroke_width ?? 1) *
																		(el.edge?.style?.target_tip_size ?? 1)}

																	{#if symbol}
																		{#each symbol.paths as path, i (i)}
																			<path
																				fill={path.fill_color ?? 'transparent'}
																				stroke={path.stroke_color ?? 'transparent'}
																				d={buildPath(
																					{
																						x: el.edge.target_x - size,
																						y: el.edge.target_y - size,
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
													<path
														class="link-selected"
														transform={layerMoveTransform(linkedTargetId, layersInOrder.value)}
														d={edgePath[linkedEl.value.edge?.style?.smoothness ?? 'linear'](
															linkedEl.value.edge,
															L.get(localProp('waypoints'), linkedEl.value.edge)
														)}
														stroke="black"
														fill="none"
														stroke-width={(linkedEl.value.edge?.style?.stroke_width ?? 1) * 1 +
															6 * cameraScale.value}
														stroke-linejoin={linkedEl.value.edge?.style?.stroke_join ?? 'miter'}
														stroke-linecap={linkedEl.value.edge?.style?.stroke_cap ?? 'butt'}
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
													<path
														class="selected"
														transform={layerMoveTransform(id, layersInOrder.value)}
														d={edgePath[el.value?.edge?.style?.smoothness ?? 'linear'](
															el.value?.edge,
															L.get(localProp('waypoints'), el.value?.edge)
														)}
														stroke="black"
														fill="none"
														stroke-width={(el.value?.edge?.style?.stroke_width ?? 1) * 1 +
															6 * cameraScale.value}
														stroke-linejoin={el.value?.edge?.style?.stroke_join ?? 'miter'}
														stroke-linecap={el.value?.edge?.style?.stroke_cap ?? 'butt'}
													/>

													{#if el.value?.edge?.style?.source_tip_symbol_shape_id}
														{@const source_angle = edgeAngle['source'](
															el.value?.edge,
															L.get(localProp('waypoints'), el.value?.edge)
														)}
														<g
															class="selected"
															transform="{layerMoveTransform(id, layersInOrder.value) ??
																''} rotate({source_angle} {el.value?.edge.source_x} {el.value?.edge
																.source_y})"
														>
															{#await data.symbols then symbols}
																{@const symbol = symbols.get(
																	el.value?.edge?.style?.source_tip_symbol_shape_id
																)}
																{@const size =
																	(el.value?.edge?.style?.stroke_width ?? 1) *
																	(el.value?.edge?.style?.source_tip_size ?? 1)}

																{#if symbol}
																	{#each symbol.paths as path, i (i)}
																		<path
																			fill={path.fill_color ?? 'transparent'}
																			stroke={path.stroke_color ?? 'transparent'}
																			d={buildPath(
																				{
																					x: el.value?.edge.source_x - size,
																					y: el.value?.edge.source_y - size,
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

													{#if el.value?.edge?.style?.target_tip_symbol_shape_id}
														{@const target_angle = edgeAngle['target'](
															el.value?.edge,
															L.get(localProp('waypoints'), el.value?.edge)
														)}
														<g
															class="selected"
															transform="{layerMoveTransform(id, layersInOrder.value) ??
																''} rotate({target_angle} {el.value?.edge.target_x} {el.value?.edge
																.target_y})"
														>
															{#await data.symbols then symbols}
																{@const symbol = symbols.get(
																	el.value?.edge?.style?.target_tip_symbol_shape_id
																)}
																{@const size =
																	(el.value?.edge?.style?.stroke_width ?? 1) *
																	(el.value?.edge?.style?.target_tip_size ?? 1)}

																{#if symbol}
																	{#each symbol.paths as path, i (i)}
																		<path
																			fill={path.fill_color ?? 'transparent'}
																			stroke={path.stroke_color ?? 'transparent'}
																			d={buildPath(
																				{
																					x: el.value?.edge.target_x - size,
																					y: el.value?.edge.target_y - size,
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
																<g>
																	<path
																		class="selected"
																		d={edgePath[el.value?.edge?.style?.smoothness ?? 'linear'](
																			el.value?.edge,
																			L.get(localProp('waypoints'), el.value?.edge)
																		)}
																		stroke="black"
																		fill="none"
																		stroke-width={(el.value?.edge?.style?.stroke_width ?? 1) * 1 +
																			4 * cameraScale.value}
																		stroke-linejoin={el.value?.edge?.style?.stroke_join ?? 'miter'}
																		stroke-linecap={el.value?.edge?.style?.stroke_cap ?? 'butt'}
																	/>

																	{#if el.value?.edge?.style?.source_tip_symbol_shape_id}
																		{@const source_angle = edgeAngle['source'](
																			el.value?.edge,
																			L.get(localProp('waypoints'), el.value?.edge)
																		)}
																		<g
																			class="selected"
																			transform="rotate({source_angle} {el.value?.edge.source_x} {el
																				.value?.edge.source_y})"
																		>
																			{#await data.symbols then symbols}
																				{@const symbol = symbols.get(
																					el.value?.edge?.style?.source_tip_symbol_shape_id
																				)}
																				{@const size =
																					(el.value?.edge?.style?.stroke_width ?? 1) *
																					(el.value?.edge?.style?.source_tip_size ?? 1)}

																				{#if symbol}
																					{#each symbol.paths as path, i (i)}
																						<path
																							fill={path.fill_color ?? 'transparent'}
																							stroke={path.stroke_color ?? 'transparent'}
																							d={buildPath(
																								{
																									x: el.value?.edge.source_x - size,
																									y: el.value?.edge.source_y - size,
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

																	{#if el.value?.edge?.style?.target_tip_symbol_shape_id}
																		{@const target_angle = edgeAngle['target'](
																			el.value?.edge,
																			L.get(localProp('waypoints'), el.value?.edge)
																		)}
																		<g
																			class="selected"
																			transform="rotate({target_angle} {el.value?.edge.target_x} {el
																				.value?.edge.target_y})"
																		>
																			{#await data.symbols then symbols}
																				{@const symbol = symbols.get(
																					el.value?.edge?.style?.target_tip_symbol_shape_id
																				)}
																				{@const size =
																					(el.value?.edge?.style?.stroke_width ?? 1) *
																					(el.value?.edge?.style?.target_tip_size ?? 1)}

																				{#if symbol}
																					{#each symbol.paths as path, i (i)}
																						<path
																							fill={path.fill_color ?? 'transparent'}
																							stroke={path.stroke_color ?? 'transparent'}
																							d={buildPath(
																								{
																									x: el.value?.edge.target_x - size,
																									y: el.value?.edge.target_y - size,
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
											<g transform={rotationTransform.value}>
												{#if primitivePreviewIsEllipse(primitiveContent)}
													<ellipse
														class="primitive-creation-preview-shape"
														style:fill={previewStyle.background}
														style:stroke={previewStyle.border}
														cx={creationBox.x + creationBox.width / 2}
														cy={creationBox.y + creationBox.height / 2}
														rx={creationBox.width / 2}
														ry={creationBox.height / 2}
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
														L.get('id', singleSelectedLayer.value)
													)}
												onpointercancel={cancelPrimitiveCreation}
												onlostpointercapture={cancelPrimitiveCreation}
												oncontextmenu={resetPrimitiveToolFromCanvas}
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
										{#if activeTool.value === 'select' || activeTool.value === 'edge'}
											<g transform={rotationTransform.value}>
												<!-- svelte-ignore a11y_no_static_element_interactions -->
												{#each selectedLayers.value as id (id)}
													{@const el = view(['layers', 'items', L.find((el) => el.id == id)], doc)}
													{@const waypoints = view(['edge', localProp('waypoints')], el)}
													{@const persistentWaypoints = view(L.filter(R.prop('id')), waypoints)}

													{@const waypointProposals = view(
														[
															'edge',
															L.choose((e) => {
																return [
																	localProp('waypoints'),
																	L.reread(
																		R.pipe(
																			R.prepend({ x: e.source_x, y: e.source_y, id: '__source' }),
																			R.append({ x: e.target_x, y: e.target_y, id: '__target' }),
																			R.aperture(2),
																			R.map(([a, b]) => ({
																				id_before: a.id,
																				x: b.id ? (a.x + b.x) / 2 : b.x,
																				y: b.id ? (a.y + b.y) / 2 : b.y
																			})),
																			R.filter(R.prop('id_before'))
																		)
																	)
																];
															})
														],
														el
													)}
													{#if el.value?.edge}
														<path
															d={edgePath[el.value?.edge?.style?.smoothness ?? 'linear'](
																el.value?.edge,
																L.get(localProp('waypoints'), el.value?.edge)
															)}
															transform={layerMoveTransform(id, layersInOrder.value)}
															tabindex="-1"
															onkeydown={(evt) => {
																if (evt.key === 'Escape' || evt.key === 'Esc') {
																	cancelLayerMove(evt);
																}
															}}
															stroke={'transparent'}
															fill={el.value?.edge?.cyclic
																? (el.value?.style?.background_color ?? 'none')
																: 'none'}
															fill-opacity="0"
															stroke-width={(el.value?.edge?.style?.stroke_width ?? 1) * 1 +
																10 * cameraScale.value}
															stroke-linejoin={el.value?.edge?.style?.stroke_join ?? 'miter'}
															stroke-linecap={el.value?.edge?.style?.stroke_cap ?? 'butt'}
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
															onpointermove={(evt) => updateLayerMove(evt, liveLenses)}
															onpointerup={(evt) =>
																finishLayerMove(evt, dispatch, doc, layersInOrder.value)}
															onpointercancel={cancelLayerMove}
															onlostpointercapture={cancelLayerMove}
														/>
														{#each waypointProposals.value as wp_proposal, wi (wp_proposal.id_before)}
															{@const pos = view(
																[
																	L.lens(
																		(list) => {
																			const i =
																				R.findIndex(R.propEq(wp_proposal.id_before, 'id'), list) +
																				1;
																			if (list[i] && !list[i].id) {
																				return list[i];
																			} else {
																				return undefined;
																			}
																		},
																		(n, list) => {
																			const i =
																				R.findIndex(R.propEq(wp_proposal.id_before, 'id'), list) +
																				1;
																			if (list[i] && !list[i].id) {
																				if (n === undefined || R.equals(wp_proposal, n)) {
																					return [...list.slice(0, i), ...list.slice(i + 1)];
																				} else {
																					return [...list.slice(0, i), n, ...list.slice(i + 1)];
																				}
																			} else {
																				if (n === undefined) {
																					return list;
																				} else {
																					return [...list.slice(0, i), n, ...list.slice(i)];
																				}
																			}
																		}
																	),
																	L.removable('x', 'y'),
																	L.props('x', 'y')
																],
																waypoints
															)}
															<g
																transform={layerMoveTransform(id, layersInOrder.value)}
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

																		pos.value = Geo.translate(
																			pointerOffset.value,
																			liveLenses.clientToCanvas(evt.clientX, evt.clientY)
																		);
																	}
																}}
																onpointermove={(evt) => {
																	if (updateSelectionMoveFromHandle(evt, liveLenses)) {
																		return;
																	}

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
																		cast('create_waypoint', {
																			layer_id: el.value.id,
																			after_waypoint_id:
																				wp_proposal.id_before.substr(0, 2) == '__'
																					? null
																					: wp_proposal.id_before,
																			position: pos.value
																		});
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
																/></g
															>
														{/each}
														{#each persistentWaypoints.value as wp, wi (wp.id)}
															{@const pos = view(
																[
																	L.find(R.whereEq({ id: wp.id }), { hint: wi }),
																	L.removable('x', 'y'),
																	L.props('x', 'y')
																],
																waypoints
															)}
															<g
																transform={layerMoveTransform(id, layersInOrder.value)}
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
																		evt.currentTarget.focus({
																			preventScroll: true
																		});
																		evt.currentTarget.setPointerCapture(evt.pointerId);
																		evt.currentTarget.currentPointerId = evt.pointerId;
																		backoffValue.value = pos.value;
																		waypoints.value = localProp.reset;
																		pointerOffset.value = Geo.diff2d(
																			wp,
																			liveLenses.clientToCanvas(evt.clientX, evt.clientY)
																		);
																	}
																}}
																onpointermove={(evt) => {
																	if (updateSelectionMoveFromHandle(evt, liveLenses)) {
																		return;
																	}

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
																		const newPos = Geo.translate(
																			pointerOffset.value,
																			liveLenses.clientToCanvas(evt.clientX, evt.clientY)
																		);
																		if (
																			backoffValue.value.x != newPos.x ||
																			backoffValue.value.y != newPos.y
																		) {
																			evt.preventDefault();
																			cast('update_waypoint_position', {
																				layer_id: el.value.id,
																				waypoint_id: wp.id,
																				value: newPos
																			});
																			evt.currentTarget.blur();
																		}
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
																	cx={wp.x}
																	cy={wp.y}
																	pointer-events="all"
																/>
																<circle
																	fill="white"
																	cursor="default"
																	stroke="#7af"
																	stroke-width="2"
																	vector-effect="non-scaling-stroke"
																	r={6 * cameraScale.value}
																	cx={wp.x}
																	cy={wp.y}
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
															transform={layerMoveTransform(id, layersInOrder.value)}
															onclick={(evt) => {
																evt.stopPropagation();
															}}
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
																	evt.currentTarget.focus({
																		preventScroll: true
																	});
																	evt.currentTarget.setPointerCapture(evt.pointerId);
																	evt.currentTarget.currentPointerId = evt.pointerId;
																	backoffValue.value = source_pos.value;
																	pointerOffset.value = Geo.diff2d(
																		source_pos.value,
																		liveLenses.clientToCanvas(evt.clientX, evt.clientY)
																	);
																}
															}}
															onpointermove={(evt) => {
																if (updateSelectionMoveFromHandle(evt, liveLenses)) {
																	return;
																}

																if (
																	evt.isPrimary &&
																	evt.currentTarget.hasPointerCapture(evt.pointerId)
																) {
																	source_pos.value = Geo.translate(
																		pointerOffset.value,
																		liveLenses.clientToCanvas(evt.clientX, evt.clientY)
																	);
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
																	const newPos = Geo.translate(
																		pointerOffset.value,
																		liveLenses.clientToCanvas(evt.clientX, evt.clientY)
																	);
																	dispatch('update_edge_position', {
																		layer_id: el.value.id,
																		value: {
																			source_x: newPos.x,
																			source_y: newPos.y
																		}
																	}).then(({ source_x: x, source_y: y }) => {
																		source_pos.value = { x, y };
																	});
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
																	source_pos.value = backoffValue.value;
																}
															}}
															role="button"
															tabindex="-1"
														>
															<circle
																fill="none"
																cursor="default"
																stroke="none"
																pointer-events="all"
																r={12 * cameraScale.value}
																cx={el.value?.edge?.source_x}
																cy={el.value?.edge?.source_y}
															/><circle
																fill="white"
																cursor="default"
																pointer-events="none"
																stroke="#7af"
																stroke-width="2"
																vector-effect="non-scaling-stroke"
																r={6 * cameraScale.value}
																cx={el.value?.edge?.source_x}
																cy={el.value?.edge?.source_y}
															/></g
														>
														<g
															transform={layerMoveTransform(id, layersInOrder.value)}
															onclick={(evt) => {
																evt.stopPropagation();
															}}
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
																	evt.currentTarget.focus({
																		preventScroll: true
																	});
																	evt.currentTarget.setPointerCapture(evt.pointerId);
																	evt.currentTarget.currentPointerId = evt.pointerId;
																	backoffValue.value = target_pos.value;
																	pointerOffset.value = Geo.diff2d(
																		target_pos.value,
																		liveLenses.clientToCanvas(evt.clientX, evt.clientY)
																	);
																}
															}}
															onpointermove={(evt) => {
																if (updateSelectionMoveFromHandle(evt, liveLenses)) {
																	return;
																}

																if (
																	evt.isPrimary &&
																	evt.currentTarget.hasPointerCapture(evt.pointerId)
																) {
																	target_pos.value = Geo.translate(
																		pointerOffset.value,
																		liveLenses.clientToCanvas(evt.clientX, evt.clientY)
																	);
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
																	const newPos = Geo.translate(
																		pointerOffset.value,
																		liveLenses.clientToCanvas(evt.clientX, evt.clientY)
																	);
																	dispatch('update_edge_position', {
																		layer_id: el.value.id,
																		value: {
																			target_x: newPos.x,
																			target_y: newPos.y
																		}
																	}).then(({ target_x: x, target_y: y }) => {
																		target_pos.value = { x, y };
																	});
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
																	target_pos.value = backoffValue.value;
																}
															}}
															role="button"
															tabindex="-1"
														>
															<circle
																fill="none"
																stroke="none"
																cursor="default"
																pointer-events="all"
																r={12 * cameraScale.value}
																cx={el.value?.edge?.target_x}
																cy={el.value?.edge?.target_y}
															/><circle
																fill="white"
																stroke="#7af"
																cursor="default"
																stroke-width="2"
																pointer-events="none"
																vector-effect="non-scaling-stroke"
																r={6 * cameraScale.value}
																cx={el.value?.edge?.target_x}
																cy={el.value?.edge?.target_y}
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
															openTargetLocation(evt, el.value);
														}}
														onpointerdown={(evt) =>
															beginLayerMove(
																evt,
																liveLenses,
																el.value.id,
																layersInOrder.value,
																doc.value
															)}
														onpointermove={(evt) => updateLayerMove(evt, liveLenses)}
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
													{#each Object.entries(corners) as [type, { lens, dx, dy }]}
														{@const pos = view(L.cond([R.prop('box'), ['box', lens]]), el)}
														{@const posVal = pos.value}
														{#if posVal}
															<g
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
																		evt.currentTarget.focus({
																			preventScroll: true
																		});
																		evt.currentTarget.setPointerCapture(evt.pointerId);
																		evt.currentTarget.currentPointerId = evt.pointerId;
																		backoffValue.value = pos.value;
																		pointerOffset.value = Geo.diff2d(
																			posVal,
																			liveLenses.clientToCanvas(evt.clientX, evt.clientY)
																		);
																	}
																}}
																onpointermove={(evt) => {
																	if (updateSelectionMoveFromHandle(evt, liveLenses)) {
																		return;
																	}

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
																		cast('update_box_size', {
																			layer_id: el.value.id,
																			value: L.get(
																				[
																					'box',
																					L.props('position_x', 'position_y', 'width', 'height')
																				],
																				el.value
																			)
																		});
																	}
																}}
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
																		evt.currentTarget.releasePointerCapture(
																			evt.currentTarget.currentPointerId
																		);
																		pos.value = backoffValue.value;
																	}
																}}
																role="button"
																tabindex="-1"
																transform="{layerMoveTransform(id, layersInOrder.value) ??
																	''} translate({dy * cameraScale.value * 6},{dx *
																	cameraScale.value *
																	6})"
															>
																<circle
																	fill="none"
																	stroke="none"
																	cursor="default"
																	pointer-events="all"
																	vector-effect="non-scaling-stroke"
																	r={cameraScale.value * 12}
																	cx={posVal.x}
																	cy={posVal.y}
																/>
																<circle
																	fill="white"
																	stroke="#7af"
																	cursor="default"
																	pointer-events="none"
																	vector-effect="non-scaling-stroke"
																	stroke-width="2"
																	r={cameraScale.value * 6}
																	cx={posVal.x}
																	cy={posVal.y}
																/>
															</g>
														{/if}
													{/each}
												{/each}
											</g>
										{/if}
										{#if activeTool.value == 'edge'}
											{#await data.socket_schemas then s}
												{#await currentSyntaxValue then syntax}
													<Edger
														sockets={viewCombined(
															[
																L.reread(({ inOrder, flatLayers }) =>
																	inOrder
																		.filter(R.complement(R.prop('hidden')))
																		.flatMap(({ index, id, depth, hidden }) => {
																			const el = R.find((l) => l.id === id, flatLayers);
																			const iid = el?.interface_id;
																			const semantic_tag = el?.semantic_tag;

																			if (iid) {
																				const socket_schema = s.get(iid);
																				return socket_schema.sockets
																					.map((sock) => {
																						if (el.box) {
																							return {
																								id: {
																									socket: sock.id,
																									layer: id,
																									semantic_tag
																								},
																								x: buildCoord(
																									{
																										x: el.box.position_x,
																										y: el.box.position_y,
																										width: el.box.width,
																										height: el.box.height
																									},
																									'x',
																									false,
																									sock.x
																								),
																								y: buildCoord(
																									{
																										x: el.box.position_x,
																										y: el.box.position_y,
																										width: el.box.width,
																										height: el.box.height
																									},
																									'y',
																									false,
																									sock.y
																								)
																							};
																						} else if (el.text?.hint) {
																							return {
																								id: {
																									socket: sock.id,
																									layer: id
																								},
																								x: buildCoord(
																									{
																										x: el.text.hint.x,
																										y: el.text.hint.y,
																										width: el.text.hint.width,
																										height: el.text.hint.height
																									},
																									'x',
																									false,
																									sock.x
																								),
																								y: buildCoord(
																									{
																										x: el.text.hint.x,
																										y: el.text.hint.y,
																										width: el.text.hint.width,
																										height: el.text.hint.height
																									},
																									'y',
																									false,
																									sock.y
																								)
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
															{ inOrder: layersInOrder, flatLayers: read(['layers', 'items'], doc) }
														)}
														{frameBoxObject}
														{frameBoxPath}
														clientToCanvas={liveLenses.clientToCanvas}
														{rotationTransform}
														{cameraScale}
														validEdge={(source, target) => {
															return (
																!syntax.edgeWhitelist[source.semantic_tag] ||
																syntax.edgeWhitelist[source.semantic_tag].indexOf(
																	target.semantic_tag
																) > -1
															);
														}}
														newEdge={(e, evt) => {
															if (evt.shiftKey) {
																e = {
																	source: e.target,
																	target: e.source
																};
															}
															const isValidEdge =
																!syntax.edgeWhitelist[e.source.semantic_tag] ||
																syntax.edgeWhitelist[e.source.semantic_tag].indexOf(
																	e.target.semantic_tag
																) > -1;
															if (isValidEdge) {
																dispatch('create_layer', {
																	base_layer_id: L.get('id', singleSelectedLayer.value),
																	source: {
																		socket_id: e.source.socket,
																		layer_id: e.source.layer
																	},
																	target: { socket_id: e.target.socket, layer_id: e.target.layer }
																}).then((l) => {
																	publishSelection(cast, [l.id]);
																});
															}
														}}
														newEdgeNode={(e, evt) => {
															const autoNodeType = syntax.autoEdgeNode[e.source.semantic_tag];

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
																		target_tip_symbol_shape_id:
																			autoNodeType.edge.target_tip_symbol_shape_id,
																		source_tip_symbol_shape_id:
																			autoNodeType.edge.source_tip_symbol_shape_id,
																		semantic_tag: autoNodeType.edge.semantic_tag
																	}
																}).then((l) => {
																	publishSelection(cast, [l.id]);
																});
															}
														}}
													/>
												{/await}
											{/await}
										{/if}

										{#if activeTool.value === 'pen'}
											<Pen
												{frameBoxPath}
												clientToCanvas={liveLenses.clientToCanvas}
												{cameraScale}
												{rotationTransform}
												onDraw={(points) => {
													dispatch('create_layer', {
														base_layer_id: L.get('id', singleSelectedLayer.value),
														points
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
														cyclic: !!closed
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
												onDraw={(points) => {
													alert('splines currently not implemented');
												}}
											/>
										{/if}

										<MountTrigger
											onMount={() => {
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

				<div class="topbar">
					<div class="toolbar dense">
						<div class="toolbar-body">
							{#each tools as tool (tool.id)}
								<label
									class={{ 'tool-selector': true, active: activeTool.value == tool.id }}
									ondblclick={(evt) => {
										evt.preventDefault();
										tool.reset?.(cameraScroller.value, cameraFocus, extension.value);
									}}
									>{tool.name}
									<input
										class="tool-radio"
										type="radio"
										value={tool.id}
										bind:group={activeTool.value}
										onchange={() => selectEditorTool(tool.id, cast)}
									/></label
								>
							{/each}
							<hr class="tool-spacer" />
						</div>

						{#snippet edgeProps()}
							{@const isCyclic = view(['edge', 'cyclic', L.valueOr(false)], singleSelectedLayer)}

							<label class="pretty-number">
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
							<label class="pretty-number">
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

							<label class="pretty-select">
								<span class="pretty-select-label">Source Tip</span>
								{#await data.symbols then symbols}
									<span class="pretty-select-value"
										>{symbols.get(sourceTipShapeValue.value)?.name ?? 'None'}</span
									>
								{/await}
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
							<label class="pretty-number">
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
								<span class="pretty-select-value">{strokeDashValue.value || 'None'}</span>
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
								{#await data.symbols then symbols}
									<span class="pretty-select-value"
										>{symbols.get(targetTipShapeValue.value)?.name ?? 'None'}</span
									>
								{/await}
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
							<label class="pretty-number">
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
								{#await data.symbols then symbols}
									<span class="pretty-select-value"
										>{symbols.get(shapeValue.value)?.name ?? 'None'}</span
									>
								{/await}
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
							<label class="pretty-number">
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
								<span class="pretty-select-value">{dashValue.value || 'None'}</span>
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
							<label class="pretty-number">
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
								<span class="pretty-select-label">Font Family</span>
								<span style:font-family={fontFamily.value} class="pretty-select-value"
									>{fontFamily.value}</span
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
									<option style:font-family={'serif'} value="serif">serif</option>
									<option style:font-family={'sans-serif'} value="sans-serif">sans-serif</option>
									<option style:font-family={'monospace'} value="monospace">monospace</option>
								</select>
							</label>
							<label class="pretty-number">
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
						<div
							style="display: flex; gap: 1em; align-items: center; white-space: wrap; padding: 0 1ex;"
						>
							{#if singleSelectedLayerType.value}
								{@render {
									text: textProps,
									box: boxProps,
									edge: edgeProps,
									group: groupProps
								}[singleSelectedLayerType.value]()}
							{:else if selectedLayersType.value.length > 1}
								{selectedLayersType.value.length} layers
							{:else}
								Nothing Selected
							{/if}
						</div>
					</div>
				</div>

				<div class="topsubbar">
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

				<div class="sidebar right">
					<Minimap
						visible={showMinimap}
						{extension}
						{frameBoxPath}
						{rotationInverseTransform}
						{cameraFocus}
					>
						<rect
							x={doc.value.viewbox.x}
							y={doc.value.viewbox.y}
							width={doc.value.viewbox.width}
							height={doc.value.viewbox.height}
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
				<div class="sidebar left">
					<div
						class="toolbar vertical"
						use:polyfillDragDrop={{
							dropArea: dropperDomElement,
							options: { dragThresholdPixels: 0 }
						}}
					>
						<small>Create</small>
						{#await data.primitives}
							-
						{:then groups}
							{#each groups as g}
								<div style="border-top: 1px solid gray;  padding-top: 1ex">
									{#each g.items as item}
										{@const linkedCreateTargetId = singleSelectedIsBoxOrEdge.value
											? singleSelectedLayer.value.id
											: undefined}
										<div
											class={{
												'create-primitive-tool': true,
												'selectable-create': isSelectableCreatePrimitive(item),
												'disabled-create-tool':
													isSelectableCreatePrimitive(item) &&
													!canActivateCreatePrimitive(item, linkedCreateTargetId),
												'active-create-tool': isActiveCreatePrimitive(item),
												'persistent-create-tool':
													isActiveCreatePrimitive(item) && activeCreateTool.value?.persistent
											}}
											role="button"
											tabindex={canActivateCreatePrimitive(item, linkedCreateTargetId) ? '0' : '-1'}
											aria-disabled={!canActivateCreatePrimitive(item, linkedCreateTargetId)}
											aria-pressed={isSelectableCreatePrimitive(item)
												? isActiveCreatePrimitive(item)
												: undefined}
											style="display: grid; justify-content: center; align-content: center;"
											draggable={isSelectableCreatePrimitive(item)}
											style:touch-action="none"
											onclick={(evt) => {
												if (activateCreatePrimitive(item, false, linkedCreateTargetId, cast)) {
													evt.preventDefault();
													evt.stopPropagation();
												}
											}}
											ondblclick={(evt) => {
												if (activateCreatePrimitive(item, true, linkedCreateTargetId, cast)) {
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
												const d = {
													...item.data,
													content: {
														...item.data.content,
														hyperlink: item.data.content.hyperlink ? true : undefined
													}
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
												{@html item.icon}
											</svg>
										</div>
									{/each}
								</div>
							{/each}
						{:catch e}
							error
						{/await}
						<div style="border-top: 1px solid gray; padding-top: 1ex">
							<div
								style="background: #eee; padding: 4px; display: flex; flex-direction: column; gap: 4px;"
							>
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
												bind:value={selectedBlueprint.value}
												style="-webkit-appearance: none; width: 3em; max-width: 100%; height: 3em; opacity: 0;grid-area: 1 / 1 / span 1 / span 1;"
											>
												<option value={null}></option>
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
										'selectable-create': canActivateBlueprintTool(selectedBlueprint.value),
										'disabled-create-tool': !canActivateBlueprintTool(selectedBlueprint.value),
										'active-create-tool': isActiveBlueprintTool(selectedBlueprint.value),
										'persistent-create-tool':
											isActiveBlueprintTool(selectedBlueprint.value) &&
											activeCreateTool.value?.persistent
									}}
									style="width: 100%; padding: 1ex; color: #fff; box-sizing: border-box; text-align: center;"
									role="button"
									tabindex={canActivateBlueprintTool(selectedBlueprint.value) ? '0' : '-1'}
									aria-disabled={!canActivateBlueprintTool(selectedBlueprint.value)}
									aria-pressed={isActiveBlueprintTool(selectedBlueprint.value)}
									style:background={isActiveBlueprintTool(selectedBlueprint.value)
										? '#23875d'
										: '#333'}
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
									☰
								</div>
							</div>
						</div>
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
			[body-start] 0.5ex [top-start left-start] auto [left-end topsubbar-start] 1fr[topsubbar-end right-start] max(
				20vw
			)
			[right-end top-end] 1em [body-end];
		grid-template-rows: [body-start] 0.5ex [top-start] auto [top-end left-start right-start topsubbar-start] 1fr [] auto [topsubbar-end left-end right-end] 1em [body-end];
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
		border-radius: 2px;
		outline: 1px solid transparent;
		outline-offset: 1px;
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

	.create-primitive-tool.active-create-tool {
		background: #333;
		outline-color: #333;
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

	.submenu-menu {
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
