package main

import (
	"log"
	"os"
)

func main() {
	// This is a simple demo of writing and reading to the virtual file system provided by ./wasm_exec.ts.
	cwd, err := os.Getwd()
	if err != nil {
		log.Panicln(err)
	}
	log.Println("FS demo is running on current working directory:", cwd)

	testFileName := "./test.txt"
	err = os.WriteFile(testFileName, []byte("Hello, World!"), 0644)
	if err != nil {
		log.Panicln(err)
	}
	bs, err := os.ReadFile(testFileName)
	if err != nil {
		log.Panicln(err)
	}
	log.Println("Successfully written to and read from", testFileName, "-", string(bs))
}
