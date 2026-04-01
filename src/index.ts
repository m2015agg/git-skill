#!/usr/bin/env node
import { Command } from "commander";
import { captureCommand } from "./commands/capture.js";
import { snapshotCommand } from "./commands/snapshot.js";
import { initCommand } from "./commands/init.js";
import { doctorCommand } from "./commands/doctor.js";
import { searchCommand } from "./commands/search.js";
import { timelineCommand } from "./commands/timeline.js";
import { hotspotsCommand } from "./commands/hotspots.js";
import { couplingCommand } from "./commands/coupling.js";
import { decisionsCommand } from "./commands/decisions.js";
import { expertsCommand } from "./commands/experts.js";

const program = new Command();
program
  .name("git-skill")
  .description("Git history intelligence for LLMs")
  .version("0.1.0");

program.addCommand(captureCommand());
program.addCommand(initCommand());
program.addCommand(doctorCommand());
program.addCommand(searchCommand());
program.addCommand(timelineCommand());
program.addCommand(hotspotsCommand());
program.addCommand(couplingCommand());
program.addCommand(decisionsCommand());
program.addCommand(expertsCommand());

program
  .command("snapshot")
  .description("Backfill all git history into SQLite")
  .option("--force", "Clear all data before backfilling")
  .action(async (opts) => {
    await snapshotCommand({ force: opts.force });
  });

program.parse();
