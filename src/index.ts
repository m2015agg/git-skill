#!/usr/bin/env node
import { Command } from "commander";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pkg = require("../package.json");
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
import { blameCommand } from "./commands/blame.js";
import { diffSummaryCommand } from "./commands/diff-summary.js";
import { trendsCommand } from "./commands/trends.js";
import { regressionCommand } from "./commands/regression.js";
import { metricCommand } from "./commands/metric.js";
import { embedCommand } from "./commands/embed.js";
import { enrichCommand } from "./commands/enrich.js";
import { whyCommand } from "./commands/why.js";
import { releaseNotesCommand } from "./commands/release-notes.js";
import { approveCommand } from "./commands/approve.js";
import { docsCommand } from "./commands/docs.js";
import { installCommand } from "./commands/install.js";
import { cronCommand } from "./commands/cron.js";
import { updateCommand } from "./commands/update.js";
import { uninstallCommand } from "./commands/uninstall.js";
import { contextUpdateCommand } from "./commands/context-update.js";
import { addKeyCommand } from "./commands/add-key.js";
import { verifyCommand } from "./commands/verify.js";

const program = new Command();
program
  .name("git-skill")
  .description("Git history intelligence for LLMs")
  .version(pkg.version);

program.addCommand(captureCommand());
program.addCommand(initCommand());
program.addCommand(doctorCommand());
program.addCommand(searchCommand());
program.addCommand(timelineCommand());
program.addCommand(hotspotsCommand());
program.addCommand(couplingCommand());
program.addCommand(decisionsCommand());
program.addCommand(expertsCommand());
program.addCommand(blameCommand());
program.addCommand(diffSummaryCommand());
program.addCommand(trendsCommand());
program.addCommand(regressionCommand());
program.addCommand(metricCommand());
program.addCommand(embedCommand());
program.addCommand(enrichCommand());
program.addCommand(whyCommand());
program.addCommand(releaseNotesCommand());
program.addCommand(approveCommand());
program.addCommand(docsCommand());
program.addCommand(installCommand());
program.addCommand(cronCommand());
program.addCommand(updateCommand());
program.addCommand(uninstallCommand());
program.addCommand(addKeyCommand());
program.addCommand(contextUpdateCommand());
program.addCommand(verifyCommand());

program
  .command("snapshot")
  .description("Backfill all git history into SQLite")
  .option("--force", "Clear all data before backfilling")
  .action(async (opts) => {
    await snapshotCommand({ force: opts.force });
  });

program.parse();
