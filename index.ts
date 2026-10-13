import { readdir } from 'node:fs/promises';

// read all the files in the current directory, recursively
let fileList = await readdir('./', { recursive: true, withFileTypes: true });

// sort everything out that is not needed
const blackList = ['.', 'node_modules', '_'];

blackList.forEach((entry) => {
  fileList = fileList
    .filter((file) => !file.name.toLocaleLowerCase().startsWith(entry))
    .filter((file) => !file.parentPath.toLocaleLowerCase().startsWith(entry));
});
fileList = fileList.filter(
  (file) => file.name.toLocaleLowerCase().endsWith('.md') || file.isDirectory()
);

function getFrontMatter(content: String, search: String) {
  const frontMatter = content.split('---')[1].split('\n');
  const option = frontMatter.find((entry) => entry.startsWith(`${search}: `));
  if (!option) return '';
  const found = option.split(`${search}: `)[1];
  return found ? found : '';
}

// iterate over dirs
const folders = fileList.filter((file) => file.isDirectory());
const out = await Promise.all(
  folders.map(async (folder) => {
    // check if there is a readme and update the title of the folder
    const folderPath = `${folder.parentPath ? `${folder.parentPath}/${folder.name}` : folder.name}`;
    const folderContentRaw = Bun.file(`${folderPath}/readme.md`);
    const rootIndent = folderPath.split('/').length - 1;
    const folderContent = folderContentRaw.size ? await folderContentRaw.text() : null;
    let title = folder.name;
    if (folderContent) {
      if (folderContent.startsWith('---')) {
        const customTitle = getFrontMatter(folderContent, 'title');
        if (customTitle !== '') title = customTitle;
      }
      const customTitle = folderContent.split('\n').find((entry) => entry.startsWith('# '));
      if (customTitle) title = customTitle.split('# ')[1].split('\n')[0];
    }
    let folderString = `${`  `.repeat(rootIndent)}- ${title}`;
    if (
      folderContent &&
      folderContent.startsWith('---') &&
      getFrontMatter(folderContent, 'showSidebar') === 'true'
    )
      folderString = `${`  `.repeat(rootIndent)}- [${title}](${folderPath})`;

    // get all files without readmes
    const subFolderList = fileList.filter(
      (file) =>
        file.isFile() &&
        file.parentPath === folderPath &&
        file.name.toLocaleLowerCase() !== 'readme.md'
    );
    // try getting Title
    const finalOut: String[] = await Promise.all(
      subFolderList.map(async (file) => {
        const filePath = `${file.parentPath ? `${file.parentPath}/` : ''}${file.name}`;
        const indent = filePath.split('/').length - 1;
        const fileContent = Bun.file(filePath);
        const content = await fileContent.text();

        let title = file.name.split('.md')[0];
        if (content.startsWith('# ')) title = content.split('# ')[1].split('\n')[0];
        if (content.startsWith('---')) title = getFrontMatter(content, 'title');
        return `${`  `.repeat(indent)}- [${title}](${filePath})`;
      })
    );
    return { folder: folderPath, content: [folderString, ...(await finalOut)].join('\n') };
  })
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
    })
);

const suffix = await Bun.file(`_sidebar-suffix.md`);
if (suffix.size) everything.push(await suffix.text());
await Bun.write(`_sidebar.md`, everything.join('\n'));
