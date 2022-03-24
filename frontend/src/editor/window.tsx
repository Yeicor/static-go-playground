import {CodeEditor, CodeEditorProps} from "./editor";
import React from "react";
import "./window.css"
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import Draggable from "react-draggable";
import {faClose} from "@fortawesome/free-solid-svg-icons";

export type CodeEditorWindowProps = CodeEditorProps & { onClose?: () => Promise<any> };

export class CodeEditorWindow extends React.Component<CodeEditorWindowProps, {}> {

    constructor(props: CodeEditorWindowProps, context: any) {
        super(props, context);
    }

    render() {
        return <Draggable handle="strong">
            <div className="box no-cursor window">
                <strong className="cursor window-top-bar">
                    <span className={"window-top-bar-fill"}>{this.props.path}</span>
                    <button onClick={this.props.onClose}><FontAwesomeIcon icon={faClose}/></button>
                </strong>
                <CodeEditor {...this.props}/>
            </div>
        </Draggable>
    }
}