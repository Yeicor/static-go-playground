import React, {ChangeEvent} from "react"

export type FileTopBarProps = { cwd: string, trySetCwd?: (newCwd: string) => Promise<void>, children: React.ReactNode }

export class FileTopBar extends React.PureComponent<FileTopBarProps, { cwdTmp: string }> {
    constructor(props: FileTopBarProps, context: any) {
        super(props, context)
        this.state = {
            cwdTmp: this.props.cwd
        }
    }

    componentDidUpdate(prevProps: Readonly<FileTopBarProps>, prevState: Readonly<{ cwdTmp: string }>, snapshot?: any) {
        if (prevProps.cwd !== this.props.cwd) {
            this.setState((prevState2) => ({...prevState2, cwdTmp: this.props.cwd}))
        }
    }

    onCwdKeyUp = async (ev: KeyboardEvent) => {
        if (ev.key === "Enter") {
            await this.props.trySetCwd!(this.state.cwdTmp)
        }
    }

    onCwdChange = (ev: ChangeEvent) => {
        let newCwd = (ev.target as HTMLInputElement).value
        this.setState((prevState) => ({...prevState, cwdTmp: newCwd}))
    }

    render() {
        return <div className={"mfb-top-bar"}>
            <input type={"text"} className={"mfb-top-bar-cwd"} value={this.state.cwdTmp}
                   disabled={!this.props.trySetCwd} onChange={this.onCwdChange}
                   onKeyUp={(e) => this.onCwdKeyUp(e as any)}/>
            {this.props.children}
        </div>
    }
}