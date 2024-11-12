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
	import { bindValue } from '$lib/reactivity/bindings.svelte.js';
	import { numberSvgFormat } from '$lib/svg/formatter';
	import AppBar from '../../../AppBar.svelte';

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

	import { buildPath, buildCoord } from './symbols';
	import Symbol from './Symbol.svelte';
	import TextElement from './TextElement.svelte';

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
	import { stopPropagation } from 'svelte/legacy';

	const { data } = $props();

	const logLens = (base) =>
		L.lens(
			(x) => Math.log(x) / Math.log(base),
			(y) => Math.pow(base, y)
		);

	const textBounds = atom({});
	const showMinimap = atom(true);
	const showCursors = atom(true);
	const showOtherSelections = atom(true);
	const showDebug = atom(true);
	const showGrid = atom(false);
	const backoffValue = atom(undefined);
	const pointerOffset = atom({ x: 0, y: 0 });
	const gridDistance = atom(32);
	const gridDistanceExp = view(logLens(2), gridDistance);

	const tools = [
		{ name: 'Select', id: 'select' },
		{ name: 'Magnifier', id: 'magnifier' },
		{ name: 'Pan', id: 'paner' },
		{ name: 'Zoom', id: 'zoomer' },
		{ name: 'Rotate', id: 'rotator' },
		{ name: 'Pen', id: 'pen' },
		{ name: 'Annotate', id: 'annotate' },
		{ name: 'Edge', id: 'edge' },
		{ name: 'Polygon', id: 'polygon' }

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

	function deleteThisDocument(evt) {
		evt.preventDefault();
		data.commands.deleteDocument().catch((e) => {
			update((e) => [...e, e.message], errors);
		});
	}

	function causeError(e) {
		update((e) => [...e, 'Some Error'], errors);
	}

	const edgeAngle = {
		source: function (edge, wps) {
			const waypointX = wps.length ? wps[0].x : edge.target_x;
			const waypointY = wps.length ? wps[0].y : edge.target_y;

			return (Math.atan2(edge.source_y - waypointY, edge.source_x - waypointX) * 180) / Math.PI;
		},
		target: function (edge, wps) {
			const waypointX = wps.length ? wps[wps.length - 1].x : edge.source_x;
			const waypointY = wps.length ? wps[wps.length - 1].y : edge.source_y;

			return (Math.atan2(edge.target_y - waypointY, edge.target_x - waypointX) * 180) / Math.PI;
		}
	};

	const edgePath = {
		linear: function (edge, wps) {
			const waypoints = wps.map(({ x, y }) => `L ${x} ${y}`).join(' ');

			return `M ${edge.source_x} ${edge.source_y} ${waypoints} L ${edge.target_x} ${edge.target_y}`;
		},
		autobezier: function (edge, wps) {
			switch (wps.length) {
				case 0:
					return `M ${edge.source_x} ${edge.source_y} L ${edge.target_x} ${edge.target_y}`;
				case 1:
					return `M ${edge.source_x} ${edge.source_y}  Q ${wps[0].x} ${wps[0].y} ${edge.target_x} ${edge.target_y}`;
				default:
					const points = [{ x: edge.source_x, y: edge.source_y }, ...wps];
					let path = '';
					for (let i = 0; i < wps.length; i++) {
						const x1 = points[i].x;
						const y1 = points[i].y;
						const x2 = points[i + 1].x;
						const y2 = points[i + 1].y;
						path += `Q ${x1} ${y1} ${(x2 + x1) / 2} ${(y2 + y1) / 2}`;
					}
					const waypoints = [{ x: edge.source_x, y: edge.source_y }, ...wps];

					return `M ${edge.source_x} ${edge.source_y} ${path} T ${edge.target_x} ${edge.target_y}`;
			}
		}
	};

	function walkLayer(doc, parent, parents, hidden) {
		return doc.layers.items
			.map((l, index) => ({ l, index }))
			.filter(({ l }) => l.parent_id === parent)
			.flatMap(({ l, index }) => [
				{ id: l.id, index, depth: parents.length, parents, hidden: l.hidden || hidden },
				...walkLayer(doc, l.id, [l.id, ...parents], l.hidden || hidden).map((x, i, a) => ({
					...x,
					isLast: i + 1 === a.length
				}))
			]);
	}

	function walkDocument(doc) {
		return [...walkLayer(doc, null, [], false)];
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
	<AppBar authState={data.authState} {errors} />

	<LiveResource socket={data.live_socket} resource={data.document}>
		{#snippet children(doc, presence, { dispatch, cast })}
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
									<button class="menu-bar-item-button">Rename</button>
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
									<button class="menu-bar-item-button">Download</button>
								</li>
								<li class="menu-bar-menu-item">
									<button class="menu-bar-item-button">Download as...</button>
								</li>
								<li class="menu-bar-menu-item"><hr class="menu-bar-menu-ruler" /></li>
								<li class="menu-bar-menu-item">
									<button
										class="menu-bar-item-button"
										onclick={deleteThisDocument}
										style="color: #aa0000">Delete</button
									>
								</li>
								<li class="menu-bar-menu-item"><hr class="menu-bar-menu-ruler" /></li>
								<li class="menu-bar-menu-item">
									<button class="menu-bar-item-button" onclick={causeError} style="color: #aa0000"
										>Cause Error</button
									>
								</li>
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
									<input
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
							<ul class="menu-bar-menu">
								<li class="menu-bar-menu-item">
									<button class="menu-bar-item-button">Start</button>
								</li>
								<li class="menu-bar-menu-item">
									<button class="menu-bar-item-button">Pause</button>
								</li>
								<li class="menu-bar-menu-item">
									<button class="menu-bar-item-button">Step</button>
								</li>
								<li class="menu-bar-menu-item">
									<button class="menu-bar-item-button">Stop</button>
								</li>
							</ul>
						</li>
						<li class="menu-bar-item" tabindex="-1">
							Share
							<ul class="menu-bar-menu">
								<li class="menu-bar-menu-item">
									<button class="menu-bar-item-button">Share Link</button>
								</li>
							</ul>
						</li>
						<li class="menu-bar-item" tabindex="-1">
							Help
							<ul class="menu-bar-menu">
								<li class="menu-bar-menu-item">
									<button class="menu-bar-item-button">Reference</button>
								</li>
								<li class="menu-bar-menu-item">
									<a class="menu-bar-item-button" target="_blank" href="http://www.renew.de"
										>Website</a
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
							cast('create_layer', {
								pos,
								...content
							});
						}}
						onDropFile={(file, pos) => {
							const reader = new FileReader();
							reader.onload = function (event) {
								const parser = new DOMParser();
								const svgDoc = parser.parseFromString(event.target.result, 'image/svg+xml');

								data.commands.uploadSvg(svgDoc).then((j) => {
									cast('create_layer', {
										pos: {
											x: -svgDoc.documentElement.width.baseVal.value / 2 + pos.x,
											y: -svgDoc.documentElement.height.baseVal.value / 2 + pos.y,
											width: svgDoc.documentElement.width.baseVal.value,
											height: svgDoc.documentElement.height.baseVal.value
										},
										image: j.url
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
									if (backoffValue.value === undefined) {
										selectedLayers.value = [];
										cast('select', null);
									} else {
										backoffValue.value = undefined;
									}
								}}
								onkeydown={(evt) => {
									if (evt.key == 'Escape') {
										selectedLayers.value = [];
									}
								}}
							>
								<Navigator
									onworldcursor={(pos) => {
										cast('cursor', pos);
									}}
									onpointerout={(pos) => {
										cast('cursor', null);
									}}
									{camera}
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
																	selectedLayers.value = [el.value?.id];

																	if (el.value?.id) {
																		cast('select', el.value?.id);
																	}
																}}
																tabindex="-1"
																onkeydown={() => {
																	selectedLayers.value = [el.value?.id];
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
																		selectedLayers.value = [el.value?.id];
																		if (el.value?.id) {
																			cast('select', el.value?.id);
																		}
																	}}
																	tabindex="-1"
																	onkeydown={() => {
																		selectedLayers.value = [el.value?.id];
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
																	selectedLayers.value = [el.value?.id];
																	if (el.value?.id) {
																		cast('select', el.value?.id);
																	}
																}}
																tabindex="-1"
																onkeydown={() => {
																	selectedLayers.value = [el.value?.id];
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
														x={el.value?.box.position_x - 1}
														y={el.value?.box.position_y - 1}
														width={el.value?.box.width + 1}
														height={el.value?.box.height + 1}
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
																	x={el.value?.box.position_x - 1}
																	y={el.value?.box.position_y - 1}
																	width={el.value?.box.width + 1}
																	height={el.value?.box.height + 1}
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
																		R.prepend({ x: e.source_x, y: e.source_y, id: 'source' }),
																		R.append({ x: e.target_x, y: e.target_y, id: 'target' }),
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
													{#each persistentWaypoints.value as wp, wi}
														{@const pos = view(
															[
																L.find(R.whereEq({ id: wp.id }), { hint: wi }),
																L.removable('x', 'y'),
																L.props('x', 'y')
															],
															waypoints
														)}
														<circle
															fill="white"
															cursor="move"
															stroke="#7af"
															stroke-width="2"
															vector-effect="non-scaling-stroke"
															r={6 * cameraScale.value}
															cx={wp.x}
															cy={wp.y}
															onclick={(evt) => {
																backoffValue.value = undefined;
																evt.stopPropagation();
															}}
															ondblclick={(evt) => {
																pos.value = undefined;
																evt.stopPropagation();

																cast('delete_waypoint', {
																	layer_id: el.value.id,
																	waypoint_id: wp.id
																});
															}}
															onpointerdown={(evt) => {
																if (evt.isPrimary) {
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
																if (evt.currentTarget.hasPointerCapture(evt.pointerId)) {
																	pos.value = Geo.translate(
																		pointerOffset.value,
																		liveLenses.clientToCanvas(evt.clientX, evt.clientY)
																	);
																}
															}}
															onpointerup={(evt) => {
																if (evt.currentTarget.hasPointerCapture(evt.pointerId)) {
																	const newPos = Geo.translate(
																		pointerOffset.value,
																		liveLenses.clientToCanvas(evt.clientX, evt.clientY)
																	);
																	cast('update_waypoint_position', {
																		layer_id: el.value.id,
																		waypoint_id: wp.id,
																		value: newPos
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
																	waypoints.value = localProp.reset;
																}
															}}
															role="button"
															tabindex="-1"
														/>
													{/each}
													{#each waypointProposals.value as wp_proposal, wi (wp_proposal.id_before)}
														{@const pos = view(
															[
																L.lens(
																	(list) => {
																		const i =
																			R.findIndex(R.propEq(wp_proposal.id_before, 'id'), list) + 1;
																		if (list[i] && !list[i].id) {
																			return list[i];
																		} else {
																			return undefined;
																		}
																	},
																	(n, list) => {
																		const i =
																			R.findIndex(R.propEq(wp_proposal.id_before, 'id'), list) + 1;
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
														<circle
															fill="white"
															cursor="move"
															stroke="#7af"
															stroke-width="2"
															vector-effect="non-scaling-stroke"
															r={4 * cameraScale.value}
															cx={wp_proposal.x}
															cy={wp_proposal.y}
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
																if (evt.isPrimary) {
																	waypoints.value = localProp.reset;
																	evt.currentTarget.setPointerCapture(evt.pointerId);
																	backoffValue.value = wp_proposal;
																	pointerOffset.value = Geo.diff2d(
																		wp_proposal,
																		liveLenses.clientToCanvas(evt.clientX, evt.clientY)
																	);
																}
															}}
															onpointermove={(evt) => {
																if (evt.currentTarget.hasPointerCapture(evt.pointerId)) {
																	pos.value = Geo.translate(
																		pointerOffset.value,
																		liveLenses.clientToCanvas(evt.clientX, evt.clientY)
																	);
																}
															}}
															onpointerup={(evt) => {
																if (evt.currentTarget.hasPointerCapture(evt.pointerId)) {
																	cast('create_waypoint', {
																		layer_id: el.value.id,
																		after_waypoint_id: wp_proposal.id_before,
																		position: pos.value
																	});
																}
															}}
														/>
													{/each}

													{@const source_pos = view(
														['edge', L.pick({ x: 'source_x', y: 'source_y' })],
														el
													)}
													{@const target_pos = view(
														['edge', L.pick({ x: 'target_x', y: 'target_y' })],
														el
													)}
													<circle
														fill="white"
														cursor="move"
														stroke="#7af"
														stroke-width="2"
														vector-effect="non-scaling-stroke"
														r={6 * cameraScale.value}
														cx={el.value?.edge?.source_x}
														cy={el.value?.edge?.source_y}
														onclick={(evt) => {
															evt.stopPropagation();
														}}
														onpointerdown={(evt) => {
															if (evt.isPrimary) {
																evt.currentTarget.setPointerCapture(evt.pointerId);
																backoffValue.value = source_pos.value;
																pointerOffset.value = Geo.diff2d(
																	source_pos.value,
																	liveLenses.clientToCanvas(evt.clientX, evt.clientY)
																);
															}
														}}
														onpointermove={(evt) => {
															if (evt.currentTarget.hasPointerCapture(evt.pointerId)) {
																source_pos.value = Geo.translate(
																	pointerOffset.value,
																	liveLenses.clientToCanvas(evt.clientX, evt.clientY)
																);
															}
														}}
														onpointerup={(evt) => {
															if (evt.currentTarget.hasPointerCapture(evt.pointerId)) {
																const newPos = Geo.translate(
																	pointerOffset.value,
																	liveLenses.clientToCanvas(evt.clientX, evt.clientY)
																);
																cast('update_edge_position', {
																	layer_id: el.value.id,
																	value: {
																		source_x: newPos.x,
																		source_y: newPos.y
																	}
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
													/>

													<circle
														fill="white"
														stroke="#7af"
														cursor="move"
														stroke-width="2"
														vector-effect="non-scaling-stroke"
														r={6 * cameraScale.value}
														cx={el.value?.edge?.target_x}
														cy={el.value?.edge?.target_y}
														onclick={(evt) => {
															evt.stopPropagation();
														}}
														onpointerdown={(evt) => {
															if (evt.isPrimary) {
																evt.currentTarget.setPointerCapture(evt.pointerId);
																backoffValue.value = target_pos.value;
																pointerOffset.value = Geo.diff2d(
																	target_pos.value,
																	liveLenses.clientToCanvas(evt.clientX, evt.clientY)
																);
															}
														}}
														onpointermove={(evt) => {
															if (evt.currentTarget.hasPointerCapture(evt.pointerId)) {
																target_pos.value = Geo.translate(
																	pointerOffset.value,
																	liveLenses.clientToCanvas(evt.clientX, evt.clientY)
																);
															}
														}}
														onpointerup={(evt) => {
															if (evt.currentTarget.hasPointerCapture(evt.pointerId)) {
																const newPos = Geo.translate(
																	pointerOffset.value,
																	liveLenses.clientToCanvas(evt.clientX, evt.clientY)
																);
																cast('update_edge_position', {
																	layer_id: el.value.id,
																	value: {
																		target_x: newPos.x,
																		target_y: newPos.y
																	}
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
													/>
												{/if}

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
														if (evt.isPrimary) {
															evt.currentTarget.setPointerCapture(evt.pointerId);
															backoffValue.value = boxPos.value;
															pointerOffset.value = Geo.diff2d(
																boxPos.value,
																liveLenses.clientToCanvas(evt.clientX, evt.clientY)
															);
														}
													}}
													onpointermove={(evt) => {
														if (evt.currentTarget.hasPointerCapture(evt.pointerId)) {
															boxPos.value = Geo.translate(
																pointerOffset.value,
																liveLenses.clientToCanvas(evt.clientX, evt.clientY)
															);
														}
													}}
													onpointerup={(evt) => {
														if (evt.currentTarget.hasPointerCapture(evt.pointerId)) {
															if (el.value.box) {
																cast('update_box_size', {
																	layer_id: el.value.id,
																	value: L.get(
																		['box', L.props('position_x', 'position_y', 'width', 'height')],
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
														<circle
															fill="white"
															stroke="#7af"
															cursor="move"
															vector-effect="non-scaling-stroke"
															stroke-width="2"
															transform="translate({dy * cameraScale.value * 6},{dx *
																cameraScale.value *
																6})"
															r={cameraScale.value * 6}
															cx={posVal.x}
															cy={posVal.y}
															onpointerdown={(evt) => {
																if (evt.isPrimary) {
																	evt.currentTarget.setPointerCapture(evt.pointerId);
																	backoffValue.value = pos.value;
																	pointerOffset.value = Geo.diff2d(
																		posVal,
																		liveLenses.clientToCanvas(evt.clientX, evt.clientY)
																	);
																}
															}}
															onpointermove={(evt) => {
																if (evt.currentTarget.hasPointerCapture(evt.pointerId)) {
																	pos.value = Geo.translate(
																		pointerOffset.value,
																		liveLenses.clientToCanvas(evt.clientX, evt.clientY)
																	);
																}
															}}
															onpointerup={(evt) => {
																if (evt.currentTarget.hasPointerCapture(evt.pointerId)) {
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
														/>
													{/if}
												{/each}
											{/each}
										</g>

										<g transform={rotationTransform.value}>
											{#await data.socket_schemas then s}
												{#each layersInOrder.value as { index, id, depth, hidden } (id)}
													{#if !hidden}
														{@const el = view(
															['layers', 'items', L.find((el) => el.id == id)],
															doc
														)}

														{#if el.value?.box && el.value?.interface_id}
															{@const socket_schema = s.get(el.value?.interface_id)}
															{#each socket_schema.sockets as sock}
																{@const coordX = buildCoord(
																	{
																		x: el.value?.box.position_x,
																		y: el.value?.box.position_y,
																		width: el.value?.box.width,
																		height: el.value?.box.height
																	},
																	'x',
																	false,
																	sock.x
																)}
																{@const coordY = buildCoord(
																	{
																		x: el.value?.box.position_x,
																		y: el.value?.box.position_y,
																		width: el.value?.box.width,
																		height: el.value?.box.height
																	},
																	'y',
																	false,
																	sock.y
																)}

																<circle
																	fill="white"
																	stroke="#23875d"
																	stroke-width="2"
																	vector-effect="non-scaling-stroke"
																	r={5 * cameraScale.value}
																	cx={coordX}
																	cy={coordY}
																	cursor="alias"
																/>
															{/each}
														{/if}

														{#if el.value?.text}{/if}
													{/if}
												{/each}
											{/await}
										</g>

										{#if activeTool.value === 'pen'}
											<Pen
												{frameBoxPath}
												clientToCanvas={liveLenses.clientToCanvas}
												{cameraScale}
												{rotationTransform}
												onDraw={(points) => {
													cast('create_layer', {
														points
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
												onDraw={(points) => {
													cast('create_layer', {
														points
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
					<div class="toolbar">
						{#each tools as tool (tool.id)}
							<label class="tool-selector" class:active={activeTool.value === tool.id}
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

						{#snippet edgeProps()}
							<input
								type="number"
								class="number-spinner"
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
									['edge', 'style', 'stroke_width', L.valueOr(1)],
									singleSelectedLayer
								)}
							/>
							<span class="color-wrapper"
								><input
									type="color"
									class="color-swatch"
									onchange={(evt) =>
										cast('change_style', {
											layer_id: singleSelectedLayer.value.id,
											type: 'edge',
											attr: 'stroke_color',
											val: evt.currentTarget.value
										})}
									use:bindValue={view(
										['edge', 'style', 'stroke_color', L.valueOr('#000000')],
										singleSelectedLayer
									)}
								/></span
							>

							<input
								type="number"
								class="number-spinner"
								size="4"
								min="0"
								max="1"
								step="0.01"
								onchange={(evt) =>
									cast('change_style', {
										layer_id: singleSelectedLayer.value.id,
										type: 'layer',
										attr: 'opacity',
										val: evt.currentTarget.value
									})}
								use:bindValue={view(['style', 'opacity', L.valueOr(1)], singleSelectedLayer)}
							/>
							<select
								class="attribute-select"
								onchange={(evt) =>
									cast('change_style', {
										layer_id: singleSelectedLayer.value.id,
										type: 'edge',
										attr: 'source_tip_symbol_shape_id',
										val: evt.currentTarget.value
									})}
								use:bindValue={view(
									['edge', 'style', 'source_tip_symbol_shape_id', L.valueOr(''), L.defaults('')],
									singleSelectedLayer
								)}
							>
								{#await data.symbols then symbols}
									<option value="">None</option>
									{#each Array.from(symbols.entries()) as [id, symbol] (id)}
										<option value={id}>{symbol.name}</option>
									{/each}
								{/await}
							</select>
							<select
								class="attribute-select"
								onchange={(evt) =>
									cast('change_style', {
										layer_id: singleSelectedLayer.value.id,
										type: 'edge',
										attr: 'stroke_dash_array',
										val: evt.currentTarget.value
									})}
								use:bindValue={view(
									['edge', 'style', 'stroke_dash_array', L.valueOr('')],
									singleSelectedLayer
								)}
							>
								<option value="">No Dash</option>
								<option value="5 5">5 5</option>
								<option value="10 5">10 5</option>
								<option value="2 2">2 2</option>
							</select>
							<select
								class="attribute-select"
								onchange={(evt) =>
									cast('change_style', {
										layer_id: singleSelectedLayer.value.id,
										type: 'edge',
										attr: 'target_tip_symbol_shape_id',
										val: evt.currentTarget.value
									})}
								use:bindValue={view(
									['edge', 'style', 'target_tip_symbol_shape_id', L.valueOr(''), L.defaults('')],
									singleSelectedLayer
								)}
							>
								{#await data.symbols then symbols}
									<option value="">None</option>
									{#each Array.from(symbols.entries()) as [id, symbol] (id)}
										<option value={id}>x{symbol.name}</option>
									{/each}
								{/await}
							</select>
							<select
								class="attribute-select"
								onchange={(evt) =>
									cast('change_style', {
										layer_id: singleSelectedLayer.value.id,
										type: 'edge',
										attr: 'smoothness',
										val: evt.currentTarget.value
									})}
								use:bindValue={view(
									['edge', 'style', 'smoothness', L.valueOr('linear')],
									singleSelectedLayer
								)}
							>
								<option value="linear">Linear</option>
								<option value="autobezier">Auto Bezier</option>
							</select>
							<select
								class="attribute-select"
								onchange={(evt) =>
									cast('change_style', {
										layer_id: singleSelectedLayer.value.id,
										type: 'edge',
										attr: 'stroke_join',
										val: evt.currentTarget.value
									})}
								use:bindValue={view(
									['edge', 'style', 'stroke_join', L.valueOr('bevel')],
									singleSelectedLayer
								)}
							>
								<option value="bevel">Bevel</option>
								<option value="miter">Miter</option>
								<option value="miter-clip">Miter Clip</option>
								<option value="round">Round</option>
							</select>
							<select
								class="attribute-select"
								onchange={(evt) =>
									cast('change_style', {
										layer_id: singleSelectedLayer.value.id,
										type: 'edge',
										attr: 'stroke_cap',
										val: evt.currentTarget.value
									})}
								use:bindValue={view(
									['edge', 'style', 'stroke_cap', L.valueOr('butt')],
									singleSelectedLayer
								)}
							>
								<option value="butt">Butt</option>
								<option value="square">Square</option>
								<option value="round">Round</option>
							</select>
						{/snippet}
						{#snippet boxProps()}
							<select
								class="attribute-select"
								onchange={(evt) =>
									cast('change_layer_shape', {
										layer_id: singleSelectedLayer.value.id,
										shape_id: evt.currentTarget.value
									})}
								use:bindValue={view(
									['box', 'shape', L.valueOr(''), L.valueOr(''), L.defaults('')],
									singleSelectedLayer
								)}
							>
								{#await data.symbols then symbols}
									<option value="">None</option>
									{#each Array.from(symbols.entries()) as [id, symbol] (id)}
										<option value={id}>{symbol.name}</option>
									{/each}
								{/await}
							</select>
							<span class="color-wrapper"
								><input
									type="color"
									class="color-swatch"
									onchange={(evt) =>
										cast('change_style', {
											layer_id: singleSelectedLayer.value.id,
											type: 'layer',
											attr: 'background_color',
											val: evt.currentTarget.value
										})}
									use:bindValue={view(
										['style', 'background_color', L.valueOr('#70DB93')],
										singleSelectedLayer
									)}
								/></span
							>
							<span class="color-wrapper"
								><input
									type="color"
									class="color-swatch"
									onchange={(evt) =>
										cast('change_style', {
											layer_id: singleSelectedLayer.value.id,
											type: 'layer',
											attr: 'border_color',
											val: evt.currentTarget.value
										})}
									use:bindValue={view(
										['style', 'border_color', L.valueOr('#000000')],
										singleSelectedLayer
									)}
								/></span
							>
							<input
								type="number"
								class="number-spinner"
								size="4"
								min="0"
								max="1"
								step="0.01"
								onchange={(evt) =>
									cast('change_style', {
										layer_id: singleSelectedLayer.value.id,
										type: 'layer',
										attr: 'opacity',
										val: evt.currentTarget.value
									})}
								use:bindValue={view(['style', 'opacity', L.valueOr(1)], singleSelectedLayer)}
							/>
							<select
								class="attribute-select"
								onchange={(evt) =>
									cast('change_style', {
										layer_id: singleSelectedLayer.value.id,
										type: 'layer',
										attr: 'border_dash_array',
										val: evt.currentTarget.value
									})}
								use:bindValue={view(
									['style', 'border_dash_array', L.valueOr('')],
									singleSelectedLayer
								)}
							>
								<option value="">No Dash</option>
								<option value="5 5">5 5</option>
								<option value="10 5">10 5</option>
								<option value="2 2">2 2</option>
							</select>
							<input
								type="number"
								class="number-spinner"
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
						{/snippet}
						{#snippet groupProps()}
							Group
						{/snippet}
						{#snippet textProps()}
							{@const bold = view(['text', 'style', 'bold', L.valueOr(false)], singleSelectedLayer)}
							{@const italic = view(
								['text', 'style', 'italic', L.valueOr(false)],
								singleSelectedLayer
							)}
							{@const underline = view(
								['text', 'style', 'underline', L.valueOr(false)],
								singleSelectedLayer
							)}
							<select
								class="attribute-select"
								onchange={(evt) =>
									cast('change_style', {
										layer_id: singleSelectedLayer.value.id,
										type: 'text',
										attr: 'font_family',
										val: evt.currentTarget.value
									})}
								use:bindValue={view(['text', 'style', 'font_family'], singleSelectedLayer)}
							>
								<option value="serif">Serif</option>
								<option value="sans-serif">Sans-Serif</option>
								<option value="monospace">Monospace</option>
							</select>
							<input
								type="number"
								class="number-spinner"
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

							<label style="white-space: nowrap;"
								><input
									onchange={(evt) =>
										cast('change_style', {
											layer_id: singleSelectedLayer.value.id,
											type: 'text',
											attr: 'bold',
											val: evt.currentTarget.checked
										})}
									type="checkbox"
									bind:checked={bold.value}
								/> Bold</label
							>
							<label style="white-space: nowrap;"
								><input
									type="checkbox"
									onchange={(evt) =>
										cast('change_style', {
											layer_id: singleSelectedLayer.value.id,
											type: 'text',
											attr: 'italic',
											val: evt.currentTarget.checked
										})}
									bind:checked={italic.value}
								/> Italic</label
							>
							<label style="white-space: nowrap;"
								><input
									type="checkbox"
									onchange={(evt) =>
										cast('change_style', {
											layer_id: singleSelectedLayer.value.id,
											type: 'text',
											attr: 'underline',
											val: evt.currentTarget.checked
										})}
									bind:checked={underline.value}
								/> Underline</label
							>
							<label class="attribute-field-label"
								>Text Color <span class="color-wrapper"
									><input
										type="color"
										class="color-swatch"
										onchange={(evt) =>
											cast('change_style', {
												layer_id: singleSelectedLayer.value.id,
												type: 'text',
												attr: 'text_color',
												val: evt.currentTarget.value
											})}
										use:bindValue={view(['text', 'style', 'text_color'], singleSelectedLayer)}
									/></span
								></label
							>
							<select
								class="attribute-select"
								onchange={(evt) =>
									cast('change_style', {
										layer_id: singleSelectedLayer.value.id,
										type: 'text',
										attr: 'alignment',
										val: evt.currentTarget.value
									})}
								use:bindValue={view(['text', 'style', 'alignment'], singleSelectedLayer)}
							>
								<option value="left">Left</option>
								<option value="center">Center</option>
								<option value="right">Right</option>
							</select>

							<textarea
								style="height: 100%; resize: none; min-height: 0; min-width: 10em;"
								rows="1"
								cols="50"
								onchange={(evt) =>
									cast('change_text_body', {
										layer_id: singleSelectedLayer.value.id,
										val: evt.currentTarget.value
									})}
								use:bindValue={view(['text', 'body'], singleSelectedLayer)}
							></textarea>

							<span class="color-wrapper"
								><input
									type="color"
									class="color-swatch"
									onchange={(evt) =>
										cast('change_style', {
											layer_id: singleSelectedLayer.value.id,
											type: 'layer',
											attr: 'background_color',
											val: evt.currentTarget.value
										})}
									use:bindValue={view(
										['style', 'background_color', L.valueOr('#ffffff')],
										singleSelectedLayer
									)}
								/></span
							>
							<span class="color-wrapper"
								><input
									type="color"
									class="color-swatch"
									onchange={(evt) =>
										cast('change_style', {
											layer_id: singleSelectedLayer.value.id,
											type: 'layer',
											attr: 'border_color',
											val: evt.currentTarget.value
										})}
									use:bindValue={view(
										['style', 'border_color', L.valueOr('#000000')],
										singleSelectedLayer
									)}
								/></span
							>
							<input
								type="number"
								class="number-spinner"
								size="4"
								min="0"
								max="1"
								step="0.01"
								onchange={(evt) =>
									cast('change_style', {
										layer_id: singleSelectedLayer.value.id,
										type: 'layer',
										attr: 'opacity',
										val: evt.currentTarget.value
									})}
								use:bindValue={view(['style', 'opacity', L.valueOr(1)], singleSelectedLayer)}
							/>
							<select
								class="attribute-select"
								onchange={(evt) =>
									cast('change_style', {
										layer_id: singleSelectedLayer.value.id,
										type: 'layer',
										attr: 'border_dash_array',
										val: evt.currentTarget.value
									})}
								use:bindValue={view(
									['style', 'border_dash_array', L.valueOr('')],
									singleSelectedLayer
								)}
							>
								<option value="">No Dash</option>
								<option value="5 5">5 5</option>
								<option value="10 5">10 5</option>
								<option value="2 2">2 2</option>
							</select>
							<input
								type="number"
								class="number-spinner"
								size="4"
								min="0"
								onchange={(evt) =>
									cast('change_style', {
										layer_id: singleSelectedLayer.value.id,
										type: 'layer',
										attr: 'border_width',
										val: evt.currentTarget.value
									})}
								use:bindValue={view(['style', 'border_width', L.valueOr('0')], singleSelectedLayer)}
							/>
						{/snippet}
						<div style="display: flex; gap: 1ex; align-items: center;">
							Selected:
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
								none
							{/if}
						</div>
					</div>
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
								{@const visible = view(['hidden', L.complement], el)}
								{@const elType = view(
									L.reread((el) => {
										return el.text ? 'text' : el.edge ? 'edge' : el.box ? 'box' : '';
									}),
									el
								)}
								{@const elSemantic = view(
									['semantic_tag', L.defaults(''), L.reread(R.compose(R.last, R.split('.')))],
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
									<div
										draggable="true"
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
												order: 'below',
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
										onclick={() => update(R.not, selected)}
										style="flex-grow: 1; display: flex; flex-direction: column; align-self: stretch; justify-content: center; box-sizing: border-box;"
									>
										<div style="white-space: nowrap;">
											<span>{elType.value || 'group'}</span>
											<span>{elSemantic.value}</span>
										</div>
										<small
											style="color: #aaa; display: block; max-width: 100%; width:100%; overflow: hidden; text-overflow: ellipsis; word-break: none; white-space: nowrap; box-sizing: border-box;"
											>({elId.value})</small
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
						<hr />
						<div
							role="application"
							draggable={true}
							ondragstart={(evt) => {
								const d = {
									content: {
										shape_id: '3B66E69A-057A-40B9-A1A0-9DB44EF5CE42'
									},
									mimeType: 'application/json+renewex-layer',
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
							<svg class="droppable" viewBox="-4 -4 40 40" width="32">
								<circle fill="#24d188" cx="16" cy="16" r="16" stroke="#047138" stroke-width="2" />
							</svg>
						</div>
						<div
							draggable={true}
							ondragstart={(evt) => {
								const d = {
									content: {
										shape_id: null
									},
									mimeType: 'application/json+renewex-layer',
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
							<svg class="droppable" viewBox="-4 -4 40 40" width="32">
								<rect
									fill="#24d188"
									x="1"
									y="1"
									width="30"
									height="30"
									stroke="#047138"
									stroke-width="2"
								/>
							</svg>
						</div>
						<hr />
						<div
							draggable={true}
							ondragstart={(evt) => {
								const d = {
									content: {
										body: 'Text'
									},
									mimeType: 'application/json+renewex-layer',
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
							<svg class="droppable" viewBox="-4 -4 40 40" width="32">
								<text text-anchor="middle" font-size="40" x="16" y="30" font-family="serif">T</text>
							</svg>
						</div>
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

	.menu-bar-item-button:disabled {
		opacity: 0.3;
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
			[body-start] 0.5ex [top-start left-start] auto [left-end] 1fr[right-start] max(20vw)
			[right-end top-end] 1em [body-end];
		grid-template-rows: [body-start] 0.5ex [top-start] auto [top-end left-start right-start] 1fr auto [left-end right-end] 1em [body-end];
		gap: 0.5em;
		overflow: hidden;
		width: 100vw;

		contain: strict;
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
</style>
