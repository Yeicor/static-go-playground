package main

import (
	"os"
	"testing"
)

func TestRun(t *testing.T) {
	//tdir, err := ioutil.TempDir("", "")
	//if err != nil {
	//	t.Fatal(err)
	//}
	//defer func(name string) {
	//	err := os.Remove(name)
	//	if err != nil {
	//		t.Fatal(err)
	//	}
	//}(tdir)
	tdir := "/tmp/go-buildhelper-253235"
	err := os.Mkdir(tdir, 0700)
	if err != nil && !os.IsExist(err) {
		t.Fatal(err)
	}
	Run(".", tdir)
}
