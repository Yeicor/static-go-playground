import {Stats} from "fs";
import JSZip from "jszip";

/**
 * Boilerplate for converting fs callbacks to Promise calls
 */
export const fsAsync = async (fs, method: string, fsUrl: string, extra?) => {
    return new Promise(((resolve, reject) => {
        let cb = (err, data) => {
            if (err) {
                reject(err)
            } else {
                resolve(data)
            }
        };
        if (extra) {
            // noinspection JSUnresolvedFunction
            fs[method](fsUrl, extra, cb)
        } else {
            // noinspection JSUnresolvedFunction
            fs[method](fsUrl, cb)
        }
    }));
}

/**
 * Explores all descendant files of path recursively (until false is returned by callback or all files are explored).
 *
 * In case of directories, it runs the callback for both enter and exit.
 */
export const findRecursive = async (fs, path: string, cb: (path: string, stat: Stats, enter: boolean) => Promise<boolean>): Promise<boolean> => {
    let stat = await fsAsync(fs, "stat", path) as Stats
    if (stat.isDirectory()) {
        // Notify of directory start
        if (!await cb(path, stat, true)) {
            return false
        }
        // Keep exploring
        let dirEntries = await fsAsync(fs, "readdir", path) as string[]
        for (let dirEntry of dirEntries) {
            if (!await findRecursive(fs, path + "/" + dirEntry, cb)) {
                return false
            }
        }
        // Notify of directory end
        if (!await cb(path, stat, false)) {
            return false
        }
    } else {
        // Just notify the file
        if (!await cb(path, stat, true)) {
            return false
        }
    }
    return true
}

let cachedFiles = {} // fs URL to bytes (needed as full file read from virtual fs is slow for some reason)
/**
 * Reads with cache (if available).
 */
export const readCache = async (fs, path: string): Promise<Uint8Array> => {
    if (fs in cachedFiles && path in cachedFiles[fs]) {
        return cachedFiles[fs][path]
    }
    return await fsAsync(fs, "read", path) as Uint8Array
}

/**
 * Write with cache (if needed).
 */
export const writeCache = async (fs, path: string, bs: Uint8Array) => {
    let buf = Buffer.from(bs)
    if (buf.length > 2 * 1024 * 1024) {
        // console.log("Caching large file:", path)
        if (!(fs in cachedFiles)) {
            cachedFiles[fs] = {}
        }
        cachedFiles[fs][path] = buf
    }
    await fs.writeFile(path, buf)
}

/**
 * Reads the file at path and all descendant files recursively, executing cb for each of them.
 */
export const readRecursive = async (fs, path: string, cb: (path: string, isDir: boolean, bs: Uint8Array) => Promise<boolean>): Promise<boolean> => {
    return await findRecursive(fs, path, async (path1, stat1, enter) => {
        if (stat1.isDirectory()) {
            if (enter) {
                return await cb(path1, true, new Uint8Array(0))
            }
        } else {
            let buf = await readCache(fs, path)
            return await cb(path1, false, buf)
        }
    })
}

/**
 * Deletes path and all descendant files recursively.
 */
export const deleteRecursive = async (fs, path: string) => {
    await findRecursive(fs, path, async (path1, stat1, enter) => {
        if (stat1.isDirectory()) {
            if (!enter) { // Delete the directory after the contents
                await fsAsync(fs, "rmdir", path)
            }
        } else {
            await fsAsync(fs, "unlink", path)
        }
        return true
    })
}

/**
 * Extract ZIP into virtual filesystem for both initial fs and the uploaded sources to compile.
 *
 * It also caches WASM files (as reading large files may be slow using a virtual FS).
 *
 * It will overwrite all conflicting files, without deleting anything else in the hierarchy.
 */
export const importZip = async (fs, zipBytes: Uint8Array, extractAt: string, progress: (p: number) => Promise<any>) => {
    const initialLoadProgress = 0.2
    await progress(0)
    const zip = await JSZip.loadAsync(zipBytes)
    let numFilesProcessed = 0;
    let numFiles = Object.keys(zip.files).length;
    await progress(initialLoadProgress)
    let allPromises = []
    zip.forEach((relativePath, file) => {
        let decompressionPromise = (async () => {
            let fileNewPath = extractAt + relativePath;
            if (file.dir) {
                // noinspection JSUnresolvedFunction
                await fsAsync(fs, "mkdir", fileNewPath)
            } else {
                let decompressedBytes = await file.async("uint8array");
                await writeCache(fs, fileNewPath, decompressedBytes)
            }
            numFilesProcessed++
            await progress(initialLoadProgress + numFilesProcessed / numFiles * (1 - initialLoadProgress))
        })
        allPromises.push(decompressionPromise())
    })
    await Promise.all(allPromises)
    await progress(1)
}

/**
 * Creates a zip from the given path (returns a buffer in-memory holding all files)
 */
export const exportZip = async (fs, paths: [string], progress: (p: number) => Promise<any>): Promise<Uint8Array> => {
    const finalLoadProgress = 0.2
    const zip = new JSZip();
    let numFiles = 0 // First count files (should be very fast) to report progress
    for (let path of paths) {
        await findRecursive(fs, path, async (path1, stat, enter) => {
            if (enter) {
                numFiles++
            }
            return true
        })
    }
    let numFilesProcessed = 0
    for (let path of paths) {
        await readRecursive(fs, path, async (childPath, isDir, bs) => {
            let childSubPath: string;
            if (paths.length === 1) {
                // Write each directory and file of the given path to the zip, relative to the root path.
                childSubPath = childPath.slice(path.length + 1);
            } else {
                childSubPath = childPath
            }
            zip.file(childSubPath, bs, {dir: isDir})
            numFilesProcessed++
            await progress(numFilesProcessed / numFiles * (1 - finalLoadProgress))
            return true
        })
    }
    await progress(1 - finalLoadProgress)
    let res = await zip.generateAsync({type: "uint8array"});
    await progress(1)
    return res
}
