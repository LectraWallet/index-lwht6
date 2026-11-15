/* Generic Bare transport: stock BareClient (v3) + split oversized
   x-bare-headers so long cookie headers survive serverless header limits.
   No allowlist, no auth token — the backend enforces only the SSRF guard. */
import BareClient from "./bare-client.mjs";

const MAX_HEADER_VALUE = 3072;

function splitLargeBareHeaders(headers) {
  const output = new Headers(headers);
  if (output.has("x-bare-headers")) {
    const value = output.get("x-bare-headers");
    if (value && value.length > MAX_HEADER_VALUE) {
      output.delete("x-bare-headers");
      let split = 0;
      for (let i = 0; i < value.length; i += MAX_HEADER_VALUE) {
        const part = value.slice(i, i + MAX_HEADER_VALUE);
        output.set(`x-bare-headers-${split++}`, `;${part}`);
      }
    }
  }
  return output;
}

export default class GenericBareTransport extends BareClient {
  createBareHeaders(remote, bareHeaders, forwardHeaders = [], passHeaders = [], passStatus = []) {
    const baseHeaders = super.createBareHeaders(
      remote,
      bareHeaders,
      forwardHeaders,
      passHeaders,
      passStatus
    );
    return splitLargeBareHeaders(baseHeaders);
  }
}
