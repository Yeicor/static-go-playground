package main

import (
	"errors"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"strings"
)

func compile(t *parsedTreeNode, buildDir string) (*os.File, [][]string, []string, error) {
	importCfg, err := os.OpenFile(filepath.Join(buildDir, "importCfg"), os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
	if err != nil {
		return nil, nil, nil, err
	}
	commands, linkPackages, err := compileRecursive(t, true, importCfg, buildDir, nil, nil)
	if err != nil {
		return nil, nil, nil, err
	}
	// Add all standard (precompiled) library packs to importCfg
	pkgPath := goPkgPath()
	err = filepath.Walk(pkgPath, func(path string, info fs.FileInfo, err error) error {
		if strings.HasSuffix(path, ".a") {
			importPath := strings.Replace(path[:len(path)-2], pkgPath+"/", "", 1)
			importPath = strings.Replace(importPath, "\\", "/", -1) // Just in case we are on Windows...
			_, err := importCfg.Write([]byte("packagefile " + importPath + "=" + path + "\n"))
			if err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, nil, nil, err
	}
	return importCfg, commands, linkPackages, err
}

func compileRecursive(node *parsedTreeNode, isRoot bool, cfg *os.File, buildDir string, commands [][]string, linkPackages []string) ([][]string, []string, error) {
	for _, dep := range node.imports {
		if !dep.internal { // Internal nodes are pre-compiled (and added later to cfg)
			commands, linkPackages, _ = compileRecursive(dep, false, cfg, buildDir, commands, linkPackages)
		}
	}
	log.Println("Processing", node.name, node.importPath, node.internal, "...")
	var pkgObj string
	if isRoot {
		pkgObj = filepath.Join(buildDir, "_pkg_.a")
		linkPackages = append(linkPackages, pkgObj)
	} else {
		pkgObj = filepath.Join(buildDir, "_pkg_"+hashString(node.importPath)+".a")
	}
	_, err := cfg.Write([]byte("packagefile " + node.importPath + "=" + pkgObj + "\n"))
	if err != nil {
		log.Fatal(err)
	}
	compileCommand := []string{
		"compile",
		"-o", pkgObj,
		"-p", node.importPath,
		"-complete",
		// Go also writes build ID hashes to the pack files by default (and may expect them, so give any ID)
		"-buildid", hashString(node.importPath),
		"-pack",
		"-importcfg", cfg.Name(),
	}
	//spew.Dump(node.Raw.GoFiles)
	if len(node.goFileNames) == 0 {
		return nil, nil, errors.New("no .go files to compile in package " + node.importPath + ", check build tags and update vendored dependencies.")
	}
	filesAbs := make([]string, len(node.goFileNames))
	for i, ab := range node.goFileNames {
		filesAbs[i] = filepath.Join(node.dir, ab)
	}
	compileCommand = append(compileCommand, filesAbs...)
	commands = append(commands, compileCommand)
	return commands, linkPackages, nil
}
