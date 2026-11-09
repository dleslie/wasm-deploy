---
name: wasm-deploy
description: >-
  Standard procedure for compiling any Antigravity C/C++/Nim/Rust project to a standalone,
  zero-dependency WebAssembly single-file HTML application, backed by browser localStorage,
  and deploying it to the local network WebApps Hub (/var/www/apps/<project>/).
---

# WebAssembly Standalone Deployment Skill (`wasm-deploy`)

This skill documents and automates the standardized pattern for compiling and deploying
Antigravity projects as zero-dependency, self-contained WebAssembly web applications
accessible across the local network and runnable offline.

## Core Architecture Principles

1. **Self-Contained Single-File HTML**:
   - The build artifact is a single `.html` file containing the HTML skeleton, CSS styling,
     JavaScript runtime, virtual filesystem assets, and base64-embedded WebAssembly binary.
   - Built with Emscripten `-s SINGLE_FILE=1` so users can download, email, save, and run
     the file directly with `file://` or any static HTTP server. No external CDN or backend
     server is needed.

2. **Client-Side Persistence via `localStorage`**:
   - Web applications use browser `localStorage` as a permanent filesystem layer.
   - Files created in the virtual in-memory filesystem (e.g. `/saves`, config, state) are
     synchronized to `localStorage` under the namespace `<project-name>:<path>`.
   - On boot, files stored in `localStorage` are automatically restored into the virtual
     filesystem before the main program logic runs.

3. **Local Area Network (LAN) Hub Deployment**:
   - Applications are deployed to `/var/www/apps/<project-name>/index.html`.
   - Served by Nginx on port 80 via the symlink `/var/www/html/apps -> /var/www/apps`.
   - Immediately accessible across the local network:
   - Immediately accessible across the local network at `http://<lan-ip>/apps/<project-name>/`.

   - Every deployed application is registered on the WebApps Hub at `/var/www/apps/index.html`.
   - Existing services (e.g., Wallabag on HTTPS port 443) remain completely untouched and isolated.

---

## Step-by-Step Deployment Workflow

When deploying a project with `wasm-deploy`, follow these steps:

### 1. Environment & Toolchain Setup
Ensure `emcc` is available:
```bash
if ! command -v emcc >/dev/null 2>&1; then
    source "${HOME}/.emsdk/emsdk_env.sh"
fi
```

### 2. Implement Storage Synchronization (C / Emscripten)
Add the standard `EM_JS` storage bridge to the project entry point (e.g. `wasm_main.c`):

```c
#include <emscripten.h>

EM_JS(void, js_sync_saves_to_local_storage, (const char *prefix, const char *dir_path), {
    try {
        if (typeof FS === "undefined") return;
        var pfx = UTF8ToString(prefix);
        var dir = UTF8ToString(dir_path);
        function scanDir(d) {
            try {
                var entries = FS.readdir(d);
                for (var i = 0; i < entries.length; i++) {
                    var e = entries[i];
                    if (e === "." || e === "..") continue;
                    var p = d + "/" + e;
                    var stat = FS.stat(p);
                    if (FS.isDir(stat.mode)) {
                        scanDir(p);
                    } else {
                        var content = FS.readFile(p, { encoding: "utf8" });
                        localStorage.setItem(pfx + ":" + p, content);
                    }
                }
            } catch (err) {}
        }
        scanDir(dir);
    } catch (e) {
        console.warn("Storage sync failed:", e);
    }
});

EM_JS(void, js_restore_saves_from_local_storage, (const char *prefix), {
    try {
        if (typeof FS === "undefined" || typeof localStorage === "undefined") return;
        var pfx = UTF8ToString(prefix) + ":";
        for (var i = 0; i < localStorage.length; i++) {
            var key = localStorage.key(i);
            if (key && key.indexOf(pfx) === 0) {
                var path = key.slice(pfx.length);
                var val = localStorage.getItem(key);
                var parts = path.split("/").filter(Boolean);
                var cur = "";
                for (var j = 0; j < parts.length - 1; j++) {
                    cur += "/" + parts[j];
                    try { FS.mkdir(cur); } catch (err) {}
                }
                FS.writeFile(path, val);
            }
        }
    } catch (e) {
        console.warn("Storage restore failed:", e);
    }
});
```

### 3. Emscripten Linking Flags
Compile the final binary using these required flags:
```bash
emcc -O2 \
    "${OBJECTS[@]}" \
    "${STATIC_LIBS[@]}" \
    --shell-file tools/wasm_shell.html \
    -s SINGLE_FILE=1 \
    --embed-file data@/data \
    -s ALLOW_MEMORY_GROWTH=1 \
    -s INITIAL_MEMORY=67108864 \
    -s MAXIMUM_MEMORY=536870912 \
    -s "EXPORTED_RUNTIME_METHODS=['ccall','cwrap','FS','UTF8ToString','stringToUTF8']" \
    -s "EXPORTED_FUNCTIONS=['_main', ...]" \
    -s NO_EXIT_RUNTIME=1 \
    -s FORCE_FILESYSTEM=1 \
    -s ENVIRONMENT=web \
    -o "build/<project-name>.html"
```

### 4. Deploy to Web Server
Deploy the single-file HTML to `/var/www/apps/<project-name>/`:
```bash
mkdir -p "/var/www/apps/<project-name>"
cp -f "build/<project-name>.html" "/var/www/apps/<project-name>/index.html"
```

### 5. Update WebApps Hub (`/var/www/apps/index.html`)
Ensure an entry for `<project-name>` is present in `/var/www/apps/index.html` under the `.grid` section:
```html
<div class="card">
  <div>
    <div class="card-title">
      <span><project-name></span>
      <span class="badge">v0.1.0</span>
    </div>
    <div class="card-desc">
      Project description goes here...
    </div>
    <div class="tags">
      <span class="tag">WebAssembly</span>
      <span class="tag">Single-File</span>
      <span class="tag">localStorage</span>
    </div>
  </div>
  <div class="btn-group">
    <a class="btn" href="./<project-name>/" style="flex:1;">Launch WebApp</a>
  </div>
</div>
```

### 6. Verification Checklist
Run automated curl verification on both LAN subnets:
```bash
curl -I http://127.0.0.1/apps/<project-name>/
curl -I http://localhost/apps/<project-name>/
curl -I http://localhost/apps/<project-name>/
# Verify existing HTTPS services are unaffected:
curl -k -I https://127.0.0.1/ -H "Host: wallabag.ironoxide.ca"
```
All project queries must return `HTTP/1.1 200 OK`. Wallabag must return its expected response without degradation.
