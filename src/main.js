function setLoading(isLoading = false) {
    let spinner = $("#settings-toggle > div");
    if (isLoading) {
        spinner.addClass('spinning')
    } else {
        spinner.removeClass('spinning')
    }
}

// Wait for fs to load
function whenAvailable(name, callback) {
    const interval = 100; // ms
    window.setTimeout(function () {
        setLoading(true)
        if (name in window) {
            callback(window[name]);
        } else {
            whenAvailable(name, callback);
        }
    }, interval);
}

function fsAsync(fs, method, fsUrl, extra) {
    return new Promise(((resolve, reject) => {
        let cb = (err, data) => {
            if (err) {
                reject(err)
            } else {
                resolve(data)
            }
        };
        if (extra) {
            // noinspection JSUnresolvedFunction
            fs[method](fsUrl, extra, cb)
        } else {
            // noinspection JSUnresolvedFunction
            fs[method](fsUrl, cb)
        }
    }));
}

// Wait for VirtualFS (fake filesystem implementation for the browser)
whenAvailable("fs", async (fs) => { // Defined by wasm_exec.js
    let Buffer = window["Buffer"]

    // TODO: Web worker for compilation
    // TODO: Find a way to stop previously running WASM code: possibly with a goStop() function provided by the user that does os.Exit(0) or disables all callbacks

    let cachedWasmModules = {} // fs URL to WASM bytes (needed as full file read from virtual fs is slow for some reason)
    const wasmMagic = Buffer.from("\0asm")
    // Extract ZIP into virtual filesystem for both initial fs and the uploaded sources to compile
    const fsExtractZip = async (zipBytes, extractAt) => {
        const zip = new JSZip();
        const zipData = await zip.loadAsync(zipBytes)
        let allPromises = []
        zipData.forEach((relativePath, file) => {
            let decompressionPromise = (async () => {
                let fileNewPath = extractAt + relativePath;
                if (file.dir) {
                    // noinspection JSUnresolvedFunction
                    await fs.mkdir(fileNewPath)
                } else {
                    let decompressedBytes = await file.async("uint8array");
                    let buf = Buffer.from(decompressedBytes)
                    if (buf.slice(0, wasmMagic.length).indexOf(wasmMagic) === 0) {
                        console.log("Caching WASM module:", fileNewPath)
                        cachedWasmModules[fileNewPath] = buf
                    }
                    // console.log(relativePath, file, decompressedBytes)
                    await fs.writeFile(fileNewPath, buf)
                }
            })
            allPromises.push(decompressionPromise())
        })
        await Promise.all(allPromises)
    }
    const fsDeleteRecursive = async (path) => {
        let stat = await fsAsync(fs, "stat", path)
        if (stat.isDirectory()) {
            // Delete contents first
            let dirEntries = await fsAsync(fs, "readdir", path)
            await Promise.all(dirEntries.map(async e => {
                await fsDeleteRecursive(path + "/" + e)
            }))
            // Now delete the directory
            await fsAsync(fs, "rmdir", path)
        } else {
            // Just delete the file
            await fsAsync(fs, "unlink", path)
        }
    }

    let inputSourcesZip = $("#input-sources-zip");

    function setupUI() {
        // Set up extra Web-only settings (like manual code upload)
        $("#settings-toggle").click((ev) => {
            console.log("Clicked settings toggle", ev)
            $("#settings").toggleClass("tooltip-text-active")
        })
        // Manual file upload
        inputSourcesZip.change(() => {
            alert("Still loading, wait for it... (or check logs)")
        })

        // TODO: Set up the body as a code dropzone (for easier manual code loads)
    }

    setupUI()

    await fsExtractZip(await (await fetch('fs.zip')).arrayBuffer(), '/')

    // noinspection JSUnresolvedFunction
    await fs.writeFile('/src/go.mod', Buffer.from('module example.com/my/thing\n\ngo 1.17'))
    // noinspection JSUnresolvedFunction
    await fs.writeFile('/src/main.go', Buffer.from('package main\nfunc main() { println("Hello world!")\ncallMe() }'))
    // noinspection JSUnresolvedFunction
    await fs.writeFile('/src/main2.go', Buffer.from('package main\nfunc callMe() { println("Called on different file!") }'))
    // await fs.writeFile('/src/main3.go', Buffer.from('package main\nimport "example.com/my/thing/pack"\nfunc callMePackage() { pack.callMe() }'))
    // noinspection JSUnresolvedFunction
    // fs.mkdirSync('/src/pack', 0o744)
    // noinspection JSUnresolvedFunction
    // await fs.writeFile('/src/pack/impl.go', Buffer.from('package pack\nfunc callMe() { println("Called on different package!") }'))

    // await fs.writeFile(wasmGoPath, Buffer.from(await (await fetch('go.wasm')).arrayBuffer()))
    // BFSUtils.mkdirpSync('/usr/lib/go/pkg/tool/js_wasm', 0o744, fs)
    // await fs.writeFile(wasmCompilePath, Buffer.from(await (await fetch('compile.wasm')).arrayBuffer()))
    // await fs.writeFile(wasmLinkPath, Buffer.from(await (await fetch('link.wasm')).arrayBuffer()))
    // BFSUtils.mkdirpSync('/prebuilt', 0o744, fs)
    // // let wasmExamplePath = '/prebuilt/example.wasm';
    // // await fs.writeFile(wasmExamplePath, Buffer.from(await (await fetch('example.wasm')).arrayBuffer()))
    // BFSUtils.mkdirpSync('/tmp', 0o744, fs)
    // BFSUtils.mkdirpSync('/src', 0o744, fs)

    const runGoAsync = async (fsUrl, argv = [], cwd = '/', env = {
        'GOPATH': '/gopath',
        'GOROOT': '/usr/lib/go',
    }) => {
        console.warn("========================== runGoAsync:", fsUrl, argv, cwd, env, "==========================")
        fs.chdir(cwd)
        // if (!(fsUrl.length > 0 && fsUrl[0] === '/')) {
        //     fsUrl = cwd + fsUrl
        // }
        const go = new Go();
        // Read from virtual FS (should be very fast and not benefit from streaming compilation)
        let wasmBytes;
        if (fsUrl in cachedWasmModules) { // Fast-path: use precached WASM buffer
            wasmBytes = cachedWasmModules[fsUrl]
        } else { // Read from file
            wasmBytes = await fsAsync(fs, "readFile", fsUrl)
        }
        // noinspection JSUnresolvedVariable,JSCheckFunctionSignatures
        let tmp = await WebAssembly.instantiate(wasmBytes, go.importObject)
        go.argv = go.argv.concat(argv) // First is the program name, already set
        go.env = env
        // noinspection JSUnresolvedFunction
        await go.run(tmp.instance);
    }

    const performBuildInternal = async (commands, cwd) => {
        for (let i = 0; i < commands.length; i++) {
            let commandParts = commands[i];
            // Add full path to go installation for tool command (works for compile and link)
            commandParts[0] = "/usr/lib/go/pkg/tool/js_wasm/" + commandParts[0]
            await runGoAsync(commandParts[0], commandParts.slice(1), cwd)
        }
    }

    // // Bootstrap our build helper now (need to build it with the same compiler in order for go/build package to work)
    // let buildHelperDir = "/tmp/buildhelper-src"
    // let buildHelperExe = buildHelperDir + "/buildhelper"
    let buildHelperExe = "/usr/lib/go/bin/buildhelper"
    // let buildHelperGoFiles = (await fs.readdirSync(buildHelperDir)).filter(file => file.endsWith('.go') && !file.endsWith('_test.go'))
    // await performBuildInternal([
    //     ['compile', '-o', '_pkg_.a', '-pack'].concat(buildHelperGoFiles),
    //     ['link', '-o', buildHelperExe, '-buildmode=exe', '_pkg_.a'],
    // ], buildHelperDir)

    // performBuild will build any source directory with vendored dependencies (go mod vendor), to the given exe
    const performBuild = async (sourcePackageDir, outputExe) => {
        let buildFilesTmpDir = '/tmp/build';
        // Automatic mode: using the buildhelper compiled above, which relies on Go's internal build system
        await fs.mkdir(buildFilesTmpDir)
        // Generate the files
        await runGoAsync(buildHelperExe, ['.', buildFilesTmpDir], sourcePackageDir)
        // Read generated commands
        let commandsJson = await fsAsync(fs, "readFile", buildFilesTmpDir + '/commands.json', 'utf-8');
        console.log('Read commands file:', commandsJson)
        let commandsArray = JSON.parse(commandsJson);
        // Execute all compile and link commands to generate a.out
        await performBuildInternal(commandsArray, buildFilesTmpDir);
        // Move to wanted location
        await fs.rename(buildFilesTmpDir + '/a.out', outputExe)
        // Clean up build files
        await fsDeleteRecursive(buildFilesTmpDir)
    }

    // TODO: find all main packages (func main()) within a directory (to auto-detect uploaded code examples)

    // Start the demo WASM
    // noinspection ES6MissingAwait
    // runGoAsync(wasmExamplePath)

    await performBuild('/src/', '/src/a.out')
    await runGoAsync('a.out', [], '/src')

    // // Manual mode
    // await runGoAsync(wasmCompilePath, ['-v', 'main.go', 'main2.go'/*, 'main3.go', 'pack/impl.go'*/], '/src/')
    // // await runGoAsync(wasmLinkPath, ['--help'])
    // await runGoAsync(wasmLinkPath, ['-v', 'main.o'], '/src/')
    // await runGoAsync('a.out', [], '/src/') // !!!

    // DEBUG
    window.fsDeleteRecursive = fsDeleteRecursive
    window.performBuild = performBuild
    window.runGoAsync = runGoAsync

    setLoading(false)

    // Finally, set up sources upload listener
    inputSourcesZip.off('change')
    inputSourcesZip.change((ev) => {
        setLoading(true)
        console.log("Selected sources file", ev)
        const reader = new FileReader()
        reader.readAsArrayBuffer(ev.target.files[0])
        reader.onload = async function (e) {
            const zipBytes = new Uint8Array(e.target.result)
            console.log("Deleting previous sources...")
            await fsDeleteRecursive('/src/')
            await fsAsync(fs, 'mkdir', '/src/')
            console.log("Extracting source zip to /src/...")
            await fsExtractZip(zipBytes, '/src/')
            console.log("Building contents of /src/...")
            await performBuild('/src/', '/src/a.out')
            console.log("Running /src/a.out...")
            await runGoAsync('a.out', [], '/src')
            setLoading(false)
        }
    })

})
