export type StartupTask = BalnStartupTask;

export function completeStartupTask(task: StartupTask, label?: string) {
  window.__BALN_STARTUP__?.complete(task, label);
}

export function failStartup(label?: string) {
  window.__BALN_STARTUP__?.fail(label);
}

export function finishStartupAfterPaint() {
  window.__BALN_STARTUP__?.finishAfterPaint();
}

export function setStartupStatus(label: string) {
  window.__BALN_STARTUP__?.setStatus(label);
}
