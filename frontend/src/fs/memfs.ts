// noinspection JSBitwiseOperatorUsage

import {cloneDeep} from "lodash"
import vfs from "virtualfs"

export const openVirtualFSMemory = () => {
    let myMemoryFS = cloneDeep(vfs) // Clone an empty memory FS

    // Some error definitions
    const enosys = () => {
        const err = new Error("not implemented")
        // @ts-ignore
        err.code = "ENOSYS"
        return err
    }
    const enoent = () => {
        const err = new Error("not found")
        // @ts-ignore
        err.code = "ENOENT"
        return err
    }

    // HACK: Provide a current working directory abstraction
    let goHackCwd = "/"
    myMemoryFS.getCwd = function () {
        return goHackCwd
    }
    myMemoryFS.chdir = function (val) {
        goHackCwd = val
    }
    const getFilePath = function (pathOrFd) {
        if (!(typeof pathOrFd === "string" || pathOrFd instanceof String)) { // File Descriptors (ints) aren"t mapped
            return pathOrFd
        }
        if (pathOrFd.length > 0 && pathOrFd[0] === "/") { // Passthrough absolute paths
            return pathOrFd
        }
        // Relative path: use cwd hack
        let cwd = myMemoryFS.getCwd()
        if (cwd && cwd.length > 0 && cwd[cwd.length - 1] !== "/") {
            cwd = cwd + "/"
        }
        return cwd + pathOrFd
    }
    // Apply cwd for all path-based system calls
    const wrapCwdFsCall = (fname: string, argIndexes?: Array<number>) => {
        if (!argIndexes) {
            argIndexes = [0]
        }
        myMemoryFS[fname + "Original"] = myMemoryFS[fname]
        myMemoryFS[fname] = function () {
            for (let argIndex of argIndexes) {
                arguments[argIndex] = getFilePath(arguments[argIndex])
            }
            myMemoryFS[fname + "Original"](...(arguments as unknown as Array<any>))
        }
    }
    for (let call of ["chmod", "chown", "lchown", "lstat", "mkdir", "open", "readdir", "readlink", "rmdir", "stat", "truncate", "unlink", "utimes"]) {
        wrapCwdFsCall(call)
    }
    wrapCwdFsCall("link", [0, 1])
    wrapCwdFsCall("rename", [0, 1])
    wrapCwdFsCall("symlink", [0, 1])

    // HACK: Open stdin, stdout and stderr and do nothing with them to avoid file descriptor conflicts (0/1/2)
    myMemoryFS.open("/dev/null", "r")
    myMemoryFS.open("/dev/null", "r")
    myMemoryFS.open("/dev/null", "r")

    // HACK: Provide constants for Go
    myMemoryFS.constants = {
        O_RDONLY: 0,
        O_WRONLY: 1,
        O_RDWR: 2,
        O_CREAT: 64,
        O_EXCL: 128,
        O_NOCTTY: 256,
        O_TRUNC: 512,
        O_APPEND: 1024,
        O_DIRECTORY: 65536,
        O_NOATIME: 262144,
        O_NOFOLLOW: 131072,
        O_SYNC: 1052672,
        O_DIRECT: 16384,
        O_NONBLOCK: 2048
    }

    // HACK: Provide special handling for Stdout/Stderr files
    let outputBuf = ""
    const decoder = new TextDecoder("utf-8")
    myMemoryFS.writeSyncOriginal2 = myMemoryFS.writeSync
    myMemoryFS.writeSync = function (fd, buf) {
        if (fd === 1 || fd === 2) {
            outputBuf += decoder.decode(buf)
            const nl = outputBuf.lastIndexOf("\n")
            if (nl !== -1) {
                console.log(outputBuf.substr(0, nl))
                outputBuf = outputBuf.substr(nl + 1)
            }
            return buf.length
        } else {
            return myMemoryFS.writeSyncOriginal2(fd, buf)
        }
    }
    myMemoryFS.writeOriginal2 = myMemoryFS.write
    myMemoryFS.write = function (fd, buf, offset, length, position, callback) {
        if (fd === 1 || fd === 2) {
            if (offset !== 0 || length !== buf.length || position !== null) {
                callback(enosys())
                return
            }
            const n = myMemoryFS.writeSync(fd, buf)
            callback(null, n, buf)
        } else {
            // buf:
            buf = vfs.Buffer.from(buf)
            return myMemoryFS.writeOriginal2(fd, buf, offset, length, position, callback)
        }
    }

    // HACK: Open using string flags (instead of received integer flags)
    myMemoryFS.openOriginal2 = myMemoryFS.open
    myMemoryFS.open = function (path, flags, mode?, callback?) {
        let myFlags = "r"
        const O = myMemoryFS.constants

        // Convert numeric flags to string flags
        // FIXME: maybe wrong...
        if (flags & O.O_WRONLY) { // "w"
            myFlags = "w"
            if (flags & O.O_EXCL) {
                myFlags = "wx"
            }
        } else if (flags & O.O_RDWR) { // "r+" or "w+"
            if (flags & O.O_CREAT && flags & O.O_TRUNC) { // w+
                if (flags & O.O_EXCL) {
                    myFlags = "wx+"
                } else {
                    myFlags = "w+"
                }
            } else { // r+
                myFlags = "r+"
            }
        } else if (flags & O.O_APPEND) { // "a"
            return callback(enosys())
        }
        // TODO: handle other cases

        return myMemoryFS.openOriginal2(path, myFlags, mode, callback)
    }

    // HACK: Fix all stat calls (proper output formatting)
    let statFix = function (pass, retStat, callback) {
        if (!retStat) { // Error: assume not found
            return callback(enoent())
        }
        delete retStat["fileData"]
        retStat.atimeMs = retStat.atime.getTime()
        retStat.mtimeMs = retStat.mtime.getTime()
        retStat.ctimeMs = retStat.ctime.getTime()
        retStat.birthtimeMs = retStat.birthtime.getTime()
        retStat.blksize = 4096
        retStat.blocks = retStat.size / retStat.blksize
        return callback(pass, retStat)
    }
    myMemoryFS.fstatOriginal2 = myMemoryFS.fstat
    myMemoryFS.fstat = function (path, callback) {
        // HACK: Check if we changed the file descriptor to a path, and change call
        if (!(typeof path === "string" || path instanceof String)) {
            return myMemoryFS.fstatOriginal2(path, (a1, a2) => statFix(a1, a2, callback))
        } else {
            return myMemoryFS.statOriginal2(path, (a1, a2) => statFix(a1, a2, callback))
        }
    }
    myMemoryFS.lstatOriginal2 = myMemoryFS.lstat
    myMemoryFS.lstat = function (path, callback) {
        return myMemoryFS.lstatOriginal2(path, (a1, a2) => statFix(a1, a2, callback))
    }
    myMemoryFS.statOriginal2 = myMemoryFS.stat
    myMemoryFS.stat = function (path, callback) {
        return myMemoryFS.statOriginal2(path, (a1, a2) => statFix(a1, a2, callback))
    }

    // HACK: Small close fix
    myMemoryFS.closeOriginal2 = myMemoryFS.close
    myMemoryFS.close = function (fd, callback) {
        return myMemoryFS.closeOriginal2(fd, function () {
            if (typeof fd === "undefined") fd = null
            return callback(fd, callback)
        })
    }

    // Debug: write all FS calls to console
    // noinspection JSUnusedGlobalSymbols
    /* tslint:disable no-console no-arg */
    const handler = {
        get: function (target, property) {
            if (property in target && target[property] instanceof Function) {
                return function () {
                    console.debug(property, ">>", arguments)
                    let callback = undefined
                    if (arguments[arguments.length - 1] instanceof Function) {
                        const origCB = arguments[arguments.length - 1]
                        const newCB = function () {
                            console.debug(property, "<<", arguments)
                            // return Reflect.apply(origCB, arguments.callee, arguments)
                            return origCB(...(arguments as any))
                        }
                        arguments[arguments.length - 1] = newCB
                        callback = newCB
                    }
                    let res = Reflect.apply(target[property], target, arguments)
                    if (!callback) {
                        console.debug(property, "<<", res)
                    }
                    return res
                }
            } else {
                return target[property]
            }
        }
    }
    /* tslint:enable */
    myMemoryFS = new Proxy(myMemoryFS, handler)

    return myMemoryFS
}
