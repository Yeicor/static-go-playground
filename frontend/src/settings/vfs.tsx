import React from "react"
import {
    ActionBuild,
    ActionDelete,
    ActionFolderUploadZip,
    ActionRename,
    ActionTopBarNewFile,
    ActionTopBarNewFolder,
    ActionTopBarRefresh,
    ActionTopBarUp
} from "../filebrowser/action"
import {FileBrowser, FileData} from "../filebrowser/filebrowser"
import {readDir, stat} from "../fs/utils"


export class VirtualFileBrowser extends React.Component<{ fs: any }, { cwd: string, files: Array<FileData> }> {
    constructor(props: { fs: any }, context: any) {
        super(props, context)
        this.state = {cwd: "/", files: []}
    }

    componentDidMount() {
        this.refreshFilesCwd().then(undefined)
    }

    async refreshFilesCwd(): Promise<void> {
        let fileData = await this.listFiles(this.state.cwd)
        this.setState((prevState) => ({...prevState, files: fileData}))
    }

    async listFiles(cwd: string): Promise<Array<FileData>> {
        let isDir = await this.isDirSafe(cwd)
        if (!isDir) {
            console.warn("[VirtualFileBrowser] Trying to list files in ", cwd, ", but it is not a directory")
            return []
        }
        return await Promise.all((await readDir(this.props.fs, cwd)).map(async fileName => {
            let filePath = cwd + fileName
            let fileStat = await stat(this.props.fs, filePath)
            let res = {
                name: fileName,
                size: fileStat.size,
                numChildren: fileStat.isDirectory() ? (await readDir(this.props.fs, filePath)).length : -1,
                actions: [
                    <ActionRename fb={this} folderOrFilePath={filePath} key={"rename"}/>,
                    <ActionDelete fb={this} folderOrFilePath={filePath} key={"delete"}/>,
                    <ActionBuild fb={this} folderOrFilePath={filePath} key={"build"}/>
                ]
            }
            if (fileStat.isDirectory()) {
                res.actions.push(<ActionFolderUploadZip fb={this} folderPath={filePath} key={"upload-zip"}/>)
            }
            return res as FileData
        }))
    }

    chdirChecked = async (newCwdPath: string): Promise<void> => {
        let dirPath = newCwdPath
        if (await this.isDirSafe(dirPath)) {
            let dirPathSlash = dirPath
            if (!dirPathSlash.endsWith("/")) {
                dirPathSlash += "/"
            }
            this.setState((prevState) => ({...prevState, cwd: dirPathSlash}), this.refreshFilesCwd)
        }
    }

    chdirCheckedRel = async (newCwdName: string): Promise<void> => {
        await this.chdirChecked(this.state.cwd + newCwdName)
    }

    onOpenFile = async (f: FileData): Promise<boolean> => {
        if (f.numChildren >= 0) { // DIRECTORY: enter
            await this.chdirCheckedRel(f.name)
            return true
        } else { // FILE: open for editing (if small enough and text)
            // TODO
            return false
        }
    }

    toggleDOMConsole = async () => {
        // TODO!
    }

    render() {
        return <>
            <div className={"settings-options"}>
                <label htmlFor={"enable-console"}>DOM console</label>
                <input id={"enable-console"} type={"checkbox"} checked={true} onChange={this.toggleDOMConsole}
                       title={"Show the console as the main content (may conflict with your code)"}/>
            </div>
            <FileBrowser cwd={this.state.cwd} files={this.state.files} trySetCwd={this.chdirChecked}
                         onOpen={this.onOpenFile}>
                <ActionTopBarUp fb={this}/>
                <ActionTopBarRefresh fb={this}/>
                <ActionTopBarNewFolder fb={this}/>
                <ActionTopBarNewFile fb={this}/>
            </FileBrowser>
        </>
    }

    async isDirSafe(cwd: string): Promise<boolean> {
        let fileStat: any
        try {
            fileStat = await stat(this.props.fs, cwd)
        } catch (e) {
            // console.warn("Error listing files at", cwd)
            fileStat = {
                isDirectory: function () {
                    return false
                }
            }
        }
        return fileStat.isDirectory()
    }
}
