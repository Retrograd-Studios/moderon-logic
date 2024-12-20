import * as path from "path";
import * as os from "os";
import * as vscode from "vscode";
//import { Env } from "./client";
//import { log } from "./util";
import { TargetInfo } from "./toolchain";


// export type RunnableEnvCfg =
//     | undefined
//     | Record<string, string>
//     | { mask?: string; env: Record<string, string> }[];

export class Config {

    context: vscode.ExtensionContext;

    readonly extensionId = "Retrograd-Studios.moderon-logic";
    configureLang: vscode.Disposable | undefined;

    targetDevice: TargetInfo = {
        description: "[Device]",
        devManId: 0,
        devName: "Select Target",
        frameWorkVerA: 0,
        frameWorkVerB: 22,
        triplet: "thumbv7m-none-none-eabi",
        pathToFile: "",
        periphInfo: {
            aoCount: 3,
            relayCount: 6,
            uartCount: 8,
            uiCount: 11,
            flashSize: 256 * 1024,
            ramSize: 64 * 1024,
            flashPageSize: 256,
            isDesktop: false,
            isResourcesInternal: false
        },
        stdlib: "armv7m",
        runtime: "clang_rt.builtins-armv7m",
        stdlibs: [],
        includePaths: []
    };

    productPath: string = "./out/output";
    exePath: string = "./out/output";
    uploadingFilePath: string = "./out/prog.alf";
    productName: string = "output";

    hostTriplet: string = "x64-win";

    readonly rootSection = "eepl";
    // config: {
    //     description: string; devManId: number; devName: string; frameWorkVerA: number; frameWorkVerB: number; triplet: string;
    //     //     if (varName in supportedVariables) {
    //     //         return supportedVariables[varName]();
    //     //     } else {
    //     //         // return "${" + varName + "}";
    //     //         return null;
    //     //     }
    //     pathToFile: string; periphInfo: {
    //         aoCount: number; relayCount: number; uartCount: number; uiCount: number; flashSize: number; //         return null;
    //         ramSize: number; flashPageSize: number;
    //     }; stdlib: string; runtime: string;
    // };
    // private readonly requiresReloadOpts = [
    //     "easy",
    //     "procMacro",
    //     "serverPath",
    //     "server",
    //     "files",
    //     "lens", // works as lens.*
    // ].map((opt) => `${this.rootSection}.${opt}`);

    // readonly package: {
    //     version: string;
    //     releaseTag: string | null;
    //     enableProposedApi: boolean | undefined;
    // } = vscode.extensions.getExtension(this.extensionId)!.packageJSON;

    // readonly globalStorageUri: vscode.Uri;

    constructor(ctx: vscode.ExtensionContext) {
        this.context = ctx;
        // this.globalStorageUri = ctx.globalStorageUri;
        // vscode.workspace.onDidChangeConfiguration(
        //     this.onDidChangeConfiguration,
        //     this,
        //     ctx.subscriptions
        // );
        // this.refreshLogging();
        // this.configureLanguage();
    }

    dispose() {
        //this.configureLang?.dispose();
    }

    // private refreshLogging() {
    //     log.setEnabled(this.traceExtension);
    //     log.info("Extension version:", this.package.version);

    //     const cfg = Object.entries(this.cfg).filter(([_, val]) => !(val instanceof Function));
    //     log.info("Using configuration", Object.fromEntries(cfg));
    // }

    // private async onDidChangeConfiguration(event: vscode.ConfigurationChangeEvent) {
    //     this.refreshLogging();

    //     this.configureLanguage();

    //     const requiresReloadOpt = this.requiresReloadOpts.find((opt) =>
    //         event.affectsConfiguration(opt)
    //     );

    //     if (!requiresReloadOpt) return;

    //     if (this.restartServerOnConfigChange) {
    //         await vscode.commands.executeCommand("rust-analyzer.reload");
    //         return;
    //     }

    //     const message = `Changing "${requiresReloadOpt}" requires a server restart`;
    //     const userResponse = await vscode.window.showInformationMessage(message, "Restart now");

