import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

/** Bucket names declared in neon.ts. */
export const PRIVATE_BUCKET = "assets";
export const PUBLIC_BUCKET = "public-assets";

/** Neon Object Storage is on when env pull has written the AWS-standard variables. */
export function objectStorageConfigured(): boolean {
  return Boolean(
    process.env.AWS_ENDPOINT_URL_S3?.trim() &&
      process.env.AWS_ACCESS_KEY_ID?.trim() &&
      process.env.AWS_SECRET_ACCESS_KEY?.trim() &&
      process.env.AWS_REGION?.trim(),
  );
}

let client: S3Client | undefined;

function s3(): S3Client {
  const endpoint = process.env.AWS_ENDPOINT_URL_S3?.trim();
  const region = process.env.AWS_REGION?.trim();
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();
  if (!endpoint || !region || !accessKeyId || !secretAccessKey) {
    throw new Error("Neon Object Storage environment variables are not set");
  }
  client ??= new S3Client({
    region,
    endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });
  return client;
}

export async function putObject(bucket: string, key: string, body: Buffer, contentType?: string): Promise<void> {
  await s3().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: bucket === PUBLIC_BUCKET ? "public, max-age=31536000, immutable" : "private, no-store",
    }),
  );
}

export async function getObject(bucket: string, key: string): Promise<Buffer> {
  const response = await s3().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const body = response.Body;
  if (!body) throw new Error("Object is empty");
  if ("transformToByteArray" in body && typeof body.transformToByteArray === "function") {
    return Buffer.from(await body.transformToByteArray());
  }
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export async function deleteObject(bucket: string, key: string): Promise<void> {
  await s3().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export function publicObjectUrl(key: string): string {
  const endpoint = process.env.AWS_ENDPOINT_URL_S3?.trim().replace(/\/$/, "");
  if (!endpoint) throw new Error("AWS_ENDPOINT_URL_S3 is not set");
  return `${endpoint}/${PUBLIC_BUCKET}/${key}`;
}

/** Key stored in the public bucket, when `url` points at this branch's endpoint. */
export function publicObjectKey(url: string): string | null {
  const endpoint = process.env.AWS_ENDPOINT_URL_S3?.trim().replace(/\/$/, "");
  if (!endpoint) return null;
  const prefix = `${endpoint}/${PUBLIC_BUCKET}/`;
  if (!url.startsWith(prefix)) return null;
  const key = decodeURIComponent(url.slice(prefix.length));
  if (!key || key.includes("..") || key.includes("//")) return null;
  return key;
}
