#!/usr/bin/env node
import { Command } from "commander";
import { captureCommand } from "./commands/capture.js";
import { snapshotCommand } from "./commands/snapshot.js";
import { initCommand } from "./commands/init.js";
import { doctorCommand } from "./commands/doctor.js";

const program = new Command();
program
  .name("git-skill")
  .description("Git history intelligence for LLMs")
  .version("0.1.0");

program.addCommand(captureCommand());
program.addCommand(initCommand());
program.addCommand(doctorCommand());

program
  .command("snapshot")
  .description("Backfill all git history into SQLite")
  .option("--force", "Clear all data before backfilling")
  .action(async (opts) => {
    await snapshotCommand({ force: opts.force });
  });

program.parse();
