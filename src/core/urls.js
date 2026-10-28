// Resolve from the document so both source modules and the production bundle
// work at the site root and inside GitHub Pages' /chishenme/ subdirectory.
export const appBase = new URL('./', globalThis.document?.baseURI || new URL('../../', import.meta.url));
export const appUrl = path => new URL(path, appBase);
