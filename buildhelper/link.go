package main

import (
	"os"
	"path/filepath"
)

func link(importCfg *os.File, linkPackages []string, commands [][]string, buildDir string) [][]string {
	// Final link command
	outFile := filepath.Join(buildDir, "a.out")
	linkCommand := []string{
		"link",
		"-o", outFile,
		"-buildmode=exe",
		"-importcfg", importCfg.Name(),
	}
	linkCommand = append(linkCommand, linkPackages...)
	commands = append(commands, linkCommand)
	return commands
}
