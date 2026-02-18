import { createHash, randomBytes } from "crypto";

interface DigestCredentials {
  username: string;
  password: string;
}

interface DigestFetchOptions extends RequestInit {
  credentials_digest: DigestCredentials;
}

function md5(data: string): string {
  return createHash("md5").update(data).digest("hex");
}

function parseDigestChallenge(header: string): Record<string, string> {
  const params: Record<string, string> = {};
  const regex = /(\w+)=(?:"([^"]+)"|([^\s,]+))/g;
  let match;
  while ((match = regex.exec(header)) !== null) {
    params[match[1]] = match[2] ?? match[3];
  }
  return params;
}

function buildDigestHeader(
  method: string,
  uri: string,
  credentials: DigestCredentials,
  challenge: Record<string, string>,
  nc: number
): string {
  const { username, password } = credentials;
  const { realm, nonce, qop, opaque } = challenge;

  const ncHex = nc.toString(16).padStart(8, "0");
  const cnonce = randomBytes(16).toString("hex");

  const ha1 = md5(`${username}:${realm}:${password}`);
  const ha2 = md5(`${method}:${uri}`);

  let response: string;
  if (qop === "auth" || qop?.includes("auth")) {
    response = md5(`${ha1}:${nonce}:${ncHex}:${cnonce}:auth:${ha2}`);
  } else {
    response = md5(`${ha1}:${nonce}:${ha2}`);
  }

  let header = `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${response}"`;

  if (qop) header += `, qop=auth, nc=${ncHex}, cnonce="${cnonce}"`;
  if (opaque) header += `, opaque="${opaque}"`;

  return header;
}

export async function digestFetch(
  url: string,
  options: DigestFetchOptions
): Promise<Response> {
  const { credentials_digest, ...fetchOptions } = options;
  const method = (fetchOptions.method ?? "GET").toUpperCase();

  // Initial request to get the challenge
  const initialResponse = await fetch(url, fetchOptions);

  if (initialResponse.status !== 401) {
    return initialResponse;
  }

  const wwwAuth = initialResponse.headers.get("www-authenticate");
  if (!wwwAuth?.toLowerCase().startsWith("digest")) {
    return initialResponse;
  }

  const challenge = parseDigestChallenge(wwwAuth);
  const uri = new URL(url).pathname;

  const authHeader = buildDigestHeader(
    method,
    uri,
    credentials_digest,
    challenge,
    1
  );

  const retryResponse = await fetch(url, {
    ...fetchOptions,
    headers: {
      ...Object.fromEntries(
        new Headers(fetchOptions.headers as HeadersInit).entries()
      ),
      Authorization: authHeader,
    },
  });

  return retryResponse;
}
