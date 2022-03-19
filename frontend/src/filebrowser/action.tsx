import {
    faArrowUp,
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
import {deleteRecursive, fsAsync, importZip} from "../fs/utils"
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

    enabled = () => {
        return true
    }

    tooltip = () => {
        return ""
    }

    render() {
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

    constructor(props: { fb: VirtualFileBrowser; folderPath: string }, context: any, onClick: () => void) {
        super(props, context)
        this.inputRef = React.createRef()
    }

    getIcon = () => {
        return faUpload
    }

    tooltip = () => {
        return "Extract a zip file inside this directory"
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
                await importZip(fs, zipBytes, extractAt, undefined /* TODO: progress */)
                // Refresh file count of folder (and possibly actions available)
                await this.props.fb.refreshFilesCwd()
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

export class ActionDownloadZip extends Action<{ fb: VirtualFileBrowser, folderPath: string }, {}> {
    // TODO!
}

export class ActionBuild extends Action<{ fb: VirtualFileBrowser, folderOrFilePath: string }, {}> {
    getIcon = () => {
        return faHammer
    }

    tooltip = () => {
        return "Build a Go main package/file (generating a.out)"
    }

    onClick = async () => {
        let fs = this.props.fb.props.fs
        /* TODO: progress */
        await goBuild(fs, this.props.folderOrFilePath, this.props.folderOrFilePath + "a.out")
    }
}

export class ActionFileRun extends Action<{ fb: VirtualFileBrowser, folderPath: string }, {}> {
    getIcon = () => {
        return faPlay
    }

    tooltip = () => {
        return "Run this js/wasm Go executable (cwd is this directory)"
    }

    onClick = async () => {
        let fs = this.props.fb.props.fs
        await goRun(fs, "a.out", [], this.props.fb.state.cwd)
    }
}