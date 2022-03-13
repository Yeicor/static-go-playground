import * as React from "react"
import {render} from "react-dom"
import {Settings} from "./settings/core"

const App = () => {
    return (<>
        <Settings/>
    </>)
}

// Try to avoid conflicts with other running code: use non-generic IDs and use only one root body element
render(<App/>, document.getElementById("sgp-root"))
