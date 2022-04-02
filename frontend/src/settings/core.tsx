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
    buildRun: boolean, // Run after build
    buildInjectStopCode: boolean, // Inject stop code to code before compiling
    runArgs: string, // Shell run arguments
    runEnv: string, // Comma-separated run environment (= separated key and value)
    runStop?: () => Promise<void>, // If the Go code currently running, this is set to the force stop function
    windows: Array<[string, React.ReactNode]> // reference to code editor windows currently open
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
            buildRun: true,
            buildInjectStopCode: true,
            runArgs: "arg1 \"arg2 with spaces\"",
            runEnv: "VAR=VALUE,VAR2=VALUE2",
            runStop: undefined,
            windows: []
        }
    }

    setProgress = async (p: number) => this.setState((prevState) => ({...prevState, loadingProgress: p}))
    setRunStopFn = (runStop?: () => Promise<void>): () => Promise<void> => {
        this.setState((prevState) => ({...prevState, runStop: runStop}))
        return this.state.runStop // Returns the previous value
    }

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
            {this.state.windows.map(e => <span key={e[0]}>{e[1]}</span>)}
        </div>
    }

    renderSettingsTrigger = (loadingProgress: number) => {
        return <button onClick={this.openTrigger}>
            <FontAwesomeIcon icon={faGear} className={loadingProgress < 0 && !this.state.runStop ? "" : "spinning"}/>
            {loadingProgress < 0 ? "" :
                <ProgressBar completed={loadingProgress * 100} height={"5px"} animateOnRender isLabelVisible={false}
                             bgColor={"rgb(212, 56, 256)"} baseBgColor={"rgb(53, 14, 77)"}/>}
        </button>
    }

    renderSettings = () => {
        return <div
            className={"tooltip-content settings-tooltip collapsible-parent" + (this.state.open ? " tooltip-visible" : "")}>
            <div className={"settings-options settings-options-title"}>
                <h4>Files</h4>
                <a href={"https://github.com/Yeicor/static-go-playground"} target={"_blank"} title={"File an issue/improve me"}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" style={{"verticalAlign": "middle"}}><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                </a>
                <button onClick={() => this.setState((prevState) => ({
                    ...prevState,
                    openHeaders: [!prevState.openHeaders[0], ...prevState.openHeaders.slice(-2)]
                }))}><FontAwesomeIcon icon={this.state.openHeaders[0] ? faAngleUp : faAngleDown}/></button>
            </div>
            <div className={"collapsible" + (this.state.openHeaders[0] ? " collapsible-expanded" : "")}>
                <VirtualFileBrowser fs={this.state.fs} ref={this.vfsBrowser} setProgress={this.setProgress}
                                    getBuildTarget={() => this.state.buildTarget.split("/") as any}
                                    getBuildTags={() => this.state.buildTags.split(",")}
                                    getBuildRun={() => this.state.buildRun}
                                    getBuildInjectStopCode={() => this.state.buildInjectStopCode}
                                    getRunArgs={() => commandArgs2Array(this.state.runArgs)}
                                    getRunEnv={() => Object.assign({}, ...this.state.runEnv.split(",")
                                        .map((el) => ({[el.split("=")[0]]: el.split("=")[1]})))}
                                    setRunStopFn={this.setRunStopFn}
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
                    openHeaders: [...prevState.openHeaders.slice(0, 1), !prevState.openHeaders[1], ...prevState.openHeaders.slice(-1)]
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
                <div className={"settings-options"}>
                    <label htmlFor={"build-stop"}>Inject stop code: </label>
                    <span style={{"flex": "100000000"}}/>
                    <input id={"build-stop"} type={"checkbox"} checked={this.state.buildInjectStopCode}
                           onChange={(ev) =>
                               this.setState((prevState) => ({...prevState, buildInjectStopCode: ev.target.checked}))}
                           title={"Automatically try to run built executables after a successful compilation"}/>
                </div>
                <div className={"settings-options"}>
                    <label htmlFor={"build-run"}>Run after build: </label>
                    <span style={{"flex": "100000000"}}/>
                    <input id={"build-run"} type={"checkbox"} checked={this.state.buildRun} onChange={(ev) =>
                        this.setState((prevState) => ({...prevState, buildRun: ev.target.checked}))}
                           title={"Automatically try to run built executables after a successful compilation"}/>
                </div>
            </div>
            <div className={"settings-options settings-options-title"}>
                <h4>Run settings</h4>
                <button onClick={() => this.setState((prevState) => ({
                    ...prevState,
                    openHeaders: [...prevState.openHeaders.slice(0, 2), !prevState.openHeaders[2]]
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
                <div className={"settings-options"}>
                    <label htmlFor={"run-stop"}>{this.state.runStop ?
                        <span style={{"color": "green"}}>Running</span> : "Not running"} </label>
                    <input id={"run-stop"} type={"button"} disabled={!this.state.runStop} value={"Force stop"}
                           onClick={this.state.runStop}
                           title={"Stop the running process (only works if hack ---enabled above--- is applied on compilation)"}/>
                </div>
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