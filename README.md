# Static Go Playground

[![MIT license](https://img.shields.io/badge/License-MIT-blue.svg)](https://mit-license.org/)
[![Build](https://github.com/Yeicor/static-go-playground/actions/workflows/build-and-deploy.yaml/badge.svg)](https://github.com/Yeicor/static-go-playground/actions/workflows/deploy.yaml)

## Features

- Full Go Compiler running on the browser.
    - Supports using custom build tags.
    - Incremental builds (build cache).
    - Supports multiple files and packages (including dependencies).
    - Full cross-compiling support directly from your browser.
    - No need for a server backend to build executables.
    - Easy deployment (just upload the generated files).
- Full filesystem abstraction for both the compiler and running programs.
    - A standalone wasm_exec.js with filesystem support is available.
- Full DOM access for running programs (and basic stdout/stderr for now).
- Browser-based code editor ([Ace](https://ace.c9.io/)).

## [Try it out!](https://Yeicor.github.io/static-go-playground/)

Compiling and running examples from [Ebiten](https://ebiten.org):

![Go Playground demo](docs/demo-ebiten.gif)

Compiling and running modified examples:

![Go Playground editor demo](docs/demo-ebiten-editor.png)

Use this to provide editable demos for your projects!

### Instructions

1. Run `go mod vendor` on your [Go Module](https://go.dev/blog/using-go-modules) root.
2. Zip the project and upload it anywhere.
    1. Check that there are no [CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS) errors.
    2. You may use [CI](https://en.wikipedia.org/wiki/Continuous_integration) to perform these steps automatically, [like this workflow for ebiten](https://github.com/Yeicor/ebiten/blob/main/.github/workflows/playground.yml).
3. Publish the URL that automatically loads and builds your project.
    1. Take a look at [setup.ts](frontend/src/go/setup.ts) for more information on startup automation.
    2. For example, to automatically download ebiten's sources, build and run an example use [this URL](https://yeicor.github.io/static-go-playground/?fs_dl_/src=https://yeicor.github.io/ebiten/sources-latest.zip&build=/src/examples/chipmunk).

## How does it work?

This project builds the Go Compiler to WebAssembly and provides enough abstractions, fixes and hacks for it to be able
to build executables (for any platform) from the web. The main added abstraction is a virtual file system implementation
that works in memory (based on [virtualfs](https://www.npmjs.com/package/virtualfs)), which can also be used separately
with a custom wasm_exec.js. The frontend also runs the compiled code (if the target arch is js/wasm), with the same
features available.

The result is a static website that can compile and run *most* Go code (see known limitations below) from the client's
browser.

Why? To learn how the Go compiler works and to provide better (hackable) demos for most Go projects with easy
deployment.

### Standard library

There are 2 approaches to handle the standard library:

- Precompiling it while building the compiler: faster first compilation but requires a bigger (slower) initial download
  and only supports building for one OS/arch, unless another precompiled library is downloaded.
- Compiling the standard library from the browser (only the required packages): It allows to cross-compile to any
  OS/arch supported by Go at the cost of an slower initial build: compiled artifacts are cached once built for the first
  time (this happens automatically for all packages with unmodified sources).

A mix of both was applied: the precompiled standard library for js/wasm is downloaded. Cross-compiling is also possible
because the source code of the standard library is downloaded and used for any other OS/arch.

## Builds

You can download production builds from the [releases](https://github.com/Yeicor/static-go-playground/releases) or the
[github pages branch](https://github.com/Yeicor/static-go-playground/tree/gh-pages).

### Building from source

Dependencies:

- Go Compiler (Go 1.13 or later)
- `node` and `npm`/`yarn`
- Very common UNIX tools.

Just run `make`: it will output a static site to `dist/` that can be uploaded to any web server. To learn how it works,
start by looking at the [Makefile](Makefile).

To only generate the modified wasm_exec.js (already embedded if using the main app), run `make wasm_exec`.

## Known limitations

- Limitations of building on `js/wasm`:
    - No Cgo support.
- Limitations of running on `js/wasm`:
    - Limited network access (available: HTTP client, WebRTC...).
    - Limited persistent storage (not implemented yet, could be blocked/deleted by user).
- Dependencies must be vendored (due to limited network access).
- Slower than the native compiler, and may run out of memory for large projects.

## Related projects

Updated: 03/2022

- The official Go Playground ([link](https://go.dev/play/)): limited execution time, no DOM access, no output until the
  program finishes, [limited multi-package support](https://go.dev/play/p/BWJ4dcUqVfT).
- Better Go Playground ([link](https://goplay.tools/)): has an experimental webassembly runtime, but includes no
  filesystem abstraction and still requires a server backend to build the webassembly modules, no multi-package support.
- pdfcpu ([link](https://github.com/wcchoi/go-wasm-pdfcpu/blob/master/article.md)): Example of running a Go CLI tool on
  the web browser, inspiration for this project.
- Wasm go playground ([link](https://github.com/ccbrown/wasm-go-playground)): No standard library, no dependencies, no
  multi-file support, no cross-compilation, inspiration for this project
- Go Playground WASM ([link]()): Actually compiles [Goscript](https://github.com/oxfeeefeee/goscript) (a script language
  like Python or Lua written in Rust, with exactly the same syntax as Go's) instead of using the official Go Compiler.
