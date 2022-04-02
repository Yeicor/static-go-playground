import fetchProgress from "fetch-progress"
import {importZip} from "../fs/utils"
import {ActionBuild} from "../filebrowser/action";
import {VirtualFileBrowser} from "../settings/vfs";
import {goRun} from "./run";
import {CmdGoPath} from "./build";

const initialFilesystemZipUrl = "fs.zip"
const initialFilesystemZipDownloadProgress = 1 / 2

async function installZip(progressHandler: (p: number) => Promise<void>, fs: any, dlUrl: string, extractAt: string) {
    await fetch(dlUrl, {}).then(fetchProgress({
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
        await importZip(fs, initialFsZipBuf, extractAt, async p => {
            let actualP = initialFilesystemZipDownloadProgress + p * (1 - initialFilesystemZipDownloadProgress)
            await progressHandler(actualP)
        })
    })
}

export async function initialize(fb: VirtualFileBrowser, progressHandler: (p: number) => Promise<void>) {
    // Grab params from the URL
    let downloadPrefix = "fs_dl_";
    let downloadParams = findGetParameters(downloadPrefix, true);
    let buildPaths = findGetParameters("build", false);
    let initSteps = 1 + Object.keys(downloadParams).length + Object.keys(buildPaths).length;
    let curStep = 0
    let progressHandlerPart = (i: number) => (p: number) => progressHandler((i + p) / initSteps)
    // Perform core installation
    await installZip(progressHandlerPart(curStep++), fb.props.fs, initialFilesystemZipUrl, "/")
    await fb.refreshFilesCwd() // Refresh the newly added files
    await goRun(fb.props.fs, CmdGoPath, ["version"]).runPromise // Check core installation and print version
    // Install any extra zip files
    for (let extractAt in downloadParams) {
        let url = downloadParams[extractAt]
        // console.log("[init] Extracting " + url + " -> " + extractAt)
        extractAt = extractAt.substring(downloadPrefix.length);
        await installZip(progressHandlerPart(curStep++), fb.props.fs, url, extractAt)
        await fb.refreshFilesCwd() // Refresh the newly added files
    }
    // Perform initial builds
    for (let buildPath of Object.values(buildPaths)) {
        // console.log("[init] Building " + buildPath)
        let actionBuild = new ActionBuild({
            fb: fb,
            folderOrFilePath: buildPath,
            isDir: await fb.isDirSafe(buildPath),
            progressOverride: progressHandlerPart(curStep++),
        }, {});
        await actionBuild.onClick()
        await fb.refreshFilesCwd() // Refresh the newly added files
    }
}

export function defaultBuildTarget() {
    return findGetParameter("buildTarget") || "js/wasm";
}

export function defaultBuildTags() {
    return findGetParameter("buildTags") || "example,tag";
}

export function defaultBuildRun() {
    return findGetParameterBoolean("buildRun", true);
}

export function defaultBuildInjectStopCode() {
    return findGetParameterBoolean("buildInjectStopCode", true);
}

export function defaultRunArgs() {
    return findGetParameter("runArgs") || "arg1 \"arg2 with spaces\"";
}

export function defaultRunEnv() {
    return findGetParameter("runEnv") || "VAR=VALUE,VAR2=VALUE2";
}

function findGetParameter(parameterName: string): string | null {
    let res = findGetParameters(parameterName, false);
    let resKeys = Object.keys(res);
    return resKeys.length > 0 ? res[resKeys[0]] : null;
}

function findGetParameterBoolean(parameterName: string, def = false): boolean {
    let res = findGetParameter(parameterName);
    return res ? res in ["true", "1", "TRUE", "on"] : def;
}

// Based on https://stackoverflow.com/a/5448595
function findGetParameters(parameterName: string, prefix: boolean): { [key: string]: string } {
    let result = {}, tmp = [];
    const items = location.search.substring(1).split("&");
    for (let index = 0; index < items.length; index++) {
        tmp = items[index].split("=");
        if (tmp[0] === parameterName || prefix && tmp[0].startsWith(parameterName)) {
            let baseName = tmp[0]
            let index = 0;
            while (result[tmp[0]]) {
                tmp[0] = baseName + "-" + index++;
            }
            result[tmp[0]] = decodeURIComponent(tmp[1]);
        }
    }
    return result;
}