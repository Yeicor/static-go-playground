import {setChonkyDefaults, FullFileBrowser} from "chonky"
import {ChonkyIconFA} from "chonky-icon-fontawesome"
import React from "react"

setChonkyDefaults({iconComponent: ChonkyIconFA})

export class VirtualFileBrowser extends React.Component<{ fs: any }, {}> {

    constructor(props: { fs: any }, context: any) {
        super(props, context)
        this.state = {}
    }

    render() {
        return <div>
            The FileSystem: {/* TODO: Reload button */}
            <FullFileBrowser files={[{id: "b", name: "test"}, null]}/>
        </div>
    }
}
