import {faGear} from "@fortawesome/free-solid-svg-icons"
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome"
import ProgressBar from "@ramonak/react-progress-bar"
import React from "react"
import {openVirtualFS} from "../fs/fs"
import {CmdGoPath, goRun} from "../go/build"
import {setUpGoInstall} from "../go/setup"
import "./core.css"
import {VirtualFileBrowser} from "./vfs"

type SettingsState = {
    loadingProgress: number, // If >= 0, it is loading (downloading FS, compiling code, etc.). The maximum is 1.
    open: boolean, // Whether the settings are currently open.
    fs: any // The current FileSystem
    buildTags: string // Comma-separated build tags
}

export class Settings extends React.Component<{}, SettingsState> {
    vfsBrowser: React.RefObject<VirtualFileBrowser>

    constructor(props: {}, context: any) {
        super(props, context)
        this.vfsBrowser = React.createRef()
        this.state = {
            loadingProgress: 0.0,
            open: true,
            fs: openVirtualFS("memory", "default"), // TODO: Let the user choose (GET params?)
            buildTags: "",
        }
    }

    setProgress = async (p: number) => this.setState((prevState) => ({...prevState, loadingProgress: p}))

    async componentDidMount() {
        // Set up root filesystem (go installation), while reporting progress

        await setUpGoInstall(this.state.fs, this.setProgress)
        await this.vfsBrowser.current.refreshFilesCwd() // Refresh the newly added files
        await goRun(this.state.fs, CmdGoPath, ["version"])
        await this.setProgress(-1) // Loading finished!
    }

    openTrigger = () => {
        this.setState((prevState) => ({...prevState, open: !prevState.open}))
    }

    render() {
        return <div id={"sgp-settings"} className={"tooltip"}>
            {this.renderSettingsTrigger(this.state.loadingProgress)}
            {this.renderSettings()}
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
        return <div className={"tooltip-content settings-tooltip" + (this.state.open ? " tooltip-visible" : "")}>
            <VirtualFileBrowser fs={this.state.fs} ref={this.vfsBrowser} setProgress={this.setProgress}
                                getBuildTags={() => this.state.buildTags.split(",")}/>
            <div className={"settings-options"}>
                <label htmlFor={"build-tags"}>Build tags: </label>
                <input id={"build-tags"} type={"text"} value={this.state.buildTags} onChange={(ev) =>
                    this.setState((prevState) => ({...prevState, buildTags: (ev.target as HTMLInputElement).value}))}/>
            </div>
        </div>
    }
}

