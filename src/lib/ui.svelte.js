export const ui = $state({
	notice: null,
	saveAndExit: null,
	inspectionBusy: false,
	syncingIds: new Set()
});
let noticeId = 0;
export function notify(message, type = 'info') {
	ui.notice = { id: ++noticeId, message, type };
}
