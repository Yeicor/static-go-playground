import React from "react"
import AceEditor from "react-ace";
import {readCache, writeCache} from "../fs/utils"

import "ace-builds/src-noconflict/mode-golang"
import "ace-builds/src-noconflict/mode-text"
import "ace-builds/src-noconflict/theme-github"

export type CodeEditorProps = { fs: any; path: string }
export type CodeEditorState = { code: string, editorID: string, working: boolean }

const textEncoder = new TextEncoder() // NOTE: Assumes UTF-8 files
const textDecoder = new TextDecoder() // NOTE: Assumes UTF-8 files

export class CodeEditor extends React.Component<CodeEditorProps, CodeEditorState> {
    constructor(props: CodeEditorProps, context: any) {
        super(props, context)
        this.state = {code: "loading...", editorID: "code-editor-" + performance.now(), working: true}
        this.forceUpdateCode().then(undefined)
    }

    forceUpdateCode = async () => {
        let uint8Array = await readCache(this.props.fs, this.props.path)
        let contents = textDecoder.decode(uint8Array)
        this.setState((prevState) => ({...prevState, code: contents, working: false}))
    }

    onChange = async (newContents: string) => {
        if (this.state.working) return // Ignore updates while loading
        this.setState((prevState) => ({...prevState, working: true}), async () => {
            // Save on every write (in background, after updating the state) FIXME: Data races?
            let uint8Array = textEncoder.encode(newContents)
            await writeCache(this.props.fs, this.props.path, uint8Array)
            this.setState((prevState) => ({...prevState, code: newContents, working: false}))
        })
    }

    render() {
        return <AceEditor
            mode={this.props.path.endsWith(".go") ? "golang" : "text"}
            theme="github"
            onChange={this.onChange}
            value={this.state.code}
            name={this.state.editorID}
            style={{"height": "calc(100% - 27px)", "width": "100%", "marginTop": "-10px"}}
        />
    }
}
