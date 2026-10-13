import * as core from "@actions/core";
import { exec } from "child_process";

async function runAction() {
  try {
    // 1. Get the required inputs
    const sourceDir = core.getInput("source_directory", { required: true });
    const outputPath = core.getInput("output_file_path", { required: true });

    core.info(`Starting action. Source: ${sourceDir}, Output: ${outputPath}`);

    // 2. Construct the command
    // We pass the inputs as arguments to your index.ts script
    const command = `bun run index.ts -i "${sourceDir}" -o "${outputPath}"`;

    core.info(`Executing command: ${command}`);

    // 3. Execute the command and capture output/errors
    await new Promise<void>((resolve, reject) => {
      exec(command, { cwd: process.cwd() }, (error, stdout, stderr) => {
        // Use cwd to ensure paths are correct
        if (error) {
          core.setFailed(`Script failed during processing: ${error.message}`);
          // Log the error details from the script
          core.error(`Script Error Details:\n${stderr}`);
          return;
        }

        // Log successful processing output
        core.info(`Script finished successfully. Output:\n${stdout}`);
        resolve();
      });
    });

    // 4. Set an output if you need the workflow to know the result
    core.setOutput("output_path", outputPath);
    core.setOutput("status", "processed");
  } catch (error) {
    core.setFailed(`An unexpected error occurred: ${error}`);
  }
}

runAction();
