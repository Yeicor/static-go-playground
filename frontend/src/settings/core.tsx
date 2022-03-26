import {faGear, faPlus} from "@fortawesome/free-solid-svg-icons"
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome"
import ProgressBar from "@ramonak/react-progress-bar"
import React from "react"
import {openVirtualFS} from "../fs/fs"
import {CmdGoPath} from "../go/build"
import {goRun} from "../go/run"
import {setUpGoInstall} from "../go/setup"
import "./core.css"
import {VirtualFileBrowser} from "./vfs"

type SettingsState = {
    loadingProgress: number, // If >= 0, it is loading (downloading FS, compiling code, etc.). The maximum is 1.
    open: boolean, // Whether the settings are currently open.
    fs: any, // The current FileSystem
    buildTags: string, // Comma-separated build tags
    runArgs: string, // Shell run arguments
    runEnv: string, // Comma-separated run environment (= separated key and value)
    windows: Array<React.ReactNode> // reference to code editor windows currently open
}

export class Settings extends React.Component<{}, SettingsState> {
    vfsBrowser: React.RefObject<VirtualFileBrowser>

    constructor(props: {}, context: any) {
        super(props, context)
        this.vfsBrowser = React.createRef()
        this.state = {
            loadingProgress: 0.0,
            open: true,
            fs: openVirtualFS("memory", "default"), // TODO: Implement more & let the user choose
            buildTags: "example,tag",
            runArgs: "arg1 \"arg2 with spaces\"",
            runEnv: "VAR=VALUE,VAR2=VALUE2",
            windows: []
        }
    }

    setProgress = async (p: number) => this.setState((prevState) => ({...prevState, loadingProgress: p}))

    async componentDidMount() {
        // Set up root filesystem (go installation), while reporting progress
        await setUpGoInstall(this.state.fs, this.setProgress)
        await this.vfsBrowser.current.refreshFilesCwd() // Refresh the newly added files
        await goRun(this.state.fs, CmdGoPath, ["version"])[0]
        await this.setProgress(-1) // Loading finished!
    }

    openTrigger = () => {
        this.setState((prevState) => ({...prevState, open: !prevState.open}))
    }

    render() {
        return <div id={"sgp-settings"} className={"tooltip"}>
            {this.renderSettingsTrigger(this.state.loadingProgress)}
            {this.renderSettings()}
            {this.state.windows.map(e => <span key={performance.now()}>{e}</span>)}
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
            <div className={"settings-options settings-options-title"}>
                <h4>Files</h4>
                <button onClick={() => {
                    /*TODO*/
                }}><FontAwesomeIcon icon={faPlus}/></button>
            </div>
            <VirtualFileBrowser fs={this.state.fs} ref={this.vfsBrowser} setProgress={this.setProgress}
                                getBuildTags={() => this.state.buildTags.split(",")}
                                getRunArgs={() => commandArgs2Array(this.state.runArgs)}
                                getRunEnv={() => Object.assign({}, ...this.state.runEnv.split(",")
                                    .map((el) => ({[el.split("=")[0]]: el.split("=")[1]})))}
                                setOpenWindows={(mapper) => {
                                    return new Promise((resolve) => {
                                        this.setState((prevState) => ({
                                            ...prevState,
                                            windows: mapper(prevState.windows)
                                        }), async () => {
                                            await this.vfsBrowser.current.refreshFilesCwd()
                                            resolve(0)
                                        })
                                    })
                                }}/>
            <div className={"settings-options settings-options-title"}>
                <h4>Build settings</h4>
                <button onClick={() => {
                    /*TODO*/
                }}><FontAwesomeIcon icon={faPlus}/></button>
            </div>
            {/* TODO: Build os/arch */}
            <div className={"settings-options"}>
                <label htmlFor={"build-tags"}>Build tags: </label>
                <input id={"build-tags"} type={"text"} value={this.state.buildTags} onChange={(ev) =>
                    this.setState((prevState) => ({...prevState, buildTags: (ev.target as HTMLInputElement).value}))}/>
            </div>
            {/* TODO: Run on build */}
            <div className={"settings-options settings-options-title"}>
                <h4>Run settings</h4>
                <button onClick={() => {
                    /*TODO*/
                }}><FontAwesomeIcon icon={faPlus}/></button>
            </div>
            <div className={"settings-options"}>
                <label htmlFor={"run-args"}>Run args: </label>
                <input id={"run-args"} type={"text"} value={this.state.runArgs} onChange={(ev) =>
                    this.setState((prevState) => ({...prevState, runArgs: (ev.target as HTMLInputElement).value}))}/>
            </div>
            <div className={"settings-options"}>
                <label htmlFor={"run-env"}>Run env: </label>
                <input id={"run-env"} type={"text"} value={this.state.runEnv} onChange={(ev) =>
                    this.setState((prevState) => ({...prevState, runEnv: (ev.target as HTMLInputElement).value}))}/>
            </div>
            {/* TODO: Running notifier + force stop hack*/}
        </div>
    }
}

function commandArgs2Array(text: string): Array<string> {
    const re = /^"[^"]*"$/ // Check if argument is surrounded with double-quotes
    const re2 = /^([^"]|[^"].*?[^"])$/ // Check if argument is NOT surrounded with double-quotes

    let arr = []
    let argPart = null

    text && text.split(" ").forEach(function (arg) {
        if ((re.test(arg) || re2.test(arg)) && !argPart) {
            arr.push(arg)
        } else {
            argPart = argPart ? argPart + " " + arg : arg
            // If part is complete (ends with a double quote), we can add it to the array
            if (/"$/.test(argPart)) {
                arr.push(argPart.substring(1, argPart.length - 1))
                argPart = null
            }
        }
    })

    return arr
}