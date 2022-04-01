// @ts-nocheck

import {closeVirtualFS, openVirtualFS} from "../fs";
import {goClassWithVFS} from "../../go/run";

// The entrypoint for a standalone script build (including only necessary dependencies) if only the filesystem is wanted

// Publish VFS-related functions
window.openVirtualFS = openVirtualFS;
window.closeVirtualFS = closeVirtualFS;

// Build the main class wrapper (Go) for wasm_exec.js (required change: new Go() --> await Go(<optional fs>))
window.Go = async (fs?: any): Promise<any> => {
    let globalHack: any = {} // <-- Fake global variable (only for the current context)
    let HackedGoClass = await goClassWithVFS(fs || openVirtualFS("memory", "tmp"), globalHack);
    return new HackedGoClass()
}
