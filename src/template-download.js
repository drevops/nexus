/**
 * Downloads a text file and reports the share of it that has arrived.
 *
 * The share is measured against the size the caller expects, because a
 * server that compresses the file sends the compressed size as its
 * Content-Length while the body yields the decoded bytes.
 */

function basename(url) {
  const parts = String(url).split('/');
  return parts[parts.length - 1];
}

function unreachable(url) {
  return new Error(basename(url) + ' could not be downloaded. Check your connection and try again.');
}

/**
 * Returns the share of an expected size that has arrived, from 0 to 1.
 *
 * An unknown size reads as 0, and a file larger than its size stops at 1.
 */
export function downloadShare(received, size) {
  if (!(size > 0)) {
    return 0;
  }

  return Math.min(received / size, 1);
}

async function readBody(response, size, onProgress) {
  if (!response.body) {
    return response.text();
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = '';

  for (;;) {
    const { done, value } = await reader.read();

    if (done) {
      return text + decoder.decode();
    }

    received += value.byteLength;
    text += decoder.decode(value, { stream: true });
    onProgress(downloadShare(received, size));
  }
}

/**
 * Downloads the text at a URL, calling onProgress with the share received
 * after each chunk and with 1 once the whole text has arrived.
 *
 * A network failure and a status other than 2xx throw an error that names
 * the file.
 */
export async function downloadText(url, { size = 0, onProgress = () => {}, fetcher = fetch, priority = 'auto' } = {}) {
  let response;

  try {
    response = await fetcher(url, { priority });
  } catch {
    throw unreachable(url);
  }

  if (!response.ok) {
    throw new Error(basename(url) + ' returned ' + response.status);
  }

  let text;

  try {
    text = await readBody(response, size, onProgress);
  } catch {
    throw unreachable(url);
  }

  onProgress(1);

  return text;
}
