import {
    faArrowUp,
    faDownload,
    faFolderPlus,
    faHammer,
    faPencilAlt,
    faPlay,
    faRefresh,
    faSquarePlus,
    faTrashCan,
    faUpload
} from "@fortawesome/free-solid-svg-icons"
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome"
import React from "react"
import {deleteRecursive, exportZip, fsAsync, importZip, readCache, readDir, stat} from "../fs/utils"
import {goBuild, goRun} from "../go/build"
import {VirtualFileBrowser} from "../settings/vfs"

/**
 * Base action class, ready for extending
 */
export class Action<P, S> extends React.Component<P, S> {
    constructor(props: P, context: any) {
        super(props, context)
    }

    getIcon = () => {
        return faUpload
    }

    onClick = () => {
        console.log("Action clicked")
    }

    visible = () => {
        return true
    }

    enabled = () => {
        return true
    }

    tooltip = () => {
        return ""
    }

    render() {
        if (!this.visible()) {
            return <></>
        }
        return <button onClick={this.onClick} className={"mfb-action"} disabled={!this.enabled()}
                       title={this.tooltip()} key={this.tooltip()}>
            <FontAwesomeIcon icon={this.getIcon()}/>
        </button>
    }
}


export class ActionTopBarRefresh extends Action<{ fb: VirtualFileBrowser }, {}> {
    getIcon = () => {
        return faRefresh
    }

    tooltip = () => {
        return "Reload this directory"
    }

    onClick = () => {
        this.props.fb.refreshFilesCwd().then(undefined)
    }
}

export class ActionTopBarUp extends Action<{ fb: VirtualFileBrowser }, {}> {
    getIcon = () => {
        return faArrowUp
    }

    tooltip = () => {
        return "Go to the parent directory"
    }

    onClick = () => {
        let cwd = this.props.fb.state.cwd
        this.props.fb.chdirChecked(cwd.substring(0, cwd.substring(0, cwd.length - 1).lastIndexOf("/") + 1)).then(undefined)
    }

    enabled = () => {
        return this.props.fb.state.cwd.length > 1
    }
}

function newFileHelper(doFunc: (nameFix: string) => void, def?: string) {
    setTimeout(async () => { // HACK: Avoid blocking react handler (doesn't really avoid blocking)
        let name = prompt("Enter the name", def)
        if (name) {
            let nameFix = name.replace("/", "")
            await doFunc(nameFix)
        }
    }, 0)
}

export class ActionTopBarNewFile extends Action<{ fb: VirtualFileBrowser }, {}> {
    getIcon = () => {
        return faSquarePlus
    }

    tooltip = () => {
        return "Create a new empty file"
    }

    onClick = async () => {
        newFileHelper(this.do)
    }

    do = async (nameFix: string) => {
        this.props.fb.props.fs.writeFile(this.props.fb.state.cwd + nameFix, "", "utf-8")
        await this.props.fb.refreshFilesCwd()
    }
}

export class ActionTopBarNewFolder extends ActionTopBarNewFile {
    getIcon = () => {
        return faFolderPlus
    }

    tooltip = () => {
        return "Create a new directory"
    }

    do = async (nameFix: string) => {
        await fsAsync(this.props.fb.props.fs, "mkdir", this.props.fb.state.cwd + nameFix)
        await this.props.fb.refreshFilesCwd()
    }
}

export class ActionDelete extends Action<{ fb: VirtualFileBrowser, folderOrFilePath: string }, {}> {
    getIcon = () => {
        return faTrashCan
    }

    tooltip = () => {
        return "Delete this file/directory and contents"
    }

    onClick = async () => {
        await deleteRecursive(this.props.fb.props.fs, this.props.folderOrFilePath)
        await this.props.fb.refreshFilesCwd()
    }
}

export class ActionRename extends Action<{ fb: VirtualFileBrowser, folderOrFilePath: string }, {}> {
    getIcon = () => {
        return faPencilAlt
    }

    tooltip = () => {
        return "Renames this file/directory"
    }

