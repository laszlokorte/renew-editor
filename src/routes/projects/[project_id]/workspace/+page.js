import { loadProjectWorkspaceData } from '$lib/api/project_workspace_data.js';

export const ssr = false;

export const load = loadProjectWorkspaceData;
