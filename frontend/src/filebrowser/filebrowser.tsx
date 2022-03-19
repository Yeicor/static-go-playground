import React from "react"
import {FileList, FileListProps} from "./list"
import "./style.css"
import {FileTopBar, FileTopBarProps} from "./topbar"

export type FileData = {
    name: string,
    size: number, // The size of the file in bytes
    numChildren: number, // Number of children (only >= 0 for directories)
    actions: React.ReactNode
}

type FileBrowserProps = {} & FileTopBarProps & FileListProps

/**
 * This FileBrowser shows all files contained within a Current Working Directory (cwd), with custom actions for each
 */
export class FileBrowser extends React.Component<FileBrowserProps, {}> {

    constructor(props: FileBrowserProps, context: any) {
        super(props, context)
    }

    render() {
        return <div className={"mfb"}>
            <FileTopBar {...this.props}>
                {this.props.children as React.ReactChildren}
            </FileTopBar>
            <FileList {...this.props} />
        </div>
    }
}