# === Configuration options (use with `make OPTION=value OPTION2=value2`)
# Whether to disable wasm optimizations (take a while and require LOTS of RAM)
WASM_OPT_DISABLE=
# The compression level for the initial filesystem
ZIP_COMPRESSION=6
# Which go installation root to recompile for wasm
GOROOT=$(shell go env GOROOT)
# The output directory (will be created, and its contents will be overwritten)
DIST=dist
# The output directory for wasm_exec.js, if built (will be created, and its contents will be overwritten)
DIST_WASM_EXEC=dist-wasm_exec

all: fs wasm-opt static fs-zip frontend-prod # Prepares a static server at ${DIST}/

frontend-prod: # Build the frontend
	myYarn="yarn" && if ! command -v $$myYarn; then export myYarn="npm"; fi && \
	cd frontend && $$myYarn install && $$myYarn run build

static: wasm_exec # Prepare and copy other static files for the website (not handled by frontend builder)

wasm_exec: # Copy the original wasm_exec.js (with minimal fixes for bundling) from the compiled distribution
	sed -E 's/require\(/global.require\(/g; s/([^.])process/\1global.process/g; s/([^.])fs([\w.])/\1global.fs\2/g; s/\(code\) => \{/(code) => {this.exit_code=code;/' \
		"${GOROOT}/misc/wasm/wasm_exec.js" >"frontend/src/go/wasm_exec.js.gen"

fs: bootstrap-go-pkg # Finalizes the filesystem setup
	mkdir -p "${DIST}/fs/src"  # Sources (and any uploaded files) will be stored here

fs-zip: # Zips the filesystem and remove the original
	cd "${DIST}/fs" && zip -${ZIP_COMPRESSION} -r - . >../fs.zip
	rm -r "${DIST}/fs"

bootstrap-go-pkg: bootstrap-go-pkg-prepare bootstrap-go-pkg-toolchain cmd-go cmd-buildhelper cmd-compile cmd-pack \
	cmd-link cmd-asm go-list-targets bootstrap-go-pkg-cleanup

