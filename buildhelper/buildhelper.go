package main

import (
	"go/build"
	"log"
	"os"
	"path/filepath"
	"strings"
)

func main() {
	if len(os.Args) != 4 {
		log.Fatal("Usage: ", os.Args[0], " <input-go-package> <output-dir> <build-tag1,build-tag2>\n"+
			"Environment variables:\n"+
			" - ALSO_EXECUTE_COMMANDS: if set, executes all command after generating them to build the executable\n")
	}
	Run(os.Args[1], os.Args[2], strings.Split(os.Args[3], ","))
}

func Run(input, buildDir string, buildTags []string) {
	buildDir, err := filepath.Abs(buildDir)
	if err != nil {
		log.Fatal(err)
	}
	// Parse import tree (using custom tags)
	buildCtx := build.Default
	buildCtx.BuildTags = append(buildCtx.BuildTags, buildTags...)
	parsedTree, precompiledInternal, err := parse(input, buildDir, buildCtx)
	if err != nil {
		log.Fatal(err)
	}
	// Generate compile commands
	importCfg, commands, linkPackages, err := compile(parsedTree, buildDir, precompiledInternal, buildCtx)
	if err != nil {
		log.Fatal(err)
	}
	// Generate final link command
	commands = link(importCfg, linkPackages, commands, buildDir)
	// Output
	output(commands, buildDir, err)
}
