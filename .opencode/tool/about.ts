#!/usr/bin/env node
import { tool } from "@opencode-ai/plugin";
import { spawn } from "node:child_process";

export default tool({
  description: "Lookup informative and instructive content about topics",

  args: {
    topic: tool.schema
      .string()
      .describe("Topic to fetch")
  },
  async execute(args) {
    return new Promise((resolve) => {
      const child = spawn("about", [args.topic], {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      child.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      child.on("close", (code) => {
        if (stderr) {
          resolve(JSON.stringify({
            topic: args.topic,
            success: false,
            error: stderr.trim(),
            output: stdout.trim()
          }));
        } else {
          resolve(JSON.stringify({
            topic: args.topic,
            success: true,
            output: stdout.trim()
          }));
        }
      });

      child.on("error", (error) => {
        resolve(JSON.stringify({
          topic: args.topic,
          success: false,
          error: error.message,
          exitCode: error.code
        }));
      });
    });
  },
});
