<script>
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

	import MenuBarButton from '$lib/components/menubar/MenuBarButton.svelte';
	import { frameBoxLens } from '$lib/components/camera/lenses';
	import Navigator from '$lib/components/camera/Navigator.svelte';
	import MountTrigger from '$lib/components/camera/MountTrigger.svelte';
	import Thumbnail from './Thumbnail.svelte';
	import { describeError } from '$lib/errors';

	const { data } = $props();

	const currentInstance = atom(null);
	const textBounds = atom({});
	const expandedPlaces = atom({});
	const liveErrors = atom([]);
	const bindingSelection = atom(null);
	const bindingDialogPosition = atom(null);
	const selectedTransitionId = atom(null);
	const breakpoints = atom([]);
	const netInstanceActions = { value: null };

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
	let breakpointRefreshSignature = null;
	let breakpointRefreshQueued = false;

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

	function symbolShapeAttributes(box) {
		return {
			...(box?.symbol_shape_attributes ?? {}),
			...(box?.shape_attributes ?? {})
		};
	}

	function isTransitionLayer(layer) {
		return layer?.semantic_tag === 'de.renew.gui.TransitionFigure';
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

	function transitionBreakpointIds(items = breakpoints.value) {
		return new Set(items.map((breakpoint) => breakpoint?.transition_id).filter(Boolean));
	}

	function hasTransitionBreakpoint(layer) {
		return transitionBreakpointIds().has(layer?.id);
	}

	function breakpointLabel(breakpoint) {
		const transitionId = breakpoint?.transition_id ?? '';
		return transitionId ? `firing starts (${transitionId.slice(0, 8)}...)` : 'firing starts';
	}

	function setBreakpointsFromResponse(response) {
		if (Array.isArray(response?.breakpoints)) {
			breakpoints.value = response.breakpoints;
		}
	}

	async function refreshBreakpoints(dispatch) {
		try {
			const response = await dispatch('list_breakpoints', {});
			setBreakpointsFromResponse(response);
		} catch (error) {
			appendLiveError(error);
		}
	}

	async function setBreakpointAtSelection(dispatch) {
		const transition_id = selectedTransitionId.value;

		if (!transition_id) {
			return;
		}

		try {
			const response = await dispatch('set_transition_breakpoint', { transition_id });
			setBreakpointsFromResponse(response);
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
			const response = await dispatch('clear_transition_breakpoint', { transition_id });
			setBreakpointsFromResponse(response);
		} catch (error) {
			appendLiveError(error);
		}
	}

	async function clearAllBreakpoints(dispatch) {
		try {
			const response = await dispatch('clear_breakpoints', {});
			setBreakpointsFromResponse(response);
		} catch (error) {
			appendLiveError(error);
		}
	}

	function queueBreakpointRefresh(dispatch, simulation) {
		const signature = `${simulation?.running}:${simulation?.timestep}:${simulation?.is_playing}`;

		if (!simulation?.running) {
			breakpoints.value = [];
			breakpointRefreshSignature = signature;
			return '';
		}

		if (signature === breakpointRefreshSignature || breakpointRefreshQueued) {
			return '';
		}

		breakpointRefreshSignature = signature;
		breakpointRefreshQueued = true;

		queueMicrotask(() => {
			breakpointRefreshQueued = false;
			void refreshBreakpoints(dispatch);
		});

		return '';
	}

	function refreshBreakpointsFromMenu(dispatch, simulation) {
		queueBreakpointRefresh(dispatch, simulation);
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

	<LiveResource socket={data.live_socket} resource={data.simulation} errors={liveErrors}>
		{#snippet children(simulation, presence, { dispatch, cast })}
			{@const nets = view(['shadow_net_system', 'content', 'nets'], simulation)}
			{@const net_instances = view('net_instances', simulation)}
			{@const current_instance = viewCombined(
				L.choices(L.choose(({ ci }) => ['net_instances', L.find(R.propEq(ci, 'id'))])),
				{ net_instances, ci: currentInstance }
			)}

			{@const current_net_id = view(['links', 'shadow_net', 'id'], current_instance)}

			{@const current_instance_href = view('href', current_instance)}

			<header class="header">
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
								<li class="menu-bar-menu-item">
									<button
										class="menu-bar-item-button"
										onclick={() => {
											data.commands.duplicate();
										}}>Duplicate</button
									>
								</li>
								<li class="menu-bar-menu-item">
									<button
										class="menu-bar-item-button"
										onclick={() => {
											data.commands.downloadSNS();
										}}>Download SNS</button
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
							</ul>
						</li>
						<li class="menu-bar-item" tabindex="-1">
							Simulation

							<ul class="menu-bar-menu">
								<li class="menu-bar-menu-item">
									<MenuBarButton
										shortcut={{ ctrlKey: true, key: 'i' }}
										disabled={simulation.value.running}
										onclick={(evt) => {
											evt.preventDefault();
											cast('init');
										}}>Initialize</MenuBarButton
									>
								</li>
								<li class="menu-bar-menu-item">
									<MenuBarButton
										shortcut={{ ctrlKey: true, key: 'i' }}
										disabled={!simulation.value.running}
										onclick={(evt) => {
											evt.preventDefault();
											cast('step');
										}}>Step</MenuBarButton
									>
								</li>
								<li class="menu-bar-menu-item">
									<MenuBarButton
										shortcut={{ ctrlKey: true, shiftKey: true, key: 'i' }}
										disabled={!simulation.value.running || !current_instance.value?.label}
										onclick={(evt) => {
											evt.preventDefault();
											void performNetStep(cast, current_instance.value);
										}}>Net Step</MenuBarButton
									>
								</li>
								<li class="menu-bar-menu-item">
									<MenuBarButton
										shortcut={{ ctrlKey: true, key: 'p' }}
										disabled={!simulation.value.running || simulation.value.is_playing === true}
										onclick={(evt) => {
											evt.preventDefault();
											cast('play');
										}}>Play</MenuBarButton
									>
								</li>
								<li class="menu-bar-menu-item">
									<MenuBarButton
										disabled={!simulation.value.running || simulation.value.is_playing !== true}
										shortcut={{ ctrlKey: true, key: 'p' }}
										onclick={(evt) => {
											evt.preventDefault();
											cast('pause');
										}}>Pause</MenuBarButton
									>
								</li>
								<li class="menu-bar-menu-item">
									<MenuBarButton
										disabled={!simulation.value.running}
										shortcut={{ ctrlKey: true, key: 'x' }}
										onclick={(evt) => {
											evt.preventDefault();
											cast('terminate');
										}}>Terminate</MenuBarButton
									>
								</li>
								<li class="menu-bar-menu-item"><hr class="menu-bar-menu-ruler" /></li>
								<li
									class="menu-bar-menu-item submenu"
									tabindex="-1"
									onpointerenter={() => refreshBreakpointsFromMenu(dispatch, simulation.value)}
									onfocusin={() => refreshBreakpointsFromMenu(dispatch, simulation.value)}
								>
									<button class="menu-bar-item-button submenu-button" type="button">
										Breakpoints
										<span class="submenu-arrow">›</span>
									</button>
									<ul class="menu-bar-menu">
										<li class="menu-bar-menu-item">
											<MenuBarButton
												disabled={!simulation.value.running || !selectedTransitionId.value}
												onclick={(evt) => {
													evt.preventDefault();
													void setBreakpointAtSelection(dispatch);
												}}>Set BP at selection</MenuBarButton
											>
										</li>
										<li class="menu-bar-menu-item">
											<MenuBarButton
												disabled={!simulation.value.running || !selectedTransitionId.value}
												onclick={(evt) => {
													evt.preventDefault();
													void clearBreakpointAtSelection(dispatch);
												}}>Clear BP at selection</MenuBarButton
											>
										</li>
										<li class="menu-bar-menu-item">
											<MenuBarButton
												disabled={!simulation.value.running || breakpoints.value.length === 0}
												onclick={(evt) => {
													evt.preventDefault();
													void clearAllBreakpoints(dispatch);
												}}>Clear all BPs in current simulation</MenuBarButton
											>
										</li>
										<li class="menu-bar-menu-item"><hr class="menu-bar-menu-ruler" /></li>
										{#each breakpoints.value as breakpoint (breakpoint.transition_id)}
											<li class="menu-bar-menu-item">
												<button class="menu-bar-item-button" type="button" disabled>
													{breakpointLabel(breakpoint)}
												</button>
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
			{#if liveErrors.value.length}
				<section class="simulation-errors" aria-label="Simulation messages" aria-live="polite">
					<div class="simulation-errors-header">
						<strong>Simulation messages</strong>
						<button class="simulation-error-button" type="button" onclick={discardAllLiveErrors}>
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
										bindingSelectionDispatch(dispatch, bindingSelection.value, simulation.value),
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
								disabled={!bindingSelection.value.bindings.length || bindingSelection.value.loading}
								onclick={() =>
									void fireSelectedBinding(
										bindingSelectionDispatch(dispatch, bindingSelection.value, simulation.value),
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
							<button class="binding-dialog-button" type="button" onclick={closeBindingSelection}>
								Close
							</button>
						</div>
					</div>
				</section>
			{/if}
			<div class="overlay">
				<div class="topbar">
					<div class="toolbar">
						{#if simulation.value.running}
							<button
								class="tool-button"
								type="button"
								onclick={(evt) => {
									evt.preventDefault();

									cast('terminate');
								}}>terminate</button
							>

							{#if simulation.value.timestep > 0}
								<button
									class="tool-button"
									disabled={simulation.value.is_playing}
									type="button"
									onclick={(evt) => {
										evt.preventDefault();

										cast('step');
									}}>Step</button
								>

								<button
									class="tool-button"
									disabled={simulation.value.is_playing || !current_instance.value?.label}
									type="button"
									onclick={(evt) => {
										evt.preventDefault();

										void performNetStep(cast, current_instance.value);
									}}>Net Step</button
								>

								<button
									class="tool-button"
									disabled={simulation.value.is_playing !== false}
									type="button"
									onclick={(evt) => {
										evt.preventDefault();

										cast('play');
									}}>play</button
								>

								<button
									class="tool-button"
									disabled={simulation.value.is_playing !== true}
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
					<div class="body">
						{#if doc.value}
							<CameraScroller bind:this={cameraScroller.value} {camera} {extension}>
								<SVGViewport {camera}>
									<Navigator {camera} {lockRotation} {frameBoxPath}>
										{#snippet children(liveLenses, navigationActions)}
											<rect
												transform={rotationTransform.value}
												fill="#fff"
												stroke="#eee"
												stroke-width="5"
												{...doc.value.viewbox}
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

											<g transform={rotationTransform.value}>
												<g id="full-document-{current_net_id}">
													{#each layersInOrder.value as { index, id, depth, hidden } (id)}
														{#if !hidden}
															{@const el = view(
																['layers', 'items', L.find((el) => el.id == id)],
																doc
															)}

															{#if el.value?.box}
																{@const expanded = view([id, L.defaults(false)], expandedPlaces)}
																<g
																	role="button"
																	tabindex="-1"
																	fill={el.value?.style?.background_color ?? '#70DB93'}
																	stroke={el.value?.style?.border_color ?? 'black'}
																	stroke-dasharray={el.value?.style?.border_dash_array ?? 'none'}
																	stroke-width={el.value?.style?.border_width ?? '1'}
																	opacity={el.value?.style?.opacity ?? '1'}
																	cursor="default"
																	onclick={(evt) => {
																		evt.preventDefault();
																		if (isTransitionLayer(el.value)) {
																			selectedTransitionId.value = el.value.id;
																		} else {
																			selectedTransitionId.value = null;
																			update((x) => !x, expanded);
																		}
																	}}
																	ondblclick={(evt) => {
																		if (!isTransitionLayer(el.value)) {
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
																	{#if hasTransitionBreakpoint(el.value)}
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
																		L.reread((hl) => R.find(R.propEq(hl, 'id'), doc.layers.items)),
																		'semantic_tag',
																		L.reread(R.equals('de.renew.gui.PlaceFigure'))
																	]),
																	{ doc, el }
																)}
																{#if !isInitialMark.value}
																	{@const thisbbox = view(L.prop(el.value?.id), textBounds)}
																	{#key el.id}
																		<g role="button" tabindex="-1">
																			<TextElement bbox={thisbbox} el={el.value} />
																		</g>
																	{/key}
																{/if}
															{/if}
															{#if el.value?.edge}
																<g
																	role="button"
																	tabindex="-1"
																	opacity={el.value?.style?.opacity ?? '1'}
																	stroke={el.value?.edge?.style?.stroke_color ?? 'black'}
																	stroke-width={el.value?.edge?.style?.stroke_width ?? '1'}
																	stroke-linejoin={el.value?.edge?.style?.stroke_join ?? 'miter'}
																	stroke-linecap={el.value?.edge?.style?.stroke_cap ?? 'butt'}
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
																		stroke-width={(el.value?.edge?.style?.stroke_width ?? 1) * 1 +
																			10 * cameraScale.value}
																	/>
																	<path
																		d={edgePath[el.value?.edge?.style?.smoothness ?? 'linear'](
																			el.value?.edge,
																			L.get('waypoints', el.value?.edge)
																		)}
																		stroke-dasharray={el.value?.edge?.style?.stroke_dash_array ??
																			'none'}
																		fill="none"
																	/>

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
															{#if expanded.value}
																<text
																	{...pos.value}
																	text-anchor="middle"
																	class={{ 'place-tokens': true, tokenCount: !expanded.value }}
																	onclick={(evt) => {
																		evt.preventDefault();
																		update((x) => !x, expanded);
																	}}
																>
																	{#each tokens as token, ti (token.id)}
																		{#if ti > 0}
																			<tspan>; </tspan>
																		{/if}

																		{#if R.match(/^\w+\[\d+\]$/, token.value).length}
																			<tspan
																				role="button"
																				cursor="pointer"
																				tabindex="-1"
																				text-decoration="underline"
																				onkeydown={(evt) => evt.currentTarget.click()}
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
																				}}>{token.value}</tspan
																			>
																		{:else}
																			<tspan>{token.value}</tspan>
																		{/if}
																	{/each}
																</text>

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
																					.y} {thumbnail.viewbox.width} {thumbnail.viewbox.height}"
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
																				<Thumbnail document={thumbnail} symbols={data.symbols} />

																				<rect
																					fill="none"
																					pointer-events="all"
																					{...thumbnail.viewbox}
																				></rect>
																			</svg>
																		{/if}
																	{/each}
																{/await}
															{:else}
																<text
																	{...pos.value}
																	text-anchor="middle"
																	class={{ 'place-tokens': true, tokenCount: !expanded.value }}
																	onclick={(evt) => {
																		evt.preventDefault();
																		update((x) => !x, expanded);
																	}}
																>
																	{tokens.length || 0}
																</text>
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
								style="background: #ddeeee; align-self: stretch; justify-self: stretch; display: grid; align-content: stretch; justify-content: stretch; font-size: 1.2em;align-items: center; justify-items: center;"
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

	.overlay {
		position: relative;
		z-index: 100;
		display: grid;
		grid-template-columns:
			[body-start] 0.5ex [top-start left-start bottom-start] auto [bottom-end left-end] 1fr[right-start] max(
				30vw
			)
			[right-end top-end] 1em [body-end];
		grid-template-rows: [body-start] 0.5ex [top-start] auto [top-end left-start right-start] 1fr [bottom-start] auto [bottom-end left-end right-end] 1em [body-end];
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
	.tool-button:disabled {
		cursor: default;
		background: gray;
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
