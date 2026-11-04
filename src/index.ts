import * as core from "@actions/core";

import { readdir, readFile, writeFile } from "node:fs/promises";

// import { parseArgs } from "util";

async function runAction(GHActions: { sourceDir: string; outputPath: string }) {
  try {
    // 1. Log the start of the action
    core.info(`🚀 Starting action...`);

    // read all the files in the current directory, recursively
    let fileList = await readdir(GHActions.sourceDir, {
      recursive: true,
      withFileTypes: true,
    });

    // sort everything out that is not needed
    const blackList = [".", "node_modules", "_"];

    blackList.forEach((entry) => {
      fileList = fileList
        .filter(
          (file) =>
            !file.name
              .toLocaleLowerCase()
              .startsWith(entry.toLocaleLowerCase()),
        )
        .filter(
          (file) =>
            !file.parentPath
              .toLocaleLowerCase()
              .startsWith(
                `${GHActions.sourceDir.toLocaleLowerCase()}/${entry.toLocaleLowerCase()}`,
              ),
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
        const rootIndent =
          folderPath.split("/").length -
          GHActions.sourceDir.split("/").length;
        let folderContent: string | null = null;
        try {
          folderContent = await readFile(`${folderPath}/readme.md`, {
            encoding: "utf8",
          });
        } catch (e) {}

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
          folderString = `${`  `.repeat(rootIndent)}- [${title}](${folderPath.replace(GHActions.sourceDir, "")})`;

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
            const indent =
              filePath.split("/").length -
              GHActions.sourceDir.split("/").length;
            const content = await readFile(filePath, { encoding: "utf8" });

            let title = file.name.split(".md")[0];
            if (content.startsWith("# "))
              title = content.split("# ")[1]!.split("\n")[0];
            if (content.startsWith("---"))
              title = getFrontMatter(content, "title");
            return `${`  `.repeat(indent)}- [${title}](${filePath.replace(GHActions.sourceDir, "")})`;
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
        .map(async (sidebar) => sidebar.content),
    );

    try {
      const suffix = await readFile(
        `${GHActions.sourceDir}/_sidebar-suffix.md`,
        { encoding: "utf8" },
      );
      everything.push(suffix);
    } catch (e) {}
    await writeFile(GHActions.outputPath, everything.join("\n"));
    core.info(`✅ Action successful!`);
  } catch (error) {
    core.setFailed(`❌ Action failed during execution. Error: ${error}`);
  }
}

// --- Action Entry Point ---
// The GitHub Action runner will automatically pass arguments defined in action.yml.
try {
  // const { values, positionals } = parseArgs({
  //   args: process.argv,
  //   options: {
  //     in: {
  //       type: "string",
  //       short: "i",
  //     },
  //     out: {
  //       type: "string",
  //       short: "o",
  //     },
  //   },
  //   strict: true,
  //   allowPositionals: true,
  // });

  // if (values.in && values.out)
  //   runAction({ sourceDir: values.in, outputPath: values.out });
  // else {
    runAction({
      sourceDir: core.getInput("source_directory", { required: true }),
      outputPath: core.getInput("output_file_path", { required: true }),
    });
  // }
} catch (error) {
  console.error("Critical failure during action startup:", error);
  process.exit(1);
}
