'use strict';

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');
const pipeline = require('./pipeline.js');

const server = new Server(
  { name: 'clodsite', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'list_components',
      description:
        'Returns the Clodsite component catalog. Read this before authoring a build-plan.yaml to know which component types exist.',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'deploy_site',
      description:
        'Build and deploy a site from a build-plan.yaml. Returns { url, site_name } on success or { error, step, message } on failure.',
      inputSchema: {
        type: 'object',
        properties: {
          site_name: {
            type: 'string',
            description:
              'Slug used as the directory name under sites/ and as the Cloudflare Pages project name. Must match the slug field in build-plan.yaml.',
          },
          build_plan_yaml: {
            type: 'string',
            description: 'Full contents of build-plan.yaml.',
          },
        },
        required: ['site_name', 'build_plan_yaml'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'list_components') {
    return {
      content: [{ type: 'text', text: pipeline.listComponents() }],
    };
  }

  if (name === 'deploy_site') {
    const { site_name, build_plan_yaml } = args;
    const result = await pipeline.deploySite(site_name, build_plan_yaml);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      isError: result.error === true,
    };
  }

  throw new Error(`Unknown tool: ${name}`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`Fatal: ${err.message}\n`);
    process.exit(1);
  });
}

module.exports = { server };
