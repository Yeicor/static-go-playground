import {faClose} from "@fortawesome/free-solid-svg-icons"
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome"
import React from "react"
import Draggable from "react-draggable"
import {CodeEditor, CodeEditorProps} from "./editor"
import "./window.css"

export type CodeEditorWindowProps = CodeEditorProps & { onClose?: () => Promise<any> }

export class CodeEditorWindow extends React.Component<CodeEditorWindowProps, {}> {

    constructor(props: CodeEditorWindowProps, context: any) {
        super(props, context)
    }

    render() { // TODO: Resizable code editor windows
        return <Draggable handle="strong">
            <div className="box no-cursor window">
                <strong className="cursor window-top-bar">
                    <span>{this.props.path}</span>
                    <button onClick={this.props.onClose}><FontAwesomeIcon icon={faClose}/></button>
                </strong>
                <CodeEditor {...this.props}/>
            </div>
        </Draggable>
    }
}