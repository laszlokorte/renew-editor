export const LOOK_AND_FEEL_STORAGE_KEY = 'petristation-look-and-feel';

export const LOOK_AND_FEEL_OPTIONS = [
	{ id: 'default', label: 'PetriStation' },
	{ id: 'renew-classic', label: 'Renew Classic' },
	{ id: 'high-contrast', label: 'High Contrast' }
];

export function normalizedLookAndFeel(value) {
	return LOOK_AND_FEEL_OPTIONS.some((option) => option.id === value) ? value : 'default';
}

export function applyLookAndFeel(value) {
	const lookAndFeel = normalizedLookAndFeel(value);
	document.documentElement.dataset.petristationLook = lookAndFeel;
	return lookAndFeel;
}

export function loadLookAndFeel() {
	try {
		return normalizedLookAndFeel(localStorage.getItem(LOOK_AND_FEEL_STORAGE_KEY));
	} catch {
		return 'default';
	}
}

export function setLookAndFeel(value) {
	const lookAndFeel = applyLookAndFeel(value);
	try {
		localStorage.setItem(LOOK_AND_FEEL_STORAGE_KEY, lookAndFeel);
	} catch {
		// Persisting the choice is optional; applying it for the current page is enough.
	}
	return lookAndFeel;
}
