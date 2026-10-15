// Runtime storage adapter for panel-managed EmDash sites.
//
// Dispatches on EMDASH_STORAGE at container start so a single image serves
// both local-volume and S3-backed sites. S3 credentials and endpoint are read
// from the S3_* environment by emdash's resolveS3Config.
import { createStorage as createLocal } from "emdash/storage/local";
import { createStorage as createS3 } from "emdash/storage/s3";

export function createStorage(config) {
	if (process.env.EMDASH_STORAGE === "s3") {
		return createS3({ ...config });
	}
	const dataDir = process.env.EMDASH_DATA_DIR ?? "/app/data";
	return createLocal({
		directory: `${dataDir}/uploads`,
		baseUrl: "/_emdash/api/media/file",
		...config,
	});
}
