// @ts-nocheck
// TypeScript compatibility header - allows JS syntax in .ts file
import type { Plugin } from "@opencode-ai/plugin";
import { appendFileSync } from "fs";

export const EmojiPlugin: Plugin = async ({ client, directory }) => {
  return {
    "chat.message": async (input, output) => {
      // Log input and output objects with timestamps
      const timestamp = new Date().toISOString();
      const logEntry = {
        timestamp,
        input,
        output: JSON.parse(JSON.stringify(output)), // Deep clone to capture state before modification
      };
      
      // Write to emoji.log in append-only mode
      appendFileSync(
        directory + "/emoji.log",
        JSON.stringify(logEntry, null, 2) + "\n---\n",
        "utf8"
      );

      // Modify the user's text parts directly
      const userTextParts = output.parts.filter((part: any) =>
        part.type === "text" && !part.synthetic
      );

      for (const part of userTextParts) {
        const textPart = part as any;
        if (textPart.text && !textPart.text.startsWith("😊 ")) {
          textPart.text = `😊 ${textPart.text}`;
        }
      }

      // Log the modified output
      const modifiedLogEntry = {
        timestamp,
        type: "MODIFIED_OUTPUT",
        output: JSON.parse(JSON.stringify(output)), // Deep clone to capture state after modification
      };
      
      appendFileSync(
        directory + "/emoji.log",
        JSON.stringify(modifiedLogEntry, null, 2) + "\n---\n",
        "utf8"
      );
    },
  };
};
