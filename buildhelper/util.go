package main

import (
	"encoding/base64"
	"go/build"
	"hash/fnv"
	"path/filepath"
)

func goSrcPath() string {
	return filepath.Join(build.Default.GOROOT, "src")
}

func goPkgPath() string {
	return filepath.Join(build.Default.GOROOT, "pkg", build.Default.GOOS+"_"+build.Default.GOARCH)
}

func hashString(s string) string {
	h := fnv.New128a()
	_, err := h.Write([]byte(s))
	if err != nil {
		panic(err)
	}
	return base64.URLEncoding.EncodeToString(h.Sum([]byte{}))
}
