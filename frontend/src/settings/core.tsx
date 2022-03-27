import {faAngleDown, faAngleUp, faGear} from "@fortawesome/free-solid-svg-icons"
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome"
import ProgressBar from "@ramonak/react-progress-bar"
import React from "react"
import {openVirtualFS} from "../fs/fs"
import {CmdGoPath} from "../go/build"
import {goRun} from "../go/run"
import {setUpGoInstall} from "../go/setup"
import {SupportedTargets} from "../go/targets.gen"
import "./core.css"
import {VirtualFileBrowser} from "./vfs"

type SettingsState = {
    loadingProgress: number, // If >= 0, it is loading (downloading FS, compiling code, etc.). The maximum is 1.
    open: boolean, // Whether the settings are currently open.
    openHeaders: Array<boolean>, // Whether the settings headers are currently open.
    fs: any, // The current FileSystem
    buildTarget: string, // OS/arch for build target
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
            openHeaders: [true, true, true],
            fs: openVirtualFS("memory", "default"), // TODO: Implement more & let the user choose
            buildTarget: "js/wasm",
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
        await goRun(this.state.fs, CmdGoPath, ["version"]).runPromise
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
        return <div className={"tooltip-content settings-tooltip collapsible-parent" + (this.state.open ? " tooltip-visible" : "")}>
            <div className={"settings-options settings-options-title"}>
                <h4>Files</h4>
                <button onClick={() => this.setState((prevState) => ({
                    ...prevState,
                    openHeaders: [!prevState.openHeaders[0], ...prevState.openHeaders.slice(-2)],
                }))}><FontAwesomeIcon icon={this.state.openHeaders[0] ? faAngleUp : faAngleDown}/></button>
            </div>
            <div className={"collapsible" + (this.state.openHeaders[0] ? " collapsible-expanded" : "")}>
                <VirtualFileBrowser fs={this.state.fs} ref={this.vfsBrowser} setProgress={this.setProgress}
                                    getBuildTarget={() => this.state.buildTarget.split("/") as any}
                                    getBuildTags={() => this.state.buildTags.split(",")}
                                    getRunArgs={() => commandArgs2Array(this.state.runArgs)}
                                    getRunEnv={() => Object.assign({}, ...this.state.runEnv.split(",")
                                        .map((el) => ({[el.split("=")[0]]: el.split("=")[1]})))}
                                    setOpenWindows={(mapper) => new Promise((resolve) => this.setState(
                                        (prevState) => ({...prevState, windows: mapper(prevState.windows)}),
                                        async () => {
                                            await this.vfsBrowser.current.refreshFilesCwd()
                                            resolve(0)
                                        }))}/>
            </div>
            <div className={"settings-options settings-options-title"}>
                <h4>Build settings</h4>
                <button onClick={() => this.setState((prevState) => ({
                    ...prevState,
                    openHeaders: [...prevState.openHeaders.slice(0, 1), !prevState.openHeaders[1], ...prevState.openHeaders.slice(-1)],
                }))}><FontAwesomeIcon icon={this.state.openHeaders[1] ? faAngleUp : faAngleDown}/></button>
            </div>
            <div className={"collapsible" + (this.state.openHeaders[1] ? " collapsible-expanded" : "")}>
                <div className={"settings-options"}>
                    <label htmlFor={"target-arch"}>Target OS/arch: </label>
                    <select value={this.state.buildTarget}
                            onChange={(ev) => this.setState((prevState) =>
                                ({...prevState, buildTarget: ev.target.value}))}
                            title={"Target executable OS/arch for cross-compilation"}>
                        {SupportedTargets.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                </div>
                <div className={"settings-options"}>
                    <label htmlFor={"build-tags"}>Build tags: </label>
                    <input id={"build-tags"} type={"text"} value={this.state.buildTags} onChange={(ev) =>
                        this.setState((prevState) => ({...prevState, buildTags: ev.target.value}))}
                           title={"Comma-separated build-tags to select included files in compilation"}/>
                </div>
                {/* TODO: Run on build */}
            </div>
            <div className={"settings-options settings-options-title"}>
                <h4>Run settings</h4>
                <button onClick={() => this.setState((prevState) => ({
                    ...prevState,
                    openHeaders: [...prevState.openHeaders.slice(0, 2), !prevState.openHeaders[2]],
                }))}><FontAwesomeIcon icon={this.state.openHeaders[2] ? faAngleUp : faAngleDown}/></button>
            </div>
            <div className={"collapsible" + (this.state.openHeaders[2] ? " collapsible-expanded" : "")}>
                <div className={"settings-options"}>
                    <label htmlFor={"run-args"}>Run args: </label>
                    <input id={"run-args"} type={"text"} value={this.state.runArgs} onChange={(ev) =>
                        this.setState((prevState) => ({...prevState, runArgs: (ev.target as HTMLInputElement).value}))}
                           title={"Command line arguments (bash-like interpretation)"}/>
                </div>
                <div className={"settings-options"}>
                    <label htmlFor={"run-env"}>Run env: </label>
                    <input id={"run-env"} type={"text"} value={this.state.runEnv} onChange={(ev) =>
                        this.setState((prevState) => ({...prevState, runEnv: (ev.target as HTMLInputElement).value}))}
                           title={"Comma-separated environment variables, containing key and value separated by equals"}/>
                </div>
                {/* TODO: Running notifier + force stop hack*/}
            </div>
        </div>
    }
}

function commandArgs2Array(text: string): Array<string> {
    const re = /^"[^"]*"$/ // Check if argument is surrounded with double-quotes
    const re2 = /^([^"]|[^"].*?[^"])$/ // Check if argument is NOT surrounded with double-quotes

    let arr = []
    let argPart = null

    text.split(" ").forEach(function (arg) {
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