import {faGear} from "@fortawesome/free-solid-svg-icons"
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome"
import ProgressBar from "@ramonak/react-progress-bar"
import React from "react"
import {openVirtualFS} from "../fs/fs"
import {runGoAsync, CmdGoPath} from "../go/build"
import {setUpGoInstall} from "../go/setup"
import "./core.css"
import {VirtualFileBrowser} from "./fs"

type SettingsState = {
    loadingProgress: number, // If >= 0, it is loading (downloading FS, compiling code, etc.). The maximum is 1.
    open: boolean, // Whether the settings are currently open.
    fs: any // The current FileSystem
}

export class Settings extends React.Component<{}, SettingsState> {

    constructor(props: {}, context: any) {
        super(props, context)
        this.state = {
            loadingProgress: 0.0,
            open: true,
            fs: openVirtualFS("memory", "default") // TODO: Let the user choose (GET params?)
        }
    }

    async componentDidMount() {
        // Set up root filesystem (go installation), while reporting progress
        let progressHandler = async (p: number) => this.setState((prevState) => ({...prevState, loadingProgress: p}))
        await setUpGoInstall(this.state.fs, progressHandler)
        await progressHandler(-1) // Loading finished!
        await runGoAsync(this.state.fs, CmdGoPath, ["version"])
    }

    openTrigger = () => {
        this.setState((prevState) => ({...prevState, open: !prevState.open}))
    }

    render() {
        return <div id={"sgp-settings"} className={"tooltip"}>
            {this.renderSettingsTrigger(this.state.loadingProgress)}
            {this.state.open ? this.renderSettings() : <></>}
        </div>
    }

    renderSettingsTrigger = (loadingProgress: number) => {
        return <button onClick={this.openTrigger}>
            <FontAwesomeIcon icon={faGear} className={loadingProgress < 0 ? "" : "spinning"}/>
            {loadingProgress < 0 ? "" :
                <ProgressBar completed={loadingProgress * 100} height={"5px"} animateOnRender isLabelVisible={false}
                             bgColor={"rgb(212, 56, 256)"} baseBgColor={"rgb(53, 14, 77)"}/>}
        </button>
    }

    renderSettings = () => {
        return <div className={"tooltip-content"}>
            Settings!
            <VirtualFileBrowser fs={this.state.fs}/>
        </div>
    }
}

