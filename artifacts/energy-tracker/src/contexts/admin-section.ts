let _setter: ((section: string) => void) | null = null;

export function registerAdminSectionSetter(fn: (section: string) => void): () => void {
  _setter = fn;
  return () => { if (_setter === fn) _setter = null; };
}

export function changeAdminSection(section: string): void {
  _setter?.(section);
}
