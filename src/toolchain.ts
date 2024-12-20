import * as cp from "child_process";
import * as os from "os";
import * as path from "path";
import * as readline from "readline";
import * as vscode from "vscode";
import { execute, log, memoizeAsync } from "./util";
import * as fsExtra from 'fs-extra';
import * as unzip from 'unzip-stream';

import * as fs from 'fs';
import * as https from 'https';


import fetch from 'node-fetch';
import { ClientRequest } from 'http';
import { Config } from "./config";


interface CompilationArtifact {
  fileName: string;
  name: string;
  kind: string;
  isTest: boolean;
}

export interface ArtifactSpec {
  easyArgs: string[];
  filter?: (artifacts: CompilationArtifact[]) => CompilationArtifact[];
}

export class Easy {
  constructor(readonly rootFolder: string, readonly output: vscode.OutputChannel) { }

  // Made public for testing purposes
  static artifactSpec(args: readonly string[]): ArtifactSpec {
    const easyArgs = [...args, "--message-format=json"];

    // arguments for a runnable from the quick pick should be updated.
    // see crates\rust-analyzer\src\main_loop\handlers.rs, handle_code_lens
    switch (easyArgs[0]) {
      case "run":
        easyArgs[0] = "build";
        break;
      case "test": {
        if (!easyArgs.includes("--no-run")) {
          easyArgs.push("--no-run");
        }
        break;
      }
    }

    const result: ArtifactSpec = { easyArgs: easyArgs };
    if (easyArgs[0] === "test" || easyArgs[0] === "bench") {
      // for instance, `crates\rust-analyzer\tests\heavy_tests\main.rs` tests
      // produce 2 artifacts: {"kind": "bin"} and {"kind": "test"}
      result.filter = (artifacts) => artifacts.filter((it) => it.isTest);
    }

    return result;
  }

  private async getArtifacts(spec: ArtifactSpec): Promise<CompilationArtifact[]> {
    const artifacts: CompilationArtifact[] = [];

    try {
      await this.runEasy(
        spec.easyArgs,
        (message) => {
          if (message.reason === "compiler-artifact" && message.executable) {
            const isBinary = message.target.crate_types.includes("bin");
            const isBuildScript = message.target.kind.includes("custom-build");
            if ((isBinary && !isBuildScript) || message.profile.test) {
              artifacts.push({
                fileName: message.executable,
                name: message.target.name,
                kind: message.target.kind[0],
                isTest: message.profile.test,
              });
            }
          } else if (message.reason === "compiler-message") {
            this.output.append(message.message.rendered);
          }
        },
        (stderr) => this.output.append(stderr)
      );
    } catch (err) {
      this.output.show(true);
      throw new Error(`Easy invocation has failed: ${err}`);
    }

    return spec.filter?.(artifacts) ?? artifacts;
  }

  async executableFromArgs(args: readonly string[]): Promise<string> {
    const artifacts = await this.getArtifacts(Easy.artifactSpec(args));

    if (artifacts.length === 0) {
      throw new Error("No compilation artifacts");
    } else if (artifacts.length > 1) {
      throw new Error("Multiple compilation artifacts are not supported.");
    }

    return artifacts[0].fileName;
  }

  private async runEasy(
    easyArgs: string[],
    onStdoutJson: (obj: any) => void,
    onStderrString: (data: string) => void
  ): Promise<number> {
    const path = await easyPath();
    return await new Promise((resolve, reject) => {
      const easy = cp.spawn(path, easyArgs, {
        stdio: ["ignore", "pipe", "pipe"],
        cwd: this.rootFolder,
      });

      easy.on("error", (err) => reject(new Error(`could not launch EEmbLang compiler: ${err}`)));

      easy.stderr.on("data", (chunk) => onStderrString(chunk.toString()));

      const rl = readline.createInterface({ input: easy.stdout });
      rl.on("line", (line) => {
        const message = JSON.parse(line);
        onStdoutJson(message);
      });

      easy.on("exit", (exitCode, _) => {
        if (exitCode === 0) resolve(exitCode);
        else reject(new Error(`exit code: ${exitCode}.`));
      });
    });
  }
}