    //     if (userResponse) {
    //         const command = "rust-analyzer.reload";
    //         await vscode.commands.executeCommand(command);
    //     }
    // }

    /**
     * Sets up additional language configuration that's impossible to do via a
     * separate language-configuration.json file. See [1] for more information.
     *
     * [1]: https://github.com/Microsoft/vscode/issues/11514#issuecomment-244707076
     */
    private configureLanguage() {
        // if (this.typingContinueCommentsOnNewline && !this.configureLang) {
        //     const indentAction = vscode.IndentAction.None;

        //     this.configureLang = vscode.languages.setLanguageConfiguration("eemblang", {
        //         onEnterRules: [
        //             {
        //                 // Doc single-line comment
        //                 // e.g. ///|
        //                 beforeText: /^\s*\/{3}.*$/,
        //                 action: { indentAction, appendText: "/// " },
        //             },
        //             {
        //                 // Parent doc single-line comment
        //                 // e.g. //!|
        //                 beforeText: /^\s*\/{2}\!.*$/,
        //                 action: { indentAction, appendText: "//! " },
        //             },
        //             {
        //                 // Begins an auto-closed multi-line comment (standard or parent doc)
        //                 // e.g. /** | */ or /*! | */
        //                 beforeText: /^\s*\/\*(\*|\!)(?!\/)([^\*]|\*(?!\/))*$/,
        //                 afterText: /^\s*\*\/$/,
        //                 action: {
        //                     indentAction: vscode.IndentAction.IndentOutdent,
        //                     appendText: " * ",
        //                 },
        //             },
        //             {
        //                 // Begins a multi-line comment (standard or parent doc)
        //                 // e.g. /** ...| or /*! ...|
        //                 beforeText: /^\s*\/\*(\*|\!)(?!\/)([^\*]|\*(?!\/))*$/,
        //                 action: { indentAction, appendText: " * " },
        //             },
        //             {
        //                 // Continues a multi-line comment
        //                 // e.g.  * ...|
        //                 beforeText: /^(\ \ )*\ \*(\ ([^\*]|\*(?!\/))*)?$/,
        //                 action: { indentAction, appendText: "* " },
        //             },
        //             {
        //                 // Dedents after closing a multi-line comment
        //                 // e.g.  */|
        //                 beforeText: /^(\ \ )*\ \*\/\s*$/,
        //                 action: { indentAction, removeText: 1 },
        //             },
        //         ],
        //     });
        // }
        // if (!this.typingContinueCommentsOnNewline && this.configureLang) {
        //     this.configureLang.dispose();
        //     this.configureLang = undefined;
        // }
    }

    // We don't do runtime config validation here for simplicity. More on stackoverflow:
    // https://stackoverflow.com/questions/60135780/what-is-the-best-way-to-type-check-the-configuration-for-vscode-extension

    // public get cfg(): vscode.WorkspaceConfiguration {
    //     const _cfg = vscode.workspace.getConfiguration(this.rootSection);
    //     return _cfg;
    // }

    /**
     * Beware that postfix `!` operator erases both `null` and `undefined`.
     * This is why the following doesn't work as expected:
     *
     * ```ts
     * const nullableNum = vscode
     *  .workspace
     *  .getConfiguration
     *  .getConfiguration("rust-analyzer")
     *  .get<number | null>(path)!;
     *
     * // What happens is that type of `nullableNum` is `number` but not `null | number`:
     * const fullFledgedNum: number = nullableNum;
     * ```
     * So this getter handles this quirk by not requiring the caller to use postfix `!`
     */
    public get<T>(path: string): T {
        return vscode.workspace.getConfiguration(this.rootSection).get<T>(path)!;
    }

    public async set(path: string, value: any) {
        await vscode.workspace.getConfiguration(this.rootSection).update(path, value);
    }

