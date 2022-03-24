import React from "react"
import {CodeEditorWindow} from "../editor/window"
import {
    ActionBuild,
    ActionDelete,
    ActionDownloadZip,
    ActionFolderUploadZip,
    ActionRename,
    ActionRun,
    ActionTopBarNewFile,
    ActionTopBarNewFolder,
    ActionTopBarRefresh,
    ActionTopBarUp
} from "../filebrowser/action"
import {FileBrowser, FileData} from "../filebrowser/filebrowser"
import {readDir, stat} from "../fs/utils"


type VirtualFileBrowserProps = {
    fs: any,
    setProgress?: (p: number) => Promise<void>,
    getBuildTags?: () => Array<string>,
    getRunArgs?: () => Array<string>,
    getRunEnv?: () => { [key: string]: string },
    setOpenWindows?: (mapper: (prevWindows: Array<React.ReactNode>) => Array<React.ReactNode>) => Promise<any>,
}

type VirtualFileBrowserState = { cwd: string, files: Array<FileData> }

export class VirtualFileBrowser extends React.Component<VirtualFileBrowserProps, VirtualFileBrowserState> {
    constructor(props: VirtualFileBrowserProps, context: any) {
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
                    <ActionBuild fb={this} folderOrFilePath={filePath} isDir={fileStat.isDirectory()} key={"build"}/>,
                    <ActionRun fb={this} folderOrFilePath={filePath} isDir={fileStat.isDirectory()} key={"run"}/>,
                    <ActionDownloadZip fb={this} folderOrFilePath={filePath} key={"download-zip"}/>
                ]
            }
            if (fileStat.isDirectory()) {
                res.actions.splice(4, 0,
                    <ActionFolderUploadZip fb={this} folderPath={filePath} key={"upload-zip"}/>)
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

    onOpenFile = async (f: FileData): Promise<boolean> => {
        let fullPath = this.state.cwd + f.name;
        if (f.numChildren >= 0) { // DIRECTORY: enter
            await this.chdirChecked(fullPath)
            return true
        } else { // FILE: open for editing
            let fStat = await stat(this.props.fs, fullPath);
            if (!(fStat.isFile() && fStat.size < 1024 * 1024)) {
                return // (if small enough)
            }
            let refToRemove
            refToRemove = <CodeEditorWindow fs={this.props.fs} path={fullPath} onClose={async () => {
                await this.props.setOpenWindows(prev => {
                    prev.splice(prev.indexOf(refToRemove), 1)
                    return prev
                })
            }} key={fullPath}/>
            await this.props.setOpenWindows(prev => {
                prev.push(refToRemove)
                return prev
            })
            return false
        }
    }

    render() {
        return <>
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
