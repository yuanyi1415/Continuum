import type { GitPort } from "../../ports/git.js";
import type { DurableMaintenancePort, DurableMigrationResult, RuntimeMigrationResult } from "../../ports/maintenance.js";
import type { RuntimeStorePort } from "../../ports/runtime-store.js";
import { ContinuumError } from "../../shared/errors/continuum-error.js";

export interface MigrateProjectResult {
  durable: DurableMigrationResult;
  runtime: RuntimeMigrationResult;
}

export class MigrateProject {
  constructor(
    private readonly git: GitPort,
    private readonly durableFactory: (root: string) => DurableMaintenancePort,
    private readonly runtimeFactory: (root: string) => RuntimeStorePort,
  ) {}

  async execute(cwd: string): Promise<MigrateProjectResult> {
    const facts = await this.git.inspect(cwd);
    const durablePort = this.durableFactory(facts.root);
    const runtimePort = this.runtimeFactory(facts.root);
    const durableInspection = await durablePort.inspect();
    if (durableInspection.hasTooNewSchema) throw new ContinuumError("CONTINUUM_SCHEMA_TOO_NEW", "Durable state is newer than this CLI; migration refused.", false);
    if (durableInspection.hasInvalidSchema) throw new ContinuumError("CONTINUUM_SCHEMA_INVALID", "Durable state is invalid; migration refused until the source files are repaired.", false);
    const runtimeHealth = await runtimePort.health();
    if (runtimeHealth.state === "too-new") throw new ContinuumError("CONTINUUM_SCHEMA_TOO_NEW", runtimeHealth.error ?? "Runtime schema is newer than this CLI.", false);
    if (runtimeHealth.state === "corrupt") throw new ContinuumError("CONTINUUM_RUNTIME_CORRUPT", "runtime.db is corrupt; use continuum doctor --recover so the corrupt file is quarantined before rebuild.", true);
    if (runtimeHealth.state === "unavailable") throw new ContinuumError("CONTINUUM_RUNTIME_DRIVER_MISSING", runtimeHealth.error ?? "Runtime driver is unavailable.", true);
    // Runtime is local/ephemeral, so advance it before touching Git-tracked Durable files.
    const runtime = await runtimePort.migrate();
    const durable = await durablePort.migrate();
    return { durable, runtime };
  }
}
