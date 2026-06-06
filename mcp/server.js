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
  {
    capabilities: { tools: {} },
    instructions: `Clodsite builds and deploys static websites to Cloudflare Pages.

Workflow:
1. Call get_schema() — understand the build-plan.yaml structure
2. Call list_components() — browse available component types
3. Call get_schema(component_name) — get the full spec for each component you plan to use
4. Author a build-plan.yaml for your site
5. Call deploy_site(site_name, build_plan_yaml) — returns a live URL`,
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'list_components',
      description:
        'Returns a brief catalog of available component types with one-line descriptions. Use this to browse what components exist, then call get_schema(component_name) to get the full sub-schema for any type you want to use.',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'get_schema',
      description:
        'Without a component_name: returns the top-level build-plan.yaml field reference. With a component_name: returns the full sub-schema and YAML example for that component type. Workflow: call get_schema() to understand the document structure, list_components() to browse available types, then get_schema(component_name) for each type you plan to use.',
      inputSchema: {
        type: 'object',
        properties: {
          component_name: {
            type: 'string',
            description: 'Optional. Name of a component type (e.g. "prose", "gallery", "mailto-form"). Omit to get the top-level build-plan.yaml reference.',
          },
        },
        required: [],
      },
    },
    {
      name: 'deploy_site',
      description:
        'Build and deploy a site from a build-plan.yaml. Returns { url, site_name } on success or { error, step, message } on failure. Call get_schema() first if you need the build-plan.yaml field reference, and get_schema(component_name) for each component type you plan to use.',
      inputSchema: {
        type: 'object',
        properties: {
          site_name: {
            type: 'string',
            description:
              'Slug used as the directory name under SITES_DIR and as the Cloudflare Pages project name. Must match the slug field in build-plan.yaml.',
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

  if (name === 'get_schema') {
    return {
      content: [{ type: 'text', text: pipeline.getSchema(args?.component_name) }],
    };
  }

  if (name === 'list_components') {
    return {
      content: [{ type: 'text', text: pipeline.listComponents() }],
    };
  }

  if (name === 'deploy_site') {
    const { site_name, build_plan_yaml } = args ?? {};
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
