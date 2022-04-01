package main

import (
	"go/build"
	"os"
	"testing"
)

func TestRun(t *testing.T) {
	tdir := "/tmp/go-buildhelper-253235"
	err := os.Mkdir(tdir, 0700)
	if err != nil && !os.IsExist(err) {
		t.Fatal(err)
	}
	if true { // Test cross-compilation (requires compiling most of the standard library from source)
		// It builds properly but warns when linking: Cgo is not implemented as it can't be ("easily") implemented for the web
		build.Default.GOOS = "android"
		build.Default.GOARCH = "amd64"
		err = os.Setenv("GOOS", build.Default.GOOS)
		if err != nil {
			t.Fatal(err)
		}
		err = os.Setenv("GOARCH", build.Default.GOARCH)
		if err != nil {
			t.Fatal(err)
		}
		err = os.Setenv("CGOENABLED", "1")
		if err != nil {
			t.Fatal(err)
		}
	}
	Run("main.go", tdir, []string{"example"})
}
