import {Stats} from "fs"
import JSZip from "jszip"

/**
 * Boilerplate for converting fs callbacks to Promise calls
 */
export const fsAsync = async (fs: any, method: string, fsUrl: string, extra?) => {
    return new Promise(((resolve, reject) => {
        let cb = (err, data) => {
            if (err) {
                reject(err)
            } else {
                resolve(data)
            }
        }
        if (extra) {
            // noinspection JSUnresolvedFunction
            fs[method](fsUrl, extra, cb)
        } else {
            // noinspection JSUnresolvedFunction
            fs[method](fsUrl, cb)
        }
    }))
}

export const stat = async (fs: any, path: string) => {
    return await fsAsync(fs, "stat", path) as Stats
}

export const readDir = async (fs: any, path: string) => {
    return await fsAsync(fs, "readdir", path) as string[]
}

/**
 * Explores all descendant files of path recursively (until false is returned by callback or all files are explored).
 *
 * In case of directories, it runs the callback for both enter and exit.
 */
export const findRecursive = async (fs: any, path: string, cb: (path: string, stat: Stats, enter: boolean) => Promise<boolean>): Promise<boolean> => {
    let statVal = await stat(fs, path)
    if (statVal.isDirectory()) {
        // Notify of directory start
        if (!await cb(path, statVal, true)) {
            return false
        }
        // Keep exploring
        let dirEntries = await readDir(fs, path)
        for (let dirEntry of dirEntries) {
            if (!await findRecursive(fs, path + "/" + dirEntry, cb)) {
                return false
            }
        }
        // Notify of directory end
        if (!await cb(path, statVal, false)) {
            return false
        }
    } else {
        // Just notify the file
        if (!await cb(path, statVal, true)) {
            return false
        }
    }
    return true
}

let cachedFiles = {} // fs URL to bytes (needed as full file read from virtual fs is slow for some reason)
/**
 * Reads with cache (if available).
 */
export const readCache = async (fs: any, path: string): Promise<Uint8Array> => {
    if (fs in cachedFiles && path in cachedFiles[fs]) {
        return cachedFiles[fs][path]
    }
    // return await fsAsync(fs, "readFile", path) as Uint8Array
    return fs.readFileSync(path) as Uint8Array
}

/**
 * Write with cache (if needed).
 */
export const writeCache = async (fs: any, path: string, bs: Uint8Array) => {
    let buf = Buffer.from(bs)
    // TODO: Fix VFS read performance problems to remove this
    if (buf.length > 64 * 1024) {
        // console.log("Caching \"large\" file:", path)
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
export const readRecursive = async (fs: any, path: string, cb: (path: string, isDir: boolean, bs: Uint8Array) => Promise<boolean>): Promise<boolean> => {
    return await findRecursive(fs, path, async (path1, stat1, enter) => {
        if (stat1.isDirectory()) {
            if (enter) {
                return await cb(path1, true, null)
            }
            return true
        } else {
            let buf = await readCache(fs, path1)
            return await cb(path1, false, buf)
        }
    })
}

/**
 * Deletes path and all descendant files recursively.
 */
export const deleteRecursive = async (fs: any, path: string) => {
    await findRecursive(fs, path, async (path1, stat1, enter) => {
        if (stat1.isDirectory()) {
            if (!enter) { // Delete the directory after the contents
                await fsAsync(fs, "rmdir", path1)
            }
        } else {
            await fsAsync(fs, "unlink", path1)
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
export const importZip = async (fs: any, zipBytes: Uint8Array, extractAt: string, progress?: (p: number) => Promise<any>) => {
    if (!extractAt.endsWith("/")) extractAt += "/"
    const initialLoadProgress = 0.2
    if (progress) await progress(0)
    const zip = await JSZip.loadAsync(zipBytes)
    let numFilesProcessed = 0
    let numFiles = Object.keys(zip.files).length
    if (progress) await progress(initialLoadProgress)
    let allPromises = []
    zip.forEach((relativePath, file) => {
        let decompressionPromise = (async () => {
            let fileNewPath = extractAt + relativePath
            if (file.dir) {
                // noinspection JSUnresolvedFunction
                try {
                    await fsAsync(fs, "mkdir", fileNewPath)
                } catch (e) {
                    // console.log("importZip: ignoring error on mkdir (probably already exists):", e)
                }
            } else {
                let decompressedBytes = await file.async("uint8array")
                await writeCache(fs, fileNewPath, decompressedBytes)
            }
            numFilesProcessed++
            if (progress) await progress(initialLoadProgress + numFilesProcessed / numFiles * (1 - initialLoadProgress))
        })
        allPromises.push(decompressionPromise())
    })
    await Promise.all(allPromises)
    if (progress) await progress(1)
}

/**
 * Creates a zip from the given path (returns a buffer in-memory holding all files)
 */
export const exportZip = async (fs: any, paths: [string], progress?: (p: number) => Promise<any>): Promise<Uint8Array> => {
    if (progress) await progress(0)
    const finalLoadProgress = 0.2
    let exportedZip = new JSZip()
    let getSubPath = (fullPath: string, relTo: string) => {
        if (paths.length === 1) {
            // Write each directory and file of the given path to the zip, relative to the root path.
            if (fullPath.length > relTo.length) {
                fullPath = fullPath.substring(relTo.length)
            } else {
                fullPath = ""
            }
        }
        return fullPath
    }
    let numFiles = 0 // First count files (should be very fast) to report progress (while generating directories)
    for (let path of paths) {
        await findRecursive(fs, path, async (path1, stat1, _enter) => {
            if (stat1.isDirectory()) {
                exportedZip.file(getSubPath(path1, path), null, {dir: true})
                return true
            }
            numFiles++
            return true
        })
    }
    let numFilesProcessed = 0
    for (let path of paths) {
        await readRecursive(fs, path, async (childPath, isDir, contents) => {
            if (isDir) return true // Already created
            let subPath = getSubPath(childPath, path)
            if (subPath === "") { // Exporting only a single file, fix the name
                subPath = path.substring(path.lastIndexOf("/") + 1)
            }
            exportedZip.file(subPath, contents, {dir: false})
            numFilesProcessed++
            if (progress) await progress(numFilesProcessed / numFiles * (1 - finalLoadProgress))
            return true
        })
    }
    if (progress) await progress(1 - finalLoadProgress)
    let res = await exportedZip.generateAsync({type: "uint8array"})
    if (progress) await progress(1)
    return res
}

export const mkdirs = async (fs: any, buildFilesTmpDir: string) => {
    let i = 1
    while (buildFilesTmpDir.substring(i).indexOf("/") >= 0) {
        i = i + buildFilesTmpDir.substring(i).indexOf("/") + 1
        try {
            await fs.mkdir(buildFilesTmpDir.substring(0, i))
        } catch (alreadyExists) {
        }
    }
    try {
        await fs.mkdir(buildFilesTmpDir)
    } catch (alreadyExists) {
    }
}
