// @ts-ignore
import wasmExecJsCode from "bundle-text:./wasm_exec.js.generated"
import {deleteRecursive, readCache} from "../fs/utils"
import {getProcessForFS} from "./process"

export const GOROOT = "/usr/lib/go/"
export const CmdGoPath = GOROOT + "bin/go"
export const CmdBuildHelperPath = GOROOT + "bin/buildhelper"
export const CmdGoToolsPath = GOROOT + "/pkg/tool/js_wasm/" // compile & link

// Compiling once mitigates performance problems of Function
const parsedWasmExecJs = Function("global", wasmExecJsCode as string)

export const defaultGoEnv = {
    "GOROOT": "/usr/lib/go",
    "GOPATH": "/doesNotExist"
}

export const goRun = async (fs: any, fsUrl: string, argv: string[] = [], cwd = "/", env: { [key: string]: string } = defaultGoEnv) => {
    console.warn("========================== runGoAsync:", fsUrl, argv, cwd, env, "==========================")
    fs.chdir(cwd)
    // HACK: Dynamically prepare wasm_exec.js each time with the given filesystem
    let globalHack = { // <-- Fake global variable (only for the current context)
        // Shared globals
        "Uint8Array": Uint8Array,
        "TextEncoder": TextEncoder,
        "TextDecoder": TextDecoder,
        "performance": performance,
        "crypto": crypto,
        // Custom globals
        "fs": fs,
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
                                    buildEnv: { [key: string]: string } = defaultGoEnv) => {
    for (let i = 0; i < commands.length; i++) {
        let commandParts = commands[i]
        // Add full path to go installation for tool command (works for compile and link)
        commandParts[0] = CmdGoToolsPath + commandParts[0]
        await goRun(fs, commandParts[0], commandParts.slice(1), cwd)
    }
}

// performBuild will build any source directory with vendored dependencies (go mod vendor), to the given exe
export const goBuild = async (fs: any, sourcePath: string, outputExePath: string, buildTags: string[] = [],
                              goos = "js", goarch = "wasm", envOverrides: { [key: string]: string } = {}) => {
    let buildFilesTmpDir = "/tmp/build"
    // Automatic mode: using the buildhelper compiled above, which relies on Go's internal build system
    await fs.mkdir(buildFilesTmpDir)
    // Generate the configuration files and commands
    // TODO: Build tags
    let buildEnv = {...defaultGoEnv, "GOOS": goos, "GOARCH": goarch, ...envOverrides}
    await goRun(fs, CmdBuildHelperPath, [".", buildFilesTmpDir], sourcePath, buildEnv)
    // Read generated commands
    let commandsJson = await readCache(fs, buildFilesTmpDir + "/commands.json")
    console.log("Read commands file:", commandsJson)
    let commandsArray = JSON.parse(new TextDecoder("utf-8").decode(commandsJson))
    // Execute all compile and link commands to generate a.out
    await performBuildInternal(fs, commandsArray, buildFilesTmpDir, buildEnv)
    // Move to wanted location
    await fs.rename(buildFilesTmpDir + "/a.out", outputExePath)
    // Clean up build files
    await deleteRecursive(fs, buildFilesTmpDir)
}