/** Mirrors `project_model::sysroot::discover_sysroot_dir()` implementation*/
export async function getSysroot(dir: string): Promise<string> {
  const easyPath = await getPathForExecutable("eec");

  // do not memoize the result because the toolchain may change between runs
  return await execute(`${easyPath} --print sysroot`, { cwd: dir });
}

export async function getEasyId(dir: string): Promise<string> {
  const easyPath = await getPathForExecutable("eec");

  // do not memoize the result because the toolchain may change between runs
  const data = await execute(`${easyPath} -V -v`, { cwd: dir });
  const rx = /commit-hash:\s(.*)$/m;

  return rx.exec(data)![1];
}

/** Mirrors `toolchain::cargo()` implementation */
export function easyPath(): Promise<string> {
  return getPathForExecutable("eec");
}

export function linkerPath(): Promise<string> {
  return getPathForExecutable("ld.lld");
}

export function ebuildPath(): Promise<string> {
  return getPathForExecutable("ebuild");
}

export function flasherPath(): Promise<string> {
  return getPathForExecutable("eflash");
}




export type ToolchainInfo = {
  label: string;
  file: string;
  description: string;
  ver: string;
  url: string;
}

export type ToolchainsFile = {
  toolchains: ToolchainInfo[];
}


export type EECompilerOutput = {
  libs: string[];
  productName: string;
}



export let LastToolchain: ToolchainInfo | undefined = undefined;