    onClick = async () => {
        newFileHelper(this.do, this.props.folderOrFilePath.substring(this.props.folderOrFilePath.lastIndexOf("/") + 1))
    }

    // noinspection JSUnusedGlobalSymbols
    do = async (nameFix: string) => {
        await fsAsync(this.props.fb.props.fs, "rename", this.props.folderOrFilePath, this.props.fb.state.cwd + nameFix)
        await this.props.fb.refreshFilesCwd()
    }
}

export class ActionFolderUploadZip extends Action<{ fb: VirtualFileBrowser, folderPath: string }, {}> {
    inputRef: React.RefObject<HTMLInputElement>

    constructor(props: { fb: VirtualFileBrowser; folderPath: string }, context: any) {
        super(props, context)
        this.inputRef = React.createRef()
    }

    getIcon = () => {
        return faUpload
    }

    tooltip = () => {
        return "Upload and extract a zip file inside this directory"
    }

    onClick = () => {
        console.log("Click", this.inputRef)
        this.inputRef.current.value = "" // Reset to fire if selecting the same file
        this.inputRef.current.click()
    }

    onFileSelected = (evt) => {
        console.log("Reading zip files to memory...", evt)
        let fs = this.props.fb.props.fs
        for (let i = 0; i < this.inputRef.current.files.length; i++) {
            let zipFile = this.inputRef.current.files[i]
            // Fully read the zip file (maybe corrupt / not a zip file)
            const reader = new FileReader()
            reader.readAsArrayBuffer(zipFile)
            reader.onload = async (e) => {
                const zipBytes = new Uint8Array(e.target.result as ArrayBuffer)
                let extractAt = this.props.folderPath
                if (!extractAt.endsWith("/")) {
                    extractAt += "/"
                }
                console.log("Extracting source zip to " + extractAt + "... length: ", zipBytes.length)
                await importZip(fs, zipBytes, extractAt, this.props.fb.props.setProgress)
                // Refresh file count of folder (and possibly actions available)
                await this.props.fb.refreshFilesCwd()
                if (this.props.fb.props.setProgress) await this.props.fb.props.setProgress(-1) // Done
            }
        }
    }

    render(): JSX.Element {
        return <>
            {super.render()}
            <input type={"file"} accept={"application/zip"} style={{"position": "absolute", "width": "0px"}}
                   ref={this.inputRef} onChange={this.onFileSelected}/>
        </>
    }
}

export class ActionDownloadZip extends Action<{ fb: VirtualFileBrowser, folderOrFilePath: string }, {}> {
    getIcon = () => {
        return faDownload
    }

    tooltip = () => {
        return "Download a zip file containing this file/folder"
    }

    onClick = async () => {
        let bytes = await exportZip(this.props.fb.props.fs, [this.props.folderOrFilePath], this.props.fb.props.setProgress)
        let name = this.props.folderOrFilePath;
        name = name.substring(name.lastIndexOf("/") + 1, name.length) + ".zip"
        this.saveByteArray(name, bytes)
        if (this.props.fb.props.setProgress) await this.props.fb.props.setProgress(-1) // Done
    }

    saveByteArray(name: string, bytes: Uint8Array) {
        const blob = new Blob([bytes], {type: "application/pdf"});
        const link = document.createElement('a');
        link.href = window.URL.createObjectURL(blob);
        link.download = name;
        link.click();
    };

}

export class ActionBuild extends Action<{ fb: VirtualFileBrowser, folderOrFilePath: string, isDir: boolean }, { visible: boolean }> {
    constructor(props: { fb: VirtualFileBrowser; folderOrFilePath: string; isDir: boolean }, context: any) {
        super(props, context);
        this.state = {visible: false}
        this.setupCheck().then(undefined)
    }

    componentDidUpdate(prevProps: Readonly<{ fb: VirtualFileBrowser; folderOrFilePath: string; isDir: boolean }>, prevState: Readonly<{ visible: boolean }>, snapshot?: any) {
        if(!this.state.visible) this.setupCheck().then(undefined)
    }

