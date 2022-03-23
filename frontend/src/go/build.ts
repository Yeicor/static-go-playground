// @ts-ignore
import wasmExecJsCode from "bundle-text:./wasm_exec.js.generated"
import {deleteRecursive, readCache, stat} from "../fs/utils"
import {getProcessForFS} from "./process"

export const GOROOT = "/usr/lib/go/"
export const CmdGoPath = GOROOT + "bin/go"
export const CmdBuildHelperPath = GOROOT + "bin/buildhelper"
export const CmdGoToolsPath = GOROOT + "pkg/tool/js_wasm" // compile & link

// Compiling once mitigates performance problems of Function
const parsedWasmExecJs = Function("global", wasmExecJsCode as string)

export const defaultGoEnv = {
    "GOROOT": "/usr/lib/go",
    // "GOPATH": "/doesNotExist"
}

export const goRun = async (fs: any, fsUrl: string, argv: string[] = [], cwd = "/", env: { [key: string]: string } = defaultGoEnv) => {
    let cssLog = "background: #222; color: #bada55";
    console.log("%c>>>>> runGoExe:", cssLog, fsUrl, argv, {cwd}, env)
    fs.chdir(cwd)
    // HACK: Dynamically prepare wasm_exec.js each time with the given filesystem
    let globalHack = { // <-- Fake global variable (only for the current context)
        // Shared globals
        ...global, // Provide all globals, overriding some of them
        "Uint8Array": Uint8Array,
        "TextEncoder": TextEncoder,
        "TextDecoder": TextDecoder,
        "performance": performance,
        "crypto": crypto,
        "Date": Date, // TODO: Find a better fix without manual work if more APIs are needed
        // Custom globals
        "fs": fs,
        "Buffer": fs.Buffer,
        "process": getProcessForFS(fs),
        "Go": undefined // Will be set when parsed code is executed
    }
    parsedWasmExecJs(globalHack)
    const go = new globalHack.Go()
    // Read from virtual FS (should be very fast and not benefit from streaming compilation)
    let wasmBytes = await readCache(fs, fsUrl)
    let tmp = await WebAssembly.instantiate(wasmBytes, go.importObject)
    go.argv = go.argv.concat(argv) // First is the program name, already set
    go.env = env
    await go.run(tmp.instance)
}

const performBuildInternal = async (fs: any, commands: string[][], cwd: string,
                                    buildEnv: { [p: string]: string } = defaultGoEnv, progress?: (p: number) => Promise<any>) => {
    let numCommands = commands.length;
    for (let i = 0; i < numCommands; i++) {
        let commandParts = commands[i]
        // Add full path to go installation for tool command (works for compile and link)
        commandParts[0] = CmdGoToolsPath + "/" + commandParts[0]
        await goRun(fs, commandParts[0], commandParts.slice(1), cwd, buildEnv)
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
    let buildTagsStr = buildTags.join(",");
    let sourceStat = await stat(fs, sourcePath);
    if (sourceStat.isFile()) {
        let splitAt = sourcePath.lastIndexOf("/");
        let sourceParentDir = sourcePath.substring(0, splitAt);
        let sourceRelPath = sourcePath.substring(splitAt + 1);
        await goRun(fs, CmdBuildHelperPath, [sourceRelPath, buildFilesTmpDir, buildTagsStr], sourceParentDir, buildEnv)
    } else if (sourceStat.isDirectory()) {
        await goRun(fs, CmdBuildHelperPath, [".", buildFilesTmpDir, buildTagsStr], sourcePath, buildEnv)
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
