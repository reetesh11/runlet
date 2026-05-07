import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'
import { encrypt, decrypt, sha256 } from '@runlet/utils'

let _client: S3Client | undefined

function getClient(): S3Client {
  if (!_client) {
    const accountId = process.env.R2_ACCOUNT_ID
    const endpoint = process.env.R2_ENDPOINT ?? `https://${accountId}.r2.cloudflarestorage.com`
    _client = new S3Client({
      region: 'auto',
      endpoint,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    })
  }
  return _client
}

const BUCKET_PROMPTS = () => process.env.R2_BUCKET_PROMPTS ?? 'runlet-prompts'
const BUCKET_PAYLOADS = () => process.env.R2_BUCKET_PAYLOADS ?? 'runlet-payloads'

// ── Prompts (content-addressed, no encryption — not sensitive) ──
export async function storePrompt(promptBody: string): Promise<string> {
  const hash = sha256(promptBody)
  const key = `prompts/${hash}.txt`
  await getClient().send(new PutObjectCommand({
    Bucket: BUCKET_PROMPTS(),
    Key: key,
    Body: promptBody,
    ContentType: 'text/plain',
  }))
  return key
}

export async function getPrompt(key: string): Promise<string> {
  const resp = await getClient().send(new GetObjectCommand({
    Bucket: BUCKET_PROMPTS(), Key: key,
  }))
  return resp.Body!.transformToString()
}

// ── Payloads (encrypted) ────────────────────────────────────────
export async function storePayload(
  runId: string,
  type: 'input' | 'output',
  payload: unknown
): Promise<string> {
  const encKey = process.env.PAYLOAD_ENCRYPTION_KEY!
  const json = JSON.stringify(payload)
  const encrypted = encrypt(json, encKey)
  const key = `payloads/${runId}/${type}.enc`
  await getClient().send(new PutObjectCommand({
    Bucket: BUCKET_PAYLOADS(),
    Key: key,
    Body: encrypted,
    ContentType: 'text/plain',
  }))
  return key
}

export async function getPayload<T = unknown>(key: string): Promise<T> {
  const encKey = process.env.PAYLOAD_ENCRYPTION_KEY!
  const resp = await getClient().send(new GetObjectCommand({
    Bucket: BUCKET_PAYLOADS(), Key: key,
  }))
  const encrypted = await resp.Body!.transformToString()
  const json = decrypt(encrypted, encKey)
  return JSON.parse(json) as T
}

export async function deletePayload(key: string): Promise<void> {
  await getClient().send(new DeleteObjectCommand({
    Bucket: BUCKET_PAYLOADS(), Key: key,
  }))
}
