import { S3Client, CreateBucketCommand, PutBucketLifecycleConfigurationCommand } from '@aws-sdk/client-s3'

async function setupBuckets() {
  const client = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT ?? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  })

  const buckets = [
    { name: process.env.R2_BUCKET_PROMPTS ?? 'runlet-prompts', lifecycle: false },
    { name: process.env.R2_BUCKET_PAYLOADS ?? 'runlet-payloads', lifecycle: true },
  ]

  for (const { name, lifecycle } of buckets) {
    try {
      await client.send(new CreateBucketCommand({ Bucket: name }))
      console.log(`✓ Created bucket: ${name}`)
    } catch (err: unknown) {
      if ((err as { name?: string }).name === 'BucketAlreadyOwnedByYou' || (err as { Code?: string }).Code === 'BucketAlreadyOwnedByYou') {
        console.log(`~ Bucket already exists: ${name}`)
      } else {
        throw err
      }
    }

    // Add 90-day expiry to payloads bucket
    if (lifecycle) {
      await client.send(new PutBucketLifecycleConfigurationCommand({
        Bucket: name,
        LifecycleConfiguration: {
          Rules: [{
            ID: 'expire-payloads-90d',
            Status: 'Enabled',
            Filter: { Prefix: 'payloads/' },
            Expiration: { Days: 90 },
          }],
        },
      }))
      console.log(`✓ Lifecycle rule set (90-day expiry): ${name}`)
    }
  }

  console.log('\n✅ R2 setup complete')
}

setupBuckets().catch(err => { console.error(err); process.exit(1) })