bootstrap-go-pkg-prepare:
	mkdir -p "${DIST}/tmp-bootstrap"
	cp -r ${GOROOT}/* "${DIST}/tmp-bootstrap"  # Copy all go source files for the bootstrap (reason: need write access to hard-coded relative directory)
	# HACK: Fake RLock for go build to work
	patch "${DIST}/tmp-bootstrap/src/cmd/go/internal/lockedfile/internal/filelock/filelock.go" "patches/filelock.go.patch"

bootstrap-go-pkg-toolchain: bootstrap-go-pkg-prepare # Bootstrap the go library to the fs to get the pre-cross-compiled executable tools and wasm .a files for the standard library
	cd "${DIST}/tmp-bootstrap/src" && GOROOT_BOOTSTRAP="${GOROOT}" GOOS=js GOARCH=wasm ./bootstrap.bash || true
	mkdir -p "${DIST}/fs/usr/lib/go"
	cp -r "${DIST}/go-js-wasm-bootstrap/src" "${DIST}/fs/usr/lib/go" # Copy standard library source files to fs
	cp -r "${DIST}/go-js-wasm-bootstrap/pkg" "${DIST}/fs/usr/lib/go" # Copy precompiled standard library (and some extras) to fs
	mkdir -p "${DIST}/fs/usr/lib/go/pkg"
	cp -r "${DIST}/go-js-wasm-bootstrap/pkg/include" "${DIST}/fs/usr/lib/go/pkg" # Copy some small header files

bootstrap-go-pkg-cleanup: bootstrap-go-pkg-toolchain # Clean up
	# Remove unneeded files from sources to speed up initial download (~70% of original size uncompressed, but some packages may break!)
	find "${DIST}/fs/usr/lib/go/src" -type f \( ! \( -name "*.go" -or -name "*.s" -or -name "*.h" \) -or -name "*_test*" \) -delete
	# Include only precompiled files for js/wasm (deleting the host architecture which is build by default when cross-compiling the compiler)
	find "$$(cd "${DIST}/fs/usr/lib/go/pkg/" && pwd)" -mindepth 1 -maxdepth 1 \
	-not \( -name "js_wasm" -or -name "tool" -or -name "include" \) -exec rm -r {} +
	# Delete some tools built for the host's OS/arch
	find "$$(cd "${DIST}/fs/usr/lib/go/pkg/tool/" && pwd)" -mindepth 1 -maxdepth 1 \
 	-not \( -name "js_wasm" \) -exec rm -r {} +
 	# Remove temporary toolchains
	rm -r "${DIST}/tmp-bootstrap" "${DIST}/go-js-wasm-bootstrap"

cmd-go: bootstrap-go-pkg-toolchain # Builds go command (for high level info, not actually needed as go build is replaced)
	export GOROOT="$(CURDIR)/${DIST}/go-js-wasm-bootstrap" && \
	export BUILD_DIR="$$GOROOT/src/cmd/go/" && \
	export OUT_DIR="${DIST}/fs/usr/lib/go/bin" && \
	mkdir -p "$$OUT_DIR" && \
	cd "$$BUILD_DIR" && GOOS=js GOARCH=wasm $$GOROOT/bin/go build -trimpath -o "$(CURDIR)/$$OUT_DIR/go" -v .

cmd-buildhelper: bootstrap-go-pkg-toolchain # Custom reimplementation of the go build command using only low-level commands
	export GOROOT="$(CURDIR)/${DIST}/go-js-wasm-bootstrap" && \
	export BUILD_DIR="buildhelper" && \
	export OUT_DIR="${DIST}/fs/usr/lib/go/bin" && \
	mkdir -p "$$OUT_DIR" && \
	cd "$$BUILD_DIR" && GOOS=js GOARCH=wasm $$GOROOT/bin/go build -ldflags="-X 'package_path.variable_name=new_value'" -trimpath -o "$(CURDIR)/$$OUT_DIR/buildhelper" -v .

cmd-compile: bootstrap-go-pkg-toolchain # Builds compile command (for lower level go build)
	export GOROOT="$(CURDIR)/${DIST}/go-js-wasm-bootstrap" && \
	export goVERSION="$$(go env GOROOT)/bin/go env GOVERSION" && \
	export BUILD_DIR="$$GOROOT/src/cmd/compile/" && \
	export OUT_DIR="${DIST}/fs/usr/lib/go/pkg/tool/js_wasm" && \
	mkdir -p "$$OUT_DIR" && \
	cd "$$BUILD_DIR" && GOOS=js GOARCH=wasm $$GOROOT/bin/go build -ldflags="-X 'main.goVersion=$$goVERSION'" -trimpath \
		-o "$(CURDIR)/$$OUT_DIR/compile" -v . && echo $$goVERSION

cmd-pack: bootstrap-go-pkg-toolchain # Builds pack command (for lower level go build)
	export GOROOT="$(CURDIR)/${DIST}/go-js-wasm-bootstrap" && \
	export BUILD_DIR="$$GOROOT/src/cmd/pack/" && \
	export OUT_DIR="${DIST}/fs/usr/lib/go/pkg/tool/js_wasm" && \
	mkdir -p "$$OUT_DIR" && \
	cd "$$BUILD_DIR" && GOOS=js GOARCH=wasm $$GOROOT/bin/go build -trimpath -o "$(CURDIR)/$$OUT_DIR/pack" -v .

cmd-link: bootstrap-go-pkg-toolchain # Builds link command (for lower level go build)
	export GOROOT="$(CURDIR)/${DIST}/go-js-wasm-bootstrap" && \
	export BUILD_DIR="$$GOROOT/src/cmd/link/" && \
	export OUT_DIR="${DIST}/fs/usr/lib/go/pkg/tool/js_wasm" && \
	mkdir -p "$$OUT_DIR" && \
	cd "$$BUILD_DIR" && GOOS=js GOARCH=wasm $$GOROOT/bin/go build -trimpath -o "$(CURDIR)/$$OUT_DIR/link" -v .

cmd-asm: bootstrap-go-pkg-toolchain # Builds asm command (for lower level go build)
	export GOROOT="$(CURDIR)/${DIST}/go-js-wasm-bootstrap" && \
	export BUILD_DIR="$$GOROOT/src/cmd/asm/" && \
	export OUT_DIR="${DIST}/fs/usr/lib/go/pkg/tool/js_wasm" && \
	mkdir -p "$$OUT_DIR" && \
	cd "$$BUILD_DIR" && GOOS=js GOARCH=wasm $$GOROOT/bin/go build -trimpath -o "$(CURDIR)/$$OUT_DIR/asm" -v .

go-list-targets: bootstrap-go-pkg-toolchain # Lists the targets available for the given tool
	export GOROOT="$(CURDIR)/${DIST}/go-js-wasm-bootstrap" && \
	( printf "export const SupportedTargets = [\"" && \
	$$GOROOT/bin/go tool dist list | \
	 tr '\n' ' ' | sed 's/ /", "/g' && printf "\"]" ) | sed 's/, ""//g' >"frontend/src/go/targets.gen.js"

wasm-opt: fs # OPTIONAL: Optimizes all wasm files in ${DIST}/
	[ -z "${WASM_OPT_DISABLE}" ] && command -v wasm-opt && \
	find "$(CURDIR)/${DIST}/" -type f -print -exec file {} \; | grep WebAssembly | sed 's/:[^:]*//g' | \
	tr '\n' '\0' | xargs -0 -I {} /usr/bin/env bash -c "echo 'Optimizing {}...' && \
	wasm-opt -O4 -o '{}.opt' '{}' && mv '{}.opt' '{}'" || echo "wasm-opt disabled, not found or failed and will be skipped"

wasm_exec: # Builds the standalone wasm_exec.js with filesystem support (not needed if building the main app)
	mkdir -p ${DIST_WASM_EXEC}
	# Copy the minimally modified index.html
	cp "frontend/src/fs/standalone/index.html" "${DIST_WASM_EXEC}/index.html"
	# Compile the demo code for js/wasm
	GOOS=js GOARCH=wasm go build -o "${DIST_WASM_EXEC}/test.wasm" "frontend/src/fs/standalone/demo.go"
	# Build the modified wasm_exec.js
	myYarn="yarn" && if ! command -v $$myYarn; then export myYarn="npm"; fi && \
	cd frontend && $$myYarn install && $$myYarn run build-wasm_exec