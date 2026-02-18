import { digestFetch } from "./digest-fetch";
import { randomBytes } from "crypto";

const ATLAS_BASE = "https://cloud.mongodb.com/api/atlas/v2";
const ATLAS_ACCEPT = "application/vnd.atlas.2023-01-01+json";

interface AtlasCredentials {
  publicKey: string;
  privateKey: string;
}

interface AtlasResult {
  mongodbUri: string;
  groupId: string;
  clusterName: string;
}

async function atlasApi<T>(
  credentials: AtlasCredentials,
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const url = `${ATLAS_BASE}${path}`;

  const response = await digestFetch(url, {
    method,
    credentials_digest: {
      username: credentials.publicKey,
      password: credentials.privateKey,
    },
    headers: {
      Accept: ATLAS_ACCEPT,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    let message: string;
    try {
      const json = JSON.parse(text);
      message = json.detail ?? json.error ?? text;
    } catch {
      message = text;
    }
    const err = new Error(message);
    (err as Error & { status: number }).status = response.status;
    throw err;
  }

  return response.json() as Promise<T>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function setupAtlasCluster(
  credentials: AtlasCredentials
): Promise<AtlasResult> {
  const clusterName = "tars-cluster";
  const dbUser = "tars-admin";
  const dbPassword = randomBytes(18).toString("base64url"); // 24 chars

  // Step 1: Get org
  const orgs = await atlasApi<{ results: { id: string }[] }>(
    credentials,
    "GET",
    "/orgs"
  );
  if (!orgs.results?.length) {
    throw new Error("No Atlas organization found. Create one at mongodb.com/atlas first.");
  }
  const orgId = orgs.results[0].id;

  // Step 2: Get or create project
  const projects = await atlasApi<{ results: { id: string; name: string }[] }>(
    credentials,
    "GET",
    `/orgs/${orgId}/groups`
  );

  let groupId: string;
  if (projects.results?.length) {
    groupId = projects.results[0].id;
  } else {
    const newProject = await atlasApi<{ id: string }>(
      credentials,
      "POST",
      "/groups",
      { name: "TARS", orgId }
    );
    groupId = newProject.id;
  }

  // Step 3: Create M0 cluster (409 = already exists, continue)
  try {
    await atlasApi(credentials, "POST", `/groups/${groupId}/clusters`, {
      name: clusterName,
      clusterType: "REPLICASET",
      replicationSpecs: [
        {
          regionConfigs: [
            {
              providerName: "TENANT",
              backingProviderName: "AWS",
              regionName: "US_EAST_1",
              priority: 7,
              electableSpecs: { instanceSize: "M0" },
            },
          ],
        },
      ],
    });
  } catch (err) {
    if ((err as Error & { status?: number }).status !== 409) throw err;
  }

  // Step 4: Poll until cluster is ready
  const maxWait = 120_000;
  const pollInterval = 5_000;
  const start = Date.now();

  while (Date.now() - start < maxWait) {
    const cluster = await atlasApi<{ stateName: string }>(
      credentials,
      "GET",
      `/groups/${groupId}/clusters/${clusterName}`
    );
    if (cluster.stateName === "IDLE") break;
    await sleep(pollInterval);
  }

  // Step 5: Create DB user (409 = already exists, continue)
  try {
    await atlasApi(
      credentials,
      "POST",
      `/groups/${groupId}/databaseUsers`,
      {
        databaseName: "admin",
        username: dbUser,
        password: dbPassword,
        roles: [{ roleName: "readWrite", databaseName: "tars" }],
        groupId,
      }
    );
  } catch (err) {
    if ((err as Error & { status?: number }).status !== 409) throw err;
    // User exists — update password so the URI we return works
    try {
      await atlasApi(
        credentials,
        "PATCH",
        `/groups/${groupId}/databaseUsers/admin/${dbUser}`,
        { password: dbPassword }
      );
    } catch {
      // If patch fails, continue — user may already have access
    }
  }

  // Step 6: Set network access (409 = already exists, continue)
  try {
    await atlasApi(
      credentials,
      "POST",
      `/groups/${groupId}/accessList`,
      [{ cidrBlock: "0.0.0.0/0", comment: "Allow all (development)" }]
    );
  } catch (err) {
    if ((err as Error & { status?: number }).status !== 409) throw err;
  }

  // Step 7: Get connection string
  const clusterInfo = await atlasApi<{
    connectionStrings?: { standardSrv?: string };
  }>(credentials, "GET", `/groups/${groupId}/clusters/${clusterName}`);

  const srvBase = clusterInfo.connectionStrings?.standardSrv;
  if (!srvBase) {
    throw new Error("Cluster is ready but no connection string available yet. Try again in a moment.");
  }

  // Inject credentials and database name
  const mongodbUri = srvBase.replace(
    "mongodb+srv://",
    `mongodb+srv://${encodeURIComponent(dbUser)}:${encodeURIComponent(dbPassword)}@`
  ) + "/tars?retryWrites=true&w=majority";

  return { mongodbUri, groupId, clusterName };
}
