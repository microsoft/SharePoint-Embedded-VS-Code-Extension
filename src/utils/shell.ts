// import * as shell from 'shelljs';
// import * as path from 'path';
// import * as fs from 'fs';

// export async function cloneRepository(): Promise<string | null> {
//     try {
//         if (!shell.which('git')) {
//             shell.echo('Sorry, this script requires git');
//             shell.exit(1);
//         }
//         shell.config.execPath = shell.which('node');

//         const currentFolder = __dirname;
//         const parentDirectory = path.resolve(currentFolder, '../../');
//         const repoUrl = 'https://github.com/microsoft/syntex-repository-services.git';
//         const destinationFolder = `${parentDirectory}/src/samples/`;
//         const gitCloneCommand = `git clone ${repoUrl}`;

//         shell.cd(destinationFolder)

//         return new Promise<string | null>((resolve, reject) => {
//             shell.exec(gitCloneCommand, (code: any, stdout: any, stderr: any) => {
//                 if (code === 0) {
//                     const appDir = path.join(parentDirectory, 'src/samples/syntex-repository-services');
//                     if (fs.existsSync(appDir)) {
//                         resolve(appDir);
//                     } else {
//                         resolve(null);
//                     }
//                 } else {
//                     console.error('Git clone failed with error code:', code);
//                     console.error('Error:', stderr);
//                     reject(null);
//                 }
//             });
//         });
//     } catch (error) {
//         console.error(error);
//         return null;
//     }
// }