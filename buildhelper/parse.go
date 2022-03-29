package main

import (
	"errors"
	"fmt"
	"go/ast"
	"go/build"
	"go/parser"
	"go/token"
	"golang.org/x/mod/modfile"
	"io/ioutil"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

type parsedTreeNode struct {
	name, dir, importPath       string
	internal                    bool
	goFileNames                 []string
	assemblyFileNames           []string
	validPrecompiledArchivePath string
	imports                     []*parsedTreeNode
}

func parse(buildDir string, tmpBuildDir string, buildCtx build.Context) (*parsedTreeNode, bool, error) {
	// buildCtx.ImportDir() would avoid duplication and handle tags and edge cases, so why not?
	//  - Because it executes go list, which is available, but requires GOCACHE to be populated.
	fset := token.NewFileSet()
	buildDirAbs, err := filepath.Abs(buildDir)
	if err != nil {
		return nil, false, err
	}
	_, err = os.Stat(goPkgPath(buildCtx))
	precompiledInternal := err == nil // Performance: assume a proper and complete precompiled standard library structure if this directory exists
	res, err := parseRecursive(fset, buildDirAbs, "main", buildDirAbs, tmpBuildDir, buildCtx, false, precompiledInternal, map[string]*parsedTreeNode{})
	if err != nil {
		return nil, false, err
	}
	// Post-process to remove caches if any descendant is not cached
	invalidateCachesRecursive(res)
	return res, precompiledInternal, err
}

func parseRecursive(fset *token.FileSet, pkgDirOrFile, impPath, buildDir, tmpBuildDir string, buildCtx build.Context, isInternal, precompiledInternal bool, explored map[string]*parsedTreeNode) (*parsedTreeNode, error) {
	// Also handle files as input for root node (like when there are several examples with func main() on the same directory, but only one is wanted)
	stat, err := os.Stat(pkgDirOrFile)
	if err != nil {
		return nil, err
	}
	var pkgs map[string]*ast.Package
	pkgDir := pkgDirOrFile
	if stat.IsDir() {
		pkgs, err = parser.ParseDir(fset, pkgDirOrFile, nil, parser.ImportsOnly)
		if err != nil {
			return nil, err
		}
	} else {
		pkgDir = filepath.Dir(pkgDirOrFile)
		buildDir = filepath.Dir(buildDir)
		file, err := parser.ParseFile(fset, pkgDirOrFile, nil, parser.ImportsOnly)
		if err != nil {
			return nil, err
		}
		pkgs = map[string]*ast.Package{
			"main": {
				Name:    "main",
				Scope:   file.Scope,
				Imports: nil, // We do not use this
				Files:   map[string]*ast.File{pkgDirOrFile: file},
			},
		}
	}
	// Filter main/test/etc. packages (based on package name as there may be multiple packages in a directory)
	for pkgName := range pkgs {
		if impPath != "main" && pkgName == "main" || strings.Contains(pkgName, "_test") {
			delete(pkgs, pkgName)
		}
	}
	if len(pkgs) == 0 {
		return nil, errors.New("Import \"" + impPath + "\" had no matching packages in expected directory " + pkgDirOrFile)
	}
	// We expect only one package to match the import path
	var pkg *ast.Package
	if len(pkgs) > 1 {
		// If more than one package is found, try to match the import name
		expectedPkgName := impPath[strings.LastIndex(impPath, "/")+1:]
		foundPkg, ok := pkgs[expectedPkgName]
		if !ok {
			return nil, fmt.Errorf("more than one package found %s for %s", pkgs, pkgDirOrFile)
		}
		pkg = foundPkg
	} else {
		for _, a := range pkgs {
			pkg = a
			break
		}
	}
	// Add all assembly files in dir as source (will be filtered by os/arch later)
	dir, err := os.ReadDir(pkgDir)
	if err != nil {
		return nil, err
	}
	for _, entry := range dir {
		if strings.HasSuffix(strings.ToLower(entry.Name()), ".s") {
			pkg.Files[filepath.Join(pkgDir, entry.Name())] = &ast.File{}
		}
	}
	log.Println("Parsing", impPath, "(", pkgDirOrFile, ") with", len(pkg.Files), "source files")
	// Prepare parsed tree, also exploring dependencies
	node := &parsedTreeNode{
		name:                        pkg.Name,
		dir:                         pkgDir,
		importPath:                  impPath,
		internal:                    isInternal,
		goFileNames:                 nil, // Later
		assemblyFileNames:           nil, // Later
		validPrecompiledArchivePath: "",  // Later
		imports:                     nil, // Later
	}
	for filePath, file := range pkg.Files {
		// Check if the file matches build constraints or skip it
		fileName := filepath.Base(filePath)
		if ok, err := buildCtx.MatchFile(filepath.Dir(filePath), fileName); !ok || err != nil {
			continue
		}
		// Ignore _test files for now. TODO: Support running tests?
		if strings.Contains(fileName, "_test") {
			continue
		}
		// Register the file
		if strings.HasSuffix(strings.ToLower(fileName), ".go") {
			node.goFileNames = append(node.goFileNames, fileName)
		} else if strings.HasSuffix(strings.ToLower(fileName), ".s") {
			node.assemblyFileNames = append(node.assemblyFileNames, fileName)
		} else {
			log.Println("Unknown source file extension for " + filePath + ", ignoring")
			continue
		}
		// Handle the imports
		for _, imp := range file.Imports {
			importPath := imp.Path.Value[1 : len(imp.Path.Value)-1]
			if importPath == "unsafe" || importPath == "C" {
				continue
			}
			importDir, internal, precompiled := parseFindDirForImport(importPath, buildDir, tmpBuildDir, buildCtx.GOPATH, buildCtx)
			if importDir == "" {
				return nil, errors.New("Import \"" + importPath + "\" not found in standard locations!")
			}
			if precompiledInternal && internal { // Avoid exploration of the precompiled standard library if available (assume OK for performance)
				continue
			}
			if _ /*exploredData*/, alreadyExplored := explored[importDir]; alreadyExplored {
				// Mark dependency (to properly compile in order), also checking that there are no import cycles!
				//node.imports = append(node.imports, exploredData)
			} else {
				child, err := parseRecursive(fset, importDir, importPath, buildDir, tmpBuildDir, buildCtx, internal, precompiledInternal, explored)
				if err != nil {
					return nil, err
				}
				child.dir = importDir
				child.validPrecompiledArchivePath = precompiled // "" means not precompiled
				node.imports = append(node.imports, child)
				explored[importDir] = node // Mark as explored (avoid infinite loops)
			}
		}
	}
	return node, err
}

func invalidateCachesRecursive(res *parsedTreeNode) bool {
	for _, node := range res.imports {
		if !invalidateCachesRecursive(node) {
			// Disable the cache of the parent
			res.validPrecompiledArchivePath = ""
		}
	}
	// And notify parents recursively
	cached := res.validPrecompiledArchivePath != ""
	return cached
}

var versionMajorRegex = regexp.MustCompile("/v([0-9]+)/?$")

func parseFindDirForImport(importPath, buildDir, tmpBuildDir, goPath string, ctx build.Context) (dirOrArchive string, isInternal bool, precompiledArchive string) {
	// Check path relative to Go module (get go module name and remove prefix)
	goModDir, importPathGoMod := findAndParseGoMod(buildDir)
	if importPathGoMod != "" {
		subImportPath := strings.TrimPrefix(importPath, importPathGoMod)
		if subImportPath != importPath {
			modulePath := filepath.Join(goModDir, subImportPath)
			if stat, err := os.Stat(modulePath); err == nil && stat.IsDir() {
				return modulePath, false, checkPrecompiledCache(tmpBuildDir, importPath, modulePath)
			}
		}
	}
	// Check vendor directory.
	buildModDir := buildDir
	if goModDir != "" {
		buildModDir = goModDir
	}
	vendorPath := filepath.Join(buildModDir, "vendor", importPath)
	if _, err := os.Stat(vendorPath); err == nil {
		return vendorPath, false, checkPrecompiledCache(tmpBuildDir, importPath, vendorPath)
	}
	// Check gopath directory.
	gopathPath := filepath.Join(goPath, importPath)
	if _, err := os.Stat(gopathPath); err == nil {
		return gopathPath, false, checkPrecompiledCache(tmpBuildDir, importPath, gopathPath)
	}
	// Fall back to checking the standard library (precompiled).
	standardPkgPath := filepath.Join(goPkgPath(ctx), importPath+".a")
	if _, err := os.Stat(standardPkgPath); err == nil {
		return filepath.Join(goSrcPath(ctx), importPath), true, standardPkgPath
	}
	// Fall back to checking the standard library (vendor sources).
	standardSrcVendorPath := filepath.Join(goSrcPath(ctx), "vendor", importPath)
	if _, err := os.Stat(standardSrcVendorPath); err == nil {
		return standardSrcVendorPath, true, checkPrecompiledCache(tmpBuildDir, importPath, standardSrcVendorPath)
	}
	// Fall back to checking the standard library (sources).
	standardSrcPath := filepath.Join(goSrcPath(ctx), importPath)
	if _, err := os.Stat(standardSrcPath); err == nil {
		return standardSrcPath, true, checkPrecompiledCache(tmpBuildDir, importPath, standardSrcPath)
	}
	// Remove /vN suffix from the import path and try again (https://research.swtch.com/vgo-module)
	match := versionMajorRegex.FindString(importPath)
	if match != "" {
		return parseFindDirForImport(importPath[:len(importPath)-len(match)], buildDir, tmpBuildDir, goPath, ctx)
	}
	// An empty dirOrArchive means not found
	return "", false, ""
}

func findAndParseGoMod(dirOrFile string) (baseDir string, modulePath string) {
	dirOrFile, err := filepath.Abs(dirOrFile)
	if err != nil {
		return "", ""
	}
	stat, err := os.Stat(dirOrFile)
	if err != nil {
		return "", ""
	}
	if stat.IsDir() {
		dir := dirOrFile
		possibleGoModFile := filepath.Join(dir, "go.mod")
		openGoMod, err := os.Open(possibleGoModFile)
		if err == nil {
			all, err := ioutil.ReadAll(openGoMod)
			if err == nil {
				// TODO: Handle go.mod replace directives
				modulePath = modfile.ModulePath(all)
				return dir, modulePath // Found and parsed go.mod file
			}
		} // Not found, keep searching
	}
	parentDir := filepath.Dir(dirOrFile)
	if parentDir != dirOrFile { // Recurse
		return findAndParseGoMod(parentDir)
	}
	return "", "" // Not found
}

func checkPrecompiledCache(buildDir string, importPath string, sourcesPath string) string {
	cacheFile := pkgArchiveCacheFor(importPath, buildDir)
	stat, err := os.Stat(cacheFile)
	if err != nil { // Precompiled file not found (not yet built)
		return ""
	}
	// Now, check that all files in sourcesPath are older than the latest built file
	cacheDate := stat.ModTime()
	dir, err := os.ReadDir(sourcesPath)
	if err != nil {
		return ""
	}
	for _, entry := range dir {
		info, err := entry.Info()
		if err != nil {
			continue // Skip
		}
		if info.ModTime().After(cacheDate) {
			return "" // Cache is invalid for this file (source modified)
		}
	}
	return cacheFile
}
