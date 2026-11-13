/**
 * Links that carry a whole Nexus document in the URL fragment.
 *
 * The fragment reads `#doc=<data>&focus=<entity id>`, where `<data>` is the
 * document's JSON compressed with `deflate` and encoded as base64url, and
 * `focus` is optional. Browsers never send the fragment to a server.
 */

// `deflate` adds an Adler-32 checksum that `deflate-raw` lacks, so a link
// altered in transit fails to decode instead of opening with other content.
const FORMAT = 'deflate';

const DOC_PARAM = 'doc';

const FOCUS_PARAM = 'focus';

/**
 * The longest link Copy link hands out, in characters.
 */
export const MAX_LINK_LENGTH = 32000;

/**
 * The most bytes a link's document may inflate to, so a crafted fragment
 * can't exhaust memory.
 */
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

const DAMAGED = 'The link is incomplete or damaged.';

const TOO_LARGE = 'The diagram in the link is larger than ' + MAX_DOCUMENT_BYTES / 1024 / 1024 + ' MB.';

const BASE64URL = /^[A-Za-z0-9_-]+$/;

// String.fromCharCode() takes each byte as an argument, so long input goes
// in slices that stay under the engine's argument limit.
const CHUNK = 0x8000;

function toBase64Url(bytes) {
  let binary = '';

  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Returns null for text that isn't unpadded base64url.
function fromBase64Url(text) {
  if (!BASE64URL.test(text) || text.length % 4 === 1) {
    return null;
  }

  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));

  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

// Runs the bytes through the transform and returns its output, or null once
// the output passes the limit.
async function transformBytes(bytes, transform, limit) {
  const reader = new Blob([bytes]).stream().pipeThrough(transform).getReader();
  const chunks = [];
  let length = 0;

  for (;;) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    length += value.length;

    if (length > limit) {
      await reader.cancel();
      return null;
    }

    chunks.push(value);
  }

  const output = new Uint8Array(length);
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }

  return output;
}

/**
 * Compresses a document into the text a link carries.
 */
export async function encodeDocument(doc) {
  const bytes = await transformBytes(new TextEncoder().encode(JSON.stringify(doc)), new CompressionStream(FORMAT), Infinity);

  return toBase64Url(bytes);
}

/**
 * Reads the document a link carries.
 *
 * Throws an error that says why when the text is damaged, inflates past
 * MAX_DOCUMENT_BYTES or isn't JSON. The document itself is untrusted.
 */
export async function decodeDocument(text) {
  const bytes = fromBase64Url(String(text));

  if (!bytes) {
    throw new Error(DAMAGED);
  }

  let inflated;

  try {
    inflated = await transformBytes(bytes, new DecompressionStream(FORMAT), MAX_DOCUMENT_BYTES);
  } catch {
    throw new Error(DAMAGED);
  }

  if (!inflated) {
    throw new Error(TOO_LARGE);
  }

  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(inflated));
  } catch {
    throw new Error(DAMAGED);
  }
}

/**
 * Builds a link to the page at `pageUrl` that carries the encoded document
 * and, when given, the id of the entity to focus. Any fragment `pageUrl`
 * already has is replaced.
 */
export function documentLink(pageUrl, encoded, focus) {
  const url = new URL(pageUrl);
  const params = new URLSearchParams({ [DOC_PARAM]: encoded });

  if (focus) {
    params.set(FOCUS_PARAM, focus);
  }

  url.hash = params.toString();

  return url.href;
}

/**
 * Reads a URL fragment, with or without its `#`.
 *
 * Returns `{ encoded, focus }`, with `focus` null when the fragment names
 * none, or null when the fragment carries no document.
 */
export function linkParams(hash) {
  const params = new URLSearchParams(String(hash || '').replace(/^#/, ''));

  if (!params.has(DOC_PARAM)) {
    return null;
  }

  return { encoded: params.get(DOC_PARAM), focus: params.get(FOCUS_PARAM) || null };
}