export async function installToolchain(toolchainInfo: ToolchainInfo): Promise<boolean> {


  let homeDir = os.type() === "Windows_NT" ? os.homedir() : os.homedir();

  const tmpDir = vscode.Uri.joinPath(
    vscode.Uri.file(homeDir),
    ".eec-tmp"
  );

  const tmpFilePath = vscode.Uri.joinPath(
    vscode.Uri.file(homeDir),
    ".eec-tmp", `${toolchainInfo.file}.zip`
  );


  const toolchainDirPath = vscode.Uri.joinPath(
    vscode.Uri.file(homeDir)
  );

  if (!(await isDirAtUri(tmpDir))) {
    await vscode.workspace.fs.createDirectory(tmpDir).then(() => { }, () => {
      console.log('Create dir error!');
    });
  }

  const isExist = fs.existsSync(tmpFilePath.fsPath);// ( ( await isFileAtUri(tmpFilePath) ) ) ;

  let result = false;

  const prog = await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: !isExist ? "Downloading..." : "Installing...",
    cancellable: true
  }, async (progress, token) => {

    progress.report({ message: "0 Mbyte", increment: 0 });

    let totalSize = 1;
    let prevSize = 0;
    let currentSize = 0;

    let request: ClientRequest;

    let isTerminated = false;



    async function download(url: string | URL /*| https.RequestOptions*/, targetFile: fs.PathLike): Promise<boolean> {
      return new Promise((resolve, reject) => {


        request = https.get(url, /*{ headers: { responseType: 'arraybuffer'} } ,*/ response => {

          const code = response.statusCode ?? 0

          if (code >= 400) {
            isTerminated = true;
            reject(new Error(response.statusMessage));
          }

          // handle redirects
          if (code > 300 && code < 400 && !!response.headers.location) {
            resolve(download(response.headers.location, targetFile));
            return;
          }

          totalSize = response.headers['content-length'] ? Number(response.headers['content-length']) : 1;
          console.log(totalSize);

          response.on('data', (chunk) => {
            const buffer = chunk as Buffer;
            prevSize = currentSize;

            if (totalSize == 1) {
              console.log("Compressed size:", buffer.readInt32LE(20));
              console.log("Uncompressed size:", buffer.readInt32LE(24));
              console.log("Extra field length:", buffer.readInt16LE(30));
              totalSize = 2;
            }
            //currentSize += 1024*1024;//buffer.byteLength;
            currentSize += buffer.byteLength;
          });

          response.on('error', (err) => {
            console.log(err);
            isTerminated = true;
            resolve(false);
            response.unpipe();
          });


          try {

            let isAborted = false;
            const fileWriter = fs.createWriteStream(targetFile, {})
              .on('finish', async () => {


                if (isAborted) {
                  return;
                }

                console.log("done");
                progress.report({ message: "Installing...", increment: -100 });
                try {
                  // let buttons = ['Yes', 'No'];
                  // let choice = await vscode.window.showInformationMessage(`Do you want to use clear install?`, { modal: true }, ...buttons);
                  // if (choice === buttons[0]) {
                  //   fs.rmSync(vscode.Uri.joinPath(toolchainDirPath, '.eec').fsPath, { recursive: true, force: true });
                  // }
                  fs.rmSync(vscode.Uri.joinPath(toolchainDirPath, '.eec').fsPath, { recursive: true, force: true });

                  totalSize = fsExtra.statSync(tmpFilePath.fsPath).size;
                  currentSize = 0;

                  const unZipStream = fsExtra.createReadStream(tmpFilePath.fsPath).on('data', (chunk: Buffer) => {
                    const buffer = chunk as Buffer;
                    currentSize += buffer.length;
                  }).on('error', (err: Error) => {
                    throw err;
                  });

                  unZipStream.pipe(unzip.Extract({ path: toolchainDirPath.fsPath })).on('finish', async () => {

                    if (os.platform().toString() != 'win32') {
                      let binPath = vscode.Uri.joinPath(toolchainDirPath, ".eec", "bin");

                      await vscode.workspace.fs.readDirectory(binPath).then((files) => {
                        files.forEach(element => {
                          const subFile = vscode.Uri.joinPath(binPath, element[0]).fsPath;

                          try {
                            const fd = fs.openSync(subFile, 'r+');
                            fs.fchmodSync(fd, 0o777);
                            fs.closeSync(fd);
                            if (element[0] != 'lld' && element[0].indexOf("lld") != -1) {
                              fs.rmSync(subFile, { force: true });
                              fs.symlinkSync('lld', subFile, 'file');
                            }
                          } catch (e) {
                            vscode.window.showErrorMessage(`Can't open file ${subFile} to set file permission`, ...['Ok']);
                            return;
                          }

                        });
                      }, () => {
                        console.log("err");
                      });
                    }


                    vscode.window.showInformationMessage(`Toolchain has been successuly installed!`, ...['Ok']);
                    isTerminated = true;
                  }).on('error', (err: Error) => {
                    throw err;
                  });

                } catch (err) {
                  console.log();
                  (async () => {
                    let buttons = ['Yes', 'No'];
                    let choice = await vscode.window.showErrorMessage(`Invalid toolcahin archive!\nDo you want to delete this file?`, ...buttons);
                    if (choice === buttons[0]) {
                      fs.rm(tmpFilePath.fsPath, () => {
                      });
                    }
                  })();
                }

                progress.report({ message: "Installing...", increment: 100 });
                //isTerminated = true;
                resolve(true);

              }).on('error', () => {
                console.log("err");
                isTerminated = true;
                resolve(false);
                fileWriter.close();
              }).on('unpipe', () => {
                isAborted = true;
                fileWriter.close();
              });

            response.pipe(fileWriter);

          } catch (err) {
            console.log(err);
          }


        }).on('error', error => {
          console.log(error);
          isTerminated = true;
          vscode.window.showErrorMessage(`Unknown error while downloading or installing`, ...['Ok']);
          resolve(false);
        }).setTimeout(10000).on('timeout', () => {
          vscode.window.showErrorMessage(`Connection timeout.`, ...['Ok']);
          console.log("Request timeout");
          isTerminated = true;
          resolve(false);
        });

        //resolve(true);
      });
    }

    const result0 = !isExist ? download(toolchainInfo.url, tmpFilePath.fsPath) : true;

    if (isExist) {
      progress.report({ message: "Installing...", increment: 0 });
      try {
        // let buttons = ['Yes', 'No'];
        // let choice = await vscode.window.showInformationMessage(`Do you want to use clear install?`, { modal: true }, ...buttons);
        // if (choice === buttons[0]) {
        //   fs.rmSync(vscode.Uri.joinPath(toolchainDirPath, '.eec').fsPath, { recursive: true, force: true });
        // }
        fs.rmSync(vscode.Uri.joinPath(toolchainDirPath, '.eec').fsPath, { recursive: true, force: true });

        totalSize = fsExtra.statSync(tmpFilePath.fsPath).size;

        const unZipStream = fsExtra.createReadStream(tmpFilePath.fsPath).on('data', (chunk: Buffer) => {
          const buffer = chunk as Buffer;
          currentSize += buffer.length;
        }).on('error', (err: Error) => {
          throw err;
        });

        unZipStream.pipe(unzip.Extract({ path: toolchainDirPath.fsPath })).on('finish', async () => {

          if (os.platform().toString() != 'win32') {
            let binPath = vscode.Uri.joinPath(toolchainDirPath, ".eec", "bin");
            let ldPath = vscode.Uri.joinPath(binPath, 'lld').fsPath;

            await vscode.workspace.fs.readDirectory(binPath).then((files) => {
              files.forEach(element => {
                const subFile = vscode.Uri.joinPath(binPath, element[0]).fsPath;

                try {
                  const fd = fs.openSync(subFile, 'r+');
                  fs.fchmodSync(fd, 0o777);
                  fs.closeSync(fd);
                  if (element[0] != 'lld' && element[0].indexOf("lld") != -1) {
                    fs.rmSync(subFile, { force: true });
                    fs.symlinkSync(ldPath, subFile, 'file');
                  }
                } catch (e) {
                  vscode.window.showErrorMessage(`Can't open file ${subFile} to set file permission`, ...['Ok']);
                  return;
                }

              });
            }, () => {
              console.log("err");
            });
          }

          vscode.window.showInformationMessage(`Toolchain has been successuly installed!`, ...['Ok']);
          isTerminated = true;
        }).on('error', (err: Error) => {
          throw err;
        });


      } catch (err) {
        console.log();
        (async () => {
          let buttons = ['Yes', 'No'];
          let choice = await vscode.window.showErrorMessage(`Invalid toolcahin archive!\nDo you want to delete this file?`, ...buttons);
          if (choice === buttons[0]) {
            fs.rm(tmpFilePath.fsPath, () => {
            });
          }
        })();
        isTerminated = true;
      }

    }

    token.onCancellationRequested(() => {
      //console.log("User canceled the long running operation");
      request.destroy();
    });



    let prevPer = 0;
    while (!isTerminated) {
      await new Promise(f => setTimeout(f, 100));
      totalSize = totalSize ? totalSize : 1;
      const inPerc = Math.round(((currentSize)) * 100 / totalSize);
      let inc = inPerc - prevPer;
      prevPer = inPerc;
      const currentSizeInMb = Math.round((currentSize / 1024) / 1024);
      const totalSizeInMb = Math.round((totalSize / 1024) / 1024);
      console.log("[" + currentSizeInMb + "/" + totalSizeInMb + " Mbytes]", inPerc);
      progress.report({ message: "[" + currentSizeInMb + "/" + totalSizeInMb + " Mbytes]", increment: inc });

      if (token.isCancellationRequested) {
        return false;
      }

    }

    result = await result0;

    return;
  });

  //console.log("Alarm");

  if (result == false && !isExist && fs.existsSync(tmpFilePath.fsPath)) {  // ( ( await isFileAtUri(tmpFilePath) ) ) ) {
    fs.rm(tmpFilePath.fsPath, () => {
    });
  }



  if (result) {
    const toolchainInfoFile = vscode.Uri.joinPath(toolchainDirPath, ".eec", "toolchain.json");
    //if (getVerToInt(toolchainInfo.ver) < getVerToInt("0.9.0")) {
    const json = JSON.stringify(toolchainInfo).toString();
    fs.writeFileSync(toolchainInfoFile.fsPath, json, { flag: "w" });
    //}
    const toolchainTmpInfoFile = vscode.Uri.joinPath(
      vscode.Uri.file(homeDir),
      ".eec-tmp", `ToolchainInfo.${toolchainInfo.file}.json`
    );
    fs.copyFileSync(toolchainInfoFile.fsPath, toolchainTmpInfoFile.fsPath);
    const currentToolchain = await getCurrentToolchain();
    vscode.workspace.getConfiguration("eepl").update("toolchain.version", currentToolchain, vscode.ConfigurationTarget.Global);
  }


  return result;
}

