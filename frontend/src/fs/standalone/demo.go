package main

import (
	"log"
	"os"
)

func main() {
	// This is a simple demo of writing and reading to the virtual file system provided by ./wasm_exec.ts.
	err := os.WriteFile("/test.txt", []byte("Hello, World!"), 0644)
	if err != nil {
		log.Panicln(err)
	}
	bs, err := os.ReadFile("/test.txt")
	if err != nil {
		log.Panicln(err)
	}
	log.Println("Successfully written to and read from /test.txt:", string(bs))
}
