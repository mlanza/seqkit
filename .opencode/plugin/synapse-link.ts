// @ts-nocheck
import { appendFileSync } from "fs";

let n = 0;

function log(directory, text, error = null) {
  const timestamp = new Date().toISOString();
  const emoji = error ? "❌" : "✅";
  const num = n++;
  const logEntry = {
    timestamp,
    emoji,
    num,
    error: error?.message,
    text: text,
  };

  appendFileSync(
    directory + "/synapse-link.jsonl",
    JSON.stringify(logEntry) + "\n",
    "utf8"
  );
}

export const SynapseLinkPlugin = async ({ client, directory }) => {
  return {
    "chat.message": async (input, output) => {
      const userTextParts = output.parts.filter((part) =>
        part.type === "text" && !part.synthetic
      );

      for (const textPart of userTextParts) {
        try {
          //log(directory, textPart.text);

          // Safe subprocess execution with proper stdio isolation
          const proc = Bun.spawn(["nt", "prompt"], {
            stdin: "pipe",
            stdout: "pipe",
            stderr: "pipe",
          });

          // Write text directly to stdin to avoid shell escaping issues
          proc.stdin.write(textPart.text);
          proc.stdin.end();

          // Buffer all output using Bun's Response API
          const stdout = await new Response(proc.stdout).text();
          const stderr = await new Response(proc.stderr).text();

          // Wait for process completion
          await proc.exited;

          // Check exit code
          if (proc.exitCode !== 0) {
            throw new Error(`Process failed with code ${proc.exitCode}: ${stderr}`);
          }

          textPart.text = stdout;
        } catch (error) {
          log(directory, textPart.text, error);
          textPart.text = `⚠️ ${textPart.text}`;
        }
      }
    },
  };
};
