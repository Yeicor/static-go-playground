package main

import (
	"errors"
	"go/build"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"strings"
)

func compile(t *parsedTreeNode, buildDir string, precompiledInternal bool, buildCtx build.Context) (*os.File, [][]string, []string, error) {
	importCfg, err := os.OpenFile(filepath.Join(buildDir, "importCfg"), os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
	if err != nil {
		return nil, nil, nil, err
	}
	commands, linkPackages, err := compileRecursive(t, true, importCfg, buildDir, nil, nil, buildCtx, map[*parsedTreeNode]struct{}{})
	if err != nil {
		return nil, nil, nil, err
	}
	if precompiledInternal {
		// Add all standard (precompiled) library packs to importCfg
		pkgPath := goPkgPath(buildCtx)
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
	}
	if err != nil {
		return nil, nil, nil, err
	}
	return importCfg, commands, linkPackages, err
}

// compileRecursive compiles generates all compile commands based on the parsed tree structure.
// It ensures that all dependencies are already compiled before compiling the current package.
func compileRecursive(node *parsedTreeNode, isRoot bool, cfg *os.File, buildDir string, commands [][]string, linkPackages []string, buildCtx build.Context, alreadyCompiled map[*parsedTreeNode]struct{}) ([][]string, []string, error) {
	// Check if it was already compiled (more than one node depends on this package, and it was already processed) and skip
	if _, ok := alreadyCompiled[node]; ok {
		return commands, linkPackages, nil
	}
	alreadyCompiled[node] = struct{}{}

	// Recurse into dependencies
	for _, dep := range node.imports {
		commands, linkPackages, _ = compileRecursive(dep, false, cfg, buildDir, commands, linkPackages, buildCtx, alreadyCompiled)
	}

	// Check if the package is already cached and register it
	cachedCompiledArchive := node.validPrecompiledArchivePath != ""
	log.Println("Processing", node.importPath, "(", node.dir, ") internal =", node.internal, ", cached =", cachedCompiledArchive)
	pkgObj := pkgArchiveCacheFor(node.importPath, buildDir)
	if isRoot {
		linkPackages = append(linkPackages, pkgObj)
	}
	if cachedCompiledArchive {
		// Use this cache instead of generating commands
		pkgObj = node.validPrecompiledArchivePath
	}
	_, err := cfg.Write([]byte("packagefile " + node.importPath + "=" + pkgObj + "\n"))
	if err != nil {
		log.Fatal(err)
	}
	if cachedCompiledArchive {
		return commands, linkPackages, nil // Nothing more to do
	}

	// ### Generate all commands to compile the current package
	// === ASM (pre-pass to generate symbol ABIs) ===
	symabisFilePath := filepath.Join(buildDir, "symabis_"+hashString(node.importPath))
	if len(node.assemblyFileNames) > 0 {
		asmPreCommand := []string{
			"asm",
			"-p", node.importPath,
			"-I", buildDir,
			"-I", filepath.Join(filepath.Dir(goPkgPath(buildCtx)), "include"),
			"-D", "GOOS_" + buildCtx.GOOS,
			"-D", "GOARCH_" + buildCtx.GOARCH,
			"-gensymabis",
			"-o", symabisFilePath,
		}
		if node.internal {
			asmPreCommand = append(asmPreCommand, "-compiling-runtime")
		}
		filesAbs := make([]string, len(node.assemblyFileNames))
		for i, ab := range node.assemblyFileNames {
			filesAbs[i] = filepath.Join(node.dir, ab)
		}
		asmPreCommand = append(asmPreCommand, filesAbs...)
		commands = append(commands, asmPreCommand)
	}

	// === COMPILE ===
	compileCommand := []string{
		"compile",
		"-o", pkgObj,
		"-p", node.importPath,
		//"-complete", // Not when including assembly
		// Go also writes build ID hashes to the pack files by default (and may expect them, so give any ID)
		"-buildid", hashString(node.importPath),
		//"-pack", // packed later (including asm)
		"-importcfg", cfg.Name(),
	}
	if node.internal {
		if strings.HasPrefix(node.importPath, "runtime") && node.importPath != "runtime/trace" {
			compileCommand = append(compileCommand, "-std", "-+")
		}
	}
	asmHdrFilePath := filepath.Join(buildDir, "go_asm.h")
	if len(node.assemblyFileNames) > 0 {
		compileCommand = append(compileCommand, "-symabis", symabisFilePath, "-asmhdr", asmHdrFilePath)
	} else {
		if !node.internal { // <- This is a hack, probably will fail
			compileCommand = append(compileCommand, "-complete")
		}
	}
	if len(node.goFileNames) == 0 {
		return nil, nil, errors.New("no .go files to compile in package " + node.importPath + ", check build tags and update vendored dependencies.")
	}
	filesAbs := make([]string, len(node.goFileNames))
	for i, ab := range node.goFileNames {
		filesAbs[i] = filepath.Join(node.dir, ab)
	}
	compileCommand = append(compileCommand, filesAbs...)
	commands = append(commands, compileCommand)

	// === ASM ===
	asmObjectFiles := make([]string, len(node.assemblyFileNames))
	if len(node.assemblyFileNames) > 0 {
		for i, assemblyFileName := range node.assemblyFileNames {
			objFilePath := hashString(node.importPath) + "_" + assemblyFileName + ".o"
			asmCommand := []string{
				"asm",
				"-p", node.importPath,
				"-I", buildDir,
				"-I", filepath.Join(filepath.Dir(goPkgPath(buildCtx)), "include"),
				"-D", "GOOS_" + buildCtx.GOOS,
				"-D", "GOARCH_" + buildCtx.GOARCH,
				"-o", objFilePath,
			}
			if node.internal {
				asmCommand = append(asmCommand, "-compiling-runtime")
			}
			asmCommand = append(asmCommand, filepath.Join(node.dir, assemblyFileName))
			commands = append(commands, asmCommand)
			asmObjectFiles[i] = filepath.Join(buildDir, objFilePath)
		}
	}

	// === PACK ===
	if len(node.assemblyFileNames) > 0 {
		packCommand := []string{
			"pack",
			"r",
			pkgObj,
		}
		packCommand = append(packCommand, asmObjectFiles...)
		commands = append(commands, packCommand)
	}

	return commands, linkPackages, nil
}
