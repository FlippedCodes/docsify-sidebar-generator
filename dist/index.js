import * as core from "@actions/core";
import { readdir, readFile, writeFile } from "node:fs/promises";
try {
    core.info(`🚀 Starting action...`);
    // read all the files in the current directory, recursively
    let fileList = await readdir("./", {
        recursive: true,
        withFileTypes: true,
    });
    fileList = fileList.map((file) => {
        file.parentPath = file.parentPath.replaceAll('./', '');
        return file;
    });
    // sort everything out that is not needed
    const blackList = [".", "node_modules", "_"];
    blackList.forEach((entry) => {
        fileList = fileList
            .filter((file) => !file.name.toLocaleLowerCase().startsWith(entry.toLocaleLowerCase()))
            .filter((file) => {
            if (file.parentPath.startsWith("./"))
                return true;
            return !file.parentPath
                .toLocaleLowerCase()
                .startsWith(entry.toLocaleLowerCase());
        });
    });
    fileList = fileList.filter((file) => file.name.toLocaleLowerCase().endsWith(".md") || file.isDirectory());
    function getFrontMatter(content, search) {
        const frontMatter = content.split("---")[1].split("\n");
        const option = frontMatter.find((entry) => entry.startsWith(`${search}: `));
        if (!option)
            return "";
        const found = option.split(`${search}: `)[1];
        return found ? found : "";
    }
    // iterate over dirs
    const folders = fileList.filter((file) => file.isDirectory());
    const out = await Promise.all(folders.map(async (folder) => {
        // check if there is a readme and update the title of the folder
        const folderPath = `${folder.parentPath ? `${folder.parentPath}/${folder.name}` : folder.name}`;
        const rootIndent = folderPath.split("/").length - 1;
        let folderContent = undefined;
        try {
            folderContent = await readFile(`${folderPath}/readme.md`, {
                encoding: "utf8",
            });
        }
        catch (e) { }
        let title = folder.name;
        if (folderContent) {
            if (folderContent.startsWith("---")) {
                const customTitle = getFrontMatter(folderContent, "title");
                if (customTitle !== "")
                    title = customTitle;
            }
            const customTitle = folderContent
                .split("\n")
                .find((entry) => entry.startsWith("# "));
            if (customTitle)
                title = customTitle.split("# ")[1].split("\n")[0];
        }
        let folderString = `${`  `.repeat(rootIndent)}- ${title}`;
        if (folderContent &&
            folderContent.startsWith("---") &&
            getFrontMatter(folderContent, "showSidebar") === "true")
            folderString = `${`  `.repeat(rootIndent)}- [${title}](${folderPath})`;
        const subFolderList = fileList.filter((file) => file.isFile() &&
            file.parentPath === folderPath &&
            file.name.toLocaleLowerCase() !== "readme.md");
        // try getting Title
        const finalOut = await Promise.all(subFolderList.map(async (file) => {
            const filePath = `${file.parentPath ? `${file.parentPath}` : ""}/${file.name}`;
            const indent = filePath.split("/").length - 1;
            const content = await readFile(filePath, { encoding: "utf8" });
            let title = file.name.split(".md")[0];
            if (content.startsWith("# "))
                title = content.split("# ")[1].split("\n")[0];
            if (content.startsWith("---"))
                title = getFrontMatter(content, "title");
            return `${`  `.repeat(indent)}- [${title}](${filePath})`;
        }));
        return {
            folder: folderPath,
            content: [folderString, ...(await finalOut)].join("\n"),
        };
    }));
    const everything = await Promise.all(out
        .sort((a, b) => {
        if (a.folder < b.folder)
            return -1;
        if (a.folder > b.folder)
            return 1;
        return 0;
    })
        .map(async (sidebar) => sidebar.content));
    try {
        const suffix = await readFile(`./_sidebar-suffix.md`, {
            encoding: "utf8",
        });
        everything.push(suffix);
    }
    catch (e) { }
    await writeFile("./_sidebar.md", everything.join("\n"));
    core.info(`✅ Action successful!`);
}
catch (error) {
    core.setFailed(`❌ Action failed during execution. Error: ${error}`);
    process.exit(1);
}
