<script>
	import { onMount } from 'svelte';
	import * as L from 'partial.lenses';
	import * as R from 'ramda';
	import { resolve } from '$app/paths';
	import AppBar from '../../../AppBar.svelte';
	import { numberSvgFormat } from '$lib/svg/formatter';

	import LiveResource from '$lib/components/live/LiveResource.svelte';
	import {
		atom,
		storedAtom,
		view,
		viewCombined,
		combine,
		read,
		call,
		update,
		readCombined
	} from '$lib/reactivity/atom.svelte';

	import SVGViewport from '$lib/components/viewport/SVGViewport.svelte';
	import CameraScroller from '$lib/components/viewport/CameraScroller.svelte';
	import Minimap from '$lib/components/editor/overlays/minimap/Minimap.svelte';

	import Symbol from '$lib/components/renew/Symbol.svelte';
	import TextElement from '$lib/components/renew/TextElement.svelte';
	import { edgeAngle, edgePath, tipColor } from '$lib/components/renew/edges.js';
	import { walkDocument } from '$lib/components/renew/document.js';
	import { downloadFile } from '$lib/io/download';

	import MenuBarButton from '$lib/components/menubar/MenuBarButton.svelte';
	import { frameBoxLens } from '$lib/components/camera/lenses';
	import Navigator from '$lib/components/camera/Navigator.svelte';
	import MountTrigger from '$lib/components/camera/MountTrigger.svelte';
	import Modal from '$lib/components/modal/Modal.svelte';
	import Thumbnail from './Thumbnail.svelte';
	import { describeError } from '$lib/errors';
	import Magnifier from '$lib/components/editor/tools/magnifier/Magnifier.svelte';
	import Paner from '$lib/components/editor/tools/paner/Paner.svelte';
	import Zoomer from '$lib/components/editor/tools/zoomer/Zoomer.svelte';
	import {
		LOOK_AND_FEEL_OPTIONS,
		loadLookAndFeel,
		setLookAndFeel
	} from '$lib/api/look_and_feel.js';

	const { data } = $props();
	const lookAndFeel = atom(loadLookAndFeel());
	const RECENT_SIMULATIONS_STORAGE_KEY = 'petristation:recent-simulations';
	const SIMULATION_ANNOTATIONS_STORAGE_KEY = `petristation:simulation-annotations:${data.simulation.id}`;
	const recentSimulations = atom(loadRecentSimulations());

	function backendUrl(path) {
		const base = data.authState?.value?.url ?? window.location.origin;
		try {
			return new URL(path, base).href;
		} catch (_) {
			return path;
		}
	}

	function simulationMenuHref(key, fallbackPath) {
		return data.simulation?.links?.menu?.[key]?.href ?? backendUrl(fallbackPath);
	}

	function loadRecentSimulations() {
		try {
			const parsed = JSON.parse(localStorage.getItem(RECENT_SIMULATIONS_STORAGE_KEY) ?? '[]');
			return Array.isArray(parsed) ? parsed : [];
		} catch {
			return [];
		}
	}

	function loadSimulationAnnotations() {
		try {
			const parsed = JSON.parse(localStorage.getItem(SIMULATION_ANNOTATIONS_STORAGE_KEY) ?? '[]');
			return Array.isArray(parsed) ? parsed : [];
		} catch {
			return [];
		}
	}

	function persistSimulationAnnotations(annotations) {
		try {
			localStorage.setItem(SIMULATION_ANNOTATIONS_STORAGE_KEY, JSON.stringify(annotations ?? []));
		} catch {
			// Drawing annotations are a local convenience. If storage is unavailable, keep them in memory.
		}
	}

	function simulationLabel(simulationContent = data.simulation.content) {
		return simulationContent?.name ?? simulationContent?.label ?? data.simulation.id ?? 'Untitled';
	}

	function rememberCurrentSimulation(simulationContent = data.simulation.content) {
		const simulationId = data.simulation.id;
		const entry = {
			id: simulationId,
			name: simulationLabel(simulationContent),
			href: resolve(`/simulations/${simulationId}/observer`),
			savedAt: Date.now()
		};
		const next = [entry, ...loadRecentSimulations().filter((recent) => recent?.id !== simulationId)]
			.filter((recent) => recent?.id && recent?.href)
			.slice(0, 12);
		localStorage.setItem(RECENT_SIMULATIONS_STORAGE_KEY, JSON.stringify(next));
		recentSimulations.value = next;
	}

	function removeRecentSimulation(simulationId) {
		const next = loadRecentSimulations().filter((recent) => recent?.id !== simulationId);
		localStorage.setItem(RECENT_SIMULATIONS_STORAGE_KEY, JSON.stringify(next));
		recentSimulations.value = next;
	}

	function clearRecentSimulations() {
		localStorage.removeItem(RECENT_SIMULATIONS_STORAGE_KEY);
		recentSimulations.value = [];
	}

	function simulationTabs(simulationContent = data.simulation.content) {
		const currentId = data.simulation.id;
		const current = {
			id: currentId,
			name: simulationLabel(simulationContent),
			href: resolve(`/simulations/${currentId}/observer`)
		};
		return [
			current,
			...recentSimulations.value.filter((recent) => recent?.id && recent.id !== currentId)
		].slice(0, 8);
	}

	function closeSimulationWindow(tab, simulationContent = data.simulation.content) {
		const tabs = simulationTabs(simulationContent);
		if (!tab?.id) {
			return;
		}

		if (tab.id !== data.simulation.id) {
			removeRecentSimulation(tab.id);
			return;
		}

		const next = tabs.find((candidate) => candidate.id !== tab.id);
		removeRecentSimulation(tab.id);
		location.href =
			next?.href ?? resolve(`/projects/${data.simulation.links.project.id}/simulations`);
	}

	function openSimulationNavigator() {
		showMinimap.value = true;
		call((c) => {
			c && c.resetCamera();
		}, cameraScroller);
	}

	function closeAllSimulations() {
		clearRecentSimulations();
		location.href = resolve(`/projects/${data.simulation.links.project.id}/simulations`);
	}

	function exitSimulationObserver() {
		location.href = resolve('/projects');
	}

	function onSimulationKeyDown(evt) {
		if (evt.key === 'Escape' || evt.key === 'Esc') {
			cancelSimulationAnnotation();
			return;
		}

		if (evt.key === 'Delete' || evt.key === 'Backspace') {
			if (deleteSelectedSimulationAnnotation()) {
				evt.preventDefault();
			}
		}
	}

	onMount(() => {
		rememberCurrentSimulation(data.simulation.content);
		window.addEventListener('keydown', onSimulationKeyDown);

		return () => {
			window.removeEventListener('keydown', onSimulationKeyDown);
		};
	});

	function openSimulationCreationForFormalism(formalism = null) {
		const projectId = data.simulation?.links?.project?.id;
		if (!projectId) {
			return;
		}

		const url = new URL(resolve(`/projects/${projectId}/simulations`), window.location.origin);
		if (formalism?.id) {
			url.searchParams.set('formalism', formalism.id);
		}

		window.open(url.href, '_blank', 'noopener,noreferrer');
	}

	function explainSimulationFormalism(formalism = null) {
		const label = formalism?.label ? ` "${formalism.label}"` : '';

		openSimulationCreationForFormalism(formalism);
		appendLiveError({
			title: 'Formalism Selection',
			message: `The formalism${label} is selected when a PetriStation simulation is created.`,
			detail:
				'An existing simulation cannot be switched to another formalism without creating a new compiled simulation. The project simulation list has been opened so a new simulation can be created there.'
		});
	}

	const currentInstance = atom(null);
	const textBounds = atom({});
	const expandedPlaces = atom({});
	const liveErrors = atom([]);
	const bindingSelection = atom(null);
	const bindingDialogPosition = atom(null);
	const selectedTransitionId = atom(null);
	const selectedPlaceId = atom(null);
	const selectedLayerId = atom(null);
	const selectedAnnotationId = atom(null);
	const simulationAnnotations = atom(loadSimulationAnnotations());
	const annotationDraft = atom(null);
	const annotationMove = atom(null);
	const markingDialog = atom(null);
	const markingDialogPosition = atom(null);
	const consoleCommandText = atom('');
	const consoleResponses = atom([]);
	const showAbout = atom(false);
	const showSimulationConfig = atom(false);
	const activeSimulationTool = atom('select');
	const netInstanceActions = { value: null };
	const breakPointEntriesResource = data.simulation.breakpoints;
	const simulationBackgroundBaseHue = 244;
	const markedPlaceOverlayColor = '#fff176';
	const online = $derived(!data.offline && data.connectionState.value !== false);
	let simulationDraggingFiles = $state(false);
	let consoleCommandInput = $state(null);

	const simulationTools = [
		{ name: 'Select', id: 'select' },
		{ name: 'Magnifier', id: 'magnifier' },
		{ name: 'Pan', id: 'paner' },
		{ name: 'Zoom', id: 'zoomer' },
		{ name: 'Rectangle', id: 'annotation-rect' },
		{ name: 'Ellipse', id: 'annotation-ellipse' },
		{ name: 'Line', id: 'annotation-line' },
		{ name: 'Text', id: 'annotation-text' }
	];
	const simulationAnnotationLineStyles = [
		{ label: 'Solid', value: 'none' },
		{ label: 'Dashed', value: '8 4' },
		{ label: 'Dotted', value: '2 4' },
		{ label: 'Dash dot', value: '8 4 2 4' }
	];
	const simulationAnnotationFonts = [
		{ label: 'Sans', value: 'sans-serif' },
		{ label: 'Serif', value: 'serif' },
		{ label: 'Monospace', value: 'monospace' },
		{ label: 'Dialog', value: 'Dialog, sans-serif' }
	];

	$effect(() => {
		persistSimulationAnnotations(simulationAnnotations.value);
	});

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

	const cameraJson = view(L.inverse(L.json({ space: '  ' })), camera);

	let cameraScroller = atom(undefined);
	const bindingAutoRefresh = {
		lastSignature: null,
		queued: false
	};

	const logLens = (base) =>
		L.lens(
			(x) => Math.log(x) / Math.log(base),
			(y) => Math.pow(base, y)
		);

	const storedViewOptions = storedAtom('petristation-editor');
	const viewOptions = view(L.json(), storedViewOptions);
	const debugPanel = view('debugPanel', viewOptions);
	const showDebug = view(['show', L.valueOr(false)], debugPanel);
	const showMinimap = view(['minimap', L.valueOr(true)], viewOptions);
	const gridView = view(['grid', L.valueOr({})], viewOptions);
	const showGrid = view(['show', L.valueOr(false)], gridView);
	const lockRotation = view(['rotationLock', L.valueOr(false)], viewOptions);
	const gridDistance = view(['distance', L.valueOr(32)], gridView);
	const showInstances = view(['showInstances', L.valueOr(true)], viewOptions);
	const showLog = view(['showLog', L.valueOr(false)], viewOptions);
	const showSequentialOnlyArcs = view(['sequentialOnlyArcs', L.valueOr(false)], viewOptions);
	const gridDistanceExp = view(logLens(2), gridDistance);

	function liveErrorSignature(error) {
		const currentError = describeError(error);
		return JSON.stringify([
			currentError.status,
			currentError.title,
			currentError.message,
			currentError.detail
		]);
	}

	function groupLiveErrors(errors) {
		const groups = new Map();

		for (const rawError of errors) {
			const error = describeError(rawError);
			const signature = liveErrorSignature(rawError);
			const existing = groups.get(signature);

			if (existing) {
				existing.count += 1;
			} else {
				groups.set(signature, { signature, error, count: 1 });
			}
		}

		return [...groups.values()];
	}

	function formatLiveError(error) {
		return [error.title, error.message, error.detail].filter(Boolean).join('\n\n');
	}

	function copyLiveError(error) {
		navigator.clipboard?.writeText(formatLiveError(error));
	}

	function discardLiveError(signature) {
		update(
			(errors) => errors.filter((error) => liveErrorSignature(error) !== signature),
			liveErrors
		);
	}

	function discardAllLiveErrors() {
		liveErrors.value = [];
	}

	function appendLiveError(error) {
		liveErrors.value = [...liveErrors.value, error];
	}

	function appendConsoleResponse(command, output) {
		consoleResponses.value = [
			{
				id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
				command,
				output: String(output ?? '').trim()
			},
			...consoleResponses.value
		].slice(0, 20);
	}

	function hashString(value) {
		let hash = 0;
		for (const char of String(value ?? '')) {
			hash = (hash * 31 + char.charCodeAt(0)) | 0;
		}
		return Math.abs(hash);
	}

	function netInstanceBackgroundColor(netInstance) {
		const key = netInstance?.id ?? netInstance?.label ?? data.simulation.id;
		const hue = (simulationBackgroundBaseHue + (hashString(key) % 55) - 20 + 360) % 360;
		return `hsl(${hue} 72% 88%)`;
	}

	async function submitConsoleCommand(dispatch, evt) {
		evt.preventDefault();
		const command = consoleCommandText.value.trim();

		if (!command) {
			return;
		}

		try {
			const result = await dispatch('console_command', { command });
			consoleCommandText.value = '';
			showLog.value = true;
			appendConsoleResponse(command, result?.output ?? '');
		} catch (error) {
			appendLiveError(error);
		}
	}

	function openSimulationConsole() {
		showLog.value = true;
		queueMicrotask(() => consoleCommandInput?.focus());
	}

	function isImageFile(file) {
		return (
			file?.type?.startsWith('image/') ||
			/\.(png|jpe?g|gif|webp|svg)$/i.test(String(file?.name ?? ''))
		);
	}

	function simulationDropPosition(evt, liveLenses = null) {
		if (liveLenses?.clientToCanvas) {
			return liveLenses.clientToCanvas(evt.clientX, evt.clientY);
		}

		return { x: cameraFocus.value.x, y: cameraFocus.value.y };
	}

	function createSimulationImageAnnotationFromFile(file, position = null) {
		if (!file) {
			return Promise.resolve();
		}

		const pos = position ?? { x: cameraFocus.value.x, y: cameraFocus.value.y };

		return new Promise((resolve, reject) => {
			const reader = new FileReader();

			reader.onload = (event) => {
				const image = new Image();

				image.onload = () => {
					const naturalWidth = Number(image.naturalWidth || image.width || 120);
					const naturalHeight = Number(image.naturalHeight || image.height || 80);
					const scale = Math.min(
						1,
						240 / Math.max(1, naturalWidth),
						180 / Math.max(1, naturalHeight)
					);
					const width = naturalWidth * scale;
					const height = naturalHeight * scale;

					addSimulationAnnotation({
						id: createAnnotationId(),
						type: 'image',
						x: pos.x - width / 2,
						y: pos.y - height / 2,
						width,
						height,
						src: event.target.result,
						name: file.name
					});
					resolve();
				};
				image.onerror = () => reject(new Error('Image could not be loaded'));
				image.src = event.target.result;
			};
			reader.onerror = () => reject(new Error('Image could not be read'));
			reader.readAsDataURL(file);
		});
	}

	function importSimulationFiles(files, position = null) {
		const fileList = Array.from(files ?? []).filter(Boolean);
		if (!fileList.length) {
			return Promise.resolve();
		}

		const imageFiles = fileList.filter(isImageFile);
		const importableFiles = fileList.filter((file) => !isImageFile(file));
		const imageImports = imageFiles.map((file) =>
			createSimulationImageAnnotationFromFile(file, position).catch((error) => {
				appendLiveError({
					title: 'Image could not be inserted',
					message: 'The image could not be inserted into the simulation drawing.',
					detail: describeError(error).detail ?? describeError(error).message
				});
			})
		);
		const documentImport = importableFiles.length
			? data.commands.importDocuments(importableFiles).catch((error) => {
					appendLiveError({
						title: 'File could not be imported',
						message: 'The file could not be imported into the simulation project.',
						detail: describeError(error).detail ?? describeError(error).message
					});
				})
			: Promise.resolve();

		return Promise.all([...imageImports, documentImport]);
	}

	function importSimulationDrawing() {
		const input = document.createElement('input');
		input.type = 'file';
		input.multiple = true;
		input.accept = '.rnw,.draw,.svg,image/*';
		input.onchange = () => {
			void importSimulationFiles(input.files);
		};
		input.click();
	}

	function cloneJson(value) {
		return value == null ? value : JSON.parse(JSON.stringify(value));
	}

	function makeUuid() {
		return crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`.replace(/\./g, '-');
	}

	function documentContentFromShadowNet(netDocument) {
		return netDocument?.content ?? netDocument ?? null;
	}

	function documentLayerItems(netDocument) {
		const content = documentContentFromShadowNet(netDocument);
		const layers = content?.layers;

		if (Array.isArray(layers)) {
			return layers;
		}

		if (Array.isArray(layers?.items)) {
			return layers.items;
		}

		return [];
	}

	function normalizeTextForDocument(text) {
		if (!text) {
			return text;
		}

		const normalized = cloneJson(text);
		const hint = normalized.hint ?? normalized.size_hint;

		delete normalized.hint;

		if (hint) {
			normalized.size_hint = {
				position_x: hint.position_x ?? hint.x ?? normalized.position_x ?? 0,
				position_y: hint.position_y ?? hint.y ?? normalized.position_y ?? 0,
				width: hint.width ?? 0,
				height: hint.height ?? 0
			};
		}

		return normalized;
	}

	function normalizeBoxForDocument(box) {
		if (!box) {
			return box;
		}

		const normalized = cloneJson(box);

		if (normalized.shape && !normalized.symbol_shape_id) {
			normalized.symbol_shape_id = normalized.shape;
		}

		if (normalized.shape_attributes && !normalized.symbol_shape_attributes) {
			normalized.symbol_shape_attributes = normalized.shape_attributes;
		}

		delete normalized.shape;
		delete normalized.shape_attributes;

		return normalized;
	}

	function normalizeBondForDocument(bond, idMap) {
		if (!bond) {
			return bond;
		}

		const normalized = cloneJson(bond);
		normalized.layer_id = idMap.get(normalized.layer_id) ?? normalized.layer_id;
		delete normalized.id;

		return normalized;
	}

	function normalizeWaypointForDocument(waypoint, index) {
		return {
			position_x: waypoint.position_x ?? waypoint.x ?? 0,
			position_y: waypoint.position_y ?? waypoint.y ?? 0,
			sort: waypoint.sort ?? index
		};
	}

	function normalizeEdgeForDocument(edge, idMap) {
		if (!edge) {
			return edge;
		}

		const normalized = cloneJson(edge);
		normalized.source_bond = normalizeBondForDocument(normalized.source_bond, idMap);
		normalized.target_bond = normalizeBondForDocument(normalized.target_bond, idMap);
		normalized.waypoints = (normalized.waypoints ?? []).map(normalizeWaypointForDocument);

		return normalized;
	}

	function editableSimulationDocumentData(net) {
		const content = documentContentFromShadowNet(net?.document);
		const sourceLayers = documentLayerItems(net?.document);

		if (!content || !sourceLayers.length) {
			return null;
		}

		const idMap = new Map(sourceLayers.map((layer) => [layer.id, makeUuid()]));
		const layers = sourceLayers.map((sourceLayer) => {
			const layer = cloneJson(sourceLayer);

			layer.id = idMap.get(sourceLayer.id) ?? makeUuid();
			layer.box = normalizeBoxForDocument(layer.box);
			layer.text = normalizeTextForDocument(layer.text);
			layer.edge = normalizeEdgeForDocument(layer.edge, idMap);

			if (layer.interface_id && !layer.interface) {
				layer.interface = { socket_schema_id: layer.interface_id };
			}

			if (layer.hyperlink) {
				layer.outgoing_link = {
					target_layer_id: idMap.get(layer.hyperlink) ?? layer.hyperlink
				};
			}

			delete layer.interface_id;
			delete layer.hyperlink;
			delete layer.parent_id;

			return layer;
		});

		return {
			name: `${net?.name ?? content.name ?? 'Simulation Drawing'} (editable)`,
			kind: content.kind ?? 'de.renew.gui.CPNDrawing',
			layers
		};
	}

	function editableSimulationNet(sns, currentNetId) {
		return sns?.nets?.find((net) => net.id === currentNetId) ?? null;
	}

	function openEditableSimulationDrawing(sns, currentNetId) {
		const net = editableSimulationNet(sns, currentNetId);
		const documentData = editableSimulationDocumentData(net);

		if (!documentData) {
			appendLiveError({
				title: 'Drawing could not be opened',
				message: 'No editable drawing data is available for the selected net instance.'
			});
			return;
		}

		data.commands.createEditableSimulationDrawing(documentData).catch((error) => {
			appendLiveError(error);
		});
	}

	async function openSimulationUrl() {
		const href = window.prompt('Open URL');
		if (!href) {
			return;
		}

		try {
			const response = await fetch(href);
			if (!response.ok) {
				throw new Error(`The URL responded with status ${response.status}.`);
			}

			const blob = await response.blob();
			const name = href.split('/').filter(Boolean).at(-1) || 'download';
			const file = new File([blob], name, { type: blob.type || 'application/octet-stream' });
			await importSimulationFiles([file]);
		} catch (error) {
			appendLiveError({
				title: 'URL could not be opened',
				message: 'PetriStation could not import the content from the URL.',
				detail: describeError(error).detail ?? describeError(error).message
			});
		}
	}

	function printSimulationDrawing(evt) {
		evt.preventDefault();
		window.print();
	}

	function saveSimulationState(simulation) {
		const blob = new Blob([JSON.stringify(simulation, null, 2)], {
			type: 'application/json'
		});
		downloadFile(blob, `${simulation?.id ?? 'simulation'}-state.json`);
	}

	function loadSimulationState(simulation) {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = 'application/json,.json';

		input.onchange = () => {
			const file = input.files?.[0];

			if (!file) {
				return;
			}

			const reader = new FileReader();
			reader.onload = () => {
				try {
					const state = JSON.parse(String(reader.result ?? ''));

					if (!Array.isArray(state?.net_instances)) {
						throw new Error('The selected file is not a PetriStation simulation state.');
					}

					simulation.value = {
						...simulation.value,
						...state,
						running: simulation.value.running,
						is_playing: simulation.value.is_playing
					};
				} catch (error) {
					appendLiveError({
						title: 'Simulation state could not be loaded',
						message: 'The selected file could not be used as a simulation state.',
						detail: describeError(error).detail ?? describeError(error).message
					});
				}
			};
			reader.onerror = () => {
				appendLiveError({
					title: 'Simulation state could not be loaded',
					message: 'The selected file could not be read.',
					detail: describeError(reader.error).detail ?? describeError(reader.error).message
				});
			};
			reader.readAsText(file);
		};

		input.click();
	}

	function dragContainsFiles(evt) {
		return Array.from(evt?.dataTransfer?.types ?? []).includes('Files');
	}

	function onSimulationDragEnter(evt) {
		if (!dragContainsFiles(evt)) {
			return;
		}

		evt.preventDefault();
		simulationDraggingFiles = true;
	}

	function onSimulationDragOver(evt) {
		if (!dragContainsFiles(evt)) {
			return;
		}

		evt.preventDefault();
		evt.dataTransfer.dropEffect = 'copy';
		simulationDraggingFiles = true;
	}

	function onSimulationDragLeave(evt) {
		if (evt.target === evt.currentTarget) {
			simulationDraggingFiles = false;
		}
	}

	function onSimulationDrop(evt, liveLenses = null) {
		if (!evt.dataTransfer?.files?.length) {
			return;
		}

		evt.preventDefault();
		simulationDraggingFiles = false;
		void importSimulationFiles(evt.dataTransfer.files, simulationDropPosition(evt, liveLenses));
	}

	function symbolShapeAttributes(box) {
		return {
			...(box?.symbol_shape_attributes ?? {}),
			...(box?.shape_attributes ?? {})
		};
	}

	function layerById(docValue, id) {
		return (docValue?.layers?.items ?? []).find((layer) => layer?.id === id);
	}

	function simulationTextLayer(layer, docValue) {
		const linkedLayer = layerById(docValue, layer?.hyperlink);

		if (!linkedLayer?.edge) {
			return layer;
		}

		return {
			...layer,
			text: {
				...layer.text,
				style: {
					background_color: '#ffffff',
					background_opacity: 0.86,
					...(layer.text?.style ?? {})
				}
			}
		};
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

	function isPlaceLikeLayer(layer) {
		const tag = layer?.semantic_tag ?? '';
		return (
			tag === 'de.renew.gui.PlaceFigure' ||
			tag === 'de.renew.gui.VirtualPlaceFigure' ||
			tag === 'de.renew.fa.figures.FAStateFigure' ||
			tag.endsWith('.PlaceFigure') ||
			tag.endsWith('.VirtualPlaceFigure') ||
			tag.endsWith('.FAStateFigure')
		);
	}

	function selectSimulationLayer(layer) {
		selectedLayerId.value = layer?.id ?? null;
		selectedAnnotationId.value = null;
		selectedTransitionId.value = isTransitionLayer(layer) ? layer.id : null;
		selectedPlaceId.value = isPlaceLikeLayer(layer) ? layer.id : null;
	}

	function clearSimulationSelection() {
		selectedLayerId.value = null;
		selectedAnnotationId.value = null;
		selectedTransitionId.value = null;
		selectedPlaceId.value = null;
	}

	function selectedSimulationAnnotation() {
		return simulationAnnotations.value.find(
			(annotation) => annotation?.id === selectedAnnotationId.value
		);
	}

	function selectSimulationAnnotation(annotation) {
		selectedLayerId.value = null;
		selectedTransitionId.value = null;
		selectedPlaceId.value = null;
		selectedAnnotationId.value = annotation?.id ?? null;
	}

	function isSimulationAnnotationTool(toolId = activeSimulationTool.value) {
		return (
			toolId === 'annotation-rect' ||
			toolId === 'annotation-ellipse' ||
			toolId === 'annotation-line' ||
			toolId === 'annotation-text'
		);
	}

	function isSimulationShapeAnnotationTool(toolId = activeSimulationTool.value) {
		return toolId === 'annotation-rect' || toolId === 'annotation-ellipse';
	}

	function createAnnotationId() {
		return (
			crypto?.randomUUID?.() ??
			`simulation-annotation-${Date.now()}-${Math.random().toString(16).slice(2)}`
		);
	}

	function annotationBox(start, current) {
		const x = Math.min(start.x, current.x);
		const y = Math.min(start.y, current.y);
		const width = Math.abs(current.x - start.x);
		const height = Math.abs(current.y - start.y);

		return { x, y, width, height };
	}

	function completedAnnotationBox(draft) {
		const box = annotationBox(draft.start, draft.current);

		if (box.width < 3 && box.height < 3) {
			if (draft.toolId === 'annotation-ellipse') {
				return {
					x: draft.start.x - 16,
					y: draft.start.y - 16,
					width: 32,
					height: 32
				};
			}

			return {
				x: draft.start.x - 18,
				y: draft.start.y - 12,
				width: 36,
				height: 24
			};
		}

		return box;
	}

	function addSimulationAnnotation(annotation) {
		simulationAnnotations.value = [...simulationAnnotations.value, annotation];
		selectSimulationAnnotation(annotation);
	}

	function replaceSimulationAnnotation(id, updater) {
		simulationAnnotations.value = simulationAnnotations.value.map((annotation) =>
			annotation?.id === id ? updater(annotation) : annotation
		);
	}

	function deleteSelectedSimulationAnnotation() {
		if (!selectedAnnotationId.value) {
			return false;
		}

		simulationAnnotations.value = simulationAnnotations.value.filter(
			(annotation) => annotation?.id !== selectedAnnotationId.value
		);
		selectedAnnotationId.value = null;
		return true;
	}

	function editSimulationTextAnnotation(annotation) {
		if (annotation?.type !== 'text') {
			return;
		}

		const text = window.prompt('Text', annotation.text ?? '');
		if (text === null) {
			return;
		}

		replaceSimulationAnnotation(annotation.id, (current) => ({
			...current,
			text
		}));
	}

	function beginMoveSimulationAnnotation(evt, annotation, liveLenses) {
		if (!annotation?.id || !evt.isPrimary || evt.button !== 0) {
			return;
		}

		evt.preventDefault();
		evt.stopPropagation();
		selectSimulationAnnotation(annotation);
		annotationMove.value = {
			pointerId: evt.pointerId,
			id: annotation.id,
			start: liveLenses.clientToCanvas(evt.clientX, evt.clientY),
			original: { ...annotation }
		};
		evt.currentTarget.setPointerCapture(evt.pointerId);
	}

	function updateMoveSimulationAnnotation(evt, liveLenses) {
		const move = annotationMove.value;
		if (!move || move.pointerId !== evt.pointerId || !evt.isPrimary) {
			return;
		}

		evt.preventDefault();
		evt.stopPropagation();
		const current = liveLenses.clientToCanvas(evt.clientX, evt.clientY);
		const dx = current.x - move.start.x;
		const dy = current.y - move.start.y;

		replaceSimulationAnnotation(move.id, () => {
			if (move.original.type === 'line') {
				return {
					...move.original,
					x1: move.original.x1 + dx,
					y1: move.original.y1 + dy,
					x2: move.original.x2 + dx,
					y2: move.original.y2 + dy
				};
			}

			return {
				...move.original,
				x: move.original.x + dx,
				y: move.original.y + dy
			};
		});
	}

	function finishMoveSimulationAnnotation(evt) {
		const move = annotationMove.value;
		if (!move || move.pointerId !== evt.pointerId || !evt.isPrimary) {
			return;
		}

		evt.preventDefault();
		evt.stopPropagation();
		if (evt.currentTarget.hasPointerCapture(evt.pointerId)) {
			evt.currentTarget.releasePointerCapture(evt.pointerId);
		}
		annotationMove.value = null;
	}

	function beginSimulationAnnotation(evt, liveLenses) {
		if (!isSimulationAnnotationTool() || !evt.isPrimary || evt.button !== 0) {
			return;
		}

		evt.preventDefault();
		evt.stopPropagation();
		const position = liveLenses.clientToCanvas(evt.clientX, evt.clientY);

		if (activeSimulationTool.value === 'annotation-text') {
			const text = window.prompt('Text', '');
			if (text !== null) {
				const annotation = {
					id: createAnnotationId(),
					type: 'text',
					x: position.x,
					y: position.y,
					text
				};
				addSimulationAnnotation(annotation);
			}
			return;
		}

		annotationDraft.value = {
			toolId: activeSimulationTool.value,
			start: position,
			current: position
		};
		evt.currentTarget.setPointerCapture(evt.pointerId);
	}

	function updateSimulationAnnotation(evt, liveLenses) {
		if (!annotationDraft.value || !evt.isPrimary) {
			return;
		}

		evt.preventDefault();
		evt.stopPropagation();
		annotationDraft.value = {
			...annotationDraft.value,
			current: liveLenses.clientToCanvas(evt.clientX, evt.clientY)
		};
	}

	function finishSimulationAnnotation(evt) {
		if (!annotationDraft.value || !evt.isPrimary) {
			return;
		}

		evt.preventDefault();
		evt.stopPropagation();
		const draft = annotationDraft.value;
		const annotation =
			draft.toolId === 'annotation-line'
				? {
						id: createAnnotationId(),
						type: 'line',
						x1: draft.start.x,
						y1: draft.start.y,
						x2:
							Math.hypot(draft.current.x - draft.start.x, draft.current.y - draft.start.y) < 3
								? draft.start.x + 36
								: draft.current.x,
						y2:
							Math.hypot(draft.current.x - draft.start.x, draft.current.y - draft.start.y) < 3
								? draft.start.y
								: draft.current.y
					}
				: {
						id: createAnnotationId(),
						type: draft.toolId === 'annotation-ellipse' ? 'ellipse' : 'rect',
						...completedAnnotationBox(draft)
					};

		annotationDraft.value = null;
		addSimulationAnnotation(annotation);
	}

	function cancelSimulationAnnotation() {
		annotationDraft.value = null;
		annotationMove.value = null;
	}

	function clearSimulationAnnotations() {
		simulationAnnotations.value = [];
		selectedAnnotationId.value = null;
		annotationDraft.value = null;
		annotationMove.value = null;
	}

	function transitionCommandPayload(netInstance, transitionLayer, bindingIndex = undefined) {
		const payload = {
			net_instance_label: netInstance?.label,
			transition_id: transitionLayer?.id
		};

		if (bindingIndex !== undefined) {
			payload.binding_index = bindingIndex;
		}

		return payload;
	}

	function canCommandTransition(simulation, netInstance, transitionLayer) {
		return simulation?.running && netInstance?.label && isTransitionLayer(transitionLayer);
	}

	function breakpointItems(breakpointEntries) {
		return Array.isArray(breakpointEntries?.breakpoints) ? breakpointEntries.breakpoints : [];
	}

	function transitionBreakpointIds(items = []) {
		return new Set(items.map((breakpoint) => breakpoint?.transition_id).filter(Boolean));
	}

	function hasTransitionBreakpoint(layer, items = []) {
		return transitionBreakpointIds(items).has(layer?.id);
	}

	function breakpointLabel(breakpoint) {
		const transitionId = breakpoint?.transition_id ?? '';
		return transitionId ? `firing starts (${transitionId.slice(0, 8)}...)` : 'firing starts';
	}

	function selectBreakpointTransition(breakpoint) {
		const transitionId = breakpoint?.transition_id;
		if (transitionId) {
			selectedLayerId.value = transitionId;
			selectedTransitionId.value = transitionId;
			selectedPlaceId.value = null;
		}
	}

	async function setBreakpointAtSelection(dispatch) {
		const transition_id = selectedTransitionId.value;

		if (!transition_id) {
			return;
		}

		try {
			await dispatch('set_transition_breakpoint', { transition_id });
		} catch (error) {
			appendLiveError(error);
		}
	}

	async function clearBreakpointAtSelection(dispatch) {
		const transition_id = selectedTransitionId.value;

		if (!transition_id) {
			return;
		}

		try {
			await dispatch('clear_transition_breakpoint', { transition_id });
		} catch (error) {
			appendLiveError(error);
		}
	}

	async function clearBreakpoint(dispatch, breakpoint) {
		const transition_id = breakpoint?.transition_id;
		if (!transition_id) {
			return;
		}

		try {
			await dispatch('clear_transition_breakpoint', { transition_id });
			if (selectedTransitionId.value === transition_id) {
				clearSimulationSelection();
			}
		} catch (error) {
			appendLiveError(error);
		}
	}

	async function clearAllBreakpoints(dispatch) {
		try {
			await dispatch('clear_breakpoints', {});
		} catch (error) {
			appendLiveError(error);
		}
	}

	function rememberNetInstanceActions(netInstance, actions) {
		if (
			netInstance?.id &&
			actions?.dispatch &&
			(netInstanceActions.value?.id !== netInstance.id ||
				netInstanceActions.value?.dispatch !== actions.dispatch)
		) {
			netInstanceActions.value = {
				id: netInstance.id,
				dispatch: actions.dispatch,
				cast: actions.cast
			};
		}

		return '';
	}

	function activeNetInstanceActions(netInstance) {
		return netInstanceActions.value?.id === netInstance?.id ? netInstanceActions.value : null;
	}

	function netInstanceDispatch(fallbackDispatch, netInstance) {
		return activeNetInstanceActions(netInstance)?.dispatch ?? fallbackDispatch;
	}

	function bindingSelectionDispatch(fallbackDispatch, selection, simulation) {
		return netInstanceDispatch(fallbackDispatch, netInstanceForBinding(selection, simulation));
	}

	async function performNetStep(fallbackCast, netInstance) {
		const actions = activeNetInstanceActions(netInstance);

		if (actions?.dispatch) {
			try {
				await actions.dispatch('net_step', {});
			} catch (error) {
				appendLiveError(error);
			}

			return;
		}

		fallbackCast('net_step', {
			net_instance_label: netInstance?.label
		});
	}

	function shortBindingText(binding) {
		const text = `${binding ?? ''}`.replace(/\s+/g, '');
		return text.length > 50 ? `${text.slice(0, 47)}...` : text;
	}

	function transitionInstanceFromBinding(binding) {
		const firstLine = `${binding ?? ''}`.split('\n')[0];
		const bindingStart = firstLine.indexOf('{');

		return bindingStart >= 0 ? firstLine.slice(0, bindingStart) : firstLine;
	}

	function bindingSelectionTitle(selection) {
		if (selection?.transition_instance) {
			return `${selection.transition_instance}'s possible bindings`;
		}

		const fallback = transitionInstanceFromBinding(selection?.bindings?.[0]);
		if (fallback) {
			return `${fallback}'s possible bindings`;
		}

		return `${selection?.net_instance_label ?? ''}.${selection?.transition_id ?? ''}'s possible bindings`;
	}

	function selectedBindingText(selection) {
		return selection?.bindings?.[Number(selection?.selected_index ?? 0)] ?? '';
	}

	function bindingDialogStyle(position) {
		if (!position) {
			return '';
		}

		return `left: ${position.x}px; top: ${position.y}px; transform: none;`;
	}

	function closeBindingSelection() {
		bindingSelection.value = null;
		bindingDialogPosition.value = null;
		bindingAutoRefresh.lastSignature = null;
	}

	function layerDisplayName(layer) {
		return layer?.text?.body || layer?.semantic_tag?.split('.')?.at(-1) || layer?.id || 'Layer';
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

	function layerVisibleInSimulationDrawing(layer, hidden = false) {
		return !hidden && (showSequentialOnlyArcs.value || !isSequentialOnlyArcLayer(layer));
	}

	function simulationSelectionLabel(docValue) {
		const annotation = selectedSimulationAnnotation();

		if (annotation) {
			if (annotation.type === 'text') {
				return annotation.text || 'Text annotation';
			}

			if (annotation.type === 'image') {
				return annotation.name || 'Image annotation';
			}

			if (annotation.type === 'line') {
				return 'Line annotation';
			}

			return 'Drawing annotation';
		}

		const layer = layerById(docValue, selectedLayerId.value);

		if (!layer) {
			return 'Nothing Selected';
		}

		return layerDisplayName(layer);
	}

	function simulationSelectionKind(docValue = null) {
		if (selectedSimulationAnnotation()) {
			return 'Annotation';
		}

		const layer = layerById(docValue, selectedLayerId.value);

		if (!layer) {
			return '';
		}

		if (isTransitionLayer(layer)) {
			return 'Transition';
		}

		if (isPlaceLikeLayer(layer)) {
			return 'Place';
		}

		if (layer.edge) {
			return 'Edge';
		}

		if (layer.text) {
			return 'Text';
		}

		return 'Figure';
	}

	function selectedSimulationLayer(docValue) {
		return layerById(docValue, selectedLayerId.value);
	}

	function nonEmptyAttribute(label, value, color = null) {
		if (value === undefined || value === null || value === '') {
			return null;
		}

		return { label, value, color };
	}

	function simulationAttributeItems(layer) {
		if (!layer) {
			return [];
		}

		const style = layer.style ?? {};
		const box = layer.box ?? {};
		const edgeStyle = layer.edge?.style ?? {};
		const textStyle = layer.text?.style ?? {};

		return [
			nonEmptyAttribute('Fill', style.background_color, style.background_color),
			nonEmptyAttribute('Fill opacity', style.background_opacity ?? style.opacity),
			nonEmptyAttribute(
				'Pen',
				style.border_color ?? edgeStyle.stroke_color,
				style.border_color ?? edgeStyle.stroke_color
			),
			nonEmptyAttribute('Pen opacity', style.border_opacity ?? edgeStyle.stroke_opacity),
			nonEmptyAttribute('Pen width', style.border_width ?? edgeStyle.stroke_width),
			nonEmptyAttribute('Line', edgeStyle.stroke_dash_array),
			nonEmptyAttribute('Shape', box.shape),
			nonEmptyAttribute('Text', textStyle.color, textStyle.color),
			nonEmptyAttribute('Text opacity', textStyle.opacity),
			nonEmptyAttribute('Font', textStyle.font_family),
			nonEmptyAttribute('Font size', textStyle.font_size),
			nonEmptyAttribute('Text type', textStyle.renew_type)
		].filter(Boolean);
	}

	function annotationStyle(annotation) {
		return annotation?.style ?? {};
	}

	function annotationFillColor(annotation) {
		return annotationStyle(annotation).fill_color ?? '#70db93';
	}

	function annotationFillOpacity(annotation) {
		return annotationStyle(annotation).fill_opacity ?? 0.45;
	}

	function annotationStrokeColor(annotation) {
		return annotationStyle(annotation).stroke_color ?? 'black';
	}

	function annotationStrokeOpacity(annotation) {
		return annotationStyle(annotation).stroke_opacity ?? 1;
	}

	function annotationStrokeWidth(annotation) {
		return annotationStyle(annotation).stroke_width ?? 1;
	}

	function annotationStrokeDashArray(annotation) {
		return annotationStyle(annotation).stroke_dash_array ?? 'none';
	}

	function annotationTextColor(annotation) {
		return annotationStyle(annotation).text_color ?? 'black';
	}

	function annotationTextOpacity(annotation) {
		return annotationStyle(annotation).text_opacity ?? 1;
	}

	function annotationFontFamily(annotation) {
		return annotationStyle(annotation).font_family ?? 'sans-serif';
	}

	function annotationFontSize(annotation) {
		return annotationStyle(annotation).font_size ?? 14;
	}

	function simulationAnnotationAttributeItems(annotation) {
		if (!annotation) {
			return [];
		}

		const style = annotationStyle(annotation);
		const items =
			annotation.type === 'text'
				? [
						nonEmptyAttribute(
							'Text',
							annotationTextColor(annotation),
							annotationTextColor(annotation)
						),
						nonEmptyAttribute('Text opacity', annotationTextOpacity(annotation)),
						nonEmptyAttribute('Font', annotationFontFamily(annotation)),
						nonEmptyAttribute('Font size', annotationFontSize(annotation))
					]
				: [
						annotation.type !== 'line'
							? nonEmptyAttribute(
									'Fill',
									annotationFillColor(annotation),
									annotationFillColor(annotation)
								)
							: null,
						annotation.type !== 'line'
							? nonEmptyAttribute('Fill opacity', annotationFillOpacity(annotation))
							: null,
						nonEmptyAttribute(
							'Pen',
							annotationStrokeColor(annotation),
							annotationStrokeColor(annotation)
						),
						nonEmptyAttribute('Pen opacity', annotationStrokeOpacity(annotation)),
						nonEmptyAttribute('Pen width', annotationStrokeWidth(annotation)),
						nonEmptyAttribute('Line', annotationStrokeDashArray(annotation))
					];

		return [...items, nonEmptyAttribute('Style', style.font_weight || style.font_style)].filter(
			Boolean
		);
	}

	function updateSelectedSimulationAnnotation(updater) {
		const id = selectedAnnotationId.value;

		if (!id) {
			return;
		}

		replaceSimulationAnnotation(id, (annotation) => ({
			...annotation,
			...updater(annotation)
		}));
	}

	function updateSelectedSimulationAnnotationStyle(patch) {
		updateSelectedSimulationAnnotation((annotation) => ({
			style: {
				...annotationStyle(annotation),
				...patch
			}
		}));
	}

	function placeTokens(netInstance, placeId) {
		return (netInstance?.tokens ?? []).filter((token) => token.place_id === placeId);
	}

	function tokenValue(token) {
		return `${token?.value ?? ''}`;
	}

	function isNetReferenceToken(value) {
		return /^[A-Za-z_]\w*\[\d+\]$/.test(`${value ?? ''}`);
	}

	function groupedTokenRows(tokens) {
		const rowsByValue = new Map();

		for (const token of tokens ?? []) {
			const value = tokenValue(token);
			const row = rowsByValue.get(value);

			if (row) {
				row.count += 1;
			} else {
				rowsByValue.set(value, {
					value,
					count: 1,
					netReference: isNetReferenceToken(value)
				});
			}
		}

		return [...rowsByValue.values()];
	}

	function tokenRowLabel(row) {
		return row.count > 1 ? `${row.count} * ${row.value}` : row.value;
	}

	function tokenTextWidth(text, fontSize = 12) {
		return Math.max(18, `${text ?? ''}`.length * fontSize * 0.6 + 8);
	}

	function tokenDisplayLayout(rows, compact, totalTokenCount) {
		const fontSize = compact ? 20 : 12;
		const lineHeight = compact ? 24 : 16;
		const labels = compact ? [`${totalTokenCount || 0}`] : rows.map(tokenRowLabel);
		const width = Math.max(
			...labels.map((label) => tokenTextWidth(label, fontSize)),
			compact ? 24 : 32
		);
		const height = Math.max(lineHeight, labels.length * lineHeight) + (compact ? 2 : 4);

		return { fontSize, lineHeight, width, height };
	}

	function tokenRowY(rowIndex, rowCount, lineHeight) {
		return (rowIndex - (rowCount - 1) / 2) * lineHeight;
	}

	function openMarkingDialog(evt, placeLayer, tokens = []) {
		if (!placeLayer?.id) {
			return;
		}

		evt?.preventDefault?.();
		evt?.stopPropagation?.();
		selectSimulationLayer(placeLayer);
		markingDialog.value = {
			place_id: placeLayer.id,
			title: `${layerDisplayName(placeLayer)}'s current marking`,
			tokens
		};

		if (evt?.clientX && evt?.clientY) {
			markingDialogPosition.value = { x: evt.clientX + 8, y: evt.clientY + 8 };
		}
	}

	function closeMarkingDialog() {
		markingDialog.value = null;
		markingDialogPosition.value = null;
	}

	function markingDialogStyle(position) {
		if (!position) {
			return '';
		}

		return `left: ${position.x}px; top: ${position.y}px; transform: none;`;
	}

	function startMarkingDialogDrag(evt) {
		if (evt.button !== 0) {
			return;
		}

		const dialog = evt.currentTarget.closest('.marking-dialog');
		if (!dialog) {
			return;
		}

		evt.preventDefault();

		const rect = dialog.getBoundingClientRect();
		const startX = evt.clientX;
		const startY = evt.clientY;
		const originX = rect.left;
		const originY = rect.top;

		function clampPosition(x, y) {
			const margin = 8;
			const maxX = Math.max(margin, window.innerWidth - rect.width - margin);
			const maxY = Math.max(margin, window.innerHeight - rect.height - margin);

			return {
				x: Math.min(Math.max(margin, x), maxX),
				y: Math.min(Math.max(margin, y), maxY)
			};
		}

		function move(moveEvt) {
			markingDialogPosition.value = clampPosition(
				originX + moveEvt.clientX - startX,
				originY + moveEvt.clientY - startY
			);
		}

		function stop() {
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', stop);
			window.removeEventListener('pointercancel', stop);
		}

		markingDialogPosition.value = clampPosition(originX, originY);
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', stop);
		window.addEventListener('pointercancel', stop);
	}

	function startBindingDialogDrag(evt) {
		if (evt.button !== 0) {
			return;
		}

		const dialog = evt.currentTarget.closest('.binding-dialog');
		if (!dialog) {
			return;
		}

		evt.preventDefault();

		const rect = dialog.getBoundingClientRect();
		const startX = evt.clientX;
		const startY = evt.clientY;
		const originX = rect.left;
		const originY = rect.top;

		function clampPosition(x, y) {
			const margin = 8;
			const maxX = Math.max(margin, window.innerWidth - rect.width - margin);
			const maxY = Math.max(margin, window.innerHeight - rect.height - margin);

			return {
				x: Math.min(Math.max(margin, x), maxX),
				y: Math.min(Math.max(margin, y), maxY)
			};
		}

		function move(moveEvt) {
			bindingDialogPosition.value = clampPosition(
				originX + moveEvt.clientX - startX,
				originY + moveEvt.clientY - startY
			);
		}

		function stop() {
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', stop);
			window.removeEventListener('pointercancel', stop);
		}

		bindingDialogPosition.value = clampPosition(originX, originY);
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', stop);
		window.addEventListener('pointercancel', stop);
	}

	function netInstanceForBinding(selection, simulation, netInstance = null) {
		if (netInstance?.label === selection?.net_instance_label) {
			return netInstance;
		}

		return simulation?.net_instances?.find(
			(instance) => instance.label === selection?.net_instance_label
		);
	}

	function netInstanceTokenSignature(netInstance) {
		return (netInstance?.tokens ?? [])
			.map((token) => [token.id, token.place_id, token.value])
			.sort(([a], [b]) => `${a}`.localeCompare(`${b}`));
	}

	function bindingAutoRefreshSignature(selection, simulation, netInstance = null) {
		if (!selection || !simulation?.running) {
			return null;
		}

		const selectedInstance = netInstanceForBinding(selection, simulation, netInstance);

		return JSON.stringify([
			selection.net_instance_label,
			selection.transition_id,
			simulation.running,
			simulation.timestep,
			simulation.is_playing,
			selectedInstance?.id,
			netInstanceTokenSignature(selectedInstance)
		]);
	}

	function scheduleBindingSelectionRefresh(dispatch, delay = 0) {
		const refresh = () => {
			const selection = bindingSelection.value;

			if (!selection || selection.loading || selection.refreshing) {
				return;
			}

			void updateBindingSelection(dispatch, selection, { showLoading: false });
		};

		if (delay > 0) {
			setTimeout(refresh, delay);
		} else {
			queueMicrotask(refresh);
		}
	}

	function autoRefreshBindingSelection(dispatch, simulation, netInstance = null) {
		const selection = bindingSelection.value;
		const signature = bindingAutoRefreshSignature(selection, simulation, netInstance);

		if (!signature) {
			bindingAutoRefresh.lastSignature = null;
			return '';
		}

		if (
			selection.loading ||
			selection.refreshing ||
			signature === bindingAutoRefresh.lastSignature
		) {
			return '';
		}

		bindingAutoRefresh.lastSignature = signature;

		if (bindingAutoRefresh.queued) {
			return '';
		}

		bindingAutoRefresh.queued = true;

		queueMicrotask(() => {
			bindingAutoRefresh.queued = false;
			scheduleBindingSelectionRefresh(dispatch);
		});

		return '';
	}

	async function updateBindingSelection(
		dispatch,
		selection = bindingSelection.value,
		{ showLoading = true } = {}
	) {
		if (!selection) {
			return;
		}

		const selectedIndex = Number(selection.selected_index ?? 0);

		bindingSelection.value = {
			...selection,
			loading: showLoading,
			refreshing: !showLoading,
			error: null
		};

		try {
			const response = await dispatch('transition_bindings', {
				net_instance_label: selection.net_instance_label,
				transition_id: selection.transition_id
			});
			const bindings = response?.bindings ?? [];
			const nextIndex = Math.min(selectedIndex, Math.max(bindings.length - 1, 0));
			const currentSelection = bindingSelection.value;

			if (
				!currentSelection ||
				currentSelection.net_instance_label !== selection.net_instance_label ||
				currentSelection.transition_id !== selection.transition_id
			) {
				return;
			}

			bindingSelection.value = {
				...currentSelection,
				transition_instance:
					response?.transition_instance ??
					transitionInstanceFromBinding(bindings[0]) ??
					selection.transition_instance,
				bindings,
				selected_index: nextIndex,
				loading: false,
				refreshing: false,
				error: response?.error ?? null
			};
		} catch (error) {
			const described = describeError(error);
			const currentSelection = bindingSelection.value;

			if (
				!currentSelection ||
				currentSelection.net_instance_label !== selection.net_instance_label ||
				currentSelection.transition_id !== selection.transition_id
			) {
				return;
			}

			bindingSelection.value = {
				...currentSelection,
				loading: false,
				refreshing: false,
				error: described.detail || described.message || described.title
			};
		}
	}

	async function openBindingSelection(dispatch, simulation, netInstance, transitionLayer) {
		if (!canCommandTransition(simulation, netInstance, transitionLayer)) {
			return;
		}

		const payload = transitionCommandPayload(netInstance, transitionLayer);

		bindingSelection.value = {
			net_instance_label: payload.net_instance_label,
			transition_id: payload.transition_id,
			transition_instance: null,
			bindings: [],
			selected_index: 0,
			loading: true,
			error: null
		};

		await updateBindingSelection(dispatch, bindingSelection.value);
		bindingAutoRefresh.lastSignature = bindingAutoRefreshSignature(
			bindingSelection.value,
			simulation,
			netInstance
		);
	}

	async function fireTransition(
		dispatch,
		simulation,
		netInstance,
		transitionLayer,
		bindingIndex = undefined
	) {
		if (!canCommandTransition(simulation, netInstance, transitionLayer)) {
			return false;
		}

		try {
			const response = await dispatch(
				'fire_transition',
				transitionCommandPayload(netInstance, transitionLayer, bindingIndex)
			);

			if (response?.error) {
				appendLiveError({
					title: 'Simulation Error',
					message: 'Transition could not be fired',
					detail: response.error
				});
			}

			const fired = response?.fired === true;
			return fired;
		} catch (error) {
			appendLiveError(error);
			return false;
		}
	}

	async function fireSelectedBinding(dispatch, bindingIndex) {
		const selection = bindingSelection.value;

		if (!selection) {
			return;
		}

		let response;

		try {
			response = await dispatch('fire_transition', {
				net_instance_label: selection.net_instance_label,
				transition_id: selection.transition_id,
				binding_index: bindingIndex
			});
		} catch (error) {
			const described = describeError(error);
			bindingSelection.value = {
				...selection,
				error: described.detail || described.message || described.title
			};
			appendLiveError(error);
			return;
		}

		if (response?.fired !== true && response?.error) {
			bindingSelection.value = { ...selection, error: response.error };
		}
	}
</script>

<div class="full-page">
	<AppBar
		active="simulations"
		title={`Simulatation Observer`}
		projectId={data.simulation.links.project.id}
		authState={data.authState}
		connectionState={data.connectionState}
	/>

	<LiveResource socket={data.live_socket} resource={breakPointEntriesResource} errors={liveErrors}>
		{#snippet children(breakPointEntries)}
			{@const activeBreakpoints = breakpointItems(breakPointEntries.value)}
			<LiveResource socket={data.live_socket} resource={data.simulation} errors={liveErrors}>
				{#snippet children(simulation, presence, { dispatch, cast, queuedActions })}
					{@const nets = view(['shadow_net_system', 'content', 'nets'], simulation)}
					{@const net_instances = view('net_instances', simulation)}
					{@const current_instance = viewCombined(
						L.choices(L.choose(({ ci }) => ['net_instances', L.find(R.propEq(ci, 'id'))])),
						{ net_instances, ci: currentInstance }
					)}

					{@const current_net_id = view(['links', 'shadow_net', 'id'], current_instance)}

					{@const current_instance_href = view('href', current_instance)}

					<Modal bind:visible={showAbout.value} closeLabel="Close">
						<h2>About PetriStation</h2>
						<p>
							PetriStation simulation observer with Renew-compatible simulation controls and
							visualization.
						</p>
						<p>Simulation: {simulation.value.name}</p>
					</Modal>

					<Modal bind:visible={showSimulationConfig.value} closeLabel="Close">
						<h2>Configure Simulation</h2>
						<div class="configuration-grid">
							<section>
								<h3>Observer</h3>
								<label>
									<input type="checkbox" bind:checked={showMinimap.value} />
									Show minimap
								</label>
								<label>
									<input type="checkbox" bind:checked={showInstances.value} />
									Show net instances
								</label>
								<label>
									<input type="checkbox" bind:checked={showLog.value} />
									Show simulation trace
								</label>
								<label>
									<input type="checkbox" bind:checked={showDebug.value} />
									Show debug data
								</label>
							</section>
							<section>
								<h3>Drawing</h3>
								<label>
									<input type="checkbox" bind:checked={showGrid.value} />
									Show grid
								</label>
								<label>
									Grid distance
									<input
										type="number"
										min="4"
										step="1"
										bind:value={gridDistance.value}
										disabled={!showGrid.value}
									/>
								</label>
								<label>
									<input type="checkbox" bind:checked={lockRotation.value} />
									Lock rotation
								</label>
								<label>
									<input type="checkbox" bind:checked={showSequentialOnlyArcs.value} />
									Show sequential-only arcs
								</label>
							</section>
							<section>
								<h3>Simulation</h3>
								<p>Status: {simulation.value.running ? 'running' : 'not running'}</p>
								<p>Time: {simulation.value.timestep}</p>
								<p>Net instance: {current_instance.value?.label ?? 'none selected'}</p>
								<div class="configuration-actions">
									<MenuBarButton
										onclick={(evt) => {
											evt.preventDefault();
											openSimulationConsole();
										}}>Command Console...</MenuBarButton
									>
									<a
										class="menu-bar-item-button"
										href={simulationMenuHref('simulator_health', '/health/simulator')}
										target="_blank"
									>
										Remote Server...
									</a>
								</div>
							</section>
						</div>
					</Modal>

					<header
						role="presentation"
						class={{
							header: true,
							'drop-target': simulationDraggingFiles
						}}
						ondragenter={onSimulationDragEnter}
						ondragover={onSimulationDragOver}
						ondragleave={onSimulationDragLeave}
						ondrop={onSimulationDrop}
					>
						<div class="header-titel">
							<a
								href={resolve(`/projects/${data.simulation.links.project.id}/simulations`)}
								title="Back"
								data-sveltekit-preload-data="off"
								class="nav-link">Back</a
							>

							<h2>Simulation: {simulation.value.name}</h2>
						</div>

						<menu class="header-menu">
							<ol class="menu-bar">
								<li class="menu-bar-item" tabindex="-1">
									File
									<ul class="menu-bar-menu">
										<li class="menu-bar-menu-item submenu">
											<button type="button" class="menu-bar-item-button submenu-trigger">
												<span>Recently opened</span>
												<span class="submenu-arrow">&gt;</span>
											</button>
											<ul class="menu-bar-menu submenu-menu">
												{#each recentSimulations.value as recent}
													<li class="menu-bar-menu-item">
														<a class="menu-bar-item-button" href={recent.href}>{recent.name}</a>
													</li>
												{:else}
													<li class="menu-bar-menu-item">
														<MenuBarButton disabled>No recent simulations</MenuBarButton>
													</li>
												{/each}
												<li class="menu-bar-menu-item"><hr class="menu-bar-menu-ruler" /></li>
												<li class="menu-bar-menu-item">
													<MenuBarButton
														disabled={recentSimulations.value.length === 0}
														onclick={(evt) => {
															evt.preventDefault();
															clearRecentSimulations();
														}}>Clear list</MenuBarButton
													>
												</li>
											</ul>
										</li>
										<li class="menu-bar-menu-item">
											<MenuBarButton
												onclick={(evt) => {
													evt.preventDefault();
													openSimulationNavigator();
												}}>Open Navigator</MenuBarButton
											>
										</li>
										<li class="menu-bar-menu-item">
											<button
												class="menu-bar-item-button"
												onclick={() => {
													data.commands.duplicate();
												}}>Duplicate</button
											>
										</li>
										<li class="menu-bar-menu-item submenu" tabindex="-1">
											<button class="menu-bar-item-button submenu-button" type="button">
												Import
												<span class="submenu-arrow">&gt;</span>
											</button>
											<ul class="menu-bar-menu">
												<li class="menu-bar-menu-item">
													<MenuBarButton
														onclick={(evt) => {
															evt.preventDefault();
															importSimulationDrawing();
														}}>Drawing...</MenuBarButton
													>
												</li>
												<li class="menu-bar-menu-item">
													<MenuBarButton
														onclick={(evt) => {
															evt.preventDefault();
															void openSimulationUrl();
														}}>URL...</MenuBarButton
													>
												</li>
											</ul>
										</li>
										<li class="menu-bar-menu-item">
											<button
												class="menu-bar-item-button"
												onclick={() => {
													data.commands.downloadSNS();
												}}>Download SNS</button
											>
										</li>
										<li class="menu-bar-menu-item">
											<MenuBarButton onclick={printSimulationDrawing}>Print Drawing</MenuBarButton>
										</li>
										<li class="menu-bar-menu-item"><hr class="menu-bar-menu-ruler" /></li>
										<li class="menu-bar-menu-item">
											<MenuBarButton
												onclick={(evt) => {
													evt.preventDefault();
													closeAllSimulations();
												}}>Close All Simulations</MenuBarButton
											>
										</li>
										<li class="menu-bar-menu-item">
											<MenuBarButton
												onclick={(evt) => {
													evt.preventDefault();
													exitSimulationObserver();
												}}>Exit</MenuBarButton
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
												<input type="checkbox" bind:checked={showInstances.value} />
												Show Instances</label
											>
										</li>
										<li class="menu-bar-menu-item">
											<label>
												<input type="checkbox" bind:checked={showLog.value} />
												Show Log</label
											>
										</li>
										<li class="menu-bar-menu-item">
											<label>
												<input type="checkbox" bind:checked={showDebug.value} />
												Show Debug</label
											>
										</li>
										<li class="menu-bar-menu-item">
											<label>
												<input type="checkbox" bind:checked={showSequentialOnlyArcs.value} />
												Show sequential-only arcs</label
											>
										</li>
										<li class="menu-bar-menu-item"><hr class="menu-bar-menu-ruler" /></li>
										<li class="menu-bar-menu-item">
											<MenuBarButton
												disabled={simulationAnnotations.value.length === 0}
												onclick={(evt) => {
													evt.preventDefault();
													clearSimulationAnnotations();
												}}>Clear Drawing Annotations</MenuBarButton
											>
										</li>
									</ul>
								</li>
								<li class="menu-bar-item" tabindex="-1">
									Simulation

									<ul class="menu-bar-menu">
										<li class="menu-bar-menu-item">
											<a
												class="menu-bar-item-button"
												href={backendUrl(`/simulations/${simulation.value.id}`)}
												target="_blank">Configure Simulation...</a
											>
										</li>
										<li class="menu-bar-menu-item"><hr class="menu-bar-menu-ruler" /></li>
										<li class="menu-bar-menu-item">
											<MenuBarButton
												shortcut={{ ctrlKey: true, key: 'i' }}
												disabled={!online || simulation.value.running}
												onclick={(evt) => {
													evt.preventDefault();
													cast('init');
												}}>Initialize</MenuBarButton
											>
										</li>
										<li class="menu-bar-menu-item">
											<MenuBarButton
												shortcut={{ ctrlKey: true, key: 'i' }}
												disabled={!online || !simulation.value.running}
												onclick={(evt) => {
													evt.preventDefault();
													cast('step');
												}}>Step</MenuBarButton
											>
										</li>
										<li class="menu-bar-menu-item">
											<MenuBarButton
												shortcut={{ ctrlKey: true, shiftKey: true, key: 'i' }}
												disabled={!online ||
													!simulation.value.running ||
													!current_instance.value?.label}
												onclick={(evt) => {
													evt.preventDefault();
													void performNetStep(cast, current_instance.value);
												}}>Net Step</MenuBarButton
											>
										</li>
										<li class="menu-bar-menu-item">
											<MenuBarButton
												shortcut={{ ctrlKey: true, key: 'p' }}
												disabled={!online ||
													!simulation.value.running ||
													simulation.value.is_playing === true}
												onclick={(evt) => {
													evt.preventDefault();
													cast('play');
												}}>Play</MenuBarButton
											>
										</li>
										<li class="menu-bar-menu-item">
											<MenuBarButton
												disabled={!online ||
													!simulation.value.running ||
													simulation.value.is_playing !== true}
												shortcut={{ ctrlKey: true, key: 'p' }}
												onclick={(evt) => {
													evt.preventDefault();
													cast('pause');
												}}>Pause</MenuBarButton
											>
										</li>
										<li class="menu-bar-menu-item">
											<MenuBarButton
												disabled={!online || !simulation.value.running}
												shortcut={{ ctrlKey: true, key: 'x' }}
												onclick={(evt) => {
													evt.preventDefault();
													cast('terminate');
												}}>Terminate</MenuBarButton
											>
										</li>
										<li class="menu-bar-menu-item"><hr class="menu-bar-menu-ruler" /></li>
										<li class="menu-bar-menu-item">
											<MenuBarButton
												onclick={(evt) => {
													evt.preventDefault();
													showSimulationConfig.value = true;
												}}>Configure Simulation...</MenuBarButton
											>
										</li>
										<li class="menu-bar-menu-item"><hr class="menu-bar-menu-ruler" /></li>
										<li class="menu-bar-menu-item">
											<MenuBarButton
												onclick={(evt) => {
													evt.preventDefault();
													saveSimulationState(simulation.value);
												}}>Save simulation state</MenuBarButton
											>
										</li>
										<li class="menu-bar-menu-item">
											<MenuBarButton
												onclick={(evt) => {
													evt.preventDefault();
													loadSimulationState(simulation);
												}}>Load simulation state...</MenuBarButton
											>
										</li>
										<li class="menu-bar-menu-item">
											<label>
												<input type="checkbox" bind:checked={showLog.value} />
												Show simulation trace</label
											>
										</li>
										<li class="menu-bar-menu-item">
											<MenuBarButton
												onclick={(evt) => {
													evt.preventDefault();
													openSimulationConsole();
												}}>Console...</MenuBarButton
											>
										</li>
										<li class="menu-bar-menu-item submenu" tabindex="-1">
											<button class="menu-bar-item-button submenu-button" type="button">
												Formalisms
												<span class="submenu-arrow">&gt;</span>
											</button>
											<ul class="menu-bar-menu">
												{#await data.formalisms}
													<li class="menu-bar-menu-item">
														<MenuBarButton disabled>Loading...</MenuBarButton>
													</li>
												{:then formalisms}
													{#each formalisms as formalism (formalism.id)}
														<li class="menu-bar-menu-item">
															<MenuBarButton
																onclick={(evt) => {
																	evt.preventDefault();
																	explainSimulationFormalism(formalism);
																}}>{formalism.label}</MenuBarButton
															>
														</li>
													{:else}
														<li class="menu-bar-menu-item">
															<MenuBarButton disabled>No formalisms available</MenuBarButton>
														</li>
													{/each}
												{:catch}
													<li class="menu-bar-menu-item">
														<MenuBarButton disabled>Error loading formalisms</MenuBarButton>
													</li>
												{/await}
											</ul>
										</li>
										<li class="menu-bar-menu-item">
											<a
												class="menu-bar-item-button"
												href={simulationMenuHref('simulator_health', '/health/simulator')}
												target="_blank">Remote Server...</a
											>
										</li>
										<li class="menu-bar-menu-item"><hr class="menu-bar-menu-ruler" /></li>
										<li class="menu-bar-menu-item submenu" tabindex="-1">
											<button class="menu-bar-item-button submenu-button" type="button">
												Breakpoints
												<span class="submenu-arrow">&gt;</span>
											</button>
											<ul class="menu-bar-menu">
												<li class="menu-bar-menu-item">
													<MenuBarButton
														disabled={!online ||
															!simulation.value.running ||
															!selectedTransitionId.value}
														onclick={(evt) => {
															evt.preventDefault();
															void setBreakpointAtSelection(dispatch);
														}}>Set BP at selection</MenuBarButton
													>
												</li>
												<li class="menu-bar-menu-item">
													<MenuBarButton
														disabled={!online ||
															!simulation.value.running ||
															!selectedTransitionId.value}
														onclick={(evt) => {
															evt.preventDefault();
															void clearBreakpointAtSelection(dispatch);
														}}>Clear BP at selection</MenuBarButton
													>
												</li>
												<li class="menu-bar-menu-item">
													<MenuBarButton
														disabled={!online ||
															!simulation.value.running ||
															activeBreakpoints.length === 0}
														onclick={(evt) => {
															evt.preventDefault();
															void clearAllBreakpoints(dispatch);
														}}>Clear all BPs in current simulation</MenuBarButton
													>
												</li>
												<li class="menu-bar-menu-item"><hr class="menu-bar-menu-ruler" /></li>
												{#each activeBreakpoints as breakpoint (breakpoint.transition_id)}
													<li class="menu-bar-menu-item">
														<MenuBarButton
															onclick={(evt) => {
																evt.preventDefault();
																selectBreakpointTransition(breakpoint);
															}}>{breakpointLabel(breakpoint)}</MenuBarButton
														>
													</li>
													<li class="menu-bar-menu-item">
														<MenuBarButton
															onclick={(evt) => {
																evt.preventDefault();
																void clearBreakpoint(dispatch, breakpoint);
															}}>Clear {breakpointLabel(breakpoint)}</MenuBarButton
														>
													</li>
												{:else}
													<li class="menu-bar-menu-item">
														<button class="menu-bar-item-button" type="button" disabled
															>No Breakpoints</button
														>
													</li>
												{/each}
											</ul>
										</li>
									</ul>
								</li>
								<li class="menu-bar-item" tabindex="-1">
									Plugins
									<ul class="menu-bar-menu">
										<li class="menu-bar-menu-item">
											<a
												class="menu-bar-item-button"
												href={simulationMenuHref('primitives', '/primitives')}
												target="_blank"
											>
												Primitives
											</a>
										</li>
										<li class="menu-bar-menu-item">
											<a
												class="menu-bar-item-button"
												href={simulationMenuHref('icons', '/icons')}
												target="_blank">Icons</a
											>
										</li>
										<li class="menu-bar-menu-item">
											<a
												class="menu-bar-item-button"
												href={simulationMenuHref('socket_schemas', '/socket_schemas')}
												target="_blank">Socket Schemas</a
											>
										</li>
										<li class="menu-bar-menu-item">
											<a
												class="menu-bar-item-button"
												href={simulationMenuHref('syntax', '/syntax')}
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
													call((c) => {
														c && c.resetCamera();
													}, cameraScroller);
												}}>Navigator</MenuBarButton
											>
										</li>
										<li class="menu-bar-menu-item">
											<a
												class="menu-bar-item-button"
												href={backendUrl(`/simulations/${simulation.value.id}`)}
												target="_blank">Inspect Simulation</a
											>
										</li>
										<li class="menu-bar-menu-item">
											{#await data.shadow_net_system then sns}
												<MenuBarButton
													onclick={(evt) => {
														evt.preventDefault();
														openEditableSimulationDrawing(sns, current_net_id.value);
													}}>Open Drawing Copy</MenuBarButton
												>
											{:catch}
												<MenuBarButton disabled>Open Drawing Copy</MenuBarButton>
											{/await}
										</li>
										<li class="menu-bar-menu-item">
											<MenuBarButton
												onclick={(evt) => {
													evt.preventDefault();
													openSimulationConsole();
												}}>Command Console...</MenuBarButton
											>
										</li>
										<li class="menu-bar-menu-item">
											<MenuBarButton
												onclick={(evt) => {
													evt.preventDefault();
													discardAllLiveErrors();
												}}>Clear Messages</MenuBarButton
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
												href={simulationMenuHref('health', '/health')}
												target="_blank"
											>
												Health
											</a>
										</li>
										<li class="menu-bar-menu-item">
											<a
												class="menu-bar-item-button"
												href={simulationMenuHref('system', '/system')}
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
										<li class="menu-bar-menu-item">Open Simulations</li>
										{#each simulationTabs(simulation.value) as tab (tab.id)}
											<li class="menu-bar-menu-item simulation-window-menu-entry">
												<a
													class={{
														'menu-bar-item-button': true,
														active: tab.id === data.simulation.id
													}}
													href={tab.href}
													data-sveltekit-preload-data="off"
													title={tab.name}
												>
													<span>{tab.id === data.simulation.id ? '* ' : ''}{tab.name}</span>
												</a>
												<button
													type="button"
													class="menu-bar-item-icon-button"
													title="Close simulation"
													aria-label="Close simulation"
													onclick={(evt) => {
														evt.preventDefault();
														evt.stopPropagation();
														closeSimulationWindow(tab, simulation.value);
													}}>x</button
												>
											</li>
										{/each}
										<li class="menu-bar-menu-item"><hr class="menu-bar-menu-ruler" /></li>
										<li class="menu-bar-menu-item">
											<label>
												<input type="checkbox" bind:checked={showMinimap.value} />
												Minimap</label
											>
										</li>
										<li class="menu-bar-menu-item">
											<label>
												<input type="checkbox" bind:checked={showInstances.value} />
												Net Instances</label
											>
										</li>
										<li class="menu-bar-menu-item">
											<label>
												<input type="checkbox" bind:checked={showLog.value} />
												Log</label
											>
										</li>
										<li class="menu-bar-menu-item">
											<label>
												<input type="checkbox" bind:checked={showDebug.value} />
												Debug</label
											>
										</li>
										<li class="menu-bar-menu-item"><hr class="menu-bar-menu-ruler" /></li>
										<li class="menu-bar-menu-item">
											<MenuBarButton
												onclick={(evt) => {
													evt.preventDefault();
													showMinimap.value = true;
													showInstances.value = true;
													showLog.value = true;
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
												href="https://tgipm.informatik.uni-hamburg.de/confluence/x/BwAdJQ"
												target="_blank">Confluence</a
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

						<nav class="simulation-tabs" aria-label="Open simulations">
							{#each simulationTabs(simulation.value) as tab (tab.id)}
								<a
									class={{ 'simulation-tab': true, active: tab.id === data.simulation.id }}
									href={tab.href}
									data-sveltekit-preload-data="off"
									title={tab.name}
								>
									<span class="simulation-tab-label">{tab.name}</span>
									{#if tab.id !== data.simulation.id}
										<button
											type="button"
											class="simulation-tab-close"
											aria-label="Remove from tabs"
											onclick={(evt) => {
												evt.preventDefault();
												evt.stopPropagation();
												removeRecentSimulation(tab.id);
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
										<circle
											fill={p.data.color}
											cx="16"
											cy="16"
											r="16"
											stroke="#fff"
											stroke-width="2"
										/>
										<text x="16" y="22" text-anchor="middle" font-size="20" fill="#fff"
											>{p.data.username.substr(0, 1)}</text
										>
									</svg>
								</li>
							{/each}
						</ul>
					</header>
					{#if liveErrors.value.length}
						<section class="simulation-errors" aria-label="Simulation messages" aria-live="polite">
							<div class="simulation-errors-header">
								<strong>Simulation messages</strong>
								<button
									class="simulation-error-button"
									type="button"
									onclick={discardAllLiveErrors}
								>
									Dismiss all
								</button>
							</div>
							<ol class="simulation-error-list">
								{#each groupLiveErrors(liveErrors.value) as item (item.signature)}
									<li class="simulation-error" role="alert">
										<div class="simulation-error-body">
											<div class="simulation-error-title">
												<strong>{item.error.title}</strong>
												{#if item.count > 1}
													<span class="simulation-error-count">{item.count}x</span>
												{/if}
											</div>
											<span>{item.error.message}</span>
											{#if item.error.detail}
												<p class="simulation-error-detail">{item.error.detail}</p>
											{/if}
										</div>
										<div class="simulation-error-actions">
											<button
												class="simulation-error-button"
												type="button"
												onclick={() => copyLiveError(item.error)}
											>
												Copy
											</button>
											<button
												class="simulation-error-button"
												type="button"
												onclick={() => discardLiveError(item.signature)}
											>
												Dismiss
											</button>
										</div>
									</li>
								{/each}
							</ol>
						</section>
					{/if}
					{#if markingDialog.value}
						{@const currentMarkingTokens = placeTokens(
							current_instance.value,
							markingDialog.value.place_id
						)}
						<section class="marking-dialog-layer" role="presentation">
							<div
								class="marking-dialog"
								role="dialog"
								aria-modal="false"
								aria-label={markingDialog.value.title}
								style={markingDialogStyle(markingDialogPosition.value)}
							>
								<div class="marking-dialog-header" onpointerdown={startMarkingDialogDrag}>
									<span>{markingDialog.value.title}</span>
									<button class="binding-dialog-button" type="button" onclick={closeMarkingDialog}>
										Close
									</button>
								</div>
								<div class="marking-dialog-content">
									{#if currentMarkingTokens.length}
										<ol class="marking-token-list">
											{#each currentMarkingTokens as token, index (token.id ?? index)}
												<li>
													<code>{token.value}</code>
												</li>
											{/each}
										</ol>
									{:else}
										<p class="binding-dialog-status">No tokens in this place.</p>
									{/if}
								</div>
							</div>
						</section>
					{/if}
					{#if bindingSelection.value}
						<section class="binding-dialog-backdrop" role="presentation">
							<div
								class="binding-dialog"
								role="dialog"
								aria-modal="true"
								aria-label={bindingSelectionTitle(bindingSelection.value)}
								style={bindingDialogStyle(bindingDialogPosition.value)}
							>
								<div class="binding-dialog-header" onpointerdown={startBindingDialogDrag}>
									<span>{bindingSelectionTitle(bindingSelection.value)}</span>
								</div>

								<div class="binding-dialog-content">
									<select
										class="binding-list"
										size="10"
										disabled={bindingSelection.value.loading}
										bind:value={bindingSelection.value.selected_index}
										ondblclick={() =>
											void fireSelectedBinding(
												bindingSelectionDispatch(
													dispatch,
													bindingSelection.value,
													simulation.value
												),
												bindingSelection.value.selected_index
											)}
									>
										{#each bindingSelection.value.bindings as binding, bindingIndex}
											<option value={bindingIndex}>{shortBindingText(binding)}</option>
										{/each}
									</select>

									<textarea
										class="binding-detail"
										readonly
										value={selectedBindingText(bindingSelection.value)}
									></textarea>
								</div>

								{#if bindingSelection.value.loading}
									<p class="binding-dialog-status">Loading bindings...</p>
								{:else if bindingSelection.value.error}
									<p class="binding-dialog-error">{bindingSelection.value.error}</p>
								{:else if !bindingSelection.value.bindings.length}
									<p class="binding-dialog-status">No enabled binding found.</p>
								{/if}

								<div class="binding-dialog-actions">
									<button
										class="binding-dialog-button"
										type="button"
										disabled={!bindingSelection.value.bindings.length ||
											bindingSelection.value.loading}
										onclick={() =>
											void fireSelectedBinding(
												bindingSelectionDispatch(
													dispatch,
													bindingSelection.value,
													simulation.value
												),
												bindingSelection.value.selected_index
											)}
									>
										Fire
									</button>
									<button
										class="binding-dialog-button"
										type="button"
										disabled={bindingSelection.value.loading}
										onclick={() =>
											void updateBindingSelection(
												bindingSelectionDispatch(dispatch, bindingSelection.value, simulation.value)
											)}
									>
										Update
									</button>
									<button
										class="binding-dialog-button"
										type="button"
										onclick={closeBindingSelection}
									>
										Close
									</button>
								</div>
							</div>
						</section>
					{/if}
					<div class="overlay">
						<div
							role="toolbar"
							tabindex="-1"
							class={{
								topbar: true,
								'simulation-controls': true,
								'drop-target': simulationDraggingFiles
							}}
							ondragenter={onSimulationDragEnter}
							ondragover={onSimulationDragOver}
							ondragleave={onSimulationDragLeave}
							ondrop={onSimulationDrop}
						>
							<div class="toolbar">
								{#each simulationTools as tool}
									<button
										class={{ 'tool-button': true, active: activeSimulationTool.value === tool.id }}
										title={tool.name}
										data-tooltip={tool.name}
										type="button"
										onclick={(evt) => {
											evt.preventDefault();
											activeSimulationTool.value = tool.id;
										}}>{tool.name}</button
									>
								{/each}
								<span class="toolbar-separator"></span>
								{#if simulation.value.running}
									<button
										class="tool-button"
										title="Terminate the current simulation"
										data-tooltip="Terminate"
										disabled={!online}
										type="button"
										onclick={(evt) => {
											evt.preventDefault();

											cast('terminate');
										}}>terminate</button
									>

									{#await data.shadow_net_system then sns}
										<button
											class="tool-button"
											title="Open the current net drawing as an editable document copy"
											data-tooltip="Open Drawing Copy"
											type="button"
											onclick={(evt) => {
												evt.preventDefault();
												openEditableSimulationDrawing(sns, current_net_id.value);
											}}>Drawing Copy</button
										>
									{:catch}
										<button class="tool-button" type="button" disabled>Drawing Copy</button>
									{/await}

									{#if simulation.value.timestep > 0}
										<button
											class="tool-button"
											title="Execute one simulation step"
											data-tooltip="Step"
											disabled={!online || simulation.value.is_playing}
											type="button"
											onclick={(evt) => {
												evt.preventDefault();

												cast('step');
											}}>Step</button
										>

										<button
											class="tool-button"
											title="Execute one step in the selected net instance"
											data-tooltip="Net Step"
											disabled={!online ||
												simulation.value.is_playing ||
												!current_instance.value?.label}
											type="button"
											onclick={(evt) => {
												evt.preventDefault();

												void performNetStep(cast, current_instance.value);
											}}>Net Step</button
										>

										<button
											class="tool-button"
											title="Run the simulation continuously"
											data-tooltip="Play"
											disabled={!online || simulation.value.is_playing !== false}
											type="button"
											onclick={(evt) => {
												evt.preventDefault();

												cast('play');
											}}>play</button
										>

										<button
											class="tool-button"
											title="Pause the running simulation"
											data-tooltip="Pause"
											disabled={!online || simulation.value.is_playing !== true}
											type="button"
											onclick={(evt) => {
												evt.preventDefault();

												cast('pause');
											}}>pause</button
										>
									{:else}
										Starting...
									{/if}
								{:else}
									<button
										class="tool-button"
										title="Initialize the simulation"
										data-tooltip="Initialize"
										disabled={!online}
										type="button"
										onclick={(evt) => {
											evt.preventDefault();

											cast('init');
										}}>Initialize</button
									>
								{/if}
							</div>
						</div>
						{#await data.shadow_net_system then sns}
							{@const doc = view(
								(id) => R.find((n) => n.id === id, sns.nets)?.document,
								current_net_id
							)}

							{@const layersInOrder = view(L.reread(walkDocument), doc)}
							{@const extension = view(
								[
									'viewbox',
									L.pick({
										minX: 'x',
										minY: 'y',
										maxX: L.reread(({ x, width }) => x + width),
										maxY: L.reread(({ y, height }) => y + height)
									}),
									L.valueOr({
										minX: 0,
										minY: 0,
										maxX: 0,
										maxY: 0
									})
								],
								doc
							)}
							{@const selectedLayer = selectedSimulationLayer(doc.value)}
							{@const selectedAnnotation = selectedSimulationAnnotation()}
							{@const selectedAttributes = selectedAnnotation
								? simulationAnnotationAttributeItems(selectedAnnotation)
								: simulationAttributeItems(selectedLayer)}
							<div
								role="toolbar"
								tabindex="-1"
								class={{
									topbar: true,
									'simulation-attributes': true,
									'drop-target': simulationDraggingFiles
								}}
								ondragenter={onSimulationDragEnter}
								ondragover={onSimulationDragOver}
								ondragleave={onSimulationDragLeave}
								ondrop={onSimulationDrop}
							>
								<div class="toolbar simulation-attribute-toolbar">
									<span class="simulation-attribute-label">Attributes</span>
									<span>{simulationSelectionKind(doc.value) || 'Selection'}:</span>
									<strong>{simulationSelectionLabel(doc.value)}</strong>
									<span>{current_instance.value?.label ?? 'No instance'}</span>
									{#if selectedAttributes.length}
										<span class="simulation-attribute-separator"></span>
										{#each selectedAttributes as attribute}
											<span
												class="simulation-attribute-chip"
												title={`${attribute.label}: ${attribute.value}`}
											>
												{#if attribute.color}
													<span
														class="simulation-attribute-swatch"
														style:background-color={attribute.color}
													></span>
												{/if}
												<span>{attribute.label}: {attribute.value}</span>
											</span>
										{/each}
									{/if}
									{#if selectedAnnotation}
										<span class="simulation-attribute-separator"></span>
										{#if selectedAnnotation.type !== 'text' && selectedAnnotation.type !== 'line'}
											<label class="simulation-attribute-control">
												Fill
												<input
													type="color"
													value={annotationFillColor(selectedAnnotation)}
													onchange={(evt) =>
														updateSelectedSimulationAnnotationStyle({
															fill_color: evt.currentTarget.value
														})}
												/>
											</label>
											<label class="simulation-attribute-control">
												Fill opacity
												<input
													type="range"
													min="0"
													max="1"
													step="0.05"
													value={annotationFillOpacity(selectedAnnotation)}
													oninput={(evt) =>
														updateSelectedSimulationAnnotationStyle({
															fill_opacity: Number(evt.currentTarget.value)
														})}
												/>
											</label>
										{/if}
										{#if selectedAnnotation.type === 'text'}
											<label class="simulation-attribute-control">
												Text
												<input
													type="color"
													value={annotationTextColor(selectedAnnotation)}
													onchange={(evt) =>
														updateSelectedSimulationAnnotationStyle({
															text_color: evt.currentTarget.value
														})}
												/>
											</label>
											<label class="simulation-attribute-control">
												Opacity
												<input
													type="range"
													min="0"
													max="1"
													step="0.05"
													value={annotationTextOpacity(selectedAnnotation)}
													oninput={(evt) =>
														updateSelectedSimulationAnnotationStyle({
															text_opacity: Number(evt.currentTarget.value)
														})}
												/>
											</label>
											<label class="simulation-attribute-control">
												Font
												<select
													value={annotationFontFamily(selectedAnnotation)}
													onchange={(evt) =>
														updateSelectedSimulationAnnotationStyle({
															font_family: evt.currentTarget.value
														})}
												>
													{#each simulationAnnotationFonts as font}
														<option value={font.value}>{font.label}</option>
													{/each}
												</select>
											</label>
											<label class="simulation-attribute-control">
												Size
												<input
													type="number"
													min="6"
													max="72"
													step="1"
													value={annotationFontSize(selectedAnnotation)}
													onchange={(evt) =>
														updateSelectedSimulationAnnotationStyle({
															font_size: Math.max(6, Number(evt.currentTarget.value) || 14)
														})}
												/>
											</label>
											<button
												class="tool-button"
												type="button"
												class:active={annotationStyle(selectedAnnotation).font_weight === 'bold'}
												onclick={(evt) => {
													evt.preventDefault();
													updateSelectedSimulationAnnotationStyle({
														font_weight:
															annotationStyle(selectedAnnotation).font_weight === 'bold'
																? 'normal'
																: 'bold'
													});
												}}>B</button
											>
											<button
												class="tool-button"
												type="button"
												class:active={annotationStyle(selectedAnnotation).font_style === 'italic'}
												onclick={(evt) => {
													evt.preventDefault();
													updateSelectedSimulationAnnotationStyle({
														font_style:
															annotationStyle(selectedAnnotation).font_style === 'italic'
																? 'normal'
																: 'italic'
													});
												}}>I</button
											>
										{:else}
											<label class="simulation-attribute-control">
												Pen
												<input
													type="color"
													value={annotationStrokeColor(selectedAnnotation)}
													onchange={(evt) =>
														updateSelectedSimulationAnnotationStyle({
															stroke_color: evt.currentTarget.value
														})}
												/>
											</label>
											<label class="simulation-attribute-control">
												Pen opacity
												<input
													type="range"
													min="0"
													max="1"
													step="0.05"
													value={annotationStrokeOpacity(selectedAnnotation)}
													oninput={(evt) =>
														updateSelectedSimulationAnnotationStyle({
															stroke_opacity: Number(evt.currentTarget.value)
														})}
												/>
											</label>
											<label class="simulation-attribute-control">
												Width
												<input
													type="number"
													min="1"
													max="20"
													step="1"
													value={annotationStrokeWidth(selectedAnnotation)}
													onchange={(evt) =>
														updateSelectedSimulationAnnotationStyle({
															stroke_width: Math.max(1, Number(evt.currentTarget.value) || 1)
														})}
												/>
											</label>
											<label class="simulation-attribute-control">
												Line
												<select
													value={annotationStrokeDashArray(selectedAnnotation)}
													onchange={(evt) =>
														updateSelectedSimulationAnnotationStyle({
															stroke_dash_array: evt.currentTarget.value
														})}
												>
													{#each simulationAnnotationLineStyles as lineStyle}
														<option value={lineStyle.value}>{lineStyle.label}</option>
													{/each}
												</select>
											</label>
										{/if}
									{/if}
									{#if selectedTransitionId.value}
										<button
											class="tool-button"
											title="Show possible transition bindings"
											data-tooltip="Bindings"
											type="button"
											disabled={!simulation.value.running || !current_instance.value?.label}
											onclick={(evt) => {
												evt.preventDefault();

												void openBindingSelection(
													bindingSelectionDispatch(
														dispatch,
														bindingSelection.value,
														simulation.value
													),
													simulation.value,
													current_instance.value,
													selectedLayer
												);
											}}>Bindings</button
										>
									{:else if selectedPlaceId.value}
										{@const selectedLayer = selectedSimulationLayer(doc.value)}
										<button
											class="tool-button"
											title="Show the current marking for this place"
											data-tooltip="Marking"
											type="button"
											disabled={!current_instance.value?.label}
											onclick={(evt) =>
												openMarkingDialog(
													evt,
													selectedLayer,
													placeTokens(current_instance.value, selectedPlaceId.value)
												)}>Marking</button
										>
									{/if}
								</div>
							</div>
							<div
								role="main"
								class={{
									body: true,
									'drop-target': simulationDraggingFiles
								}}
								ondragenter={onSimulationDragEnter}
								ondragover={onSimulationDragOver}
								ondragleave={onSimulationDragLeave}
								ondrop={onSimulationDrop}
							>
								{#if doc.value}
									<CameraScroller bind:this={cameraScroller.value} {camera} {extension}>
										<SVGViewport {camera}>
											<Navigator {camera} {lockRotation} {frameBoxPath}>
												{#snippet children(liveLenses, navigationActions)}
													<rect
														transform={rotationTransform.value}
														fill={netInstanceBackgroundColor(current_instance.value)}
														stroke="#eee"
														stroke-width="5"
														{...doc.value.viewbox}
														onclick={clearSimulationSelection}
													/>
													{#key current_net_id.value + (camera.value.plane.x !== 0) + (camera.value.plane.y !== 0)}
														<MountTrigger
															onMount={() => {
																call((c) => {
																	c && c.resetCamera();
																}, cameraScroller);
															}}
														/>
													{/key}

													{#if activeSimulationTool.value === 'magnifier'}
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

													{#if activeSimulationTool.value === 'paner'}
														<Paner
															{frameBoxPath}
															clientToCanvas={liveLenses.clientToCanvas}
															onPan={navigationActions.panMove}
														/>
													{/if}

													{#if activeSimulationTool.value === 'zoomer'}
														<Zoomer
															{frameBoxPath}
															clientToCanvas={liveLenses.clientToCanvas}
															onZoom={navigationActions.zoomDelta}
															{rotationTransform}
															{cameraScale}
														/>
													{/if}

													<g
														role="presentation"
														transform={rotationTransform.value}
														ondragenter={onSimulationDragEnter}
														ondragover={onSimulationDragOver}
														ondragleave={onSimulationDragLeave}
														ondrop={(evt) => onSimulationDrop(evt, liveLenses)}
													>
														<g id="full-document-{current_net_id}">
															{#each layersInOrder.value as { index, id, depth, hidden } (id)}
																{@const el = view(
																	['layers', 'items', L.find((el) => el.id == id)],
																	doc
																)}
																{#if layerVisibleInSimulationDrawing(el.value, hidden)}
																	{#if el.value?.box}
																		{@const expanded = view(
																			[id, L.defaults(false)],
																			expandedPlaces
																		)}
																		<g
																			role="button"
																			tabindex="-1"
																			fill={el.value?.style?.background_color ?? '#70DB93'}
																			stroke={el.value?.style?.border_color ?? 'black'}
																			stroke-dasharray={el.value?.style?.border_dash_array ??
																				'none'}
																			stroke-width={el.value?.style?.border_width ?? '1'}
																			opacity={el.value?.style?.opacity ?? '1'}
																			cursor="default"
																			onclick={(evt) => {
																				evt.preventDefault();
																				evt.stopPropagation();
																				selectSimulationLayer(el.value);
																			}}
																			ondblclick={(evt) => {
																				if (!isTransitionLayer(el.value)) {
																					openMarkingDialog(
																						evt,
																						el.value,
																						placeTokens(current_instance.value, el.value.id)
																					);
																					return;
																				}

																				evt.preventDefault();
																				evt.stopPropagation();
																				void openBindingSelection(
																					netInstanceDispatch(dispatch, current_instance.value),
																					simulation.value,
																					current_instance.value,
																					el.value
																				);
																			}}
																			oncontextmenu={(evt) => {
																				if (!isTransitionLayer(el.value)) {
																					openMarkingDialog(
																						evt,
																						el.value,
																						placeTokens(current_instance.value, el.value.id)
																					);
																					return;
																				}

																				evt.preventDefault();
																				evt.stopPropagation();
																				void fireTransition(
																					netInstanceDispatch(dispatch, current_instance.value),
																					simulation.value,
																					current_instance.value,
																					el.value
																				);
																			}}
																			onkeydown={(evt) => {
																				if (evt.key === 'Enter') {
																					evt.preventDefault();
																					selectSimulationLayer(el.value);
																					return;
																				}
																				if (evt.key === 'Space') {
																					evt.preventDefault();
																					update((x) => !x, expanded);
																				}
																			}}
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
																			{#if !isTransitionLayer(el.value) && placeTokens(current_instance.value, el.value.id).length}
																				<rect
																					x={el.value?.box.position_x}
																					y={el.value?.box.position_y}
																					width={el.value?.box.width}
																					height={el.value?.box.height}
																					fill={markedPlaceOverlayColor}
																					fill-opacity="0.38"
																					stroke="none"
																					pointer-events="none"
																				/>
																			{/if}
																			{#if selectedTransitionId.value === el.value.id}
																				<rect
																					x={el.value?.box.position_x - 4 * cameraScale.value}
																					y={el.value?.box.position_y - 4 * cameraScale.value}
																					width={el.value?.box.width + 8 * cameraScale.value}
																					height={el.value?.box.height + 8 * cameraScale.value}
																					fill="none"
																					stroke="#6aa5ff"
																					stroke-width={2 * cameraScale.value}
																					pointer-events="none"
																				/>
																			{/if}
																			{#if selectedPlaceId.value === el.value.id}
																				<rect
																					x={el.value?.box.position_x - 4 * cameraScale.value}
																					y={el.value?.box.position_y - 4 * cameraScale.value}
																					width={el.value?.box.width + 8 * cameraScale.value}
																					height={el.value?.box.height + 8 * cameraScale.value}
																					fill="none"
																					stroke="#6aa5ff"
																					stroke-width={2 * cameraScale.value}
																					pointer-events="none"
																				/>
																			{/if}
																			{#if hasTransitionBreakpoint(el.value, activeBreakpoints)}
																				<circle
																					cx={el.value?.box.position_x + el.value?.box.width}
																					cy={el.value?.box.position_y}
																					r={5 * cameraScale.value}
																					fill="#d93b31"
																					stroke="#fff"
																					stroke-width={1.5 * cameraScale.value}
																					pointer-events="none"
																				/>
																			{/if}
																		</g>
																	{/if}
																	{#if el.value?.text}
																		{@const isInitialMark = readCombined(
																			L.choose(({ doc, el }) => [
																				'el',
																				'hyperlink',
																				L.reread((hl) =>
																					R.find(R.propEq(hl, 'id'), doc.layers.items)
																				),
																				L.reread(isPlaceLikeLayer)
																			]),
																			{ doc, el }
																		)}
																		{#if !isInitialMark.value}
																			{@const thisbbox = view(L.prop(el.value?.id), textBounds)}
																			{@const simulationText = simulationTextLayer(
																				el.value,
																				doc.value
																			)}
																			{#key el.id}
																				<g
																					role="button"
																					tabindex="-1"
																					cursor="default"
																					onclick={(evt) => {
																						evt.preventDefault();
																						evt.stopPropagation();
																						selectSimulationLayer(el.value);
																					}}
																					onkeydown={(evt) => {
																						if (evt.key === 'Enter' || evt.key === 'Space') {
																							evt.preventDefault();
																							selectSimulationLayer(el.value);
																						}
																					}}
																				>
																					<TextElement bbox={thisbbox} el={simulationText} />
																					{#if selectedLayerId.value === el.value.id && thisbbox.value}
																						<rect
																							x={thisbbox.value.x - 3 * cameraScale.value}
																							y={thisbbox.value.y - 3 * cameraScale.value}
																							width={thisbbox.value.width + 6 * cameraScale.value}
																							height={thisbbox.value.height + 6 * cameraScale.value}
																							fill="none"
																							stroke="#6aa5ff"
																							stroke-width={2 * cameraScale.value}
																							pointer-events="none"
																						/>
																					{/if}
																				</g>
																			{/key}
																		{/if}
																	{/if}
																	{#if el.value?.edge}
																		<g
																			role="button"
																			tabindex="-1"
																			cursor="default"
																			opacity={el.value?.style?.opacity ?? '1'}
																			stroke={el.value?.edge?.style?.stroke_color ?? 'black'}
																			stroke-width={el.value?.edge?.style?.stroke_width ?? '1'}
																			stroke-linejoin={el.value?.edge?.style?.stroke_join ??
																				'miter'}
																			stroke-linecap={el.value?.edge?.style?.stroke_cap ?? 'butt'}
																			onclick={(evt) => {
																				evt.preventDefault();
																				evt.stopPropagation();
																				selectSimulationLayer(el.value);
																			}}
																			onkeydown={(evt) => {
																				if (evt.key === 'Enter' || evt.key === 'Space') {
																					evt.preventDefault();
																					selectSimulationLayer(el.value);
																				}
																			}}
																		>
																			<path
																				d={edgePath[el.value?.edge?.style?.smoothness ?? 'linear'](
																					el.value?.edge,
																					L.get('waypoints', el.value?.edge)
																				)}
																				pointer-events="stroke"
																				stroke="none"
																				fill={el.value?.edge?.cyclic
																					? (el.value?.style?.background_color ?? 'none')
																					: 'none'}
																				stroke-width={(el.value?.edge?.style?.stroke_width ?? 1) *
																					1 +
																					10 * cameraScale.value}
																			/>
																			<path
																				d={edgePath[el.value?.edge?.style?.smoothness ?? 'linear'](
																					el.value?.edge,
																					L.get('waypoints', el.value?.edge)
																				)}
																				stroke-dasharray={el.value?.edge?.style
																					?.stroke_dash_array ?? 'none'}
																				fill="none"
																			/>
																			{#if selectedLayerId.value === el.value.id}
																				<path
																					d={edgePath[
																						el.value?.edge?.style?.smoothness ?? 'linear'
																					](el.value?.edge, L.get('waypoints', el.value?.edge))}
																					fill="none"
																					stroke="#6aa5ff"
																					stroke-width={Math.max(
																						2 * cameraScale.value,
																						(el.value?.edge?.style?.stroke_width ?? 1) * 2
																					)}
																					stroke-dasharray="4 4"
																					pointer-events="none"
																				/>
																			{/if}

																			{#if el.value?.edge?.style?.source_tip_symbol_shape_id}
																				{@const source_angle = edgeAngle['source'](
																					el.value?.edge,
																					L.get('waypoints', el.value?.edge)
																				)}
																				{@const size = el.value?.edge?.style?.stroke_width ?? 1}

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
																					transform="rotate({source_angle} {el.value?.edge
																						.source_x} {el.value?.edge.source_y})"
																				>
																					<Symbol
																						symbols={data.symbols}
																						symbolId={el.value?.edge?.style
																							?.source_tip_symbol_shape_id}
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
																					L.get('waypoints', el.value?.edge)
																				)}
																				{@const size = el.value?.edge?.style?.stroke_width ?? 1}
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
																					transform="rotate({target_angle} {el.value?.edge
																						.target_x} {el.value?.edge.target_y})"
																				>
																					<Symbol
																						symbols={data.symbols}
																						symbolId={el.value?.edge?.style
																							?.target_tip_symbol_shape_id}
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

													<g transform={rotationTransform.value} class="simulation-annotations">
														{#each simulationAnnotations.value as annotation (annotation.id)}
															{#if annotation.type === 'rect'}
																<rect
																	class:selected={selectedAnnotationId.value === annotation.id}
																	class="simulation-annotation"
																	x={annotation.x}
																	y={annotation.y}
																	width={annotation.width}
																	height={annotation.height}
																	fill={annotationFillColor(annotation)}
																	fill-opacity={annotationFillOpacity(annotation)}
																	stroke={annotationStrokeColor(annotation)}
																	stroke-opacity={annotationStrokeOpacity(annotation)}
																	stroke-width={annotationStrokeWidth(annotation)}
																	stroke-dasharray={annotationStrokeDashArray(annotation)}
																	role="button"
																	tabindex="-1"
																	onpointerdown={(evt) =>
																		beginMoveSimulationAnnotation(evt, annotation, liveLenses)}
																	onpointermove={(evt) =>
																		updateMoveSimulationAnnotation(evt, liveLenses)}
																	onpointerup={finishMoveSimulationAnnotation}
																	onpointercancel={cancelSimulationAnnotation}
																	onlostpointercapture={cancelSimulationAnnotation}
																/>
															{:else if annotation.type === 'ellipse'}
																<ellipse
																	class:selected={selectedAnnotationId.value === annotation.id}
																	class="simulation-annotation"
																	cx={annotation.x + annotation.width / 2}
																	cy={annotation.y + annotation.height / 2}
																	rx={annotation.width / 2}
																	ry={annotation.height / 2}
																	fill={annotationFillColor(annotation)}
																	fill-opacity={annotationFillOpacity(annotation)}
																	stroke={annotationStrokeColor(annotation)}
																	stroke-opacity={annotationStrokeOpacity(annotation)}
																	stroke-width={annotationStrokeWidth(annotation)}
																	stroke-dasharray={annotationStrokeDashArray(annotation)}
																	role="button"
																	tabindex="-1"
																	onpointerdown={(evt) =>
																		beginMoveSimulationAnnotation(evt, annotation, liveLenses)}
																	onpointermove={(evt) =>
																		updateMoveSimulationAnnotation(evt, liveLenses)}
																	onpointerup={finishMoveSimulationAnnotation}
																	onpointercancel={cancelSimulationAnnotation}
																	onlostpointercapture={cancelSimulationAnnotation}
																/>
															{:else if annotation.type === 'text'}
																<text
																	class:selected={selectedAnnotationId.value === annotation.id}
																	class="simulation-annotation-text"
																	x={annotation.x}
																	y={annotation.y}
																	fill={annotationTextColor(annotation)}
																	fill-opacity={annotationTextOpacity(annotation)}
																	font-family={annotationFontFamily(annotation)}
																	font-size={annotationFontSize(annotation)}
																	font-weight={annotationStyle(annotation).font_weight ?? 'normal'}
																	font-style={annotationStyle(annotation).font_style ?? 'normal'}
																	role="button"
																	tabindex="-1"
																	onpointerdown={(evt) =>
																		beginMoveSimulationAnnotation(evt, annotation, liveLenses)}
																	onpointermove={(evt) =>
																		updateMoveSimulationAnnotation(evt, liveLenses)}
																	onpointerup={finishMoveSimulationAnnotation}
																	onpointercancel={cancelSimulationAnnotation}
																	onlostpointercapture={cancelSimulationAnnotation}
																	ondblclick={(evt) => {
																		evt.preventDefault();
																		evt.stopPropagation();
																		editSimulationTextAnnotation(annotation);
																	}}>{annotation.text}</text
																>
															{:else if annotation.type === 'line'}
																<g
																	class:selected={selectedAnnotationId.value === annotation.id}
																	class="simulation-annotation-line"
																	role="button"
																	tabindex="-1"
																	onpointerdown={(evt) =>
																		beginMoveSimulationAnnotation(evt, annotation, liveLenses)}
																	onpointermove={(evt) =>
																		updateMoveSimulationAnnotation(evt, liveLenses)}
																	onpointerup={finishMoveSimulationAnnotation}
																	onpointercancel={cancelSimulationAnnotation}
																	onlostpointercapture={cancelSimulationAnnotation}
																>
																	<line
																		class="simulation-annotation-line-hit"
																		x1={annotation.x1}
																		y1={annotation.y1}
																		x2={annotation.x2}
																		y2={annotation.y2}
																	/>
																	<line
																		class="simulation-annotation-line-path"
																		x1={annotation.x1}
																		y1={annotation.y1}
																		x2={annotation.x2}
																		y2={annotation.y2}
																		stroke={annotationStrokeColor(annotation)}
																		stroke-opacity={annotationStrokeOpacity(annotation)}
																		stroke-width={annotationStrokeWidth(annotation)}
																		stroke-dasharray={annotationStrokeDashArray(annotation)}
																	/>
																</g>
															{:else if annotation.type === 'image'}
																<g
																	class:selected={selectedAnnotationId.value === annotation.id}
																	class="simulation-annotation-image"
																	role="button"
																	tabindex="-1"
																	onpointerdown={(evt) =>
																		beginMoveSimulationAnnotation(evt, annotation, liveLenses)}
																	onpointermove={(evt) =>
																		updateMoveSimulationAnnotation(evt, liveLenses)}
																	onpointerup={finishMoveSimulationAnnotation}
																	onpointercancel={cancelSimulationAnnotation}
																	onlostpointercapture={cancelSimulationAnnotation}
																>
																	<rect
																		x={annotation.x}
																		y={annotation.y}
																		width={annotation.width}
																		height={annotation.height}
																		fill="transparent"
																	/>
																	<image
																		href={annotation.src}
																		x={annotation.x}
																		y={annotation.y}
																		width={annotation.width}
																		height={annotation.height}
																		preserveAspectRatio="xMidYMid meet"
																	/>
																	{#if selectedAnnotationId.value === annotation.id}
																		<rect
																			class="simulation-annotation-image-outline"
																			x={annotation.x}
																			y={annotation.y}
																			width={annotation.width}
																			height={annotation.height}
																		/>
																	{/if}
																</g>
															{/if}
														{/each}
													</g>

													{#if isSimulationAnnotationTool()}
														<path
															class="simulation-annotation-surface"
															d={frameBoxPath.value}
															pointer-events="all"
															stroke="none"
															fill="transparent"
															role="button"
															tabindex="-1"
															onpointerdown={(evt) => beginSimulationAnnotation(evt, liveLenses)}
															onpointermove={(evt) => updateSimulationAnnotation(evt, liveLenses)}
															onpointerup={finishSimulationAnnotation}
															onpointercancel={cancelSimulationAnnotation}
															onlostpointercapture={cancelSimulationAnnotation}
															oncontextmenu={(evt) => {
																evt.preventDefault();
																cancelSimulationAnnotation();
																activeSimulationTool.value = 'select';
															}}
														/>
													{/if}

													{#if (isSimulationShapeAnnotationTool() || annotationDraft.value?.toolId === 'annotation-line') && annotationDraft.value}
														{@const draftBox = annotationBox(
															annotationDraft.value.start,
															annotationDraft.value.current
														)}
														<g transform={rotationTransform.value} pointer-events="none">
															{#if annotationDraft.value.toolId === 'annotation-line'}
																<line
																	class="simulation-annotation-line-path draft"
																	x1={annotationDraft.value.start.x}
																	y1={annotationDraft.value.start.y}
																	x2={annotationDraft.value.current.x}
																	y2={annotationDraft.value.current.y}
																/>
															{:else if annotationDraft.value.toolId === 'annotation-ellipse'}
																<ellipse
																	class="simulation-annotation draft"
																	cx={draftBox.x + draftBox.width / 2}
																	cy={draftBox.y + draftBox.height / 2}
																	rx={draftBox.width / 2}
																	ry={draftBox.height / 2}
																/>
															{:else}
																<rect
																	class="simulation-annotation draft"
																	x={draftBox.x}
																	y={draftBox.y}
																	width={draftBox.width}
																	height={draftBox.height}
																/>
															{/if}
														</g>
													{/if}

													<g transform={rotationTransform.value}>
														<LiveResource
															socket={data.live_socket}
															resource={current_instance.value}
															errors={liveErrors}
														>
															{#snippet children(instance, _presence, actions)}
																{@html rememberNetInstanceActions(instance.value, actions)}
																{@html autoRefreshBindingSelection(
																	actions.dispatch,
																	simulation.value,
																	instance.value
																)}
																{@const places = view(
																	[
																		'tokens',
																		L.reread(R.groupBy(R.prop('place_id'))),
																		L.valueOr({}),
																		L.partsOf(L.entries)
																	],
																	instance
																)}
																{@const firings = read('firings', instance)}
																{#each firings.value as fir (fir.id)}
																	{@const pos = view(
																		[
																			'layers',
																			'items',
																			L.find((el) => el.id == fir.transition_id),
																			[
																				'box',
																				L.pick({
																					x: 'position_x',
																					y: 'position_y',
																					width: 'width',
																					height: 'height'
																				})
																			]
																		],
																		doc
																	)}
																	<rect
																		{...pos.value}
																		fill="white"
																		fill-opacity="0.7"
																		stroke-width="8"
																		class="transition-shine transition-fade-out"
																		rx="5"
																		ry="5"
																	></rect>
																{/each}

																{#each places.value as [place_id, tokens] (place_id)}
																	{@const pos = view(
																		[
																			'layers',
																			'items',
																			L.find((el) => el.id == place_id),
																			[
																				'box',
																				L.reread(({ position_x, position_y, width, height }) => ({
																					x: position_x + width / 2,
																					y: position_y + height / 2
																				}))
																			]
																		],
																		doc
																	)}
																	{@const expanded = view(
																		[place_id, L.defaults(false)],
																		expandedPlaces
																	)}
																	{@const tokenRows = groupedTokenRows(tokens)}
																	{@const tokenLayout = tokenDisplayLayout(
																		tokenRows,
																		!expanded.value,
																		tokens.length
																	)}
																	<g
																		transform="translate({pos.value.x},{pos.value.y})"
																		class={{ 'place-tokens': true, tokenCount: !expanded.value }}
																		role="button"
																		tabindex="-1"
																		onclick={(evt) => {
																			evt.preventDefault();
																			evt.stopPropagation();
																			update((x) => !x, expanded);
																		}}
																		ondblclick={(evt) => {
																			evt.preventDefault();
																			evt.stopPropagation();
																			selectSimulationLayer(layerById(doc.value, place_id));
																		}}
																		oncontextmenu={(evt) => {
																			evt.preventDefault();
																			update((x) => !x, expanded);
																		}}
																		onkeydown={(evt) => {
																			if (evt.key === 'Enter' || evt.key === 'Space') {
																				evt.preventDefault();
																				update((x) => !x, expanded);
																			}
																		}}
																	>
																		<rect
																			x={-tokenLayout.width / 2}
																			y={-tokenLayout.height / 2}
																			width={tokenLayout.width}
																			height={tokenLayout.height}
																			fill="white"
																			fill-opacity="0.92"
																			stroke="none"
																			rx="1"
																			ry="1"
																		/>

																		{#if expanded.value}
																			{#each tokenRows as tokenRow, ti (tokenRow.value)}
																				{@const label = tokenRowLabel(tokenRow)}
																				{@const y = tokenRowY(
																					ti,
																					tokenRows.length,
																					tokenLayout.lineHeight
																				)}
																				{@const rowWidth = tokenTextWidth(
																					label,
																					tokenLayout.fontSize
																				)}
																				{#if tokenRow.netReference}
																					<rect
																						x={-rowWidth / 2}
																						y={y - tokenLayout.fontSize * 0.72}
																						width={rowWidth}
																						height={tokenLayout.fontSize + 4}
																						fill="none"
																						stroke="#2868d8"
																						stroke-width="1"
																						pointer-events="none"
																					/>
																				{/if}
																				<text
																					role="link"
																					tabindex="-1"
																					{y}
																					text-anchor="middle"
																					font-size={tokenLayout.fontSize}
																					fill={tokenRow.netReference ? '#0b55c4' : 'black'}
																					text-decoration={tokenRow.netReference
																						? 'underline'
																						: 'none'}
																					onclick={(evt) => {
																						if (!tokenRow.netReference) {
																							return;
																						}

																						evt.preventDefault();
																						evt.stopPropagation();
																						currentInstance.value = L.get(
																							[
																								'net_instances',
																								L.find(R.propEq(tokenRow.value, 'label')),
																								'id'
																							],
																							simulation.value
																						);
																					}}
																					onkeydown={(evt) => {
																						if (
																							!tokenRow.netReference ||
																							(evt.key !== 'Enter' && evt.key !== 'Space')
																						) {
																							return;
																						}

																						evt.preventDefault();
																						evt.stopPropagation();
																						currentInstance.value = L.get(
																							[
																								'net_instances',
																								L.find(R.propEq(tokenRow.value, 'label')),
																								'id'
																							],
																							simulation.value
																						);
																					}}>{label}</text
																				>
																			{/each}
																		{:else}
																			<text
																				text-anchor="middle"
																				font-size={tokenLayout.fontSize}
																				font-weight="bold"
																				fill="black"
																			>
																				{tokens.length || 0}
																			</text>
																		{/if}
																	</g>

																	{#if expanded.value}
																		{#await data.shadow_net_system.then((sns) => {
																			return new Map(sns.nets.map((s) => [s.name, s.thumbnail]));
																		}) then thumb}
																			{#each tokens as token, ti (token.id)}
																				{@const match = R.match(/^(\w+)\[\d+\]$/, token.value)}
																				{@const thumbnail = thumb.get(match[1])}
																				{#if thumbnail}
																					<svg
																						{...pos.value}
																						width="30"
																						overflow="visible"
																						height="30"
																						transform="translate({-70 + (ti % 4) * 35},{-70 +
																							(ti >> 2) * 35})"
																						viewBox="{thumbnail.viewbox.x} {thumbnail.viewbox
																							.y} {thumbnail.viewbox.width} {thumbnail.viewbox
																							.height}"
																						cursor="pointer"
																						onclick={(evt) => {
																							evt.preventDefault();

																							currentInstance.value = L.get(
																								[
																									'net_instances',
																									L.find(R.propEq(token.value, 'label')),
																									'id'
																								],
																								simulation.value
																							);
																						}}
																					>
																						<Thumbnail
																							document={thumbnail}
																							symbols={data.symbols}
																						/>

																						<rect
																							fill="none"
																							pointer-events="all"
																							{...thumbnail.viewbox}
																						></rect>
																					</svg>
																				{/if}
																			{/each}
																		{/await}
																	{/if}
																{/each}
															{/snippet}
														</LiveResource>
													</g>
												{/snippet}
											</Navigator>
										</SVGViewport>
									</CameraScroller>
								{:else}
									<div
										style:background={netInstanceBackgroundColor(current_instance.value)}
										style="align-self: stretch; justify-self: stretch; display: grid; align-content: stretch; justify-content: stretch; font-size: 1.2em;align-items: center; justify-items: center;"
									>
										{#if simulation.value.running}
											{#if simulation.value.timestep > 0}
												{#if current_instance.value}
													<div
														style="background: #fff; padding: 1em; align-self: start; margin-top: 7em; border: 2px solid #aaa"
													>
														<em>No visual Net Data available, falling back to text output:</em>

														<LiveResource
															socket={data.live_socket}
															resource={current_instance.value}
															errors={liveErrors}
														>
															{#snippet children(instance, _presence, actions)}
																{@html rememberNetInstanceActions(instance.value, actions)}
																{@html autoRefreshBindingSelection(
																	actions.dispatch,
																	simulation.value,
																	instance.value
																)}
																{@const places = view(
																	[
																		'tokens',
																		L.reread(R.groupBy(R.prop('place_id'))),
																		L.valueOr({}),
																		L.partsOf(L.entries)
																	],
																	instance
																)}

																{@const placeCount = view('length', places)}

																{#if placeCount.value}
																	<dl
																		style="display: grid; grid-template-columns: auto 1fr; gap: 1ex 1em"
																	>
																		{#each places.value as [name, tokens]}
																			<dt style="font-weight: bold;">{name}:</dt>
																			<dd style="margin: 0; padding: 0;">
																				<ul
																					style="margin: 0; padding: 0; list-style: none; display: flex; flex-wrap: wrap; gap: 1ex"
																				>
																					{#each tokens as t}
																						{#if R.match(/^\w+\[\d+\]$/, t.value).length}
																							<li>
																								<button
																									style="cursor: pointer;text-decoration: underline;"
																									onclick={(evt) => {
																										evt.preventDefault();

																										currentInstance.value = L.get(
																											[
																												'net_instances',
																												L.find(R.propEq(t.value, 'label')),
																												'id'
																											],
																											simulation.value
																										);
																									}}>{t.value}</button
																								>;
																							</li>
																						{:else}
																							<li>{t.value};</li>
																						{/if}
																					{/each}
																				</ul>
																			</dd>
																		{/each}
																	</dl>
																{:else}
																	<div style="margin-top: 1em; font-weight: bold;">
																		No tokens in this Net instance
																	</div>
																{/if}
															{/snippet}
														</LiveResource>
													</div>
												{:else}
													Select a Net Instance

													<MountTrigger
														onMount={() => {
															currentInstance.value = L.get([0, 'id'], net_instances.value);
														}}
													/>
												{/if}
											{:else}
												Starting...{/if}
										{:else}
											<div style="display: flex; flex-direction: column;">
												Simulation is not running
												<button
													type="button"
													class="tool-button"
													onclick={(evt) => {
														evt.preventDefault();

														cast('init');
													}}>init</button
												>

												<div style="margin: 1em auto">
													<label>
														<input type="checkbox" bind:checked={showLog.value} />
														Show Log</label
													>
												</div>
											</div>
										{/if}
									</div>
								{/if}
							</div>
							<div class="sidebar right">
								{#if doc.value}
									<div class="minimap">
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

											<use href="#full-document-{current_net_id}" opacity="0.8" />

											<rect stroke="#0af" stroke-width="5" fill="#0af" fill-opacity="0.1" />
										</Minimap>
									</div>
								{/if}
								{#if showInstances.value}
									<div class="toolbar vertical net-instance-panel">
										<label>
											Net Instances:
											<select class="net-instances" bind:value={currentInstance.value} size="10">
												{#each nets.value as nt}
													{@const this_instances = view(
														L.filter(R.pathEq(nt.id, ['links', 'shadow_net', 'id'])),
														net_instances
													)}
													<optgroup label={nt.name}>
														{#each this_instances.value as ni}
															<option value={ni.id}>{ni.label}</option>
														{/each}
													</optgroup>
												{/each}
											</select>
										</label>
									</div>
								{/if}
								{#if showDebug.value}
									<div class="toolbar vertical">
										<details>
											<summary>Debug Simulation </summary>
											<textarea>{JSON.stringify(simulation.value, null, '  ')}</textarea>
										</details>

										<details>
											<summary>Debug SNS </summary>

											{#await data.shadow_net_system then sns}
												{@const currentDoc = view(
													(id) => R.find((n) => n.id === id, sns.nets)?.document,
													current_net_id
												)}
												<textarea> {JSON.stringify(currentDoc.value, null, '  ')}</textarea>
											{/await}
										</details>
									</div>
								{/if}
								{#if showLog.value}
									<div class="toolbar vertical log">
										<form
											class="simulation-console-command"
											onsubmit={(evt) => submitConsoleCommand(dispatch, evt)}
										>
											<label>
												<span>Renew &gt;</span>
												<input
													type="text"
													spellcheck="false"
													autocomplete="off"
													bind:this={consoleCommandInput}
													bind:value={consoleCommandText.value}
												/>
											</label>
											<button type="submit">Send</button>
										</form>
										{#if consoleResponses.value.length}
											<ol class="simulation-console-responses">
												{#each consoleResponses.value as response (response.id)}
													<li>
														<div class="simulation-console-request">
															Renew &gt; {response.command}
														</div>
														<pre>{response.output || '<no output>'}</pre>
													</li>
												{/each}
											</ol>
										{/if}
										{#await data.log_entries}
											Loading log...
										{:then entries}
											<LiveResource socket={data.live_socket} resource={entries}>
												{#snippet children(log)}
													<ol
														style="list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 1ex;"
													>
														{#each log.value.log_entries as l}
															<li>{l.content}</li>
														{/each}
													</ol>
												{/snippet}
											</LiveResource>
										{:catch e}
											Error loading log
										{/await}
									</div>
								{/if}
							</div>
						{/await}
						<div class="sidebar left">
							<div class="toolbar vertical">
								Time: {simulation.value.timestep}
							</div>
						</div>
					</div>
					<footer class="statusbar" aria-live="polite">
						<span>{simulation.value.running ? 'running' : 'not running'}</span>
						<span>Time: {simulation.value.timestep}</span>
						<span>
							{#if selectedLayerId.value}
								Figure selected
							{:else if selectedAnnotationId.value}
								Annotation selected
							{:else}
								Nothing Selected
							{/if}
						</span>
						<span>{currentInstance.value ? 'Instance selected' : 'No instance'}</span>
						<span>{data.connectionState.value === false ? 'offline' : 'online'}</span>
						{#if queuedActions.value > 0}
							<span
								>{queuedActions.value} queued offline action{queuedActions.value === 1
									? ''
									: 's'}</span
							>
						{/if}
					</footer>
				{/snippet}
			</LiveResource>
		{/snippet}
	</LiveResource>
</div>

<style>
	.tokenCount {
		font-weight: bold;
		font-size: 2em;
	}

	.place-tokens {
		dominant-baseline: middle;
	}

	.simulation-annotation-surface {
		cursor: crosshair;
		outline: none;
	}

	.simulation-annotation {
		fill: #70db93;
		fill-opacity: 0.45;
		stroke: black;
		stroke-width: 1px;
		vector-effect: non-scaling-stroke;
		cursor: default;
		outline: none;
	}

	.simulation-annotation.draft {
		fill-opacity: 0.25;
		stroke-dasharray: 4 4;
	}

	.simulation-annotation.selected {
		stroke: #6aa5ff;
		stroke-width: 2px;
	}

	.simulation-annotation-text {
		fill: black;
		font-size: 14px;
		font-family: sans-serif;
		cursor: default;
		outline: none;
		user-select: none;
	}

	.simulation-annotation-text.selected {
		fill: #1f64d8;
		text-decoration: underline;
	}

	.simulation-annotation-line {
		cursor: default;
		outline: none;
	}

	.simulation-annotation-line-hit {
		stroke: transparent;
		stroke-width: 12px;
		vector-effect: non-scaling-stroke;
	}

	.simulation-annotation-line-path {
		stroke: black;
		stroke-width: 1px;
		fill: none;
		vector-effect: non-scaling-stroke;
	}

	.simulation-annotation-line-path.draft {
		stroke-dasharray: 4 4;
	}

	.simulation-annotation-line.selected .simulation-annotation-line-path {
		stroke: #1f64d8;
		stroke-width: 2px;
	}

	.simulation-annotation-image {
		cursor: default;
		outline: none;
	}

	.simulation-annotation-image-outline {
		fill: none;
		stroke: #1f64d8;
		stroke-dasharray: 4 3;
		stroke-width: 2px;
		vector-effect: non-scaling-stroke;
		pointer-events: none;
	}

	textarea {
		width: 100%;
	}
	.toolbar.vertical.log {
		background: #111;
		color: #fff;
		max-height: 20em;
		overflow: auto;
	}

	.toolbar.vertical.log * {
		user-select: text !important;
		-webkit-user-select: text !important;
	}

	.simulation-console-command {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 0.5rem;
		align-items: center;
		margin-bottom: 0.75rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid #555;
	}

	.simulation-console-command label {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.5rem;
		align-items: center;
		margin: 0;
	}

	.simulation-console-command input {
		min-width: 12rem;
		background: #000;
		color: #fff;
		border: 1px solid #777;
		font: inherit;
		padding: 0.25rem 0.4rem;
	}

	.simulation-console-command button {
		background: #333;
		color: #fff;
		border: 1px solid #777;
		font: inherit;
		padding: 0.25rem 0.6rem;
	}

	.simulation-console-responses {
		list-style: none;
		margin: 0 0 0.75rem;
		padding: 0 0 0.75rem;
		border-bottom: 1px solid #444;
		display: grid;
		gap: 0.5rem;
	}

	.simulation-console-responses li {
		margin: 0;
		padding: 0.45rem 0.6rem;
		background: #000;
		border: 1px solid #333;
	}

	.simulation-console-request {
		color: #d6d6d6;
		margin-bottom: 0.25rem;
	}

	.simulation-console-responses pre {
		margin: 0;
		white-space: pre-wrap;
		color: #fff;
		font: inherit;
	}

	.full-page {
		position: absolute;
		inset: 0;
		display: grid;
		place-content: stretch;
		place-items: stretch;
		z-index: 0;
		grid-template-rows: auto auto;
		grid-auto-rows: 1fr;
		overflow: hidden;
	}

	.binding-dialog-backdrop {
		position: fixed;
		inset: 0;
		z-index: 30000;
		display: grid;
		place-items: center;
		background: #0001;
		padding: 2rem;
		pointer-events: none;
	}

	.marking-dialog-layer {
		position: fixed;
		inset: 0;
		z-index: 29990;
		pointer-events: none;
	}

	.marking-dialog {
		position: fixed;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		min-width: min(28rem, calc(100vw - 4rem));
		max-width: min(34rem, calc(100vw - 4rem));
		max-height: min(55vh, 22rem);
		overflow: hidden;
		background: #eeeeee;
		color: #111111;
		border: 1px solid #888888;
		border-radius: 6px;
		box-shadow: 0 0.75rem 2rem #0004;
		font-family: Arial, sans-serif;
		font-size: 0.9rem;
		pointer-events: auto;
		user-select: text;
		-webkit-user-select: text;
	}

	.marking-dialog-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.25rem 0.45rem;
		background: linear-gradient(#f8f8f8, #dedede);
		border-bottom: 1px solid #999999;
		cursor: move;
		font-size: 0.86rem;
		white-space: nowrap;
		user-select: none;
		-webkit-user-select: none;
	}

	.marking-dialog-content {
		max-height: calc(min(55vh, 22rem) - 2.5rem);
		overflow: auto;
		padding: 0.75rem;
		background: #ffffff;
	}

	.marking-token-list {
		margin: 0;
		padding-left: 2rem;
	}

	.marking-token-list li {
		margin: 0.2rem 0;
	}

	.binding-dialog {
		position: fixed;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		display: grid;
		grid-template-rows: auto minmax(7rem, 1fr) auto auto;
		gap: 0;
		width: min(34rem, calc(100vw - 4rem));
		min-height: 11rem;
		max-height: min(70vh, 26rem);
		overflow: hidden;
		background: #eeeeee;
		color: #111111;
		border: 1px solid #888888;
		border-radius: 6px;
		box-shadow: 0 0.75rem 2rem #0004;
		font-family: Arial, sans-serif;
		font-size: 0.9rem;
		user-select: text;
		-webkit-user-select: text;
		pointer-events: auto;
	}

	.binding-dialog * {
		user-select: text;
		-webkit-user-select: text;
	}

	.binding-dialog-header {
		padding: 0.25rem 0.45rem;
		background: linear-gradient(#f8f8f8, #dedede);
		border-bottom: 1px solid #999999;
		cursor: move;
		font-size: 0.86rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		user-select: none;
		-webkit-user-select: none;
	}

	.binding-dialog-header * {
		user-select: none;
		-webkit-user-select: none;
	}

	.binding-dialog p {
		margin: 0;
		padding: 0.35rem 0.5rem 0;
		line-height: 1.35;
	}

	.binding-dialog-error {
		color: #8a1b0c;
		white-space: pre-wrap;
	}

	.binding-dialog-status {
		color: #333333;
	}

	.binding-dialog-content {
		display: grid;
		grid-template-columns: minmax(10rem, 1fr) 0.65rem minmax(10rem, 1fr);
		min-height: 7rem;
		background: #eeeeee;
	}

	.binding-dialog-content::before {
		content: '';
		grid-column: 2;
		grid-row: 1;
		border-left: 1px solid #888888;
		border-right: 1px solid #ffffff;
		background: repeating-linear-gradient(
			to bottom,
			#9aa7b3 0,
			#9aa7b3 2px,
			transparent 2px,
			transparent 5px
		);
	}

	.binding-list,
	.binding-detail {
		min-width: 0;
		height: 100%;
		margin: 0;
		border: 1px solid #999999;
		border-top: 0;
		border-radius: 0;
		background: #ffffff;
		color: #111111;
		font-family: 'Courier New', monospace;
		font-size: 0.84rem;
		line-height: 1.25;
	}

	.binding-list {
		grid-column: 1;
		padding: 0;
	}

	.binding-detail {
		grid-column: 3;
		box-sizing: border-box;
		resize: none;
		padding: 0.2rem;
		white-space: pre;
		overflow: auto;
	}

	.binding-dialog-actions {
		display: flex;
		justify-content: center;
		gap: 0.35rem;
		padding: 0.45rem;
		border-top: 1px solid #c4c4c4;
		background: #eeeeee;
	}

	.binding-dialog-button {
		min-width: 4.7rem;
		padding: 0.2rem 0.7rem;
		border: 1px solid #7d99b5;
		background: linear-gradient(#ffffff, #d7eafa);
		color: #111111;
		cursor: pointer;
		font: inherit;
	}

	.binding-dialog-button:disabled {
		border-color: #aaaaaa;
		background: #dddddd;
		color: #777777;
		cursor: default;
	}

	.binding-dialog-button:not(:disabled):hover,
	.binding-dialog-button:not(:disabled):focus-visible {
		background: linear-gradient(#ffffff, #c2ddf4);
	}

	.binding-button {
		width: 100%;
		padding: 0.55rem 0.7rem;
		background: #f7f7f7;
		border: 1px solid #bbb;
		color: #111;
		cursor: pointer;
		font: inherit;
		text-align: left;
		overflow-wrap: anywhere;
	}

	.binding-button:hover,
	.binding-button:focus-visible {
		background: #e8f2ff;
		border-color: #5797d6;
	}

	.simulation-errors {
		position: fixed;
		left: 50%;
		bottom: 1.25rem;
		transform: translateX(-50%);
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		gap: 0.5rem;
		width: min(42rem, calc(100vw - 2rem));
		max-height: min(45vh, 24rem);
		z-index: 20000;
		pointer-events: auto;
		overflow: hidden;
		background: #fff8f5;
		border: 1px solid #d3482f;
		border-left: 0.4rem solid #d3482f;
		box-shadow: 0 8px 24px #0003;
		scrollbar-width: thin;
		user-select: text !important;
		-webkit-user-select: text !important;
	}

	.simulation-errors-header {
		display: flex;
		gap: 0.75rem;
		align-items: center;
		justify-content: space-between;
		padding: 0.65rem 0.75rem 0;
		color: #2e1009;
	}

	.simulation-error-list {
		display: grid;
		gap: 0.5rem;
		min-height: 0;
		margin: 0;
		padding: 0 0.75rem 0.75rem;
		overflow: auto;
		list-style: none;
	}

	.simulation-error {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 0.5rem;
		align-items: start;
		padding: 0.65rem 0.75rem;
		background: #ffe7df;
		border: 1px solid #efad9d;
		color: #2e1009;
		user-select: text !important;
		-webkit-user-select: text !important;
	}

	.simulation-error * {
		user-select: text !important;
		-webkit-user-select: text !important;
	}

	.simulation-errors * {
		user-select: text !important;
		-webkit-user-select: text !important;
	}

	.simulation-error-body {
		display: grid;
		gap: 0.25rem;
		min-width: 0;
	}

	.simulation-error-title {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		min-width: 0;
	}

	.simulation-error-body strong {
		overflow-wrap: anywhere;
	}

	.simulation-error-count {
		padding: 0.05rem 0.35rem;
		background: #d3482f;
		color: white;
		font-size: 0.85rem;
		line-height: 1.4;
	}

	.simulation-error-body span,
	.simulation-error-body p {
		margin: 0;
		line-height: 1.35;
		overflow-wrap: anywhere;
	}

	.simulation-error-detail {
		margin-top: 0.35rem;
		white-space: pre-wrap;
	}

	.simulation-error-actions {
		display: flex;
		gap: 0.5rem;
		justify-content: end;
	}

	.simulation-error-button {
		background: #2f2f2f;
		border: 0;
		color: white;
		padding: 0.45rem 0.6rem;
		cursor: pointer;
		font: inherit;
	}

	.simulation-error-button:hover,
	.simulation-error-button:focus-visible {
		background: #111;
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

	.menu-bar:focus-within .menu-bar-item:hover > .menu-bar-menu {
		display: flex;
	}

	.menu-bar-menu-item {
		display: flex;
		justify-items: stretch;
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

	.submenu-button {
		display: flex;
		gap: 2em;
		justify-content: space-between;
		align-items: center;
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
		padding: 1ex 4em 1ex 1ex;
	}

	.menu-bar-item-button.active {
		font-weight: bold;
	}

	.simulation-window-menu-entry {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: stretch;
		gap: 0.25em;
	}

	.menu-bar-item-icon-button {
		border: 0;
		background: transparent;
		color: inherit;
		font: inherit;
		padding: 0 0.5em;
		cursor: pointer;
	}

	.menu-bar-item-icon-button:hover {
		background: #eee;
	}

	.simulation-tabs {
		display: flex;
		overflow-x: auto;
		overflow-y: hidden;
		background: #eeeeee;
		border-bottom: 1px solid #c8c8c8;
	}

	.simulation-tab {
		display: inline-flex;
		align-items: center;
		gap: 0.35em;
		max-width: 18em;
		padding: 0.35em 0.7em;
		color: inherit;
		text-decoration: none;
		border-right: 1px solid #c8c8c8;
		background: #f8f8f8;
	}

	.simulation-tab.active {
		background: #fff;
		font-weight: bold;
	}

	.simulation-tab-label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.simulation-tab-close {
		border: 0;
		background: transparent;
		color: inherit;
		font: inherit;
		cursor: pointer;
		padding: 0 0.25em;
	}

	.simulation-tab-close:hover {
		background: #ddd;
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

	.statusbar {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 250;
		display: grid;
		grid-template-columns: auto auto auto 1fr auto auto;
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

	h2 {
		margin: 0;
		white-space: nowrap;
		max-width: 80vw;
		overflow: hidden;
		text-overflow: ellipsis;
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

	.drop-target {
		outline: 2px solid #22ee88;
		outline-offset: -2px;
	}

	.body.drop-target::after {
		content: 'Drop file to import it into this simulation project';
		position: absolute;
		inset: 1.5em;
		z-index: 500;
		display: grid;
		place-content: center;
		border: 2px dashed #23875d;
		background: #ffffffcc;
		color: #123;
		font-weight: bold;
		pointer-events: none;
	}

	.overlay {
		position: relative;
		z-index: 100;
		display: grid;
		grid-template-columns:
			[body-start] 0.5ex [top-start left-start bottom-start] auto [bottom-end left-end] 1fr[right-start] max(
				30vw
			)
			[right-end top-end] 1em [body-end];
		grid-template-rows:
			[body-start] 0.5ex [top-start simulation-controls-start] auto
			[simulation-controls-end simulation-attributes-start] auto
			[simulation-attributes-end top-end left-start right-start] 1fr [bottom-start] auto
			[bottom-end left-end right-end] 1em [body-end];
		gap: 0.5em;
		overflow: hidden;
		width: 100vw;

		contain: strict;
	}

	.topbar {
		grid-area: top;
		align-self: start;
		z-index: 1;
	}

	.simulation-controls {
		grid-column: top-start / top-end;
		grid-row: simulation-controls-start / simulation-controls-end;
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
		scrollbar-width: thin;
		user-select: none;
	}

	.configuration-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
		gap: 1rem;
		min-width: min(68rem, 80vw);
	}

	.configuration-grid section {
		display: grid;
		align-content: start;
		gap: 0.65rem;
		border: 1px solid #bbb;
		padding: 0.75rem;
		background: #fafafa;
	}

	.configuration-grid h3 {
		margin: 0 0 0.25rem;
		font-size: 1rem;
	}

	.configuration-grid label {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		align-items: center;
		gap: 0.5rem;
	}

	.configuration-grid label:has(input[type='number']) {
		grid-template-columns: minmax(0, 1fr) 6rem;
	}

	.configuration-grid input[type='number'] {
		font: inherit;
		min-width: 0;
	}

	.configuration-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.simulation-attributes {
		grid-column: top-start / top-end;
		grid-row: simulation-attributes-start / simulation-attributes-end;
		margin-top: 0.5ex;
	}

	.simulation-attribute-toolbar {
		grid-auto-rows: auto;
		padding: 0.5em 1em;
		font-size: 0.95em;
	}

	.simulation-attribute-label {
		font-weight: bold;
	}

	.simulation-attribute-separator {
		width: 1px;
		align-self: stretch;
		background: #aaa;
	}

	.simulation-attribute-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.35em;
		max-width: 16rem;
		padding: 0.25em 0.5em;
		border: 1px solid #bbb;
		background: #f8f8f8;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.simulation-attribute-swatch {
		width: 1.2em;
		height: 1.2em;
		flex: 0 0 auto;
		border: 1px solid #777;
		box-sizing: border-box;
	}

	.simulation-attribute-control {
		display: inline-flex;
		align-items: center;
		gap: 0.35em;
		white-space: nowrap;
	}

	.simulation-attribute-control input[type='range'] {
		width: 5.5rem;
	}

	.simulation-attribute-control input[type='number'] {
		width: 4.5rem;
	}

	.simulation-attribute-control select {
		max-width: 8rem;
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
	}

	@media (max-width: 500px) {
		.sidebar.right {
			grid-area: right;
			justify-self: stretch;
			height: 100%;
			display: flex;
			flex-direction: column;
			justify-content: end;
		}

		.minimap {
			justify-self: start;
			margin-bottom: auto;
			max-height: 40vmin;
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
		font-weight: normal;
	}

	select option:checked {
		background-color: #23875d;
		background-image: linear-gradient(#23875d, #23875d);
		color: #fff;
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
	.tool-button {
		position: relative;
		background: #333;
		color: #fff;
		border: none;
		padding: 1ex;
		font: inherit;
		cursor: pointer;
	}

	.tool-button:active {
		background: #000;
	}
	.tool-button.active {
		background: #111;
		box-shadow: inset 0 -3px 0 #ffffff;
	}
	.tool-button:disabled {
		cursor: default;
		background: gray;
	}

	.toolbar-separator {
		align-self: stretch;
		border-left: 1px solid #aaa;
		margin: 0 0.35rem;
	}

	.tool-button[data-tooltip]:hover::after,
	.tool-button[data-tooltip]:focus-visible::after {
		content: attr(data-tooltip);
		position: absolute;
		left: 50%;
		top: calc(100% + 0.35rem);
		z-index: 20001;
		width: max-content;
		max-width: 16rem;
		padding: 0.3rem 0.45rem;
		transform: translateX(-50%);
		background: #fff8bf;
		border: 1px solid #767676;
		box-shadow: 0 2px 5px #0002;
		color: #111;
		font-size: 0.85rem;
		line-height: 1.2;
		pointer-events: none;
		white-space: nowrap;
	}

	.transition-fade-out {
		animation-name: transition-fade-out;
		animation-duration: 0.8s;
		animation-timing-function: ease-out;
		animation-fill-mode: forwards;
		opacity: 1;
	}

	.transition-shine {
		stroke: #11ff66;
		fill: white;
		fill-opacity: 0.7;
		stroke-width: 8;
		pointer-events: none;
	}

	@keyframes transition-fade-out {
		from {
			opacity: 1;
		}

		to {
			opacity: 0;
		}
	}
	.net-instance-panel {
		width: 100%;
		box-sizing: border-box;
		justify-self: stretch;
		align-self: stretch;
	}
	.net-instances {
		height: 5em;
		width: 100%;
	}
</style>