type TargetPeriphInfo = {
  aoCount: number;
  relayCount: number;
  uartCount: number;
  uiCount: number;
  flashSize: number;
  ramSize: number;
  flashPageSize: number;
  isDesktop: boolean;
  isResourcesInternal: boolean;
}

export type TargetInfo = {
  description: string;
  devManId: number;
  devName: string;
  frameWorkVerA: number;
  frameWorkVerB: number;
  triplet: string;
  pathToFile: string;
  stdlib: string;
  runtime: string;
  stdlibs: string[];
  includePaths: string[];
  periphInfo: TargetPeriphInfo;
}



export async function getTargets(): Promise<TargetInfo[]> {

  let targetsInfo: Array<TargetInfo> = [];

  const homeDir = os.type() === "Windows_NT" ? os.homedir() : os.homedir();
  const targetsDir = vscode.Uri.joinPath(
    vscode.Uri.file(homeDir), ".eec", "targets");




  await vscode.workspace.fs.readDirectory(targetsDir).then(async (files: [string, vscode.FileType][]) => {

    for (let element of files) {

      console.log("file: ", element[0]);

      if (element[1] != vscode.FileType.Directory) {
        //console.log("is not dir");
        continue;
      }

      const targetInfoFile = vscode.Uri.joinPath(targetsDir, element[0], "targetInfo.json");
      const isExist = await isFileAtUri(targetInfoFile);

      if (!isExist) {
        continue;
      }

      const raw = fs.readFileSync(targetInfoFile.fsPath).toString();
      const targetInfo = JSON.parse(raw) as TargetInfo;
      targetInfo.pathToFile = targetInfoFile.fsPath;
      targetsInfo.push(targetInfo);
    }

  }, () => {
    console.log("can't find toolchain dir");
  });


  return targetsInfo;
}



