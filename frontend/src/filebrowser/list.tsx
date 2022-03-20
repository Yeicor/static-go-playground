import {faFile, faFolder} from "@fortawesome/free-solid-svg-icons"
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome"
import prettyBytes from "pretty-bytes"
import React from "react"
import {FileData} from "./filebrowser"

export type FileListProps = { files: Array<FileData>, onSelect?: (FileData) => Promise<boolean>, onOpen?: (FileData) => Promise<boolean> }

export class FileList extends React.Component<FileListProps, {}> {
    selectedFile?: string

    lastClickEpochMillis = -1
    handleClick = async (evt: React.MouseEvent<HTMLDivElement>, f: FileData) => {
        let now = Date.now()
        let deltaClick = now - this.lastClickEpochMillis
        this.lastClickEpochMillis = now
        if (deltaClick > 10 /* HACK: to support zip uploads */ && deltaClick < 500) {
            // Handle double click: open
            let resetOnOpen = this.props.onOpen && await this.props.onOpen(f)
            if (resetOnOpen) {
                this.lastClickEpochMillis = -1
                this.selectedFile = undefined
            } else {
                this.selectedFile = f.name
            }
            // return resetOnOpen
        } // TODO: Slow double click rename: else if (deltaClick < 1500)
        // Handle single click: select
        let selectOk = this.props.onSelect && await this.props.onSelect(f)
        if (selectOk) {
            this.selectedFile = f.name
        }
        // return selectOk
    }

    render() {
        return <div className={"mfb-list"}>
            {this.props.files.map((f: FileData) => {
                return <div className={"mfb-list-item" + (this.selectedFile === f.name ? " selected" : "")}
                            key={f.name} onClick={(evt) => this.handleClick(evt as any, f)}>
                    {/*<span className={"mfb-list-item-non-actions"}*/}
                    {/*      onClick={(evt) => this.handleClick(evt as any, f)}>*/}
                        <FontAwesomeIcon icon={f.numChildren >= 0 ? faFolder : faFile}
                                         className={"mfb-list-item-icon"}/>&nbsp;
                        <span className={"mfb-list-item-name"} title={f.name}>{f.name}</span>
                        <span className={"mfb-list-item-size"}
                              title={f.numChildren >= 0 ? f.numChildren + " children" : f.size + " bytes"}>
                            {f.numChildren >= 0 ? f.numChildren + "c" :
                                prettyBytes(f.size, {maximumFractionDigits: 0})
                                    .replace(/[ B]/, "")}
                        </span>&nbsp;
                    {/*</span>*/}
                    {f.actions}
                </div>
            })}
        </div>
    }
}