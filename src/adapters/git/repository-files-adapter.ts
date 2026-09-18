import type { RepositoryFilesPort } from "../../ports/repository-files.js";
import { ensureContinuumLocalIgnored } from "./gitignore.js";
export class RepositoryFilesAdapter implements RepositoryFilesPort { async ensureContinuumLocalIgnored(root:string):Promise<void>{ ensureContinuumLocalIgnored(root); } }
