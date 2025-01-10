// Vite Globals
export const APP_NAME = getMeta("env_app_title", import.meta.env.VITE_APP_NAME)
export const BASE_URL = getMeta("env_base_url", import.meta.env.BASE_URL)
export const MODE = import.meta.env.MODE
export const PROD = import.meta.env.PROD
export const DEV = import.meta.env.DEV

export function getMeta(key, fallback) {
	const metaTag = document.querySelector(`meta[name="${key}"][content]`);

	if(metaTag && metaTag.content) {
		return metaTag.content
	} else {
		return fallback;
	}
}

export function getMetas(key, fallback) {
	return Array.prototype.map.call(document.querySelectorAll(`meta[name="${key}"][content]`), (m) => m.content).filter(x => x)
}