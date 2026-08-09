import { EvidenceStorageError } from "../../application/evidence-storage-errors";

export type B2StorageConfig = {
  endpoint: string;
  region: string;
  keyId: string;
  applicationKey: string;
  bucketName: string;
};

type Environment = Readonly<Record<string, string | undefined>>;

const BUCKET_PATTERN = /^[a-z0-9][a-z0-9-]{4,61}[a-z0-9]$/iu;
const REGION_PATTERN = /^[a-z0-9][a-z0-9-]*$/iu;

function configurationError(): never {
  throw new EvidenceStorageError("STORAGE_CONFIGURATION_UNAVAILABLE");
}

function required(env: Environment, name: string): string {
  const value = env[name];
  if (typeof value !== "string" || value.trim().length === 0) {
    return configurationError();
  }
  return value;
}

export function parseB2StorageConfig(env: Environment): B2StorageConfig {
  const endpointValue = required(env, "B2_S3_ENDPOINT");
  let endpoint: URL;
  try {
    endpoint = new URL(endpointValue);
  } catch {
    return configurationError();
  }

  if (
    endpoint.protocol !== "https:" ||
    endpoint.username.length > 0 ||
    endpoint.password.length > 0 ||
    endpoint.search.length > 0 ||
    endpoint.hash.length > 0 ||
    (endpoint.pathname !== "/" && endpoint.pathname !== "")
  ) {
    return configurationError();
  }

  const region = required(env, "B2_REGION");
  const keyId = required(env, "B2_KEY_ID");
  const applicationKey = required(env, "B2_APPLICATION_KEY");
  const bucketName = required(env, "B2_BUCKET_NAME");
  if (!REGION_PATTERN.test(region) || !BUCKET_PATTERN.test(bucketName)) {
    return configurationError();
  }

  return {
    endpoint: endpoint.origin,
    region,
    keyId,
    applicationKey,
    bucketName,
  };
}

export function loadB2StorageConfig(): B2StorageConfig {
  return parseB2StorageConfig(process.env);
}