export async function checkAndSetCurrentTarget(config: Config, sbSelectTargetDev: vscode.StatusBarItem) {

  const cfgTarget = config.get<TargetInfo>('target.device');

  const targets = await getTargets();

  let sTarget: TargetInfo = {
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
    includePaths: [],
    stdlibs: [],
    runtime: "clang_rt.builtins-armv7m"
  };



  if (cfgTarget != undefined && 'pathToFile' in cfgTarget) {

    for (const target of targets) {

      if (target.pathToFile == cfgTarget.pathToFile) {
        sTarget = cfgTarget;
        break;
      }

    }

  }



  //sbSelectTargetDev.text = `$(chip)[${sTarget.devName}]`;
  let platformIcon = '$(device-mobile)';

  if (sTarget.periphInfo.isDesktop) {
    if (sTarget.devName.indexOf('windows') != -1) {
      platformIcon = '$(terminal-powershell)'
    } else if (sTarget.devName.indexOf('linux') != -1) {
      platformIcon = '$(terminal-linux)'
    }
  }
  sbSelectTargetDev.text = `${platformIcon}[${sTarget.devName}]`;

  config.targetDevice = sTarget;
  config.set("target.device", sTarget);

  resoleProductPaths(config);

}



export async function setCurrentTarget(target: TargetInfo, config: Config, sbSelectTargetDev: vscode.StatusBarItem) {
  config.targetDevice = target;
  sbSelectTargetDev.text = `$(chip)[${target.devName}]`;
  await config.set("target.device", target);
}




export async function checkAndSetCurrentToolchain(config: Config, sbSelectToolchain: vscode.StatusBarItem) {

  //const cfgToolchain = config.get<ToolchainInfo>('toolchain.version');

  const currentToolchain = await getCurrentToolchain();

  if (currentToolchain != undefined && 'label' in currentToolchain) {
    //sbSelectToolchain.text = currentToolchain.label;
    sbSelectToolchain.text = `$(extensions)`;
    sbSelectToolchain.tooltip = `Toolchain: ${currentToolchain.label}`;
    if (LastToolchain != undefined && LastToolchain.ver != currentToolchain.ver) {
      //sbSelectToolchain.text += "(old version)";
      sbSelectToolchain.tooltip += "(old version)";
    }

    await config.setGlobal('toolchain.version', currentToolchain);
  }
  else {
    sbSelectToolchain.text = "Not installed!";
    sbSelectToolchain.tooltip = "Select toolchain";
    await config.setGlobal('toolchain.version', undefined);
  }

}

// export async function getTargetWithDevName(devName: string): Promise<TargetInfo> {


//   const homeDir = os.type() === "Windows_NT" ? os.homedir() : os.homedir();
//   const targetsDir = vscode.Uri.joinPath(
//     vscode.Uri.file(homeDir), ".eec", "targets");

