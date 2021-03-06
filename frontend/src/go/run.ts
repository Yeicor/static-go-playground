// Compiling once mitigates performance problems of Function
import {BUILD_HACK_STOP_FN_ENV_VAR_NAME} from "../filebrowser/action"
import {readCache} from "../fs/utils"
import {hiddenGlobals} from "./globals"
import {getProcessForFS} from "./process"

// @ts-ignore
const parsedWasmExecJs = import("bundle-text:./wasm_exec.js.gen").then(wasmExecJsCode => Function("global", "globalThis", wasmExecJsCode as string))
export const defaultGoEnv = {
    "GOROOT": "/usr/lib/go"
    // "GOPATH": "/doesNotExist"
}

export const goClassWithVFS = async (fs: any, globalHack: any): Promise<any> => {
    // HACK: Dynamically prepare wasm_exec.js each time with the given filesystem
    // Shared globals
    for (const windowKey of Object.keys(window)) { // https://stackoverflow.com/a/45959874
        globalHack[windowKey] = window[windowKey]
    }
    for (let windowKey of hiddenGlobals) {
        globalHack[windowKey] = window[windowKey]
    }
    // Custom globals
    globalHack.fs = fs
    globalHack.process = getProcessForFS(fs)
    // globalHack.Buffer = fs.Buffer
    let wasmExecJsFunc = await parsedWasmExecJs
    // Need 2 different variables as Go 1.18 started using globalThis instead of global
    wasmExecJsFunc(globalHack, globalHack)
    return globalHack.Go
}

export const goRun = (fs: any, fsUrl: string, argv: string[] = [], cwd = "/", env: { [key: string]: string } = defaultGoEnv):
    { runPromise: Promise<number>; forceStop: () => Promise<void> } => {
    let cssLog = "background: #222; color: #bada55"
    console.log("%c>>>>> runGoExe:", cssLog, fsUrl, argv, {cwd}, env)
    fs.chdir(cwd)
    const stopFnName = "stopFnGoHack" + Math.floor(Math.random() * 1000000000)
    let globalHack: any = {} // <-- Fake global variable (only for the current context)
    return {
        runPromise: ((async (): Promise<number> => {
            let go: any
            try {
                // Build an instance the modified Go class from wasm_exec.js
                let GoClass = await goClassWithVFS(fs, globalHack);
                go = new GoClass()
                go.argv = go.argv.concat(argv) // First is the program name, already set
                env[BUILD_HACK_STOP_FN_ENV_VAR_NAME] = stopFnName
                go.env = env
                // Read from virtual FS (should be very fast and not benefit from streaming compilation)
                let wasmBytes = await readCache(fs, fsUrl)
                let tmp = await WebAssembly.instantiate(wasmBytes, go.importObject)
                await go.run(tmp.instance)
            } catch (e) {
                console.error("%c>>>>> runGoExe:", cssLog, e)
            }
            delete globalHack[stopFnName]
            return go?.exit_code !== 0 && !go?.exit_code ? -1 : go?.exit_code
        })()),
        forceStop: async () => {
            if (globalHack[stopFnName]) {
                globalHack[stopFnName]()
                // Now asynchronously wait for the code to actually exit
                while (globalHack[stopFnName]) {
                    await new Promise(resolve => setTimeout(resolve, 100))
                }
            } else {
                console.error("Can't force stop as the executable hasn't set up the global stop function")
            }
        }
    }
}