    public async setGlobal(path: string, value: any) {
        await vscode.workspace.getConfiguration(this.rootSection).update(path, value, vscode.ConfigurationTarget.Global);
    }

//     get serverPath() {
//         return this.get<null | string>("server.path") ?? this.get<null | string>("serverPath");
//     }
//     // get serverExtraEnv(): Env {
//     //     const extraEnv =
//     //         this.get<{ [key: string]: string | number } | null>("server.extraEnv") ?? {};
//     //     return Object.fromEntries(
//     //         Object.entries(extraEnv).map(([k, v]) => [k, typeof v !== "string" ? v.toString() : v])
//     //     );
//     // }
//     get traceExtension() {
//         return this.get<boolean>("trace.extension");
//     }

//     get easyRunner() {
//         return this.get<string | undefined>("easyRunner");
//     }

//     get runnableEnv() {
//         const item = this.get<any>("runnableEnv");
//         if (!item) return item;
//         const fixRecord = (r: Record<string, any>) => {
//             for (const key in r) {
//                 if (typeof r[key] !== "string") {
//                     r[key] = String(r[key]);
//                 }
//             }
//         };
//         if (item instanceof Array) {
//             item.forEach((x) => fixRecord(x.env));
//         } else {
//             fixRecord(item);
//         }
//         return item;
//     }

//     get restartServerOnConfigChange() {
//         return this.get<boolean>("restartServerOnConfigChange");
//     }

//     get typingContinueCommentsOnNewline() {
//         return this.get<boolean>("typing.continueCommentsOnNewline");
//     }

//     get debug() {
//         let sourceFileMap = this.get<Record<string, string> | "auto">("debug.sourceFileMap");
//         if (sourceFileMap !== "auto") {
//             // "/rustc/<id>" used by suggestions only.
//             const { ["/eec/<id>"]: _, ...trimmed } =
//                 this.get<Record<string, string>>("debug.sourceFileMap");
//             sourceFileMap = trimmed;
//         }

//         return {
//             engine: this.get<string>("debug.engine"),
//             engineSettings: this.get<object>("debug.engineSettings"),
//             openDebugPane: this.get<boolean>("debug.openDebugPane"),
//             sourceFileMap: sourceFileMap,
//         };
//     }

//     get hoverActions() {
//         return {
//             enable: this.get<boolean>("hover.actions.enable"),
//             implementations: this.get<boolean>("hover.actions.implementations.enable"),
//             references: this.get<boolean>("hover.actions.references.enable"),
//             run: this.get<boolean>("hover.actions.run.enable"),
//             debug: this.get<boolean>("hover.actions.debug.enable"),
//             gotoTypeDef: this.get<boolean>("hover.actions.gotoTypeDef.enable"),
//         };
//     }
// }

// const VarRegex = new RegExp(/\$\{(.+?)\}/g);

// export function substituteVSCodeVariableInString(val: string): string {
//     return val.replace(VarRegex, (substring: string, varName) => {
//         if (typeof varName === "string") {
//             return computeVscodeVar(varName) || substring;
//         } else {
//             return substring;
//         }
//     });
// }

// export function substituteVSCodeVariables(resp: any): any {
//     if (typeof resp === "string") {
//         return substituteVSCodeVariableInString(resp);
//     } else if (resp && Array.isArray(resp)) {
//         return resp.map((val) => {
//             return substituteVSCodeVariables(val);
//         });
//     } else if (resp && typeof resp === "object") {
//         const res: { [key: string]: any } = {};
//         for (const key in resp) {
//             const val = resp[key];
//             res[key] = substituteVSCodeVariables(val);
//         }
//         return res;
//     } else if (typeof resp === "function") {
//         return null;
//     }
//     return resp;
// }
// export function substituteVariablesInEnv(env: Env): Env {
//     const missingDeps = new Set<string>();
//     // vscode uses `env:ENV_NAME` for env vars resolution, and it's easier
//     // to follow the same convention for our dependency tracking
//     const definedEnvKeys = new Set(Object.keys(env).map((key) => `env:${key}`));
//     const envWithDeps = Object.fromEntries(
//         Object.entries(env).map(([key, value]) => {
//             const deps = new Set<string>();
//             const depRe = new RegExp(/\${(?<depName>.+?)}/g);
//             let match = undefined;
//             while ((match = depRe.exec(value as string))) {
//                 const depName = match.groups!.depName;
//                 deps.add(depName);
//                 // `depName` at this point can have a form of `expression` or
//                 // `prefix:expression`
//                 if (!definedEnvKeys.has(depName)) {
//                     missingDeps.add(depName);
//                 }
//             }
//             return [`env:${key}`, { deps: [...deps], value }];
//         })
//     );

//     const resolved = new Set<string>();
//     for (const dep of missingDeps) {
//         const match = /(?<prefix>.*?):(?<body>.+)/.exec(dep);
//         if (match) {
//             const { prefix, body } = match.groups!;
//             if (prefix === "env") {
//                 const envName = body;
//                 envWithDeps[dep] = {
//                     value: process.env[envName] ?? "",
//                     deps: [],
//                 };
//                 resolved.add(dep);
//             } else {
//                 // we can't handle other prefixes at the moment
//                 // leave values as is, but still mark them as resolved
//                 envWithDeps[dep] = {
//                     value: "${" + dep + "}",
//                     deps: [],
//                 };
//                 resolved.add(dep);
//             }
//         } else {
//             envWithDeps[dep] = {
//                 value: computeVscodeVar(dep) || "${" + dep + "}",
//                 deps: [],
//             };
//         }
//     }
//     const toResolve = new Set(Object.keys(envWithDeps));

//     let leftToResolveSize;
//     do {
//         leftToResolveSize = toResolve.size;
//         for (const key of toResolve) {
//             if (envWithDeps[key].deps.every((dep) => resolved.has(dep))) {
//                 envWithDeps[key].value = (envWithDeps[key].value as string).replace(
//                     /\${(?<depName>.+?)}/g,
//                     (_wholeMatch, depName) => {
//                         return envWithDeps[depName].value;
//                     }
//                 );
//                 resolved.add(key);
//                 toResolve.delete(key);
//             }
//         }
//     } while (toResolve.size > 0 && toResolve.size < leftToResolveSize);

//     const resolvedEnv: Env = {};
//     for (const key of Object.keys(env)) {
//         resolvedEnv[key] = envWithDeps[`env:${key}`].value;
//     }
//     return resolvedEnv;
// }

// function computeVscodeVar(varName: string): string | null {
//     const workspaceFolder = () => {
//         const folders = vscode.workspace.workspaceFolders ?? [];
//         if (folders.length === 1) {
//             // TODO: support for remote workspaces?
//             return folders[0].uri.fsPath;
//         } else if (folders.length > 1) {
//             // could use currently opened document to detect the correct
//             // workspace. However, that would be determined by the document
//             // user has opened on Editor startup. Could lead to
//             // unpredictable workspace selection in practice.
//             // It's better to pick the first one
//             return folders[0].uri.fsPath;
//         } else {
//             // no workspace opened
//             return "";
//         }
//     };
//     // https://code.visualstudio.com/docs/editor/variables-reference
//     const supportedVariables: { [k: string]: () => string } = {
//         workspaceFolder,

//         workspaceFolderBasename: () => {
//             return path.basename(workspaceFolder());
//         },

//         cwd: () => process.cwd(),
//         userHome: () => os.homedir(),

//         // see
//         // https://github.com/microsoft/vscode/blob/08ac1bb67ca2459496b272d8f4a908757f24f56f/src/vs/workbench/api/common/extHostVariableResolverService.ts#L81
//         // or
//         // https://github.com/microsoft/vscode/blob/29eb316bb9f154b7870eb5204ec7f2e7cf649bec/src/vs/server/node/remoteTerminalChannel.ts#L56
//         execPath: () => process.env.VSCODE_EXEC_PATH ?? process.execPath,

//         pathSeparator: () => path.sep,
//     };

//     if (varName in supportedVariables) {
//         return supportedVariables[varName]();
//     } else {
//         // return "${" + varName + "}";
//         return null;
//     }
}