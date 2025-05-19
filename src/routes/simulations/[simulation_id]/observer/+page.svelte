<script>
	import * as L from 'partial.lenses';
	import * as R from 'ramda';
	import { base } from '$app/paths';
	import { onMount } from 'svelte';
	import AppBar from '../../../AppBar.svelte';
	import { numberSvgFormat } from '$lib/svg/formatter';

	import LiveResource from '$lib/components/live/LiveResource.svelte';
	import { autofocusIf } from '$lib/reactivity/bindings.svelte';
	import {
		atom,
		view,
		viewCombined,
		combine,
		read,
		call,
		update,
		readCombined
	} from '$lib/reactivity/atom.svelte';
	import { choice } from 'partial.lenses';
	import { propEq } from 'ramda';

	import Modal from '$lib/components/modal/Modal.svelte';
	import SVGViewport from '$lib/components/viewport/SVGViewport.svelte';
	import CameraScroller from '$lib/components/viewport/CameraScroller.svelte';
	import Minimap from '$lib/components/editor/overlays/minimap/Minimap.svelte';

	import { buildPath, buildCoord } from '$lib/components/renew/symbols';
	import Symbol from '$lib/components/renew/Symbol.svelte';
	import TextElement from '$lib/components/renew/TextElement.svelte';
	import { edgeAngle, edgePath } from '$lib/components/renew/edges.js';
	import { walkDocument } from '$lib/components/renew/document.js';

	import {
		frameBoxLens,
		panMovementLens,
		rotateMovementLens,
		zoomMovementLens
	} from '$lib/components/camera/lenses';
	import Navigator from '$lib/components/camera/Navigator.svelte';
	import MountTrigger from '$lib/components/camera/MountTrigger.svelte';
	import { preventDefault } from 'svelte/legacy';

	const { data } = $props();

	const currentInstance = atom(null);
	const textBounds = atom({});
	const expandedPlaces = atom({});

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
	const lockRotation = atom(false);

	const cameraJson = view(L.inverse(L.json({ space: '  ' })), camera);

	let cameraScroller = atom(undefined);

	const logLens = (base) =>
		L.lens(
			(x) => Math.log(x) / Math.log(base),
			(y) => Math.pow(base, y)
		);

	const showDebug = atom(false);
	const showInstances = atom(true);
	const showLog = atom(false);
	const showMinimap = atom(true);
	const showGrid = atom(false);
	const gridDistance = atom(32);
	const gridDistanceExp = view(logLens(2), gridDistance);
</script>

<div class="full-page">
	<AppBar authState={data.authState} connectionState={data.connectionState} />

	<LiveResource socket={data.live_socket} resource={data.simulation}>
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
					<a href="{base}/simulations" title="Back" class="nav-link">Back</a>

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
											cameraZoom.value = 0;
										}}>Reset Zoom</button
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
											cameraRotation.value = 0;
										}}>Reset Rotation</button
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
								}}>init</button
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
																	onclick={(evt) => {
																		evt.preventDefault();
																		update((x) => !x, expanded);
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
																		fill="none"
																		stroke="none"
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
																			L.get('waypoints', el.value?.edge)
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

											<g transform={rotationTransform.value}>
												<LiveResource socket={data.live_socket} resource={current_instance.value}>
													{#snippet children(instance, _presence, {})}
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
															<text
																{...pos.value}
																text-anchor="middle"
																class="place-tokens"
																onclick={(evt) => {
																	evt.preventDefault();
																	update((x) => !x, expanded);
																}}
																class:tokenCount={!expanded.value}
															>
																{#if expanded.value}
																	{#each tokens as token, ti (token.id)}
																		{#if ti > 0}
																			<tspan>; </tspan>
																		{/if}

																		{#if R.match(/^\w+\[\d+\]$/, token.value).length}
																			<tspan
																				cursor="pointer"
																				text-decoration="underline"
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
																{:else}
																	{tokens.length || 0}
																{/if}
															</text>
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

												<LiveResource socket={data.live_socket} resource={current_instance.value}>
													{#snippet children(instance, _presence, {})}
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
																						<u
																							style="cursor: pointer;"
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
																							}}>{t.value}</u
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
						{/if}
						{#if showInstances.value}
							<div class="toolbar vertical">
								<label>
									Net Instances:
									<select
										bind:value={currentInstance.value}
										size="10"
										style="height: 12em; width: 100%;"
									>
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
								{#await data.log_entries then entries}
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
		z-index: 100;
		display: grid;
		grid-template-columns:
			[body-start] 0.5ex [top-start left-start] auto [left-end] 1fr[right-start] max(30vw)
			[right-end top-end] 1em [body-end];
		grid-template-rows: [body-start] 0.5ex [top-start] auto [top-end left-start right-start] 1fr auto [left-end right-end] 1em [body-end];
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
	}

	@keyframes transition-fade-out {
		from {
			opacity: 1;
		}

		to {
			opacity: 0;
		}
	}
</style>
