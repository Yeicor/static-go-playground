import {openVirtualFSMemory} from "./memfs"

const virtualFSRuntimeInfo = {}

/**
 * Creates a virtual filesystem instance. Different IDs will create different filesystems.
 * Returns the FS instance (following node's specification + chdir() + cwd())
 */
export const openVirtualFS = (backend: "memory" | "localStorage", id: string): any => {
    switch (backend) {
        case "memory":
            if (id in virtualFSRuntimeInfo) {
                return virtualFSRuntimeInfo[id]
            }
            let fs = openVirtualFSMemory()
            virtualFSRuntimeInfo[id] = fs
            return fs
        default:
            throw "openVirtualFS: storage backend '" + backend + "' not yet implemented"
    }
}

/**
 * Closes a virtual FS (releases resources, forgets the FS if the filesystem was volatile
 */
export const closeVirtualFS = (id: string): void => {
    if (id in virtualFSRuntimeInfo) {
        delete virtualFSRuntimeInfo[id]
    }
}