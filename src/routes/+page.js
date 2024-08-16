import { redirect } from '@sveltejs/kit';

export const ssr = false;

export async function load(x) {
	return new Promise(
		(resolver) => {
			resolver({authed: localStorage.getItem("authed")})
		}
	)
}