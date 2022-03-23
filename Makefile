# === Configuration options (use with `make OPTION=value OPTION2=value2`)
# Whether to disable wasm optimizations (take a while and require LOTS of RAM)
WASM_OPT_DISABLE=
# The compression level for the initial filesystem
ZIP_COMPRESSION=6
# Which go installation root to recompile for wasm
GOROOT=$(shell go env GOROOT)
# The output directory (will be created, and its contents will be overwritten)
DIST=dist

all: fs wasm-opt static fs-zip frontend-prod # Prepares a static server at ${DIST}/

frontend-prod: # Build the frontend
	myYarn="yarn" && if ! command -v $$myYarn; then export myYarn="npm"; fi && \
	cd frontend && $$myYarn install && $$myYarn run build

static: wasm-exec # Prepare and copy other static files for the website (not handled by frontend builder)

wasm-exec: # Copy the original wasm_exec.js (with minimal fixes for bundling) from the compiled distribution
	sed -E 's/require\(/global.require\(/g; s/([^.])process/\1global.process/g; s/([^.])fs([\w.])/\1global.fs\2/g' \
		"${GOROOT}/misc/wasm/wasm_exec.js" >"frontend/src/go/wasm_exec.js.generated"

fs: bootstrap-go-pkg cmd-link # Finalizes the filesystem setup
	mkdir -p "${DIST}/fs/src"  # Sources (and any uploaded files) will be stored here

fs-zip: # Zips the filesystem and remove the original
	cd "${DIST}/fs" && zip -${ZIP_COMPRESSION} -r - . >../fs.zip
	rm -r "${DIST}/fs"

bootstrap-go-pkg-prepare:
	mkdir -p "${DIST}/tmp-bootstrap"
	cp -r "${GOROOT}" "${DIST}/tmp-bootstrap"  # Copy all go source files for the bootstrap (reason: hard-coded directory)
	# HACK: Fake RLock for go build to work
	patch "${DIST}/tmp-bootstrap/go/src/cmd/go/internal/lockedfile/internal/filelock/filelock.go" "patches/filelock.go.patch"

bootstrap-go-pkg: bootstrap-go-pkg-prepare bootstrap-go-pkg-toolchain cmd-go cmd-buildhelper cmd-compile cmd-link bootstrap-go-pkg-cleanup

bootstrap-go-pkg-toolchain: bootstrap-go-pkg-prepare # Bootstrap the go library to the fs to get the pre-cross-compiled executable tools and wasm .a files for the standard library
	cd "${DIST}/tmp-bootstrap/go/src" && GOROOT_BOOTSTRAP="${GOROOT}" GOOS=js GOARCH=wasm ./bootstrap.bash || true
	mkdir -p "${DIST}/fs/usr/lib/go"
	cp -r "${DIST}/tmp-bootstrap/go-js-wasm-bootstrap/pkg" "${DIST}/fs/usr/lib/go" # Copy compiled .a files to fs

bootstrap-go-pkg-cleanup: bootstrap-go-pkg-toolchain # Clean up
	rm -r "${DIST}/tmp-bootstrap"
	rm -r "${DIST}/fs/usr/lib/go/pkg/linux_amd64" || true
	rm -r "${DIST}/fs/usr/lib/go/pkg/linux_amd64_dynlink" || true
	rm -r "${DIST}/fs/usr/lib/go/pkg/linux_amd64_shared" || true
	rm -r "${DIST}/fs/usr/lib/go/pkg/obj" || true
	rm -r "${DIST}/fs/usr/lib/go/pkg/tool/linux_amd64" || true

cmd-go: bootstrap-go-pkg-toolchain # Builds go command (for high level info, not actually needed as go build is replaced)
	export GOROOT="$(CURDIR)/${DIST}/tmp-bootstrap/go" && \
	export BUILD_DIR="$$GOROOT/src/cmd/go/" && \
	export OUT_DIR="${DIST}/fs/usr/lib/go/bin" && \
	mkdir -p "$$OUT_DIR" && \
	cd "$$BUILD_DIR" && GOOS=js GOARCH=wasm $$GOROOT/bin/go build -trimpath -o "$(CURDIR)/$$OUT_DIR/go" -v .

cmd-buildhelper: bootstrap-go-pkg-toolchain # Custom reimplementation of the go build command using only low-level commands
	export GOROOT="$(CURDIR)/${DIST}/tmp-bootstrap/go" && \
	export BUILD_DIR="buildhelper" && \
	export OUT_DIR="${DIST}/fs/usr/lib/go/bin" && \
	mkdir -p "$$OUT_DIR" && \
	cd "$$BUILD_DIR" && GOOS=js GOARCH=wasm $$GOROOT/bin/go build -ldflags="-X 'package_path.variable_name=new_value'" -trimpath -o "$(CURDIR)/$$OUT_DIR/buildhelper" -v .

cmd-compile: bootstrap-go-pkg-toolchain # Builds compile command (for lower level go build)
	export GOROOT="$(CURDIR)/${DIST}/tmp-bootstrap/go" && \
	export goVERSION="$$(go env GOROOT)/bin/go env GOVERSION" && \
	export BUILD_DIR="$$GOROOT/src/cmd/compile/" && \
	export OUT_DIR="${DIST}/fs/usr/lib/go/pkg/tool/js_wasm" && \
	mkdir -p "$$OUT_DIR" && \
	cd "$$BUILD_DIR" && GOOS=js GOARCH=wasm $$GOROOT/bin/go build -ldflags="-X 'main.goVersion=$$goVERSION'" -trimpath \
		-o "$(CURDIR)/$$OUT_DIR/compile" -v . && echo $$goVERSION

cmd-link: bootstrap-go-pkg-toolchain # Builds link command (for lower level go build)
	export GOROOT="$(CURDIR)/${DIST}/tmp-bootstrap/go" && \
	export BUILD_DIR="$$GOROOT/src/cmd/link/" && \
	export OUT_DIR="${DIST}/fs/usr/lib/go/pkg/tool/js_wasm" && \
	mkdir -p "$$OUT_DIR" && \
	cd "$$BUILD_DIR" && GOOS=js GOARCH=wasm $$GOROOT/bin/go build -trimpath -o "$(CURDIR)/$$OUT_DIR/link" -v .

wasm-opt: fs # OPTIONAL: Optimizes all wasm files in ${DIST}/
	[ -z "${WASM_OPT_DISABLE}" ] && command -v wasm-opt && \
	find "$(CURDIR)/${DIST}/" -type f -print -exec file {} \; | grep WebAssembly | sed 's/:[^:]*//g' | \
	tr '\n' '\0' | xargs -0 -I {} /usr/bin/env bash -c "echo 'Optimizing {}...' && \
	wasm-opt -O4 --coalesce-locals-learning --code-folding --code-pushing --const-hoisting --dce \
	--duplicate-function-elimination --flatten --inlining-optimizing --local-cse --memory-packing --merge-blocks \
	--merge-locals --metrics --optimize-instructions --pick-load-signs --precompute --precompute-propagate \
	--reorder-functions --reorder-locals --flatten --rereloop --rse --simplify-locals-notee-nostructure --vacuum \
	-o '{}.opt' '{}' && mv '{}.opt' '{}'" || echo "wasm-opt disabled, not found or failed and will be skipped"
	# TODO: Use a different optimization selection strategy than https://makeameme.org/meme/much-yes-many
