package main

import (
	"log"
	"os"
	"path/filepath"
)

func main() {
	if len(os.Args) != 3 {
		log.Fatal("Usage: ", os.Args[0], " <input-go-package> <output-dir>")
	}
	Run(os.Args[1], os.Args[2])
}

func Run(input, buildDir string) {
	buildDir, err := filepath.Abs(buildDir)
	if err != nil {
		log.Fatal(err)
	}
	// Parse import tree
	parsedTree, err := parse(input)
	if err != nil {
		log.Fatal(err)
	}
	// Generate compile commands
	err, importCfg, commands, linkPackages := compile(parsedTree, buildDir)
	if err != nil {
		log.Fatal(err)
	}
	// Generate final link command
	commands = link(importCfg, linkPackages, commands, buildDir)
	// Output
	output(commands, buildDir, err)
}
