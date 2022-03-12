# Build helper

A tool that given a source directory of a main package of Go returns the list of low-level commands needed to compile it
including all dependencies (it also generates the required configuration files)

```shell
$ go run . <sources-directory> <tmp-build-directory>
```

`<tmp-build-directory>/commands.json` will contain a list of commands to execute for compiling an executable to
`<tmp-build-directory>/a.out`.

# Why?

This tool is needed because, although the `go` command can be compiled to WASM, `go build` can't run properly (it
expects to be able to spawn processes, etc.). However, lower-level compile tools can run mostly fine given a filesystem
abstraction (`go tool compile`/`go tool link`).

Hence, this tool acts as a replacement for `go build` generating arguments and configuration files for building an
executable. This tool is implemented in Golang to reuse Go's parser, build constraints, etc.


