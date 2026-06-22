import { load as loadDocumentWorkspaceData } from '$lib/api/document_workspace_data.js';
import { loadSimulationWorkbenchData } from '$lib/api/simulation_workbench_data.js';
import authState from '$lib/components/auth/local_state.svelte.js';
import documentApi from '$lib/api/documents.js';
import simulationApi from '$lib/api/simulations.js';

function simulationDocumentIds(simulationData) {
	const ids =
		simulationData?.simulation?.content?.document_ids ??
		simulationData?.simulation?.document_ids ??
		simulationData?.simulation?.content?.documents;

	return Array.isArray(ids) ? ids.filter((id) => typeof id === 'string' && id) : [];
}

function simulationName(simulationData, fallback) {
	const simulation = simulationData?.simulation;
	return (
		simulation?.content?.name ??
		simulation?.content?.label ??
		simulation?.name ??
		simulation?.label ??
		fallback
	);
}

function documentEvent(event, documentId) {
	return {
		...event,
		params: {
			...event.params,
			document_id: documentId
		}
	};
}

function listItems(response) {
	return response?.items ?? response?.content?.items ?? [];
}

async function workspaceKind(event, workspaceId) {
	const { project } = await event.parent();
	const documents = documentApi(event.fetch, authState.routes, authState.authHeader);
	const simulations = simulationApi(event.fetch, authState.routes, authState.authHeader);
	const [documentList, simulationList] = await Promise.allSettled([
		documents.listDocuments(project.links.documents.href),
		simulations.listSimulations(project.links.simulations.href)
	]);

	if (
		documentList.status === 'fulfilled' &&
		listItems(documentList.value).some((document) => document?.id === workspaceId)
	) {
		return 'document';
	}

	if (
		simulationList.status === 'fulfilled' &&
		listItems(simulationList.value).some((simulation) => simulation?.id === workspaceId)
	) {
		return 'simulation';
	}

	return 'unknown';
}

export async function load(event) {
	const workspaceId = event.params.document_id;
	const kind = await workspaceKind(event, workspaceId).catch(() => 'unknown');

	if (kind === 'document') {
		const documentData = await loadDocumentWorkspaceData(event);
		return {
			...documentData,
			workspaceType: 'document'
		};
	}

	if (kind === 'simulation') {
		const simulationData = await loadSimulationWorkbenchData(event.fetch, workspaceId);
		const [documentId] = simulationDocumentIds(simulationData);

		if (documentId) {
			try {
				const documentData = await loadDocumentWorkspaceData(documentEvent(event, documentId));
				return {
					...documentData,
					workspaceType: 'document',
					initialSimulation: {
						id: workspaceId,
						name: simulationName(simulationData, workspaceId),
						href: `/projects/${event.params.project_id}/workspace/${workspaceId}`
					}
				};
			} catch (_) {
				// A simulation can exist without an editable source drawing. In that case the
				// embedded simulation workspace below keeps the URL usable.
			}
		}

		return {
			...simulationData,
			workspaceType: 'simulation'
		};
	}

	try {
		const documentData = await loadDocumentWorkspaceData(event);
		return {
			...documentData,
			workspaceType: 'document'
		};
	} catch (_) {
		const simulationData = await loadSimulationWorkbenchData(event.fetch, workspaceId);
		return {
			...simulationData,
			workspaceType: 'simulation'
		};
	}
}

export const ssr = false;
