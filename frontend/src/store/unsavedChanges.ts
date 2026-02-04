export type UnsavedHandlers = {
  save: () => Promise<boolean>;
  discard: () => void;
};

let hasUnsavedChanges = false;
let handlers: UnsavedHandlers | null = null;

export function setHasUnsavedChanges(next: boolean): void {
  hasUnsavedChanges = next;
}

export function getHasUnsavedChanges(): boolean {
  return hasUnsavedChanges;
}

export function registerUnsavedHandlers(next: UnsavedHandlers | null): void {
  handlers = next;
}

export function getUnsavedHandlers(): UnsavedHandlers | null {
  return handlers;
}
