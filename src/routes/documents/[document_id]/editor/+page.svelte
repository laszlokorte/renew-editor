<script>
	import { base } from '$app/paths';
	import {
		view,
		atom,
		update,
		combine,
		read,
		failableView,
		call
	} from '$lib/reactivity/atom.svelte';
	import { bindValue } from '$lib/reactivity/bindings.svelte.js';
	import { numberSvgFormat } from '$lib/svg/formatter';
	import AppBar from '../../../AppBar.svelte';

	import SVGViewport from '$lib/components/viewport/SVGViewport.svelte';
	import CameraScroller from '$lib/components/viewport/CameraScroller.svelte';
	import CanvasDropper from '$lib/components/dragdrop/CanvasDropper.svelte';
	import LiveResource from '$lib/components/live/LiveResource.svelte';
	import { buildPath } from './symbols';
	import Symbol from './Symbol.svelte';
	import TextElement from './TextElement.svelte';

	import * as L from 'partial.lenses';
	import * as R from 'ramda';
	import Minimap from '$lib/components/editor/overlays/minimap/Minimap.svelte';

	import {
		frameBoxLens,
		panMovementLens,
		rotateMovementLens,
		zoomMovementLens
	} from '$lib/components/camera/lenses';
	import Navigator from '$lib/components/camera/Navigator.svelte';

	const { data } = $props();

	const textBounds = atom({});
	const showMinimap = atom(true);
	const showDebug = atom(true);

	const cameraSettings = atom({
		plane: {
			autosize: true,
			x: 1000,
			y: 1000
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
	const frameBoxPath = read([frameBoxLens, 'screenSpaceAligned', boxPathLens], camera);

	const cameraRotationTransformLens = L.reread(
		(c) => `rotate(${c.focus.w}, ${c.focus.x}, ${c.focus.y})`
	);

	const cameraRotationInverseTransformLens = L.reread(
		(c) => `rotate(${-c.focus.w}, ${c.focus.x}, ${c.focus.y})`
	);

	const cameraScaleTransformLens = L.reread((c) => `scale(${Math.exp(-c.focus.z)})`);

	const scaleTransform = read(cameraScaleTransformLens, camera);
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
		source: function (edge) {
			const waypointX = edge.waypoints.length ? edge.waypoints[0].x : edge.target_x;
			const waypointY = edge.waypoints.length ? edge.waypoints[0].y : edge.target_y;

			return (Math.atan2(edge.source_y - waypointY, edge.source_x - waypointX) * 180) / Math.PI;
		},
		target: function (edge) {
			const waypointX = edge.waypoints.length
				? edge.waypoints[edge.waypoints.length - 1].x
				: edge.source_x;
			const waypointY = edge.waypoints.length
				? edge.waypoints[edge.waypoints.length - 1].y
				: edge.source_y;

			return (Math.atan2(edge.target_y - waypointY, edge.target_x - waypointX) * 180) / Math.PI;
		}
	};

	const edgePath = {
		linear: function (edge) {
			const waypoints = edge.waypoints.map(({ x, y }) => `L ${x} ${y}`).join(' ');

			return `M ${edge.source_x} ${edge.source_y} ${waypoints} L ${edge.target_x} ${edge.target_y}`;
		},
		autobezier: function (edge) {
			switch (edge.waypoints.length) {
				case 0:
					return `M ${edge.source_x} ${edge.source_y} L ${edge.target_x} ${edge.target_y}`;
				case 1:
					return `M ${edge.source_x} ${edge.source_y}  Q ${edge.waypoints[0].x} ${edge.waypoints[0].y} ${edge.target_x} ${edge.target_y}`;
				default:
					const points = [{ x: edge.source_x, y: edge.source_y }, ...edge.waypoints];
					let path = '';
					for (let i = 0; i < edge.waypoints.length; i++) {
						const x1 = points[i].x;
						const y1 = points[i].y;
						const x2 = points[i + 1].x;
						const y2 = points[i + 1].y;
						path += `Q ${x1} ${y1} ${(x2 + x1) / 2} ${(y2 + y1) / 2}`;
					}
					const waypoints = [{ x: edge.source_x, y: edge.source_y }, ...edge.waypoints];

					return `M ${edge.source_x} ${edge.source_y} ${path} T ${edge.target_x} ${edge.target_y}`;
			}
		}
	};

	function walkLayer(doc, parent, depth) {
		return doc.layers.items
			.map((l, index) => ({ l, index }))
			.filter(({ l }) => l.parent_id === parent)
			.flatMap(({ l, index }) => [{ id: l.id, index, depth }, ...walkLayer(doc, l.id, depth + 1)]);
	}

	function walkDocument(doc) {
		return [...walkLayer(doc, null, 0)];
	}

	const cameraJson = view(L.inverse(L.json({ space: '  ' })), camera);

	let cameraScroller = atom(undefined);
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
			<header class="header">
				<div class="header-titel">
					<a href="{base}/documents" title="Back">Back</a>

					<h2>Document: {doc.value.name}</h2>
				</div>

				<menu class="header-menu">
					<ol class="menu-bar">
						<li class="menu-bar-item" tabindex="-1">
							File
							<ul class="menu-bar-menu">
								<li class="menu-bar-menu-item">
									<button class="menu-bar-item-button">Save</button>
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
									<button class="menu-bar-item-button">Undo</button>
								</li>
								<li class="menu-bar-menu-item">
									<button class="menu-bar-item-button">Redo</button>
								</li>
								<li class="menu-bar-menu-item">
									<button class="menu-bar-item-button">Select</button>
								</li>
								<li class="menu-bar-menu-item">
									<button class="menu-bar-item-button" style="color: #aa0000">Delete</button>
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
										}}>Reset Camera</button
									>
								</li>
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
								<li class="menu-bar-menu-item"><hr class="menu-bar-menu-ruler" /></li>
								<li class="menu-bar-menu-item">
									<button
										class="menu-bar-item-button"
										onclick={() => {
											update(R.not, showMinimap);
										}}>Toggle Minimap</button
									>
								</li>
								<li class="menu-bar-menu-item">
									<button
										class="menu-bar-item-button"
										onclick={() => {
											update(R.not, showDebug);
										}}>Toggle Debug</button
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
									<button class="menu-bar-item-button">Website</button>
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
								shape_id: content.shape_id
							});
						}}
					>
						<CameraScroller bind:this={cameraScroller.value} {camera} {extension}>
							<SVGViewport
								{camera}
								onclick={(evt) => {
									selectedLayers.value = [];
									cast('select', null);
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
									<rect
										transform={rotationTransform.value}
										fill="#fff"
										stroke="#eee"
										stroke-width="5"
										{...doc.value.viewbox}
									/>
									<g transform={rotationTransform.value}>
										<g id="full-document-{data.document.id}">
											{#each layersInOrder.value as { index, id, depth } (id)}
												{@const el = view(['layers', 'items', L.find((el) => el.id == id)], doc)}

												{@const thisbbox = view(L.prop(el.value?.id), textBounds)}
												{#if el.value?.box && !el.value?.hidden}
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
															box={{
																x: el.value?.box.position_x,
																y: el.value?.box.position_y,
																width: el.value?.box.width,
																height: el.value?.box.height
															}}
														/>
													</g>
												{/if}
												{#if el.value?.text && !el.value?.hidden}
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
												{#if el.value?.edge && !el.value?.hidden}
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
																el.value?.edge
															)}
															pointer-events="stroke"
															fill="none"
															stroke="none"
															stroke-width={(el.value?.edge?.style?.stroke_width ?? 1) * 1 + 10}
														/>
														<path
															d={edgePath[el.value?.edge?.style?.smoothness ?? 'linear'](
																el.value?.edge
															)}
															stroke-dasharray={el.value?.edge?.style?.stroke_dash_array ?? ''}
															fill="none"
														/>

														{#if el.value?.edge?.style?.source_tip_symbol_shape_id}
															{@const source_angle = edgeAngle['source'](el.value?.edge)}
															{@const size = el.value?.edge?.style?.stroke_width ?? 1}

															<g
																fill={el.value?.style?.background_color ?? 'black'}
																transform="rotate({source_angle} {el.value?.edge.source_x} {el.value
																	?.edge.source_y})"
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
															{@const target_angle = edgeAngle['target'](el.value?.edge)}
															{@const size = el.value?.edge?.style?.stroke_width ?? 1}
															<g
																fill={el.value?.style?.background_color ?? 'black'}
																transform="rotate({target_angle} {el.value?.edge.target_x} {el.value
																	?.edge.target_y})"
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
											{/each}
										</g>
									</g>
									<g transform={rotationTransform.value}>
										{#each selectedLayers.value as id (id)}
											{@const el = view(['layers', 'items', L.find((el) => el.id == id)], doc)}
											{#if el.value?.box && !el.value?.hidden}
												<rect
													class="selected"
													x={el.value?.box.position_x}
													y={el.value?.box.position_y}
													width={el.value?.box.width}
													height={el.value?.box.height}
												></rect>
											{/if}
											{#if el.value?.text && !el.value?.hidden}
												{@const bbox = view(L.prop(el.value?.id), textBounds)}

												<rect
													class="selected"
													x={bbox.value.x}
													y={bbox.value.y}
													width={bbox.value.width}
													height={bbox.value.height}
												></rect>
											{/if}
											{#if el.value?.edge && !el.value?.hidden}
												<path
													class="selected"
													d={edgePath[el.value?.edge?.style?.smoothness ?? 'linear'](
														el.value?.edge
													)}
													stroke="black"
													fill="none"
													stroke-width={(el.value?.edge?.style?.stroke_width ?? 1) * 1 + 4}
												/>

												{#if el.value?.edge?.style?.source_tip_symbol_shape_id}
													{@const source_angle = edgeAngle['source'](el.value?.edge)}
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
																	/>
																{/each}
															{/if}
														{/await}
													</g>
												{/if}

												{#if el.value?.edge?.style?.target_tip_symbol_shape_id}
													{@const target_angle = edgeAngle['target'](el.value?.edge)}
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
																	/>
																{/each}
															{/if}
														{/await}
													</g>
												{/if}
											{/if}
										{/each}
									</g>

									<g transform={rotationTransform.value}>
										{#each presence.value as { data: { cursors, color, username, selections } }}
											<g style:--selection-color={color}>
												{#each selections.filter(({ self }) => !self) as { value: id }}
													{@const el = view(['layers', 'items', L.find((el) => el.id == id)], doc)}
													{#if el.value?.box && !el.value?.hidden}
														<rect
															class="selected"
															x={el.value?.box.position_x}
															y={el.value?.box.position_y}
															width={el.value?.box.width}
															height={el.value?.box.height}
														></rect>
													{/if}
													{#if el.value?.text && !el.value?.hidden}
														{@const bbox = view(L.prop(el.value?.id), textBounds)}

														<rect
															class="selected"
															x={bbox.value.x}
															y={bbox.value.y}
															width={bbox.value.width}
															height={bbox.value.height}
														></rect>
													{/if}
													{#if el.value?.edge && !el.value?.hidden}
														<path
															class="selected"
															d={edgePath[el.value?.edge?.style?.smoothness ?? 'linear'](
																el.value?.edge
															)}
															stroke="black"
															fill="none"
															stroke-width={(el.value?.edge?.style?.stroke_width ?? 1) * 1 + 4}
														/>

														{#if el.value?.edge?.style?.source_tip_symbol_shape_id}
															{@const source_angle = edgeAngle['source'](el.value?.edge)}
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
																			/>
																		{/each}
																	{/if}
																{/await}
															</g>
														{/if}

														{#if el.value?.edge?.style?.target_tip_symbol_shape_id}
															{@const target_angle = edgeAngle['target'](el.value?.edge)}
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
																			/>
																		{/each}
																	{/if}
																{/await}
															</g>
														{/if}
													{/if}
												{/each}
											</g>
											{#each cursors.filter(({ self, value }) => !self && value) as { value: cursor }}
												<path
													transform="translate({cursor.x} {cursor.y}) rotate({-camera.value.focus
														.w} 0 0) {scaleTransform.value}
												"
													d="M0 0 v 24 l 6 -6 h 10"
													fill={color}
												/>
											{/each}
										{/each}
									</g>
								</Navigator>
							</SVGViewport>
						</CameraScroller>
					</CanvasDropper>
				</div>
				<div class="topbar">
					<div class="toolbar">
						<button class="tool-button">Select</button>
						<button class="tool-button">Connect</button>
						<button class="tool-button">Draw</button>
						<hr />
						<select class="attribute-select">
							<option>Font</option>
						</select>
						<select class="attribute-select">
							<option>Stroke</option>
						</select>
						<hr />
						<label class="color-wrapper"><input type="color" name="" value="#ff0066" /></label>
						<label class="color-wrapper"><input type="color" name="" value="#6600ff" /></label>
						<input type="range" name="" style="width: 10em" />
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
						<input style="" type="search" name="" placeholder="search" />
						<select multiple size="5" bind:value={selectedLayers.value}>
							{#each layersInOrder.value as { index, id, depth } (id)}
								{@const el = view(['layers', 'items', L.find((el) => el.id == id)], doc)}
								{@const elId = view('id', el)}
								{@const elType = view(
									L.reread((el) => {
										return el.text ? 'text' : el.edge ? 'edge' : el.box ? 'box' : '';
									}),
									el
								)}
								<option value={id}
									>{Array(depth).fill('-').join('')}
									{elType.value}
									({elId.value})
								</option>
							{/each}
						</select>
					</div>
					{#if showDebug.value}
						<div class="toolbar vertical">
							Debug Document
							<hr />
							<textarea use:bindValue={view(L.inverse(L.json({ space: '  ' })), doc)}></textarea>
							Debug Camera
							<hr />
							<textarea bind:value={cameraJson.value}></textarea>
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
						<div draggable={true}>
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

	h2 {
		margin: 0;
		white-space: nowrap;
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
		box-sizing: border-box;
		font: inherit;
		height: 100%;
		box-sizing: border-box;
		padding: 1ex 1em;
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
		pointer-events: none;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	text.selected {
		stroke: var(--selection-color, #7af);
		fill: var(--selection-color, #7af);
		stroke-width: 5;
		pointer-events: none;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	path.selected {
		stroke: var(--selection-color, #7af);
		pointer-events: none;
		stroke-linecap: round;
		stroke-linejoin: round;
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
</style>
