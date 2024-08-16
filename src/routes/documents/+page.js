import { redirect } from '@sveltejs/kit';

export const ssr = false;

export async function load(x) {
	return new Promise(
		(resolver) => {
			if(localStorage.getItem("authed")){
				resolver({documents: [1,2,3]})
			} else {
				resolver(redirect(307, '/auth'))
			}
		}
	)
}