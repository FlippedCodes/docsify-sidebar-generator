import * as core from "@actions/core";

import { readdir, readFile, exists } from "node:fs/promises";

import { parseArgs } from "util";

async function runAction(
  GHActions: { sourceDir: string; outputPath: string },
) {
  try {
    // 1. Log the start of the action
    core.info(`🚀 Starting action...`);

    const { values, positionals } = parseArgs({
      args: process.argv,
      options: {
        in: { type: "string", short: "i", default: "./" },
        out: { type: "string", short: "o", default: "./_sidebar.md" },
      },
      strict: true,
      allowPositionals: true,
    });

    const input = GHActions.sourceDir || values.in;
    const output = GHActions.outputPath || values.out;

    // console.log(positionals);
    if (!(input && output)) core.setFailed("❌ Action failed during execution. Missing sourceDir or outputPath");
    // read all the files in the current directory, recursively
    let fileList = await readdir(input, {
      recursive: true,
      withFileTypes: true,
    });

    // sort everything out that is not needed
    const blackList = [".", "node_modules", "_"];

    blackList.forEach((entry) => {
      fileList = fileList
        .filter((file) => !file.name.toLocaleLowerCase().startsWith(entry))
        .filter(
          (file) => !file.parentPath.toLocaleLowerCase().startsWith(entry),
        );
    });
    fileList = fileList.filter(
      (file) =>
        file.name.toLocaleLowerCase().endsWith(".md") || file.isDirectory(),
    );

    function getFrontMatter(content: String, search: String) {
      const frontMatter = content.split("---")[1]!.split("\n");
      const option = frontMatter.find((entry) =>
        entry.startsWith(`${search}: `),
      );
      if (!option) return "";
      const found = option.split(`${search}: `)[1];
      return found ? found : "";
    }

    // iterate over dirs
    const folders = fileList.filter((file) => file.isDirectory());
    const out = await Promise.all(
      folders.map(async (folder) => {
        // check if there is a readme and update the title of the folder
        const folderPath = `${folder.parentPath ? `${folder.parentPath}/${folder.name}` : folder.name}`;
        const folderContentRaw = await exists(`${folderPath}/readme.md`);
        const rootIndent = folderPath.split("/").length - 1;
        const folderContent = folderContentRaw
          ? await readFile(`${folderPath}/readme.md`, { encoding: 'utf8' })
          : null;
        let title = folder.name;
        if (folderContent) {
          if (folderContent.startsWith("---")) {
            const customTitle = getFrontMatter(folderContent, "title");
            if (customTitle !== "") title = customTitle;
          }
          const customTitle = folderContent
            .split("\n")
            .find((entry) => entry.startsWith("# "));
          if (customTitle) title = customTitle.split("# ")[1]!.split("\n")[0]!;
        }
        let folderString = `${`  `.repeat(rootIndent)}- ${title}`;
        if (
          folderContent &&
          folderContent.startsWith("---") &&
          getFrontMatter(folderContent, "showSidebar") === "true"
        )
          folderString = `${`  `.repeat(rootIndent)}- [${title}](${folderPath})`;

        // get all files without readmes
        const subFolderList = fileList.filter(
          (file) =>
            file.isFile() &&
            file.parentPath === folderPath &&
            file.name.toLocaleLowerCase() !== "readme.md",
        );
        // try getting Title
        const finalOut: String[] = await Promise.all(
          subFolderList.map(async (file) => {
            const filePath = `${file.parentPath ? `${file.parentPath}/` : ""}${file.name}`;
            const indent = filePath.split("/").length - 1;
            const content = await readFile(filePath, { encoding: 'utf8' });

            let title = file.name.split(".md")[0];
            if (content.startsWith("# "))
              title = content.split("# ")[1]!.split("\n")[0];
            if (content.startsWith("---"))
              title = getFrontMatter(content, "title");
            return `${`  `.repeat(indent)}- [${title}](${filePath})`;
          }),
        );
        return {
          folder: folderPath,
          content: [folderString, ...(await finalOut)].join("\n"),
        };
      }),
    );

    const everything = await Promise.all(
      out
        .sort((a, b) => {
          if (a.folder < b.folder) return -1;
          if (a.folder > b.folder) return 1;
          return 0;
        })
        .map(async (sidebar) => {
          // await Bun.write(`${sidebar.folder}/_sidebar.md`, sidebar.content);
          return sidebar.content;
        }),
    );

    const suffix = await exists(`${input}/_sidebar-suffix.md`);
    if (suffix) everything.push(await readFile(`${input}/_sidebar-suffix.md`, { encoding: 'utf8' }));
    await Bun.write(output, everything.join("\n"));
    core.info(`✅ Action successful!"`);
  } catch (error) {
    core.setFailed(`❌ Action failed during execution. Error: ${error}`);
  }
}

// --- Action Entry Point ---
// The GitHub Action runner will automatically pass arguments defined in action.yml.
try {
  const sourceDir = core.getInput("source_directory", { required: true });
  const outputPath = core.getInput("output_file_path", { required: true });

  runAction({ sourceDir, outputPath });
} catch (error) {
  console.error("Critical failure during action startup:", error);
  process.exit(1);
}
