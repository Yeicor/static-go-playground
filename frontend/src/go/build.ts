// @ts-ignore
import wasmExecJsCode from "bundle-text:./wasm_exec.js.generated"
import {readCache} from "../fs/utils"
import {getProcessForFS} from "./process"

export const GOROOT = "/usr/lib/go/"
export const CmdGoPath = GOROOT + "bin/go"
export const CmdBuildHelperPath = GOROOT + "bin/buildhelper"
export const CmdGoToolsPath = GOROOT + "/pkg/tool/js_wasm/" // compile & link

// Compiling once mitigates performance problems of Function/eval
const parsedWasmExecJs = Function('globalRefHack', wasmExecJsCode as string)

export const runGoAsync = async (fs, fsUrl, argv = [], cwd = "/", env = {
    // "GOPATH": "/gopath",
    "GOROOT": "/usr/lib/go"
}) => {
    fs.chdir(cwd)
    // HACK: Dynamically load wasm_exec.js each time with the given filesystem
    let globalRefHack = { // <-- Fake global variable (only for the current context)
        "TextEncoder": TextEncoder,
        "TextDecoder": TextDecoder,
        "performance": performance,
        "crypto": crypto,
        // @ts-ignore
        "require": () => console.log("require call ignored: ", arguments),
        "fs": fs,
        "process": getProcessForFS(fs),
        "Go": undefined, // Will be set when parsed code is executed
    }
    console.log(wasmExecJsCode)
    parsedWasmExecJs(globalRefHack)
    console.log("SET UP!", globalRefHack)
    console.warn("========================== runGoAsync:", fsUrl, argv, cwd, env, "==========================")
    // if (!(fsUrl.length > 0 && fsUrl[0] === '/')) {
    //     fsUrl = cwd + fsUrl
    // }
    const go = new globalRefHack.Go()
    // Read from virtual FS (should be very fast and not benefit from streaming compilation)
    let wasmBytes = await readCache(fs, fsUrl)
    // noinspection JSUnresolvedVariable,JSCheckFunctionSignatures
    let tmp = await WebAssembly.instantiate(wasmBytes, go.importObject)
    go.argv = go.argv.concat(argv) // First is the program name, already set
    go.env = env
    // noinspection JSUnresolvedFunction
    await go.run(tmp.instance)
}

export const performBuildInternal = async (commands, cwd) => {
    for (let i = 0; i < commands.length; i++) {
        let commandParts = commands[i]
        // Add full path to go installation for tool command (works for compile and link)
        commandParts[0] = "/usr/lib/go/pkg/tool/js_wasm/" + commandParts[0]
        await runGoAsync(commandParts[0], commandParts.slice(1), cwd)
    }
}