//   let result: TargetInfo = {
//     description: "[Device]",
//     devManId: 0,
//     devName: "Device",
//     frameWorkVerA: 0,
//     frameWorkVerB: 40,
//     triplet: "thumbv7m-none-none-eabi",
//     pathToFile: "",
//     periphInfo: {
//       aoCount: 3,
//       relayCount: 6,
//       uartCount: 8,
//       uiCount: 11,
//       flashSize: 256 * 1024,
//       ramSize: 64 * 1024,
//       flashPageSize: 256
//     },
//     stdlib: "armv7m",
//     runtime: "clang_rt.builtins-armv7m"
//   };

//   await vscode.workspace.fs.readDirectory(targetsDir).then(async (files: [string, vscode.FileType][]) => {


//     for (const element of files) {

//       if (element[1] != vscode.FileType.Directory) {
//         //console.log("is not dir");
//         continue;
//       }

//       const targetInfoFile = vscode.Uri.joinPath(targetsDir, element[0], "targetInfo.json");
//       const isExist = await isFileAtUri(targetInfoFile);

//       if (!isExist) {
//         continue;
//       }

//       const raw = fs.readFileSync(targetInfoFile.fsPath).toString();
//       const targetInfo = JSON.parse(raw) as TargetInfo;
//       targetInfo.pathToFile = targetInfoFile.fsPath;

//       if (targetInfo.description != devName) {
//         if (result.description == "[Device]") {
//           result = targetInfo;
//         }
//         continue;
//       }

//       result = targetInfo;
//     }

//     // files.forEach(element => {
//     //   console.log("file: ", element[0]);
//     // }); 
//   }, () => {
//     console.log("can't find toolchain dir");
//   });

//   return result;
// }


export async function checkOldToolchain(): Promise<boolean> {
  const isOldToolchain = await getCurrentToolchain();
  if (!isOldToolchain) {
    return true;
  }

  return getVerToInt(isOldToolchain.ver) < getVerToInt('0.9.0');

}



function getVerToInt(str: string): number {
  let nums = str.split('.', 3);
  return (parseInt(nums[0]) << 16) | (parseInt(nums[1]) << 8) | (parseInt(nums[2]));
}

async function getLastToolchainInfo(config: Config): Promise<ToolchainInfo | undefined> {

  let lastToolchain: ToolchainInfo | undefined = undefined;

  const response = await fetch(`https://github.com/Retrograd-Studios/eemblangtoolchain/raw/master/toolchain_${config.hostTriplet}.json`).catch((e) => {
    console.log(e);
    return undefined;
  });

  if (response === undefined) {
    return undefined;
  }

  const data = await response.json() as ToolchainsFile;

  for (var toolchainInfo of data.toolchains) {
    // if ( lastToolchain == undefined ) {
    //   lastToolchain = toolchainInfo;
    //   continue;
    // }
    if (lastToolchain == undefined || getVerToInt(toolchainInfo.ver) > getVerToInt(lastToolchain.ver)) {
      lastToolchain = toolchainInfo;
    }
  }

  LastToolchain = lastToolchain;

  return lastToolchain;
}


export let IsNightlyToolchain = false;

export async function getToolchains(config: Config): Promise<ToolchainInfo[] | undefined> {

  let lastToolchain: ToolchainInfo | undefined = undefined;

  const response = await fetch(`https://github.com/Retrograd-Studios/eemblangtoolchain/raw/master/toolchain_${config.hostTriplet}.json`).catch((e) => {
    console.log(e);
    return undefined;
  });

  if (response === undefined) {
    return undefined;
  }

  const data = await response.json() as ToolchainsFile;

  for (var toolchainInfo of data.toolchains) {
    if (lastToolchain == undefined || getVerToInt(toolchainInfo.ver) > getVerToInt(lastToolchain.ver)) {
      lastToolchain = toolchainInfo;
    }
  }

  LastToolchain = lastToolchain;
  if (lastToolchain == undefined) {
    return undefined;
  }

  const homeDir = os.type() === "Windows_NT" ? os.homedir() : os.homedir();
  const verFile = vscode.Uri.joinPath(
    vscode.Uri.file(homeDir), ".eec", "toolchain.json");

  const isLocal = (await isFileAtUri(verFile));
  if (isLocal) {
    const raw = fs.readFileSync(verFile.fsPath).toString();
    const currentVer = JSON.parse(raw);
    IsNightlyToolchain = (currentVer.ver == lastToolchain.ver);
  }
  else {
    IsNightlyToolchain = false;
  }

  return data.toolchains;

}


