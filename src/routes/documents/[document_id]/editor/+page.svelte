<script>
	// @ts-nocheck

	import { base } from '$app/paths';
	import {
		view,
		atom,
		update,
		combine,
		read,
		failableView,
		viewCombined,
		call
	} from '$lib/reactivity/atom.svelte';
	import { bindValue, bindNumericValue } from '$lib/reactivity/bindings.svelte.js';
	import { numberSvgFormat } from '$lib/svg/formatter';
	import AppBar from '../../../AppBar.svelte';

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
	import { edgeAngle, edgePath } from '$lib/components/renew/edges.js';
	import { walkDocument } from '$lib/components/renew/document.js';

	import * as E from '$lib/dom/events';

	import * as L from 'partial.lenses';
	import * as R from 'ramda';
	import Minimap from '$lib/components/editor/overlays/minimap/Minimap.svelte';
	import * as Geo from '$lib/math/geometry';

	import {
		frameBoxLens,
		panMovementLens,
		rotateMovementLens,
		zoomMovementLens
	} from '$lib/components/camera/lenses';
	import Navigator from '$lib/components/camera/Navigator.svelte';
	import MountTrigger from '$lib/components/camera/MountTrigger.svelte';

	const { data } = $props();

	const logLens = (base) =>
		L.lens(
			(x) => Math.log(x) / Math.log(base),
			(y) => Math.pow(base, y)
		);

	const textBounds = atom({});
	const showMinimap = atom(true);
	const showCursors = atom(true);
	const selectedBlueprint = atom(undefined);
	const showOtherSelections = atom(true);
	const showDebug = atom(true);
	const showGrid = atom(false);
	const showRename = atom(false);
	const lockRotation = atom(false);
	const backoffValue = atom(undefined);
	const pointerOffset = atom({ x: 0, y: 0 });
	const gridDistance = atom(32);
	const gridDistanceExp = view(logLens(2), gridDistance);

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
		let timer
			return function(...args) {
				clearTimeout(timer)
				timer = setTimeout(() => {
					callback(...args);
				}, delay)
		}
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
	let groupDrag = atom(undefined);
	let groupDragDelta = view(
		[L.reread(({ bx, by, cx, cy }) => ({ x: cx - bx, y: cy - by })), L.valueOr({ x: 0, y: 0 })],
		groupDrag
	);

	function deleteThisDocument(evt) {
		evt.preventDefault();
		data.commands.deleteDocument().catch((e) => {
			update((e) => [...e, e.message], errors);
		});
	}

	let startingSimulation = $state(false);
	function simulateThisDocument(evt) {
		evt.preventDefault();
		startingSimulation = true;
		data.commands
			.simulateDocument()
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
</script>

<div class="full-page">
	<AppBar authState={data.authState} {errors} connectionState={data.connectionState} />

	<LiveResource socket={data.live_socket} resource={data.document}>
		{#snippet children(doc, presence, { dispatch, cast })}

			{@const updateText = debounce((id, value) =>
						cast('change_text_body', {
							layer_id: id,
							val: value
						}), 200)}
			{@const moveCursor = throttle((pos) => cast('cursor', pos), 20)}
			{@const layersInOrder = view(L.reread(walkDocument), doc)}
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
						<dd style="display: grid; gap: 1ex; grid-template-columns: 1fr 3fr;">
							<select name="kind" class="form-field" bind:value={predefinedKind.value}>
								<option value="">Other</option>
								{#each drawingKinds as dk}
									<option value={dk}>{dk}</option>
								{/each}
							</select>
							<input
								name="kind"
								class="form-field"
								style="width: 100%; box-sizing: border-box;"
								class:hidden={predefinedKind.value.length > 0}
								type="text"
								bind:value={transientKind.value}
							/>
						</dd>
						<dt></dt>
						<dd><button type="submit" class="form-button">Save</button></dd>
					</dl>
				</form>
			</Modal>

			<header class="header">
				<div class="header-titel">
					<a href="{base}/documents" title="Back" class="nav-link">Back</a>

					<h2>Document: {doc.value.name}</h2>
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
											alert('the document is saved automatically');
										}}>Save</button
									>
								</li>
								<li class="menu-bar-menu-item">
									<button
										class="menu-bar-item-button"
										onclick={() => {
											showRename.value = true;
										}}>Rename</button
									>
								</li>
								<li class="menu-bar-menu-item">
									<button
										class="menu-bar-item-button"
										onclick={() => {
											data.commands.duplicateDocument();
										}}>Duplicate</button
									>
								</li>
								<li class="menu-bar-menu-item">
									<button
										class="menu-bar-item-button"
										onclick={() => {
											data.commands.downloadJson();
										}}>Download JSON</button
									>
								</li>
								<li class="menu-bar-menu-item">
									<button
										class="menu-bar-item-button"
										onclick={() => {
											data.commands.downloadStruct();
										}}>Download Struct</button
									>
								</li>
								<li class="menu-bar-menu-item">
									<button
										class="menu-bar-item-button"
										onclick={() => {
											data.commands.exportRenew();
										}}>Export .rnw</button
									>
								</li>
								<li class="menu-bar-menu-item"><hr class="menu-bar-menu-ruler" /></li>
								<li class="menu-bar-menu-item">
									<button
										class="menu-bar-item-button"
										onclick={deleteThisDocument}
										style="color: #aa0000">Delete</button
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
									<button
										class="menu-bar-item-button"
										disabled={doc.value.snapshot.prev_id == doc.value.snapshot.current_id}
										onclick={(evt) => {
											evt.preventDefault();
											cast('restore_snapshot', doc.value.snapshot.prev_id);
										}}>Undo</button
									>
								</li>
								<li class="menu-bar-menu-item">
									{#if doc.value.snapshot.next_ids.length > 1}
										<hr class="menu-bar-menu-ruler" />
									{:else if doc.value.snapshot.next_ids.length > 0}
										<button
											class="menu-bar-item-button"
											disabled={doc.value.snapshot.next_ids[0] == doc.value.snapshot.current_id}
											onclick={(evt) => {
												evt.preventDefault();
												cast('restore_snapshot', doc.value.snapshot.next_ids[0]);
											}}>Redo</button
										>
									{:else}
										<button disabled class="menu-bar-item-button">Redo</button>
									{/if}
								</li>
								{#if doc.value.snapshot.next_ids.length > 1}
									{#each doc.value.snapshot.next_ids as nid, i}
										{#if nid !== doc.value.snapshot.current_id}
											<li class="menu-bar-menu-item">
												<button
													class="menu-bar-item-button"
													onclick={(evt) => {
														evt.preventDefault();
														cast('restore_snapshot', nid);
													}}>Redo ({i})</button
												>
											</li>
										{/if}
									{/each}
									<li class="menu-bar-menu-item"><hr class="menu-bar-menu-ruler" /></li>
								{/if}

								<li class="menu-bar-menu-item"><hr class="menu-bar-menu-ruler" /></li>
								<li class="menu-bar-menu-item"><div style="padding: 1ex">Reorder:</div></li>
								{#each [{ target_rel: 'before_parent', label: 'Below Parent' }, { target_rel: 'after_parent', label: 'Above Parent' }, { target_rel: 'into_prev', label: 'Indent' }, { target_rel: 'frontwards', label: 'Frontwards' }, { target_rel: 'backwards', label: 'Backwards' }, { target_rel: 'to_front', label: 'To Front' }, { target_rel: 'to_back', label: 'To Back' }] as { label, target_rel }}
									<li class="menu-bar-menu-item">
										<button
											class="menu-bar-item-button"
											disabled={!singleSelectedLayer.value}
											onclick={(evt) => {
												evt.preventDefault();

												dispatch('reorder_relative', {
													id: singleSelectedLayer.value.id,
													target_rel
												}).then(({ id }) => {
													if (id) {
														selectedLayers.value = [id];
														cast('select', id);
													}
												});
											}}>{label}</button
										>
									</li>
								{/each}

								<li class="menu-bar-menu-item"><hr class="menu-bar-menu-ruler" /></li>
								<li class="menu-bar-menu-item">
									<button
										class="menu-bar-item-button"
										disabled={!singleSelectedLayer.value}
										onclick={(evt) => {
											evt.preventDefault();

											dispatch('create_layer', {
												child_layer_id: singleSelectedLayer.value.id
											}).then(({ id }) => {
												if (id) {
													selectedLayers.value = [id];
													cast('select', id);
												}
											});
										}}>Wrap in Group</button
									>
								</li>
								<li class="menu-bar-menu-item"><hr class="menu-bar-menu-ruler" /></li>
								<li class="menu-bar-menu-item">
									<button
										disabled={!singleSelectedLayerType.value}
										onclick={(evt) => {
											evt.preventDefault();
											cast('delete_layer', selectedLayers.value[0]);
										}}
										class="menu-bar-item-button menu-bar-item-danger">Delete</button
									>
								</li>
							</ul>
						</li>
						<li class="menu-bar-item" tabindex="-1">
							Selection
							<ul class="menu-bar-menu">
								<li class="menu-bar-menu-item">
									<button
										class="menu-bar-item-button"
										disabled={!singleSelectedHyperinkedId.value}
										onclick={(evt) => {
											evt.preventDefault();
											const id = singleSelectedHyperinkedId.value;
											selectedLayers.value = [id];
											cast('select', id);
										}}>Select Linked</button
									>
								</li>
								{#each [{ label: 'Parent', rel: 'parent' }, { label: 'First Sibling', rel: 'sibling_first' }, { label: 'Last Sibling', rel: 'sibling_last' }, { label: 'Sibling Below', rel: 'sibling_prev' }, { label: 'Sibling Above', rel: 'sibling_next' }, { label: 'First Child', rel: 'child_first' }, { label: 'Last Child', rel: 'child_last' }] as { label, rel }}
									<li class="menu-bar-menu-item">
										<button
											class="menu-bar-item-button"
											disabled={!singleSelectedLayer.value}
											onclick={(evt) => {
												evt.preventDefault();

												dispatch('fetch_relative', {
													id: singleSelectedLayer.value.id,
													rel
												}).then(({ id }) => {
													if (id) {
														selectedLayers.value = [id];
														cast('select', id);
													}
												});
											}}>Select {label}</button
										>
									</li>
								{/each}
							</ul>
						</li>
						<li class="menu-bar-item" tabindex="-1">
							View

							<ul class="menu-bar-menu">
								<li class="menu-bar-menu-item">
									<button
										class="menu-bar-item-button"
										onclick={() => {
											call((c) => {
												c && c.resetCamera();
											}, cameraScroller);
										}}>Fit into Camera</button
									>
								</li>
								<li class="menu-bar-menu-item"><hr class="menu-bar-menu-ruler" /></li>
								<li class="menu-bar-menu-item">
									<button
										class="menu-bar-item-button"
										onclick={() => {
											update(R.add(0.2), cameraZoom);
										}}>Zoom in</button
									>
								</li>
								<li class="menu-bar-menu-item">
									<button
										class="menu-bar-item-button"
										onclick={() => {
											update(R.add(-0.2), cameraZoom);
										}}>Zoom out</button
									>
								</li>
								<li class="menu-bar-menu-item">
									<button
										class="menu-bar-item-button"
										onclick={() => {
											cameraZoom.value = 0;
										}}>Reset Zoom</button
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
									<button
										class="menu-bar-item-button"
										onclick={() => {
											update(R.add(90), cameraRotation);
										}}>Rotate Clockwise</button
									>
								</li>
								<li class="menu-bar-menu-item">
									<button
										class="menu-bar-item-button"
										onclick={() => {
											update(R.add(-90), cameraRotation);
										}}>Rotate Counter-Clockwise</button
									>
								</li>
								<li class="menu-bar-menu-item">
									<button
										class="menu-bar-item-button"
										onclick={() => {
											cameraRotation.value = 0;
										}}>Reset Rotation</button
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
							<ul class="menu-bar-menu" class:open={startingSimulation}>
								<li class="menu-bar-menu-item">
									<a class="menu-bar-item-button" href="{base}/simulations" target="_blank"
										>Show Simulations</a
									>
								</li>
								<li class="menu-bar-menu-item">
									<button
										disabled={startingSimulation}
										class="menu-bar-item-button"
										onclick={simulateThisDocument}
									>
										{#if startingSimulation}
											Compiling…
										{:else}
											New Simulation
										{/if}
									</button>
								</li>
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
						onDrop={(mime, content, pos) => {
							if (mime === 'application/json+renewex-layer') {
								dispatch('create_layer', {
									base_layer_id: L.get('id', singleSelectedLayer.value),
									pos,
									...content
								}).then((l) => {
									selectedLayers.value = [l.id];
									cast('select', l.id);
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
								const parser = new DOMParser();
								const svgDoc = parser.parseFromString(event.target.result, 'image/svg+xml');

								data.commands.uploadSvg(svgDoc).then((j) => {
									dispatch('create_layer', {
										base_layer_id: L.get('id', singleSelectedLayer.value),
										pos: {
											x: -svgDoc.documentElement.width.baseVal.value / 2 + pos.x,
											y: -svgDoc.documentElement.height.baseVal.value / 2 + pos.y,
											width: svgDoc.documentElement.width.baseVal.value,
											height: svgDoc.documentElement.height.baseVal.value
										},
										image: j.url
									}).then((l) => {
										selectedLayers.value = [l.id];
										cast('select', l.id);
									});
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
										selectedLayers.value = [];
										cast('select', null);
									} else {
										backoffValue.value = undefined;
									}
								}}
								ontouchend={(evt) => {
									evt.preventDefault();
								}}
								onkeydown={(evt) => {
									if (evt.key == 'Escape') {
										selectedLayers.value = [];
										cast('select', null);
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
										cast('cursor', null);
									}}
									{camera}
									{lockRotation}
									{frameBoxPath}
								>
									{#snippet children(liveLenses, navigationActions)}
										<rect
											transform={rotationTransform.value}
											fill="#fff"
											stroke="#eee"
											stroke-width="5"
											{...doc.value.viewbox}
										/>
										{#if showGrid.value}
											<Grid {rotationTransform} {frameBoxObject} {cameraScale} {gridDistance} />
										{/if}

										<g transform={rotationTransform.value} opacity="0.7">
											{#each selectedLayers.value as id (id)}
												{@const el = view(['layers', 'items', L.find((el) => el.id == id)], doc)}

												{@const deep_bounding = view(
													[L.find((el) => el.id == id && el.has_children), 'deep_bounding'],
													layersInOrder
												).value}

												{#if deep_bounding}
													<rect
														tabindex="-1"
														stroke="#0af"
														cursor="move"
														stroke-dasharray="{cameraScale.value * 2} {cameraScale.value * 2}"
														stroke-width={cameraScale.value * 2}
														x={deep_bounding.minX - 3 * cameraScale.value + groupDragDelta.value.x}
														y={deep_bounding.minY - 3 * cameraScale.value + groupDragDelta.value.y}
														width={deep_bounding.maxX - deep_bounding.minX + 6 * cameraScale.value}
														height={deep_bounding.maxY - deep_bounding.minY + 6 * cameraScale.value}
														fill="none"
														pointer-events="all"
														role="button"
														data-layer-id={id}
														onclick={(evt) => {
															evt.stopPropagation();
															backoffValue.value = undefined;
														}}
														onpointerdown={(evt) => {
															if (evt.isPrimary && E.isLeftButton(evt)) {
																evt.preventDefault();
																evt.currentTarget.focus({
																	preventScroll: true
																});
																evt.currentTarget.setPointerCapture(evt.pointerId);
																backoffValue.value = true;
																const world = liveLenses.clientToCanvas(evt.clientX, evt.clientY);

																groupDrag.value = {
																	pointerId: evt.pointerId,
																	bx: world.x,
																	by: world.y,
																	cx: world.x,
																	cy: world.y
																};
															}
														}}
														onpointermove={(evt) => {
															if (
																evt.isPrimary &&
																evt.currentTarget.hasPointerCapture(evt.pointerId)
															) {
																const world = liveLenses.clientToCanvas(evt.clientX, evt.clientY);

																update(
																	L.set(L.props('cx', 'cy'), { cx: world.x, cy: world.y }),
																	groupDrag
																);
															}
														}}
														onpointerup={(evt) => {
															if (
																evt.isPrimary &&
																evt.currentTarget.hasPointerCapture(evt.pointerId)
															) {
																const layer_id = evt.currentTarget.getAttribute('data-layer-id');
																const delta = groupDragDelta.value;
																dispatch('move_layer_relative', {
																	layer_id,
																	dx: delta.x,
																	dy: delta.y
																})
																	.catch(() => {})
																	.then(() => {
																		groupDrag.value = undefined;
																	});
															}
														}}
														onkeydown={(evt) => {
															if (evt.key === 'Escape' || evt.key === 'Esc') {
																evt.stopPropagation();
																evt.currentTarget.releasePointerCapture(groupDrag.value.pointerId);
																groupDrag.value = undefined;
															}
														}}
													/>
												{/if}
											{/each}
										</g>

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
																onclick={(evt) => {
																	evt.stopPropagation();
																	if (groupDrag.value === undefined) {
																		selectedLayers.value = [el.value?.id];

																		if (el.value?.id) {
																			evt.preventDefault();
																			cast('select', el.value?.id);
																		}
																	}
																}}
																tabindex="-1"
																onkeydown={() => {
																	selectedLayers.value = [el.value?.id];
																	if (el.value?.id) {
																		cast('select', el.value?.id);
																	}
																}}
																fill={el.value?.style?.background_color ?? '#70DB93'}
																stroke={el.value?.style?.border_color ?? 'black'}
																stroke-dasharray={el.value?.style?.border_dash_array ?? ''}
																stroke-width={el.value?.style?.border_width ?? '1'}
																opacity={el.value?.style?.opacity ?? '1'}
															>
																<Symbol
																	symbols={data.symbols}
																	symbolId={el.value?.box.shape}
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
																	onclick={(evt) => {
																		evt.stopPropagation();
																		if (groupDrag.value === undefined) {
																			selectedLayers.value = [el.value?.id];
																			if (el.value?.id) {
																				evt.preventDefault();
																				cast('select', el.value?.id);
																			}
																		}
																	}}
																	tabindex="-1"
																	onkeydown={() => {
																		selectedLayers.value = [el.value?.id];
																		if (el.value?.id) {
																			cast('select', el.value?.id);
																		}
																	}}
																>
																	<TextElement bbox={thisbbox} el={el.value} />
																</g>
															{/key}
														{/if}
														{#if el.value?.edge}
															<g
																role="button"
																onclick={(evt) => {
																	evt.stopPropagation();
																	if (groupDrag.value === undefined) {
																		selectedLayers.value = [el.value?.id];
																		if (el.value?.id) {
																			evt.preventDefault();
																			cast('select', el.value?.id);
																		}
																	}
																}}
																tabindex="-1"
																onkeydown={() => {
																	selectedLayers.value = [el.value?.id];
																	if (el.value?.id) {
																		cast('select', el.value?.id);
																	}
																}}
																opacity={el.value?.style?.opacity ?? '1'}
																stroke={el.value?.edge?.style?.stroke_color ?? 'black'}
																stroke-width={el.value?.edge?.style?.stroke_width ?? '1'}
																stroke-linejoin={el.value?.edge?.style?.stroke_join ?? 'rect'}
																stroke-linecap={el.value?.edge?.style?.stroke_cap ?? 'butt'}
															>
																<path
																	d={edgePath[el.value?.edge?.style?.smoothness ?? 'linear'](
																		el.value?.edge,
																		L.get(localProp('waypoints'), el.value?.edge)
																	)}
																	pointer-events="stroke"
																	fill="none"
																	stroke="none"
																	stroke-width={(el.value?.edge?.style?.stroke_width ?? 1) * 1 +
																		10 * cameraScale.value}
																/>
																<path
																	d={edgePath[el.value?.edge?.style?.smoothness ?? 'linear'](
																		el.value?.edge,
																		L.get(localProp('waypoints'), el.value?.edge)
																	)}
																	stroke-dasharray={el.value?.edge?.style?.stroke_dash_array ?? ''}
																	fill="none"
																/>

																{#if el.value?.edge?.style?.source_tip_symbol_shape_id}
																	{@const source_angle = edgeAngle['source'](
																		el.value?.edge,
																		L.get(localProp('waypoints'), el.value?.edge)
																	)}
																	{@const size = el.value?.edge?.style?.stroke_width ?? 1}

																	<g
																		fill={el.value?.style?.background_color ?? 'black'}
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
																	{@const size = el.value?.edge?.style?.stroke_width ?? 1}
																	<g
																		fill={el.value?.style?.background_color ?? 'black'}
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
										<g transform={rotationTransform.value} opacity="0.7">
											{#each selectedLayers.value as id (id)}
												{@const el = view(['layers', 'items', L.find((el) => el.id == id)], doc)}

												{#if el.value?.box}
													<rect
														class="selected"
														x={el.value?.box.position_x - cameraScale.value}
														y={el.value?.box.position_y - cameraScale.value}
														width={el.value?.box.width + 2 * cameraScale.value}
														height={el.value?.box.height + 2 * cameraScale.value}
														cursor="move"
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
															stroke-width={cameraScale.value * 6}
														></rect>
													{/if}
												{/if}
												{#if el.value?.edge}
													<path
														class="selected"
														d={edgePath[el.value?.edge?.style?.smoothness ?? 'linear'](
															el.value?.edge,
															L.get(localProp('waypoints'), el.value?.edge)
														)}
														stroke="black"
														fill="none"
														stroke-width={(el.value?.edge?.style?.stroke_width ?? 1) * 1 +
															6 * cameraScale.value}
														stroke-linejoin={el.value?.edge?.style?.stroke_join ?? 'rect'}
														stroke-linecap={el.value?.edge?.style?.stroke_cap ?? 'butt'}
													/>

													{#if el.value?.edge?.style?.source_tip_symbol_shape_id}
														{@const source_angle = edgeAngle['source'](
															el.value?.edge,
															L.get(localProp('waypoints'), el.value?.edge)
														)}
														<g
															class="selected"
															transform="rotate({source_angle} {el.value?.edge.source_x} {el.value
																?.edge.source_y})"
														>
															{#await data.symbols then symbols}
																{@const symbol = symbols.get(
																	el.value?.edge?.style?.source_tip_symbol_shape_id
																)}
																{@const size = el.value?.edge?.style?.stroke_width ?? 1}

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
															transform="rotate({target_angle} {el.value?.edge.target_x} {el.value
																?.edge.target_y})"
														>
															{#await data.symbols then symbols}
																{@const symbol = symbols.get(
																	el.value?.edge?.style?.target_tip_symbol_shape_id
																)}
																{@const size = el.value?.edge?.style?.stroke_width ?? 1}

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
																	stroke-linejoin={el.value?.edge?.style?.stroke_join ?? 'rect'}
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
																			{@const size = el.value?.edge?.style?.stroke_width ?? 1}

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
																			{@const size = el.value?.edge?.style?.stroke_width ?? 1}

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
															cursor="move"
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
																onclick={(evt) => {
																	evt.stopPropagation();
																	backoffValue.value = undefined;
																}}
																onkeydown={(evt) => {
																	if (evt.key === 'Escape' || evt.key === 'Esc') {
																		if (!backoffValue.value) {
																			return;
																		}
																		evt.stopPropagation();
																		evt.currentTarget.releasePointerCapture(evt.pointerId);
																		waypoints.value = localProp.reset;
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
																	cursor="move"
																	stroke="none"
																	r={12 * cameraScale.value}
																	cx={wp_proposal.x}
																	cy={wp_proposal.y}
																	pointer-events="all"
																/>
																<circle
																	fill="white"
																	cursor="move"
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
																		backoffValue.value = pos.value;
																		waypoints.value = localProp.reset;
																		pointerOffset.value = Geo.diff2d(
																			wp,
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
																	if (evt.key === 'Escape' || evt.key === 'Esc') {
																		if (!backoffValue.value) {
																			return;
																		}
																		evt.stopPropagation();
																		evt.currentTarget.releasePointerCapture(evt.pointerId);
																		waypoints.value = localProp.reset;
																	}
																}}
																role="button"
																tabindex="-1"
															>
																<circle
																	fill="none"
																	cursor="move"
																	stroke="none"
																	r={12 * cameraScale.value}
																	cx={wp.x}
																	cy={wp.y}
																	pointer-events="all"
																/>
																<circle
																	fill="white"
																	cursor="move"
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
															onclick={(evt) => {
																evt.stopPropagation();
															}}
															onpointerdown={(evt) => {
																if (evt.isPrimary && E.isLeftButton(evt)) {
																	evt.preventDefault();
																	evt.currentTarget.focus({
																		preventScroll: true
																	});
																	evt.currentTarget.setPointerCapture(evt.pointerId);
																	backoffValue.value = source_pos.value;
																	pointerOffset.value = Geo.diff2d(
																		source_pos.value,
																		liveLenses.clientToCanvas(evt.clientX, evt.clientY)
																	);
																}
															}}
															onpointermove={(evt) => {
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
																if (evt.key === 'Escape' || evt.key === 'Esc') {
																	if (!backoffValue.value) {
																		return;
																	}
																	evt.stopPropagation();
																	evt.currentTarget.releasePointerCapture(evt.pointerId);
																	source_pos.value = backoffValue.value;
																}
															}}
															role="button"
															tabindex="-1"
														>
															<circle
																fill="none"
																cursor="move"
																stroke="none"
																pointer-events="all"
																r={12 * cameraScale.value}
																cx={el.value?.edge?.source_x}
																cy={el.value?.edge?.source_y}
															/><circle
																fill="white"
																cursor="move"
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
															onclick={(evt) => {
																evt.stopPropagation();
															}}
															onpointerdown={(evt) => {
																if (evt.isPrimary && E.isLeftButton(evt)) {
																	evt.preventDefault();
																	evt.currentTarget.focus({
																		preventScroll: true
																	});
																	evt.currentTarget.setPointerCapture(evt.pointerId);
																	backoffValue.value = target_pos.value;
																	pointerOffset.value = Geo.diff2d(
																		target_pos.value,
																		liveLenses.clientToCanvas(evt.clientX, evt.clientY)
																	);
																}
															}}
															onpointermove={(evt) => {
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
																if (evt.key === 'Escape' || evt.key === 'Esc') {
																	if (!backoffValue.value) {
																		return;
																	}
																	evt.stopPropagation();
																	evt.currentTarget.releasePointerCapture(evt.pointerId);
																	target_pos.value = backoffValue.value;
																}
															}}
															role="button"
															tabindex="-1"
														>
															<circle
																fill="none"
																stroke="none"
																cursor="move"
																pointer-events="all"
																r={12 * cameraScale.value}
																cx={el.value?.edge?.target_x}
																cy={el.value?.edge?.target_y}
															/><circle
																fill="white"
																stroke="#7af"
																cursor="move"
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
													{@const boxPos = view(
														[
															L.cond([R.prop('box'), 'box'], [R.prop('text'), 'text']),
															L.pick({
																x: 'position_x',
																y: 'position_y'
															})
														],
														el
													)}
													<rect
														{...boxDim.value}
														fill="none"
														class="draggable"
														onpointerdown={(evt) => {
															if (evt.isPrimary && E.isLeftButton(evt)) {
																evt.preventDefault();
																evt.currentTarget.focus({
																	preventScroll: true
																});
																evt.currentTarget.setPointerCapture(evt.pointerId);
																backoffValue.value = boxPos.value;
																pointerOffset.value = Geo.diff2d(
																	boxPos.value,
																	liveLenses.clientToCanvas(evt.clientX, evt.clientY)
																);
															}
														}}
														onpointermove={(evt) => {
															if (
																evt.isPrimary &&
																evt.currentTarget.hasPointerCapture(evt.pointerId)
															) {
																boxPos.value = Geo.translate(
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
																if (el.value.box) {
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
																} else if (el.value.text) {
																	cast('update_text_position', {
																		layer_id: el.value.id,
																		value: L.get(
																			['text', L.props('position_x', 'position_y')],
																			el.value
																		)
																	});
																}
															}
														}}
														onclick={(evt) => {
															evt.stopPropagation();
															backoffValue.value = undefined;
														}}
														onkeydown={(evt) => {
															if (evt.key === 'Escape' || evt.key === 'Esc') {
																if (!backoffValue.value) {
																	return;
																}
																evt.stopPropagation();
																evt.currentTarget.releasePointerCapture(evt.pointerId);
																boxPos.value = backoffValue.value;
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
																	if (evt.isPrimary && E.isLeftButton(evt)) {
																		evt.preventDefault();
																		evt.currentTarget.focus({
																			preventScroll: true
																		});
																		evt.currentTarget.setPointerCapture(evt.pointerId);
																		backoffValue.value = pos.value;
																		pointerOffset.value = Geo.diff2d(
																			posVal,
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
																	if (evt.key === 'Escape' || evt.key === 'Esc') {
																		if (!backoffValue.value) {
																			return;
																		}
																		evt.stopPropagation();
																		evt.currentTarget.releasePointerCapture(evt.pointerId);
																		pos.value = backoffValue.value;
																	}
																}}
																role="button"
																tabindex="-1"
																transform="translate({dy * cameraScale.value * 6},{dx *
																	cameraScale.value *
																	6})"
															>
																<circle
																	fill="none"
																	stroke="none"
																	cursor="move"
																	pointer-events="all"
																	vector-effect="non-scaling-stroke"
																	r={cameraScale.value * 12}
																	cx={posVal.x}
																	cy={posVal.y}
																/>
																<circle
																	fill="white"
																	stroke="#7af"
																	cursor="move"
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
												<Edger
													sockets={viewCombined(
														[
															L.reread(({ inOrder, flatLayers }) =>
																inOrder
																	.filter(R.complement(R.prop('hidden')))
																	.flatMap(({ index, id, depth, hidden }) => {
																		const el = R.find((l) => l.id === id, flatLayers);
																		const iid = el?.interface_id;

																		if (iid) {
																			const socket_schema = s.get(iid);
																			return socket_schema.sockets
																				.map((sock) => {
																					if (el.box) {
																						return {
																							id: {
																								socket: sock.id,
																								layer: id
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
													newEdge={(e) => {
														dispatch('create_layer', {
															base_layer_id: L.get('id', singleSelectedLayer.value),
															source: {
																socket_id: e.source.socket,
																layer_id: e.source.layer
															},
															target: { socket_id: e.target.socket, layer_id: e.target.layer }
														}).then((l) => {
															selectedLayers.value = [l.id];
															cast('select', l.id);
														});
													}}
													newEdgeNode={(t) => {}}
												/>
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
														selectedLayers.value = [l.id];
														cast('select', l.id);
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
														selectedLayers.value = [l.id];
														cast('select', l.id);
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
												call((c) => {
													c && c.resetCamera();
												}, cameraScroller);
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
									class="tool-selector"
									class:active={activeTool.value === tool.id}
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
									/></label
								>
							{/each}
						<hr />
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
								use:bindValue={view(['edge', 'style', 'stroke_width', L.valueOr('1')], singleSelectedLayer)}
							/>
						</label>
						{@const strokeColor = view(
										['edge', 'style', 'stroke_color', L.valueOr('#000000')],
										singleSelectedLayer
									)}
						<label class="pretty-color">
								<span class="pretty-color-label">Line Color</span>
								<svg preserveAspectRatio="xMinYMid meet" class="pretty-color-value" style:color={strokeColor.value} viewBox="-16 -16 32 32">
									<path stroke="currentColor" stroke-width="8" d="M-12,0C0,-12,12,12,24,0" fill="none" />
								</svg>

								<input
									type="color"
									class="pretty-color-control"
										onchange={(evt) =>
											cast('change_style', {
											layer_id: singleSelectedLayer.value.id,
											type: 'edge',
											attr: 'stroke_color',
											val: evt.currentTarget.value
										})}
										use:bindValue={strokeColor}
									/>
								</label
							>

							{@const opacityValueStrict = view(['style', 'opacity', L.rewrite(R.clamp(0, 1)), L.valueOr(1), L.reread((num) => (Math.round(num * 100) / 100).toFixed(2))], singleSelectedLayer)}
							<label class="pretty-number">
							<span class="pretty-number-label">Opacity</span>
							<input
								type="number"
								class="pretty-number-control"
								size="4"
								min="0"
								max="1"
								step="0.01"
								onchange={(evt) =>{
									opacityValueStrict.value = evt.currentTarget.valueAsNumber;
									cast('change_style', {
										layer_id: singleSelectedLayer.value.id,
										type: 'layer',
										attr: 'opacity',
										val: opacityValueStrict.value
									})}}
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
								<span class="pretty-select-value">{symbols.get(sourceTipShapeValue.value)?.name ?? "None"}</span>
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
										return symbol.name.split("-", 2)[0]
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
							{@const strokeDashValue = view(
									['edge', 'style', 'stroke_dash_array', L.valueOr('')],
									singleSelectedLayer
								)}
							<label class="pretty-select">
								<span class="pretty-select-label">Dash</span>
								<span class="pretty-select-value">{strokeDashValue.value || "None"}</span>
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
								<span class="pretty-select-value">{symbols.get(targetTipShapeValue.value)?.name ?? "None"}</span>
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
										return symbol.name.split("-", 2)[0]
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

							{@const smoothnessValue = view(['edge', 'style', 'smoothness', L.valueOr('linear')], singleSelectedLayer)}


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
										if(evt.currentTarget.checked) {
											cast('change_style', {
												layer_id: singleSelectedLayer.value.id,
												type: 'edge',
												attr: 'smoothness',
												val: evt.currentTarget.value
											})
										}
									}}
								/><svg viewBox="-16 -16 32 32" class="pretty-checkbox-label"><title>Left</title>
									<path stroke="currentColor" stroke-width="5" d="M-12,-12L5,-4L-5,4L12,12" fill="none" />
								</svg></label
							>

							<label class="pretty-checkbox"
								><input
									class="pretty-checkbox-control"
									type="radio"
									value="autobezier"
									bind:group={smoothnessValue.value}
										onchange={(evt) => {
										if(evt.currentTarget.checked) {
											cast('change_style', {
												layer_id: singleSelectedLayer.value.id,
												type: 'edge',
												attr: 'smoothness',
												val: evt.currentTarget.value
											})
										}
									}}
								/><svg viewBox="-16 -16 32 32" class="pretty-checkbox-label"><title>Left</title>
									<path stroke="currentColor" stroke-width="5" d="M-12,-12  C 32,-7  -32,7  12,12" fill="none" />
								</svg></label
							>
						</div></div>
						{@const strokeJoinValue = view(
									['edge', 'style', 'stroke_join', L.valueOr('bevel')],
									singleSelectedLayer
								)}

						<div class="pretty-checkbox-group">
								<span class="pretty-checkbox-group-head">Join</span>
								<div class="pretty-checkbox-group-body">

								<label class="pretty-checkbox"
								><input
									class="pretty-checkbox-control"
									type="radio"
									value="bevel"
									bind:group={strokeJoinValue.value}
									onchange={(evt) => {
										if(evt.currentTarget.checked) {
											cast('change_style', {
												layer_id: singleSelectedLayer.value.id,
												type: 'edge',
												attr: 'stroke_join',
												val: evt.currentTarget.value
											})
										}
									}}
								/><svg viewBox="-16 -16 32 32" class="pretty-checkbox-label"><title>bevel</title>

									<path stroke="currentColor" stroke-width="10" d="M-10,-10L6,0L-10,10" fill="none" stroke-linejoin="bevel" />
																	</svg></label
							>

							<label class="pretty-checkbox"
								><input
									class="pretty-checkbox-control"
									type="radio"
									value="miter"
									bind:group={strokeJoinValue.value}
									onchange={(evt) => {
										if(evt.currentTarget.checked) {
											cast('change_style', {
												layer_id: singleSelectedLayer.value.id,
												type: 'edge',
												attr: 'stroke_join',
												val: evt.currentTarget.value
											})
										}
									}}
								/><svg viewBox="-16 -16 32 32" class="pretty-checkbox-label"><title>miter</title>

									<path stroke="currentColor" stroke-width="10" d="M-10,-10L6,0L-10,10" fill="none" stroke-linejoin="miter" />
																	</svg></label
							>


							<label class="pretty-checkbox"
								><input
									class="pretty-checkbox-control"
									type="radio"
									value="round"
									bind:group={strokeJoinValue.value}
									onchange={(evt) => {
										if(evt.currentTarget.checked) {
											cast('change_style', {
												layer_id: singleSelectedLayer.value.id,
												type: 'edge',
												attr: 'stroke_join',
												val: evt.currentTarget.value
											})
										}
									}}
								/><svg viewBox="-16 -16 32 32" class="pretty-checkbox-label"><title>round</title>

									<path stroke="currentColor" stroke-width="10" d="M-10,-10L6,0L-10,10" fill="none" stroke-linejoin="round" />
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
										if(evt.currentTarget.checked) {
											cast('change_style', {
												layer_id: singleSelectedLayer.value.id,
												type: 'edge',
												attr: 'stroke_cap',
												val: evt.currentTarget.value
											})
										}
									}}
								/><svg viewBox="-16 -16 32 32" class="pretty-checkbox-label"><title>butt</title>

									<path stroke="currentColor" stroke-width="10" d="M-10,-10L10,10" fill="none" stroke-linecap="butt" />
																	</svg></label
							>

							<label class="pretty-checkbox"
								><input
									class="pretty-checkbox-control"
									type="radio"
									value="squre"
									bind:group={strokeCapValue.value}
									onchange={(evt) => {
										if(evt.currentTarget.checked) {
											cast('change_style', {
												layer_id: singleSelectedLayer.value.id,
												type: 'edge',
												attr: 'stroke_cap',
												val: evt.currentTarget.value
											})
										}
									}}
								/><svg viewBox="-16 -16 32 32" class="pretty-checkbox-label"><title>squre</title>

									<path stroke="currentColor" stroke-width="10" d="M-10,-10L10,10" fill="none" stroke-linecap="squre" />
																	</svg></label
							>


							<label class="pretty-checkbox"
								><input
									class="pretty-checkbox-control"
									type="radio"
									value="round"
									bind:group={strokeCapValue.value}
									onchange={(evt) => {
										if(evt.currentTarget.checked) {
											cast('change_style', {
												layer_id: singleSelectedLayer.value.id,
												type: 'edge',
												attr: 'stroke_cap',
												val: evt.currentTarget.value
											})
										}
									}}
								/><svg viewBox="-16 -16 32 32" class="pretty-checkbox-label"><title>round</title>

									<path stroke="currentColor" stroke-width="10" d="M-10,-10L10,10" fill="none" stroke-linecap="round" />
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
								/><svg viewBox="-16 -16 32 32" class="pretty-checkbox-label"><title>Cyclic</title>
									<text text-anchor="middle" dominant-baseline="middle" x="0" y="2" font-size="20" fill="currentColor" font-weight="bold">C</text>
								</svg></label
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
								<span class="pretty-select-value">{symbols.get(shapeValue.value)?.name ?? "None"}</span>
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
										return symbol.name.split("-", 2)[0]
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
							{@render commonProps()}
						{/snippet}

						{#snippet commonProps()}
							{@const backgroundColorValue = view(
										['style', 'background_color', L.valueOr('#70DB93')],
										singleSelectedLayer
									)}
							<label class="pretty-color">
								<span class="pretty-color-label">Fill</span>
								<svg preserveAspectRatio="xMinYMid meet" class="pretty-color-value" style:color={backgroundColorValue.value} viewBox="0 0 32 32">
									<rect fill="currentColor" stroke-width="4" x="0" y="0" width="32" height="32" stroke="none"></rect>
								</svg>

								<input
									type="color"
									class="pretty-color-control"
									onchange={(evt) =>
										cast('change_style', {
											layer_id: singleSelectedLayer.value.id,
											type: 'layer',
											attr: 'background_color',
											val: evt.currentTarget.value
										})}
									use:bindValue={backgroundColorValue}
								/></label
							>
							{@const borderColorValue = view(
										['style', 'border_color', L.valueOr('#000000')],
										singleSelectedLayer
									)}
							<label class="pretty-color">
								<span class="pretty-color-label">Stroke</span>
								<svg preserveAspectRatio="xMinYMid meet" class="pretty-color-value" style:color={borderColorValue.value} viewBox="0 0 32 32">
									<rect stroke="currentColor" stroke-width="4" x="4" y="4" width="26" height="26" fill="none"></rect>
								</svg>

								<input
									type="color"
									class="pretty-color-control"
									onchange={(evt) =>
										cast('change_style', {
											layer_id: singleSelectedLayer.value.id,
											type: 'layer',
											attr: 'border_color',
											val: evt.currentTarget.value
										})}
									use:bindValue={borderColorValue}
								/></label
							>
							{@const opacityValueStrict = view(['style', 'opacity', L.rewrite(R.clamp(0, 1)), L.valueOr(1), L.reread((num) => (Math.round(num * 100) / 100).toFixed(2))], singleSelectedLayer)}
							<label class="pretty-number">
							<span class="pretty-number-label">Opacity</span>
							<input
								type="number"
								class="pretty-number-control"
								size="4"
								min="0"
								max="1"
								step="0.01"
								onchange={(evt) =>{
									opacityValueStrict.value = evt.currentTarget.valueAsNumber;
									cast('change_style', {
										layer_id: singleSelectedLayer.value.id,
										type: 'layer',
										attr: 'opacity',
										val: opacityValueStrict.value
									})}}
								use:bindNumericValue={opacityValueStrict}
							/>
							</label>
							{@const dashValue = view(
									['style', 'border_dash_array', L.valueOr('')],
									singleSelectedLayer
								)}
							<label class="pretty-select">
								<span class="pretty-select-label">Dash</span>
								<span class="pretty-select-value">{dashValue.value || "None"}</span>
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
								use:bindValue={view(['style', 'border_width', L.valueOr('1')], singleSelectedLayer)}
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
								<span class="pretty-select-label">Font FAmily</span>
								<span style:font-family={fontFamily.value} class="pretty-select-value">{fontFamily.value}</span>
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
								<option value="serif">Serif</option>
								<option value="sans-serif">Sans-Serif</option>
								<option value="monospace">Monospace</option>
							</select>
						</label>
							<label class="pretty-number">
							<span class="pretty-number-label">Size</span>
							<input
								type="number"
								class="pretty-number-control"
								size="4"
								min="1"
								max="128"
								onchange={(evt) =>
									cast('change_style', {
										layer_id: singleSelectedLayer.value.id,
										type: 'text',
										attr: 'font_size',
										val: evt.currentTarget.value
									})}
								use:bindValue={view(['text', 'style', 'font_size'], singleSelectedLayer)}
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
								/><svg viewBox="-16 -16 32 32" class="pretty-checkbox-label"><title>Bold</title>
									<text text-anchor="middle" dominant-baseline="middle" x="0" y="2" font-size="20" fill="currentColor" font-weight="bold">B</text>
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
								/><svg viewBox="-16 -16 32 32" class="pretty-checkbox-label"><title>Italic</title>
									<text text-anchor="middle" dominant-baseline="middle" x="0" y="2" font-size="20" fill="currentColor" font-style="italic">I</text>
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
								/><svg viewBox="-16 -16 32 32" class="pretty-checkbox-label"><title>Underline</title>
									<text text-anchor="middle" dominant-baseline="middle" x="0" y="2" font-size="20" fill="currentColor" text-decoration="underline">U</text>
								</svg></label
							>
								</div>
							</div>

							{@const textColor = view(['text', 'style', 'text_color'], singleSelectedLayer)}
							<label class="pretty-color">
								<span class="pretty-color-label">Color</span>
								<svg preserveAspectRatio="xMinYMid meet" class="pretty-color-value" style:color={textColor.value} viewBox="-16 -16 32 32">
									<text text-anchor="middle" dominant-baseline="middle" x="0" y="4" font-size="26" fill="currentColor" stroke="black" stroke-width="3">A</text>
									<text text-anchor="middle" dominant-baseline="middle" x="0" y="4" font-size="26" fill="currentColor" stroke-width="0">A</text>
								</svg>

								<input
									type="color"
									class="pretty-color-control"
										onchange={(evt) =>
											cast('change_style', {
												layer_id: singleSelectedLayer.value.id,
												type: 'text',
												attr: 'text_color',
												val: evt.currentTarget.value
											})}
										use:bindValue={textColor}
									/>
								</label
							>
							{@const alignmentValue = view(['text', 'style', 'alignment'], singleSelectedLayer)}


							<div class="pretty-checkbox-group">
								<span class="pretty-checkbox-group-head">Alignment</span>
								<div class="pretty-checkbox-group-body">

								<label class="pretty-checkbox"
								><input
									class="pretty-checkbox-control"
									type="radio"
									value="left"
									bind:group={alignmentValue.value}
								/><svg viewBox="-16 -16 32 32" class="pretty-checkbox-label"><title>Left</title>
									<rect x="-12" y="-10" height="4" width="24" fill="currentColor" stroke="none" stroke-width="0"></rect>
									<rect x="-12" y="-2" height="4" width="12" fill="currentColor" stroke="none" stroke-width="0"></rect>
									<rect x="-12" y="6" height="4" width="16" fill="currentColor" stroke="none" stroke-width="0"></rect>
								</svg></label
							>

							<label class="pretty-checkbox"
								><input
									class="pretty-checkbox-control"
									type="radio"
									value="center"
									bind:group={alignmentValue.value}
								/><svg viewBox="-16 -16 32 32" class="pretty-checkbox-label"><title>Center</title>
									<rect x="-12" y="-10" height="4" width="24" fill="currentColor" stroke="none" stroke-width="0"></rect>
									<rect x="-6" y="-2" height="4" width="12" fill="currentColor" stroke="none" stroke-width="0"></rect>
									<rect x="-8" y="6" height="4" width="16" fill="currentColor" stroke="none" stroke-width="0"></rect>
								</svg></label
							>

							<label class="pretty-checkbox"
								><input
									class="pretty-checkbox-control"
									type="radio"
									value="right"
									bind:group={alignmentValue.value}
								/><svg viewBox="-16 -16 32 32" class="pretty-checkbox-label"><title>Right</title>
									<rect x="-12" y="-10" height="4" width="24" fill="currentColor" stroke="none" stroke-width="0"></rect>
									<rect x="0" y="-2" height="4" width="12" fill="currentColor" stroke="none" stroke-width="0"></rect>
									<rect x="-4" y="6" height="4" width="16" fill="currentColor" stroke="none" stroke-width="0"></rect>
								</svg></label
							>
						</div>
					</div>


						{@render commonProps()}
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

				{#if singleSelectedLayerType.value == "text"}

					<div class="topsubbar">
						<div class="toolbar" style="display: block;">
							<label class="pretty-text">
								<span class="pretty-text-label">Edit Text</span>
								<textarea  class="pretty-text-control"
						style="height: 100%; min-height: 6em; resize: none;  width: 100%; justify-self: stretch; flex-grow: 1; box-sizing: border-box;"
						rows="1"
						cols="50"
						oninput={(evt) => {
							updateText(singleSelectedLayer.value.id, evt.currentTarget.value)
						}}
						use:bindValue={view(['text', 'body'], singleSelectedLayer)}
					></textarea>
							</label>
						</div>
					</div>
				{/if}

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
					<div class="toolbar vertical">
						Hierarchy
						<hr />
						<!-- <input style="" type="search" name="" placeholder="search" /> -->
						<div
							style="scrollbar-width: thin; max-height: 15em; padding:1px; overflow: auto; display: flex; flex-direction: column;"
						>
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
										(s, old) => (s ? [id] : old.filter((o) => o !== id))
									),
									selectedLayers
								)}
								<!-- svelte-ignore a11y_no_static_element_interactions -->
								<div
									style:margin-left="{2.5 + depth}em"
									ondragenter={(evt) => {
										const sourceId = evt.dataTransfer.getData('application/json+renewex-layer-id');
										if (!sourceId || sourceId === id) {
											return;
										}
										evt.currentTarget.style.backgroundColor = '#23875d';
									}}
									ondragleave={(evt) => {
										evt.currentTarget.style.backgroundColor = 'white';
									}}
									ondrop={(evt) => {
										const sourceId = evt.dataTransfer.getData('application/json+renewex-layer-id');
										if (!sourceId || sourceId === id) {
											return;
										}

										cast('move_layer', {
											layer_id: sourceId,
											target_layer_id: id,
											order: 'below',
											relative: 'outside'
										});

										evt.preventDefault();
										evt.currentTarget.style.backgroundColor = 'white';
									}}
									style="background: white; height: 5px; width: 100%; flex-shrink: 0;"
									ondragover={(evt) => {
										if (evt.dataTransfer.items.length < 1) {
											return;
										}
										const sourceId = evt.dataTransfer.getData('application/json+renewex-layer-id');
										if (!sourceId || sourceId === id) {
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
											evt.dataTransfer.setData('application/json+renewex-layer-id', id);

											selectedLayers.value = [id];
											cast('select', id);
										}}
										ondragover={(evt) => {
											if (evt.dataTransfer.items.length < 1) {
												return;
											}
											const sourceId = evt.dataTransfer.getData(
												'application/json+renewex-layer-id'
											);
											if (!sourceId || sourceId === id) {
												return;
											}
											evt.preventDefault();
											evt.dataTransfer.dropEffect = 'move';
										}}
										ondragenter={(evt) => {
											const sourceId = evt.dataTransfer.getData(
												'application/json+renewex-layer-id'
											);
											if (!sourceId || sourceId === id) {
												return;
											}
											evt.currentTarget.style.backgroundColor = '#23875d';
										}}
										ondragleave={(evt) => {
											evt.currentTarget.style.backgroundColor = '#333';
										}}
										ondrop={(evt) => {
											const sourceId = evt.dataTransfer.getData(
												'application/json+renewex-layer-id'
											);
											if (!sourceId || sourceId === id) {
												return;
											}

											cast('move_layer', {
												layer_id: sourceId,
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
										onclick={() => {
											const newSel = update(R.not, selected);

											if (newSel) {
												cast('select', id);
											} else {
												cast('select', null);
											}
										}}
										style="flex-grow: 1; display: flex; flex-direction: column; align-self: stretch; justify-content: center; box-sizing: border-box;"
									>
										<div style="white-space: nowrap;">
											<span>{elType.value || 'group'} </span>
											<span
												>{#if hyperlink.value}🔗{/if}</span
											>
											<span>{elSemantic.value}</span>
										</div>
										<small
											style="color: #aaa; display: block; max-width: 100%; width:100%; overflow: hidden; text-overflow: ellipsis; word-break: none; white-space: nowrap; box-sizing: border-box;"
											>({el.value.z_index}/{elId.value})</small
										>
									</div>
								</div>
								{#if isLast}
									{#each [id, ...parents] as p, i (p)}
										<div
											style:margin-left="{2.5 + depth - i}em"
											ondragenter={(evt) => {
												const sourceId = evt.dataTransfer.getData(
													'application/json+renewex-layer-id'
												);
												if (!sourceId || sourceId === p) {
													return;
												}

												evt.currentTarget.style.backgroundColor = '#23875d';
											}}
											ondragleave={(evt) => {
												evt.currentTarget.style.backgroundColor = 'white';
											}}
											ondrop={(evt) => {
												const sourceId = evt.dataTransfer.getData(
													'application/json+renewex-layer-id'
												);

												if (!sourceId || sourceId === p) {
													return;
												}

												cast('move_layer', {
													layer_id: sourceId,
													target_layer_id: p,
													order: 'above',
													relative: 'outside'
												});

												evt.preventDefault();
												evt.currentTarget.style.backgroundColor = 'white';
											}}
											ondragover={(evt) => {
												if (evt.dataTransfer.items.length < 1) {
													return;
												}
												const sourceId = evt.dataTransfer.getData(
													'application/json+renewex-layer-id'
												);
												if (!sourceId || sourceId === p) {
													return;
												}
												evt.preventDefault();
												evt.dataTransfer.dropEffect = 'move';
											}}
											style="background: white; height: 5px; width: 100%; flex-shrink: 0;"
										></div>
									{/each}
								{/if}
							{/each}
						</div>
						{#if singleSelectedHyperinkedId.value}
							<div>
								Linked:<br />
								<u
									style="cursor: pointer"
									onclick={() => {
										const id = singleSelectedHyperinkedId.value;
										selectedLayers.value = [id];
										cast('select', id);
									}}>{singleSelectedHyperinkedId.value}</u
								>
							</div>
						{/if}
						<label>
							Interface: <select
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
								{#await data.socket_schemas then schemas}
									<option value="">None</option>
									{#each schemas.entries() as [id, s]}
										<option value={id}>{s.name}</option>
									{/each}
								{/await}
							</select>
						</label>
						<label
							><span>Semantic Tag:</span><br />
							<select
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
								{#await data.semantic_tags then tags}
									<option value="">None</option>
									{#each tags as t}
										<option value={t}>{t}</option>
									{/each}
								{/await}
							</select></label
						>
						<button
							disabled={!singleSelectedLayerType.value}
							onclick={(evt) => {
								evt.preventDefault();
								cast('delete_layer', selectedLayers.value[0]);
							}}>Delete</button
						>
					</div>
					{#if showDebug.value}
						<div class="toolbar vertical">
							<details>
								<summary>Debug Document </summary>
								<textarea use:bindValue={view(L.inverse(L.json({ space: '  ' })), doc)}></textarea>
							</details>
							<details>
								<summary> Debug Selection </summary>
								<textarea
									use:bindValue={view(L.inverse(L.json({ space: '  ' })), singleSelectedLayer)}
								></textarea>
							</details>
							<details>
								<summary>Debug Camera </summary>

								<textarea bind:value={cameraJson.value}></textarea>
							</details>
							<details>
								<summary>Debug Symbols </summary>

								{#await data.symbols then symbols}
									<textarea value={JSON.stringify(Array.from(symbols.entries()))}></textarea>
								{/await}
							</details>
						</div>
					{/if}
				</div>
				<div class="sidebar left">
					<div class="toolbar vertical">
						<small>Create</small>
						{#await data.primitives}
							-
						{:then groups}
							{#each groups as g}
								<div style="border-top: 1px solid gray;  padding-top: 1ex">
									{#each g.items as item}
										<div
											role="application"
											draggable={!item.data.content.hyperlink || singleSelectedIsBoxOrEdge.value}
											style:touch-action="none"
											ondragstart={(evt) => {
												const d = {
													...item.data,
													content: {
														...item.data.content,
														hyperlink: item.data.content.hyperlink
															? singleSelectedLayer.value.id
															: undefined
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
												class:droppable={!item.data.content.hyperlink ||
													singleSelectedIsBoxOrEdge.value}
												style:opacity={!item.data.content.hyperlink ||
												singleSelectedIsBoxOrEdge.value
													? 1
													: 0.5}
												viewBox="-4 -4 40 40"
												width="32"
											>
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
											style="display: grid; align-content: center; justify-content: center; grid-template-columns: max-content;  grid-template-rows: max-content; align-items: stretch; justify-items: stretch; width: 2em;"
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
												style="width: 3em; max-width: 100%; height: 3em; opacity: 0;grid-area: 1 / 1 / span 1 / span 1;"
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
									style="width: 100%; padding: 1ex; background: #333; color: #fff; box-sizing: border-box; text-align: center;"
									role="application"
									style:cursor={!!selectedBlueprint.value ? 'move' : 'default'}
									style:opacity={!!selectedBlueprint.value ? '1' : 0.5}
									draggable={!!selectedBlueprint.value}
									style:touch-action="none"
									ondragstart={(evt) => {
										const d = {
											content: {
												blueprint_id: selectedBlueprint.value
											},
											mimeType: 'application/json+renewex-blueprint',
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
						style="user-select: none; user-callout: none; text-align: center; font-size: 2em; cursor: pointer; display: grid; align-content: center; justify-content: center; line-height: 1; padding: 0.5ex"
						onclick={() => update(R.not, lockRotation)}
						ondblclick={() => {
							cameraRotation.value = 0;
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

	.menu-bar:focus-within .menu-bar-item:hover > .menu-bar-menu {
		display: flex;
	}

	.menu-bar-menu.open {
		display: flex;
	}

	.menu-bar-menu-item {
		display: flex;
		justify-items: stretch;
		cursor: default;
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
		opacity: 0.3;
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
			[body-start] 0.5ex [top-start left-start] auto [left-end topsubbar-start] 1fr[topsubbar-end right-start] max(20vw)
			[right-end top-end] 1em [body-end];
		grid-template-rows: [body-start] 0.5ex [top-start] auto [top-end left-start right-start topsubbar-start] 1fr [topsubbar-end] auto [left-end right-end] 1em [body-end];
		gap: 0.5em;
		overflow: hidden;
		width: 100vw;

		contain: strict;
	}

	.topsubbar {
		grid-area: topsubbar;
		z-index: 100;
		align-self: end;
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

	.color-wrapper {
		display: grid;
		align-content: center;
		justify-content: center;
		width: 1.8em;
		height: 1.8em;
		border-radius: 100%;
		border: 2px solid #444;
		background: red;
		padding: 0;
		cursor: pointer;
		grid-template-columns: 100%;
		grid-template-rows: 100%;
		overflow: hidden;
		grid-auto-columns: 1ex;
		grid-auto-rows: 1ex;
		cursor: pointer;
		flex-shrink: 0;
	}

	.color-wrapper > input[type='color'] {
		padding: 0;
		margin: 0;
		outline: none;
		border: none;
		display: block;
		width: 100%;
		height: 100%;
		grid-column-start: -3;
		grid-row-start: -3;
		grid-column-end: 3;
		grid-row-end: 3;
		cursor: pointer;
	}

	.color-wrapper:focus-within {
		outline: 2px solid #23875d;
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
		flex: flex;
		align-items: center;
		align-content: center;
		color: #fff;
		font-weight: bold;
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

	.draggable {
		pointer-events: all;
		cursor: move;
	}

	text.selected {
		stroke: var(--selection-color, #7af);
		fill: var(--selection-color, #7af);
		stroke-width: 5;
		vector-effect: non-scaling-stroke;
		pointer-events: none;
		stroke-linecap: round;
		stroke-linejoin: round;
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
		stroke-linejoin: butt;
	}

	input[type='search'] {
		width: 100%;
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
	.pretty-text-label::after,
	.pretty-checkbox-group-head::after {
		content: ": ";
		color: #888;
	}

	.pretty-select-label,
	.pretty-number-label,
	.pretty-color-label,
	.pretty-text-label,
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

	.pretty-text {
		display: grid;
		grid-template-columns: [full-start] 1fr [full-end];
		grid-template-rows: [full-start label-start] max-content [label-end value-start] max-content [value-end full-end];
		align-items: stretch;
		justify-items: stretch;
		padding: 0.1ex;
		gap: 0.1ex;

	}

	.pretty-text-label {
		grid-area: label / full;
		display: block;
		text-transform: uppercase;
	}

	.pretty-text-control {
		display: block;
		grid-area: value / full;
		width: 100%;
		background: #fafafa;
		padding: 0.5ex;
		border: 1px solid #e0e0e0;
		box-sizing: border-box;
		min-width: 6em;
	}


</style>
