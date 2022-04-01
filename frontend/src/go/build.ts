import {mkdirs, readCache, stat} from "../fs/utils"
import {defaultGoEnv, goRun} from "./run"

export const GOROOT = "/usr/lib/go/"
export const CmdGoPath = GOROOT + "bin/go"
export const CmdBuildHelperPath = GOROOT + "bin/buildhelper"
export const CmdGoToolsPath = GOROOT + "pkg/tool/js_wasm" // compile & link

const performBuildInternal = async (fs: any, commands: string[][], cwd: string,
                                    buildEnv: { [p: string]: string } = defaultGoEnv, progress?: (p: number) => Promise<any>): Promise<boolean> => {
    let numCommands = commands.length
    for (let i = 0; i < numCommands; i++) {
        let commandParts = commands[i]
        // Add full path to go installation for tool command (works for compile and link)
        commandParts[0] = CmdGoToolsPath + "/" + commandParts[0]
        let exitCode = await goRun(fs, commandParts[0], commandParts.slice(1), cwd, buildEnv).runPromise
        if (exitCode !== 0) {
            console.error("Build failed, check logs. Exit code: ", exitCode)
            return false
        }
        if (progress) await progress(goBuildParsingProgress + (1 - goBuildParsingProgress) * (i + 1) / numCommands)
    }
    return true
}

const goBuildParsingProgress = 0.25

// performBuild will build any source directory with vendored dependencies (go mod vendor), to the given exe
export const goBuild = async (fs: any, sourcePath: string, outputExePath: string, buildTags: string[] = [],
                              goos = "js", goarch = "wasm", envOverrides: { [key: string]: string } = {},
                              progress?: (p: number) => Promise<any>): Promise<boolean> => {
    if (progress) await progress(0)
    let buildFilesTmpDir = "/tmp/build/" + goos + "_" + goarch + "/" + buildTags.join("_")
    // Do not delete previous intermediary build files (as they may be used as a cache)
    await mkdirs(fs, buildFilesTmpDir)
    // Generate the configuration files and commands
    let buildEnv = {...defaultGoEnv, "GOOS": goos, "GOARCH": goarch, ...envOverrides}
    let buildTagsStr = buildTags.join(",")
    let sourceStat = await stat(fs, sourcePath)
    let exitCode: number
    if (sourceStat.isFile()) {
        let splitAt = sourcePath.lastIndexOf("/")
        let sourceParentDir = sourcePath.substring(0, splitAt)
        let sourceRelPath = sourcePath.substring(splitAt + 1)
        exitCode = await goRun(fs, CmdBuildHelperPath, [sourceRelPath, buildFilesTmpDir, buildTagsStr], sourceParentDir, buildEnv).runPromise
    } else if (sourceStat.isDirectory()) {
        exitCode = await goRun(fs, CmdBuildHelperPath, [".", buildFilesTmpDir, buildTagsStr], sourcePath, buildEnv).runPromise
    } else {
        console.error("Unsupported go build target", sourceStat)
        return false
    }
    if (exitCode !== 0) {
        console.error("Build failed, check logs. Exit code: ", exitCode)
        return false
    }
    if (progress) await progress(goBuildParsingProgress)
    // Read generated commands
    let commandsJson = await readCache(fs, buildFilesTmpDir + "/commands.json")
    // console.log("Read commands file:", commandsJson)
    let commandsArray = JSON.parse(new TextDecoder("utf-8").decode(commandsJson))
    // Execute all compile and link commands to generate a.out
    let success = await performBuildInternal(fs, commandsArray, buildFilesTmpDir, buildEnv, progress)
    if (success) {
        // Move executable to wanted location
        await fs.rename(buildFilesTmpDir + "/a.out", outputExePath)
    } // else build failed
    return success
}
