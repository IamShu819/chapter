// Shim for @xmldom/xmldom — modern browsers have DOMParser natively.
// xmldom's parseFromString(string) only takes 1 arg, but native DOMParser requires 2.
// Wrap DOMParser to add a default MIME type so mammoth.js works.

class ShimDOMParser {
  private _parser = new globalThis.DOMParser();
  parseFromString(str: string, mimeType?: string) {
    return this._parser.parseFromString(str, mimeType || 'text/xml');
  }
}

export const DOMParser = ShimDOMParser;
export const XMLSerializer = globalThis.XMLSerializer;
export const DOMImplementation = globalThis.DOMImplementation;