export var isFoundToolchain = false;


export async function IsToolchainInstalled(config: Config): Promise<boolean> {

  if (!isFoundToolchain) {
    isFoundToolchain = await checkToolchain(config);
    if (!isFoundToolchain) {
      vscode.window.showErrorMessage(`EEmbLang Compiler is not installed! Can't find toolchain`);
      return false;//new Promise((resolve, reject) => { reject(); });
    }
  }

  return true;

}



export async function checkToolchain(config: Config): Promise<boolean> {

  //let path = await toolchain.easyPath();
  //console.log(path);
  const homeDir = os.type() === "Windows_NT" ? os.homedir() : os.homedir();
  // const standardTmpPath = vscode.Uri.joinPath(
  //   vscode.Uri.file(homeDir),
  //   ".eec.zip");

  //   const standardPath = vscode.Uri.joinPath(
  //     vscode.Uri.file(homeDir));
  //   console.log(standardTmpPath);

  const verFile = vscode.Uri.joinPath(
    vscode.Uri.file(homeDir), ".eec", "toolchain.json");

  const toolchainFile = await isFileAtUri(verFile);

  if (!toolchainFile) {
    let buttons = ['Install', 'Not now'];
    let choice = await vscode.window.showWarningMessage(`EEmbLang Toolchain is not installed!\nDo you want Download and Install now?`, { modal: true }, ...buttons);
    if (choice === buttons[0]) {
      const toolchainInfo = await getLastToolchainInfo(config);
      let res = toolchainInfo != undefined ? await installToolchain(toolchainInfo) : false;
      if (!res) {
        vscode.window.showErrorMessage(`Error: EEmbLang Toolchain is not installed!\nCan't download file`);
      }
      else {
        IsNightlyToolchain = true;
      }
      //await new Promise(f => setTimeout(f, 3000));
      //await vscode.commands.executeCommand('eepl.command.setTargetDevice');
      return res;
    }
    return false;
  }

  // type CfgType = {
  //   ver: string;
  // }

  // function isCfgType(o: any): o is CfgType {
  //   return "ver" in o 
  // }

  const lastToolchain = await getLastToolchainInfo(config);
  if (lastToolchain == undefined) {
    return true;
  }
  // const parsed = JSON.parse(json)
  //if (isCfgType(data)) {
  //console.log(data.ver);

  const raw = fs.readFileSync(verFile.fsPath).toString();
  const currentVer = JSON.parse(raw);

  if (currentVer.ver != lastToolchain.ver) {
    IsNightlyToolchain = false;
    let buttons = ['Install', 'Not now'];
    let choice = await vscode.window.showInformationMessage(`New  EEPL Toolchain (v${lastToolchain.ver}) is available!\nDo you want Download and Install now?`, ...buttons);
    if (choice === buttons[0]) {
      const res = await installToolchain(lastToolchain);
      if (res) {
        IsNightlyToolchain = true;
      }
      return res;
    }
  }
  else {
    IsNightlyToolchain = true;
  }
  //}

  return true;

}

export async function getCurrentToolchain(): Promise<ToolchainInfo | undefined> {

  const homeDir = os.type() === "Windows_NT" ? os.homedir() : os.homedir();

  const verFile = vscode.Uri.joinPath(
    vscode.Uri.file(homeDir), ".eec", "toolchain.json");

  const toolchainFile = await isFileAtUri(verFile);

  if (!toolchainFile) {
    return undefined;
  }

  const raw = fs.readFileSync(verFile.fsPath).toString();

  const currentToolchain: ToolchainInfo = JSON.parse(raw);

  return currentToolchain;

}


