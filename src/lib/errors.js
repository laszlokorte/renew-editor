const DEFAULT_FALLBACK_MESSAGE = 'The operation could not be completed.';

const STATUS_MESSAGES = {
	400: {
		title: 'Invalid Request',
		message: 'PetriStation could not process the request.'
	},
	401: {
		title: 'Login Required',
		message: 'Your session is missing or has expired.'
	},
	403: {
		title: 'Access Denied',
		message: 'You do not have permission to access this resource.'
	},
	404: {
		title: 'Not Found',
		message: 'The requested resource could not be found.'
	},
	409: {
		title: 'Conflict',
		message: 'The requested change conflicts with the current state.'
	},
	422: {
		title: 'Invalid Input',
		message: 'The submitted data could not be accepted.'
	},
	503: {
		title: 'Server Unavailable',
		message: 'PetriStation could not reach the server.'
	},
	504: {
		title: 'Server Timeout',
		message: 'The server did not answer in time.'
	}
};

const SERVER_ERROR_MESSAGES = {
	copy_failed: 'Copying the selection failed.',
	paste_failed: 'Pasting the copied figures failed.',
	invalid_rnw: 'The drawing could not be converted to Renew format.',
	export_rnw: 'The drawing could not be exported as Renew file.',
	not_found: 'The requested resource could not be found.',
	not_valid: 'The requested command is not valid in the current context.',
	cyclic_hierarchy: 'The command would create a cyclic hierarchy.',
	unauthenticated: 'Your session is missing or has expired.',
	forbidden: 'You do not have permission to perform this action.'
};

function compactText(value) {
	return typeof value === 'string' ? value.trim() : '';
}

function normalizeMessage(value) {
	const message = compactText(value);

	if (!message) {
		return '';
	}

	if (SERVER_ERROR_MESSAGES[message]) {
		return SERVER_ERROR_MESSAGES[message];
	}

	if (/^[a-z0-9_]+$/.test(message)) {
		return message.replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase()) + '.';
	}

	return message;
}

function formatPayloadValue(value) {
	const direct = normalizeMessage(value);
	if (direct) {
		return direct;
	}

	if (Array.isArray(value)) {
		return value.map(formatPayloadValue).filter(Boolean).join(', ');
	}

	if (value && typeof value === 'object') {
		return Object.entries(value)
			.map(([key, nested]) => {
				const formatted = formatPayloadValue(nested);
				return formatted ? `${key}: ${formatted}` : '';
			})
			.filter(Boolean)
			.join(', ');
	}

	return '';
}

export function extractServerMessage(payload) {
	if (!payload) {
		return '';
	}

	if (typeof payload === 'string') {
		return payload;
	}

	if (payload instanceof Error) {
		return payload.message;
	}

	const direct = normalizeMessage(payload.message) || normalizeMessage(payload.reason);
	if (direct) {
		return direct;
	}

	if (payload.error && typeof payload.error === 'string') {
		return normalizeMessage(payload.error);
	}

	if (payload.errors?.detail) {
		return formatPayloadValue(payload.errors.detail);
	}

	if (payload.errors) {
		return formatPayloadValue(payload.errors);
	}

	if (payload.detail) {
		return formatPayloadValue(payload.detail);
	}

	return '';
}

function describeHttpStatus(status) {
	if (STATUS_MESSAGES[status]) {
		return STATUS_MESSAGES[status];
	}

	if (status >= 500) {
		return {
			title: 'Server Error',
			message: 'The server encountered an unexpected problem.'
		};
	}

	if (status >= 400) {
		return {
			title: 'Request Failed',
			message: 'The request could not be completed.'
		};
	}

	return {
		title: 'Error',
		message: 'The operation could not be completed.'
	};
}

function withOperationContext(description, fallbackMessage) {
	const operationMessage = compactText(fallbackMessage);

	if (
		!operationMessage ||
		operationMessage === DEFAULT_FALLBACK_MESSAGE ||
		operationMessage === description.message
	) {
		return description;
	}

	return {
		...description,
		message: operationMessage,
		detail: [description.message, description.detail].filter(Boolean).join('\n\n')
	};
}

