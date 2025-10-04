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

                // 🚫 Skip suggestions while declaring variable, function, or class
                if (/\b(let|func|class)\s+[a-zA-Z_0-9]*$/.test(prefix)) {
                    return [];
                }

                // 🚫 Skip inside strings or comments (except import strings)
                const insideImport = /\bimport\s*\(\s*["'][^"']*$/.test(prefix);
                if (!insideImport && (/["'].*$/.test(prefix) || /\/\/.*/.test(prefix))) {
                    return [];
                }

                // ---------------------------
                // ✨ Special case: inside import("...")
                // ---------------------------
                if (insideImport) {
                    const items = [];
                    const nativeModules = ["time", "fs", "string", "math", "window"];
                    for (const mod of nativeModules) {
                        const item = new vscode.CompletionItem(mod, vscode.CompletionItemKind.Module);
                        item.detail = "Native Mrya module";
                        item.insertText = mod;
                        item.documentation = `Native built-in module "${mod}"`;
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
                // 🧠 Detect module prefix (e.g. "window." or "fs.")
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
                // 🔍 Dynamic scanning
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

                // ---------------------------
                // 📚 Static completions
                // ---------------------------
                const keywords = [
                    "let", "const", "func", "define", "return",
                    "class", "inherit", "this", "as",
                    "if", "else", "while", "for", "break", "continue",
                    "try", "catch", "end", "raise",
                    "true", "false", "nil"
                ];

                const builtins = Object.keys(builtinDocs);
                const modules = ["fs", "time", "math", "string", "window"];

                const items = [];

                // --- Keywords ---
                for (const word of keywords) {
                    const item = new vscode.CompletionItem(word, vscode.CompletionItemKind.Keyword);
                    item.insertText = word;
                    if (builtinDocs[word]) item.documentation = builtinDocs[word];
                    items.push(item);
                }

                // --- Built-in functions ---
                for (const word of builtins) {
                    if (["true", "false", "nil"].includes(word)) continue; // skip literals
                    const item = new vscode.CompletionItem(word, vscode.CompletionItemKind.Function);
                    item.insertText = word + "()";
                    item.documentation = builtinDocs[word];
                    items.push(item);
                }

                // --- Modules ---
                for (const mod of modules) {
                    const item = new vscode.CompletionItem(mod, vscode.CompletionItemKind.Module);
                    item.insertText = mod;
                    item.documentation = `Mrya built-in module "${mod}"`;
                    items.push(item);
                }

                // --- User variables ---
                for (const v of variables) {
                    const item = new vscode.CompletionItem(v, vscode.CompletionItemKind.Variable);
                    item.detail = "User variable";
                    item.insertText = v;
                    items.push(item);
                }

                // --- User functions ---
                for (const f of functions) {
                    const item = new vscode.CompletionItem(f, vscode.CompletionItemKind.Function);
                    item.detail = "User function";
                    item.insertText = f + "()";
                    items.push(item);
                }

                // --- User classes ---
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
    // 📝 HOVER PROVIDER
    // ---------------------------
    const hover = vscode.languages.registerHoverProvider('mrya', {
        provideHover(document, position) {
            const range = document.getWordRangeAtPosition(position);
            if (!range) return;
            const word = document.getText(range);

            // Support module hover (e.g. window.rect)
            for (const key of Object.keys(builtinDocs)) {
                if (key === word || key.endsWith("." + word)) {
                    return new vscode.Hover(`**${key}** — ${builtinDocs[key]}`);
                }
            }
        }
    });

    context.subscriptions.push(provider, hover);
}

// ---------------------------
// Helper: list .mrya files and folders
// ---------------------------
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
    } catch (e) {
        return [];
    }
}

// ---------------------------
// Built-in documentation map
// ---------------------------
const builtinDocs = {
    // Core
    "output": "Prints a value to the console.\n\nExample: `output(\"Hello\")`",
    "import": "Imports a module or file.\n\nExample: `let t = import(\"time\")`",
    "request": "Prompts the user for input.",
    "raise": "Raises a custom exception.\n\nExample: `raise(\"Something went wrong\")`",
    "assert": "Asserts that a value equals expected; raises error otherwise.",

    // Type conversion
    "to_int": "Converts a value to an integer.",
    "to_float": "Converts a value to a float.",
    "to_bool": "Converts a value to a boolean.",

    // File I/O
    "fetch": "Reads the content of a file (creates if missing).",
    "store": "Writes content to a file.",
    "append_to": "Appends content to the end of a file.",

    // Lists
    "append": "Adds an item to the end of a list.",
    "length": "Returns the number of items in a list or characters in a string.",
    "list_slice": "Returns a slice of a list.",
    "get": "Retrieves an element from a list by index.",
    "set": "Sets a value at an index in a list.",

    // Maps
    "map_has": "Checks if a map contains a key.",
    "map_keys": "Returns all keys in a map.",
    "map_values": "Returns all values in a map.",
    "map_delete": "Removes a key-value pair from a map.",
    "map_get": "Gets a value from a map by key.",
    "map_set": "Sets a value in a map by key.",

    // Math
    "abs": "Returns the absolute value of a number.",
    "round": "Rounds a number to the nearest integer.",
    "up": "Rounds up to the nearest integer.",
    "down": "Rounds down to the nearest integer.",
    "root": "Calculates the square root.",
    "random": "Returns a random float between 0.0 and 1.0.",
    "randint": "Returns a random integer between min and max (inclusive).",

    // Time module
    "time.sleep": "Pauses execution for the specified seconds.",
    "time.time": "Returns the current Unix timestamp.",
    "time.datetime": "Returns the current date and time as a string.",

    // FS module
    "fs.exists": "Checks if a file or directory exists.",
    "fs.is_file": "Returns true if path is a file.",
    "fs.is_dir": "Returns true if path is a directory.",
    "fs.list_dir": "Lists directory contents.",
    "fs.make_dir": "Creates a new directory.",
    "fs.remove_file": "Deletes a file.",
    "fs.remove_dir": "Deletes a directory and its contents.",
    "fs.get_size": "Returns the size of a file in bytes.",

    // String module
    "str_utils.upper": "Converts string to uppercase.",
    "str_utils.lower": "Converts string to lowercase.",
    "str_utils.trim": "Removes whitespace from both ends of the string.",
    "str_utils.replace": "Replaces all occurrences of a substring.",
    "str_utils.split": "Splits a string into a list by separator.",
    "str_utils.contains": "Checks if a string contains a substring.",
    "str_utils.startsWith": "Checks if a string starts with a prefix.",
    "str_utils.endsWith": "Checks if a string ends with a suffix.",
    "str_utils.slice": "Returns a substring between indices.",
    "join": "Joins a list of strings using a separator.",

    // Window module
    "window.init": "Initializes the window system.",
    "window.create_display": "Creates a display window with width and height.",
    "window.update": "Updates the window display and limits FPS.",
    "window.get_events": "Returns the list of current event objects.",
    "window.get_event_type": "Returns the type of an event (e.g., QUIT, KEYDOWN).",
    "window.get_event_key": "Returns the key code for a keyboard event.",
    "window.get_const": "Gets a constant by name (e.g., 'K_w', 'QUIT').",
    "window.fill": "Fills the display surface with a solid color.",
    "window.rect": "Draws a rectangle at (x, y) with size (sx, sy) and color (r, g, b).",
    "window.circle": "Draws a circle centered at (x, y) with color (r, g, b).",
    "window.text": "Renders text at (x, y) with font, size, and color.",
    "window.update_key_states": "Updates the current key state cache.",
    "window.get_key_state": "Returns true if the specified key is pressed.",

    // Built-in literals
    "true": "Boolean literal for truth.",
    "false": "Boolean literal for falsehood.",
    "nil": "Represents an absence of value."
};

function deactivate() {}

module.exports = { activate, deactivate };
