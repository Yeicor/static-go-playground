// Compiling once mitigates performance problems of Function
// @ts-ignore
import wasmExecJsCode from "bundle-text:./wasm_exec.js.generated"
import {readCache} from "../fs/utils"
import {getProcessForFS} from "./process"

const parsedWasmExecJs = Function("global", wasmExecJsCode as string)
export const defaultGoEnv = {
    "GOROOT": "/usr/lib/go"
    // "GOPATH": "/doesNotExist"
}
export const goRun = (fs: any, fsUrl: string, argv: string[] = [], cwd = "/", env: { [key: string]: string } = defaultGoEnv):
    { runPromise: () => Promise<number>; forceStop: () => Promise<void> } => {
    return {
        runPromise: async (): Promise<number> => {
            let cssLog = "background: #222; color: #bada55"
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
            return go.exit_code
        },
        forceStop: async () => {
            // TODO: Use injected code from build process
        }
    }
}