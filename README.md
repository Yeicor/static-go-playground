# Static Go Playground

<!-- TODO: Tags -->
[![Build](https://github.com/Yeicor/static-go-playground/actions/workflows/deploy.yaml/badge.svg)](https://github.com/Yeicor/static-go-playground/actions/workflows/deploy.yaml)

## [TODO: Try it!]

TODO: instructions

## Features

- Full Go Compiler running on the browser: no load for the server & can be deployed easily.
    - Supports multiple files and packages (including dependencies!).
    - Supports using custom build tags.
- Full filesystem abstraction (TODO: optionally persistent) for both the compiler and running programs.
- Full DOM access for running programs (and very basic terminal emulation, stdout/stderr-only for now).
- [ ] Code editor ([Ace](https://ace.c9.io/)).

## Go Compiler on browser

This project builds the Go Compiler to WASM and provides enough abstractions, fixes and hacks for it to be able to build
executables (for any platform) from the web. It also runs the compiled code, with the same features available.

The result is a static website that can compile and run *most* Go code (see Known limitations below) from the client's
browser.

Why? To learn how the Go compiler works and to provide better (hackable) demos for most Go projects with easy
deployment.

### Do you only want to extend wasm_exec.js with filesystem support?

Download it from [TODO].

WARNING: The filesystem is good enough for the Go compiler to work, but may still have some bugs: open an issue if you
find one.

### Use it to provide hackable examples for your Go project!

TODO: instructions

## Building from source

Dependencies:

- Go Compiler (TODO: minimum version)
- `node` and `npm`/`yarn`
- Very common UNIX tools.

Just run `make`: it will output a static site to `dist/` that can be uploaded to any web server.

Alternatively, you can just download the latest [TODO: artifact.zip].

## Known limitations

- Limitations of building and running on `js/wasm`:
    - Limited network access (available: HTTP client, WebRTC...).
    - Limited persistent storage (can be blocked/deleted by user).
    - No Cgo support.
- Dependencies must be vendored (due to limited network access).

## Related projects

- https://github.com/ccbrown/wasm-go-playground
- https://github.com/wcchoi/go-wasm-pdfcpu/blob/master/article.md