    setupCheck = async () => {
        if (this.props.isDir) { // Check if any file is main
            for (let fileName of (await readDir(this.props.fb.props.fs, this.props.folderOrFilePath))) {
                let folderSlash = this.props.folderOrFilePath;
                if (!folderSlash.endsWith("/")) {
                    folderSlash += "/";
                }
                if (await this.setupCheckFile(folderSlash + fileName)) {
                    this.setState((prevState) => ({...prevState, visible: true}))
                    return
                }
            }
        } else { // Check if this file is main
            if (await this.setupCheckFile(this.props.folderOrFilePath)) {
                this.setState((prevState) => ({...prevState, visible: true}))
            }
        }
    }

    maxSourceSize = 1024 * 1024 // Won't check for main if larger than 1MiB
    checkRegexes = [/package\s+main/, /func\s+main\(/]

    setupCheckFile = async (filePath: string): Promise<boolean> => {
        if (!filePath.endsWith(".go")) {
            return false
        }
        let fStat = await stat(this.props.fb.props.fs, filePath);
        if (!fStat.isFile() || fStat.size > this.maxSourceSize) {
            return false
        }
        let bytes = await readCache(this.props.fb.props.fs, filePath);
        for (let checkRegex of this.checkRegexes) {
            if (!checkRegex.test(bytes.toString())) {
                return false
            }
        }
        return true
    }

    getIcon = () => {
        return faHammer
    }

    tooltip = () => {
        return "Build a Go main package/file (generating a.out)"
    }

    visible = () => {
        return this.state.visible
    }

    onClick = async () => {
        let fs = this.props.fb.props.fs
        let buildFile = this.props.folderOrFilePath
        if (this.props.isDir && !buildFile.endsWith("/")) { // Add final / for directories
            buildFile += "/"
        }
        let outFile = buildFile
        if (!this.props.isDir) { // Output to parent for files
            outFile = outFile.substring(0, outFile.lastIndexOf("/") + 1)
        }
        outFile += "a.out"
        let buildTags = []
        if (this.props.fb.props.getBuildTags) buildTags = this.props.fb.props.getBuildTags()
        await goBuild(fs, buildFile, outFile, buildTags, "js", "wasm", {}, this.props.fb.props.setProgress)
        await this.props.fb.refreshFilesCwd()
        if (this.props.fb.props.setProgress) await this.props.fb.props.setProgress(-1) // Done
    }
}

export class ActionRun extends Action<{ fb: VirtualFileBrowser, folderOrFilePath: string, isDir: boolean }, { visible: boolean }> {
    constructor(props: { fb: VirtualFileBrowser; folderOrFilePath: string; isDir: boolean }, context: any) {
        super(props, context);
        this.state = {visible: false}
        setTimeout(() => this.setupCheck().then(undefined), 0)
    }

    componentDidUpdate(prevProps: Readonly<{ fb: VirtualFileBrowser; folderOrFilePath: string; isDir: boolean }>, prevState: Readonly<{ visible: boolean }>, snapshot?: any) {
        if(!this.state.visible) this.setupCheck().then(undefined)
    }

    setupCheck = async () => {
        if (this.props.isDir) {
            let exePath = this.getExePath();
            try {
                await stat(this.props.fb.props.fs, exePath)
                this.setState((prevState) => ({...prevState, visible: true}))
            } catch (doesNotExist) {
            }
        } else {
            if(this.props.folderOrFilePath.endsWith(".out")) {
                this.setState((prevState) => ({...prevState, visible: true}))
            }
        }
    }

    getIcon = () => {
        return faPlay
    }

    tooltip = () => {
        return "Run this js/wasm Go executable (cwd is this directory)"
    }

    visible = () => {
        return this.state.visible
    }

    onClick = async () => {
        let fs = this.props.fb.props.fs
        let exePath = this.getExePath();
        await goRun(fs, exePath, [], this.props.fb.state.cwd)
    }

    private getExePath(): string {
        let exePath = this.props.folderOrFilePath
        if (this.props.isDir) {
            exePath = this.props.folderOrFilePath + "/a.out"
        }
        return exePath;
    }
}