export async function resoleProductPaths(config: Config): Promise<boolean> {



  let workspaceTarget: vscode.WorkspaceFolder | undefined = undefined;

  for (const workspaceTarget0 of vscode.workspace.workspaceFolders || []) {
    workspaceTarget = workspaceTarget0;
    break;
  }

  if (config.targetDevice.description == "[Device]") {
    await vscode.commands.executeCommand('eepl.command.setTargetDevice');
    if (config.targetDevice.description == "[Device]") {
      //return new Promise((resolve, reject) => { reject(); });
      return false;
    }
  }


  const devName = config.targetDevice.devName;
  const cwd = "${cwd}";


  const isOldToolchain = await checkOldToolchain();



  const outputPath = isOldToolchain ? `${workspaceTarget!.uri.fsPath}/out/${devName}/output` : `${workspaceTarget!.uri.fsPath}/out/${devName}`;



  let productName = 'output';
  let productPath = `${outputPath}`;

  if (!isOldToolchain) {

    const compilerOutputPath = `${outputPath}/.eec_cache/EECompilerOutput.json`;

    if (fs.existsSync(compilerOutputPath)) {

      const rowFile = fs.readFileSync(compilerOutputPath).toString();
      const eecOutput: EECompilerOutput = JSON.parse(rowFile);

      productName = eecOutput.productName;
      productPath = `${productPath}/${productName}`;

    } else {
      productPath = `${productPath}/output`;
    }


  }


  if (isOldToolchain) {

    config.uploadingFilePath = `${cwd}/out/${devName}/prog.alf`;
    config.exePath = `${cwd}/out/${devName}/output.elf`;
    config.productPath = `${productPath}/output`;
    config.productName = productName;

  }
  else {

    config.uploadingFilePath = `${productPath}.alf`;
    config.productPath = `${productPath}`;
    config.productName = productName;


    if (config.targetDevice.devName.indexOf("windows") != -1) {

      config.exePath = `${productPath}.exe`;


    } else {

      config.exePath = `${productPath}.elf`;
    }

  }

  return true;
}





/** Mirrors `toolchain::get_path_for_executable()` implementation */
export const getPathForExecutable = memoizeAsync(
  // We apply caching to decrease file-system interactions
  async (executableName: "eec" | "EEcompiler" | "easy" | "st-util" | "ld.lld" | "ebuild" | "eflash" | "arm-none-eabi-gdb" | "egdb_server"): Promise<string> => {
    {
      const envVar = process.env[executableName.toUpperCase()];
      if (envVar) return envVar;
    }

    if (await lookupInPath(executableName)) return executableName;

    const homeDir = os.type() === "Windows_NT" ? os.homedir() : os.homedir();
    const eecPath = vscode.Uri.joinPath(
      vscode.Uri.file(homeDir),
      ".eec",
      "bin",
      os.type() === "Windows_NT" ? `${executableName}.exe` : executableName
    );
    const armToolchainPath = vscode.Uri.joinPath(
      vscode.Uri.file(homeDir),
      ".eec",
      "arm-toolchain",
      os.type() === "Windows_NT" ? `${executableName}.exe` : executableName
    );

    try {
      if (await isFileAtUri(eecPath)) return eecPath.fsPath;
    } catch (err) {
      log.error("Failed to read the fs info", err);
      return "notFound";
    }

    try {
      if (await isFileAtUri(armToolchainPath)) return armToolchainPath.fsPath;
    } catch (err) {
      log.error("Failed to read the fs info", err);
      return "notFound";
    }

    return "notFound";

  }
);

async function lookupInPath(exec: string): Promise<boolean> {
  const paths = process.env.PATH ?? "";

  console.log(os.type());

  const candidates = paths.split(path.delimiter).flatMap((dirInPath) => {
    const candidate = path.join(dirInPath, exec);
    return os.type() === "Windows_NT" ? [candidate, `${candidate}.exe`] : [candidate];
  });

  for await (const isFile of candidates.map(isFileAtPath)) {
    if (isFile) {
      return true;
    }
  }
  return false;
}

export async function isFileAtPath(path: string): Promise<boolean> {
  return isFileAtUri(vscode.Uri.file(path));
}

export async function isFileAtUri(uri: vscode.Uri): Promise<boolean> {
  try {
    return ((await vscode.workspace.fs.stat(uri)).type & vscode.FileType.File) !== 0;
  } catch {
    return false;
  }
}

export async function isDirAtUri(uri: vscode.Uri): Promise<boolean> {
  try {
    return ((await vscode.workspace.fs.stat(uri)).type & vscode.FileType.Directory) !== 0;
  } catch {
    return false;
  }
}