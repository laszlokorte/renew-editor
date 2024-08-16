export const ssr = false

export function load({ params }) {
	if(parseInt(params.document_id, 10) > 100) {
		throw new Error("x")
	}
	return {
		document: {
			id: params.document_id,
		}
	}
}