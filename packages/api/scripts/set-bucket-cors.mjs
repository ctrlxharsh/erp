// Allows browsers on the given origins to upload straight to the bucket (presigned POST).
//   pnpm --filter @erp/api cors <bucket> <origin> [origin...]
// Uses the AWS_* variables from .env.local (the branch the repo is linked to).
import { PutBucketCorsCommand, S3Client } from "@aws-sdk/client-s3";

const [bucket, ...origins] = process.argv.slice(2);
if (!bucket || origins.length === 0) {
  console.error("Usage: pnpm --filter @erp/api cors <bucket> <origin> [origin...]");
  process.exit(1);
}
const s3 = new S3Client({ forcePathStyle: true });
await s3.send(
  new PutBucketCorsCommand({
    Bucket: bucket,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedOrigins: origins,
          AllowedMethods: ["POST", "PUT", "GET", "HEAD"],
          AllowedHeaders: ["*"],
          ExposeHeaders: ["ETag"],
          MaxAgeSeconds: 3600,
        },
      ],
    },
  }),
);
console.log(`CORS set on ${bucket} for ${origins.join(", ")}`);
