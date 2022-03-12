package main

import (
	"encoding/json"
	"io/ioutil"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

func output(commands [][]string, buildDir string, err error) {
	for _, command := range commands {
		println("Command: " + strings.Join(command, " "))
		// Also run commands
		if os.Getenv("ALSO_EXECUTE_COMMANDS") != "" {
			cmd := exec.Command("go", append([]string{"tool"}, command...)...)
			cmd.Dir = buildDir
			cmd.Stdout = os.Stdout
			cmd.Stderr = os.Stderr
			err = cmd.Run()
			if err != nil {
				log.Fatal(err)
			}
		}
	}
	marshal, err := json.MarshalIndent(commands, "", "    ")
	if err != nil {
		log.Fatal(err)
	}
	err = ioutil.WriteFile(filepath.Join(buildDir, "commands.json"), marshal, 0644)
	if err != nil {
		log.Fatal(err)
	}
}
