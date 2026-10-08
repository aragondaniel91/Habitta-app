/**
 * Small, runtime-independent ownership guard for async work associated with the
 * selected person.  The panel mirrors these tokens around its requests so that
 * a completion can update UI only while it still owns the current selection.
 */
export class PersonRequestOwnership {
  private selectedId: string | null = null;
  private selectionVersion = 0;
  private profileVersion = 0;
  private operationVersion = 0;
  private readonly operations = new Map<number, string>();

  select(personId: string) {
    const changed = this.selectedId !== personId;
    this.selectedId = personId;
    // Reloading the current person must not invalidate mutations that belong to
    // that still-current selection.  Profile requests get their own version so
    // a newer reload can continue to supersede an earlier one.
    if (changed) this.selectionVersion += 1;
    this.profileVersion += 1;
    if (changed) this.operations.clear();
    return {
      personId,
      selectionVersion: this.selectionVersion,
      loadVersion: this.profileVersion,
      changed,
    };
  }

  clear() {
    this.selectedId = null;
    this.selectionVersion += 1;
    this.profileVersion += 1;
    this.operations.clear();
  }

  ownsSelection(personId: string, selectionVersion: number) {
    return this.selectedId === personId && this.selectionVersion === selectionVersion;
  }

  refresh(personId: string) {
    if (personId !== this.selectedId) return null;
    this.profileVersion += 1;
    return { personId, selectionVersion: this.selectionVersion, loadVersion: this.profileVersion };
  }

  ownsLoad(token: { personId: string; selectionVersion: number; loadVersion: number }) {
    return (
      this.selectedId === token.personId &&
      this.selectionVersion === token.selectionVersion &&
      this.profileVersion === token.loadVersion
    );
  }

  beginOperation(label: string) {
    const id = ++this.operationVersion;
    this.operations.set(id, label);
    return id;
  }

  ownsOperation(token: { personId: string; selectionVersion: number }, operationId: number) {
    return (
      this.selectedId === token.personId &&
      this.selectionVersion === token.selectionVersion &&
      this.operations.has(operationId)
    );
  }

  finishOperation(operationId: number) {
    if (!this.operations.delete(operationId)) return this.busyAction;
    return this.busyAction;
  }

  get busyAction() {
    return Array.from(this.operations.values()).at(-1) ?? '';
  }
}

export const shouldShowInitialProfileSkeleton = (
  detailLoading: boolean,
  hasLoadedSelectedProfile: boolean,
) => detailLoading && !hasLoadedSelectedProfile;
