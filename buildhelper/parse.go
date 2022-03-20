package main

import (
	"errors"
	"go/ast"
	"go/build"
	"go/parser"
	"go/token"
	"log"
	"os"
	"path/filepath"
	"strconv"
)

type parsedTreeNode struct {
	name, dir, importPath string
	internal              bool
	goFileNames           []string
	imports               []*parsedTreeNode
}

func parse(buildDir string) (*parsedTreeNode, error) {
	// build.Default.ImportDir() would avoid duplication and handle tags and edge cases, so why not?
	//  - Because it executes go list, which is available, but requires GOCACHE to be populated.
	fset := token.NewFileSet()
	buildDirAbs, err := filepath.Abs(buildDir)
	if err != nil {
		return nil, err
	}
	return parseRecursive(fset, buildDirAbs, "main", buildDirAbs, false, map[string]struct{}{})
}

func parseRecursive(fset *token.FileSet, pkgDir, impPath, buildDir string, isInternal bool, explored map[string]struct{}) (*parsedTreeNode, error) {
	pkgs, err := parser.ParseDir(fset, pkgDir, nil, parser.AllErrors)
	if err != nil {
		return nil, err
	}
	if len(pkgs) != 1 && !isInternal {
		log.Println("WARN: NOT IMPLEMENTED: found " + strconv.Itoa(len(pkgs)) + " pkgs at " + pkgDir)
	}
	var pkg *ast.Package
	for _, a := range pkgs {
		pkg = a
		break
	}
	node := &parsedTreeNode{
		name:        pkg.Name,
		dir:         pkgDir,
		importPath:  impPath,
		internal:    isInternal,
		goFileNames: nil, // Later
		imports:     nil, // Later
	}
	for filePath, file := range pkg.Files {
		// Check if the file matches build constraints or skip it
		fileName := filepath.Base(filePath)
		if ok, err := build.Default.MatchFile(filepath.Dir(filePath), fileName); !ok || err != nil {
			continue
		}
		// Register the file
		node.goFileNames = append(node.goFileNames, fileName)
		// Handle the imports
		for _, imp := range file.Imports {
			importPath := imp.Path.Value[1 : len(imp.Path.Value)-1]
			if importPath == "unsafe" || importPath == "C" {
				continue
			}
			importDir, internal := parseFindDirForImport(importPath, buildDir, build.Default.GOPATH)
			if importDir == "" {
				return nil, errors.New("Import \"" + importPath + "\" not found!")
			}
			// NOTE: internal packages are not required for this use case, so stop recursion
			// FIXME: Should probably fix problems caused by them as they are likely to also occur in other packages
			if _, alreadyExplored := explored[importDir]; !alreadyExplored {
				explored[importDir] = struct{}{} // Mark as explored (avoid infinite loops)
				child, err := parseRecursive(fset, importDir, importPath, buildDir, internal, explored)
				if err != nil {
					if internal {
						// Probably, dependency source files are in some vendor directory of the standard library,
						// but this is not needed as std is precompiled
						continue
					}
					return nil, err
				}
				child.dir = importDir
				node.imports = append(node.imports, child)
			}
		}
	}
	return node, err
}

func parseFindDirForImport(importPath, buildDir, goPath string) (dir string, isInternal bool) {
	// First: check vendor directory.
	vendorPath := filepath.Join(buildDir, "vendor", importPath)
	if _, err := os.Stat(vendorPath); err == nil {
		return vendorPath, false
	}
	// Then: check gopath directory.
	gopathPath := filepath.Join(goPath, importPath)
	if _, err := os.Stat(gopathPath); err == nil {
		return gopathPath, false
	}
	// Otherwise: fall back to checking the standard library.
	standardPkgPath := filepath.Join(goPkgPath(), importPath+".a")
	if _, err := os.Stat(standardPkgPath); err == nil {
		return filepath.Join(goSrcPath(), importPath), true
	}
	// An empty dir means not found
	return "", false
}
