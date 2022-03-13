import fetchProgress from "fetch-progress"
import {importZip} from "../fs/utils"

const initialFilesystemZipUrl = "fs.zip"
const initialFilesystemZipDownloadProgress = 1 / 2

export async function setUpGoInstall(fs: any, progressHandler: (p: number) => Promise<void>) {
    await fetch(initialFilesystemZipUrl, {}).then(fetchProgress({
        onProgress: async (progress) => {
            if (progress.total) {
                let actualP = progress.transferred / progress.total * initialFilesystemZipDownloadProgress
                await progressHandler(actualP)
            }
        },
        onError: (err) => {
            alert("Failed to download the filesystem (from " + initialFilesystemZipUrl + "), check your setup. Error: " + err)
        }
    })).then(async fsResp => {
        let initialFsZipBuf = (await fsResp.arrayBuffer()) as Uint8Array
        await progressHandler(initialFilesystemZipDownloadProgress)
        await importZip(fs, initialFsZipBuf, "/", async p => {
            let actualP = initialFilesystemZipDownloadProgress + p * (1 - initialFilesystemZipDownloadProgress)
            await progressHandler(actualP)
        })
    })
}