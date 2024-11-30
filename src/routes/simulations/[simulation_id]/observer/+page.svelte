<script>
	import * as L from 'partial.lenses';
	import * as R from 'ramda';
	import { base } from '$app/paths';
	import { onMount } from 'svelte';
	import AppBar from '../../../AppBar.svelte';
	import { numberSvgFormat } from '$lib/svg/formatter';

	import LiveResource from '$lib/components/live/LiveResource.svelte';
	import { autofocusIf } from '$lib/reactivity/bindings.svelte';
	import { atom, view, viewCombined, combine, read, call } from '$lib/reactivity/atom.svelte';
	import { choice } from 'partial.lenses';
	import { propEq } from 'ramda';

	import Modal from '$lib/components/modal/Modal.svelte';
	import SVGViewport from '$lib/components/viewport/SVGViewport.svelte';
	import CameraScroller from '$lib/components/viewport/CameraScroller.svelte';

	import {
		frameBoxLens,
		panMovementLens,
		rotateMovementLens,
		zoomMovementLens
	} from '$lib/components/camera/lenses';
	import Navigator from '$lib/components/camera/Navigator.svelte';
	import MountTrigger from '$lib/components/camera/MountTrigger.svelte';

	const { data } = $props();

	const { _ } = $derived(data.commands);

	const currentInstance = atom(null);

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
	const lockRotation = atom(false);


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
			.flatMap(({ l, index }) => {
				const children = walkLayer(doc, l.id, [l.id, ...parents], l.hidden || hidden).map((x, i, a) => ({
					...x,
					isLast: i + 1 === a.length
				}))

				const own_bounding = L.get([L.cond(
									[R.prop("box"), ['box', L.pick({
										minX: 'position_x',
										minY: 'position_y',
										maxX: [L.props('position_x', 'width'), L.foldTraversalLens(L.sum, L.values)],
										maxY: [L.props('position_y', 'height'), L.foldTraversalLens(L.sum, L.values)],
									})]],
									[R.prop('text'), ['text', L.pick({
										minX: 'position_x',
										minY: 'position_y',
										maxX: 'position_x',
										maxY: 'position_y',
									})]],
									[R.prop("edge"), ['edge', L.pick({
										minX: L.foldTraversalLens(L.minimum, L.branch({
										source_x: L.identity,
										target_x: L.identity,
										waypoints: [L.elems, 'x']
									})),
										minY: L.foldTraversalLens(L.minimum, L.branch({
										source_y: L.identity,
										target_y: L.identity,
										waypoints: [L.elems, 'y']
									})),
										maxX: L.foldTraversalLens(L.maximum, L.branch({
										source_x: L.identity,
										target_x: L.identity,
										waypoints: [L.elems, 'x']
									})),
										maxY: L.foldTraversalLens(L.maximum, L.branch({
										source_y: L.identity,
										target_y: L.identity,
										waypoints: [L.elems, 'y']
									})),
									})]],
								)], l)

				const deep_bounding = children.reduce(({minX: AccminX,
					minY: AccminY,
					maxX: AccmaxX,
					maxY: AccmaxY}, {deep_bounding: {minX,
					minY,
					maxX,
					maxY}}) => ({
						minX: Math.min(minX, AccminX),
						minY: Math.min(minY, AccminY),
						maxX: Math.max(maxX, AccmaxX),
						maxY: Math.max(maxY, AccmaxY),
					}), own_bounding)

				return [
					{ id: l.id, index, depth: parents.length, parents, hidden: l.hidden || hidden, has_children: children.length > 0, own_bounding, deep_bounding},
					...children
				]
			});
	}

	function walkDocument(doc) {
		return [...walkLayer(doc, null, [], false)];
	}

	const cameraJson = view(L.inverse(L.json({ space: '  ' })), camera);

	let cameraScroller = atom(undefined);
</script>

<div class="full-page">
	<AppBar authState={data.authState} />

	<LiveResource socket={data.live_socket} resource={data.simulation}>
		{#snippet children(simulation, presence, { dispatch, cast })}
			{@const nets = view(['shadow_net_system', 'content', 'nets'], simulation)}
			{@const net_instances = view('net_instances', simulation)}
			{@const current_net = viewCombined(
				L.choices(
					L.choose(({ currentInstance }) => [
					'net_instances',
					L.find(R.propEq(currentInstance, 'id')),
					'shadow_net_id'
				]),
					['net_instances', 0, 'shadow_net_id']
				),
				{ net_instances, currentInstance }
			)}


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
											alert('the document is saved automatically');
										}}>Save</button
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
						Net Instance:
						<select bind:value={currentInstance.value}>
							<option value={null}>---</option>

							{#each nets.value as nt}
								{@const this_instances = view(
									L.filter(R.propEq(nt.id, 'shadow_net_id')),
									net_instances
								)}
								<optgroup label={nt.name}>
									{#each this_instances.value as ni}
										<option value={ni.id}>{ni.label}</option>
									{/each}
								</optgroup>
							{/each}
						</select>

						{currentInstance.value}
					</div>
				</div>

				<div class="body">
					{#await data.shadow_net_system then sns}
						{@const doc = view(
							(id) => R.find((n) => n.id === id, sns.nets)?.document,
							current_net
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
									})
								],
								doc
							)}


					{#if doc.value}

					<CameraScroller bind:this={cameraScroller.value} {camera} {extension}>
							<SVGViewport
								{camera}
							>
								<Navigator
									{camera}
									{lockRotation}
									{frameBoxPath}
								>
									{#snippet children(liveLenses, navigationActions)}
										<rect x="0" y="0" width="100" height="100"></rect>
										<rect
											transform={rotationTransform.value}
											fill="#fff"
											stroke="#eee"
											stroke-width="5"
											{...current_net.value.viewbox}
										/>


										<g transform={rotationTransform.value}>
											<g id="full-document-{current_net.value.id}">
												{#each layersInOrder.value as { index, id, depth, hidden } (id)}
													{#if !hidden}
														{@const el = view(
															['layers', 'items', L.find((el) => el.id == id)],
															current_net
														)}


														{#if el.value?.box}
															<g
																role="button"
																tabindex="-1"
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
																	tabindex="-1"
																>
																	<TextElement bbox={thisbbox} el={el.value} />
																</g>
															{/key}
														{/if}
														{#if el.value?.edge}
															<g
																role="button"
																tabindex="-1"
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
					{/if}
					{/await}

				</div>

				<div class="sidebar right">
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
									current_net
								)}
								<textarea> {JSON.stringify(currentDoc.value, null, '  ')}</textarea>
							{/await}
						</details>
					</div>
				</div>

				<div class="sidebar left">
					<div class="toolbar vertical">
						Time: {simulation.value.timestep}

						<button type="button" onclick={(evt) => {
							evt.preventDefault()

							cast('init')
						}}>init</button>

						<button type="button" onclick={(evt) => {
							evt.preventDefault()

							cast('terminate')
						}}>terminate</button>

						<button type="button" onclick={(evt) => {
							evt.preventDefault()

							cast('step')
						}}>Step</button>
					</div>
				</div>
			</div>
		{/snippet}
	</LiveResource>
</div>

<style>
	textarea {
		width: 100%;
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
			[body-start] 0.5ex [top-start left-start] auto [left-end] 1fr[right-start] max(20vw)
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
</style>
