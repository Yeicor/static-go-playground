
import {deleteRecursive, readCache, stat} from "../fs/utils"
import {defaultGoEnv, goRun} from "./run"

export const GOROOT = "/usr/lib/go/"
export const CmdGoPath = GOROOT + "bin/go"
export const CmdBuildHelperPath = GOROOT + "bin/buildhelper"
export const CmdGoToolsPath = GOROOT + "pkg/tool/js_wasm" // compile & link

const performBuildInternal = async (fs: any, commands: string[][], cwd: string,
                                    buildEnv: { [p: string]: string } = defaultGoEnv, progress?: (p: number) => Promise<any>) => {
    let numCommands = commands.length
    for (let i = 0; i < numCommands; i++) {
        let commandParts = commands[i]
        // Add full path to go installation for tool command (works for compile and link)
        commandParts[0] = CmdGoToolsPath + "/" + commandParts[0]
        await goRun(fs, commandParts[0], commandParts.slice(1), cwd, buildEnv)[0]
        if (progress) await progress(goBuildParsingProgress + (1 - goBuildParsingProgress) * (i + 1) / numCommands)
    }
}

const goBuildParsingProgress = 0.25
// performBuild will build any source directory with vendored dependencies (go mod vendor), to the given exe
export const goBuild = async (fs: any, sourcePath: string, outputExePath: string, buildTags: string[] = [],
                              goos = "js", goarch = "wasm", envOverrides: { [key: string]: string } = {},
                              progress?: (p: number) => Promise<any>) => {
    if (progress) await progress(0)
    let buildFilesTmpDir = "/tmp/build"
    try {
        // Clean up previous intermediary build files
        await stat(fs, buildFilesTmpDir)
        await deleteRecursive(fs, buildFilesTmpDir)
    } catch (doesNotExist) { // Not found, ignore
    }
    // Automatic mode: using the buildhelper compiled above, which relies on Go's internal build system
    await fs.mkdir(buildFilesTmpDir)
    // Generate the configuration files and commands
    let buildEnv = {...defaultGoEnv, "GOOS": goos, "GOARCH": goarch, ...envOverrides}
    let buildTagsStr = buildTags.join(",")
    let sourceStat = await stat(fs, sourcePath)
    if (sourceStat.isFile()) {
        let splitAt = sourcePath.lastIndexOf("/")
        let sourceParentDir = sourcePath.substring(0, splitAt)
        let sourceRelPath = sourcePath.substring(splitAt + 1)
        await goRun(fs, CmdBuildHelperPath, [sourceRelPath, buildFilesTmpDir, buildTagsStr], sourceParentDir, buildEnv)[0]
    } else if (sourceStat.isDirectory()) {
        await goRun(fs, CmdBuildHelperPath, [".", buildFilesTmpDir, buildTagsStr], sourcePath, buildEnv)[0]
    } else {
        console.error("Unsupported go build target", sourceStat)
        return
    }
    if (progress) await progress(goBuildParsingProgress)
    // Read generated commands
    let commandsJson = await readCache(fs, buildFilesTmpDir + "/commands.json")
    // console.log("Read commands file:", commandsJson)
    let commandsArray = JSON.parse(new TextDecoder("utf-8").decode(commandsJson))
    // Execute all compile and link commands to generate a.out
    await performBuildInternal(fs, commandsArray, buildFilesTmpDir, buildEnv, progress)
    // Move to wanted location
    await fs.rename(buildFilesTmpDir + "/a.out", outputExePath)
}
