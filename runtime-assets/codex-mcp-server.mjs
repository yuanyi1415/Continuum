import { spawnSync } from 'node:child_process';
import {
  McpServer,
  acceptedContent,
  inputRequired,
} from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';

const cliEntry = process.argv[2];
if (!cliEntry) throw new Error('Continuum CLI entry path is required.');

function runCli(args) {
  const result = spawnSync(process.execPath, [cliEntry, ...args, '--json'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: process.env,
  });
  const stdout = (result.stdout || '').trim();
  if (!stdout) throw new Error((result.stderr || '').trim() || `Continuum CLI exited ${result.status}`);
  const parsed = JSON.parse(stdout);
  if (!parsed.ok) throw new Error(parsed.error?.message || 'Continuum CLI failed.');
  return parsed.data;
}

function schemaFor(request) {
  const options = request.options || [];
  return {
    type: 'object',
    properties: {
      choice: {
        type: 'string',
        title: request.title,
        enum: options.map(option => option.id),
        enumNames: options.map(option => option.label),
      },
    },
    required: ['choice'],
  };
}

function buildServer(reqCtx) {
  const server = new McpServer({ name: 'continuum', version: '1.1.0' });

  server.registerTool(
    'continuum_init',
    {
      description: 'Enable Continuum for the current Git project. Use only when the user explicitly asks to enable/init Continuum for this project.',
    },
    async () => {
      const data = runCli(['init']);
      return { content: [{ type: 'text', text: `Continuum enabled for ${data.name || 'current project'}.` }] };
    },
  );

  server.registerTool(
    'continuum_status',
    {
      description: 'Read deterministic Continuum project/work status for the current project.',
    },
    async () => {
      const data = runCli(['status']);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.registerTool(
    'continuum_doctor',
    {
      description: 'Run deterministic Continuum diagnostics for the current project.',
    },
    async () => {
      const data = runCli(['doctor']);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    },
  );

  server.registerTool(
    'continuum_decision',
    {
      description: 'Show the user the next pending Continuum project decision. Never choose on the user\'s behalf.',
    },
    async (ctx) => {
      const request = runCli(['host','codex','interaction','next','--type','DECISION']);
      if (!request) return { content: [{ type: 'text', text: 'No pending Continuum decision.' }] };
      const requestedSchema = schemaFor(request);

      if (reqCtx.era === 'legacy') {
        const result = await ctx.mcpReq.elicitInput({
          mode: 'form',
          message: request.message || request.reason || request.title,
          requestedSchema,
        });
        if (result.action !== 'accept' || !result.content) {
          runCli(['host','codex','interaction','resolve',request.id,'--action', result.action === 'cancel' ? 'cancel' : 'dismiss']);
          return { content: [{ type: 'text', text: `Continuum decision ${result.action}.` }] };
        }
        const choice = result.content.choice;
        runCli(['host','codex','interaction','resolve',request.id,'--option',choice]);
        return { content: [{ type: 'text', text: `Continuum decision accepted: ${choice}` }] };
      }

      const raw = ctx.mcpReq.inputResponses?.decision;
      if (!raw) {
        return inputRequired({
          inputRequests: {
            decision: inputRequired.elicit({
              message: request.message || request.reason || request.title,
              requestedSchema,
            }),
          },
        });
      }
      const form = acceptedContent(ctx.mcpReq.inputResponses, 'decision');
      if (!form) {
        runCli(['host','codex','interaction','resolve',request.id,'--action',raw.action === 'cancel' ? 'cancel' : 'dismiss']);
        return { content: [{ type: 'text', text: `Continuum decision ${raw.action || 'dismissed'}.` }] };
      }
      runCli(['host','codex','interaction','resolve',request.id,'--option',form.choice]);
      return { content: [{ type: 'text', text: `Continuum decision accepted: ${form.choice}` }] };
    },
  );

  return server;
}

void serveStdio(buildServer);
