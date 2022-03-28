// Compiling once mitigates performance problems of Function
import {BUILD_HACK_STOP_FN_ENV_VAR_NAME} from "../filebrowser/action"
import {readCache} from "../fs/utils"
import {getProcessForFS} from "./process"
import {hiddenGlobals} from "./globals";

// @ts-ignore
const parsedWasmExecJs = import("bundle-text:./wasm_exec.js.gen").then(wasmExecJsCode => Function("global", wasmExecJsCode as string))
export const defaultGoEnv = {
    "GOROOT": "/usr/lib/go"
    // "GOPATH": "/doesNotExist"
}
export const goRun = (fs: any, fsUrl: string, argv: string[] = [], cwd = "/", env: { [key: string]: string } = defaultGoEnv):
    { runPromise: Promise<number>; forceStop: () => Promise<void> } => {
    let cssLog = "background: #222; color: #bada55"
    console.log("%c>>>>> runGoExe:", cssLog, fsUrl, argv, {cwd}, env)
    fs.chdir(cwd)
    // HACK: Dynamically prepare wasm_exec.js each time with the given filesystem
    let globalHack: any = {} // <-- Fake global variable (only for the current context)
    // Shared globals
    for (let windowKey in window) {
        globalHack[windowKey] = window[windowKey]
    }
    for (let windowKey of hiddenGlobals) {
        globalHack[windowKey] = window[windowKey]
    }
    // Custom globals
    globalHack.fs = fs
    globalHack.process = getProcessForFS(fs)
    // globalHack.Buffer = fs.Buffer
    const stopFnName = "stopFnGoHack" + Math.floor(Math.random() * 1000000000)
    return {
        runPromise: ((async (): Promise<number> => {
            let wasmExecJsFunc = await parsedWasmExecJs
            wasmExecJsFunc(globalHack)
            const go = new globalHack.Go()
            try {
                // Read from virtual FS (should be very fast and not benefit from streaming compilation)
                let wasmBytes = await readCache(fs, fsUrl)
                let tmp = await WebAssembly.instantiate(wasmBytes, go.importObject)
                go.argv = go.argv.concat(argv) // First is the program name, already set
                env[BUILD_HACK_STOP_FN_ENV_VAR_NAME] = stopFnName
                go.env = env
                    await go.run(tmp.instance)
            } catch (e) {
                console.error("%c>>>>> runGoExe:", cssLog, e)
            }
            delete globalHack[stopFnName]
            return go.exit_code || -1
        })()),
        forceStop: async () => {
            if (globalHack[stopFnName]) {
                globalHack[stopFnName]()
            } else {
                console.error("Can't force stop as the executable hasn't set up the global stop function")
            }
        }
    }
}