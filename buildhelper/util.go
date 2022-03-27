package main

import (
	"encoding/base64"
	"go/build"
	"hash/fnv"
	"path/filepath"
)

func goSrcPath(ctx build.Context) string {
	return filepath.Join(ctx.GOROOT, "src")
}

func goPkgPath(ctx build.Context) string {
	return filepath.Join(ctx.GOROOT, "pkg", ctx.GOOS+"_"+ctx.GOARCH)
}

func pkgArchiveCacheFor(importPath string, buildDir string) string {
	return filepath.Join(buildDir, "_pkg_"+hashString(importPath)+".a")
}

func hashString(s string) string {
	h := fnv.New128a()
	_, err := h.Write([]byte(s))
	if err != nil {
		panic(err)
	}
	return base64.URLEncoding.EncodeToString(h.Sum([]byte{}))
}