function describeErrorWithoutContext(error, fallbackMessage) {
	if (!error) {
		return {
			kind: 'unknown',
			title: 'Error',
			message: fallbackMessage,
			detail: '',
			status: null
		};
	}

	if (typeof error === 'string') {
		return {
			kind: 'message',
			title: 'Error',
			message: error,
			detail: '',
			status: null
		};
	}

	if (error.body?.title && error.body?.message) {
		return {
			kind: error.body.kind ?? 'described',
			title: error.body.title,
			message: error.body.message,
			detail: error.body.detail ?? '',
			status: error.body.status ?? error.status ?? null
		};
	}

	if (error.title && error.message) {
		return {
			kind: error.kind ?? 'described',
			title: error.title,
			message: error.message,
			detail: error.detail ?? '',
			status: error.status ?? null
		};
	}

	if (error.error === 'auth') {
		const status = error.status ?? error.original?.status ?? null;
		const serverMessage =
			extractServerMessage(error.body) ||
			extractServerMessage(error.original) ||
			extractServerMessage(error);

		return {
			kind: 'auth',
			title: 'Login Failed',
			message: serverMessage || 'PetriStation could not log you in.',
			detail: '',
			status
		};
	}

	const status = error.status ?? error.original?.status ?? null;
	const serverMessage =
		extractServerMessage(error.body) ||
		extractServerMessage(error.original) ||
		extractServerMessage(error);

	if (error.error === 'link') {
		return {
			kind: 'missing-link',
			title: 'Missing Data',
			message: serverMessage || fallbackMessage,
			detail: 'The server response did not contain the link PetriStation needed.',
			status
		};
	}

	if (error.error === 'network') {
		return {
			kind: 'network',
			title: 'Connection Problem',
			message: 'PetriStation could not reach the server.',
			detail: serverMessage,
			status
		};
	}

	if (error.error === 'json') {
		return {
			kind: 'server-response',
			title: 'Unexpected Server Response',
			message: 'The server answered, but PetriStation could not read the response.',
			detail: serverMessage,
			status
		};
	}

	if (error.error === 'http' || status) {
		const statusDescription = describeHttpStatus(Number(status));
		const explicitDetail =
			formatPayloadValue(error.detail) ||
			formatPayloadValue(error.original?.detail) ||
			formatPayloadValue(error.body?.detail);

		return {
			kind: 'http',
			title: statusDescription.title,
			message: serverMessage || statusDescription.message,
			detail:
				explicitDetail ||
				(serverMessage && serverMessage !== statusDescription.message ? statusDescription.message : ''),
			status
		};
	}

	if (error.type === 'channel error' || error.type === 'channel join error') {
		return {
			kind: 'connection',
			title: 'Connection Problem',
			message: 'The live connection to the document could not be established.',
			detail: serverMessage,
			status: null
		};
	}

	if (error.error || error.reason) {
		return {
			kind: 'server',
			title: 'Operation Failed',
			message: serverMessage || fallbackMessage,
			detail: '',
			status
		};
	}

	return {
		kind: 'unknown',
		title: 'Error',
		message: serverMessage || fallbackMessage,
		detail: '',
		status
	};
}

export function describeError(error, fallbackMessage = DEFAULT_FALLBACK_MESSAGE) {
	return withOperationContext(describeErrorWithoutContext(error, fallbackMessage), fallbackMessage);
}

export function publishError(error, fallbackMessage = DEFAULT_FALLBACK_MESSAGE) {
	const description = describeError(error, fallbackMessage);

	if (typeof window !== 'undefined') {
		window.dispatchEvent(new CustomEvent('petristation:error', { detail: description }));
	}

	return description;
}

export function formatErrorMessage(error, fallbackMessage) {
	const description = describeError(error, fallbackMessage);
	const prefix = description.status ? `${description.title} (${description.status})` : description.title;

	return [prefix, description.message].filter(Boolean).join(': ');
}

export function errorPageBody(error, fallbackMessage) {
	const description = describeError(error, fallbackMessage);

	return {
		title: description.title,
		message: description.message,
		detail: description.detail,
		kind: description.kind,
		status: description.status
	};
}
