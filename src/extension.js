const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

function activate(context) {
    console.log("Mrya VSCode extension activated!");

    const provider = vscode.languages.registerCompletionItemProvider(
        'mrya',
        {
            async provideCompletionItems(document, position) {
                const text = document.getText();
                const line = document.lineAt(position).text;
                const prefix = line.slice(0, position.character);

                if (/\b(let|func|class)\s+[a-zA-Z_0-9]*$/.test(prefix)) return [];

                const insideImport = /\bimport\s*\(\s*["'][^"']*$/.test(prefix);
                if (!insideImport && (/["'].*$/.test(prefix) || /\/\/.*/.test(prefix))) return [];

                // ---------------------------
                // ✨ import("...") completion
                // ---------------------------
                if (insideImport) {
                    const items = [];
                    const nativeModules = ["time", "fs", "string", "math", "window"];
                    const packageModules = [
                        "package:jsoft",
                        "package:math",
                        "package:test_mrya",
                        "package:time",
                        "package:web",
                        "package:gui",
                        "package:games",
                        "package:html"
                    ];

                    for (const mod of nativeModules) {
                        const item = new vscode.CompletionItem(mod, vscode.CompletionItemKind.Module);
                        item.detail = "Native Mrya module";
                        item.insertText = mod;
                        item.documentation = `Built-in module "${mod}"`;
                        items.push(item);
                    }

                    for (const pkg of packageModules) {
                        const name = pkg.split(":")[1];
                        const item = new vscode.CompletionItem(pkg, vscode.CompletionItemKind.Module);
                        item.detail = "Package module";
                        item.insertText = pkg;
                        item.documentation = `Package-provided module "${name}"`;
                        items.push(item);
                    }

                    const workspaceFolders = vscode.workspace.workspaceFolders;
                    if (workspaceFolders) {
                        const folder = workspaceFolders[0].uri.fsPath;
                        const entries = getMryaFilesAndDirs(folder);
                        for (const entry of entries) {
                            const item = new vscode.CompletionItem(entry.name, entry.kind);
                            item.detail = entry.isDir ? "Folder" : "File";
                            item.insertText = entry.name + (entry.isDir ? "/" : "");
                            item.documentation = entry.isDir
                                ? "Folder in workspace"
                                : "Mrya source file";
                            items.push(item);
                        }
                    }
                    return items;
                }

                // ---------------------------
                // 🧠 module.member completion
                // ---------------------------
                const moduleMatch = prefix.match(/\b([a-zA-Z_][a-zA-Z0-9_]*)\.$/);
                if (moduleMatch) {
                    const moduleName = moduleMatch[1];
                    const items = [];
                    for (const key of Object.keys(builtinDocs)) {
                        if (key.startsWith(moduleName + ".")) {
                            const subname = key.split(".")[1];
                            const item = new vscode.CompletionItem(subname, vscode.CompletionItemKind.Function);
                            item.insertText = subname + "()";
                            item.detail = `Member of module '${moduleName}'`;
                            item.documentation = builtinDocs[key];
                            items.push(item);
                        }
                    }
                    return items;
                }

                // ---------------------------
                // 🧩 Dynamic scanning
                // ---------------------------
                const variableRegex = /\blet\s+(?:const\s+)?([a-zA-Z_][a-zA-Z0-9_]*)/g;
                const functionRegex = /\bfunc\s+([a-zA-Z_][a-zA-Z0-9_]*)/g;
                const classRegex = /\bclass\s+([a-zA-Z_][a-zA-Z0-9_]*)/g;

                const variables = new Set();
                const functions = new Set();
                const classes = new Set();
                let match;

                while ((match = variableRegex.exec(text))) variables.add(match[1]);
                while ((match = functionRegex.exec(text))) functions.add(match[1]);
                while ((match = classRegex.exec(text))) classes.add(match[1]);

                const keywords = [
                    "let", "const", "func", "define", "return",
                    "class", "inherit", "this", "as",
                    "if", "else", "while", "for", "break", "continue",
                    "try", "catch", "end", "raise",
                    "true", "false", "nil"
                ];

                const builtins = Object.keys(builtinDocs);
                const modules = ["fs", "time", "math", "string", "window", "gui", "jsoft"];

                const items = [];

                for (const word of keywords) {
                    const item = new vscode.CompletionItem(word, vscode.CompletionItemKind.Keyword);
                    item.insertText = word;
                    if (builtinDocs[word]) item.documentation = builtinDocs[word];
                    items.push(item);
                }

                for (const word of builtins) {
                    if (["true", "false", "nil"].includes(word)) continue;
                    if (word.includes(".")) continue;
                    const item = new vscode.CompletionItem(word, vscode.CompletionItemKind.Function);
                    item.insertText = word + "()";
                    item.documentation = builtinDocs[word];
                    items.push(item);
                }

                for (const mod of modules) {
                    const item = new vscode.CompletionItem(mod, vscode.CompletionItemKind.Module);
                    item.insertText = mod;
                    item.documentation = `Mrya built-in module "${mod}"`;
                    items.push(item);
                }

                for (const v of variables) {
                    const item = new vscode.CompletionItem(v, vscode.CompletionItemKind.Variable);
                    item.detail = "User variable";
                    item.insertText = v;
                    items.push(item);
                }

                for (const f of functions) {
                    const item = new vscode.CompletionItem(f, vscode.CompletionItemKind.Function);
                    item.detail = "User function";
                    item.insertText = f + "()";
                    items.push(item);
                }

                for (const c of classes) {
                    const item = new vscode.CompletionItem(c, vscode.CompletionItemKind.Class);
                    item.detail = "User class";
                    item.insertText = c;
                    items.push(item);
                }

                return items;
            }
        },
        '.', '(', '[', '{', ' ', '\t', '"'
    );

    // ---------------------------
    // 📝 Hover Provider
    // ---------------------------
    const hover = vscode.languages.registerHoverProvider('mrya', {
        provideHover(document, position) {
            const range = document.getWordRangeAtPosition(position);
            if (!range) return;
            const word = document.getText(range);

            for (const key of Object.keys(builtinDocs)) {
                if (key === word || key.endsWith("." + word)) {
                    return new vscode.Hover(`**${key}** — ${builtinDocs[key]}`);
                }
            }
        }
    });

    context.subscriptions.push(provider, hover);
}

function getMryaFilesAndDirs(basePath) {
    try {
        const entries = fs.readdirSync(basePath, { withFileTypes: true });
        return entries
            .filter(e => e.isDirectory() || e.name.endsWith('.mrya'))
            .map(e => ({
                name: e.name,
                isDir: e.isDirectory(),
                kind: e.isDirectory()
                    ? vscode.CompletionItemKind.Folder
                    : vscode.CompletionItemKind.File
            }));
    } catch {
        return [];
    }
}

// ---------------------------
// 📚 Built-in Documentation
// ---------------------------
const builtinDocs = {
    // Core
    "output": "Prints a value to the console.",
    "import": "Imports a module or file.",
    "request": "Prompts the user for input.",
    "raise": "Raises a custom exception.",
    "assert": "Asserts that a value equals expected; raises error otherwise.",

    // Conversion
    "to_int": "Converts a value to an integer.",
    "to_float": "Converts a value to a float.",
    "to_bool": "Converts a value to a boolean.",

    // File I/O
    "fetch": "Reads the content of a file (creates if missing).",
    "store": "Writes content to a file.",
    "append_to": "Appends content to a file.",

    // Lists
    "append": "Adds an item to a list.",
    "length": "Returns length of a list or string.",
    "list_slice": "Returns a slice of a list.",
    "get": "Retrieves element by index.",
    "set": "Sets element by index.",

    // Maps
    "map_has": "Checks if a map contains a key.",
    "map_keys": "Returns keys of a map.",
    "map_values": "Returns values of a map.",
    "map_delete": "Removes a key-value pair.",
    "map_get": "Gets a value by key.",
    "map_set": "Sets a value by key.",

    // Math
    "math.abs": "Absolute value.",
    "math.round": "Rounds number.",
    "math.ceil": "Rounds up.",
    "math.floor": "Rounds down.",
    "math.sqrt": "Square root.",
    "math.random": "Random float between 0 and 1.",
    "math.randint": "Random integer between min and max.",
    "math.sin": "Sine of radians.",
    "math.cos": "Cosine of radians.",
    "math.tan": "Tangent of radians.",
    "math.log": "Natural logarithm.",
    "math.exp": "Exponent e^x.",
    "math.pow": "Exponentiation base^exp.",

    // Time
    "time.sleep": "Pauses execution for seconds.",
    "time.time": "Unix timestamp.",
    "time.datetime": "Date and time string.",
    "time.format_time": "Format time via strftime.",
    "time.get_time": "Returns HH:MM:SS.",
    "time.get_date": "Returns YYYY-MM-DD.",
    "time.format_datetime": "Alias for format_time.",
    "time.military_time": "24h time.",
    "time.twelve_hour_time": "12h time with AM/PM.",

    // FS
    "fs.exists": "Checks if path exists.",
    "fs.is_file": "True if path is a file.",
    "fs.is_dir": "True if path is directory.",
    "fs.list_dir": "Lists directory contents.",
    "fs.make_dir": "Creates a directory.",
    "fs.remove_file": "Deletes a file.",
    "fs.remove_dir": "Deletes directory recursively.",
    "fs.get_size": "Returns file size.",

    // String
    "string.upper": "Uppercase string.",
    "string.lower": "Lowercase string.",
    "string.trim": "Trim whitespace.",
    "string.replace": "Replace substring.",
    "string.split": "Split string.",
    "string.contains": "String contains substring.",
    "string.startsWith": "Starts with prefix.",
    "string.endsWith": "Ends with suffix.",
    "string.slice": "Substring between indices.",
    "join": "Joins list with separator.",

    // Window
    "window.init": "Initializes window system.",
    "window.create_display": "Creates display window.",
    "window.update": "Updates display.",
    "window.get_events": "Returns event list.",
    "window.get_event_type": "Returns event type.",
    "window.get_event_key": "Returns key code.",
    "window.get_const": "Gets constant by name.",
    "window.fill": "Fills display with color.",
    "window.rect": "Draws rectangle.",
    "window.circle": "Draws circle.",
    "window.text": "Draws text.",
    "window.update_key_states": "Updates key cache.",
    "window.get_key_state": "Checks if key pressed.",
    "window.load_image": "Loads image.",
    "window.set_background": "Sets background.",
    "window.create_sprite": "Creates sprite.",
    "window.draw_sprite": "Draws sprite.",
    "window.update_sprites": "Updates sprites.",
    "window.draw_all_sprites": "Draws all sprites.",

    // GUI
    "gui.create_window": "Creates GUI window.",
    "gui.set_title": "Sets window title.",
    "gui.set_geometry": "Changes window size.",
    "gui.show_window": "Shows window.",
    "gui.hide_window": "Hides window.",
    "gui.close_window": "Closes window.",
    "gui.add_button": "Adds button.",
    "gui.add_label": "Adds label.",
    "gui.add_entry": "Adds entry.",
    "gui.add_text": "Adds text widget.",
    "gui.add_checkbox": "Adds checkbox.",
    "gui.add_radio_button": "Adds radio button.",
    "gui.add_listbox": "Adds listbox.",
    "gui.add_canvas": "Adds canvas.",
    "gui.add_menu": "Adds menu item.",
    "gui.add_menu_item": "Adds menu entry.",
    "gui.draw_line": "Draws line.",
    "gui.draw_rectangle": "Draws rectangle.",
    "gui.draw_oval": "Draws oval.",
    "gui.draw_text": "Draws text on canvas.",
    "gui.clear_canvas": "Clears canvas.",
    "gui.bind_event": "Binds event.",
    "gui.message_box": "Shows message box.",
    "gui.input_dialog": "Shows input dialog.",
    "gui.file_dialog": "Shows file dialog.",
    "gui.color_chooser": "Shows color chooser.",
    "gui.start_main_loop": "Starts GUI loop.",
    "gui.quit_main_loop": "Stops GUI loop.",

    // JSoft
    "jsoft.parse": "Parses JSON string.",
    "jsoft.stringify": "Converts map/list to JSON.",
    "jsoft.load": "Loads JSON file.",
    "jsoft.dump": "Writes JSON file.",

    "true": "Boolean literal true.",
    "false": "Boolean literal false.",
    "nil": "No value."
};

function deactivate() {}

module.exports = { activate, deactivate };
