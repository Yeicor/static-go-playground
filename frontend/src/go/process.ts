// Some error definitions
const enosys = () => {
    const err = new Error("not implemented")
    // @ts-ignore
    err.code = "ENOSYS"
    return err
}

export function getProcessForFS(fs) {
    return {
        getuid() {
            return -1
        },
        getgid() {
            return -1
        },
        geteuid() {
            return -1
        },
        getegid() {
            return -1
        },
        getgroups() {
            throw enosys()
        },
        pid: -1,
        ppid: -1,
        umask() {
            throw enosys()
        },
        cwd() {
            return fs.getCwd()
        },
        chdir(path: string) {
            fs.chdir(path)
        }
    }
}