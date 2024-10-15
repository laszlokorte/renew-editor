

export function isLeftButton(event, allowModifiers = false) {
    if (!allowModifiers && (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey)) {
        return false;
    } else if ('buttons' in event) {
        return event.buttons === 1;
    } else if ('which' in event) {
        return event.which === 1;
    } else {
        return (event.button == 1 || event.type == 'click');
    }
}
